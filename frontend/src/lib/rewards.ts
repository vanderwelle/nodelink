"use client";

import { ENDPOINTS, SECONDS_PER_ROUND } from "./config";

export interface Proposal {
  readonly round: bigint;
  readonly timestamp: number;
  readonly payout: bigint;
}

export interface DayBin {
  /** 0 = most recent ~24h window */
  readonly daysAgo: number;
  readonly count: number;
  readonly payout: bigint;
  /** the indexer page limit was hit, so count is a lower bound */
  readonly truncated: boolean;
  readonly proposals: readonly Proposal[];
}

interface BlockHeaderJson {
  round: number;
  timestamp: number;
  "proposer-payout"?: number;
}

export const ROUNDS_PER_DAY = BigInt(Math.round(86_400 / SECONDS_PER_ROUND));
const PAGE = 1000;

async function fetchWindow(address: string, minRound: bigint, maxRound: bigint): Promise<{ proposals: Proposal[]; truncated: boolean }> {
  const url = new URL(`${ENDPOINTS.indexer}/v2/block-headers`);
  url.searchParams.set("proposers", address);
  url.searchParams.set("min-round", minRound.toString());
  url.searchParams.set("max-round", maxRound.toString());
  url.searchParams.set("limit", String(PAGE));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`indexer ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as { blocks?: BlockHeaderJson[] };
  const blocks = json.blocks ?? [];
  return {
    proposals: blocks.map((b) => ({ round: BigInt(b.round), timestamp: b.timestamp, payout: BigInt(b["proposer-payout"] ?? 0) })),
    truncated: blocks.length >= PAGE,
  };
}

/**
 * Proposals by `address` over the last `days` (~24h round windows ending at `round`), using the
 * Nodely indexer's /v2/block-headers. One bounded query per day keeps each request fast and the
 * daily counts exact. Runs in the browser, so the NodeLink server never sees the address.
 */
export async function fetchDailyProposals(address: string, round: bigint, days: number): Promise<DayBin[]> {
  const windows = Array.from({ length: days }, (_, d) => ({ d, max: round - BigInt(d) * ROUNDS_PER_DAY, min: round - BigInt(d + 1) * ROUNDS_PER_DAY + 1n }));
  const out: DayBin[] = [];
  for (let i = 0; i < windows.length; i += 6) {
    const batch = await Promise.all(
      windows.slice(i, i + 6).map(async (w) => {
        const r = await fetchWindow(address, w.min > 0n ? w.min : 0n, w.max);
        const sorted = r.proposals.sort((a, b) => (a.round < b.round ? 1 : -1));
        return { daysAgo: w.d, count: sorted.length, payout: sorted.reduce((a, p) => a + p.payout, 0n), truncated: r.truncated, proposals: sorted };
      }),
    );
    out.push(...batch);
  }
  return out;
}
