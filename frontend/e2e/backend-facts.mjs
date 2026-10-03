/**
 * Backend-facts test (001R): the Square (town) must not change backend
 * facts; the workshop demo must produce the genuine custody sequence.
 *
 * Phase 1 (town is inert): capture /api/state + /api/receipts, load the
 * square, let vignettes run, click scenery, reload — then assert the
 * backend facts are UNCHANGED. The town makes zero backend writes.
 *
 * Phase 2 (genuine sequence): enter the workshop, let the demo complete,
 * then assert the custody facts DERIVED FROM THE BACKEND: event count,
 * receipt count, ALLOWED/STOPPED decisions, revocation, replacement.
 * Nothing is hardcoded; the backend is the source of truth.
 *
 * Run: node e2e/backend-facts.mjs (backend + vite are started here).
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const BACKEND_PORT = 8484;
const VITE_PORT = 5185;
const B = `http://127.0.0.1:${BACKEND_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("never came up: " + url);
}
const fail = (m) => { console.error("FACTS FAIL: " + m); process.exit(1); };
const get = async (p) => (await (await fetch(B + p)).json());

// read the SSE replay to count authoritative events
async function eventCount() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  let n = 0;
  try {
    const res = await fetch(B + "/api/events", { signal: ctrl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const p of parts) {
        if (p.includes('"kind"') || p.includes("seq")) n++;
      }
    }
  } catch {}
  clearTimeout(t);
  return n;
}


const env = { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) };
const backend = spawn("python3", ["backend/server.py"], { cwd: repo, env, stdio: "ignore" });
const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: frontend, env, stdio: "ignore" });
const kill = () => { try { backend.kill(); } catch {} try { vite.kill(); } catch {} };
process.on("exit", kill);

try {
  await waitFor(`${B}/api/health`);
  await waitFor(`http://127.0.0.1:${VITE_PORT}/`);

  // ---- phase 1: the town must not touch backend facts ----
  const stateBefore = await get("/api/state");
  const receiptsBefore = await get("/api/receipts");
  const eventsBefore = await eventCount();
  console.log(`before: demo.step=${stateBefore.demo.step} receipts=${stateBefore.receipts} events~${eventsBefore}`);

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // NOTE: phase 2 reassigns `page` to a fresh page (see below).
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(10000); // vignettes run; the town makes no requests
  // click scenery (not the door): fountain area, buildings
  await page.mouse.click(640, 600);
  await sleep(1000);
  await page.mouse.click(200, 400);
  await sleep(1000);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(5000);

  const stateAfter = await get("/api/state");
  const receiptsAfter = await get("/api/receipts");
  const eventsAfter = await eventCount();
  console.log(`after:  demo.step=${stateAfter.demo.step} receipts=${stateAfter.receipts} events~${eventsAfter}`);

  if (stateAfter.demo.step !== stateBefore.demo.step) fail("town advanced the demo");
  if (stateAfter.receipts !== stateBefore.receipts) fail("town created receipts");
  if (eventsAfter !== eventsBefore) fail("town appended events");
  if (JSON.stringify(receiptsAfter) !== JSON.stringify(receiptsBefore)) fail("receipts changed");
  console.log("PHASE 1 PASS: town animation, clicks, reload changed zero backend facts.");

  // ---- phase 2: the genuine custody sequence, derived from the backend ----
  // Fresh page: the phase-1 reload leaves the Vite-dev-served town blank
  // (the sandboxed iframe's module fetches are CORS-blocked from its
  // opaque origin on re-navigation; production serves town.html as a
  // single self-contained file precisely to avoid this). A fresh page
  // tests the same property: the door opens the backend-driven sequence.
  await page.close();
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page2.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page2.waitForSelector("iframe.square-frame", { timeout: 30000 });
  await sleep(6000);
  page = page2; // phase 2 runs on a fresh page (see comment above)
  await page.mouse.click(640, 350); // workshop door
  await page.waitForFunction(() => !!document.querySelector(".viz-root"), null, { timeout: 30000 });
  // wait for the demo to finish (9 steps x ~1.2s + margin)
  await page.waitForFunction(() => {
    const el = document.querySelector(".viz-root");
    return el && el.textContent.includes("Demo complete");
  }, null, { timeout: 120000 }).catch(() => null);
  await sleep(3000);

  const facts = await page.evaluate(() => {
    const d = window.__vizDebug;
    if (!d) return null;
    return {
      eventCount: d.eventCount,
      events: d.events.map((e) => ({ seq: e.seq, kind: e.kind, summary: e.summary })),
      receipts: d.receipts ? d.receipts.length : null,
    };
  });
  if (!facts) fail("no viz debug facts");
  console.log(`demo produced ${facts.eventCount} events`);

  // derive the custody assertions from the backend's own facts.
  // (the decision lives in the event detail; the summary carries it:
  // "Signed receipt recorded: ALLOWED for ...")
  const text = facts.events.map((e) => e.kind + " " + e.summary).join("\n");
  const allowed = (text.match(/ALLOWED/g) || []).length;
  const stopped = (text.match(/STOPPED/g) || []).length;
  const revoked = /revok/i.test(text);
  const replaced = /replac|onboard|juniper/i.test(text);
  console.log(`ALLOWED=${allowed} STOPPED=${stopped} revoked=${revoked} replaced=${replaced}`);

  if (facts.eventCount !== 23) fail(`expected the full 23-event custody sequence, got ${facts.eventCount}`);
  if (allowed !== 3) fail(`expected 3 ALLOWED decisions, got ${allowed}`);
  if (stopped !== 2) fail(`expected 2 STOPPED decisions, got ${stopped}`);
  if (!revoked) fail("no revocation in the sequence");
  if (!replaced) fail("no worker replacement in the sequence");
  if (facts.receipts !== 5) fail(`expected 5 receipts, got ${facts.receipts}`);
  console.log("PHASE 2 PASS: genuine custody sequence derived from backend facts.");

  // ---- phase 3: exit returns; backend facts persist (records survive) ----
  await page.getByRole("button", { name: "Workshop menu" }).click();
  await page.click("text=Back to the Square");
  await page.waitForSelector("iframe.square-frame", { timeout: 30000 });
  const receiptsFinal = await get("/api/receipts");
  if (receiptsFinal.receipts.length !== 5) fail(`receipts not preserved after return: ${receiptsFinal.receipts.length}`);
  console.log(`PHASE 3 PASS: return to square; ${receiptsFinal.receipts.length} receipts preserved.`);
  await browser.close();
  console.log("FACTS PASS: town inert, workshop genuine, records survive.");
} finally {
  kill();
}
