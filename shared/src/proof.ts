import { BN254_BASE_FIELD, BN254_SCALAR_FIELD, NUM_PUBLIC_SIGNALS, TREE_LEVELS } from "./constants";
import { addressToLimbs, bigIntToBytes, concatBytes } from "./field";
import type { MerklePath } from "./merkle";
import type { TierId } from "./tiers";

/** Groth16 proof as emitted by snarkjs (`groth16.fullProve`). */
export interface SnarkjsGroth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

/** Input object for node_membership.circom (all values as decimal strings). */
export interface CircuitInput {
  [signal: string]: string | string[];
  secret: string;
  nullifier: string;
  tier: string;
  pathElements: string[];
  pathIndices: string[];
  root: string;
  hotWalletHi: string;
  hotWalletLo: string;
}

export function buildCircuitInput(params: {
  secret: bigint;
  nullifier: bigint;
  tier: TierId;
  path: MerklePath;
  hotWalletAddress: string;
}): CircuitInput {
  const { hi, lo } = addressToLimbs(params.hotWalletAddress);
  if (params.path.pathElements.length !== TREE_LEVELS) throw new Error("bad path length");
  return {
    secret: params.secret.toString(),
    nullifier: params.nullifier.toString(),
    tier: params.tier.toString(),
    pathElements: params.path.pathElements.map((e) => e.toString()),
    pathIndices: params.path.pathIndices.map((e) => e.toString()),
    root: params.path.root.toString(),
    hotWalletHi: hi.toString(),
    hotWalletLo: lo.toString(),
  };
}

function fp(value: string | undefined): Uint8Array {
  if (value === undefined) throw new Error("malformed proof");
  const v = BigInt(value);
  if (v >= BN254_BASE_FIELD) throw new Error("coordinate out of range");
  return bigIntToBytes(v, 32);
}

/**
 * Encode a snarkjs proof into the 256-byte layout expected by `claim_status`:
 *   A (G1: x||y) || B (G2: x.c0||x.c1||y.c0||y.c1) || C (G1: x||y)
 * The AVM encodes an Fp2 element Z0 + Z1·i as Z0||Z1 (unlike the EVM precompile),
 * which matches snarkjs' [c0, c1] ordering directly.
 */
export function encodeProof(proof: SnarkjsGroth16Proof): Uint8Array {
  const [bx, by] = proof.pi_b;
  if (!bx || !by) throw new Error("malformed proof");
  return concatBytes(
    fp(proof.pi_a[0]), fp(proof.pi_a[1]),
    fp(bx[0]), fp(bx[1]), fp(by[0]), fp(by[1]),
    fp(proof.pi_c[0]), fp(proof.pi_c[1]),
  );
}

/** Encode the 5 public signals as concatenated 32-byte big-endian scalars (160 bytes). */
export function encodePublicSignals(publicSignals: readonly string[]): Uint8Array {
  if (publicSignals.length !== NUM_PUBLIC_SIGNALS) throw new Error(`expected ${NUM_PUBLIC_SIGNALS} public signals`);
  return concatBytes(
    ...publicSignals.map((s) => {
      const v = BigInt(s);
      if (v >= BN254_SCALAR_FIELD) throw new Error("public signal not canonical");
      return bigIntToBytes(v, 32);
    }),
  );
}
