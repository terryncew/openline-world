/**
 * Capture script for WORLD-AUTHORITY-001.
 * frontend/e2e/authority-capture.mjs
 *
 * Run: node e2e/authority-capture.mjs   (from frontend/)
 *
 * Starts the real backend + vite dev server, loads ?view=authority
 * (the demo auto-runs on mount through the real POST endpoints —
 * the capture driver never POSTs; the page's director does), waits
 * for the demo to complete, and produces:
 *   - desktop still  (1280x800)  -> src/viz/screenshots/authority-desktop.png
 *   - portrait still (390x844)   -> src/viz/screenshots/authority-portrait.png
 *   - 30s video     (1280x800)  -> src/viz/screenshots/authority-demo.webm
 *
 * Asserts the logical beat sequence via window.__authorityDebug before
 * capturing: job anchored, wren revoked, juniper admitted, 3 receipts,
 * 1 unadmitted proposal resting.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const SHOTS = resolve(frontend, "src", "viz", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BACKEND_PORT = 18472;
const VITE_PORT = 15174;

function waitFor(url, timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolveP, rejectP) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolveP(true);
      } catch { /* retry */ }
      if (Date.now() - t0 > timeoutMs) return rejectP(new Error(`timeout waiting for ${url}`));
      setTimeout(tick, 300);
    };
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (const p of [BACKEND_PORT, VITE_PORT]) {
    try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch { /* none */ }
  }
  await sleep(500);
  const backend = spawn("python3", ["backend/server.py"], {
    cwd: repo, env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) },
    stdio: "ignore",
  });
  const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: frontend,
    env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) },
    stdio: "ignore",
  });
  const kill = () => { backend.kill(); vite.kill(); };
  process.on("exit", kill);

  try {
    await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
    await waitFor(`http://127.0.0.1:${VITE_PORT}/`);

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });

    // ---- desktop: video + still ----
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: SHOTS, size: { width: 1280, height: 800 } },
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${VITE_PORT}/?view=authority`, { waitUntil: "networkidle" });

    // wait for the demo to complete AND the paced reveal to drain.
    // (the director finishes posting before the reveal holds elapse)
    await page.waitForFunction(
      () => window.__authorityDebug
        && window.__authorityDebug.demoDone === true
        && window.__authorityDebug.eventCount >= 18,
      null, { timeout: 120000 }
    );
    // let the ending frame settle
    await sleep(2500);

    const dbg = await page.evaluate(() => window.__authorityDebug);
    assert.ok(dbg.job, "job anchored");
    assert.deepEqual(
      dbg.workers.map((w) => `${w.id}:${w.admitted ? "admitted" : "unadmitted"}:${w.active ? "active" : "inactive"}`).sort(),
      ["juniper:admitted:active", "wren:admitted:inactive"]
    );
    assert.equal(dbg.receipts.length, 3, "three receipts survive");
    assert.equal(dbg.unadmitted.length, 1, "one unadmitted proposal rests");
    assert.equal(dbg.unadmitted[0].action, "notes.rewrite");
    assert.equal(errors.length, 0, `page errors: ${errors.join("; ")}`);

    await page.screenshot({ path: resolve(SHOTS, "authority-desktop.png") });
    const videoPath = await page.video().path();
    await ctx.close();
    // move the video to its canonical name
    execSync(`mv "${videoPath}" "${resolve(SHOTS, "authority-demo.webm")}"`);
    console.log("desktop still + video captured; beats verified");

    // ---- portrait: still ----
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      isMobile: true,
    });
    const mpage = await mctx.newPage();
    const merrors = [];
    mpage.on("pageerror", (e) => merrors.push(String(e)));
    await mpage.goto(`http://127.0.0.1:${VITE_PORT}/?view=authority`, { waitUntil: "networkidle" });
    await mpage.waitForFunction(
      () => window.__authorityDebug
        && window.__authorityDebug.demoDone === true
        && window.__authorityDebug.eventCount >= 18,
      null, { timeout: 120000 }
    );
    await sleep(2500);
    const mdbg = await mpage.evaluate(() => window.__authorityDebug);
    assert.equal(mdbg.receipts.length, 3);
    assert.equal(merrors.length, 0, `mobile page errors: ${merrors.join("; ")}`);
    await mpage.screenshot({ path: resolve(SHOTS, "authority-portrait.png") });
    await mctx.close();
    console.log("portrait still captured");

    await browser.close();
    console.log("OK");
  } finally {
    kill();
  }
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
