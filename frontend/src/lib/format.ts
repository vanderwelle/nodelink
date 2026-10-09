// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { microAlgosToAlgo } from "@nodelink/shared";
import { SECONDS_PER_ROUND } from "./config";

export function shortAddress(address: string, chars = 5): string {
  return address.length <= chars * 2 + 1 ? address : `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function formatAlgo(microAlgos: bigint, digits = 2): string {
  return `${microAlgosToAlgo(microAlgos, digits)} ALGO`;
}

export function roundsToDuration(rounds: bigint): string {
  if (rounds <= 0n) return "expired";
  const seconds = Number(rounds) * SECONDS_PER_ROUND;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  if (days > 0) return `~${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `~${hours}h ${minutes}m`;
}

/** "just now", "12m ago", "5h ago", "3d ago" from a round delta. */
export function roundsAgo(rounds: bigint): string {
  const s = Math.max(0, Number(rounds) * SECONDS_PER_ROUND);
  if (s < 60) return "just now";
  if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3_600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // surface the contract's assert message when present
  const known = [
    "not an online consensus participant",
    "balance below declared tier threshold",
    "commitment already deposited",
    "nullifier already used",
    "proof is bound to a different hot wallet",
    "unknown root for this tier",
    "invalid proof",
    "insufficient MBR payment",
    "no NodeLink status",
    "status expired",
    "cold wallet must co-sign (pay MBR)",
    "profile already public",
  ];
  const hit = known.find((k) => raw.includes(k));
  return hit ? `Contract rejected: ${hit}` : raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}
