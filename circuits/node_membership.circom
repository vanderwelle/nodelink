pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "./merkle_tree.circom";

// NodeLink — anonymous proof of membership in a consensus-node tier tree.
//
// Public signal order produced by snarkjs (outputs first, then public inputs
// in declaration order):
//   [0] nullifierHash  [1] publicTier  [2] root  [3] hotWalletHi  [4] hotWalletLo
//
// Design notes (see README "Design notes & trust assumptions"):
//  * An Algorand address is a 32-byte ed25519 public key (256 bits) which does NOT
//    fit into the ~254-bit BN254 scalar field. Instead of silently reducing mod p
//    (non-injective), the key is split into two 128-bit limbs:
//        hotWalletHi = pubkey[0..16)  hotWalletLo = pubkey[16..32)   (big-endian)
//    Both limbs are range-checked to 128 bits, so (hi, lo) <-> pubkey is a bijection.
//    The contract re-assembles hi||lo and compares it with Txn.Sender.
//  * Front-running resistance: hotWalletHi/Lo are public inputs constrained inside
//    the circuit, so a proof is only valid for the exact hot wallet it was made for.
//  * nullifierHash = Poseidon(nullifier) — deliberately NOT bound to the hot wallet.
//    Binding the nullifier hash to the hot wallet (as in the original spec) would let
//    the same leaf be claimed once PER hot wallet (unlimited sybil claims per deposit).
//    Hot-wallet binding is already enforced via the public inputs above.
template NodeMembership(levels) {
    // ---- private inputs ----
    signal input secret;
    signal input nullifier;
    signal input tier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // ---- public inputs ----
    signal input root;
    signal input hotWalletHi;
    signal input hotWalletLo;

    // ---- public outputs ----
    signal output nullifierHash;
    signal output publicTier;

    // tier ∈ {1,2,3,4,5}  (Scout, Guardian, Pillar, Sovereign, Millionaire)
    signal t12 <== (tier - 1) * (tier - 2);
    signal t123 <== t12 * (tier - 3);
    signal t1234 <== t123 * (tier - 4);
    t1234 * (tier - 5) === 0;

    // 128-bit range checks make the address limb encoding injective.
    component hiBits = Num2Bits(128);
    hiBits.in <== hotWalletHi;
    component loBits = Num2Bits(128);
    loBits.in <== hotWalletLo;

    // leaf = Poseidon(secret, nullifier, tier)
    component leafHasher = Poseidon(3);
    leafHasher.inputs[0] <== secret;
    leafHasher.inputs[1] <== nullifier;
    leafHasher.inputs[2] <== tier;

    component tree = MerkleTreeChecker(levels);
    tree.leaf <== leafHasher.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // nullifierHash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;

    publicTier <== tier;
}

component main {public [root, hotWalletHi, hotWalletLo]} = NodeMembership(20);
