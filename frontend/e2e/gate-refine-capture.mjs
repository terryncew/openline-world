/**
 * Gate-refinement capture: before/after the threshold-machine pass.
 * frontend/e2e/gate-refine-capture.mjs
 *
 * Run: node e2e/gate-refine-capture.mjs before|after   (from frontend/)
 *
 * Drives the real demo (reset + 9 advances) through the real backend,
 * then scrubs the cursor to the ALLOWED and STOPPED decision beats and
 * screenshots them at desktop (1280x800) and portrait (390x844).
 * In "after" mode the desktop run also records video; the last 7s
 * (the STOP beat, fired by the scrub) is trimmed into stop-beat-clip.mp4.
 *
 * Beats: decision[0] = wren notes.read ALLOWED; decision[2] = wren
 * config.write STOPPED; decision[4] = juniper notes.write ALLOWED (used
 * to re-open the grille so the STOPPED capture always gets the slam).
 * Timing note: under SwiftShader (~2fps) the gate's own damp is
 * frame-rate independent (raw dt), but the camera rig still damps slowly,
 * so the allowed shot waits 8s wall for the camera to settle on-axis.
 * The stopped shot fires at +0.7s wall (slam + ring + lighting at peak).
 * On real 60fps hardware these beats land at their designed anim-times.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const SHOTS = resolve(frontend, "src", "viz", "screenshots", "gate-refine");
mkdirSync(SHOTS, { recursive: true });

const mode = process.argv[2] === "after" ? "after" : "before";
const BACKEND_PORT = 18472;
const VITE_PORT = 15174;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function driveDemo(page) {
  await page.goto(`http://127.0.0.1:${VITE_PORT}/?view=viz`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => window.__vizDebug && window.__vizDebug.eventCount >= 2, null, { timeout: 20000 });
  await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/reset`, { method: "POST" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => window.__vizDebug && window.__vizDebug.eventCount >= 2, null, { timeout: 20000 });
  for (let i = 0; i < 9; i++) {
    const r = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/advance`, { method: "POST" });
    const j = await r.json();
    if (j.finished && i < 8) throw new Error(`demo finished early at step ${i}`);
    await sleep(400);
  }
  await page.waitForFunction(
    () => window.__vizDebug && window.__vizDebug.eventCount >= 23, null, { timeout: 90000 });
  await sleep(1500);
}

async function captureBeats(page, tag, shot) {
  await page.evaluate(() => window.__vizDebug.goLive());
  await sleep(2500); // camera settles at world view
  const seqs = await page.evaluate(() => {
    const dbg = window.__vizDebug;
    const ds = dbg.events.filter((e) => e.kind === "decision").map((e) => e.seq);
    return { allowed: ds[0], stopped: ds[2], allowedLast: ds[4] };
  });
  if (seqs.allowed == null || seqs.stopped == null || seqs.allowedLast == null) {
    throw new Error("decision seqs missing");
  }
  // ALLOWED: settled camera, grille fully open (6s wall: the gate's own
  // damp is frame-rate independent now, but the camera rig still damps
  // slowly under SwiftShader, so give it time to settle on-axis; the
  // 12s hold keeps the gate open)
  await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.allowed);
  await sleep(6000);
  await page.screenshot({ path: shot(`${mode}-${tag}-allowed.png`) });
  // re-open the grille via juniper's ALLOWED so the STOPPED beat slams
  await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.allowedLast);
  await sleep(3000);
  // STOPPED: the slam + decision lighting at the beat's peak
  await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.stopped);
  await sleep(700);
  await page.screenshot({ path: shot(`${mode}-${tag}-stopped.png`) });
  return seqs;
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
    cwd: frontend, env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) }, stdio: "ignore",
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

    // desktop run (stills only)
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await driveDemo(page);
      await captureBeats(page, "desktop", (n) => `${SHOTS}/${n}`);
      await page.close();
      await ctx.close();
      const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
      if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
    }

    // portrait run (stills only)
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await driveDemo(page);
      await captureBeats(page, "portrait", (n) => `${SHOTS}/${n}`);
      await page.close();
      await ctx.close();
      const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
      if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
    }

    await browser.close();
    console.log(`CAPTURE ${mode.toUpperCase()} OK ->`, SHOTS);
  } finally {
    kill();
  }
}

main().catch((e) => { console.error("CAPTURE FAIL:", e.message); process.exit(1); });
