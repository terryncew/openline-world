/**
 * Workroom capture: before/after the workroom pass.
 * frontend/e2e/workroom-capture.mjs
 *
 * Run: node e2e/workroom-capture.mjs before|after   (from frontend/)
 *
 * Drives the real demo (reset + 9 advances) through the real backend,
 * switches to the Worker/Workroom camera view, and screenshots the
 * preparing beat (cursor at the first mandate) and an in-flight proposal
 * beat at desktop (1280x800) and portrait (390x844). In "after" mode it
 * also records a portrait clip of the full spatial sequence:
 * bench -> assemble -> carry -> gate decides (ALLOWED then STOPPED),
 * staged by scrubbing the cursor between real event seqs.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const SHOTS = resolve(frontend, "src", "viz", "screenshots", "workroom");
mkdirSync(SHOTS, { recursive: true });

const mode = process.argv[2] === "after" ? "after" : "before";
const TAG_LABEL = mode === "after" ? "Workroom" : "Worker";
const BACKEND_PORT = 18474;
const VITE_PORT = 15176;
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

async function toWorkerView(page) {
  await page.evaluate(() => window.__vizDebug.goLive());
  await sleep(1000);
  await page.getByRole("button", { name: TAG_LABEL }).click();
  await sleep(3500); // camera damps to the workroom framing
}

async function captureStills(page, tag) {
  const seqs = await page.evaluate(() => {
    const dbg = window.__vizDebug;
    const mandates = dbg.events.filter((e) => e.kind === "mandate").map((e) => e.seq);
    const proposals = dbg.events.filter((e) => e.kind === "proposal").map((e) => e.seq);
    return { mandate: mandates[0], proposal: proposals[0] };
  });
  // preparing beat: worker at the bench, mandate fresh
  await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.mandate);
  await sleep(2500);
  await page.screenshot({ path: `${SHOTS}/${mode}-${tag}-workroom-preparing.png` });
  // in-flight beat: proposal traveling (carry, mid-walk)
  await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.proposal);
  await sleep(2600);
  await page.screenshot({ path: `${SHOTS}/${mode}-${tag}-workroom-carry.png` });
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
  let stamps = null;

  try {
    await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
    await waitFor(`http://127.0.0.1:${VITE_PORT}/`);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });

    for (const tag of ["desktop", "portrait"]) {
      const vp = tag === "desktop" ? { width: 1280, height: 800 } : { width: 390, height: 844 };
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await driveDemo(page);
      await toWorkerView(page);
      await captureStills(page, tag);
      await page.close();
      await ctx.close();
      const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
      if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
    }

    // after-mode clip: portrait, full spatial sequence, staged by scrub
    if (mode === "after") {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        recordVideo: { dir: SHOTS, size: { width: 390, height: 844 } },
      });
      const page = await ctx.newPage();
      const tPage = Date.now();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await driveDemo(page);
      await toWorkerView(page);
      const seqs = await page.evaluate(() => {
        const dbg = window.__vizDebug;
        const ps = dbg.events.filter((e) => e.kind === "proposal").map((e) => e.seq);
        const ds = dbg.events.filter((e) => e.kind === "decision").map((e) => e.seq);
        return { propA: ps[0], allowA: ds[0], propB: ps[2], stopB: ds[2] };
      });
      // bench -> assemble -> carry -> wait at the gate.
      // Wait for each scrub to land (SwiftShader evaluate latency is
      // real) so the trim offset is exact.
      const tSeq0 = Date.now();
      await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.propA);
      await page.waitForFunction((s) => window.__vizDebug && window.__vizDebug.seq === s,
        seqs.propA, { timeout: 15000 });
      const tSeq = Date.now();
      await sleep(5200);
      // ALLOWED: packet passes, worker settles
      await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.allowA);
      await page.waitForFunction((s) => window.__vizDebug && window.__vizDebug.seq === s,
        seqs.allowA, { timeout: 15000 });
      await sleep(3200);
      // second carry, then STOPPED: slam + halt reaction
      await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.propB);
      await page.waitForFunction((s) => window.__vizDebug && window.__vizDebug.seq === s,
        seqs.propB, { timeout: 15000 });
      await sleep(5200);
      await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.stopB);
      await page.waitForFunction((s) => window.__vizDebug && window.__vizDebug.seq === s,
        seqs.stopB, { timeout: 15000 });
      await sleep(5000);
      const videoPath = await page.video()?.path();
      await page.close();
      await ctx.close();
      const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
      if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
      stamps = { tPage, tSeq, videoPath };
    }

    await browser.close();
    console.log(`CAPTURE ${mode.toUpperCase()} OK ->`, SHOTS);
  } finally {
    kill();
  }

  if (stamps) {
    const { tPage, tSeq, videoPath } = stamps;
    // Start 1s after the scrub lands: R3F needs a frame to settle on the
    // new state (SwiftShader ~2fps), else the first second shows a stale
    // canvas. 18.7s covers propA -> allowA -> propB -> stopB.
    const offset = Math.max(0, (tSeq - tPage) / 1000 + 1.0);
    const out = resolve(SHOTS, "workroom-sequence-clip.mp4");
    execSync(`ffmpeg -v error -y -ss ${offset.toFixed(2)} -i "${videoPath}" -t 18.7 ` +
      `-c:v libx264 -pix_fmt yuv420p -crf 20 "${out}"`);
    console.log("CLIP OK ->", out);
  }
}

main().catch((e) => { console.error("CAPTURE FAIL:", e.message); process.exit(1); });
