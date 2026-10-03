/**
 * Capture script for the WORLD-WORKSHOP-ART-001 interface-density cut.
 * frontend/e2e/density-capture.mjs
 *
 * Run: node e2e/density-capture.mjs before|after   (from frontend/)
 *
 * Drives the real demo through the backend API (like viz-replay.mjs),
 * then captures matched before/after stills into
 * src/viz/screenshots/density-cut/:
 *   {before,after}-desktop-stopped.png   (1280x800, STOP beat)
 *   {before,after}-portrait-stopped.png  (390x844,  STOP beat)
 *   {before,after}-desktop-carry.png     (1280x800, workroom carry beat)
 *   {before,after}-portrait-carry.png    (390x844,  workroom carry beat)
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

const mode = process.argv[2] === "after" ? "after" : "before";
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

async function gotoView(page, name) {
  const btn = page.getByRole("button", { name, exact: true });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  } else {
    // density-cut UI: views live behind the workshop menu knob
    await page.getByRole("button", { name: "Workshop menu" }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
      () => window.__vizDebug && window.__vizDebug.eventCount >= 23, null, { timeout: 75000 });
    await sleep(1500);

    const dbg = await page.evaluate(() => window.__vizDebug);
    const seqOf = (kind, nth = 0) =>
      dbg.events.filter((e) => e.kind === kind).map((e) => e.seq)[nth];
    const setCursor = (seq) => page.evaluate((s) => window.__vizDebug.setCursor(s), seq);
    const shot = async (name, vp) => {
      await page.setViewportSize(vp);
      await sleep(600);
      await page.screenshot({ path: `${SHOTS}/${mode}-${name}.png` });
      console.log("wrote", `${mode}-${name}.png`);
    };
    const DESK = { width: 1280, height: 800 };
    const PORT = { width: 390, height: 844 };

    // STOP beat: config.write refusal (decision index 2). Converge the
    // camera on the gate close-up FIRST via the earlier ALLOWED decision
    // (same close-up target; the rig damps slowly under SwiftShader, so
    // give it 10s wall), then cut to the STOPPED decision and catch the
    // beat at +1.2s: portcullis slammed, verdict lighting up.
    await gotoView(page, "Room");
    await setCursor(seqOf("decision", 0));
    await sleep(10000);
    await setCursor(seqOf("decision", 2));
    await sleep(2000);
    await shot("desktop-stopped", DESK);
    await shot("portrait-stopped", PORT);

    // Workroom carry beat: first proposal in flight, workroom framing
    await setCursor(seqOf("proposal", 0));
    await gotoView(page, "Workroom");
    await sleep(3500); // camera damps to the workroom framing
    await shot("desktop-carry", DESK);
    await shot("portrait-carry", PORT);

    const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
    if (jsErrors.length) throw new Error(`page errors: ${jsErrors.join(" | ")}`);
    console.log("no page errors");
    await browser.close();
    console.log("CAPTURE PASS");
  } finally {
    kill();
  }
}
main().catch((e) => { console.error("CAPTURE FAIL:", e.message); process.exit(1); });
