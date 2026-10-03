/** Motion clip of the 001R town: acting, workshop entry, a verdict, return. */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";

const frontend = resolve("/home/hatch/workspace/openline-world/frontend");
const repo = resolve("/home/hatch/workspace/openline-world");
const outDir = resolve("/tmp/town-clip");
mkdirSync(outDir, { recursive: true });

const BACKEND_PORT = 8491;
const VITE_PORT = 5192;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}
for (const p of [BACKEND_PORT, VITE_PORT]) { try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch {} }
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
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  // town acting: hold the wide shot, gentle drift for parallax
  await sleep(6000);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) {
    await page.mouse.move(640 - i * 6, 360, { steps: 2 });
    await sleep(500);
  }
  await page.mouse.up();
  await sleep(6000);
  // workshop door
  let entered = false;
  for (const [x, y] of [[640, 350], [620, 360], [660, 360], [640, 390]]) {
    await page.mouse.click(x, y);
    try {
      await page.waitForFunction(() => window.__vizDebug && window.__vizDebug.eventCount >= 4, null, { timeout: 12000 });
      entered = true; break;
    } catch {}
  }
  if (!entered) throw new Error("door click failed");
  // let a verdict play (wait for a decision to reveal)
  await page.waitForFunction(() => {
    const d = window.__vizDebug;
    return d && d.eventCount >= 23;
  }, null, { timeout: 120000, polling: 1000 });
  await sleep(4000);
  await page.click("text=Back to the Square");
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(5000);
  await ctx.close();
  await browser.close();
  const files = readdirSync(outDir).filter((f) => f.endsWith(".webm"));
  if (!files.length) throw new Error("no video recorded");
  renameSync(join(outDir, files[0]), "/tmp/town-clip.webm");
  console.log("CLIP_SAVED /tmp/town-clip.webm");
} finally { kill(); }
