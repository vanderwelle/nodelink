// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import type { CircuitInput, SnarkjsGroth16Proof } from "@nodelink/shared";
import { ZK_ARTIFACTS } from "./config";

export interface DownloadProgress {
  readonly loaded: number;
  readonly total: number | null;
}

const cache = new Map<string, Uint8Array>();

/** Stream a binary artifact with progress callbacks (cached in memory per page load). */
export async function fetchWithProgress(url: string, onProgress: (p: DownloadProgress) => void): Promise<Uint8Array> {
  const cached = cache.get(url);
  if (cached) {
    onProgress({ loaded: cached.length, total: cached.length });
    return cached;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url} (${res.status})`);
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ loaded, total });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  cache.set(url, out);
  onProgress({ loaded, total: loaded });
  return out;
}

export interface ProveProgress {
  wasm: DownloadProgress;
  zkey: DownloadProgress;
  phase: "idle" | "downloading" | "proving" | "done";
}

export interface ProofResult {
  proof: SnarkjsGroth16Proof;
  publicSignals: string[];
  millis: number;
}

/**
 * Generate a Groth16 proof fully in the browser. snarkjs and the circuit artifacts
 * (~2.4 MB wasm + ~3.3 MB zkey) are loaded lazily, only when the user reaches this step.
 * Secrets never leave the browser.
 */
export async function proveInBrowser(input: CircuitInput, onProgress: (p: ProveProgress) => void): Promise<ProofResult> {
  const state: ProveProgress = { wasm: { loaded: 0, total: null }, zkey: { loaded: 0, total: null }, phase: "downloading" };
  const emit = (): void => onProgress({ ...state });
  emit();
  const [snarkjs, wasm, zkey] = await Promise.all([
    import("snarkjs"),
    fetchWithProgress(ZK_ARTIFACTS.wasm, (p) => {
      state.wasm = p;
      emit();
    }),
    fetchWithProgress(ZK_ARTIFACTS.zkey, (p) => {
      state.zkey = p;
      emit();
    }),
  ]);
  state.phase = "proving";
  emit();
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, { type: "mem", data: wasm }, { type: "mem", data: zkey });
  state.phase = "done";
  emit();
  return { proof: proof as SnarkjsGroth16Proof, publicSignals, millis: Math.round(performance.now() - t0) };
}
