/**
 * Synthetic scale benchmark for the OpenLine World visualization.
 * frontend/e2e/viz-bench.mjs
 *
 * Run: npm run test:bench   (from frontend/)
 *
 * Loads ?view=viz&vizbench=N for N in 10/100/1000, feeds N synthetic
 * workers (+proposals/decisions/receipts through the same reducer path),
 * and measures average FPS over ~5s via rAF deltas plus JS heap when
 * available. Prints a table; paste the numbers into src/viz/BENCHMARK.md.
 *
 * Mobile Safari cannot be tested in this environment — the adaptive
 * fidelity measures (dpr cap, instancing, no postprocessing) are described
 * in BENCHMARK.md instead.
 */
import { spawn, execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");

const BACKEND_PORT = 18472;
const VITE_PORT = 15174;
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";

function waitFor(url, timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolveP, rejectP) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolveP(true);
      } catch { /* retry */ }
      if (Date.now() - t0 > timeoutMs) return rejectP(new Error(`timeout ${url}`));
      setTimeout(tick, 300);
    };
    tick();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function benchAt(page, n) {
  await page.goto(`http://127.0.0.1:${VITE_PORT}/?view=viz&vizbench=${n}`, { waitUntil: "networkidle" });
  // wait for the bench overlay to report
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".viz-bench");
      return el && /fps=/.test(el.textContent || "");
    },
    null, { timeout: 30000 }
  );
  const text = await page.evaluate(() => document.querySelector(".viz-bench").textContent);
  const heap = await page.evaluate(() => (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + "MB" : "n/a"));
  return { n, text, heap };
}

async function main() {
  for (const p of [BACKEND_PORT, VITE_PORT]) {
    try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch { /* none */ }
  }
  await sleep(500);
  const backend = spawn("python3", ["backend/server.py"], {
    cwd: repo, env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) }, stdio: "ignore",
  });
  const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    // the bench harness needs synthetic events: opt into the build flag
    // (default builds ignore ?vizbench= — see VizView benchN).
    cwd: frontend, env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT), VITE_ENABLE_VIZBENCH: "1" }, stdio: "ignore",
  });
  const kill = () => { backend.kill(); vite.kill(); };
  process.on("exit", kill);
  try {
    await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
    await waitFor(`http://127.0.0.1:${VITE_PORT}/`);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const results = [];
    for (const n of [10, 100, 1000]) {
      const r = await benchAt(page, n);
      results.push(r);
      console.log(`N=${r.n}: ${r.text} (page heap ${r.heap})`);
    }
    await browser.close();
    console.log("BENCH DONE");
  } finally {
    kill();
  }
}

main().catch((e) => { console.error("BENCH FAIL:", e.message); process.exit(1); });
