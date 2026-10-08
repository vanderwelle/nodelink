"use client";

import { NetworkConfigBuilder, NetworkId, WalletId, WalletManager } from "@txnlab/use-wallet-react";
import type algosdk from "algosdk";
import { ENDPOINTS, NETWORK } from "./config";
import { assertTxnsAllowed } from "./guard";

const networks = new NetworkConfigBuilder()
  .testnet({ algod: { baseServer: "https://testnet-api.4160.nodely.dev", token: "" } })
  .localnet({ algod: { baseServer: "http://localhost", port: 4001, token: "a".repeat(64) } })
  .build();

/**
 * Single WalletManager for the app. MainNet is deliberately not configured, so no wallet
 * session can be pointed at MainNet from this UI.
 */
export const walletManager = new WalletManager({
  wallets: [
    WalletId.PERA,
    WalletId.DEFLY,
    { id: WalletId.LUTE, options: { siteName: "NodeLink" } },
    WalletId.KIBISIS,
    // LocalNet-only test wallets (the Mnemonic provider itself refuses production networks)
    ...(NETWORK === "localnet" ? [WalletId.KMD, WalletId.MNEMONIC] : []),
  ],
  networks,
  defaultNetwork: NETWORK === "localnet" ? NetworkId.LOCALNET : NetworkId.TESTNET,
});

export type TransactionSigner = (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => Promise<Uint8Array[]>;

/**
 * Signer for a specific address, using whichever connected wallet holds that account.
 * Lets the cold and hot wallet live in different wallet apps at the same time.
 */
export function signerFor(address: string): TransactionSigner {
  for (const wallet of walletManager.wallets) {
    if (wallet.isConnected && wallet.accounts.some((a) => a.address === address)) {
      return (group, indexes) => {
        // Hard guard: refuse before the wallet ever sees a non-contract-network transaction.
        assertTxnsAllowed(group);
        return wallet.transactionSigner(group, indexes);
      };
    }
  }
  throw new Error(`No connected wallet holds ${address}`);
}

export const ALGOD_URL = ENDPOINTS.algod;
