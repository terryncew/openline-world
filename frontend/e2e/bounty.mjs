/** Real browser bounty and original Square/custody regression, no model calls. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserLaunchOptions } from './browser-launch.mjs';
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(frontend, '..');
const out = process.env.EVIDENCE_DIR || mkdtempSync(resolve(tmpdir(), 'openline-bounty-browser-'));
mkdirSync(out, { recursive: true });
const BP = 18483, VP = 15183, origin = `http://127.0.0.1:${VP}`;
let backendLog = '', viteLog = '', browser;
const backend = spawn(resolve(repo, '.venv/bin/python'), ['backend/server.py'], {
  cwd: repo, env: { ...process.env, BOUNTY_ENABLED: '1', WORKSHOP_HOST: '127.0.0.1', WORKSHOP_PORT: String(BP),
    WORLD_DATA_DIR: resolve(out, 'world'), BOUNTY_DATA_DIR: resolve(out, 'bounty') }, stdio: ['ignore', 'pipe', 'pipe'],
});
const vite = spawn(resolve(frontend, 'node_modules/.bin/vite'), ['--port', String(VP), '--strictPort', '--host', '127.0.0.1'], {
  cwd: frontend, env: { ...process.env, WORKSHOP_PORT: String(BP) }, stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of [backend.stdout, backend.stderr]) stream.on('data', b => { backendLog += b; });
for (const stream of [vite.stdout, vite.stderr]) stream.on('data', b => { viteLog += b; });
const stop = () => { backend.kill(); vite.kill(); };
process.on('exit', stop);
const pause = ms => new Promise(r => setTimeout(r, ms));
async function state() { return (await fetch(`${origin}/api/bounty/state`)).json(); }
async function post(action, body = {}, headers = {}) {
  return fetch(`${origin}/api/bounty/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (backend.exitCode !== null || vite.exitCode !== null) throw Error(backendLog + viteLog);
    try { if ((await fetch(`${origin}/api/bounty/state`)).ok) { ready = true; break; } } catch {}
    await pause(200);
  }
  assert.ok(ready, 'Bounty services became ready');
  browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${origin}/?scenario=bounty`);
  await page.getByRole('heading', { name: 'One bounded job. Every decision visible.' }).waitFor();
  await page.getByRole('button', { name: 'Buyer approves these fixed terms' }).click();
  for (const label of [
    'Worker tries an unsupported finding', 'Buyer verifies attempt 1',
    'Check attempt 1 compensation evidence', 'Settle attempt 1: $10 simulated',
    'Worker tries the cross-user finding', 'Buyer verifies attempt 2',
    'Check attempt 2 compensation evidence', 'Settle attempt 2: $10 simulated',
    'Buyer checks success reward evidence', 'Settle verified reward: $100 simulated',
  ]) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.waitFor(); await button.click();
  }
  await page.getByRole('status').filter({ hasText: 'Transaction complete' }).waitFor();
  const complete = await state();
  assert.deepEqual(complete.ledger.transfers.map(t => t.amount), [10, 10, 100]);
  assert.equal(complete.attempts[0].verification.accepted, false);
  assert.equal(complete.attempts[1].verification.accepted, true);
  assert.equal(complete.payments.filter(p => p.status === 'SETTLED').length, 3);
  const auth = complete.bureau.records.filter(r => r.adapter === 'gate_action_receipt');
  assert.ok(auth.length >= 2 && auth.every(r => r.effect_observed === null));
  await page.getByRole('button', { name: /verification · COMMIT/ }).click();
  await page.getByLabel('Selected signed receipt').waitFor();
  assert.ok((await page.getByLabel('Selected signed receipt').textContent()).includes('REPRODUCIBLE_IDOR'));
  await page.screenshot({ path: resolve(out, 'bounty-desktop.png'), fullPage: true });
  assert.equal((await post('approve', {}, { Origin: 'https://untrusted.example' })).status, 409);
  assert.equal((await post('attempt', { candidate: { requester: 'alice', target: 'bob', claim: 'cross-user-note' } })).status, 409);
  assert.equal((await post('settle', { key: 'reward' })).status, 200);
  assert.equal((await state()).ledger.transfers.length, 3);
  await page.getByRole('button', { name: 'Read-only kernel reconciliation' }).click();
  await page.getByText(/reconciliation is read-only: no work dispatched, no payment made/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: resolve(out, 'bounty-portrait.png'), fullPage: true });
  const squareApi = [];
  const square = await browser.newPage();
  square.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) squareApi.push(r.url()); });
  await square.goto(origin); await square.locator('iframe').waitFor(); await pause(700);
  assert.deepEqual(squareApi, []);
  assert.equal((await fetch(`${origin}/api/world/state`)).status, 200);
  const custody = spawn(resolve(repo, '.venv/bin/python'), ['clients/demo_custody.py', '--server', `http://127.0.0.1:${BP}`], { cwd: repo });
  let custodyLog = '';
  custody.stdout.on('data', b => { custodyLog += b; }); custody.stderr.on('data', b => { custodyLog += b; });
  const code = await new Promise((resolveExit, reject) => { custody.on('exit', resolveExit); custody.on('error', reject); });
  writeFileSync(resolve(out, 'custody.log'), custodyLog);
  assert.equal(code, 0, custodyLog);
  assert.equal(errors.length, 0, errors.join('\n'));
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ status: 'PASS', browser: 'desktop + portrait',
    transfers: [10, 10, 100], squareBackendRequests: 0, custodyExitCode: code,
    independentOutsideReceiver: false, realSettlement: false }, null, 2));
  console.log(`PASS: bounty browser, responsive layout, replay, local-origin check, Square isolation and custody. Evidence: ${out}`);
} finally {
  await browser?.close(); stop();
  writeFileSync(resolve(out, 'backend.log'), backendLog); writeFileSync(resolve(out, 'vite.log'), viteLog);
}
