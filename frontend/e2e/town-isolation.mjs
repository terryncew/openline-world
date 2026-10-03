/**
 * Town isolation tests (001R): prove containment in a REAL BROWSER.
 *
 * The town runs in an opaque-origin sandboxed iframe. These are negative
 * controls — each drives the child to attempt an escape and asserts the
 * parent blocks or ignores it. A final positive control proves the
 * validated navigation intent still works.
 *
 * Run: node e2e/town-isolation.mjs (backend + vite are started here).
 */
import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const BACKEND_PORT = 8482;
const VITE_PORT = 5183;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
};

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(6000); // town mounts

  const frame = page.frames().find((f) => f.url().endsWith("town.html"));
  check("iframe frame found", !!frame);
  const inFrame = (fn) => frame.evaluate(fn);
  const vizOpen = () => page.evaluate(() => !!document.querySelector(".viz-root"));

  // 1. child fetch() is blocked by CSP connect-src 'none'
  const fetchResult = await inFrame(async () => {
    try {
      await fetch("/api/health");
      return "succeeded";
    } catch (e) {
      return "blocked:" + String(e).slice(0, 60);
    }
  });
  check("child fetch blocked", fetchResult.startsWith("blocked"), fetchResult);

  // 2. child XHR is blocked
  const xhrResult = await inFrame(() => new Promise((resolve) => {
    try {
      const x = new XMLHttpRequest();
      x.onerror = () => resolve("blocked");
      x.onload = () => resolve("succeeded:" + x.status);
      x.open("GET", "/api/health");
      x.send();
      setTimeout(() => resolve("timeout"), 3000);
    } catch (e) { resolve("blocked:" + String(e).slice(0, 40)); }
  }));
  check("child XHR blocked", xhrResult.startsWith("blocked") || xhrResult === "timeout", xhrResult);

  // 3. child cannot read the parent's DOM (opaque origin)
  const domRead = await inFrame(() => {
    try {
      return "read:" + parent.document.title.slice(0, 20);
    } catch (e) {
      return "blocked";
    }
  });
  check("child cannot read parent DOM", domRead === "blocked", domRead);

  // 4. forged intent WITH EXTRA FIELDS from the real frame is ignored
  await inFrame(() => parent.postMessage(
    { type: "openline:navigate", intent: "enter-workshop", forged: true }, "*"));
  await sleep(1500);
  check("extra-field forgery ignored", !(await vizOpen()));

  // 5. correct shape but WRONG SOURCE (parent posting to itself) is ignored
  await page.evaluate(() => window.postMessage(
    { type: "openline:navigate", intent: "enter-workshop" }, "*"));
  await sleep(1500);
  check("wrong-source message ignored", !(await vizOpen()));

  // 6. child cannot navigate the top frame
  const topNav = await inFrame(() => {
    try {
      top.location.href = "about:blank";
      return "navigated?";
    } catch (e) {
      return "blocked";
    }
  });
  await sleep(1000);
  const stillSquare = await page.evaluate(() => !!document.querySelector("iframe.square-frame"));
  check("child top-navigation blocked", topNav === "blocked" && stillSquare, topNav);

  // 7. POSITIVE CONTROL: the exact valid intent from the frame opens the viz
  await inFrame(() => parent.postMessage(
    { type: "openline:navigate", intent: "enter-workshop" }, "*"));
  await page.waitForFunction(() => !!document.querySelector(".viz-root"), null, { timeout: 15000 })
    .catch(() => null);
  check("valid intent opens workshop", await vizOpen());

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `ISOLATION: ${failed} FAILURES` : "ISOLATION PASS: all negative controls held, positive control worked.");
} finally {
  kill();
}
