// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { tierForBalance, type HotStatus, type TierId } from "@nodelink/shared";
import { useWallet } from "@txnlab/use-wallet-react";
import algosdk from "algosdk";
import { useCallback, useEffect, useState } from "react";
import { currentRound, fetchMyStatus, type ColdTelemetry } from "./chain";
import { APP_ID } from "./config";
import { fetchNodeTelemetry, friendlyTelemetryError, type NodeTelemetry } from "./telemetry";
import { loadSession, type LinkSession } from "./session";

/**
 * Where the hub's node address comes from. Everything here stays in this browser:
 *  - "session": cold address from the private hot↔cold link (Link Wizard / encrypted backup)
 *  - "watch":   a node address the user chose to monitor (public chain data only)
 */
export type NodeSource = "session" | "watch";

const WATCH_KEY = `nodelink:v1:${APP_ID?.toString() ?? "none"}:watch`;
const WATCH_EVENT = "nodelink:watch-changed";

export function loadWatchAddress(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(WATCH_KEY);
  return v && algosdk.isValidAddress(v) ? v : null;
}

export function saveWatchAddress(address: string | null): void {
  if (address === null) window.localStorage.removeItem(WATCH_KEY);
  else {
    if (!algosdk.isValidAddress(address)) throw new Error("Not a valid Algorand address");
    window.localStorage.setItem(WATCH_KEY, address);
  }
  window.dispatchEvent(new Event(WATCH_EVENT));
}

export interface NodeContext {
  /** false until the wallet manager has restored sessions and localStorage was read */
  readonly ready: boolean;
  readonly activeAddress: string | null;
  readonly session: LinkSession | null;
  readonly nodeAddress: string | null;
  readonly source: NodeSource | null;
  /** read-only node data from the TELEMETRY network (MainNet in production); kept when a refresh fails */
  readonly telemetry: NodeTelemetry | null;
  /** ms timestamp of the last successful telemetry read */
  readonly telemetryAt: number | null;
  /**
   * Tier the watched node's TELEMETRY-network balance would qualify for — an ESTIMATE only.
   * It is not a NodeLink badge; the real badge is `tier` (TestNet contract).
   */
  readonly estimatedTier: TierId | null;
  /** NodeLink on-chain status of the connected (hot) wallet — CONTRACT network (TestNet) */
  readonly hotStatus: HotStatus | null;
  /** current round on the CONTRACT network (TestNet) — use for badge expiry, never the telemetry round */
  readonly contractRound: bigint | null;
  /** on-chain badge tier, only while the hot status is unexpired (compared against the TestNet round) */
  readonly tier: TierId | null;
  readonly loading: boolean;
  /** friendly telemetry error (rate limit / unavailable / not found) */
  readonly error: string | null;
  /** contract (TestNet) read error */
  readonly contractError: string | null;
  readonly refresh: () => Promise<void>;
}

/** Shared state for every hub section: connected wallet, private link, watched node + live telemetry. */
export function useNode(pollMs = 30_000): NodeContext {
  const { activeAddress, isReady } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [watch, setWatch] = useState<string | null>(null);
  const [session, setSession] = useState<LinkSession | null>(null);
  const [telemetry, setTelemetry] = useState<NodeTelemetry | null>(null);
  const [telemetryAt, setTelemetryAt] = useState<number | null>(null);
  const [hotStatus, setHotStatus] = useState<HotStatus | null>(null);
  const [contractRound, setContractRound] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const sync = (): void => setWatch(loadWatchAddress());
    sync();
    window.addEventListener(WATCH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WATCH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    setSession(activeAddress ? loadSession(activeAddress) : null);
  }, [activeAddress]);

  const nodeAddress = session?.coldAddress ?? watch;
  const source: NodeSource | null = session ? "session" : watch ? "watch" : null;

  const refresh = useCallback(async () => {
    if (!nodeAddress && !activeAddress) {
      setTelemetry(null);
      setHotStatus(null);
      return;
    }
    setLoading(true);
    // Telemetry (MainNet, read-only) and contract state (TestNet) fail independently.
    const tel = nodeAddress
      ? fetchNodeTelemetry(nodeAddress).then(
          (t) => {
            setTelemetry(t);
            setTelemetryAt(Date.now());
            setError(null);
          },
          (err: unknown) => {
            // keep the last good data on screen; just flag the problem
            setTelemetry((prev) => (prev && prev.address === nodeAddress ? prev : null));
            setError(friendlyTelemetryError(err));
          },
        )
      : Promise.resolve().then(() => {
          setTelemetry(null);
          setError(null);
        });
    const contract = activeAddress
      ? Promise.all([fetchMyStatus(activeAddress), currentRound()]).then(
          ([st, r]) => {
            setHotStatus(st);
            setContractRound(r);
            setContractError(null);
          },
          (err: unknown) => setContractError(err instanceof Error ? err.message : String(err)),
        )
      : Promise.resolve().then(() => setHotStatus(null));
    await Promise.all([tel, contract]);
    setLoading(false);
  }, [nodeAddress, activeAddress]);

  useEffect(() => {
    if (!mounted) return;
    void refresh();
    // Poll only while the tab is visible (saves Nodely quota); refresh immediately on return.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs);
    const onVis = (): void => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mounted, refresh, pollMs]);

  const active = hotStatus !== null && (contractRound === null || hotStatus.expiryRound > contractRound);
  return {
    ready: mounted && isReady,
    activeAddress: activeAddress ?? null,
    session,
    nodeAddress,
    source,
    telemetry: telemetry && telemetry.address === nodeAddress ? telemetry : null,
    telemetryAt,
    estimatedTier: telemetry ? (tierForBalance(telemetry.balance)?.id ?? null) : null,
    hotStatus,
    contractRound,
    tier: hotStatus && active ? hotStatus.tier : null,
    loading,
    error,
    contractError,
    refresh,
  };
}

// ---- health evaluation -------------------------------------------------------------------

/** Algorand consensus incentives: eligible stake range for proposer payouts (in microAlgos). */
export const INCENTIVE_MIN = 30_000_000_000n;
export const INCENTIVE_MAX = 70_000_000_000_000n;

export type Severity = "critical" | "warn" | "info" | "ok";

export interface HealthAlert {
  readonly severity: Severity;
  readonly title: string;
  readonly body: string;
}

const ROUNDS_PER_DAY = 30_857n; // ~2.8 s rounds

export function evaluateHealth(t: ColdTelemetry): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  if (t.status !== "Online") {
    alerts.push({ severity: "critical", title: "Account is not online", body: "Your stake is not participating in consensus. Register participation keys and send an online keyreg." });
  }
  if (t.voteLastValid !== null) {
    const left = t.voteLastValid - t.round;
    if (left <= 0n) alerts.push({ severity: "critical", title: "Participation key expired", body: "Generate a new key and send keyreg — your account cannot vote." });
    else if (left < ROUNDS_PER_DAY * 3n) alerts.push({ severity: "critical", title: "Participation key expires in < 3 days", body: "Renew now: addpartkey on the node, then keyreg from your cold wallet." });
    else if (left < ROUNDS_PER_DAY * 14n) alerts.push({ severity: "warn", title: "Participation key expires in < 14 days", body: "Plan a key rotation soon to avoid going offline." });
  } else if (t.status === "Online") {
    alerts.push({ severity: "warn", title: "No participation key info", body: "Algod did not report a vote-last-valid round for this account." });
  }
  if (t.status === "Online" && !t.incentiveEligible) {
    alerts.push({ severity: "info", title: "Not incentive eligible", body: "Proposer payouts require a 2 ALGO keyreg fee when going online (and 30k–70M ALGO stake)." });
  }
  if (t.status === "Online" && (t.balance < INCENTIVE_MIN || t.balance > INCENTIVE_MAX)) {
    alerts.push({ severity: "info", title: "Stake outside payout range", body: "Proposer payouts apply to accounts holding 30,000 – 70,000,000 ALGO." });
  }
  if (alerts.length === 0) alerts.push({ severity: "ok", title: "All checks passed", body: "Online, key valid for 14+ days, incentive eligible." });
  return alerts;
}

export function worstSeverity(alerts: readonly HealthAlert[]): Severity {
  for (const s of ["critical", "warn", "info"] as const) if (alerts.some((a) => a.severity === s)) return s;
  return "ok";
}

export const SEVERITY_STYLE: Record<Severity, { text: string; dot: string; border: string }> = {
  critical: { text: "text-rose-400", dot: "bg-rose-400", border: "border-rose-400/30 bg-rose-400/5" },
  warn: { text: "text-amber-400", dot: "bg-amber-400", border: "border-amber-400/30 bg-amber-400/5" },
  info: { text: "text-sky-400", dot: "bg-sky-400", border: "border-sky-400/30 bg-sky-400/5" },
  ok: { text: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-400/30 bg-emerald-400/5" },
};
