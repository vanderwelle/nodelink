import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { NETWORKS, type NetworkId } from "@nodelink/shared";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../..");
export const ENV_PATH = resolve(REPO_ROOT, ".env");

dotenv.config({ path: ENV_PATH, quiet: true });

/** Only these genesis IDs are ever allowed. NodeLink scripts refuse to touch MainNet. */
const ALLOWED_GENESIS: Record<NetworkId, string[]> = {
  testnet: ["testnet-v1.0"],
  localnet: ["dockernet-v1", "sandnet-v1"],
};
const MAINNET_GENESIS_HASH = "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";

export function networkFromEnv(): NetworkId {
  const n = (process.env.NODELINK_NETWORK ?? "testnet").toLowerCase();
  if (n === "mainnet") throw new Error("Refusing to run: NodeLink scripts never target MainNet.");
  if (n !== "testnet" && n !== "localnet") throw new Error(`Unknown network ${n}`);
  return n;
}

export async function makeAlgorand(network: NetworkId): Promise<AlgorandClient> {
  const algorand =
    network === "localnet"
      ? AlgorandClient.defaultLocalNet()
      : AlgorandClient.fromConfig({
          algodConfig: { server: NETWORKS.testnet.algod, token: "" },
          indexerConfig: { server: NETWORKS.testnet.indexer, token: "" },
        });
  // Hard safety guard: verify the genesis of the node we are talking to.
  const params = await algorand.client.algod.getTransactionParams().do();
  const genesisHash = Buffer.from(params.genesisHash).toString("base64");
  if (genesisHash === MAINNET_GENESIS_HASH || !ALLOWED_GENESIS[network].includes(params.genesisID)) {
    throw new Error(`Refusing to run against genesis ${params.genesisID} (${genesisHash}).`);
  }
  algorand.setDefaultValidityWindow(200);
  return algorand;
}

/** Upsert KEY=value lines in a dotenv file without printing secrets. */
export function upsertEnv(path: string, values: Record<string, string>): void {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  for (const [key, value] of Object.entries(values)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
    process.env[key] = value;
  }
  writeFileSync(path, lines.filter((l, i) => l !== "" || i < lines.length - 1).join("\n") + "\n", { mode: 0o600 });
}

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env`);
  return v;
}
