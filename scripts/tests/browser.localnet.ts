/**
 * Full browser E2E on LocalNet with headless Chrome (playwright-core):
 *   /link step 1 (cold: deposit + encrypted backup download) -> root updater ->
 *   /link step 2 (hot: import backup, Merkle path, IN-BROWSER snarkjs proof, claim) -> hub tabs (/health, /perks)
 *
 * Prereqs: `algokit localnet start`, a LocalNet deployment (NODELINK_NETWORK=localnet npm run deploy),
 * and the frontend dev server started with NEXT_PUBLIC_NETWORK=localnet NEXT_PUBLIC_APP_ID=<id>.
 *   BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/google-chrome npx tsx tests/browser.localnet.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { microAlgo } from "@algorandfoundation/algokit-utils";
import algosdk from "algosdk";
import { chromium } from "playwright-core";
import { REPO_ROOT, makeAlgorand } from "../lib/env";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = resolve(REPO_ROOT, "docs/screenshots");
mkdirSync(OUT, { recursive: true });

const algorand = await makeAlgorand("localnet");
const coldAcct = algosdk.generateAccount();
const hotAcct = algosdk.generateAccount();
await algorand.account.ensureFundedFromEnvironment(coldAcct.addr, microAlgo(5_000_000));
await algorand.account.ensureFundedFromEnvironment(hotAcct.addr, microAlgo(1_000_000));
const coldMn = algosdk.secretKeyToMnemonic(coldAcct.sk);
const hotMn = algosdk.secretKeyToMnemonic(hotAcct.sk);
let currentMnemonic = coldMn;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
page.on("dialog", (d) => void (d.type() === "prompt" ? d.accept(currentMnemonic) : d.accept()));
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

const step = (s: string): void => console.log(`STEP  ${s}`);

async function connectMnemonic(): Promise<void> {
  await page.getByRole("button", { name: /Connect (Cold|Hot) Wallet|^[A-Z0-9]{5}…/ }).first().click();
  const row = page.locator("li", { hasText: "Mnemonic" });
  if (await row.getByLabel("Disconnect").isVisible()) await row.getByLabel("Disconnect").click();
  await row.getByRole("button", { name: "Connect" }).click();
  await row.getByText("active").waitFor({ timeout: 15_000 });
  await page.getByLabel("Close").click();
}

try {
  step("landing page renders + live stats");
  await page.goto(BASE);
  await page.getByText("Claim your perks hot.").waitFor();
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: resolve(OUT, "landing.png"), fullPage: true });

  step("start-node guide renders");
  await page.goto(`${BASE}/start-node`);
  await page.getByText("Fast catchup").waitFor();
  await page.screenshot({ path: resolve(OUT, "start-node.png"), fullPage: true });

  step("link wizard step 1: connect cold wallet");
  await page.goto(`${BASE}/link`);
  await connectMnemonic();
  await page.getByText("Choose the tier to attest").waitFor({ timeout: 20_000 });
  await page.fill("#pass", "correct horse battery staple");
  await page.fill("#pass2", "correct horse battery staple");
  await page.screenshot({ path: resolve(OUT, "link-step1.png"), fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Generate secrets, export backup & deposit/ }).click();
  const download = await downloadPromise;
  const backupPath = resolve("/tmp", download.suggestedFilename());
  await download.saveAs(backupPath);
  await page.getByText("Commitment deposited").waitFor({ timeout: 60_000 });
  step(`deposit confirmed; encrypted backup saved (${download.suggestedFilename()})`);

  step("root updater posts the new root");
  const out = execFileSync("npx", ["tsx", "root-updater.ts"], {
    cwd: resolve(REPO_ROOT, "scripts"),
    env: { ...process.env, NODELINK_NETWORK: "localnet" },
    encoding: "utf8",
  });
  console.log("      " + out.trim().split("\n").at(-1));

  step("link wizard step 2: switch to hot wallet, import backup, prove in browser, claim");
  await page.getByRole("button", { name: "Continue to hot activation" }).click();
  currentMnemonic = hotMn;
  await connectMnemonic();
  await page.setInputFiles("#backup", backupPath);
  await page.fill("#hpass", "correct horse battery staple");
  await page.getByRole("button", { name: "Unlock backup" }).click();
  await page.getByRole("button", { name: "Fetch Merkle path" }).click();
  await page.getByText(/anonymity set/).waitFor({ timeout: 30_000 });
  const t0 = Date.now();
  await page.getByRole("button", { name: /Generate proof & activate hot wallet/ }).click();
  await page.getByText("Hot wallet activated").waitFor({ timeout: 180_000 });
  step(`hot wallet activated (browser proof + on-chain verify in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await page.screenshot({ path: resolve(OUT, "link-step2.png"), fullPage: true });

  step("hub health tab shows badge + cold telemetry from local session; perks tab unlocked");
  // client-side navigation: the test-only Mnemonic wallet does not persist across full reloads
  await page.getByRole("link", { name: "Open your node hub" }).click();
  await page.getByText("Tier 1 · 1.00x reward multiplier").waitFor({ timeout: 30_000 });
  await page.getByText("from private link").waitFor();
  await page.screenshot({ path: resolve(OUT, "hub-health.png"), fullPage: true });
  await page.getByRole("tab", { name: "Perks" }).click();
  await page.getByText("Ecosystem Launchpad").waitFor();
  await page.getByText("Scout perks unlocked").waitFor();

  step("leaderboard renders (no public profiles yet)");
  await page.getByRole("tab", { name: "Community" }).click();
  await page.getByRole("link", { name: /Full leaderboard/ }).click();
  await page.getByText(/No public profiles yet|Community leaderboard/).first().waitFor();
  console.log("\nBROWSER E2E (LocalNet): ALL STEPS PASSED");
} catch (err) {
  await page.screenshot({ path: "/tmp/browser-failure.png", fullPage: true });
  console.error("BROWSER E2E FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
