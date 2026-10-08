import { poseidon2 } from "poseidon-lite";
import { TREE_LEVELS } from "./constants";

/** Value of an empty leaf. */
export const ZERO_LEAF = 0n;

export function hashLeftRight(left: bigint, right: bigint): bigint {
  return poseidon2([left, right]);
}

let cachedZeros: bigint[] | null = null;

/** zeros[i] = root of an empty subtree of height i. zeros[TREE_LEVELS] = empty-tree root. */
export function zeroHashes(levels = TREE_LEVELS): bigint[] {
  if (cachedZeros && cachedZeros.length > levels) return cachedZeros.slice(0, levels + 1);
  const zeros: bigint[] = [ZERO_LEAF];
  for (let i = 0; i < levels; i++) {
    const prev = zeros[i] as bigint;
    zeros.push(hashLeftRight(prev, prev));
  }
  cachedZeros = zeros;
  return zeros.slice();
}

export interface MerklePath {
  readonly root: bigint;
  readonly leaf: bigint;
  readonly leafIndex: number;
  readonly pathElements: bigint[];
  /** 0 = running hash is the left child at this level, 1 = right child. */
  readonly pathIndices: (0 | 1)[];
}

/**
 * Append-only Poseidon Merkle tree (sparse layers, zero-padded), identical to the
 * MerkleTreeChecker in circuits/merkle_tree.circom.
 */
export class PoseidonMerkleTree {
  readonly levels: number;
  private readonly zeros: bigint[];
  private readonly layers: bigint[][];

  constructor(leaves: readonly bigint[] = [], levels = TREE_LEVELS) {
    if (leaves.length > 2 ** levels) throw new Error("too many leaves for tree depth");
    this.levels = levels;
    this.zeros = zeroHashes(levels);
    this.layers = [leaves.slice()];
    this.rebuild();
  }

  private rebuild(): void {
    for (let level = 0; level < this.levels; level++) {
      const current = this.layers[level] as bigint[];
      const next: bigint[] = [];
      for (let i = 0; i < Math.ceil(current.length / 2); i++) {
        const left = current[2 * i] as bigint;
        const right = 2 * i + 1 < current.length ? (current[2 * i + 1] as bigint) : (this.zeros[level] as bigint);
        next.push(hashLeftRight(left, right));
      }
      this.layers[level + 1] = next;
    }
  }

  get leafCount(): number {
    return (this.layers[0] as bigint[]).length;
  }

  get leaves(): readonly bigint[] {
    return this.layers[0] as bigint[];
  }

  get root(): bigint {
    const top = this.layers[this.levels] as bigint[];
    return top.length > 0 ? (top[0] as bigint) : (this.zeros[this.levels] as bigint);
  }

  indexOf(leaf: bigint): number {
    return (this.layers[0] as bigint[]).indexOf(leaf);
  }

  path(leafIndex: number): MerklePath {
    const leaves = this.layers[0] as bigint[];
    if (leafIndex < 0 || leafIndex >= leaves.length) throw new Error("leaf index out of range");
    const pathElements: bigint[] = [];
    const pathIndices: (0 | 1)[] = [];
    let index = leafIndex;
    for (let level = 0; level < this.levels; level++) {
      const layer = this.layers[level] as bigint[];
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;
      pathElements.push(siblingIndex < layer.length ? (layer[siblingIndex] as bigint) : (this.zeros[level] as bigint));
      pathIndices.push(isRight ? 1 : 0);
      index = Math.floor(index / 2);
    }
    return { root: this.root, leaf: leaves[leafIndex] as bigint, leafIndex, pathElements, pathIndices };
  }
}

/** Recompute a root from a path (used for client-side sanity checks). */
export function rootFromPath(leaf: bigint, pathElements: readonly bigint[], pathIndices: readonly (0 | 1)[]): bigint {
  let current = leaf;
  pathElements.forEach((sibling, i) => {
    current = pathIndices[i] === 1 ? hashLeftRight(sibling, current) : hashLeftRight(current, sibling);
  });
  return current;
}
