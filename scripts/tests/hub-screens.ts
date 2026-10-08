/**
 * Phone screenshots of the hub (390x844) + layout assertions:
 *  - no horizontal overflow, A–D tiles roughly square, E bar spans the grid width.
 *   BASE_URL=https://nodelink-ten.vercel.app WATCH=<testnet node address> npx tsx tests/hub-screens.ts
 */
import { chromium, devices } from "playwright-core";

const BASE = process.env.BASE_URL ?? "https://nodelink-ten.vercel.app";
const OUT = process.env.OUT_DIR ?? "/workspace";
const WATCH = process.env.WATCH;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
let failures = 0;
const check = (ok: boolean, msg: string): void => {
  console.log(`${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures++;
};
const overflow = async (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const tiles = await page.locator('[aria-label="NodeLink hub"] > a').evaluateAll((els) =>
  els.map((el) => {
    const r = el.getBoundingClientRect();
    return { label: el.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
  }),
);
check(tiles.length === 5, `5 hub sections (${tiles.map((t) => t.label).join(" | ")})`);
for (const t of tiles.slice(0, 4)) check(Math.abs(t.w - t.h) <= 2, `square tile "${t.label}" ${t.w}x${t.h}`);
const bar = tiles[4];
const gridW = tiles[1] && tiles[0] ? tiles[1].x + tiles[1].w - tiles[0].x : 0;
check(bar !== undefined && Math.abs(bar.w - gridW) <= 2 && bar.y > (tiles[2]?.y ?? 0), `full-width bar "${bar?.label}" ${bar?.w}px below grid (grid ${gridW}px)`);
check((await overflow()) <= 390, `home: no sideways scroll`);
await page.screenshot({ path: `${OUT}/nodelink-hub-home.png` });

if (WATCH) {
  await page.evaluate((addr) => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(":watch")) ?? `nodelink:v1:${document.body.dataset.appId ?? "773918931"}:watch`;
    localStorage.setItem(k, addr);
  }, WATCH);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/nodelink-hub-home-watching.png` });
}

for (const tab of ["health", "rewards", "perks", "setup", "community"] as const) {
  await page.goto(`${BASE}/${tab}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(tab === "rewards" ? 3500 : 2000);
  check((await overflow()) <= 390, `/${tab}: no sideways scroll`);
  check((await page.locator('[role="tab"][aria-selected="true"]').count()) === 1, `/${tab}: tab strip marks active tab`);
  await page.screenshot({ path: `${OUT}/nodelink-hub-${tab}.png`, fullPage: tab === "health" });
}
console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
process.exit(failures ? 1 : 0);
