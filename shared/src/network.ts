export type NetworkId = "testnet" | "localnet";

export interface NetworkEndpoints {
  readonly algod: string;
  readonly indexer: string;
  readonly explorer: string;
}

/** Nodely public endpoints (no token required). NodeLink never targets mainnet. */
export const NETWORKS: Record<NetworkId, NetworkEndpoints> = {
  testnet: {
    algod: "https://testnet-api.4160.nodely.dev",
    indexer: "https://testnet-idx.4160.nodely.dev",
    explorer: "https://lora.algokit.io/testnet",
  },
  localnet: {
    algod: "http://localhost:4001",
    indexer: "http://localhost:8980",
    explorer: "https://lora.algokit.io/localnet",
  },
};
