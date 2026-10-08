/**
 * Deploy NodeLinkProtocol to Algorand TESTNET (never MainNet).
 *
 *  - Creates a deployer account on first run (mnemonic stored ONLY in the gitignored .env).
 *  - Tries the AlgoKit TestNet dispenser API (needs ALGOKIT_DISPENSER_ACCESS_TOKEN, obtained via
 *    `algokit dispenser login --ci`). Otherwise prints the address to fund via
 *    https://bank.testnet.algorand.network/ or https://lora.algokit.io/testnet/fund.
 *  - Deploys with `testnet_skip_online_check = true` (TESTNET-ONLY bypass; the contract itself
 *    refuses this flag on MainNet's genesis hash).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { algo, microAlgo } from "@algorandfoundation/algokit-utils";
import { NETWORKS, microAlgosToAlgo } from "@nodelink/shared";
import { loadOrCreateAccount, balanceOf } from "./lib/accounts";
import { ENV_PATH, REPO_ROOT, makeAlgorand, networkFromEnv, upsertEnv } from "./lib/env";
import { deployProtocol } from "./lib/protocol";

const MIN_DEPLOY_BALANCE = 3_000_000n; // 3 ALGO covers deploy + bootstrap + e2e
// ~30 days of TestNet rounds (~2.8 s/round)
const STATUS_TTL_ROUNDS = 925_000n;

const network = networkFromEnv();
if (network !== "testnet") throw new Error("deploy.ts targets testnet only (use the LocalNet tests for localnet)");
const algorand = await makeAlgorand(network);
const { account: deployer, created } = loadOrCreateAccount(algorand, "DEPLOYER_MNEMONIC");
const addr = deployer.addr.toString();
console.log(`Deployer: ${addr}${created ? " (newly generated; mnemonic saved to .env)" : ""}`);

let balance = await balanceOf(algorand, addr);
console.log(`Balance: ${microAlgosToAlgo(balance)} ALGO`);
if (balance < MIN_DEPLOY_BALANCE) {
  if (process.env.ALGOKIT_DISPENSER_ACCESS_TOKEN) {
    console.log("Requesting TestNet ALGO from the AlgoKit dispenser API…");
    const dispenser = algorand.client.getTestNetDispenserFromEnvironment();
    await algorand.account.ensureFundedFromTestNetDispenserApi(deployer.addr, dispenser, algo(5));
    balance = await balanceOf(algorand, addr);
  }
  if (balance < MIN_DEPLOY_BALANCE) {
    console.error(
      `\nDeployer needs at least ${microAlgosToAlgo(MIN_DEPLOY_BALANCE)} TestNet ALGO.\n` +
        `Fund ${addr} via https://bank.testnet.algorand.network/ or https://lora.algokit.io/testnet/fund\n` +
        `then re-run: npm run deploy:testnet`,
    );
    process.exit(2);
  }
}

const client = await deployProtocol(algorand, deployer, {
  statusTtlRounds: STATUS_TTL_ROUNDS,
  testnetSkipOnlineCheck: true,
});
const appId = client.appId.toString();
console.log(`Deployed NodeLinkProtocol app ${appId} (app address ${client.appAddress.toString()})`);
console.log(`Explorer: ${NETWORKS.testnet.explorer}/application/${appId}`);

upsertEnv(ENV_PATH, { NODELINK_APP_ID: appId, NODELINK_NETWORK: "testnet" });
upsertEnv(resolve(REPO_ROOT, "frontend/.env.local"), { NEXT_PUBLIC_APP_ID: appId, NEXT_PUBLIC_NETWORK: "testnet" });
mkdirSync(resolve(REPO_ROOT, "deployments"), { recursive: true });
writeFileSync(
  resolve(REPO_ROOT, "deployments/testnet.json"),
  JSON.stringify(
    {
      network: "testnet",
      appId,
      appAddress: client.appAddress.toString(),
      deployer: addr,
      rootUpdater: addr,
      statusTtlRounds: STATUS_TTL_ROUNDS.toString(),
      testnetSkipOnlineCheck: true,
      deployedAt: new Date().toISOString(),
      explorer: `${NETWORKS.testnet.explorer}/application/${appId}`,
    },
    null,
    2,
  ) + "\n",
);
void microAlgo;
