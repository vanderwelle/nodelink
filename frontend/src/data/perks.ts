import type { TierId } from "@nodelink/shared";

export type PerkCategory = "DeFi" | "Airdrop" | "Governance" | "Tools";

export interface Perk {
  readonly id: string;
  readonly title: string;
  readonly partner: string;
  readonly category: PerkCategory;
  readonly minTier: TierId;
  readonly description: string;
  readonly cta: string;
}

/**
 * Illustrative perk catalogue. Partner names are placeholders (no partnerships implied);
 * wire this to a CMS / partner registry for production.
 */
export const PERKS: readonly Perk[] = [
  { id: "hud-alerts", title: "Node health alerts", partner: "NodeLink HUD", category: "Tools", minTier: 1, description: "Push alerts when your participation key nears expiry or your node misses heartbeats.", cta: "Enable alerts" },
  { id: "keygen-helper", title: "Key-rotation planner", partner: "NodeLink HUD", category: "Tools", minTier: 1, description: "Schedules addpartkey + keyreg windows so you never fall offline during rotation.", cta: "Open planner" },
  { id: "dex-fee-rebate", title: "10% swap-fee rebate", partner: "Example DEX", category: "DeFi", minTier: 2, description: "Verified node runners get a rebate on swap fees, claimable from the hot wallet.", cta: "Claim rebate" },
  { id: "lst-boost", title: "Liquid-staking APY boost", partner: "Example LST", category: "DeFi", minTier: 3, description: "Boosted rewards on liquid-staking pools for Pillar+ stakers.", cta: "View pool" },
  { id: "launch-wl", title: "Launchpad whitelist", partner: "Example Launchpad", category: "Airdrop", minTier: 2, description: "Guaranteed allocation slot in partner launches, no cold-wallet exposure.", cta: "Join whitelist" },
  { id: "node-airdrop", title: "Node-runner airdrop", partner: "Example Protocol", category: "Airdrop", minTier: 1, description: "Retroactive drop for verified consensus participants. Multiplier scales with tier.", cta: "Check eligibility" },
  { id: "gov-delegate", title: "Governance delegate badge", partner: "Example DAO", category: "Governance", minTier: 3, description: "Delegate-eligible badge and boosted voting weight in partner DAOs.", cta: "Get badge" },
  { id: "council-seat", title: "Sovereign council access", partner: "NodeLink", category: "Governance", minTier: 4, description: "Private forum + roadmap calls with protocol teams.", cta: "Request access" },
  { id: "otc-desk", title: "Priority OTC desk", partner: "Example Desk", category: "DeFi", minTier: 5, description: "White-glove OTC liquidity for Millionaire-tier stakers.", cta: "Contact desk" },
];
