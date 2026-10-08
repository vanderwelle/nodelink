import algosdk from "algosdk";
import { BN254_SCALAR_FIELD } from "./constants";

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

/** Big-endian fixed-width encoding. Throws if the value does not fit. */
export function bigIntToBytes(value: bigint, length = 32): Uint8Array {
  if (value < 0n) throw new Error("negative value");
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`value does not fit in ${length} bytes`);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function isFieldElement(value: bigint): boolean {
  return value >= 0n && value < BN254_SCALAR_FIELD;
}

/** Uniformly random field element (rejection sampling over 254-bit values). */
export function randomFieldElement(): bigint {
  for (;;) {
    const buf = new Uint8Array(32);
    globalThis.crypto.getRandomValues(buf);
    buf[0] = (buf[0] ?? 0) & 0x3f; // 254 bits
    const v = bytesToBigInt(buf);
    if (v !== 0n && v < BN254_SCALAR_FIELD) return v;
  }
}

export interface AddressLimbs {
  /** First 16 bytes of the 32-byte ed25519 public key, big-endian. */
  readonly hi: bigint;
  /** Last 16 bytes of the 32-byte ed25519 public key, big-endian. */
  readonly lo: bigint;
}

/**
 * Injective mapping of an Algorand address (32-byte public key, 256 bits) into two
 * 128-bit BN254 field elements. No modular reduction is involved.
 */
export function addressToLimbs(address: string): AddressLimbs {
  const pk = algosdk.decodeAddress(address).publicKey;
  return { hi: bytesToBigInt(pk.slice(0, 16)), lo: bytesToBigInt(pk.slice(16, 32)) };
}

export function limbsToAddress(limbs: AddressLimbs): string {
  const pk = concatBytes(bigIntToBytes(limbs.hi, 16), bigIntToBytes(limbs.lo, 16));
  return algosdk.encodeAddress(pk);
}
