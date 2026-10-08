/**
 * Circuit test: build a tier tree with several leaves, generate a witness + Groth16
 * proof for one leaf bound to a hot wallet, verify it with snarkjs, and check that
 * tampered public signals (other hot wallet / other tier) are rejected.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import algosdk from "algosdk";
import * as snarkjs from "snarkjs";
import {
  PoseidonMerkleTree,
  addressToLimbs,
  buildCircuitInput,
  computeNullifierHash,
  generateCommitment,
  limbsToAddress,
  rootFromPath,
  type SnarkjsGroth16Proof,
} from "@nodelink/shared";

const here = dirname(fileURLToPath(import.meta.url));
const wasm = resolve(here, "../build/node_membership_js/node_membership.wasm");
const zkey = resolve(here, "../build/node_membership_final.zkey");
const vkey: object = JSON.parse(readFileSync(resolve(here, "../artifacts/verification_key.json"), "utf8"));

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}

const hot = algosdk.generateAccount().addr.toString();
const otherHot = algosdk.generateAccount().addr.toString();

// address <-> limbs must be a bijection (no mod-p reduction)
const limbs = addressToLimbs(hot);
check("address limbs round-trip (injective encoding)", limbsToAddress(limbs) === hot);
check("limbs are < 2^128", limbs.hi < 2n ** 128n && limbs.lo < 2n ** 128n);

const mine = generateCommitment(2);
const others = Array.from({ length: 6 }, () => generateCommitment(2).leaf);
const leaves = [...others.slice(0, 3), mine.leaf, ...others.slice(3)];
const tree = new PoseidonMerkleTree(leaves);
const path = tree.path(3);
check("path recomputes root off-chain", rootFromPath(path.leaf, path.pathElements, path.pathIndices) === tree.root);

const input = buildCircuitInput({ secret: mine.secret, nullifier: mine.nullifier, tier: mine.tier, path, hotWalletAddress: hot });
const t0 = Date.now();
const { proof, publicSignals } = (await snarkjs.groth16.fullProve(input, wasm, zkey)) as {
  proof: SnarkjsGroth16Proof;
  publicSignals: string[];
};
console.log(`      proof generated in ${Date.now() - t0} ms`);

check("public signal [0] = nullifierHash = Poseidon(nullifier)", publicSignals[0] === computeNullifierHash(mine.nullifier).toString());
check("public signal [1] = publicTier", publicSignals[1] === "2");
check("public signal [2] = root", publicSignals[2] === tree.root.toString());
check("public signal [3] = hotWalletHi", publicSignals[3] === limbs.hi.toString());
check("public signal [4] = hotWalletLo", publicSignals[4] === limbs.lo.toString());

check("valid proof verifies", await snarkjs.groth16.verify(vkey, publicSignals, proof));

const otherLimbs = addressToLimbs(otherHot);
const stolen = [...publicSignals];
stolen[3] = otherLimbs.hi.toString();
stolen[4] = otherLimbs.lo.toString();
check("proof replayed for another hot wallet is rejected", !(await snarkjs.groth16.verify(vkey, stolen, proof)));

const upTier = [...publicSignals];
upTier[1] = "5";
check("proof with inflated tier is rejected", !(await snarkjs.groth16.verify(vkey, upTier, proof)));

// Witness generation must fail for a wrong tier (leaf mismatch)
let threw = false;
try {
  await snarkjs.groth16.fullProve({ ...input, tier: "5" }, wasm, zkey);
} catch {
  threw = true;
}
check("witness generation fails when tier differs from committed leaf", threw);

// Witness generation must fail for out-of-range tier even with a matching leaf
threw = false;
try {
  await snarkjs.groth16.fullProve({ ...input, tier: "7" }, wasm, zkey);
} catch {
  threw = true;
}
check("witness generation fails for tier outside 1..5", threw);

console.log(failures === 0 ? "\nALL CIRCUIT TESTS PASSED" : `\n${failures} CIRCUIT TEST(S) FAILED`);
// snarkjs keeps worker threads alive
process.exit(failures === 0 ? 0 : 1);
