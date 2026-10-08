#!/usr/bin/env bash
# Compile the NodeLink contract with puyapy (AVM 11) and generate typed clients.
# Requires: algokit + puyapy (+ algokit-client-generator for the Python client) on PATH,
# e.g. `python -m venv .venv && .venv/bin/pip install algokit puyapy algokit-client-generator`.
set -euo pipefail
cd "$(dirname "$0")/.."
algokit compile py contracts/nodelink_protocol.py \
  --out-dir artifacts --target-avm-version 11 \
  --output-arc56 --no-output-arc32 --output-teal --output-bytecode
# TypeScript client (used by scripts/ and frontend/ via @nodelink/shared)
algokit generate client contracts/artifacts/NodeLinkProtocol.arc56.json \
  --output shared/src/generated/NodeLinkProtocolClient.ts
# Post-process for the repo's strict TS settings (noUncheckedIndexedAccess, zero `any`)
sed -i -E 's/APP_SPEC\.structs\.([A-Za-z0-9_]+), APP_SPEC\.structs\)/APP_SPEC.structs.\1!, APP_SPEC.structs)/g; s/=> any\)/=> unknown)/g; s/\[\.\.\.any\[\]\]/[...unknown[]]/g' \
  shared/src/generated/NodeLinkProtocolClient.ts
# Python client
algokitgen-py -a contracts/artifacts/NodeLinkProtocol.arc56.json \
  -o contracts/clients/nodelink_protocol_client.py
echo "contract build OK"
