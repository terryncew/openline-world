/**
 * Demo cancellation test (001R defect b): exiting the workshop (or
 * unmounting VizView) must stop FUTURE /api/demo/advance POSTs immediately.
 *
 * Documented limitation: a request already in flight when cancellation
 * lands may still complete — the backend cannot un-send a request it has
 * received. This test asserts NO NEW POST is issued after cancel.
 *
 * Run: node e2e/cancel-demo.mjs (backend + vite are started here).
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const BACKEND_PORT = 8483;
const VITE_PORT = 5184;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}
const fail = (m) => { console.error("CANCEL FAIL: " + m); process.exit(1); };


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

  // count /api/demo/advance POSTs at the network layer
  let advancePosts = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/demo/advance") && r.method() === "POST") advancePosts++;
  });

  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(6000);

  // enter the workshop via the door; the demo auto-runs
  await page.mouse.click(640, 350);
  await page.waitForFunction(() => !!document.querySelector(".viz-root"), null, { timeout: 30000 });
  await sleep(4000); // let a few advances fire
  const postsBeforeExit = advancePosts;
  console.log(`advance POSTs before exit: ${postsBeforeExit}`);
  if (postsBeforeExit < 1) fail("demo never started posting advances");

  // exit the workshop -> VizView unmounts
  await page.getByRole("button", { name: "Workshop menu" }).click();
  await page.click("text=Back to the Square");
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(8000); // longer than two advance intervals (9 x 1.2s holds)

  const postsAfterExit = advancePosts;
  console.log(`advance POSTs after exit+8s: ${postsAfterExit}`);
  // allow at most ONE in-flight request to have completed after cancel
  if (postsAfterExit > postsBeforeExit + 1) {
    fail(`demo kept posting after exit: ${postsBeforeExit} -> ${postsAfterExit}`);
  }
  console.log("CANCEL PASS: no new demo advances after exit (<=1 in-flight).");
  await browser.close();
} finally {
  kill();
}
