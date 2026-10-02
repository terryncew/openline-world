/**
 * Browser replay test for the OpenLine World visualization.
 * frontend/e2e/viz-replay.mjs
 *
 * Run: npm run test:e2e   (from frontend/)
 *
 * Starts the real backend + vite dev server, loads ?view=viz, drives all
 * 9 demo steps through the real POST /api/demo/* endpoints (the test
 * driver, not the renderer — the renderer itself never POSTs), then
 * asserts window.__vizDebug shows the expected logical custody sequence:
 *   2 ALLOWED for wren (notes.read, notes.write)
 *   1 STOPPED  for wren (config.write)
 *   revocation of wren's mandate
 *   1 STOPPED  post-revoke attempt (notes.read)
 *   juniper onboarded, 1 ALLOWED (notes.write)
 *   5 receipts total; wren's receipt survives revocation + replacement
 *   2 speeches (tidy + "says done"), both agent-reported, zero receipts
 * from them.
 *
 * Also captures 4 screenshots into src/viz/screenshots/.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(here, "..", "..");
const SHOTS = resolve(frontend, "src", "viz", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BACKEND_PORT = 18471;
const VITE_PORT = 15173;

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
  // preflight: clear leftovers from killed runs on our ports
  for (const p of [BACKEND_PORT, VITE_PORT]) {
    try { execSync(`fuser -k ${p}/tcp 2>/dev/null`); } catch { /* none */ }
  }
  await sleep(500);
  const backend = spawn("python3", ["backend/server.py"], {
    cwd: repo, env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) },
    stdio: "ignore",
  });
  const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: frontend,
    env: { ...process.env, WORKSHOP_PORT: String(BACKEND_PORT) },
    stdio: "ignore",
  });
  const kill = () => { backend.kill(); vite.kill(); };
  process.on("exit", kill);

  try {
    await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
    await waitFor(`http://127.0.0.1:${VITE_PORT}/`);

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      // use the pre-installed chromium build (no download in this env)
      executablePath: "/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`http://127.0.0.1:${VITE_PORT}/?view=viz`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => window.__vizDebug && window.__vizDebug.eventCount >= 2,
      null, { timeout: 20000 }
    );

    // Drive the REAL demo script: reset + 9 advances. Reset replaces the
    // backend's event log, so reload to resubscribe from seq 0.
    await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/reset`, { method: "POST" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(
      () => window.__vizDebug && window.__vizDebug.eventCount >= 2,
      null, { timeout: 20000 }
    );
    for (let i = 0; i < 9; i++) {
      const r = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/demo/advance`, { method: "POST" });
      const j = await r.json();
      if (j.finished && i < 8) throw new Error(`demo finished early at step ${i}`);
      await sleep(400);
    }
    // 2 boot + 21 step events = 23
    await page.waitForFunction(
      () => window.__vizDebug && window.__vizDebug.eventCount >= 23,
      null, { timeout: 20000 }
    );
    await sleep(1500); // let the stream settle

    const dbg = await page.evaluate(() => window.__vizDebug);
    const allowed = dbg.decisions.filter((d) => d.status === "allowed");
    const stopped = dbg.decisions.filter((d) => d.status === "stopped");

    assert.equal(dbg.proposals.length, 5, "5 proposals");
    assert.equal(allowed.length, 3, "3 allowed (wren read, wren write, juniper write)");
    assert.equal(stopped.length, 2, "2 stopped (config.write, post-revoke read)");
    assert.equal(dbg.receipts.length, 5, "5 receipts");
    assert.ok(dbg.receipts.every((r) => r.provenance === "receiver-signed"), "all receipts receiver-signed");

    const wren = dbg.workers.find((w) => w.id === "wren");
    const juniper = dbg.workers.find((w) => w.id === "juniper");
    assert.ok(wren && !wren.active, "wren revoked");
    assert.ok(juniper && juniper.active, "juniper active");
    assert.ok(dbg.authorities.find((a) => a.mandateId === wren.mandateId && !a.active), "wren seal revoked");
    assert.ok(dbg.authorities.find((a) => a.mandateId === juniper.mandateId && a.active), "juniper seal active");
    assert.ok(dbg.receipts.some((r) => r.action === "notes.read"), "wren's receipt survives");

    assert.equal(dbg.speeches.length, 2, "2 speeches (tidy + says done)");
    assert.ok(dbg.speeches.every((s) => s.provenance === "agent-reported"), "speech is agent-reported");
    assert.equal(dbg.unrecognized.length, 0, "nothing unrecognized");

    console.log("logical sequence OK:",
      `${dbg.proposals.length} proposals,`,
      `${allowed.length} allowed, ${stopped.length} stopped,`,
      `${dbg.receipts.length} receipts, ${dbg.speeches.length} speeches`);

    // ---- screenshots at key beats (cursor scrubs the persisted log) ----
    const seqOf = (kind, nth = 0) =>
      dbg.events.filter((e) => e.kind === kind).map((e) => e.seq)[nth];
    const setCursor = (seq) => page.evaluate((s) => window.__vizDebug.setCursor(s), seq);

    // 1. proposal in flight (first proposal, before its decision)
    await setCursor(seqOf("proposal", 0));
    await page.evaluate(() => window.__vizDebug && (document.querySelector(".viz-stage") ? 1 : 1));
    await sleep(2500);
    await page.screenshot({ path: `${SHOTS}/01-proposal-in-flight.png` });

    // 2. ALLOWED — gate flash + lintel lift (first decision)
    await setCursor(seqOf("decision", 0));
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/02-allowed.png` });

    // 3. STOPPED — config.write refusal
    await setCursor(seqOf("decision", 2));
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS}/03-stopped.png` });

    // 4. full history: receipts arc after worker replacement
    await page.evaluate(() => window.__vizDebug.goLive());
    await sleep(2500);
    await page.screenshot({ path: `${SHOTS}/04-receipts-after-replacement.png` });

    console.log("screenshots written to", SHOTS);
    const jsErrors = errors.filter((e) => !/ResizeObserver/.test(e));
    assert.equal(jsErrors.length, 0, `page errors: ${jsErrors.join(" | ")}`);
    console.log("no page errors");
    await browser.close();
    console.log("E2E PASS");
  } finally {
    kill();
  }
}

main().catch((e) => { console.error("E2E FAIL:", e.message); process.exit(1); });
