"use client";

import { microAlgosToAlgo } from "@nodelink/shared";
import { BarChart3, ExternalLink, Percent, Trophy, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LiveTag, Placeholder, SectionHeader } from "@/components/hub/HubTabs";
import { NodePicker } from "@/components/hub/NodePicker";
import { getSection } from "@/components/hub/sections";
import { Notice, Stat } from "@/components/ui";
import { explorerAccount, ENDPOINTS } from "@/lib/config";
import { formatAlgo } from "@/lib/format";
import { useNode } from "@/lib/node";
import { fetchDailyProposals, type DayBin } from "@/lib/rewards";

const S = getSection("rewards");
const WINDOW_DAYS = 30;

export default function RewardsPage() {
  const node = useNode(60_000);
  const t = node.telemetry;
  const [days, setDays] = useState<DayBin[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const round = t?.round ?? null;
  const addr = node.nodeAddress;

  useEffect(() => {
    if (!addr || round === null) return;
    let alive = true;
    setErr(null);
    fetchDailyProposals(addr, round, WINDOW_DAYS)
      .then((d) => alive && setDays(d))
      .catch((e: unknown) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // refetch only when the address changes or every ~100 rounds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, round === null ? null : round / 100n]);

  // reset when switching node
  useEffect(() => setDays(null), [addr]);
  const proposals = useMemo(() => (days ? days.flatMap((d) => d.proposals) : null), [days]);
  const truncated = days?.some((d) => d.truncated) ?? false;
  const bins = useMemo(() => (days ? days.slice(0, 14).reverse() : null), [days]);
  const total = days?.reduce((a, d) => a + d.payout, 0n) ?? 0n;
  const realizedApr = days && t && t.balance > 0n ? (Number(total) / Number(t.balance)) * (365 / WINDOW_DAYS) * 100 : null;
  const maxCount = bins ? Math.max(1, ...bins.map((b) => b.count)) : 1;

  return (
    <div className="space-y-6">
      <SectionHeader title={S.title} sub="Block proposals and proposer payouts for your node account." icon={S.icon} tone={S.tone} />
      <NodePicker node={node} compact />
      {err && <Notice tone="warn" title="Could not load proposals">{err}</Notice>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Node balance" value={t ? formatAlgo(t.balance, 0) : "—"} sub={t ? (t.status === "Online" ? "online stake" : "offline") : "no node selected"} />
        <Stat label={`Proposals (${WINDOW_DAYS}d)`} value={proposals ? `${proposals.length.toLocaleString()}${truncated ? "+" : ""}` : addr ? "…" : "—"} sub={t?.lastProposed ? `last: round ${t.lastProposed.toString()}` : "none recorded"} />
        <Stat label={`Payouts (${WINDOW_DAYS}d)`} value={days ? `${microAlgosToAlgo(total, 2)} ALGO` : addr ? "…" : "—"} sub="proposer payouts" />
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
          {bins ? <LiveTag /> : <Placeholder label="sample" />}
        </div>
        <div className="flex h-32 items-end gap-1" aria-label="proposals per day chart">
          {(bins ?? Array.from({ length: 14 }, (_, i) => ({ daysAgo: 13 - i, count: [2, 4, 3, 5, 1, 4, 6, 3, 2, 5, 4, 3, 6, 4][i] ?? 1, payout: 0n }))).map((b, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t ${bins ? "bg-amber-400/70" : "bg-white/10"}`}
              style={{ height: `${Math.max(3, (b.count / (bins ? maxCount : 6)) * 100)}%` }}
              title={bins ? `${b.daysAgo}d ago: ${b.count} proposals, ${microAlgosToAlgo(b.payout, 3)} ALGO` : "sample data"}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>14d ago</span>
          <span>{bins ? "last 24h" : "Sample shape — select a node to see real data"}</span>
        </div>
      </section>

      {proposals && proposals.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-medium text-white">
            <span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-400" /> Recent proposals</span>
            <LiveTag />
          </div>
          <ul className="divide-y divide-white/5 text-sm">
            {proposals.slice(0, 10).map((p) => (
              <li key={p.round.toString()} className="flex items-center justify-between gap-2 px-4 py-2">
                <a className="inline-flex items-center gap-1 font-mono text-gray-300 hover:text-accent" href={`${ENDPOINTS.explorer}/block/${p.round.toString()}`} target="_blank" rel="noreferrer">
                  #{p.round.toString()} <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-xs text-gray-500">{new Date(p.timestamp * 1000).toLocaleDateString()}</span>
                <span className="text-amber-300">{p.payout > 0n ? `+${microAlgosToAlgo(p.payout, 3)}` : "0"} ALGO</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {proposals && proposals.length === 0 && (
        <Notice title={`No proposals in the last ${WINDOW_DAYS} days`}>
          Small stakes propose rarely — expected time between proposals scales with your share of online stake.
        </Notice>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Rewards history export</span>
            <Placeholder />
          </div>
          <p className="text-xs text-gray-500">CSV export of payouts for tax/accounting.</p>
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1"><Percent className="h-3.5 w-3.5" /> Projected APY</span>
            <Placeholder />
          </div>
          <p className="text-xs text-gray-500">Forward-looking APY from network payout rate and your stake share.</p>
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Tier multiplier earnings</span>
            <Placeholder />
          </div>
          <p className="text-xs text-gray-500">Partner rewards boosted by your NodeLink tier.</p>
        </div>
      </section>

      {t && (
        <a className="inline-flex items-center gap-1 text-xs text-accent" href={explorerAccount(t.address)} target="_blank" rel="noreferrer">
          Full account history on Lora <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
