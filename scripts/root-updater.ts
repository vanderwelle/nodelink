/**
 * Off-chain indexer + root updater.
 *
 * Reads every ARC-28 `LeafDeposited` event of the NodeLink app from the Algorand indexer
 * (Nodely public endpoint), rebuilds the five per-tier Poseidon Merkle trees and posts any
 * new root into the on-chain 32-slot ring buffer via `post_root` (root-updater role only).
 *
 *   npm run root-updater              # one shot
 *   npm run root-updater -- --watch   # poll every 15 s
 */
import { NETWORKS, fetchLeafEvents, makeIndexer } from "@nodelink/shared";
import { NodeLinkProtocolClient } from "@nodelink/shared/generated";
import { loadOrCreateAccount } from "./lib/accounts";
import { accountKey, appIdKey, makeAlgorand, networkFromEnv, requireEnv } from "./lib/env";
import { syncRoots } from "./lib/protocol";

const network = networkFromEnv();
const algorand = await makeAlgorand(network);
const appId = BigInt(requireEnv(appIdKey(network)));
const keyName = process.env.ROOT_UPDATER_MNEMONIC ? "ROOT_UPDATER_MNEMONIC" : accountKey(network, "DEPLOYER_MNEMONIC");
const { account: updater } = loadOrCreateAccount(algorand, keyName);
const client = algorand.client.getTypedAppClientById(NodeLinkProtocolClient, { appId, defaultSender: updater.addr });
const indexer = makeIndexer(NETWORKS[network]);

async function tick(): Promise<void> {
  const events = await fetchLeafEvents(indexer, appId);
  const posted = await syncRoots(client, updater, events);
  const ts = new Date().toISOString();
  if (posted.length === 0) console.log(`[${ts}] ${events.length} leaves indexed; all roots up to date`);
  for (const p of posted) console.log(`[${ts}] posted tier ${p.tier} root over ${p.leafCount} leaves -> slot ${p.slot}`);
}

if (process.argv.includes("--watch")) {
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
} else {
  await tick();
}
