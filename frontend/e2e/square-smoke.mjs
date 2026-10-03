/**
 * Square smoke test (001R): the town loads in its sandboxed iframe with no
 * errors, clicking the workshop door opens the proven custody visualization
 * via the validated navigation intent, and exit returns to the Square.
 * Run: node e2e/square-smoke.mjs (backend + vite are started here).
 */
import { spawn } from "node:child_process";
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
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 1. the Square is the home screen: a sandboxed iframe, opaque origin
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  const frameEl = await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  const sandbox = await frameEl.getAttribute("sandbox");
  if (sandbox !== "allow-scripts") fail(`unexpected sandbox attr: ${sandbox}`);
  const src = await frameEl.getAttribute("src");
  if (!src || !src.endsWith("town.html")) fail(`unexpected iframe src: ${src}`);
  await sleep(5000); // let the vignettes get moving
  await page.screenshot({ path: `${shots}/01-square-home.png` });

  // 2. click the workshop door INSIDE the frame -> parent opens the viz
  // (page.mouse: the iframe fills the viewport, so page coords == frame
  // coords; retry a small grid since the camera sways gently)
  let entered = false;
  for (const [x, y] of [[690, 330], [660, 340], [720, 340], [690, 370], [690, 300]]) {
    await page.mouse.click(x, y);
    try {
      await page.waitForFunction(
        () => window.__vizDebug && window.__vizDebug.eventCount >= 4,
        null, { timeout: 15000 }
      );
      entered = true;
      break;
    } catch {}
  }
  if (!entered) fail("workshop door click never opened the viz");
  await sleep(2000);
  await page.screenshot({ path: `${shots}/02-workshop-entered.png` });

  // 3. back to the Square -> the iframe returns
  await page.getByRole("button", { name: "Workshop menu" }).click();
  await page.click("text=Back to the Square");
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(2000);
  await page.screenshot({ path: `${shots}/03-square-returned.png` });

  await browser.close();
  if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
  console.log("SQUARE SMOKE PASS: iframe town, door entry, viz auto-run, return. no page errors.");
} finally {
  kill();
}
