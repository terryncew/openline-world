/**
 * STOP-beat clip: deterministically-timed recording of the strengthened
 * refusal beat.
 * frontend/e2e/gate-stop-clip.mjs
 *
 * Run: node e2e/gate-stop-clip.mjs   (from frontend/)
 *
 * Drives the real demo, scrubs to the config.write STOPPED decision, and
 * records wall-clock timestamps at page creation, at the scrub, and at
 * close — so the trim window is computed, not guessed. Output:
 * src/viz/screenshots/gate-refine/stop-beat-clip.mp4 (7s, 1280x800).
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

const BACKEND_PORT = 18473;
const VITE_PORT = 15175;
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
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: SHOTS, size: { width: 1280, height: 800 } },
    });
    const page = await ctx.newPage();
    const tPage = Date.now();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

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
    await page.evaluate(() => window.__vizDebug.goLive());
    await sleep(2500); // camera settles at world view
    const seqs = await page.evaluate(() => {
      const ds = window.__vizDebug.events.filter((e) => e.kind === "decision").map((e) => e.seq);
      // ds[2] = config.write STOPPED, ds[3] = post-revoke STOPPED,
      // ds[4] = juniper notes.write ALLOWED (re-opens the grille)
      return { stoppedA: ds[2], stoppedB: ds[3], allowedLast: ds[4] };
    });
    // Stage the shot: first stopped verdict converges the camera to the
    // gate close-up and plays out; then juniper's ALLOWED re-opens the
    // grille with the camera already in place...
    await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.stoppedA);
    await sleep(8000);
    await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.allowedLast);
    await sleep(4000);
    // ...then the second STOPPED verdict lands: the grille SLAMS shut,
    // the rings fire, the bead and threshold light up red, the packet
    // halts at the threshold — all inside the settled close-up.
    const tScrub = Date.now();
    await page.evaluate((s) => window.__vizDebug.setCursor(s), seqs.stoppedB);
    await sleep(6000); // the beat plays out: slam, rings, lighting, packet halt
    const tClose = Date.now();
    const videoPath = await page.video()?.path();
    await page.close();
    await ctx.close();
    await browser.close();
    stamps = { tPage, tScrub, tClose, videoPath };
    const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
    if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
  } finally {
    kill();
  }

  // trim: scrub at (tScrub - tPage)/1000 into the recording; keep 0.5s lead-in
  const { tPage, tScrub, videoPath } = stamps;
  const offset = Math.max(0, (tScrub - tPage) / 1000 - 0.5);
  const out = resolve(SHOTS, "stop-beat-clip.mp4");
  execSync(`ffmpeg -v error -y -ss ${offset.toFixed(2)} -i "${videoPath}" -t 7 ` +
    `-c:v libx264 -pix_fmt yuv420p -crf 20 "${out}"`);
  execSync(`rm "${videoPath}"`);
  console.log("CLIP OK ->", out, `(scrub at +${offset.toFixed(2)}s)`);
}

main().catch((e) => { console.error("CLIP FAIL:", e.message); process.exit(1); });
