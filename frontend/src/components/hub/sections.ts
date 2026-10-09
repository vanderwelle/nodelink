// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { Activity, Coins, Gift, Users, Wrench, type LucideIcon } from "lucide-react";

export type SectionId = "health" | "rewards" | "perks" | "setup" | "community";

export interface HubSection {
  readonly id: SectionId;
  readonly letter: "A" | "B" | "C" | "D" | "E";
  readonly href: `/${SectionId}`;
  readonly title: string;
  readonly short: string;
  readonly blurb: string;
  readonly icon: LucideIcon;
  /** Tailwind text colour for the section accent */
  readonly tone: string;
}

export const SECTIONS: readonly HubSection[] = [
  { id: "health", letter: "A", href: "/health", title: "Node health & alerts", short: "Health", blurb: "Online status, participation-key expiry, alerts", icon: Activity, tone: "text-emerald-400" },
  { id: "rewards", letter: "B", href: "/rewards", title: "Rewards & earnings", short: "Rewards", blurb: "Proposals, payouts, yield", icon: Coins, tone: "text-amber-400" },
  { id: "perks", letter: "C", href: "/perks", title: "Perks & launchpad", short: "Perks", blurb: "Tier-gated partner perks", icon: Gift, tone: "text-violet-400" },
  { id: "setup", letter: "D", href: "/setup", title: "Node setup & management", short: "Setup", blurb: "Guides, key renewal, keyreg, catchup", icon: Wrench, tone: "text-sky-400" },
  { id: "community", letter: "E", href: "/community", title: "Community & leaderboard", short: "Community", blurb: "News, leaderboard, public profiles", icon: Users, tone: "text-rose-400" },
];

export function getSection(id: SectionId): HubSection {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown section ${id}`);
  return s;
}
