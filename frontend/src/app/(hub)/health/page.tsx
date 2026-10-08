"use client";

import { Clock, ExternalLink, Gauge, HeartPulse, KeyRound, RefreshCw, Server, ShieldCheck, Wifi } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveTag, Placeholder, SectionHeader } from "@/components/hub/HubTabs";
import { NodePicker } from "@/components/hub/NodePicker";
import { getSection } from "@/components/hub/sections";
import { RankBadge } from "@/components/RankBadge";
import { Notice, Stat } from "@/components/ui";
import { algod } from "@/lib/chain";
import { explorerAccount } from "@/lib/config";
import { formatAlgo, roundsAgo, roundsToDuration } from "@/lib/format";
import { evaluateHealth, SEVERITY_STYLE, useNode } from "@/lib/node";

const S = getSection("health");

function useNetworkPulse(): { round: bigint; secondsSince: number } | null {
  const [pulse, setPulse] = useState<{ round: bigint; ts: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const s = await algod.status().do();
        if (alive) setPulse({ round: s.lastRound, ts: Date.now() - Number(s.timeSinceLastRound / 1_000_000n) });
      } catch {
        /* network pulse is best-effort */
      }
    };
    void load();
    const a = setInterval(() => void load(), 10_000);
    const b = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      alive = false;
      clearInterval(a);
      clearInterval(b);
    };
  }, []);
  return pulse ? { round: pulse.round, secondsSince: Math.max(0, (now - pulse.ts) / 1000) } : null;
}

export default function HealthPage() {
  const node = useNode(20_000);
  const pulse = useNetworkPulse();
  const t = node.telemetry;
  const alerts = t ? evaluateHealth(t) : [];
  const keyLeft = t?.voteLastValid != null ? t.voteLastValid - t.round : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={S.title}
        sub="Live consensus status of your node account from public chain data."
        icon={S.icon}
        tone={S.tone}
        right={
          node.nodeAddress ? (
            <button className="btn-ghost" onClick={() => void node.refresh()} disabled={node.loading}>
              <RefreshCw className={`h-4 w-4 ${node.loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          ) : undefined
        }
      />

      <NodePicker node={node} />
      {node.error && <Notice tone="warn" title="Could not load node data">{node.error}</Notice>}

      {t && (
        <>
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Alerts <LiveTag />
            </div>
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.title} className={`flex gap-3 rounded-xl border p-3 ${SEVERITY_STYLE[a.severity].border}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLE[a.severity].dot}`} />
                  <div>
                    <div className={`text-sm font-medium ${SEVERITY_STYLE[a.severity].text}`}>{a.title}</div>
                    <div className="text-xs text-gray-400">{a.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Consensus"
              value={<span className={t.status === "Online" ? "text-emerald-400" : "text-amber-400"}>{t.status}</span>}
              sub={t.incentiveEligible ? "incentive eligible" : "not incentive eligible"}
            />
            <Stat
              label="Part. key expiry"
              value={keyLeft !== null ? roundsToDuration(keyLeft) : "—"}
              sub={t.voteLastValid != null ? `round ${t.voteLastValid.toString()}` : "no key registered"}
            />
            <Stat label="Last proposal" value={t.lastProposed ? roundsAgo(t.round - t.lastProposed) : "—"} sub={t.lastProposed ? `round ${t.lastProposed.toString()}` : "none recorded"} />
            <Stat label="Last heartbeat" value={t.lastHeartbeat ? roundsAgo(t.round - t.lastHeartbeat) : "—"} sub={t.lastHeartbeat ? `round ${t.lastHeartbeat.toString()}` : "none recorded"} />
          </section>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span>Balance {formatAlgo(t.balance)}</span>
            <a className="inline-flex items-center gap-1 text-accent" href={explorerAccount(t.address)} target="_blank" rel="noreferrer">
              account on Lora <ExternalLink className="h-3 w-3" />
            </a>
            <Link href="/setup" className="inline-flex items-center gap-1 text-accent">
              <KeyRound className="h-3 w-3" /> renew key / keyreg
            </Link>
          </div>
        </>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> Network sync</span>
            <LiveTag />
          </div>
          <div className="text-xl font-semibold text-white">{pulse ? `#${pulse.round.toLocaleString()}` : "…"}</div>
          <div className="mt-1 text-xs text-gray-400">{pulse ? `last block ${pulse.secondsSince.toFixed(1)} s ago (Nodely)` : "connecting to Nodely"}</div>
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> Uptime (30d)</span>
            <Placeholder />
          </div>
          <div className="text-xl font-semibold text-gray-500">—</div>
          <div className="mt-1 text-xs text-gray-500">Needs the NodeLink node agent (reports your algod&apos;s sync + uptime). Not available yet.</div>
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span className="flex items-center gap-1"><HeartPulse className="h-3.5 w-3.5" /> Push alerts</span>
            <Placeholder />
          </div>
          <div className="text-xl font-semibold text-gray-500">Off</div>
          <div className="mt-1 text-xs text-gray-500">Phone notifications for key expiry / going offline are planned. Alerts above update live while this page is open.</div>
        </div>
      </section>

      {node.activeAddress && (
        <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
              <ShieldCheck className="h-3.5 w-3.5" /> NodeLink badge (connected wallet)
            </div>
            {node.tier ? (
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <RankBadge tier={node.tier} />
                {node.hotStatus && t && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" /> expires in {roundsToDuration(node.hotStatus.expiryRound - t.round)}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-400">{node.hotStatus ? "Badge expired." : "No badge on this wallet."} Badges unlock tier perks without exposing your node wallet.</p>
            )}
          </div>
          {!node.tier && (
            <Link href="/link" className="btn-ghost shrink-0 text-xs">
              Get a private badge
            </Link>
          )}
        </section>
      )}

      {!t && !node.nodeAddress && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Server className="h-3.5 w-3.5" /> Don&apos;t run a node yet? <Link href="/start-node" className="text-accent underline">Start one</Link>.
        </p>
      )}
    </div>
  );
}
