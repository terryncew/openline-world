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
import { spawn } from "node:child_process";
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

  // Exact shape and source still require a deliberate user activation.
  await inFrame(() => parent.postMessage(
    { type: "openline:navigate", intent: "enter-workshop" }, "*"));
  await sleep(1000);
  check("scripted exact intent ignored without user action", !(await vizOpen()));

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

  // 2b. child EventSource is blocked
  const esResult = await inFrame(() => {
    try {
      const es = new EventSource("/api/events");
      return new Promise((resolve) => {
        es.onerror = () => { es.close(); resolve("blocked"); };
        es.onmessage = () => { es.close(); resolve("succeeded"); };
        setTimeout(() => { es.close(); resolve("timeout"); }, 3000);
      });
    } catch (e) { return Promise.resolve("blocked:" + String(e).slice(0, 40)); }
  });
  check("child EventSource blocked", esResult === "blocked" || esResult === "timeout", esResult);

  // 3. child XHR is blocked
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

  // 7. HOSTILE DOCUMENT: replace the frame content with an attacker's page.
  // It can only speak through the validated intent channel — a forged
  // intent is ignored; the exact valid intent is (correctly) honored.
  await frame.goto("data:text/html,<body>hostile</body>");
  await sleep(1000);
  const hostile = page.frames().find((f) => f.url().startsWith("data:text/html"));
  check("hostile frame loaded", !!hostile);
  if (hostile) {
    await hostile.evaluate(() => parent.postMessage(
      { type: "openline:navigate", intent: "enter-workshop", evil: true }, "*"));
    await sleep(1500);
    check("hostile forgery ignored", !(await vizOpen()));
    // the hostile doc cannot read the parent either
    const hRead = await hostile.evaluate(() => {
      try { return "read:" + parent.document.title.slice(0, 10); }
      catch { return "blocked"; }
    });
    check("hostile cannot read parent DOM", hRead === "blocked", hRead);

    // Replacement drops the child's CSP. Prove the backend itself rejects
    // the resulting opaque Origin instead of mistaking a browser CORS error
    // for evidence that the request never arrived.
    const stepBefore = (await (await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/state`)).json()).demo.step;
    const hostileWrite = await hostile.evaluate(async (url) => {
      try {
        const r = await fetch(url, { method: "POST" });
        return { status: r.status, body: await r.text() };
      } catch (e) { return { status: 0, body: String(e) }; }
    }, `http://127.0.0.1:${BACKEND_PORT}/api/demo/advance`);
    const stepAfter = (await (await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/state`)).json()).demo.step;
    check("hostile backend write rejected server-side", hostileWrite.status === 403 && stepAfter === stepBefore,
      `${hostileWrite.status} step ${stepBefore}->${stepAfter}`);

    // Positive control: a non-opaque local client can reach the same route.
    const positive = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/advance`, { method: "POST" });
    const positiveStep = (await (await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/state`)).json()).demo.step;
    check("backend-write positive control works", positive.ok && positiveStep === stepBefore + 1,
      `${positive.status} step ${stepBefore}->${positiveStep}`);
  }

  // 8. POSITIVE CONTROL: the exact valid intent from the frame opens the viz
  // (reload the genuine town first, since the frame now holds hostile content)
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(6000);
  // Use the actual hit target: evaluate(postMessage) is intentionally no
  // longer a positive control because it has no human activation.
  await page.frameLocator("iframe.square-frame").getByRole("button", { name: "Enter the workshop" }).click();
  check("valid intent opens workshop", await vizOpen());

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `ISOLATION: ${failed} FAILURES` : "ISOLATION PASS: all negative controls held, positive control worked.");
} finally {
  kill();
}
