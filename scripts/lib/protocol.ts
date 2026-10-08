import { AlgorandClient, microAlgo } from "@algorandfoundation/algokit-utils";
import type { TransactionSignerAccount } from "@algorandfoundation/algokit-utils/types/account";
import type algosdk from "algosdk";
import {
  HOT_STATUS_BOX_MBR,
  LEAF_BOX_MBR,
  NULLIFIER_BOX_MBR,
  PoseidonMerkleTree,
  bigIntToBytes,
  fetchRootSlots,
  leavesByTier,
  type LeafEvent,
  type TierId,
} from "@nodelink/shared";
import { NodeLinkProtocolClient, NodeLinkProtocolFactory } from "@nodelink/shared/generated";

export type Signer = algosdk.Address & TransactionSignerAccount;

/** Generous ceiling for claim_status fees: 2 outer txns + ~105 OpUp inner calls. */
export const CLAIM_MAX_FEE = microAlgo(150_000);

export async function deployProtocol(
  algorand: AlgorandClient,
  deployer: Signer,
  opts: { statusTtlRounds: bigint; testnetSkipOnlineCheck: boolean; rootUpdater?: string },
): Promise<NodeLinkProtocolClient> {
  const factory = algorand.client.getTypedAppFactory(NodeLinkProtocolFactory, { defaultSender: deployer.addr });
  const { appClient } = await factory.send.create.create({
    args: {
      rootUpdater: opts.rootUpdater ?? deployer.addr.toString(),
      statusTtlRounds: opts.statusTtlRounds,
      testnetSkipOnlineCheck: opts.testnetSkipOnlineCheck,
    },
  });
  const minBalance = 100_000n;
  const bootstrapMbr = minBalance + (2_500n + 400n * (11n + 1536n)) + (2_500n + 400n * (11n + 40n));
  await appClient.send.bootstrap({
    args: {
      mbrPayment: algorand.createTransaction.payment({
        sender: deployer.addr,
        receiver: appClient.appAddress,
        amount: microAlgo(bootstrapMbr),
      }),
    },
  });
  return appClient;
}

export async function depositCommitment(
  algorand: AlgorandClient,
  client: NodeLinkProtocolClient,
  cold: Signer,
  commitment: bigint,
  tier: TierId,
): Promise<{ leafIndex: bigint; txId: string }> {
  const res = await client.send.depositCommitment({
    sender: cold.addr,
    args: {
      commitment: bigIntToBytes(commitment, 32),
      declaredTier: BigInt(tier),
      mbrPayment: algorand.createTransaction.payment({
        sender: cold.addr,
        receiver: client.appAddress,
        amount: microAlgo(LEAF_BOX_MBR),
      }),
    },
  });
  if (res.return === undefined) throw new Error("deposit returned no leaf index");
  return { leafIndex: res.return, txId: res.txIds[res.txIds.length - 1] ?? "" };
}

/** Root updater: rebuild every tier tree from events and post any root that is new. */
export async function syncRoots(
  client: NodeLinkProtocolClient,
  updater: Signer,
  events: readonly LeafEvent[],
): Promise<{ tier: TierId; root: bigint; leafCount: number; slot: bigint }[]> {
  const algod = client.algorand.client.algod;
  const slots = await fetchRootSlots(algod, client.appId);
  const byTier = leavesByTier(events);
  const posted: { tier: TierId; root: bigint; leafCount: number; slot: bigint }[] = [];
  for (const tier of [1, 2, 3, 4, 5] as TierId[]) {
    const leaves = byTier[tier];
    if (leaves.length === 0) continue;
    const root = new PoseidonMerkleTree(leaves).root;
    if (slots.some((s) => s.tier === tier && s.root === root && s.leafCount === leaves.length)) continue;
    const res = await client.send.postRoot({
      sender: updater.addr,
      args: { root: bigIntToBytes(root, 32), tier: BigInt(tier), leafCount: BigInt(leaves.length) },
    });
    posted.push({ tier, root, leafCount: leaves.length, slot: res.return ?? -1n });
  }
  return posted;
}

export async function claimStatus(
  algorand: AlgorandClient,
  client: NodeLinkProtocolClient,
  hot: Signer,
  proof: Uint8Array,
  publicInputs: Uint8Array,
  hasExistingStatus = false,
): Promise<{ tier: number; expiryRound: bigint; txId: string; fee: bigint }> {
  const mbr = NULLIFIER_BOX_MBR + (hasExistingStatus ? 0n : HOT_STATUS_BOX_MBR);
  const res = await client.send.claimStatus({
    sender: hot.addr,
    args: {
      proof,
      publicInputs,
      mbrPayment: algorand.createTransaction.payment({ sender: hot.addr, receiver: client.appAddress, amount: microAlgo(mbr) }),
    },
    coverAppCallInnerTransactionFees: true,
    maxFee: CLAIM_MAX_FEE,
  });
  if (!res.return) throw new Error("claim returned no status");
  const fee = res.transactions.reduce((sum, t) => sum + t.fee, 0n);
  return { tier: res.return.tier, expiryRound: res.return.expiryRound, txId: res.txIds[res.txIds.length - 1] ?? "", fee };
}
