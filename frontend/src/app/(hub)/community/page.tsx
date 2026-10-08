"use client";

import { getTier, isTierId, microAlgosToAlgo } from "@nodelink/shared";
import { ArrowRight, Newspaper, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveTag, SectionHeader } from "@/components/hub/HubTabs";
import { getSection } from "@/components/hub/sections";
import { NetworkStats } from "@/components/NetworkStats";
import { ProfileToggle } from "@/components/ProfileToggle";
import { RankBadge } from "@/components/RankBadge";
import { NEWS } from "@/content/news";
import { formatDate } from "@/content/schema";
import { fetchPublicProfile } from "@/lib/chain";
import { useLeaderboard } from "@/lib/leaderboard";
import { shortAddress } from "@/lib/format";
import { useNode } from "@/lib/node";

const S = getSection("community");

export default function CommunityPage() {
  const node = useNode(60_000);
  const { entries, error } = useLeaderboard();
  const [publicCold, setPublicCold] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!node.activeAddress) return;
    fetchPublicProfile(node.activeAddress).then(setPublicCold).catch(() => setPublicCold(null));
  }, [node.activeAddress, tick]);

  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub="Ecosystem news, the opt-in leaderboard and network stats." icon={S.icon} tone={S.tone} />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          <Newspaper className="h-4 w-4" /> News
        </h2>
        {NEWS.length === 0 ? (
          <p className="card p-4 text-sm text-gray-400">No news yet — updates from NodeLink and partners will appear here.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {NEWS.map((n) => (
              <article key={n.id} className="card p-4">
                <div className="flex items-center gap-2 text-xs">
                  {n.tag && <span className="text-rose-300">{n.tag}</span>}
                  <span className="text-gray-500">{formatDate(n.date)}</span>
                </div>
                <h3 className="mt-0.5 font-medium text-white">{n.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{n.body}</p>
                {n.url && (
                  <a className="mt-2 inline-block text-xs text-accent" href={n.url} target="_blank" rel="noreferrer">
                    Read more
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-white">
            <Trophy className="h-4 w-4 text-amber-400" /> Leaderboard
          </h2>
          <LiveTag />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {entries === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
        {entries?.length === 0 && <p className="text-sm text-gray-400">No public profiles yet — node runners appear here only if they opt in.</p>}
        <ol className="space-y-2">
          {entries?.slice(0, 5).map((e, i) => (
            <li key={e.hot} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-gray-500">{i + 1}</span>
              {isTierId(e.tier) && <RankBadge tier={e.tier} size="sm" />}
              <span className="min-w-0 flex-1 truncate font-mono text-gray-300">{shortAddress(e.cold, 5)}</span>
              <span className="text-gray-400">{microAlgosToAlgo(BigInt(e.coldBalanceMicroAlgos), 0)} ALGO</span>
              {isTierId(e.tier) && <span className="hidden sm:inline" style={{ color: getTier(e.tier).color }}>{getTier(e.tier).name}</span>}
            </li>
          ))}
        </ol>
        <Link href="/leaderboard" className="mt-4 inline-flex items-center gap-1 text-sm text-accent">
          Full leaderboard <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {node.activeAddress && (
        <ProfileToggle hot={node.activeAddress} session={node.session} publicCold={publicCold} active={node.tier !== null} onChanged={() => setTick((x) => x + 1)} />
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Network</h2>
        <NetworkStats />
      </section>
    </div>
  );
}
