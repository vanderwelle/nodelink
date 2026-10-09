// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { NETWORKS, type NetworkId } from "@nodelink/shared";

/*
 * Two separate networks:
 *  - CONTRACT network (NEXT_PUBLIC_NETWORK): the NodeLink app, wallets and every transaction.
 *    TestNet or LocalNet only — MainNet is not representable here.
 *  - TELEMETRY network (NEXT_PUBLIC_TELEMETRY_NETWORK): read-only node data (health, rewards, setup
 *    commands). May be MainNet. Telemetry code has no signer and only issues GET requests.
 */

function parseNetwork(value: string | undefined): NetworkId {
  // MainNet is intentionally not selectable for the contract network.
  return value === "localnet" ? "localnet" : "testnet";
}

function parseAppId(value: string | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export const NETWORK: NetworkId = parseNetwork(process.env.NEXT_PUBLIC_NETWORK);
export const ENDPOINTS = NETWORKS[NETWORK];
export const APP_ID: bigint | null = parseAppId(process.env.NEXT_PUBLIC_APP_ID);

// Hard guard #1: the contract endpoints can never point at MainNet.
if (/mainnet/i.test(`${ENDPOINTS.algod} ${ENDPOINTS.indexer}`)) {
  throw new Error("NodeLink refuses to run with MainNet contract endpoints.");
}

/** Genesis hashes used by the transaction guard (lib/guard.ts). */
export const GENESIS = {
  mainnet: { id: "mainnet-v1.0", hash: "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=" },
  testnet: { id: "testnet-v1.0", hash: "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=" },
} as const;

export type TelemetryNetwork = "mainnet" | "testnet" | "localnet";

export interface TelemetryEndpoints {
  readonly network: TelemetryNetwork;
  readonly label: string;
  /** primary first, then Nodely backup domains (used on 5xx / network errors, never on 429) */
  readonly algod: readonly string[];
  readonly indexer: readonly string[];
  readonly explorer: string;
  /** X-Algo-API-Token (LocalNet only) */
  readonly token?: string;
  /** catchpoint channel name for manual fast catchup */
  readonly catchpointChannel: "mainnet" | "testnet" | null;
}

function parseTelemetry(value: string | undefined): TelemetryNetwork {
  if (value === "mainnet" || value === "testnet" || value === "localnet") return value;
  return NETWORK;
}

export const TELEMETRY_NETWORK: TelemetryNetwork = parseTelemetry(process.env.NEXT_PUBLIC_TELEMETRY_NETWORK);

const nodely = (net: "mainnet" | "testnet", kind: "api" | "idx"): string[] => [
  `https://${net}-${kind}.4160.nodely.dev`,
  `https://${net}-${kind}.algonode.xyz`,
  `https://${net}-${kind}.algonode.network`,
];

export const TELEMETRY: TelemetryEndpoints =
  TELEMETRY_NETWORK === "localnet"
    ? { network: "localnet", label: "LocalNet", algod: [NETWORKS.localnet.algod], indexer: [NETWORKS.localnet.indexer], explorer: NETWORKS.localnet.explorer, token: "a".repeat(64), catchpointChannel: null }
    : {
        network: TELEMETRY_NETWORK,
        label: TELEMETRY_NETWORK === "mainnet" ? "MainNet" : "TestNet",
        algod: nodely(TELEMETRY_NETWORK, "api"),
        indexer: nodely(TELEMETRY_NETWORK, "idx"),
        explorer: `https://lora.algokit.io/${TELEMETRY_NETWORK}`,
        catchpointChannel: TELEMETRY_NETWORK,
      };

export const CONTRACT_LABEL = NETWORK === "localnet" ? "LocalNet" : "TestNet";

export const ZK_ARTIFACTS = {
  wasm: "/zk/node_membership.wasm",
  zkey: "/zk/node_membership_final.zkey",
} as const;

/** Approximate block time used for "expires in" estimates. */
export const SECONDS_PER_ROUND = 2.8;

/** Explorer links for the CONTRACT network (NodeLink transactions, app, badge wallets). */
export function explorerTx(txId: string): string {
  return `${ENDPOINTS.explorer}/transaction/${txId}`;
}
export function explorerAccount(address: string): string {
  return `${ENDPOINTS.explorer}/account/${address}`;
}
export function explorerApp(appId: bigint): string {
  return `${ENDPOINTS.explorer}/application/${appId.toString()}`;
}

/** Explorer links for the TELEMETRY network (watched node account, proposed blocks). */
export function telemetryExplorerAccount(address: string): string {
  return `${TELEMETRY.explorer}/account/${address}`;
}
export function telemetryExplorerBlock(round: bigint): string {
  return `${TELEMETRY.explorer}/block/${round.toString()}`;
}
