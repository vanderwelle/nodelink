"""NodeLink protocol — zero-knowledge consensus-node tier attestation on Algorand.

Cold wallet (online consensus node)            Hot wallet (daily driver)
-----------------------------------            -------------------------
deposit_commitment(leaf, tier) ──► LeafDeposited event ──► off-chain indexer
                                                          builds per-tier Poseidon tree
                                   root updater ──► post_root(root, tier, leaf_count)
                                                          │
                       claim_status(groth16 proof) ◄──────┘  (verified with BN254 opcodes)
                       → hot_status_{hot} = {tier, expiry_round}

Privacy: the claim reveals only (nullifierHash, tier, root, hot address); it never
reveals which leaf / cold wallet it belongs to. See README "Design notes & trust
assumptions" for the full list of trust assumptions and caveats.

Security invariants:
  * The hot wallet NEVER gains any authority over the cold wallet: this contract
    never rekeys, never issues logicsig delegations, and rejects any transaction in
    its groups that tries to rekey or close an account.
  * The contract is immutable (no update / delete handlers).
"""

import typing

from algopy import (
    Account,
    ARC4Contract,
    BigUInt,
    Box,
    BoxMap,
    Bytes,
    Global,
    GlobalState,
    OpUpFeeSource,
    Txn,
    UInt64,
    arc4,
    ensure_budget,
    gtxn,
    itxn,
    op,
    subroutine,
    urange,
)

from .verifier_key import (
    vk_alpha_g1,
    vk_beta_g2,
    vk_delta_g2,
    vk_gamma_g2,
    vk_ic0_g1,
    vk_ic_rest_g1,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# BN254 scalar field order r — every public signal must be a canonical element (< r),
# otherwise `s` and `s + r` would verify identically and a nullifier could be reused.
BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617
# BN254 base field modulus p — used to negate proof point A.
BN254_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583

MICROALGOS_PER_ALGO = 1_000_000
TIER_SCOUT_MIN = 1 * MICROALGOS_PER_ALGO
TIER_GUARDIAN_MIN = 30_000 * MICROALGOS_PER_ALGO
TIER_PILLAR_MIN = 100_000 * MICROALGOS_PER_ALGO
TIER_SOVEREIGN_MIN = 500_000 * MICROALGOS_PER_ALGO
TIER_MILLIONAIRE_MIN = 1_000_000 * MICROALGOS_PER_ALGO

ROOT_HISTORY_SIZE = 32
ROOT_SLOT_SIZE = 48  # root(32) || tier(8) || leaf_count(8)
VALID_ROOTS_SIZE = ROOT_HISTORY_SIZE * ROOT_SLOT_SIZE  # 1536
LEAF_COUNTS_SIZE = 5 * 8

PROOF_SIZE = 256  # A(64) || B(128) || C(64)
NUM_PUBLIC_SIGNALS = 5
PUBLIC_INPUTS_SIZE = NUM_PUBLIC_SIGNALS * 32
# ec_pairing_check BN254g1 costs 8000 + 7400 per 64 bytes of B (the G2 list): 4 pairs x 128 B
# = 8000 + 8*7400 = 67_200; + 5-scalar MSM (3600 + 5*90) + ec_add + misc.
GROTH16_BUDGET = 73_000

# Box MBR = 2500 + 400 * (len(key) + len(value))
LEAF_BOX_MBR = 2_500 + 400 * (5 + 32 + 16)
NULLIFIER_BOX_MBR = 2_500 + 400 * (10 + 32 + 8)
HOT_STATUS_BOX_MBR = 2_500 + 400 * (11 + 32 + 9)
PUBLIC_PROFILE_BOX_MBR = 2_500 + 400 * (15 + 32 + 32)
VALID_ROOTS_BOX_MBR = 2_500 + 400 * (11 + VALID_ROOTS_SIZE)
LEAF_COUNTS_BOX_MBR = 2_500 + 400 * (11 + LEAF_COUNTS_SIZE)

# Mainnet genesis hash — the testnet-only online-check bypass can never be enabled here.
MAINNET_GENESIS_HASH_B64 = "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8="


# ---------------------------------------------------------------------------
# ABI types & ARC-28 events
# ---------------------------------------------------------------------------
Bytes32: typing.TypeAlias = arc4.StaticArray[arc4.Byte, typing.Literal[32]]


class HotStatus(arc4.Struct, frozen=True):
    tier: arc4.UInt8
    expiry_round: arc4.UInt64


class LeafInfo(arc4.Struct, frozen=True):
    tier: arc4.UInt64
    leaf_index: arc4.UInt64


class LeafDeposited(arc4.Struct):
    """ARC-28 event consumed by the off-chain Merkle indexer."""

    commitment: Bytes32
    tier: arc4.UInt64
    leaf_index: arc4.UInt64


class RootPosted(arc4.Struct):
    root: Bytes32
    tier: arc4.UInt64
    leaf_count: arc4.UInt64
    slot: arc4.UInt64


class StatusClaimed(arc4.Struct):
    tier: arc4.UInt64
    expiry_round: arc4.UInt64


class ProfileRevealed(arc4.Struct):
    hot: arc4.Address
    cold: arc4.Address


class ProfileHidden(arc4.Struct):
    hot: arc4.Address


class StatusView(arc4.Struct, frozen=True):
    tier: arc4.UInt64
    expiry_round: arc4.UInt64
    active: arc4.Bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
@subroutine
def tier_threshold(tier: UInt64) -> UInt64:
    if tier == 1:
        return UInt64(TIER_SCOUT_MIN)
    if tier == 2:
        return UInt64(TIER_GUARDIAN_MIN)
    if tier == 3:
        return UInt64(TIER_PILLAR_MIN)
    if tier == 4:
        return UInt64(TIER_SOVEREIGN_MIN)
    assert tier == 5, "invalid tier"
    return UInt64(TIER_MILLIONAIRE_MIN)


@subroutine
def assert_valid_tier(tier: UInt64) -> None:
    assert tier >= 1 and tier <= 5, "tier must be 1..5"


@subroutine
def assert_field_element(value: Bytes) -> None:
    assert value.length == 32, "field element must be 32 bytes"
    assert BigUInt.from_bytes(value) < BigUInt(BN254_R), "non-canonical field element"


@subroutine
def assert_no_authority_change_current() -> None:
    # Zero execution authority: never allow this app call to rekey/close the sender.
    assert Txn.rekey_to == Global.zero_address, "rekey not allowed"


@subroutine
def assert_mbr_payment(payment: gtxn.PaymentTransaction, minimum: UInt64) -> None:
    assert payment.receiver == Global.current_application_address, "MBR must be paid to the app"
    assert payment.amount >= minimum, "insufficient MBR payment"
    assert payment.rekey_to == Global.zero_address, "rekey not allowed"
    assert payment.close_remainder_to == Global.zero_address, "close not allowed"


@subroutine
def negate_g1(point: Bytes) -> Bytes:
    """-(x, y) = (x, p - y); the point at infinity (0, 0) is its own negation."""
    x = op.extract(point, 0, 32)
    y = BigUInt.from_bytes(op.extract(point, 32, 32))
    if y == 0:
        return point
    neg_y = BigUInt(BN254_P) - y
    return x + (op.bzero(32) | neg_y.bytes)


@subroutine
def verify_groth16(proof: Bytes, public_inputs: Bytes) -> bool:
    """Groth16 verification over BN254 using native AVM opcodes.

    Checks  e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
    where   vk_x = IC0 + Σ s_i · IC_i.
    """
    a = op.extract(proof, 0, 64)
    b = op.extract(proof, 64, 128)
    c = op.extract(proof, 192, 64)

    vk_x = op.EllipticCurve.scalar_mul_multi(op.EC.BN254g1, vk_ic_rest_g1(), public_inputs)
    vk_x = op.EllipticCurve.add(op.EC.BN254g1, vk_ic0_g1(), vk_x)

    g1_points = negate_g1(a) + vk_alpha_g1() + vk_x + c
    g2_points = b + vk_beta_g2() + vk_gamma_g2() + vk_delta_g2()
    return op.EllipticCurve.pairing_check(op.EC.BN254g1, g1_points, g2_points)


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------
class NodeLinkProtocol(ARC4Contract):
    def __init__(self) -> None:
        self.admin = GlobalState(Account, key="admin")
        self.root_updater = GlobalState(Account, key="root_updater")
        self.status_ttl_rounds = GlobalState(UInt64, key="status_ttl_rounds")
        self.testnet_skip_online_check = GlobalState(bool, key="testnet_skip_online_check")
        self.bootstrapped = GlobalState(bool, key="bootstrapped")
        self.root_cursor = GlobalState(UInt64, key="root_cursor")
        self.total_claims = GlobalState(UInt64, key="total_claims")

        self.valid_roots = Box(Bytes, key=b"valid_roots")
        self.leaf_counts = Box(Bytes, key=b"leaf_counts")
        self.leaves = BoxMap(Bytes, LeafInfo, key_prefix=b"leaf_")
        self.nullifiers = BoxMap(Bytes, UInt64, key_prefix=b"nullifier_")
        self.hot_status = BoxMap(Account, HotStatus, key_prefix=b"hot_status_")
        self.public_profile = BoxMap(Account, arc4.Address, key_prefix=b"public_profile_")

    # ------------------------------------------------------------------ admin
    @arc4.abimethod(create="require")
    def create(
        self,
        root_updater: Account,
        status_ttl_rounds: UInt64,
        testnet_skip_online_check: bool,
    ) -> None:
        """Deploy. `testnet_skip_online_check` is a TESTNET-ONLY flag (immutable after
        creation) that skips the online-consensus-participant check so the flow can be
        tested without running a participation node. It is rejected on MainNet."""
        assert status_ttl_rounds > 0, "ttl must be > 0"
        if testnet_skip_online_check:
            assert Global.genesis_hash != Bytes.from_base64(
                MAINNET_GENESIS_HASH_B64
            ), "online-check bypass is forbidden on MainNet"
        self.admin.value = Txn.sender
        self.root_updater.value = root_updater
        self.status_ttl_rounds.value = status_ttl_rounds
        self.testnet_skip_online_check.value = testnet_skip_online_check
        self.bootstrapped.value = False
        self.root_cursor.value = UInt64(0)
        self.total_claims.value = UInt64(0)

    @arc4.abimethod
    def bootstrap(self, mbr_payment: gtxn.PaymentTransaction) -> None:
        """Create the root ring buffer and per-tier leaf counters (admin only)."""
        assert Txn.sender == self.admin.value, "admin only"
        assert not self.bootstrapped.value, "already bootstrapped"
        assert_no_authority_change_current()
        assert_mbr_payment(
            mbr_payment,
            Global.min_balance + UInt64(VALID_ROOTS_BOX_MBR + LEAF_COUNTS_BOX_MBR),
        )
        assert self.valid_roots.create(size=VALID_ROOTS_SIZE)
        assert self.leaf_counts.create(size=LEAF_COUNTS_SIZE)
        self.bootstrapped.value = True

    @arc4.abimethod
    def set_root_updater(self, new_root_updater: Account) -> None:
        """Rotate the root-updater role (admin only)."""
        assert Txn.sender == self.admin.value, "admin only"
        assert_no_authority_change_current()
        self.root_updater.value = new_root_updater

    @arc4.abimethod
    def set_admin(self, new_admin: Account) -> None:
        assert Txn.sender == self.admin.value, "admin only"
        assert_no_authority_change_current()
        self.admin.value = new_admin

    @arc4.abimethod
    def post_root(self, root: Bytes, tier: UInt64, leaf_count: UInt64) -> UInt64:
        """Root updater posts the root of tier `tier`'s tree over its first
        `leaf_count` leaves (rebuilt off-chain from LeafDeposited events)."""
        assert Txn.sender == self.root_updater.value, "root updater only"
        assert_no_authority_change_current()
        assert_field_element(root)
        assert_valid_tier(tier)
        assert leaf_count > 0, "empty tree"
        assert leaf_count <= self._leaf_count(tier), "leaf_count exceeds deposits"

        slot = self.root_cursor.value % ROOT_HISTORY_SIZE
        self.valid_roots.replace(slot * ROOT_SLOT_SIZE, root + op.itob(tier) + op.itob(leaf_count))
        self.root_cursor.value += 1
        arc4.emit(
            RootPosted(
                Bytes32.from_bytes(root),
                arc4.UInt64(tier),
                arc4.UInt64(leaf_count),
                arc4.UInt64(slot),
            )
        )
        return slot

    # --------------------------------------------------------------- deposit
    @arc4.abimethod
    def deposit_commitment(
        self,
        commitment: Bytes,
        declared_tier: UInt64,
        mbr_payment: gtxn.PaymentTransaction,
    ) -> UInt64:
        """Cold wallet (online consensus node) deposits an opaque leaf
        Poseidon(secret, nullifier, tier) into the `declared_tier` tree.
        Returns the leaf index inside that tier's tree."""
        assert self.bootstrapped.value, "not bootstrapped"
        assert_no_authority_change_current()
        assert_field_element(commitment)
        assert_valid_tier(declared_tier)
        assert_mbr_payment(mbr_payment, UInt64(LEAF_BOX_MBR))
        assert commitment not in self.leaves, "commitment already deposited"

        sender = Txn.sender
        threshold = tier_threshold(declared_tier)
        # Current spendable view: balance after this group's MBR payment is debited,
        # so add it back (the MBR is a refundable deposit, not a loss of stake).
        current = sender.balance + mbr_payment.amount if mbr_payment.sender == sender else sender.balance
        if self.testnet_skip_online_check.value:
            effective = current
        else:
            # Online stake as of the balance round (320 rounds ago). Using it resists
            # flash-borrowed balances and proves the account is participating.
            online_stake, is_online = op.VoterParamsGet.voter_balance(sender)
            assert is_online, "sender is not an online consensus participant"
            effective = online_stake if online_stake < current else current
        assert effective >= threshold, "balance below declared tier threshold"

        leaf_index = self._leaf_count(declared_tier)
        self.leaf_counts.replace((declared_tier - 1) * 8, op.itob(leaf_index + 1))
        self.leaves[commitment] = LeafInfo(arc4.UInt64(declared_tier), arc4.UInt64(leaf_index))
        arc4.emit(
            LeafDeposited(
                Bytes32.from_bytes(commitment),
                arc4.UInt64(declared_tier),
                arc4.UInt64(leaf_index),
            )
        )
        return leaf_index

    # ----------------------------------------------------------------- claim
    @arc4.abimethod
    def claim_status(
        self,
        proof: Bytes,
        public_inputs: Bytes,
        mbr_payment: gtxn.PaymentTransaction,
    ) -> HotStatus:
        """Hot wallet claims a tier status with a Groth16 proof of membership.

        public_inputs = nullifierHash || publicTier || root || hotWalletHi || hotWalletLo
        (5 x 32-byte big-endian BN254 scalars, snarkjs order)."""
        assert self.bootstrapped.value, "not bootstrapped"
        assert_no_authority_change_current()
        # Groth16 needs ~72k opcode budget -> inner OpUp app calls, paid from the outer
        # transaction's fee (GroupCredit). Done first so that every check below
        # (incl. the 32-slot root scan) fails with its own message, not a budget error.
        ensure_budget(GROTH16_BUDGET, OpUpFeeSource.GroupCredit)
        assert proof.length == PROOF_SIZE, "proof must be 256 bytes"
        assert public_inputs.length == PUBLIC_INPUTS_SIZE, "public inputs must be 160 bytes"

        nullifier_hash = op.extract(public_inputs, 0, 32)
        tier_word = op.extract(public_inputs, 32, 32)
        root = op.extract(public_inputs, 64, 32)
        hot_hi = op.extract(public_inputs, 96, 32)
        hot_lo = op.extract(public_inputs, 128, 32)
        for i in urange(NUM_PUBLIC_SIGNALS):
            assert_field_element(op.extract(public_inputs, i * 32, 32))

        # 1) Front-running resistance: proof is bound to the hot wallet = Txn.Sender.
        #    hi/lo are 128-bit limbs (upper 16 bytes of each word must be zero), so
        #    hi||lo reconstructs the 32-byte public key injectively.
        assert op.extract(hot_hi, 0, 16) == op.bzero(16), "hotWalletHi exceeds 128 bits"
        assert op.extract(hot_lo, 0, 16) == op.bzero(16), "hotWalletLo exceeds 128 bits"
        assert op.extract(hot_hi, 16, 16) + op.extract(hot_lo, 16, 16) == Txn.sender.bytes, (
            "proof is bound to a different hot wallet"
        )

        # 2) Tier is a small integer 1..5.
        assert op.extract(tier_word, 0, 24) == op.bzero(24), "tier out of range"
        tier = op.btoi(op.extract(tier_word, 24, 8))
        assert_valid_tier(tier)

        # 3) Root must be a recently posted root OF THE SAME TIER tree.
        assert self._is_known_root(root, tier), "unknown root for this tier"

        # 4) Replay protection.
        assert nullifier_hash not in self.nullifiers, "nullifier already used"

        # 5) MBR for the new boxes.
        required_mbr = UInt64(NULLIFIER_BOX_MBR)
        if Txn.sender not in self.hot_status:
            required_mbr += HOT_STATUS_BOX_MBR
        assert_mbr_payment(mbr_payment, required_mbr)

        # 6) Groth16 verification.
        assert verify_groth16(proof, public_inputs), "invalid proof"

        # Effects
        self.nullifiers[nullifier_hash] = Global.round
        expiry = Global.round + self.status_ttl_rounds.value
        status = HotStatus(arc4.UInt8(tier), arc4.UInt64(expiry))
        self.hot_status[Txn.sender] = status
        self.total_claims.value += 1
        arc4.emit(StatusClaimed(arc4.UInt64(tier), arc4.UInt64(expiry)))
        return status

    # ----------------------------------------------------- public profile opt-in
    @arc4.abimethod
    def reveal_public_profile(
        self,
        cold_address: Account,
        mbr_payment: gtxn.PaymentTransaction,
    ) -> None:
        """OPT-IN public link hot -> cold (for leaderboards / public profiles).

        The MBR payment must be signed by `cold_address` itself, proving the caller
        controls that cold wallet (otherwise anyone could claim a whale's address).
        This only *publishes* a link; it grants no authority over either account."""
        assert_no_authority_change_current()
        assert cold_address != Txn.sender, "cold and hot must differ"
        assert mbr_payment.sender == cold_address, "cold wallet must co-sign (pay MBR)"
        assert_mbr_payment(mbr_payment, UInt64(PUBLIC_PROFILE_BOX_MBR))
        status, exists = self.hot_status.maybe(Txn.sender)
        assert exists, "no NodeLink status"
        assert status.expiry_round.native > Global.round, "status expired"
        assert Txn.sender not in self.public_profile, "profile already public"
        self.public_profile[Txn.sender] = arc4.Address(cold_address)
        arc4.emit(ProfileRevealed(arc4.Address(Txn.sender), arc4.Address(cold_address)))

    @arc4.abimethod
    def hide_public_profile(self) -> None:
        """Remove the public link; the box MBR is refunded to the cold wallet that paid it.
        (Historical transactions remain visible on-chain forever.)"""
        assert_no_authority_change_current()
        cold, exists = self.public_profile.maybe(Txn.sender)
        assert exists, "profile is not public"
        del self.public_profile[Txn.sender]
        itxn.Payment(
            receiver=cold.native,
            amount=PUBLIC_PROFILE_BOX_MBR,
            fee=0,
        ).submit()
        arc4.emit(ProfileHidden(arc4.Address(Txn.sender)))

    # ------------------------------------------------------------- read-only
    @arc4.abimethod(readonly=True)
    def get_status(self, hot: Account) -> StatusView:
        status, exists = self.hot_status.maybe(hot)
        if not exists:
            return StatusView(arc4.UInt64(0), arc4.UInt64(0), arc4.Bool(False))
        return StatusView(
            arc4.UInt64(status.tier.native),
            status.expiry_round,
            arc4.Bool(status.expiry_round.native > Global.round),
        )

    @arc4.abimethod(readonly=True)
    def is_known_root(self, root: Bytes, tier: UInt64) -> bool:
        return self._is_known_root(root, tier)

    @arc4.abimethod(readonly=True)
    def leaf_count(self, tier: UInt64) -> UInt64:
        assert_valid_tier(tier)
        return self._leaf_count(tier)

    # ------------------------------------------------------------- internals
    @subroutine
    def _leaf_count(self, tier: UInt64) -> UInt64:
        return op.btoi(self.leaf_counts.extract((tier - 1) * 8, 8))

    @subroutine
    def _is_known_root(self, root: Bytes, tier: UInt64) -> bool:
        if root.length != 32:
            return False
        for i in urange(ROOT_HISTORY_SIZE):
            slot = self.valid_roots.extract(i * ROOT_SLOT_SIZE, ROOT_SLOT_SIZE)
            if op.extract(slot, 0, 32) == root and op.extract_uint64(slot, 32) == tier:
                return True
        return False
