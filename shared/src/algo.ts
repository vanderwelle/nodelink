import { MICROALGOS_PER_ALGO } from "./constants";

/** Format a microAlgo amount as an ALGO decimal string using BigInt only. */
export function microAlgosToAlgo(microAlgos: bigint, maxFractionDigits = 6): string {
  const negative = microAlgos < 0n;
  const abs = negative ? -microAlgos : microAlgos;
  const whole = abs / MICROALGOS_PER_ALGO;
  const fraction = abs % MICROALGOS_PER_ALGO;
  let fractionStr = fraction.toString().padStart(6, "0").slice(0, Math.max(0, Math.min(6, maxFractionDigits)));
  fractionStr = fractionStr.replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}${fractionStr ? `.${fractionStr}` : ""}`;
}

/** Parse an ALGO decimal string ("12.5") into microAlgos using BigInt only. */
export function algoToMicroAlgos(algo: string): bigint {
  const trimmed = algo.trim().replace(/,/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{0,6}))?$/.exec(trimmed);
  if (!match) throw new Error(`Invalid ALGO amount: "${algo}"`);
  const [, sign, whole = "0", fraction = ""] = match;
  const micro = BigInt(whole) * MICROALGOS_PER_ALGO + BigInt(fraction.padEnd(6, "0") || "0");
  return sign ? -micro : micro;
}
