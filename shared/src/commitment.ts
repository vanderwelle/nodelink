// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import { poseidon1, poseidon3 } from "poseidon-lite";
import { randomFieldElement } from "./field";
import type { TierId } from "./tiers";

export interface CommitmentSecrets {
  readonly secret: bigint;
  readonly nullifier: bigint;
  readonly tier: TierId;
  readonly leaf: bigint;
}

/** leaf = Poseidon(secret, nullifier, tier) — must match node_membership.circom. */
export function computeLeaf(secret: bigint, nullifier: bigint, tier: TierId): bigint {
  return poseidon3([secret, nullifier, BigInt(tier)]);
}

/** nullifierHash = Poseidon(nullifier) — must match node_membership.circom. */
export function computeNullifierHash(nullifier: bigint): bigint {
  return poseidon1([nullifier]);
}

export function generateCommitment(tier: TierId): CommitmentSecrets {
  const secret = randomFieldElement();
  const nullifier = randomFieldElement();
  return { secret, nullifier, tier, leaf: computeLeaf(secret, nullifier, tier) };
}
