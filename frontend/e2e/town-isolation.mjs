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
const backend = spawn(resolve(repo, ".venv/bin/python"), ["backend/server.py"], { cwd: repo, env, stdio: "ignore" });
const vite = spawn(process.execPath, [resolve(frontend, "node_modules/vite/bin/vite.js"), "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: frontend, env, stdio: "ignore" });
const kill = () => { try { backend.kill(); } catch {} try { vite.kill(); } catch {} };
process.on("exit", kill);

try {
  await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
  await waitFor(`http://127.0.0.1:${VITE_PORT}/`);
  const { chromium } = await import("playwright");
  const { browserLaunchOptions } = await import("./browser-launch.mjs");
  const browser = await chromium.launch(browserLaunchOptions());
  // Permit local-network requests in this test profile so the opaque child
  // actually reaches the server; a browser-only refusal cannot prove 403.
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    permissions: ["local-network-access"],
  });
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
  // Even the exact valid intent must be refused without user activation.
  const hostileURL = `http://127.0.0.1:${VITE_PORT}/hostile-test.html`;
  await page.route(hostileURL, (route) => route.fulfill({
    contentType: "text/html",
    body: `<body>hostile<script>
      parent.postMessage({type: "openline:navigate", intent: "enter-workshop"}, "*");
    </script>`,
  }));
  // Playwright evaluate() can grant activation; let prior probes expire.
  await sleep(6000);
  await frame.goto(hostileURL);
  await sleep(1000);
  const hostile = page.frames().find((f) => f.url() === hostileURL);
  check("hostile frame loaded", !!hostile);
  check("scripted exact intent ignored without user action", !(await vizOpen()));
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

    // The replacement has no CSP: test the actual server denial and state.
    const api = `http://127.0.0.1:${BACKEND_PORT}`;
    const before = await (await fetch(`${api}/api/state`)).json();
    const denied = await hostile.evaluate(async (url) => {
      const response = await fetch(url, { method: "POST" });
      return { status: response.status, body: await response.json() };
    }, `http://127.0.0.1:${VITE_PORT}/api/demo/advance`);
    const after = await (await fetch(`${api}/api/state`)).json();
    check("opaque-origin backend write refused", denied.status === 403 &&
      denied.body.error === "OPAQUE_ORIGIN_FORBIDDEN", JSON.stringify(denied));
    check("backend state unchanged after refusal", JSON.stringify(before) === JSON.stringify(after));
    const positive = await fetch(`${api}/api/demo/advance`, { method: "POST" });
    const advanced = await (await fetch(`${api}/api/state`)).json();
    check("no-origin local write preserved", positive.ok && advanced.demo.step === before.demo.step + 1);

  }

  // 8. POSITIVE CONTROL: the exact valid intent from the frame opens the viz
  // (reload the genuine town first, since the frame now holds hostile content)
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(6000);
  // Project the current genuine WorkshopDoor hitbox; use a real mouse click,
  // never evaluate(postMessage), for the transient-activation positive control.
  const { PerspectiveCamera, Vector3 } = await import("three");
  const camera = new PerspectiveCamera(38, 1280 / 800, 0.1, 80);
  camera.position.set(2.4, 5.8, 12.8);
  camera.lookAt(0.7, 0.9, -1.2);
  camera.updateMatrixWorld();
  const door = new Vector3(1.6 - Math.sin(0.12) * 1.45, 1, -4.2 + Math.cos(0.12) * 1.45).project(camera);
  await page.mouse.click((door.x + 1) * 640, (1 - door.y) * 400);
  await page.waitForFunction(() => !!document.querySelector(".viz-root"), null, { timeout: 15000 })
    .catch(() => null);
  check("user-activated genuine door opens workshop", await vizOpen());
  const health = await page.evaluate(async () => (await fetch("/api/health")).json());
  check("ordinary same-origin API proxy works", health.status === "ok");

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `ISOLATION: ${failed} FAILURES` : "ISOLATION PASS: all negative controls held, positive control worked.");
} finally {
  kill();
}
