// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
"use client";

import { makeAlgod, readBox, boxName, decodeHotStatus, type HotStatus } from "@nodelink/shared";
import algosdk from "algosdk";
import { APP_ID, ENDPOINTS } from "./config";

export const algod = makeAlgod(ENDPOINTS);

export interface ColdTelemetry {
  readonly address: string;
  readonly balance: bigint;
  readonly status: string;
  readonly incentiveEligible: boolean;
  readonly lastProposed: bigint | null;
  readonly lastHeartbeat: bigint | null;
  readonly voteLastValid: bigint | null;
  readonly round: bigint;
}

export async function fetchColdTelemetry(address: string): Promise<ColdTelemetry> {
  const info = await algod.accountInformation(address).do();
  return {
    address,
    balance: info.amount,
    status: info.status,
    incentiveEligible: info.incentiveEligible ?? false,
    lastProposed: info.lastProposed !== undefined ? BigInt(info.lastProposed) : null,
    lastHeartbeat: info.lastHeartbeat !== undefined ? BigInt(info.lastHeartbeat) : null,
    voteLastValid: info.participation?.voteLastValid ?? null,
    round: info.round,
  };
}

export async function fetchBalance(address: string): Promise<bigint> {
  const info = await algod.accountInformation(address).exclude("all").do();
  return info.amount;
}

export async function fetchMyStatus(hot: string): Promise<HotStatus | null> {
  if (APP_ID === null) return null;
  const raw = await readBox(algod, APP_ID, boxName.hotStatus(hot));
  return raw ? decodeHotStatus(raw) : null;
}

export async function fetchPublicProfile(hot: string): Promise<string | null> {
  if (APP_ID === null) return null;
  const raw = await readBox(algod, APP_ID, boxName.publicProfile(hot));
  return raw && raw.length === 32 ? algosdk.encodeAddress(raw) : null;
}

export async function currentRound(): Promise<bigint> {
  const s = await algod.status().do();
  return s.lastRound;
}
