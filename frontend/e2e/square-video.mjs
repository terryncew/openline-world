/** Capture a video of the Square: town, workshop entry, custody demo, return. */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";

const frontend = resolve("/home/hatch/workspace/openline-world/frontend");
const repo = resolve("/home/hatch/workspace/openline-world");
const outDir = resolve(frontend, "src/square/screenshots/video-tmp");
mkdirSync(outDir, { recursive: true });

const BACKEND_PORT = 8481;
const VITE_PORT = 5182;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}

for (const p of [BACKEND_PORT, VITE_PORT]) {
  try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch {}
}
await sleep(500);

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
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${VITE_PORT}/?view=square`, { waitUntil: "networkidle" });
  await sleep(6000); // town ambience: robots moving

  // slow drag to look around the square
  await page.mouse.move(640, 360);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) {
    await page.mouse.move(640 - i * 12, 360 + Math.sin(i / 3) * 20, { steps: 2 });
    await sleep(120);
  }
  await page.mouse.up();
  await sleep(3000);

  // enter the workshop — the demo auto-runs
  await page.click("text=Enter the workshop");
  await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 23, null, { timeout: 120000, polling: 1000 });
  await sleep(5000); // let the final beats play out

  // back to the square
  await page.click("text=Back to the Square");
  await sleep(4000);
  await ctx.close();
  await browser.close();

  const files = readdirSync(outDir).filter((f) => f.endsWith(".webm"));
  if (!files.length) throw new Error("no video recorded");
  const dest = resolve(frontend, "src/square/screenshots/square-tour.webm");
  renameSync(join(outDir, files[0]), dest);
  console.log("VIDEO_SAVED " + dest);
} finally {
  kill();
}
