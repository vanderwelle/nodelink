/**
 * v4 phone (390x844) verification: hub telemetry reads MAINNET, contract stays TESTNET.
 *   BASE_URL=https://nodelink-ten.vercel.app ADDR=<mainnet node> npx tsx tests/v4-screens.ts
 * Read-only: watches a public MainNet address via localStorage; no wallet, no transactions.
 */
import { chromium, devices, type Request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "https://nodelink-ten.vercel.app";
const OUT = process.env.OUT_DIR ?? "/workspace";
const PREFIX = process.env.PREFIX ?? "nodelink-v4";
const APP_ID = process.env.APP_ID ?? "773918931";
const ADDR = process.env.ADDR ?? "QNGQXHUFFMY6KOXBBJFYQHV6BN52YUANDRHPV4EMNANJJRPGMSR6M3GXQE";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const hosts = new Map<string, number>();
const statuses: string[] = [];
page.on("request", (r: Request) => {
  const h = new URL(r.url()).host;
  if (/nodely|algonode/.test(h)) hosts.set(h, (hosts.get(h) ?? 0) + 1);
});
page.on("response", (r) => {
  if (/nodely|algonode/.test(r.url()) && r.status() >= 400) statuses.push(`${r.status()} ${r.url().slice(0, 90)}`);
});
let failures = 0;
const check = (ok: boolean, msg: string): void => {
  console.log(`${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const noSideScroll = async (label: string): Promise<void> => check((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `${label}: no sideways scroll`);
const indexerCount = (): number => [...hosts].filter(([h]) => h.includes("idx")).reduce((a, [, n]) => a + n, 0);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(([k, a]) => window.localStorage.setItem(k, a), [`nodelink:v1:${APP_ID}:watch`, ADDR] as const);

// hub
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText(/MainNet round [\d,]+/).waitFor({ timeout: 20_000 });
const heroRound = Number(((await page.getByText(/MainNet round [\d,]+/).first().textContent()) ?? "").replace(/\D/g, ""));
check(heroRound > 50_000_000, `hub: MainNet round in hero (${heroRound.toLocaleString()})`);
await page.getByRole("link", { name: "Node health & alerts" }).getByText("Online", { exact: true }).waitFor({ timeout: 20_000 });
check(true, "hub: health tile shows MainNet 'Online'");
await noSideScroll("hub");
await page.screenshot({ path: `${OUT}/${PREFIX}-hub.png`, fullPage: true });

// health
await page.goto(`${BASE}/health`, { waitUntil: "networkidle" });
await page.getByText("Eligible tier based on MainNet balance").waitFor({ timeout: 20_000 });
check(await page.getByText("All checks passed").or(page.getByText(/expires|not online|eligible/i).first()).first().isVisible(), "/health: alerts rendered");
check((await page.locator('[data-net="telemetry"]').count()) >= 3, "/health: 'MainNet data' pills");
check(await page.locator('[data-testid="estimated-tier"]').getByText("estimate").isVisible(), "/health: estimated tier card labelled 'estimate'");
const consensus = await page.getByText("Consensus", { exact: true }).locator("..").textContent();
check(/Online/.test(consensus ?? ""), `/health: consensus Online (${consensus?.replace(/\s+/g, " ").slice(0, 60)})`);
const keyExpiry = await page.getByText("Part. key expiry", { exact: true }).locator("..").textContent();
console.log(`      key expiry card: ${keyExpiry?.replace(/\s+/g, " ")}`);
const lastProp = await page.getByText("Last proposal", { exact: true }).locator("..").textContent();
console.log(`      last proposal card: ${lastProp?.replace(/\s+/g, " ")}`);
await noSideScroll("/health");
await page.screenshot({ path: `${OUT}/${PREFIX}-health.png`, fullPage: true });

// rewards (first load)
const idxBefore = indexerCount();
await page.goto(`${BASE}/rewards`, { waitUntil: "networkidle" });
await page.getByText("Recent proposals").waitFor({ timeout: 45_000 });
await page.waitForTimeout(1500);
const stats = await page.locator("section").first().textContent();
const statsText = (await page.getByText(/Proposals \(30d\)/).locator("..").textContent()) ?? "";
const payoutsText = (await page.getByText(/Payouts \(30d\)/).locator("..").textContent()) ?? "";
const aprText = (await page.getByText("Realized APR", { exact: true }).locator("..").textContent()) ?? "";
console.log(`      ${statsText.replace(/\s+/g, " ")} | ${payoutsText.replace(/\s+/g, " ")} | ${aprText.replace(/\s+/g, " ")}`);
void stats;
check(/\d/.test(statsText.replace("30d", "")), "/rewards: proposal count loaded");
check((await page.locator('[data-net="contract"]').count()) >= 1, "/rewards: programs labelled 'TestNet preview'");
const firstLoadIdx = indexerCount() - idxBefore;
await noSideScroll("/rewards");
await page.screenshot({ path: `${OUT}/${PREFIX}-rewards.png`, fullPage: true });

// rewards reload → past day windows come from localStorage
const idxBefore2 = indexerCount();
await page.reload({ waitUntil: "networkidle" });
await page.getByText("Recent proposals").waitFor({ timeout: 45_000 });
const reloadIdx = indexerCount() - idxBefore2;
check(reloadIdx < firstLoadIdx, `/rewards: cache — indexer requests first load ${firstLoadIdx}, reload ${reloadIdx}`);

// setup + start-node
await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
await page.getByText(/prefilled for your node from MainNet round/).waitFor({ timeout: 20_000 });
check(true, "/setup: commands prefilled from MainNet round");
await noSideScroll("/setup");
await page.goto(`${BASE}/start-node`, { waitUntil: "networkidle" });
check(await page.getByText(/read your node.s public MainNet data/).isVisible(), "/start-node: 'Which network?' note updated");

console.log("\nRPC hosts used:", Object.fromEntries(hosts));
if (statuses.length) console.log("HTTP errors seen:", statuses.slice(0, 10));
check(![...hosts.keys()].some((h) => h.startsWith("testnet-idx")), "no TestNet indexer use for telemetry pages");
check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nV4 CHECKS PASSED");
process.exit(failures ? 1 : 0);
