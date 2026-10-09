// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Julian van der Welle
/**
 * Phone-viewport smoke test against a deployed URL (default: production Vercel URL).
 *   BASE_URL=https://nodelink-ten.vercel.app OUT_DIR=. npx tsx tests/mobile-screens.ts
 * Saves full-page screenshots and fails if any page overflows horizontally.
 */
import { chromium, devices } from "playwright-core";

const BASE = process.env.BASE_URL ?? "https://nodelink-ten.vercel.app";
const OUT = process.env.OUT_DIR ?? ".";
const PAGES = ["/", "/health", "/rewards", "/perks", "/setup", "/community", "/link", "/start-node", "/leaderboard"] as const;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
let bad = 0;
for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const { scrollW, offenders } = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll("body *"))
      .filter((el) => el.getBoundingClientRect().right > w + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".")}`);
    return { scrollW: document.documentElement.scrollWidth, offenders };
  });
  const name = p === "/" ? "home" : p.slice(1);
  await page.screenshot({ path: `${OUT}/nodelink-mobile-${name}.png`, fullPage: true });
  const ok = scrollW <= 390;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "WIDE"} ${p} scrollWidth=${scrollW}${ok ? "" : " offenders: " + offenders.join(", ")}`);
}
// wallet modal on mobile
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Menu" }).click();
await page.getByRole("button", { name: /connect wallet/i }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/nodelink-mobile-wallet-modal.png` });
console.log("wallet modal text:", (await page.locator("[role=dialog], .fixed").last().innerText()).replace(/\s+/g, " ").slice(0, 300));
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
process.exit(bad ? 1 : 0);
