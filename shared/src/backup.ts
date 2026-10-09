// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
import type { TierId } from "./tiers";
import { isTierId } from "./tiers";

/** Plaintext of the encrypted backup exported in Link Wizard step 1. */
export interface BackupPayload {
  readonly version: 1;
  readonly secret: string;
  readonly nullifier: string;
  readonly tier: TierId;
  readonly leaf: string;
  readonly coldAddress: string;
  readonly appId: string;
  readonly network: "testnet" | "localnet" | "mainnet";
  readonly leafIndex?: number;
  readonly createdAt: string;
}

/** Encrypted envelope (safe to store anywhere; useless without the passphrase). */
export interface EncryptedBackup {
  readonly format: "nodelink-backup";
  readonly version: 1;
  readonly kdf: "PBKDF2-SHA256";
  readonly iterations: number;
  readonly cipher: "AES-256-GCM";
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export const PBKDF2_ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const baseKey = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackup(payload: BackupPayload, passphrase: string): Promise<EncryptedBackup> {
  if (passphrase.length < 12) throw new Error("Passphrase must be at least 12 characters");
  const salt = new Uint8Array(new ArrayBuffer(16));
  const iv = new Uint8Array(new ArrayBuffer(12));
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return {
    format: "nodelink-backup",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseEncryptedBackup(json: string): EncryptedBackup {
  const parsed: unknown = JSON.parse(json);
  if (
    !isRecord(parsed) ||
    parsed.format !== "nodelink-backup" ||
    parsed.version !== 1 ||
    typeof parsed.salt !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.iterations !== "number"
  ) {
    throw new Error("Not a NodeLink backup file");
  }
  return {
    format: "nodelink-backup",
    version: 1,
    kdf: "PBKDF2-SHA256",
    cipher: "AES-256-GCM",
    iterations: parsed.iterations,
    salt: parsed.salt,
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
  };
}

export async function decryptBackup(backup: EncryptedBackup, passphrase: string): Promise<BackupPayload> {
  const key = await deriveKey(passphrase, fromBase64(backup.salt), backup.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(backup.iv) }, key, fromBase64(backup.ciphertext));
  } catch {
    throw new Error("Wrong passphrase or corrupted backup");
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    typeof parsed.secret !== "string" ||
    typeof parsed.nullifier !== "string" ||
    typeof parsed.leaf !== "string" ||
    typeof parsed.coldAddress !== "string" ||
    typeof parsed.appId !== "string" ||
    typeof parsed.tier !== "number" ||
    !isTierId(parsed.tier) ||
    (parsed.network !== "testnet" && parsed.network !== "localnet" && parsed.network !== "mainnet")
  ) {
    throw new Error("Backup payload is malformed");
  }
  return {
    version: 1,
    secret: parsed.secret,
    nullifier: parsed.nullifier,
    tier: parsed.tier,
    leaf: parsed.leaf,
    coldAddress: parsed.coldAddress,
    appId: parsed.appId,
    network: parsed.network,
    leafIndex: typeof parsed.leafIndex === "number" ? parsed.leafIndex : undefined,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
  };
}
