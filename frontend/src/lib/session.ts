"use client";

import type { TierId } from "@nodelink/shared";
import { APP_ID } from "./config";

/**
 * Private, browser-local link between a hot wallet and its cold wallet.
 * This NEVER leaves the browser and is never written on-chain (unless the user opts in
 * to a public profile). Clearing site data removes it; the encrypted backup restores it.
 */
export interface LinkSession {
  readonly hotAddress: string;
  readonly coldAddress: string;
  readonly tier: TierId;
  readonly linkedAt: string;
  readonly claimTxId?: string;
}

const key = (hot: string): string => `nodelink:v1:${APP_ID?.toString() ?? "none"}:session:${hot}`;

function isSession(value: unknown): value is LinkSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.hotAddress === "string" && typeof v.coldAddress === "string" && typeof v.tier === "number";
}

export function loadSession(hot: string): LinkSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key(hot));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: LinkSession): void {
  window.localStorage.setItem(key(session.hotAddress), JSON.stringify(session));
}

export function clearSession(hot: string): void {
  window.localStorage.removeItem(key(hot));
}
