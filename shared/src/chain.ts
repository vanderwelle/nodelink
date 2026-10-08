import algosdk from "algosdk";
import { BOX_PREFIX, ROOT_HISTORY_SIZE, ROOT_SLOT_SIZE } from "./constants";
import { bigIntToBytes, bytesEqual, bytesToBigInt, bytesToHex, concatBytes } from "./field";
import { PoseidonMerkleTree, type MerklePath } from "./merkle";
import type { NetworkEndpoints } from "./network";
import { isTierId, type TierId } from "./tiers";

/** ARC-28 selector of `LeafDeposited(byte[32],uint64,uint64)` = sha512_256(sig)[0..4]. */
export const LEAF_DEPOSITED_SELECTOR = "b7383d55";
export const ROOT_POSTED_SELECTOR = "6467a9bc";

function splitUrl(url: string): { server: string; port: string } {
  const u = new URL(url);
  return { server: `${u.protocol}//${u.hostname}`, port: u.port };
}

const LOCALNET_TOKEN = "a".repeat(64);

export function makeAlgod(endpoints: NetworkEndpoints): algosdk.Algodv2 {
  const { server, port } = splitUrl(endpoints.algod);
  return new algosdk.Algodv2(port ? LOCALNET_TOKEN : "", server, port);
}

export function makeIndexer(endpoints: NetworkEndpoints): algosdk.Indexer {
  const { server, port } = splitUrl(endpoints.indexer);
  return new algosdk.Indexer(port ? LOCALNET_TOKEN : "", server, port);
}

const enc = new TextEncoder();
export const boxName = {
  validRoots: (): Uint8Array => enc.encode(BOX_PREFIX.validRoots),
  leafCounts: (): Uint8Array => enc.encode(BOX_PREFIX.leafCounts),
  leaf: (commitment: bigint): Uint8Array => concatBytes(enc.encode(BOX_PREFIX.leaf), bigIntToBytes(commitment, 32)),
  nullifier: (nullifierHash: bigint): Uint8Array =>
    concatBytes(enc.encode(BOX_PREFIX.nullifier), bigIntToBytes(nullifierHash, 32)),
  hotStatus: (address: string): Uint8Array =>
    concatBytes(enc.encode(BOX_PREFIX.hotStatus), algosdk.decodeAddress(address).publicKey),
  publicProfile: (address: string): Uint8Array =>
    concatBytes(enc.encode(BOX_PREFIX.publicProfile), algosdk.decodeAddress(address).publicKey),
};

export async function readBox(algod: algosdk.Algodv2, appId: bigint, name: Uint8Array): Promise<Uint8Array | null> {
  try {
    const box = await algod.getApplicationBoxByName(appId, name).do();
    return box.value;
  } catch (err) {
    const status = (err as { status?: number; response?: { status?: number } }).response?.status ??
      (err as { status?: number }).status;
    if (status === 404) return null;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("box not found") || msg.includes("404")) return null;
    throw err;
  }
}

function u64(bytes: Uint8Array, offset: number): bigint {
  return bytesToBigInt(bytes.slice(offset, offset + 8));
}

export interface RootSlot {
  readonly slot: number;
  readonly root: bigint;
  readonly tier: TierId;
  readonly leafCount: number;
}

export function decodeRootSlots(bytes: Uint8Array): RootSlot[] {
  const slots: RootSlot[] = [];
  for (let i = 0; i < ROOT_HISTORY_SIZE; i++) {
    const off = i * ROOT_SLOT_SIZE;
    if (off + ROOT_SLOT_SIZE > bytes.length) break;
    const tier = Number(u64(bytes, off + 32));
    if (!isTierId(tier)) continue; // empty slot
    slots.push({ slot: i, root: bytesToBigInt(bytes.slice(off, off + 32)), tier, leafCount: Number(u64(bytes, off + 40)) });
  }
  return slots;
}

export interface HotStatus {
  readonly tier: TierId;
  readonly expiryRound: bigint;
}

export function decodeHotStatus(bytes: Uint8Array): HotStatus | null {
  if (bytes.length !== 9) return null;
  const tier = bytes[0] ?? 0;
  if (!isTierId(tier)) return null;
  return { tier, expiryRound: u64(bytes, 1) };
}

export async function fetchHotStatus(algod: algosdk.Algodv2, appId: bigint, hot: string): Promise<HotStatus | null> {
  const raw = await readBox(algod, appId, boxName.hotStatus(hot));
  return raw ? decodeHotStatus(raw) : null;
}

export async function fetchRootSlots(algod: algosdk.Algodv2, appId: bigint): Promise<RootSlot[]> {
  const raw = await readBox(algod, appId, boxName.validRoots());
  return raw ? decodeRootSlots(raw) : [];
}

export async function fetchLeafCounts(algod: algosdk.Algodv2, appId: bigint): Promise<Record<TierId, number>> {
  const raw = await readBox(algod, appId, boxName.leafCounts());
  const counts: Record<TierId, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (raw) for (let t = 1; t <= 5; t++) counts[t as TierId] = Number(u64(raw, (t - 1) * 8));
  return counts;
}

export interface LeafEvent {
  readonly commitment: bigint;
  readonly tier: TierId;
  readonly leafIndex: number;
  readonly txId: string;
  readonly round: bigint;
}

export function decodeLeafDepositedLog(log: Uint8Array): Omit<LeafEvent, "txId" | "round"> | null {
  if (log.length !== 4 + 32 + 8 + 8) return null;
  if (bytesToHex(log.slice(0, 4)) !== LEAF_DEPOSITED_SELECTOR) return null;
  const tier = Number(u64(log, 36));
  if (!isTierId(tier)) return null;
  return { commitment: bytesToBigInt(log.slice(4, 36)), tier, leafIndex: Number(u64(log, 44)) };
}

/**
 * Off-chain indexer: scan every application call to `appId` (via the Algorand indexer)
 * and collect ARC-28 `LeafDeposited` events, sorted per tier by leaf index.
 */
export async function fetchLeafEvents(indexer: algosdk.Indexer, appId: bigint, minRound?: bigint): Promise<LeafEvent[]> {
  const events: LeafEvent[] = [];
  let next: string | undefined;
  do {
    let q = indexer.searchForTransactions().applicationID(appId).txType("appl").limit(1000);
    if (minRound !== undefined) q = q.minRound(minRound);
    if (next) q = q.nextToken(next);
    const page = await q.do();
    for (const txn of page.transactions) {
      for (const log of txn.logs ?? []) {
        const ev = decodeLeafDepositedLog(log);
        if (ev) events.push({ ...ev, txId: txn.id ?? "", round: txn.confirmedRound ?? 0n });
      }
    }
    next = page.transactions.length > 0 ? page.nextToken : undefined;
  } while (next);
  events.sort((a, b) => a.tier - b.tier || a.leafIndex - b.leafIndex);
  return events;
}

/** Group events into per-tier ordered leaf arrays; throws on gaps (indexer lag/corruption). */
export function leavesByTier(events: readonly LeafEvent[]): Record<TierId, bigint[]> {
  const out: Record<TierId, bigint[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const ev of events) {
    const arr = out[ev.tier];
    if (ev.leafIndex !== arr.length) {
      if (ev.leafIndex < arr.length) continue; // duplicate
      throw new Error(`Gap in tier ${ev.tier} leaves at index ${arr.length} (got ${ev.leafIndex})`);
    }
    arr.push(ev.commitment);
  }
  return out;
}

export interface MerkleProofResponse {
  readonly path: MerklePath;
  readonly tier: TierId;
  readonly rootSlot: RootSlot;
}

/**
 * Produce a Merkle path for `commitment` against the most recent root that the
 * root-updater has already posted on-chain and that includes the leaf.
 */
export async function getMerklePathForCommitment(
  algod: algosdk.Algodv2,
  indexer: algosdk.Indexer,
  appId: bigint,
  commitment: bigint,
): Promise<MerkleProofResponse> {
  const events = await fetchLeafEvents(indexer, appId);
  const ev = events.find((e) => e.commitment === commitment);
  if (!ev) throw new Error("Commitment not found in LeafDeposited events (indexer may still be catching up)");
  const leaves = leavesByTier(events)[ev.tier];
  const slots = await fetchRootSlots(algod, appId);
  const candidates = slots
    .filter((s) => s.tier === ev.tier && s.leafCount > ev.leafIndex && s.leafCount <= leaves.length)
    .sort((a, b) => b.leafCount - a.leafCount);
  for (const slot of candidates) {
    const tree = new PoseidonMerkleTree(leaves.slice(0, slot.leafCount));
    if (tree.root === slot.root) return { path: tree.path(ev.leafIndex), tier: ev.tier, rootSlot: slot };
  }
  throw new Error("No posted root includes this commitment yet — wait for the root updater");
}

export { bytesEqual };
