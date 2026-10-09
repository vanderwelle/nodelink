// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { Database, FlaskConical } from "lucide-react";
import { CONTRACT_LABEL, TELEMETRY } from "@/lib/config";

/**
 * Which network a card reads from.
 *  - "data":     read-only node telemetry (MainNet in production) → "MainNet data"
 *  - "contract": NodeLink contract features (badge, deposit, claim, leaderboard) → "TestNet preview"
 */
export function NetPill({ kind, compact = false, className = "" }: { kind: "data" | "contract"; compact?: boolean; className?: string }) {
  if (kind === "data") {
    const main = TELEMETRY.network === "mainnet";
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${main ? "bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/30" : "bg-white/5 text-gray-300 ring-1 ring-white/10"} ${className}`}
        title={`Read-only data from Algorand ${TELEMETRY.label} via Nodely`}
        data-net="telemetry"
      >
        <Database className="h-3 w-3" /> {TELEMETRY.label}
        {compact ? "" : " data"}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-fuchsia-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fuchsia-300 ring-1 ring-fuchsia-400/30 ${className}`}
      title={`NodeLink contract runs on ${CONTRACT_LABEL} — no real funds`}
      data-net="contract"
    >
      <FlaskConical className="h-3 w-3" /> {CONTRACT_LABEL}
      {compact ? "" : " preview"}
    </span>
  );
}

/** "updated 12 s ago" for telemetry that may be stale after a failed refresh. */
export function UpdatedAgo({ at, now }: { at: number | null; now: number }) {
  if (at === null) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  const txt = s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
  return <span className="text-[10px] text-gray-500">updated {txt} ago</span>;
}
