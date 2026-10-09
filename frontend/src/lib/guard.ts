// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import type algosdk from "algosdk";
import { GENESIS, NETWORK } from "./config";

/**
 * Hard guard: NodeLink must never build, sign or send a MainNet transaction.
 * Applied (1) to every transaction group before it reaches a wallet (lib/wallet.ts signerFor) and
 * (2) to the contract algod's genesis before any send (lib/protocol.ts).
 */
export class MainnetTransactionBlocked extends Error {
  constructor(detail: string) {
    super(`Blocked: NodeLink never signs or sends MainNet transactions (${detail}).`);
    this.name = "MainnetTransactionBlocked";
  }
}

const b64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
};

export function assertGenesisAllowed(genesisId: string | undefined, genesisHashB64: string): void {
  if (genesisHashB64 === GENESIS.mainnet.hash || genesisId === GENESIS.mainnet.id) {
    throw new MainnetTransactionBlocked(`genesis ${genesisId ?? "?"}`);
  }
  if (NETWORK === "testnet" && (genesisHashB64 !== GENESIS.testnet.hash || (genesisId !== undefined && genesisId !== GENESIS.testnet.id))) {
    throw new MainnetTransactionBlocked(`expected TestNet, got ${genesisId ?? "?"} / ${genesisHashB64}`);
  }
}

export function assertTxnsAllowed(txns: readonly algosdk.Transaction[]): void {
  for (const t of txns) {
    if (!t.genesisHash) throw new MainnetTransactionBlocked("transaction without genesis hash");
    assertGenesisAllowed(t.genesisID, b64(t.genesisHash));
  }
}

/** Checks the node we are about to send through (cached per page load). */
let verified: Promise<void> | null = null;
export function assertContractNode(getParams: () => Promise<{ genesisID?: string; genesisHash?: Uint8Array }>): Promise<void> {
  verified ??= getParams().then((p) => {
    if (!p.genesisHash) throw new MainnetTransactionBlocked("node reported no genesis hash");
    assertGenesisAllowed(p.genesisID, b64(p.genesisHash));
  });
  verified.catch(() => {
    verified = null;
  });
  return verified;
}
