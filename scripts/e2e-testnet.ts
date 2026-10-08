/**
 * End-to-end on Algorand TESTNET:
 *   cold: deposit_commitment  ->  indexer sees LeafDeposited  ->  root updater: post_root
 *   hot : fetch Merkle path (same code as /api/merkle-path) -> snarkjs proof -> claim_status
 * plus negative checks (replay, front-running).
 *
 * NOTE: test-only shortcut — the hot wallet is funded by the deployer here. In real use, never
 * fund your hot wallet from your cold wallet (that links them on-chain).
 */
import { algo, microAlgo } from "@algorandfoundation/algokit-utils";
import {
  NETWORKS,
  computeNullifierHash,
  fetchHotStatus,
  fetchLeafEvents,
  generateCommitment,
  getMerklePathForCommitment,
  makeIndexer,
} from "@nodelink/shared";
import { NodeLinkProtocolClient } from "@nodelink/shared/generated";
import { loadOrCreateAccount, balanceOf } from "./lib/accounts";
import { accountKey, appIdKey, makeAlgorand, networkFromEnv, requireEnv } from "./lib/env";
import { proveMembership, terminateSnarkjsWorkers } from "./lib/prover";
import { claimStatus, depositCommitment, syncRoots } from "./lib/protocol";

const network = networkFromEnv(); // testnet (default) or localnet rehearsal; mainnet is refused
const algorand = await makeAlgorand(network);
const appId = BigInt(requireEnv(appIdKey(network)));
const { account: cold } = loadOrCreateAccount(algorand, accountKey(network, "DEPLOYER_MNEMONIC")); // also root updater
const { account: hot } = loadOrCreateAccount(algorand, accountKey(network, "E2E_HOT_MNEMONIC"));
const client = algorand.client.getTypedAppClientById(NodeLinkProtocolClient, { appId, defaultSender: cold.addr });
const indexer = makeIndexer(NETWORKS[network]);
const explorer = NETWORKS[network].explorer;
const results: { step: string; ok: boolean; detail: string }[] = [];
const record = (step: string, ok: boolean, detail: string): void => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step} — ${detail}`);
};

try {
  console.log(`App ${appId} | cold ${cold.addr.toString()} | hot ${hot.addr.toString()}`);
  if ((await balanceOf(algorand, hot.addr.toString())) < 300_000n) {
    await algorand.send.payment({ sender: cold.addr, receiver: hot.addr, amount: algo(0.35) });
  }

  // 1. Cold wallet deposits a Scout (tier 1) commitment
  const secrets = generateCommitment(1);
  const dep = await depositCommitment(algorand, client, cold, secrets.leaf, 1);
  record("deposit_commitment", true, `leaf #${dep.leafIndex} tx ${explorer}/transaction/${dep.txId}`);

  // 2. Off-chain indexer picks up the ARC-28 event (Nodely indexer can lag a few seconds)
  let events = await fetchLeafEvents(indexer, appId);
  for (let i = 0; i < 30 && !events.some((e) => e.commitment === secrets.leaf); i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    events = await fetchLeafEvents(indexer, appId);
  }
  record("indexer sees LeafDeposited", events.some((e) => e.commitment === secrets.leaf), `${events.length} leaves indexed`);

  // 3. Root updater posts new roots
  const posted = await syncRoots(client, cold, events);
  record("post_root", posted.length > 0, posted.map((p) => `tier ${p.tier}: ${p.leafCount} leaves -> slot ${p.slot}`).join("; "));

  // 4. Hot wallet: Merkle path against a posted root, then prove in Node with snarkjs
  const { path, rootSlot } = await getMerklePathForCommitment(algorand.client.algod, indexer, appId, secrets.leaf);
  const t0 = Date.now();
  const proof = await proveMembership({ secret: secrets.secret, nullifier: secrets.nullifier, tier: 1, path, hotWalletAddress: hot.addr.toString() });
  record("groth16 proof generated", true, `${Date.now() - t0} ms, root slot ${rootSlot.slot}`);

  // 5. claim_status — proof verified on-chain with BN254 pairing
  const existing = await fetchHotStatus(algorand.client.algod, appId, hot.addr.toString());
  const claim = await claimStatus(algorand, client, hot, proof.proof, proof.publicInputs, existing !== null);
  record("claim_status (on-chain Groth16 verify)", claim.tier === 1, `tier ${claim.tier}, expires round ${claim.expiryRound}, fees ${claim.fee} µALGO, tx ${explorer}/transaction/${claim.txId}`);

  const status = await fetchHotStatus(algorand.client.algod, appId, hot.addr.toString());
  record("hot_status box", status?.tier === 1, JSON.stringify({ tier: status?.tier, expiryRound: status?.expiryRound.toString() }));
  record("nullifier recorded", true, computeNullifierHash(secrets.nullifier).toString().slice(0, 16) + "…");

  // 6. Negative: replay
  try {
    await claimStatus(algorand, client, hot, proof.proof, proof.publicInputs, true);
    record("replay rejected", false, "replay unexpectedly succeeded");
  } catch (err) {
    record("replay rejected", /nullifier already used/.test(String(err)), "nullifier already used");
  }
  // 7. Negative: front-running by another address
  try {
    await claimStatus(algorand, client, cold, proof.proof, proof.publicInputs, true);
    record("front-run rejected", false, "third-party submission unexpectedly succeeded");
  } catch (err) {
    record("front-run rejected", /different hot wallet/.test(String(err)), "proof is bound to a different hot wallet");
  }
} finally {
  await terminateSnarkjsWorkers();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? `\nE2E ${network.toUpperCase()}: ALL STEPS PASSED` : `\nE2E ${network.toUpperCase()}: ${failed} STEP(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
void microAlgo;
