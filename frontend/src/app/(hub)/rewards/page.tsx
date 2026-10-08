"use client";

import { microAlgosToAlgo } from "@nodelink/shared";
import { BarChart3, ExternalLink, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProgramsBrowser } from "@/components/content/ProgramsBrowser";
import { LiveTag, Placeholder, SectionHeader } from "@/components/hub/HubTabs";
import { NetPill } from "@/components/hub/NetPill";
import { NodePicker } from "@/components/hub/NodePicker";
import { getSection } from "@/components/hub/sections";
import { Notice, Stat } from "@/components/ui";
import { TELEMETRY, telemetryExplorerAccount, telemetryExplorerBlock } from "@/lib/config";
import { formatAlgo } from "@/lib/format";
import { useNode } from "@/lib/node";
import { fetchDailyProposals, fetchRecentProposals, ROUNDS_PER_DAY, type DayBin, type Proposal } from "@/lib/rewards";
import { friendlyTelemetryError } from "@/lib/telemetry";

const S = getSection("rewards");
const WINDOW_DAYS = 30;

export default function RewardsPage() {
  const node = useNode(60_000);
  const t = node.telemetry;
  const [days, setDays] = useState<DayBin[] | null>(null);
  const [recent, setRecent] = useState<Proposal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const round = t?.round ?? null;
  const addr = node.nodeAddress;

  useEffect(() => {
    if (!addr || round === null) return;
    let alive = true;
    setErr(null);
    fetchDailyProposals(addr, round, WINDOW_DAYS)
      .then(async (d) => {
        if (!alive) return;
        setDays(d);
        const r = await fetchRecentProposals(addr, round, d);
        if (alive) setRecent(r);
      })
      .catch((e: unknown) => alive && setErr(friendlyTelemetryError(e)));
    return () => {
      alive = false;
    };
    // refetch only when the address changes or every ~100 rounds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, round === null ? null : round / 100n]);

  // reset when switching node
  useEffect(() => {
    setDays(null);
    setRecent(null);
  }, [addr]);
  const proposalCount = days ? days.reduce((a, d) => a + d.count, 0) : null;
  const estimated = days?.some((d) => d.estimated) ?? false;
  const bins = useMemo(() => (days ? days.slice(0, 14).reverse() : null), [days]);
  const total = days?.reduce((a, d) => a + d.payout, 0n) ?? 0n;
  // windows are day-aligned, so the newest one is partial: annualize over the rounds actually covered
  const coveredDays = round !== null ? WINDOW_DAYS - 1 + Number(round % ROUNDS_PER_DAY) / Number(ROUNDS_PER_DAY) : WINDOW_DAYS;
  const realizedApr = days && t && t.balance > 0n ? (Number(total) / Number(t.balance)) * (365 / coveredDays) * 100 : null;
  const maxCount = bins ? Math.max(1, ...bins.map((b) => b.count)) : 1;

  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub={`Live ${TELEMETRY.label} proposer payouts for your node, plus partner reward programs.`} icon={S.icon} tone={S.tone} />
      <NodePicker node={node} compact />
      {node.error && <Notice tone="warn" title={t ? "Showing last known balance" : "Could not load node data"}>{node.error}</Notice>}
      {err && <Notice tone="warn" title={days ? "Showing last loaded proposals" : "Could not load proposals"}>{err}</Notice>}

      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
        <span>Protocol rewards</span>
        <NetPill kind="data" />
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Node balance" value={t ? formatAlgo(t.balance, 0) : "—"} sub={t ? (t.status === "Online" ? "online stake" : "offline") : "no node selected"} />
        <Stat label={`Proposals (${WINDOW_DAYS}d)`} value={proposalCount !== null ? `${estimated ? "≈" : ""}${proposalCount.toLocaleString()}` : addr ? "…" : "—"} sub={t?.lastProposed ? `last: round ${t.lastProposed.toString()}` : "none recorded"} />
        <Stat label={`Payouts (${WINDOW_DAYS}d)`} value={days ? `${estimated ? "≈" : ""}${microAlgosToAlgo(total, 2)} ALGO` : addr ? "…" : "—"} sub={estimated ? "estimated from a sample (very active node)" : "proposer payouts"} />
        <Stat
          label="Realized APR"
          value={realizedApr !== null ? `${realizedApr.toFixed(2)}%` : "—"}
          sub={realizedApr !== null ? `annualized from ${WINDOW_DAYS}d payouts` : "needs a node"}
        />
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <BarChart3 className="h-4 w-4 text-amber-400" /> Proposals per day (14d)
          </div>
          <span className="flex items-center gap-1.5">
            {bins ? <LiveTag /> : <Placeholder label={addr ? "loading" : "no node"} />}
            <NetPill kind="data" />
          </span>
        </div>
        <div className="flex h-32 items-end gap-1" aria-label="proposals per day chart">
          {(bins ?? Array.from({ length: 14 }, (_, i) => ({ daysAgo: 13 - i, count: 0, payout: 0n }))).map((b, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t ${bins ? "bg-amber-400/70" : "bg-white/10"}`}
              style={{ height: `${Math.max(3, (b.count / maxCount) * 100)}%` }}
              title={`${b.daysAgo}d ago: ${b.count} proposals${bins ? `, ${microAlgosToAlgo(b.payout, 3)} ALGO` : ""}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>14d ago</span>
          <span>{bins ? "today (so far)" : addr ? "loading…" : "Select a node above to see proposals"}</span>
        </div>
      </section>

      {recent && recent.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-medium text-white">
            <span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-400" /> Recent proposals</span>
            <NetPill kind="data" />
          </div>
          <ul className="divide-y divide-white/5 text-sm">
            {recent.map((p) => (
              <li key={p.round.toString()} className="flex items-center justify-between gap-2 px-4 py-2">
                <a className="inline-flex items-center gap-1 font-mono text-gray-300 hover:text-accent" href={telemetryExplorerBlock(p.round)} target="_blank" rel="noreferrer">
                  #{p.round.toString()} <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-xs text-gray-500">{new Date(p.timestamp * 1000).toLocaleDateString()}</span>
                <span className="text-amber-300">{p.payout > 0n ? `+${microAlgosToAlgo(p.payout, 3)}` : "0"} ALGO</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {proposalCount === 0 && (
        <Notice title={`No proposals in the last ${WINDOW_DAYS} days`}>
          Small stakes propose rarely — expected time between proposals scales with your share of online stake.
        </Notice>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="h-5 w-5 text-amber-400" /> Reward programs
            </h2>
            <p className="text-xs text-gray-400">Partner boosts, tier multipliers and campaigns for node runners. Tier = your on-chain NodeLink badge.</p>
          </div>
          <NetPill kind="contract" />
        </div>
        <ProgramsBrowser tier={node.tier} />
      </section>

      {t && (
        <a className="inline-flex items-center gap-1 text-xs text-accent" href={telemetryExplorerAccount(t.address)} target="_blank" rel="noreferrer">
          Full account history on Lora ({TELEMETRY.label}) <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
