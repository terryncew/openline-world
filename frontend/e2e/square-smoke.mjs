/**
 * Square smoke test: the town loads with no errors, the workshop door
 * opens the proven custody visualization, and exit returns to the Square.
 * Run: npm run test:square (backend + vite are started here).
 */
import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const BACKEND_PORT = 8481;
const VITE_PORT = 5182;
const shots = resolve(frontend, "src/square/screenshots");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}
const fail = (m) => { console.error("SMOKE FAIL: " + m); process.exit(1); };

for (const p of [BACKEND_PORT, VITE_PORT]) {
  try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch {}
}
await sleep(500);
const env = { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) };
const backend = spawn("python3", ["backend/server.py"], { cwd: repo, env, stdio: "ignore" });
const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: frontend, env, stdio: "ignore" });
const kill = () => { try { backend.kill(); } catch {} try { vite.kill(); } catch {} };
process.on("exit", kill);

try {
  await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
  await waitFor(`http://127.0.0.1:${VITE_PORT}/`);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 1. the Square is the home screen
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".square-view canvas", { timeout: 30000 });
  await sleep(4000); // let robots wander into frame
  await page.screenshot({ path: `${shots}/01-square-home.png` });

  // 2. enter the workshop -> the proven custody viz appears and auto-runs
  await page.click("button.square-enter");
  await page.waitForFunction(
    () => window.__vizDebug && window.__vizDebug.eventCount >= 4,
    null, { timeout: 60000 }
  );
  await sleep(2500);
  await page.screenshot({ path: `${shots}/02-workshop-entered.png` });
  const dbg = await page.evaluate(() => window.__vizDebug);
  if (!dbg || dbg.eventCount < 4) fail("viz did not start inside the workshop");

  // 3. exit returns to the Square
  await page.click("text=Back to the Square");
  await page.waitForSelector(".square-view canvas", { timeout: 15000 });
  await sleep(1500);
  await page.screenshot({ path: `${shots}/03-square-returned.png` });

  if (errors.length) fail("page errors: " + errors.join(" | "));
  await browser.close();
  console.log("SQUARE SMOKE PASS: home, workshop entry (viz auto-ran), return. no page errors.");
} finally {
  kill();
}
