// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { SECONDS_PER_ROUND } from "./config";
import { fetchProposedBlocks, type BlockHeaderLite } from "./telemetry";

export type Proposal = BlockHeaderLite;

export interface DayBin {
  /** 0 = the window containing the current round */
  readonly daysAgo: number;
  /** exact unless `estimated` */
  readonly count: number;
  readonly payout: bigint;
  /**
   * Very large nodes propose hundreds of blocks a day. To keep phones fast and stay well inside
   * Nodely's free tier we fetch at most SAMPLE_LIMIT headers per day and extrapolate over the
   * rest of the window (indexer returns blocks in ascending round order).
   */
  readonly estimated: boolean;
  /** proposals actually fetched for this window, newest first */
  readonly proposals: readonly Proposal[];
}

export const ROUNDS_PER_DAY = BigInt(Math.round(86_400 / SECONDS_PER_ROUND));
const SAMPLE_LIMIT = 100;
/** Windows that closed this many rounds ago are final (covers indexer lag) and cached forever. */
const FINALITY = 1_000n;

/**
 * Proposals by `address` in ~24h round windows on the TELEMETRY network. Windows are aligned to
 * multiples of ROUNDS_PER_DAY so past windows never change and are served from cache on
 * refresh — a reload costs one indexer request instead of `days`.
 */
export async function fetchDailyProposals(address: string, round: bigint, days: number): Promise<DayBin[]> {
  const currentStart = (round / ROUNDS_PER_DAY) * ROUNDS_PER_DAY;
  const windows = Array.from({ length: days }, (_, d) => {
    const min = currentStart - BigInt(d) * ROUNDS_PER_DAY;
    return { d, min: min > 0n ? min : 0n, max: min + ROUNDS_PER_DAY - 1n };
  });
  return Promise.all(
    windows.map(async (w): Promise<DayBin> => {
      const r = await fetchProposedBlocks(address, w.min, w.max, round - FINALITY, SAMPLE_LIMIT);
      const sum = r.blocks.reduce((a, p) => a + p.payout, 0n);
      const newest = [...r.blocks].sort((a, b) => (a.round < b.round ? 1 : -1));
      const last = newest[0];
      if (!r.truncated || !last) return { daysAgo: w.d, count: r.blocks.length, payout: sum, estimated: false, proposals: newest };
      const end = w.max < round ? w.max : round;
      const covered = last.round - w.min + 1n;
      const span = end - w.min + 1n;
      return {
        daysAgo: w.d,
        count: Math.round((r.blocks.length * Number(span)) / Number(covered)),
        payout: (sum * span) / covered,
        estimated: true,
        proposals: newest,
      };
    }),
  );
}

/** Latest proposals (newest first). Uses a short tail window for very active nodes. */
export async function fetchRecentProposals(address: string, round: bigint, bins: readonly DayBin[], n = 10): Promise<Proposal[]> {
  if (!bins.some((b) => b.estimated)) return bins.flatMap((b) => b.proposals).slice(0, n);
  const tail = await fetchProposedBlocks(address, round > 3_000n ? round - 3_000n : 0n, round, round - FINALITY, SAMPLE_LIMIT);
  return [...tail.blocks].sort((a, b) => (a.round < b.round ? 1 : -1)).slice(0, n);
}
