// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

/**
 * Read-only node telemetry on the TELEMETRY network (MainNet in production).
 *
 * - GET requests only, no algosdk client, no signer: nothing here can build or send a transaction.
 * - Nodely free tier: 60 req/s and 10 concurrent requests per IP; 429 = slow down. We
 *   (1) cache responses (TTL) and de-duplicate in-flight requests,
 *   (2) cap concurrency at 4,
 *   (3) retry 429/5xx/network errors with exponential backoff + jitter, honouring Retry-After,
 *   (4) fail over to Nodely's backup domains on 5xx/network errors (never on 429),
 *   (5) surface a friendly TelemetryError and let callers keep showing stale data.
 * Requests go straight from the browser, so limits apply per user and our server never learns
 * which node address is being watched.
 */
import { TELEMETRY } from "./config";

export type TelemetryErrorKind = "rate-limited" | "quota" | "not-found" | "unavailable";

export class TelemetryError extends Error {
  constructor(
    readonly kind: TelemetryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TelemetryError";
  }
}

export function friendlyTelemetryError(err: unknown): string {
  if (err instanceof TelemetryError) {
    switch (err.kind) {
      case "rate-limited":
        return `${TELEMETRY.label} data provider is busy (Nodely rate limit). Showing the last data we have — retrying automatically.`;
      case "quota":
        return `${TELEMETRY.label} data provider quota reached for today. Try again later.`;
      case "not-found":
        return err.message;
      case "unavailable":
        return `${TELEMETRY.label} data is temporarily unavailable. Retrying automatically.`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

// ---- request pipeline ----------------------------------------------------------------------

const MAX_CONCURRENT = 4;
const MAX_ATTEMPTS = 4;
let active = 0;
const queue: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Shared across tabs of the app: a 429 anywhere slows everyone down for a moment. */
let coolDownUntil = 0;

async function getJson(kind: "algod" | "indexer", path: string): Promise<unknown> {
  const bases = TELEMETRY[kind];
  let baseIdx = 0;
  let lastErr: TelemetryError = new TelemetryError("unavailable", "no attempt");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wait = coolDownUntil - Date.now();
    if (wait > 0) await sleep(wait);
    const base = bases[Math.min(baseIdx, bases.length - 1)];
    let res: Response;
    try {
      res = await withSlot(() => fetch(`${base}${path}`, { headers: TELEMETRY.token ? { "X-Algo-API-Token": TELEMETRY.token } : undefined }));
    } catch {
      lastErr = new TelemetryError("unavailable", "network error");
      baseIdx++;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 404) {
      const body = await res.text().catch(() => "");
      throw new TelemetryError("not-found", body.includes("no accounts found") ? "Account not found on " + TELEMETRY.label : `Not found on ${TELEMETRY.label}`);
    }
    if (res.status === 403) throw new TelemetryError("quota", "quota");
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      const ms = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt);
      coolDownUntil = Date.now() + ms;
      lastErr = new TelemetryError("rate-limited", "429");
      continue;
    }
    if (res.status >= 500) {
      lastErr = new TelemetryError("unavailable", `HTTP ${res.status}`);
      baseIdx++;
      await sleep(backoff(attempt));
      continue;
    }
    throw new TelemetryError("unavailable", `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
  }
  throw lastErr;
}

function backoff(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
}

interface CacheEntry {
  readonly at: number;
  readonly value: unknown;
}
const memCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Cached + de-duplicated GET. The *transformed* (compact, JSON-safe) value is cached; with
 * `ttlMs = Infinity` it is also persisted to localStorage (immutable data such as past blocks).
 */
async function cachedGet<T>(kind: "algod" | "indexer", path: string, ttlMs: number, transform: (json: unknown) => T): Promise<T> {
  const key = `${TELEMETRY.network}:${kind}:${path}`;
  const hit = memCache.get(key) ?? (ttlMs === Infinity ? readPersistent(key) : undefined);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = getJson(kind, path)
    .then((json) => {
      const value = transform(json);
      const entry = { at: Date.now(), value };
      memCache.set(key, entry);
      if (ttlMs === Infinity) writePersistent(key, entry);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const LS_PREFIX = "nodelink:telemetry:v1:";
const LS_MAX = 400;
function readPersistent(key: string): CacheEntry | undefined {
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as CacheEntry) : undefined;
  } catch {
    return undefined;
  }
}
function writePersistent(key: string, entry: CacheEntry): void {
  try {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(LS_PREFIX));
    if (keys.length >= LS_MAX) for (const k of keys.slice(0, keys.length - LS_MAX + 50)) window.localStorage.removeItem(k);
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* storage full or unavailable — memory cache still works */
  }
}

// ---- typed reads ---------------------------------------------------------------------------

const num = (v: unknown): bigint | null => (typeof v === "number" || typeof v === "bigint" ? BigInt(v) : null);

export interface NodeTelemetry {
  readonly network: string;
  readonly address: string;
  readonly balance: bigint;
  readonly status: string;
  readonly incentiveEligible: boolean;
  readonly lastProposed: bigint | null;
  readonly lastHeartbeat: bigint | null;
  readonly voteLastValid: bigint | null;
  readonly round: bigint;
}

export async function fetchNodeTelemetry(address: string): Promise<NodeTelemetry> {
  const j = await cachedGet("algod", `/v2/accounts/${address}?exclude=all`, 10_000, (x) => x as Record<string, unknown>);
  const part = (j["participation"] ?? {}) as Record<string, unknown>;
  return {
    network: TELEMETRY.label,
    address,
    balance: num(j["amount"]) ?? 0n,
    status: typeof j["status"] === "string" ? j["status"] : "Offline",
    incentiveEligible: j["incentive-eligible"] === true,
    lastProposed: num(j["last-proposed"]),
    lastHeartbeat: num(j["last-heartbeat"]),
    voteLastValid: num(part["vote-last-valid"]),
    round: num(j["round"]) ?? 0n,
  };
}

export interface NetworkPulse {
  readonly round: bigint;
  /** wall-clock ms when the last block was produced (approx.) */
  readonly lastBlockAt: number;
}

export async function fetchNetworkPulse(): Promise<NetworkPulse> {
  const j = await cachedGet("algod", "/v2/status", 4_000, (x) => x as Record<string, unknown>);
  const since = num(j["time-since-last-round"]) ?? 0n;
  return { round: num(j["last-round"]) ?? 0n, lastBlockAt: Date.now() - Number(since / 1_000_000n) };
}

export interface BlockHeaderLite {
  readonly round: bigint;
  readonly timestamp: number;
  readonly payout: bigint;
}

/**
 * Blocks proposed by `address` in [minRound, maxRound]. Windows entirely below `finalRound`
 * are immutable and cached in localStorage forever; the open window uses a short TTL.
 */
export async function fetchProposedBlocks(address: string, minRound: bigint, maxRound: bigint, finalRound: bigint, limit = 1000): Promise<{ blocks: BlockHeaderLite[]; truncated: boolean }> {
  const path = `/v2/block-headers?proposers=${address}&min-round=${minRound}&max-round=${maxRound}&limit=${limit}`;
  // compact tuples [round, timestamp, payoutMicroAlgos] keep the persistent cache small
  const tuples = await cachedGet("indexer", path, maxRound < finalRound ? Infinity : 30_000, (x) =>
    ((x as { blocks?: Record<string, unknown>[] }).blocks ?? []).map((b): [number, number, number] => [
      Number(b["round"] ?? 0),
      Number(b["timestamp"] ?? 0),
      Number(b["proposer-payout"] ?? 0),
    ]),
  );
  const blocks = tuples.map(([round, timestamp, payout]) => ({ round: BigInt(round), timestamp, payout: BigInt(payout) }));
  return { blocks, truncated: blocks.length >= limit };
}
