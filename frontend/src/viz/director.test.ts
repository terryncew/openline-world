/**
 * Director reset-race regression tests (WORLD-AUTHORITY-001 defect 6).
 * Run with: node --test src/viz/director.test.ts
 *
 * Reproduces the React StrictMode double-mount sequence against
 * launchAuthorityDemo: the first (throwaway) effect must clean up before
 * any reset POST is issued. Demonstrates: exactly one authority reset
 * POST, no stale onReset callback, no stale advance calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../api.ts";
import { launchAuthorityDemo, runAuthorityDemoScript } from "./director.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockApi() {
  const calls: string[] = [];
  const origReset = api.resetAuthorityDemo;
  const origAdvance = api.advanceAuthorityDemo;
  api.resetAuthorityDemo = (async () => {
    calls.push("reset");
    return { reset: true };
  }) as typeof api.resetAuthorityDemo;
  api.advanceAuthorityDemo = (async () => {
    calls.push("advance");
    return { finished: true, step: 1, total: 1 };
  }) as typeof api.advanceAuthorityDemo;
  return {
    calls,
    restore() {
      api.resetAuthorityDemo = origReset;
      api.advanceAuthorityDemo = origAdvance;
    },
  };
}

test("double-mount: exactly one reset POST, no stale onReset, no stale advances", async () => {
  const { calls, restore } = mockApi();
  try {
    const onResets: number[] = [];
    // Mount 1 (throwaway): effect runs, cleanup runs in the same tick —
    // the deferred launch must never POST.
    const cancel1 = launchAuthorityDemo({ onReset: () => onResets.push(1) });
    cancel1();
    // Mount 2 (real): effect runs, no cleanup follows.
    const cancel2 = launchAuthorityDemo({ onReset: () => onResets.push(2) });
    await sleep(50);
    cancel2();

    assert.equal(
      calls.filter((c) => c === "reset").length,
      1,
      `expected exactly one reset POST, got: ${calls.join(",")}`
    );
    assert.deepEqual(onResets, [2], "only the current mount's onReset fires");
    assert.equal(
      calls.filter((c) => c === "advance").length,
      1,
      "only the current mount advances"
    );
  } finally {
    restore();
  }
});

test("runAuthorityDemoScript: shouldStop before reset prevents any POST", async () => {
  const { calls, restore } = mockApi();
  try {
    let onResetFired = false;
    await runAuthorityDemoScript({
      shouldStop: () => true,
      onReset: () => { onResetFired = true; },
    });
    assert.equal(calls.length, 0, "no POST when stopped before reset");
    assert.equal(onResetFired, false);
  } finally {
    restore();
  }
});

test("runAuthorityDemoScript: shouldStop after reset prevents onReset and advances", async () => {
  const { calls, restore } = mockApi();
  try {
    let onResetFired = false;
    let callsAfterReset = 0;
    const origAdvance = api.advanceAuthorityDemo;
    api.advanceAuthorityDemo = (async () => {
      callsAfterReset += 1;
      return origAdvance();
    }) as typeof api.advanceAuthorityDemo;
    let resetDone = false;
    const origReset = api.resetAuthorityDemo;
    api.resetAuthorityDemo = (async () => {
      const r = await origReset();
      resetDone = true;
      return r;
    }) as typeof api.resetAuthorityDemo;
    await runAuthorityDemoScript({
      // stop becomes true as soon as the reset resolves
      shouldStop: () => resetDone,
      onReset: () => { onResetFired = true; },
    });
    assert.equal(calls.filter((c) => c === "reset").length, 1);
    assert.equal(onResetFired, false, "stale onReset must not fire");
    assert.equal(callsAfterReset, 0, "no advances after stale reset");
  } finally {
    restore();
  }
});
