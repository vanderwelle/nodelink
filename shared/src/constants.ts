/** Depth of every NodeLink tier Merkle tree (2^20 ≈ 1M leaves per tier). */
export const TREE_LEVELS = 20;

/** Number of recent roots kept on-chain in the `valid_roots` ring buffer. */
export const ROOT_HISTORY_SIZE = 32;

/** Bytes per ring-buffer slot: root(32) || tier(uint64) || leafCount(uint64). */
export const ROOT_SLOT_SIZE = 48;

/** BN254 scalar field order r (Groth16 public signals / Poseidon field). */
export const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** BN254 base field modulus p (curve coordinates). */
export const BN254_BASE_FIELD =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export const MICROALGOS_PER_ALGO = 1_000_000n;

/** snarkjs public-signal layout for node_membership.circom. */
export const PUBLIC_SIGNAL_INDEX = {
  nullifierHash: 0,
  publicTier: 1,
  root: 2,
  hotWalletHi: 3,
  hotWalletLo: 4,
} as const;
export const NUM_PUBLIC_SIGNALS = 5;

/** Box key prefixes used by the NodeLink contract. */
export const BOX_PREFIX = {
  validRoots: "valid_roots",
  leafCounts: "leaf_counts",
  leaf: "leaf_",
  nullifier: "nullifier_",
  hotStatus: "hot_status_",
  publicProfile: "public_profile_",
} as const;

/** Box MBR = 2500 + 400 * (len(key) + len(value)) microAlgos. */
export function boxMbr(keyLength: number, valueLength: number): bigint {
  return 2_500n + 400n * BigInt(keyLength + valueLength);
}

export const LEAF_BOX_MBR = boxMbr(BOX_PREFIX.leaf.length + 32, 16);
export const NULLIFIER_BOX_MBR = boxMbr(BOX_PREFIX.nullifier.length + 32, 8);
export const HOT_STATUS_BOX_MBR = boxMbr(BOX_PREFIX.hotStatus.length + 32, 9);
export const PUBLIC_PROFILE_BOX_MBR = boxMbr(BOX_PREFIX.publicProfile.length + 32, 32);
