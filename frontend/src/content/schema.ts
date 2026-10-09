// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import type { TierId } from "@nodelink/shared";

/**
 * Content schemas for NodeLink's config-driven registries.
 * Edit the registries (perks.ts, rewards-programs.ts, news.ts) — see /CONTENT.md.
 * Everything here ships in the public JS bundle: never put secrets or private codes in it.
 */

export type ContentStatus = "upcoming" | "live" | "ended";

/** ISO date ("2026-11-01") or date-time ("2026-11-01T12:00:00Z"). */
export type IsoDate = string;

// ---- perks ---------------------------------------------------------------------------------

export const PERK_CATEGORIES = ["defi", "airdrop", "whitelist", "boost", "governance", "tool", "merch", "other"] as const;
export type PerkCategory = (typeof PERK_CATEGORIES)[number];

export const PERK_CATEGORY_LABEL: Record<PerkCategory, string> = {
  defi: "DeFi",
  airdrop: "Airdrop",
  whitelist: "Whitelist",
  boost: "Boost",
  governance: "Governance",
  tool: "Tool",
  merch: "Merch",
  other: "Other",
};

export type PerkClaim =
  /** Open the partner's page from the badge-holding wallet. */
  | { readonly type: "link"; readonly url: string; readonly label?: string }
  /** Claimed by an on-chain call that checks the NodeLink hot-wallet status box. */
  | { readonly type: "onchain"; readonly appId: number; readonly network: "testnet" | "mainnet"; readonly url?: string; readonly label?: string }
  /** Partner issues a code after verifying the badge. NEVER put the code itself here — it would be public. */
  | { readonly type: "code"; readonly instructions: string; readonly url?: string; readonly label?: string };

export interface Perk {
  /** unique, kebab-case, stable (used in URLs: /perks?perk=<id>) */
  readonly id: string;
  readonly partner: string;
  readonly title: string;
  /** one or two sentences shown on the card */
  readonly summary: string;
  /** optional longer text for the detail view (plain text, blank lines = paragraphs) */
  readonly description?: string;
  readonly category: PerkCategory;
  /** lowest NodeLink tier that unlocks it (1 Scout … 5 Millionaire) */
  readonly minTier: TierId;
  readonly status: ContentStatus;
  readonly start?: IsoDate;
  readonly end?: IsoDate;
  readonly claim: PerkClaim;
  /** partner homepage */
  readonly url?: string;
  /** square logo: absolute https URL or a file in /public (e.g. "/partners/acme.svg") */
  readonly logo?: string;
  /** set only on demo entries; hidden unless NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT=1 */
  readonly example?: true;
}

// ---- rewards programs ----------------------------------------------------------------------

export const PROGRAM_TYPES = ["proposer-payouts", "partner-boost", "tier-multiplier", "campaign"] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_TYPE_LABEL: Record<ProgramType, string> = {
  "proposer-payouts": "Proposer payouts",
  "partner-boost": "Partner boost",
  "tier-multiplier": "Tier multiplier",
  campaign: "Campaign",
};

export interface ProgramSchedule {
  readonly start?: IsoDate;
  readonly end?: IsoDate;
  /** how often rewards are distributed, e.g. "per block", "weekly", "once at end" */
  readonly cadence?: string;
}

export interface RewardsProgram {
  readonly id: string;
  readonly name: string;
  readonly type: ProgramType;
  readonly summary: string;
  readonly description?: string;
  readonly status: ContentStatus;
  readonly schedule: ProgramSchedule;
  /** multiplier per tier, e.g. { 1: 1, 2: 1.25 }; omit tiers that are not eligible */
  readonly tierMultipliers?: Partial<Record<TierId, number>>;
  /** who funds / computes it + where to verify */
  readonly source: { readonly name: string; readonly url?: string };
  /** what is paid out, e.g. "ALGO", "USDC", "points" */
  readonly rewardAsset?: string;
  readonly logo?: string;
  readonly example?: true;
}

// ---- news ----------------------------------------------------------------------------------

export interface NewsItem {
  readonly id: string;
  readonly date: IsoDate;
  readonly title: string;
  readonly body: string;
  readonly tag?: string;
  readonly url?: string;
  readonly example?: true;
}

// ---- helpers -------------------------------------------------------------------------------

export const SHOW_EXAMPLES = process.env.NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT === "1";

function ts(date: IsoDate | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : t;
}

/** Status after applying dates: a "live" item past its end date reads as ended, etc. */
export function effectiveStatus(item: { status: ContentStatus; start?: IsoDate; end?: IsoDate }, now = Date.now()): ContentStatus {
  const start = ts(item.start);
  const end = ts(item.end);
  if (item.status === "ended" || (end !== null && end < now)) return "ended";
  if (item.status === "upcoming" && start !== null && start <= now) return "live";
  return item.status;
}

export function formatDate(date: IsoDate | undefined): string | null {
  const t = ts(date);
  return t === null ? null : new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Build-time validation: pages are prerendered, so a bad entry fails `next build` (and the
 * Vercel deploy) with a readable message instead of shipping broken content.
 */
export function validateRegistry<T extends { id: string; example?: true }>(name: string, items: readonly T[], check: (item: T) => string[]): readonly T[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) errors.push(`${item.id}: id must be kebab-case`);
    if (seen.has(item.id)) errors.push(`${item.id}: duplicate id`);
    seen.add(item.id);
    for (const e of check(item)) errors.push(`${item.id}: ${e}`);
  }
  if (errors.length) throw new Error(`Invalid ${name} registry:\n  - ${errors.join("\n  - ")}`);
  return items.filter((i) => !i.example || SHOW_EXAMPLES);
}

export function checkDates(item: { start?: IsoDate; end?: IsoDate }): string[] {
  const out: string[] = [];
  if (item.start !== undefined && ts(item.start) === null) out.push(`bad start date "${item.start}"`);
  if (item.end !== undefined && ts(item.end) === null) out.push(`bad end date "${item.end}"`);
  const s = ts(item.start);
  const e = ts(item.end);
  if (s !== null && e !== null && e < s) out.push("end is before start");
  return out;
}

export function checkUrl(url: string | undefined, field: string): string[] {
  if (url === undefined) return [];
  if (url.startsWith("/")) return [];
  try {
    return new URL(url).protocol === "https:" ? [] : [`${field} must be https`];
  } catch {
    return [`${field} is not a valid URL`];
  }
}
