// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { checkDates, checkUrl, PERK_CATEGORIES, validateRegistry, type Perk } from "./schema";

/**
 * NodeLink perk registry. Add an object to PERK_ENTRIES, push to main → live on Vercel.
 * Schema + rules: ./schema.ts and /CONTENT.md.
 */
const PERK_ENTRIES: readonly Perk[] = [
  // Demo only — hidden unless NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT=1. Not a real partner.
  {
    id: "example-swap-rebate",
    partner: "Example Partner",
    title: "Example: swap-fee rebate",
    summary: "Demonstrates how a perk card looks. Not a real offer.",
    description: "This entry exists to preview the perk layout during development.\n\nIt is hidden in production.",
    category: "defi",
    minTier: 2,
    status: "upcoming",
    start: "2027-01-01",
    claim: { type: "link", url: "https://example.com", label: "Open partner" },
    example: true,
  },
];

export const PERKS: readonly Perk[] = validateRegistry("perks", PERK_ENTRIES, (p) => [
  ...(PERK_CATEGORIES.includes(p.category) ? [] : [`unknown category "${p.category}"`]),
  ...(p.title.trim() && p.partner.trim() && p.summary.trim() ? [] : ["title, partner and summary are required"]),
  ...checkDates(p),
  ...checkUrl(p.url, "url"),
  ...checkUrl(p.logo, "logo"),
  ...checkUrl(p.claim.url, "claim.url"),
  ...(p.claim.type === "onchain" && (!Number.isInteger(p.claim.appId) || p.claim.appId <= 0) ? ["claim.appId must be a positive integer"] : []),
]);
