// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
/**
 * Phone (390x844) checks for /rewards, /perks, /setup, /start-node.
 *   BASE_URL=… OUT_DIR=… [EXAMPLES=1] npx tsx tests/v3-screens.ts
 * EXAMPLES=1 expects a build with NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT=1 and exercises cards + detail modals.
 */
import { chromium, devices } from "playwright-core";

const BASE = process.env.BASE_URL ?? "https://nodelink-ten.vercel.app";
const OUT = process.env.OUT_DIR ?? ".";
const EXAMPLES = process.env.EXAMPLES === "1";
const PREFIX = process.env.PREFIX ?? "nodelink-v3";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const page = await (await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } })).newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
let failures = 0;
const check = (ok: boolean, msg: string): void => {
  console.log(`${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const noSideScroll = async (label: string): Promise<void> => check((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `${label}: no sideways scroll`);

// rewards
await page.goto(`${BASE}/rewards`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await noSideScroll("/rewards");
check(await page.getByText(EXAMPLES ? "Example: tier boost campaign" : "No reward programs yet").isVisible(), `/rewards: ${EXAMPLES ? "example program card" : "empty state"}`);
check(await page.getByText("Proposals (30d)").isVisible(), "/rewards: live on-chain stats present");
if (EXAMPLES) {
  await page.getByText("Example: tier boost campaign").click();
  check(await page.getByRole("dialog").getByText("Tier multipliers").isVisible(), "/rewards: program detail modal");
  check(page.url().includes("program=example-tier-boost"), "/rewards: deep link ?program=");
  await page.screenshot({ path: `${OUT}/${PREFIX}-rewards-modal.png` });
  await page.getByLabel("Close").click();
}
await page.screenshot({ path: `${OUT}/${PREFIX}-rewards.png`, fullPage: true });

// perks
await page.goto(`${BASE}/perks`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await noSideScroll("/perks");
if (EXAMPLES) {
  check(await page.getByText("Example: swap-fee rebate").isVisible(), "/perks: example card");
  await page.getByRole("tab", { name: /Ended/ }).click();
  check(await page.getByText("No perks match these filters").isVisible(), "/perks: filter → empty-filter state");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByText("Example: swap-fee rebate").click();
  check(await page.getByRole("dialog").getByText(/Requires Guardian badge/).isVisible(), "/perks: detail modal shows tier lock CTA");
  check(page.url().includes("perk=example-swap-rebate"), "/perks: deep link ?perk=");
  await page.screenshot({ path: `${OUT}/${PREFIX}-perks-modal.png` });
  await page.getByLabel("Close").click();
} else {
  check(await page.getByText("No perks yet").isVisible(), "/perks: empty state");
}
await page.screenshot({ path: `${OUT}/${PREFIX}-perks.png`, fullPage: true });

// setup
await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /Renew participation key/ }).click();
check(await page.getByText("With NodeKit (recommended)").first().isVisible(), "/setup: NodeKit leads in shortcut");
check(await page.getByText("Manual (goal) alternative").first().isVisible(), "/setup: manual collapsed below");
await noSideScroll("/setup");
await page.screenshot({ path: `${OUT}/${PREFIX}-setup.png`, fullPage: true });

// start-node
await page.goto(`${BASE}/start-node`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
check(await page.getByText("wget -qO- https://nodekit.run/install.sh | bash").first().isVisible(), "/start-node: NodeKit install one-liner");
check(!(await page.getByText("sudo apt install -y algorand").isVisible()), "/start-node: manual steps collapsed");
await noSideScroll("/start-node");
await page.screenshot({ path: `${OUT}/${PREFIX}-start-node.png`, fullPage: true });

console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
process.exit(failures ? 1 : 0);
