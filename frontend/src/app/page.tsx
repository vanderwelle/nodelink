"use client";

import { microAlgosToAlgo } from "@nodelink/shared";
import { ArrowRight, ChevronRight, Link2, Newspaper, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { StatsResponse } from "@/app/api/stats/route";
import { SECTIONS, type HubSection } from "@/components/hub/sections";
import { NEWS } from "@/data/content";
import { PERKS } from "@/data/perks";
import { roundsToDuration } from "@/lib/format";
import { useLeaderboard } from "@/lib/leaderboard";
import { evaluateHealth, SEVERITY_STYLE, useNode, worstSeverity, type NodeContext } from "@/lib/node";

function useStats(): StatsResponse | null {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      fetch("/api/stats")
        .then((r) => r.json() as Promise<StatsResponse | { error: string }>)
        .then((j) => alive && !("error" in j) && setStats(j))
        .catch(() => undefined);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return stats;
}

function tileStatus(id: HubSection["id"], node: NodeContext): { line: ReactNode; dot?: string } {
  const t = node.telemetry;
  const keyLeft = t?.voteLastValid != null ? t.voteLastValid - t.round : null;
  switch (id) {
    case "health": {
      if (!node.ready || (node.nodeAddress && !t)) return { line: "Loading…" };
      if (!t) return { line: "Add your node to start monitoring" };
      const sev = worstSeverity(evaluateHealth(t));
      return {
        dot: SEVERITY_STYLE[sev].dot,
        line: (
          <>
            <span className={t.status === "Online" ? "text-emerald-400" : "text-amber-400"}>{t.status}</span>
            {keyLeft !== null && <> · key {roundsToDuration(keyLeft).replace("~", "")}</>}
          </>
        ),
      };
    }
    case "rewards":
      if (!t) return { line: "Proposals, payouts, yield" };
      return { line: <>{microAlgosToAlgo(t.balance, 0)} ALGO · {t.lastProposed ? `proposed #${t.lastProposed.toString()}` : "no proposals yet"}</> };
    case "perks": {
      const unlocked = node.tier === null ? 0 : PERKS.filter((p) => node.tier !== null && node.tier >= p.minTier).length;
      return { line: node.tier === null ? `${PERKS.length} perks · badge required` : `${unlocked}/${PERKS.length} perks unlocked` };
    }
    case "setup":
      if (keyLeft !== null) return { line: <>Key renewal in {roundsToDuration(keyLeft).replace("~", "")}</>, dot: keyLeft < 30_857n * 14n ? "bg-amber-400" : undefined };
      return { line: "Guides, keyreg, catchup" };
    case "community":
      return { line: "News · leaderboard" };
  }
}

function SquareTile({ section, node }: { section: HubSection; node: NodeContext }) {
  const { href, title, short, blurb, icon: Icon, tone, letter } = section;
  const { line, dot } = tileStatus(section.id, node);
  return (
    <Link
      href={href}
      aria-label={title}
      className="card group relative flex aspect-square min-w-0 flex-col justify-between overflow-hidden p-4 transition hover:border-white/25 hover:bg-ink-800/80 sm:p-6"
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 sm:h-12 sm:w-12 ${tone}`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <span className="text-[10px] font-semibold tracking-widest text-gray-600">{letter}</span>
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-tight text-white sm:text-lg">
          <span className="sm:hidden">{short === "Setup" ? "Node setup" : short === "Health" ? "Node health" : short}</span>
          <span className="hidden sm:inline">{title}</span>
        </div>
        <p className="mt-0.5 hidden text-xs text-gray-500 sm:block">{blurb}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
          {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
          <span className="line-clamp-2">{line}</span>
        </div>
      </div>
      <ChevronRight className="absolute bottom-4 right-3 h-4 w-4 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300 sm:bottom-6 sm:right-5" />
    </Link>
  );
}

function CommunityBar({ section, stats }: { section: HubSection; stats: StatsResponse | null }) {
  const { entries } = useLeaderboard();
  const { href, title, icon: Icon, tone, letter } = section;
  return (
    <Link href={href} aria-label={title} className="card group col-span-2 flex min-w-0 items-center gap-4 p-4 transition hover:border-white/25 hover:bg-ink-800/80 sm:p-5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{title}</span>
          <span className="text-[10px] font-semibold tracking-widest text-gray-600">{letter}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
          <span className="flex min-w-0 items-center gap-1">
            <Newspaper className="h-3 w-3 shrink-0" /> <span className="truncate">{NEWS[0]?.title}</span>
          </span>
          <span className="flex items-center gap-1">
            <Trophy className="h-3 w-3 text-amber-400" /> {entries ? `${entries.length} public node runners` : "leaderboard"}
          </span>
          {stats?.totalClaims && <span>{stats.totalClaims} badges issued</span>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300" />
    </Link>
  );
}

export default function HubPage() {
  const node = useNode(30_000);
  const stats = useStats();
  const squares = SECTIONS.filter((s) => s.id !== "community");
  const community = SECTIONS.find((s) => s.id === "community");
  const online = stats?.onlineStakeMicroAlgos ? microAlgosToAlgo(BigInt(stats.onlineStakeMicroAlgos), 0) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="pt-2">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Your node, <span className="text-accent">all in one place.</span>
        </h1>
        <p className="mt-2 text-sm text-gray-400 sm:text-base">Health, rewards, perks, setup and community for Algorand node runners.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {stats ? `${stats.network.toUpperCase()} round ${Number(stats.lastRound).toLocaleString()}` : "connecting…"}
          </span>
          {online && <span>{online} ALGO online</span>}
        </div>
      </section>

      <section aria-label="NodeLink hub" className="grid grid-cols-2 gap-3 sm:gap-4">
        {squares.map((s) => (
          <SquareTile key={s.id} section={s} node={node} />
        ))}
        {community && <CommunityBar section={community} stats={stats} />}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-white/5 p-4 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 shrink-0" /> Keep your node wallet away from dApps with a private, zero-knowledge hot-wallet badge.
        </span>
        <Link href="/link" className="inline-flex shrink-0 items-center gap-1 text-gray-300 hover:text-white">
          Private link <ArrowRight className="h-3 w-3" />
        </Link>
      </section>
    </div>
  );
}
