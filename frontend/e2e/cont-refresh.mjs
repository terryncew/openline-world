/**
 * Continuity refresh: re-capture 04-interior (Room view) and 05-lookback
 * (Gate view) at demo-complete, with the new town-family workers.
 * Run: node e2e/cont-refresh.mjs  (from frontend/)
 */
import { spawn, execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const SHOTS = resolve(frontend, "src", "square", "screenshots", "continuity");

const BACKEND_PORT = 18476;
const VITE_PORT = 15178;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitFor(url, timeoutMs = 45000) {
  const t0 = Date.now();
  return new Promise((resolveP, rejectP) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok) return resolveP(true); } catch {}
      if (Date.now() - t0 > timeoutMs) return rejectP(new Error("timeout " + url));
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function setView(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true });
  if (!(await btn.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Workshop menu" }).click();
  }
  await page.getByRole("button", { name: label, exact: true }).click();
  await sleep(3500); // camera damps to the framing
}

async function main() {
  for (const p of [BACKEND_PORT, VITE_PORT]) {
    try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch {}
  }
  await sleep(500);
  const env = { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) };
  const backend = spawn("python3", ["backend/server.py"], { cwd: repo, env, stdio: "ignore" });
  const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: frontend, env, stdio: "ignore",
  });
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
    for (const tag of ["desktop", "portrait"]) {
      const vp = tag === "desktop" ? { width: 1280, height: 800 } : { width: 390, height: 844 };
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${VITE_PORT}/?view=viz`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 2, null, { timeout: 20000 });
      await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/reset`, { method: "POST" });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 2, null, { timeout: 20000 });
      for (let i = 0; i < 9; i++) {
        const r = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/advance`, { method: "POST" });
        const j = await r.json();
        if (j.finished && i < 8) throw new Error("demo finished early at step " + i);
        await sleep(400);
      }
      await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 23, null, { timeout: 90000 });
      await page.evaluate(() => window.__vizDebug.goLive());
      await sleep(2500); // demo plays out to "Demo complete"
      await setView(page, "Room");
      await page.screenshot({ path: `${SHOTS}/04-interior-${tag}.png` });
      await setView(page, "Gate");
      await page.screenshot({ path: `${SHOTS}/05-lookback-${tag}.png` });
      await page.close();
      await ctx.close();
      const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
      if (jsErrors.length) throw new Error("page errors: " + jsErrors.join(" | "));
    }
    await browser.close();
    console.log("CONTINUITY REFRESH: OK");
  } finally {
    kill();
  }
}
main().catch((e) => { console.error("CONTINUITY REFRESH FAIL:", e.message); process.exit(1); });
