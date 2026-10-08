# NodeLink

Zero-knowledge identity dApp, onboarding guide and HUD for **Algorand consensus node runners**.
A cold (node) wallet deposits an opaque commitment; a daily hot wallet later proves — with an
in-browser Groth16 proof verified **on-chain with the AVM's native BN254 opcodes** — that it belongs
to a node-runner tier, without revealing which cold wallet it is linked to.

> **Status: TestNet preview.** Dev-only trusted setup. Never deploy this build to MainNet.
> All scripts refuse to talk to a MainNet node (genesis check), the frontend has no MainNet network
> configured, and the contract rejects the testing bypass flag on MainNet's genesis hash.

```
cold wallet ── deposit_commitment(leaf, tier) ──► LeafDeposited (ARC-28) ──► off-chain indexer
                                                                                │ rebuilds per-tier
                                                                                ▼ Poseidon trees
                                                       root updater ──► post_root(root, tier, n)
hot wallet ── [MBR pay, claim_status(proof, signals)] ──► Groth16 verify (ec_pairing_check)
                                                     └──► hot_status_{hot} = {tier, expiry_round}
```

## Repository layout

| Path | What |
| --- | --- |
| `circuits/node_membership.circom`, `merkle_tree.circom` | Circom 2.1 circuit (20-level Poseidon tree, 5 594 constraints) |
| `circuits/scripts/build.sh` | Compile + **dev-only** Powers of Tau / Groth16 setup, exports wasm/zkey/vk, regenerates the contract VK |
| `circuits/test/prove_and_verify.ts` | Witness + proof + snarkjs verification, tamper tests |
| `contracts/nodelink_protocol.py` | Algorand Python (algopy) contract, AVM 11 (Groth16 verifier, ring buffer, nullifiers, statuses) |
| `contracts/verifier_key.py` | Verification key baked into the contract (generated) |
| `contracts/artifacts/` | TEAL, bytecode, ARC-56 spec; `contracts/clients/` Python client |
| `shared/` | `@nodelink/shared`: Poseidon Merkle tree, field/address encoding, proof encoding, encrypted backup, chain readers/indexer, generated TS client |
| `scripts/` | `deploy.ts`, `root-updater.ts` (indexer + root poster), `e2e-testnet.ts`, LocalNet contract tests, headless-browser E2E |
| `frontend/` | Next.js 16 App Router + Tailwind 4 + Lucide + `@txnlab/use-wallet-react` + snarkjs |
| `frontend/public/zk/` | `node_membership.wasm` + `node_membership_final.zkey` (lazy-loaded with progress bars) |
| `docs/screenshots/` | Screenshots captured by the browser E2E run |

Frontend routes: `/` (landing, live network stats), `/dashboard` (private HUD), `/link` (2-step wizard),
`/start-node` (node guide), `/leaderboard` (opt-in public profiles). API routes: `/api/merkle-path`,
`/api/stats`, `/api/leaderboard`.

## Quick start

Prereqs: Node 22+, Python 3.12+, `circom` 2.1.x on PATH, Docker (for LocalNet).

```bash
npm install
python -m venv .venv && .venv/bin/pip install algokit puyapy algokit-client-generator
export PATH="$PWD/.venv/bin:$PATH"

npm run circuit:build        # compile circuit + DEV-ONLY trusted setup + regenerate verifier_key.py
npm run circuit:test         # witness + proof + verify
npm run contract:build       # puyapy (AVM 11) -> TEAL/ARC-56 + TS & Python clients

algokit localnet start
npm run test:localnet -w scripts                 # 11 contract tests incl. real on-chain Groth16 verification
NODELINK_NETWORK=localnet npm run deploy -w scripts
NODELINK_NETWORK=localnet npm run e2e -w scripts # full flow incl. indexer + root updater
```

### TestNet

```bash
npm run deploy:testnet       # 1st run creates the deployer (mnemonic -> .env only) and prints its address
# fund it with >= 3 TestNet ALGO: https://bank.testnet.algorand.network/ or https://lora.algokit.io/testnet/fund
npm run deploy:testnet       # deploys + bootstraps, writes NODELINK_APP_ID and frontend/.env.local
npm run e2e:testnet          # deposit -> indexer -> post_root -> proof -> claim_status (+ replay/front-run checks)
npm run root-updater -- --watch   # keep roots fresh for real users
```

**Current TestNet deployment** (see `deployments/testnet.json`): app ID
[`773918931`](https://lora.algokit.io/testnet/application/773918931), app address
`AYGNTZW2DUO2DJFJDOQAGIUBJNAHKJBIZDN4CFJ5RJFCWNIW74GTRTZXP4`, root updater = deployer.
`npm run e2e:testnet` passed end-to-end on 2026-10-08 (deposit
[`2KRLI2VZ…`](https://lora.algokit.io/testnet/transaction/2KRLI2VZ6DDQX3A4URDFC2BSBBPCI3JX2UTR4YFT4AK67EVRUDWQ),
post_root [`DDXWG44L…`](https://lora.algokit.io/testnet/transaction/DDXWG44LCXYXFB27JKGDSA6RDRV4BBO4CE4MUK2VBEFJTE3QR73Q),
claim_status with on-chain Groth16 verify
[`2SSQQO2A…`](https://lora.algokit.io/testnet/transaction/2SSQQO2AKFIDLQ4YKXN7UVXFQ2T37KHXCRCIFMU6DHALYZVZ34CQ)).

The root updater only sends a `post_root` (0.001 ALGO) when the indexed leaf set of a tier changed, so
running `--watch` is cheap. Without it, new deposits are not provable until a root is posted.

### Frontend

```bash
cp frontend/.env.example frontend/.env.local   # or let deploy:testnet write it
npm run dev                                     # http://localhost:3000
npm run build                                   # production build (strict TS, zero `any`)
```

For a LocalNet UI session: `NEXT_PUBLIC_NETWORK=localnet NEXT_PUBLIC_APP_ID=<id> npm run dev`
(adds the KMD and test-only Mnemonic wallet providers). The headless browser test drives the whole
wizard: `BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/google-chrome npm run test:browser -w scripts`.

### Hosted frontend (Vercel)

Production: **https://nodelink-ten.vercel.app** (TestNet app `773918931`). Vercel project `nodelink`
(team `nodelink`) with Root Directory `frontend` and "include files outside the root directory", so
`@nodelink/shared` resolves from the workspace. `frontend/vercel.json` installs from the monorepo root
(`cd .. && npm ci`); `.vercelignore` keeps `.env*`, `node_modules` and circuit build output out of uploads.
Only two public build-time variables are set on Vercel — `NEXT_PUBLIC_NETWORK=testnet`,
`NEXT_PUBLIC_APP_ID=773918931`. No mnemonics or tokens live on Vercel; the API routes only read public
Nodely algod/indexer endpoints.

```bash
vercel deploy --prod                               # from the repo root (linked via .vercel/, gitignored)
BASE_URL=https://nodelink-ten.vercel.app npm run test:mobile -w scripts   # 390x844 screenshots + overflow check
```

**Mobile wallets:** Pera and Defly connect through their own Connect SDKs (deep link / "Launch app"
button on the same phone, QR on desktop) — no WalletConnect project ID required. Lute opens lute.app in
a popup. Kibisis is a desktop browser extension and will not work on phones. Switch Pera/Defly to
**TestNet** inside the app (Pera: Settings → Developer Settings → Node Settings → TestNet).

**Root updater:** deposits only become provable after a root is posted. Keep
`npm run root-updater -- --watch` running somewhere with `DEPLOYER_MNEMONIC` (or `ROOT_UPDATER_MNEMONIC`)
in `.env` — it is a long-running process and is intentionally not hosted on Vercel.

## Design notes & trust assumptions

### 1. Hot-wallet address encoding (no silent mod-p reduction)
An Algorand address is a 32-byte ed25519 public key (256 bits) — larger than the ~254-bit BN254 scalar
field. Reducing it mod r would be non-injective (two keys could share a field element). The circuit
therefore takes **two public inputs** `hotWalletHi = pk[0..16)` and `hotWalletLo = pk[16..32)`
(big-endian), each range-checked to 128 bits with `Num2Bits(128)`, so `(hi, lo) ↔ pk` is a bijection.
The contract checks the upper 16 bytes of both 32-byte signals are zero and that `lo16(hi) || lo16(lo)
== Txn.Sender`. The spec's single `hotWalletAddress` input was replaced by this pair.

### 2. Nullifier hash — deliberate deviation from the spec
The spec asked for `nullifierHash = Poseidon(nullifier, hotWalletAddress)`. Binding the nullifier to the
hot wallet means the *same leaf* yields a *different* nullifier for every hot wallet, so one cold deposit
could activate unlimited hot wallets (sybil farming of perks/airdrops). NodeLink instead uses
`nullifierHash = Poseidon(nullifier)` (one claim per deposit) and keeps front-running resistance through
the hot-wallet public inputs: a Groth16 proof is bound to all of its public inputs, and the contract
requires them to equal `Txn.Sender`. Tests confirm a proof replayed by another address fails
(`proof is bound to a different hot wallet`) and a second claim fails (`nullifier already used`).
To allow re-linking to a new hot wallet, make a new deposit.

### 3. Merkle roots: trusted root-updater role
Poseidon is not an AVM opcode, so the contract cannot cheaply maintain the tree. An off-chain indexer
(`shared/src/chain.ts`, used by `scripts/root-updater.ts` and `/api/merkle-path`) reads ARC-28
`LeafDeposited(byte[32],uint64,uint64)` events from the Algorand indexer (Nodely), rebuilds **one tree per
tier**, and the **root updater** (creator-set, rotatable by the admin via `set_root_updater`) posts
`(root, tier, leaf_count)` into a 32-slot ring buffer box `valid_roots`. `claim_status` accepts a root only
if it is in the buffer **for the same tier as `publicTier`** — that is how the claimed tier is tied to the
`declared_tier` whose balance threshold was checked at deposit (a Scout who commits `tier=5` inside the
Scout tree can never use it). `/api/merkle-path` returns a path against the newest *posted* root that
includes the leaf.
**Trust assumption:** a malicious root updater could post a root containing fake leaves and mint
statuses (it cannot steal funds or touch any wallet). Mitigations: anyone can audit roots by rebuilding
trees from public events; rotate the role to a multisig. **Trustless alternative:** AVM v11's native
`mimc` opcode (BN254Mp110) would let the contract maintain an incremental MiMC tree on-chain
(~550 opcode budget per hash, ~20 hashes per insert); the circuit would switch to a matching MiMC
(gnark-compatible Miyaguchi–Preneel, *not* circomlib's MiMC7/MiMCSponge).

### 4. Groth16 on the AVM
`verify_groth16` computes `vk_x = IC0 + Σ sᵢ·ICᵢ` with `ec_multi_scalar_mul` + `ec_add` and checks
`e(−A,B)·e(α,β)·e(vk_x,γ)·e(C,δ) = 1` with one `ec_pairing_check BN254g1` (A is negated on-chain as
`(x, p−y)`). The AVM encodes Fp2 as `c0||c1`, matching snarkjs' order directly (unlike the EVM precompile).
`ec_pairing_check` costs `8000 + 7400 per 64 bytes of B`; with 4 G2 points (512 bytes) that is 67 200,
so `ensure_budget(73_000, GroupCredit)` issues ~105 inner OpUp calls at the start of `claim_status`.
**A claim costs ≈ 0.109 ALGO in fees** (measured) + 0.0458 ALGO box MBR, paid by the hot wallet.
The verification key is **baked into the contract** (`contracts/verifier_key.py`), so it cannot be swapped
after deployment. Other checks: proof is 256 bytes, every public signal is a canonical field element
(`< r` — otherwise `s` and `s+r` verify identically and a nullifier could be reused under a different box
key), tier ∈ 1..5, root known for that tier, nullifier box absent, MBR payment correct.
The contract is immutable (no update/delete).

### 5. Deposit eligibility — what is verifiable on-chain
`deposit_commitment` uses `voter_params_get VoterBalance` (AVM v11): it proves the sender had **online
stake** in the balance round (320 rounds ago) and returns that stake. The tier threshold
(1 / 30k / 100k / 500k / 1M ALGO, in microAlgos) is checked against `min(online stake, current balance +
refundable MBR)`, which also resists flash-borrowed balances. Not verifiable on-chain: that the node
actually votes/proposes well (heartbeats/proposals are surfaced in the HUD via algod, `AcctLastProposed`/
`AcctLastHeartbeat` exist but are not enforced).
**Balance can drop after claiming:** the claim snapshots eligibility. `hot_status.expiry_round`
(`status_ttl_rounds`, ~30 days on TestNet) makes tiers lapse; renewing requires a new deposit (re-checking
online stake) and a new claim. Partners needing fresher guarantees should use a shorter TTL.
**TestNet bypass:** the TestNet deployment is created with `testnet_skip_online_check = true` (immutable,
set at creation) because the test deployer is not running a participation node. The contract asserts
`Global.genesis_hash != MainNet` when the flag is set. LocalNet tests exercise the **real** online check
(genesis accounts are online; a fresh account is rejected).

### 6. Privacy caveats
- **Anonymity set = depositors of the same tier tree** (the claim reveals the tier). Attesting a lower tier
  than you qualify for gives a larger set. Leaf counts per tier are shown on the landing page.
- **Timing correlation:** claiming right after depositing, with few deposits in between, can link the two.
  Wait, ideally until several other deposits land.
- **Funding:** never fund the hot wallet from the cold wallet (or from a common source) — that links them
  regardless of the ZK proof. (The E2E script does this only for testing.)
- The `/api/merkle-path` host learns which commitment is queried (and the requester's IP). Self-host or
  build paths client-side if that matters.
- Deposits themselves are public: everyone can see that a cold wallet joined tier X.
- The private cold↔hot mapping lives only in the browser (`localStorage`) and in the encrypted backup.

### 7. Zero execution authority
The hot wallet only ever receives a status box. No rekeys, no logicsig delegation, no spending rights.
Every state-changing method asserts `Txn.RekeyTo == ZeroAddress`, and MBR payments must not rekey or
close the sender. `reveal_public_profile` requires the **cold wallet to sign the MBR payment** (otherwise
anyone could publicly claim a whale's address); it only publishes a link. `hide_public_profile` deletes the
box and refunds the MBR to the cold wallet (history remains on-chain).

### 8. Encrypted backup
WebCrypto **PBKDF2-SHA256 (600 000 iterations) → AES-256-GCM**, random 16-byte salt and 12-byte IV,
passphrase ≥ 12 chars. Payload `{secret, nullifier, tier, leaf, coldAddress, appId, network}`. The backup is
downloaded **before** the deposit transaction is signed, so the secrets cannot be lost afterwards. On import
the leaf is recomputed to detect corruption.

### 9. Trusted setup — DEV ONLY
`circuits/scripts/build.sh` runs a single-party Powers of Tau (2^14) + phase-2 contribution with local
randomness. **Whoever ran it could forge proofs.** Production requires a public Perpetual Powers of Tau
file plus a multi-party phase-2 ceremony, then re-running `gen-verifier-key.ts` and redeploying (the VK is
immutable in the contract).

### Other deviations / notes
- `deposit_commitment` returns the leaf index (`uint64`); events also include tier and index.
- `valid_roots` slots are 48 bytes (`root || tier || leaf_count`).
- Extra methods: `create`, `bootstrap`, `post_root`, `set_root_updater`, `set_admin`, `hide_public_profile`,
  read-only `get_status`, `is_known_root`, `leaf_count`.
- `@txnlab/use-wallet-react` is pinned to v4.6 (v5 switched to a new adapter model).
- The generated TS client is post-processed in `contracts/build.sh` for `noUncheckedIndexedAccess` and to
  replace its three `any`s with `unknown`; hand-written code has zero `any`.
- Partner dApps, perks and news are placeholders (no partnerships implied).
