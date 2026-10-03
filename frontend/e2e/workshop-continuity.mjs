/** Capture and assert the authored town -> threshold -> workshop -> town path. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(frontend, "..");
const shots = resolve(frontend, "src/square/screenshots/spatial-continuity");
mkdirSync(shots, { recursive: true });
const backendPort = 18621;
const vitePort = 15621;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}`);
}

const env = { ...process.env, WORKSHOP_PORT: String(backendPort) };
const backend = spawn("python3", ["backend/server.py"], { cwd: repo, env, stdio: "ignore" });
const vite = spawn("npx", ["vite", "--port", String(vitePort), "--strictPort", "--host", "127.0.0.1"], { cwd: frontend, env, stdio: "ignore" });
const stop = () => { backend.kill(); vite.kill(); };
process.on("exit", stop);

try {
  await waitFor(`http://127.0.0.1:${backendPort}/api/health`);
  await waitFor(`http://127.0.0.1:${vitePort}/`);
  for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch(engineName === "chromium" ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {});
    for (const [viewportName, viewport] of [["desktop", { width: 1280, height: 800 }], ["portrait", { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport, hasTouch: viewportName === "portrait" });
      await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: "networkidle" });
      const door = page.frameLocator("iframe.square-frame").getByRole("button", { name: "Enter the workshop" });
      await door.waitFor();
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-01-exterior.png` });
      await door.click();
      await sleep(520);
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-02-approach.png` });
      await page.waitForSelector(".viz-root", { timeout: 15000 });
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-03-threshold.png` });
      await sleep(1200);
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-04-interior.png` });
      await page.getByRole("button", { name: "Entrance" }).click();
      await sleep(900);
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-05-look-back.png` });
      await page.getByRole("button", { name: "Back to the Square" }).click();
      await sleep(500);
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-06-exit-threshold.png` });
      await page.waitForSelector("iframe.square-frame", { timeout: 15000 });
      await sleep(900);
      await page.screenshot({ path: `${shots}/${engineName}-${viewportName}-07-return.png` });
      await page.close();
    }
    await browser.close();
  }
  console.log(`CONTINUITY PASS: captures written to ${shots}`);
} finally {
  stop();
}
