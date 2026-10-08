import { resolve } from "node:path";
import * as snarkjs from "snarkjs";
import {
  buildCircuitInput,
  encodeProof,
  encodePublicSignals,
  type MerklePath,
  type SnarkjsGroth16Proof,
  type TierId,
} from "@nodelink/shared";
import { REPO_ROOT } from "./env";

const WASM = resolve(REPO_ROOT, "frontend/public/zk/node_membership.wasm");
const ZKEY = resolve(REPO_ROOT, "frontend/public/zk/node_membership_final.zkey");

export interface EncodedProof {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  publicSignals: string[];
}

export async function proveMembership(params: {
  secret: bigint;
  nullifier: bigint;
  tier: TierId;
  path: MerklePath;
  hotWalletAddress: string;
}): Promise<EncodedProof> {
  const input = buildCircuitInput(params);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return {
    proof: encodeProof(proof as SnarkjsGroth16Proof),
    publicInputs: encodePublicSignals(publicSignals),
    publicSignals,
  };
}
