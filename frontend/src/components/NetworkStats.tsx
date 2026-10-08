"use client";

import { TIERS, microAlgosToAlgo } from "@nodelink/shared";
import { useEffect, useState } from "react";
import type { StatsResponse } from "@/app/api/stats/route";
import { Stat } from "./ui";

export function NetworkStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch("/api/stats");
        const json = (await res.json()) as StatsResponse | { error: string };
        if (!alive) return;
        if ("error" in json) setError(json.error);
        else setStats(json);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) return <p className="text-sm text-rose-400">Network stats unavailable: {error}</p>;
  const leaves = stats?.leafCounts ? Object.values(stats.leafCounts).reduce((a, b) => a + b, 0) : null;
  const online = stats?.onlineStakeMicroAlgos ? BigInt(stats.onlineStakeMicroAlgos) : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Last round" value={stats ? Number(stats.lastRound).toLocaleString() : "…"} sub={stats?.network.toUpperCase()} />
        <Stat label="Online stake" value={online !== null ? `${microAlgosToAlgo(online, 0)} ALGO` : "…"} sub="securing consensus" />
        <Stat label="Commitments" value={leaves ?? "—"} sub={stats?.appId ? `app ${stats.appId}` : "app not deployed"} />
        <Stat label="Hot wallets activated" value={stats?.totalClaims ?? "—"} sub={stats?.postedRoots != null ? `${stats.postedRoots} roots posted` : undefined} />
      </div>
      {stats?.leafCounts && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-400">
          {TIERS.map((t) => (
            <span key={t.id} className="rounded-lg border border-white/10 px-2 py-1">
              <span style={{ color: t.color }}>{t.name}</span>: {stats.leafCounts?.[String(t.id)] ?? 0} anonymity-set size
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
