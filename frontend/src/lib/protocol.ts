// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { AlgorandClient, microAlgo } from "@algorandfoundation/algokit-utils";
import {
  HOT_STATUS_BOX_MBR,
  LEAF_BOX_MBR,
  NULLIFIER_BOX_MBR,
  PUBLIC_PROFILE_BOX_MBR,
  bigIntToBytes,
  type TierId,
} from "@nodelink/shared";
import { NodeLinkProtocolClient } from "@nodelink/shared/generated";
import { APP_ID, ENDPOINTS, NETWORK } from "./config";
import { assertContractNode } from "./guard";
import { signerFor } from "./wallet";

export function getAlgorand(): AlgorandClient {
  if (NETWORK === "localnet") return AlgorandClient.defaultLocalNet();
  return AlgorandClient.fromConfig({
    algodConfig: { server: ENDPOINTS.algod, token: "" },
    indexerConfig: { server: ENDPOINTS.indexer, token: "" },
  });
}

/** Contract client after verifying the node's genesis is the contract network (never MainNet). */
async function guardedAlgorand(): Promise<AlgorandClient> {
  const algorand = getAlgorand();
  await assertContractNode(async () => {
    const p = await algorand.client.algod.getTransactionParams().do();
    return { genesisID: p.genesisID, genesisHash: p.genesisHash };
  });
  return algorand;
}

export function requireAppId(): bigint {
  if (APP_ID === null) throw new Error("NEXT_PUBLIC_APP_ID is not configured — deploy the contract first.");
  return APP_ID;
}

function clientFor(algorand: AlgorandClient, sender: string): NodeLinkProtocolClient {
  algorand.setSigner(sender, signerFor(sender));
  return algorand.client.getTypedAppClientById(NodeLinkProtocolClient, { appId: requireAppId(), defaultSender: sender });
}

/** Step 1 (cold wallet): deposit the opaque commitment leaf. Returns the leaf index. */
export async function sendDeposit(cold: string, commitment: bigint, tier: TierId): Promise<{ leafIndex: number; txId: string }> {
  const algorand = await guardedAlgorand();
  const client = clientFor(algorand, cold);
  const res = await client.send.depositCommitment({
    args: {
      commitment: bigIntToBytes(commitment, 32),
      declaredTier: BigInt(tier),
      mbrPayment: algorand.createTransaction.payment({ sender: cold, receiver: client.appAddress, amount: microAlgo(LEAF_BOX_MBR) }),
    },
  });
  return { leafIndex: Number(res.return ?? -1n), txId: res.txIds.at(-1) ?? "" };
}

/** Step 2 (hot wallet): atomic group [MBR payment, claim_status(proof)]. */
export async function sendClaim(
  hot: string,
  proof: Uint8Array,
  publicInputs: Uint8Array,
  hasExistingStatus: boolean,
): Promise<{ tier: number; expiryRound: bigint; txId: string }> {
  const algorand = await guardedAlgorand();
  const client = clientFor(algorand, hot);
  const mbr = NULLIFIER_BOX_MBR + (hasExistingStatus ? 0n : HOT_STATUS_BOX_MBR);
  const res = await client.send.claimStatus({
    args: {
      proof,
      publicInputs,
      mbrPayment: algorand.createTransaction.payment({ sender: hot, receiver: client.appAddress, amount: microAlgo(mbr) }),
    },
    coverAppCallInnerTransactionFees: true,
    maxFee: microAlgo(150_000),
  });
  if (!res.return) throw new Error("claim_status returned no status");
  return { tier: res.return.tier, expiryRound: res.return.expiryRound, txId: res.txIds.at(-1) ?? "" };
}

/** Opt-in public profile: cold wallet signs the MBR payment, hot wallet signs the app call. */
export async function sendRevealProfile(hot: string, cold: string): Promise<string> {
  const algorand = await guardedAlgorand();
  algorand.setSigner(cold, signerFor(cold));
  const client = clientFor(algorand, hot);
  const res = await client.send.revealPublicProfile({
    args: {
      coldAddress: cold,
      mbrPayment: algorand.createTransaction.payment({ sender: cold, receiver: client.appAddress, amount: microAlgo(PUBLIC_PROFILE_BOX_MBR) }),
    },
  });
  return res.txIds.at(-1) ?? "";
}

export async function sendHideProfile(hot: string): Promise<string> {
  const algorand = await guardedAlgorand();
  const client = clientFor(algorand, hot);
  const res = await client.send.hidePublicProfile({ args: [], coverAppCallInnerTransactionFees: true, maxFee: microAlgo(5_000) });
  return res.txIds.at(-1) ?? "";
}
