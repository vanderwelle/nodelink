import { isTierId } from "@nodelink/shared";
import { checkDates, checkUrl, PROGRAM_TYPES, validateRegistry, type RewardsProgram } from "./schema";

/**
 * Rewards programs shown on /rewards (partner boosts, campaigns, tier multipliers…).
 * Live protocol proposer payouts are read from chain and need no entry here.
 * Add an object to PROGRAM_ENTRIES, push to main → live. See /CONTENT.md.
 */
const PROGRAM_ENTRIES: readonly RewardsProgram[] = [
  // Demo only — hidden unless NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT=1. Not a real program.
  {
    id: "example-tier-boost",
    name: "Example: tier boost campaign",
    type: "campaign",
    summary: "Demonstrates how a rewards program looks. Not a real program.",
    status: "upcoming",
    schedule: { start: "2027-01-01", end: "2027-03-31", cadence: "weekly" },
    tierMultipliers: { 1: 1, 2: 1.25, 3: 1.5, 4: 2, 5: 3 },
    source: { name: "Example Partner", url: "https://example.com" },
    rewardAsset: "points",
    example: true,
  },
];

export const REWARDS_PROGRAMS: readonly RewardsProgram[] = validateRegistry("rewards programs", PROGRAM_ENTRIES, (p) => [
  ...(PROGRAM_TYPES.includes(p.type) ? [] : [`unknown type "${p.type}"`]),
  ...(p.name.trim() && p.summary.trim() && p.source.name.trim() ? [] : ["name, summary and source.name are required"]),
  ...checkDates(p.schedule),
  ...checkUrl(p.source.url, "source.url"),
  ...checkUrl(p.logo, "logo"),
  ...Object.entries(p.tierMultipliers ?? {}).flatMap(([tier, m]) =>
    isTierId(Number(tier)) && typeof m === "number" && m > 0 ? [] : [`invalid tierMultipliers entry ${tier}: ${String(m)}`],
  ),
]);
