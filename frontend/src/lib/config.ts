import { NETWORKS, type NetworkId } from "@nodelink/shared";

function parseNetwork(value: string | undefined): NetworkId {
  // NodeLink frontend is TestNet-first; MainNet is intentionally not selectable.
  return value === "localnet" ? "localnet" : "testnet";
}

function parseAppId(value: string | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export const NETWORK: NetworkId = parseNetwork(process.env.NEXT_PUBLIC_NETWORK);
export const ENDPOINTS = NETWORKS[NETWORK];
export const APP_ID: bigint | null = parseAppId(process.env.NEXT_PUBLIC_APP_ID);

export const ZK_ARTIFACTS = {
  wasm: "/zk/node_membership.wasm",
  zkey: "/zk/node_membership_final.zkey",
} as const;

/** Approximate block time used for "expires in" estimates. */
export const SECONDS_PER_ROUND = 2.8;

export function explorerTx(txId: string): string {
  return `${ENDPOINTS.explorer}/transaction/${txId}`;
}
export function explorerAccount(address: string): string {
  return `${ENDPOINTS.explorer}/account/${address}`;
}
export function explorerApp(appId: bigint): string {
  return `${ENDPOINTS.explorer}/application/${appId.toString()}`;
}
