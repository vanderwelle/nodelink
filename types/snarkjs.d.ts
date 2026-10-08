// Minimal type declarations for the parts of snarkjs used by NodeLink.
declare module "snarkjs" {
  export type NumericString = string;
  export interface Groth16ProofJson {
    pi_a: NumericString[];
    pi_b: NumericString[][];
    pi_c: NumericString[];
    protocol: string;
    curve: string;
  }
  export type CircuitSignals = Record<string, string | string[] | bigint | bigint[]>;
  export type ZKArtifact = string | Uint8Array | { type: "mem"; data: Uint8Array };
  export const groth16: {
    fullProve(
      input: CircuitSignals,
      wasmFile: ZKArtifact,
      zkeyFileName: ZKArtifact,
      logger?: unknown,
    ): Promise<{ proof: Groth16ProofJson; publicSignals: NumericString[] }>;
    verify(vkVerifier: object, publicSignals: NumericString[], proof: Groth16ProofJson, logger?: unknown): Promise<boolean>;
  };
}
