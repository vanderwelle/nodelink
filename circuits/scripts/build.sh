#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Julian van der Welle
# Compile node_membership.circom and run a DEV-ONLY Groth16 trusted setup.
#
#   !!! NOT FOR PRODUCTION !!!
#   The Powers of Tau and phase-2 contributions below are generated locally by a
#   single party with throw-away entropy. Whoever ran this script could forge proofs.
#   Production requires a multi-party ceremony (e.g. reuse a public Perpetual Powers
#   of Tau file such as the Hermez/PSE ptau, plus a multi-contributor phase-2).
set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$(cd .. && pwd)"
BUILD=build
PTAU_DIR=ptau
PTAU_POWER=14
SNARKJS="node $ROOT/node_modules/snarkjs/build/cli.cjs"
mkdir -p "$BUILD" "$PTAU_DIR"

echo "==> circom version: $(circom --version)"
circom node_membership.circom --r1cs --wasm --sym -l "$ROOT/node_modules" -o "$BUILD"
$SNARKJS r1cs info "$BUILD/node_membership.r1cs"

PTAU_FINAL="$PTAU_DIR/pot${PTAU_POWER}_final_DEV_ONLY.ptau"
if [ ! -f "$PTAU_FINAL" ]; then
  echo "==> [DEV ONLY] Powers of Tau phase 1 (2^$PTAU_POWER)"
  $SNARKJS powersoftau new bn128 "$PTAU_POWER" "$PTAU_DIR/pot_0000.ptau"
  $SNARKJS powersoftau contribute "$PTAU_DIR/pot_0000.ptau" "$PTAU_DIR/pot_0001.ptau" \
    --name="NodeLink dev contribution (INSECURE)" -e="$(head -c 64 /dev/urandom | base64)"
  $SNARKJS powersoftau beacon "$PTAU_DIR/pot_0001.ptau" "$PTAU_DIR/pot_beacon.ptau" \
    0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="dev beacon"
  $SNARKJS powersoftau prepare phase2 "$PTAU_DIR/pot_beacon.ptau" "$PTAU_FINAL"
fi

echo "==> [DEV ONLY] Groth16 phase 2"
$SNARKJS groth16 setup "$BUILD/node_membership.r1cs" "$PTAU_FINAL" "$BUILD/node_membership_0000.zkey"
$SNARKJS zkey contribute "$BUILD/node_membership_0000.zkey" "$BUILD/node_membership_final.zkey" \
  --name="NodeLink dev phase2 (INSECURE)" -e="$(head -c 64 /dev/urandom | base64)"
$SNARKJS zkey verify "$BUILD/node_membership.r1cs" "$PTAU_FINAL" "$BUILD/node_membership_final.zkey"
$SNARKJS zkey export verificationkey "$BUILD/node_membership_final.zkey" "$BUILD/verification_key.json"

echo "==> Publishing artifacts"
mkdir -p artifacts "$ROOT/frontend/public/zk"
cp "$BUILD/verification_key.json" artifacts/verification_key.json
cp "$BUILD/node_membership_js/node_membership.wasm" "$ROOT/frontend/public/zk/node_membership.wasm"
cp "$BUILD/node_membership_final.zkey" "$ROOT/frontend/public/zk/node_membership_final.zkey"
cp "$BUILD/verification_key.json" "$ROOT/frontend/public/zk/verification_key.json"

echo "==> Generating contracts/verifier_key.py from the verification key"
(cd "$ROOT/scripts" && npx tsx gen-verifier-key.ts)
echo "Done. (Remember: DEV-ONLY trusted setup.)"
