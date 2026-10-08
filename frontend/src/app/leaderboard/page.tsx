"use client";

import { getTier, isTierId, microAlgosToAlgo } from "@nodelink/shared";
import { ExternalLink, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";
import { RankBadge } from "@/components/RankBadge";
import { Notice } from "@/components/ui";
import { explorerAccount } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [round, setRound] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json() as Promise<{ entries: LeaderboardEntry[]; round: string } | { error: string }>)
      .then((j) => {
        if ("error" in j) setError(j.error);
        else {
          setEntries(j.entries);
          setRound(BigInt(j.round));
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Trophy className="h-6 w-6 text-amber-400" /> Community leaderboard
        </h1>
        <p className="text-sm text-gray-400">Only node runners who explicitly made their profile public appear here.</p>
      </div>
      {error && <Notice tone="warn" title="Could not load leaderboard">{error}</Notice>}
      {entries === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {entries?.length === 0 && <Notice title="No public profiles yet">Be the first: toggle “Make Profile Public” in the Community tab.</Notice>}
      {entries && entries.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="p-4">#</th>
                <th className="p-4">Rank</th>
                <th className="p-4">Cold wallet</th>
                <th className="p-4">Hot wallet</th>
                <th className="p-4 text-right">Stake</th>
                <th className="p-4">Node</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const active = BigInt(e.expiryRound) > round;
                return (
                  <tr key={e.hot} className="border-t border-white/5">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4">
                      {isTierId(e.tier) ? (
                        <div className="flex items-center gap-2">
                          <RankBadge tier={e.tier} size="sm" />
                          <span style={{ color: getTier(e.tier).color }}>{getTier(e.tier).name}</span>
                          {!active && <span className="text-xs text-gray-500">(expired)</span>}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="p-4 font-mono">
                      <a className="inline-flex items-center gap-1 hover:text-accent" href={explorerAccount(e.cold)} target="_blank" rel="noreferrer">
                        {shortAddress(e.cold, 6)} <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="p-4 font-mono text-gray-400">{shortAddress(e.hot, 6)}</td>
                    <td className="p-4 text-right">{microAlgosToAlgo(BigInt(e.coldBalanceMicroAlgos), 0)} ALGO</td>
                    <td className={`p-4 ${e.coldOnline ? "text-emerald-400" : "text-amber-400"}`}>{e.coldOnline ? "Online" : "Offline"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
