// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import type { AlgorandClient } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import { ENV_PATH, upsertEnv } from "./env";
import type { Signer } from "./protocol";

/** Load (or create and persist to the gitignored .env) a mnemonic-backed account. Never logs the mnemonic. */
export function loadOrCreateAccount(algorand: AlgorandClient, envKey: string): { account: Signer; created: boolean } {
  let mnemonic = process.env[envKey];
  let created = false;
  if (!mnemonic) {
    const generated = algosdk.generateAccount();
    mnemonic = algosdk.secretKeyToMnemonic(generated.sk);
    upsertEnv(ENV_PATH, { [envKey]: mnemonic });
    created = true;
  }
  const account = algorand.account.fromMnemonic(mnemonic);
  return { account, created };
}

export async function balanceOf(algorand: AlgorandClient, address: string): Promise<bigint> {
  const info = await algorand.account.getInformation(address);
  return info.balance.microAlgo;
}
