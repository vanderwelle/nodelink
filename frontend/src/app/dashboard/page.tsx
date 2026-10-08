"use client";

import { getTier, isTierId, type HotStatus, type TierId } from "@nodelink/shared";
import { Activity, Clock, ExternalLink, Filter, Globe, Lock, RefreshCw, Server, Unlock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RankBadge } from "@/components/RankBadge";
import { RequireWallet } from "@/components/RequireWallet";
import { Notice, Stat, Toggle } from "@/components/ui";
import { PERKS, type PerkCategory } from "@/data/perks";
import { fetchColdTelemetry, fetchMyStatus, fetchPublicProfile, type ColdTelemetry } from "@/lib/chain";
import { explorerAccount, explorerTx } from "@/lib/config";
import { errorMessage, formatAlgo, roundsToDuration, shortAddress } from "@/lib/format";
import { sendHideProfile, sendRevealProfile } from "@/lib/protocol";
import { loadSession, type LinkSession } from "@/lib/session";

export default function DashboardPage() {
  return <RequireWallet title="Private HUD">{(hot) => <Hud hot={hot} />}</RequireWallet>;
}

function Hud({ hot }: { hot: string }) {
  const [session, setSession] = useState<LinkSession | null>(null);
  const [status, setStatus] = useState<HotStatus | null>(null);
  const [telemetry, setTelemetry] = useState<ColdTelemetry | null>(null);
  const [publicCold, setPublicCold] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const s = loadSession(hot);
    setSession(s);
    try {
      const [st, pub, tel] = await Promise.all([
        fetchMyStatus(hot),
        fetchPublicProfile(hot),
        s ? fetchColdTelemetry(s.coldAddress) : Promise.resolve(null),
      ]);
      setStatus(st);
      setPublicCold(pub);
      setTelemetry(tel);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [hot]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const round = telemetry?.round ?? null;
  const active = status !== null && round !== null ? status.expiryRound > round : status !== null;
  const tier: TierId | null = status && active ? status.tier : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Private HUD</h1>
          <p className="text-sm text-gray-400">
            Hot wallet <span className="font-mono">{shortAddress(hot, 6)}</span> · visible only in this browser
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <Notice tone="warn" title="Could not load data">{error}</Notice>}

      {!session && (
        <Notice tone="info" title="No private link in this browser">
          This hot wallet has no locally stored cold-wallet link. Run the <Link className="underline" href="/link">Link Wizard</Link>{" "}
          or re-import your encrypted backup there to restore the HUD telemetry.
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-6 md:col-span-1">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-500">On-chain rank (hot wallet)</div>
          {tier ? (
            <>
              <RankBadge tier={tier} size="lg" />
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <Clock className="h-3 w-3" />
                {status && round !== null ? `expires in ${roundsToDuration(status.expiryRound - round)} (round ${status.expiryRound})` : "active"}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">
              {status ? "Status expired — re-link to renew." : "No NodeLink status yet."}{" "}
              <Link href="/link" className="text-accent underline">Activate</Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-2">
          <Stat label="Cold balance" value={telemetry ? formatAlgo(telemetry.balance) : "—"} sub={session ? shortAddress(session.coldAddress, 6) : "not linked"} />
          <Stat
            label="Consensus status"
            value={
              telemetry ? (
                <span className={telemetry.status === "Online" ? "text-emerald-400" : "text-amber-400"}>{telemetry.status}</span>
              ) : "—"
            }
            sub={telemetry ? (telemetry.incentiveEligible ? "incentive eligible" : "not incentive eligible") : undefined}
          />
          <Stat label="Last proposed" value={telemetry?.lastProposed ? `#${telemetry.lastProposed.toString()}` : "—"} sub={telemetry?.lastHeartbeat ? `heartbeat #${telemetry.lastHeartbeat.toString()}` : "no heartbeat recorded"} />
          <Stat
            label="Part. key valid until"
            value={telemetry?.voteLastValid ? `#${telemetry.voteLastValid.toString()}` : "—"}
            sub={telemetry?.voteLastValid && round !== null ? roundsToDuration(telemetry.voteLastValid - round) : undefined}
          />
        </div>
      </div>

      {telemetry && session && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <Server className="h-3 w-3" /> Telemetry via Nodely algod · round {telemetry.round.toString()}
          <a className="flex items-center gap-1 text-accent" href={explorerAccount(session.coldAddress)} target="_blank" rel="noreferrer">
            cold account <ExternalLink className="h-3 w-3" />
          </a>
          {telemetry.status === "Online" && tier && telemetry.balance < getTier(tier).minMicroAlgos && (
            <span className="text-amber-400">Cold balance dropped below your {getTier(tier).name} threshold — your status will lapse at expiry.</span>
          )}
        </div>
      )}

      <ProfileToggle hot={hot} session={session} publicCold={publicCold} active={active} onChanged={() => void refresh()} />

      <Launchpad tier={tier} />
    </div>
  );
}

function ProfileToggle(props: { hot: string; session: LinkSession | null; publicCold: string | null; active: boolean; onChanged: () => void }) {
  const { hot, session, publicCold, active, onChanged } = props;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string; tx?: string } | null>(null);
  const isPublic = publicCold !== null;

  const toggle = async (next: boolean): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      if (next) {
        if (!session) throw new Error("No linked cold wallet in this browser.");
        const tx = await sendRevealProfile(hot, session.coldAddress);
        setMsg({ tone: "ok", text: "Profile is now public.", tx });
      } else {
        const tx = await sendHideProfile(hot);
        setMsg({ tone: "ok", text: "Profile hidden (historic transactions stay visible on-chain).", tx });
      }
      onChanged();
    } catch (err) {
      setMsg({ tone: "warn", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2 font-semibold text-white">
          <Globe className="h-4 w-4 text-accent" /> Make Profile Public
        </div>
        <p className="mt-1 max-w-2xl text-xs text-gray-400">
          Publishes <em>hot → cold</em> on-chain and lists you on the <Link href="/leaderboard" className="underline">leaderboard</Link>. This
          permanently breaks unlinkability for these wallets. Your cold wallet must co-sign (it pays the box deposit), so
          keep it connected in a second wallet app. No authority is granted to either wallet.
        </p>
        {msg && (
          <p className={`mt-2 text-xs ${msg.tone === "ok" ? "text-emerald-400" : "text-rose-400"}`}>
            {msg.text}{" "}
            {msg.tx && (
              <a className="underline" href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
                view tx
              </a>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">{isPublic ? "Public" : "Private"}</span>
        <Toggle checked={isPublic} onChange={(v) => void toggle(v)} disabled={busy || (!isPublic && (!active || !session))} label="Make profile public" />
      </div>
    </div>
  );
}

const CATEGORIES: readonly ("All" | PerkCategory)[] = ["All", "DeFi", "Airdrop", "Governance", "Tools"];

function Launchpad({ tier }: { tier: TierId | null }) {
  const [category, setCategory] = useState<"All" | PerkCategory>("All");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const perks = useMemo(
    () =>
      PERKS.filter((p) => (category === "All" || p.category === category) && (!eligibleOnly || (tier !== null && tier >= p.minTier))),
    [category, eligibleOnly, tier],
  );
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Activity className="h-5 w-5 text-accent" /> Ecosystem Launchpad
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1 text-xs ${category === c ? "bg-accent text-ink-950" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
            >
              {c}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} /> eligible only
          </label>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {perks.map((p) => {
          const unlocked = tier !== null && tier >= p.minTier;
          const req = isTierId(p.minTier) ? getTier(p.minTier) : null;
          return (
            <div key={p.id} className={`card flex flex-col p-5 ${unlocked ? "" : "opacity-60"}`}>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-gray-300">{p.category}</span>
                <span className="flex items-center gap-1" style={{ color: req?.color }}>
                  {unlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {req?.name}+
                </span>
              </div>
              <h3 className="font-semibold text-white">{p.title}</h3>
              <div className="text-xs text-gray-500">{p.partner}</div>
              <p className="mt-2 flex-1 text-sm text-gray-400">{p.description}</p>
              <button className="btn-ghost mt-4" disabled={!unlocked}>
                {unlocked ? p.cta : `Requires ${req?.name ?? "higher tier"}`}
              </button>
            </div>
          );
        })}
        {perks.length === 0 && <p className="text-sm text-gray-500">No perks match this filter.</p>}
      </div>
    </section>
  );
}
