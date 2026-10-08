export interface NewsItem {
  readonly date: string;
  readonly title: string;
  readonly body: string;
}

/** Sample feed — replace with a CMS/RSS source. */
export const NEWS: readonly NewsItem[] = [
  { date: "TestNet", title: "NodeLink protocol live on TestNet", body: "Deposit a commitment from your node wallet and activate a hot wallet with an in-browser zero-knowledge proof." },
  { date: "Guide", title: "Consensus incentives for node runners", body: "Online, incentive-eligible accounts can earn block-proposal payouts. NodeLink's HUD tracks your proposals and heartbeats." },
  { date: "Security", title: "Your cold wallet stays cold", body: "NodeLink never asks for rekeys or delegated logic signatures. Hot wallets receive read-only status, nothing more." },
];

export interface Partner {
  readonly name: string;
  readonly category: string;
}

/** Placeholder partner integrations (no partnerships implied). */
export const PARTNERS: readonly Partner[] = [
  { name: "Example DEX", category: "DeFi" },
  { name: "Example LST", category: "Liquid staking" },
  { name: "Example Launchpad", category: "Launches" },
  { name: "Example DAO", category: "Governance" },
  { name: "Example Protocol", category: "Airdrops" },
  { name: "Example Desk", category: "OTC" },
];
