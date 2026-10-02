/** Verify ?static=1 works with ZERO backend access: abort every /api/* request. */
import { spawn, execSync } from "node:child_process";
import { resolve } from "node:path";

const frontend = resolve("/home/hatch/workspace/openline-world/frontend");
const VITE_PORT = 5184;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}
for (const p of [VITE_PORT]) { try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch {} }
await sleep(500);
const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: frontend, stdio: "ignore" });
process.on("exit", () => { try { vite.kill(); } catch {} });
try {
  await waitFor(`http://127.0.0.1:${VITE_PORT}/`);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  let apiHits = 0;
  await page.route("**/api/**", (route) => { apiHits++; route.abort(); });
  await page.goto(`http://127.0.0.1:${VITE_PORT}/?static=1`, { waitUntil: "networkidle" });
  await sleep(5000); // let the 3D scene mount
  console.log("square-view count:", await page.locator(".square-view").count());
  console.log("enter-btn count:", await page.locator("text=Enter the workshop").count());
  console.log("body text sample:", (await page.locator("body").innerText()).slice(0, 200));
  // square is home; enter the workshop (auto-runs the recorded demo)
  await page.click("text=Enter the workshop");
  await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 23, null, { timeout: 60000, polling: 1000 });
  await sleep(3000);
  const btn = await page.textContent(".viz-timeline-row .viz-btn.primary");
  const dbg = await page.evaluate(() => ({ n: window.__vizDebug.eventCount }));
  console.log(`STATIC CHECK: events=${dbg.n} apiHits=${apiHits} button="${btn}" pageErrors=${errors.length}`);
  if (dbg.n < 23 || apiHits > 0 || errors.length > 0) throw new Error("static check failed");
  console.log("STATIC CHECK PASS");
  await browser.close();
} finally { try { vite.kill(); } catch {} }
