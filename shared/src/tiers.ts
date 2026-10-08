import { MICROALGOS_PER_ALGO } from "./constants";

export type TierId = 1 | 2 | 3 | 4 | 5;

export interface TierInfo {
  readonly id: TierId;
  readonly name: "Scout" | "Guardian" | "Pillar" | "Sovereign" | "Millionaire";
  /** Minimum balance in whole ALGO. */
  readonly minAlgo: bigint;
  /** Minimum balance in microAlgos (what the contract checks). */
  readonly minMicroAlgos: bigint;
  /** Reward multiplier in basis points (10_000 = 1.00x). */
  readonly multiplierBps: number;
  readonly color: string;
}

const tier = (
  id: TierId,
  name: TierInfo["name"],
  minAlgo: bigint,
  multiplierBps: number,
  color: string,
): TierInfo => ({ id, name, minAlgo, minMicroAlgos: minAlgo * MICROALGOS_PER_ALGO, multiplierBps, color });

export const TIERS: readonly TierInfo[] = [
  tier(1, "Scout", 1n, 10_000, "#38bdf8"),
  tier(2, "Guardian", 30_000n, 12_500, "#34d399"),
  tier(3, "Pillar", 100_000n, 15_000, "#a78bfa"),
  tier(4, "Sovereign", 500_000n, 20_000, "#f59e0b"),
  tier(5, "Millionaire", 1_000_000n, 30_000, "#f43f5e"),
];

export function isTierId(value: number): value is TierId {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function getTier(id: TierId): TierInfo {
  const t = TIERS[id - 1];
  if (!t) throw new Error(`Unknown tier ${id}`);
  return t;
}

/** Highest tier whose threshold `microAlgos` satisfies, or null if below Scout. */
export function tierForBalance(microAlgos: bigint): TierInfo | null {
  let best: TierInfo | null = null;
  for (const t of TIERS) {
    if (microAlgos >= t.minMicroAlgos) best = t;
  }
  return best;
}

export function formatMultiplier(bps: number): string {
  return `${(bps / 10_000).toFixed(2)}x`;
}
