/**
 * Clip for the WORLD-WORKSHOP-ART-001 interface-density cut.
 * frontend/e2e/density-clip.mjs
 *
 * Run: node e2e/density-clip.mjs   (from frontend/)
 *
 * Portrait 390x844, video recorded: the cinematic view at the STOP beat
 * (one sentence, three keys), then the workshop menu opened once to prove
 * the hidden controls are reachable, then closed. Saved as
 * src/viz/screenshots/density-cut/cinematic-portrait.mp4.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const SHOTS = resolve(frontend, "src", "viz", "screenshots", "density-cut");
mkdirSync(SHOTS, { recursive: true });

const BACKEND_PORT = 18473;
const VITE_PORT = 15175;

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
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      recordVideo: { dir: SHOTS, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const tRecord0 = Date.now();

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
    // Only the reveal needs to reach the first STOPPED decision — the
    // rest of the log can stay unrevealed; setCursor jumps within the
    // revealed prefix.
    await page.waitForFunction(
      () => window.__vizDebug &&
        window.__vizDebug.decisions.some((d) => d.status === "stopped"),
      null, { timeout: 75000 });
    await sleep(1500);

    // STOP beat, played NATURALLY (not scrubbed): park the cursor on the
    // config.write proposal, converge the camera on the gate close-up,
    // then Step once — the paced log advances to the STOPPED decision and
    // the halt stages at the gate mouth. The worker is already carrying
    // to the gate, so the seal never transits past the camera.
    const dbg = await page.evaluate(() => window.__vizDebug);
    const propSeq = dbg.events.filter((e) => e.kind === "proposal").map((e) => e.seq)[2];
    await page.evaluate((s) => window.__vizDebug.setCursor(s), propSeq);
    // Video encoding slows SwiftShader further; give the rig plenty of
    // wall time to converge, then verify the framing before the take.
    await sleep(15000);
    await page.screenshot({ path: `${SHOTS}/clip-converge-check.png` });
    const tStep = Date.now();
    await page.getByRole("button", { name: "Step ▸", exact: true }).click();
    await sleep(2500); // the slam beat plays

    // Prove the hidden chrome is one tap away, then put it back.
    await page.getByRole("button", { name: "Workshop menu" }).click();
    await sleep(2500);
    await page.keyboard.press("Escape");
    await sleep(1200);

    const videoPath = await page.video().path();
    const tEnd = Date.now();
    await context.close();
    await browser.close();

    // Trim to the beat: from just before the Step press to the end.
    const ss = Math.max(0, (tStep - tRecord0) / 1000 - 1);
    const dur = (tEnd - tStep) / 1000 + 1.5;
    execSync(`ffmpeg -v error -y -ss ${ss.toFixed(1)} -i "${videoPath}" -t ${dur.toFixed(1)} -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${SHOTS}/cinematic-portrait.mp4"`);
    execSync(`rm -f "${videoPath}"`);
    const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
    if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
    console.log("clip written to", `${SHOTS}/cinematic-portrait.mp4`);
    console.log("CLIP PASS");
  } finally {
    kill();
  }
}
main().catch((e) => { console.error("CLIP FAIL:", e.message); process.exit(1); });
