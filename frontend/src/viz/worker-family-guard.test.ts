/**
 * Worker-family overflow guard — run with: npm test
 * (node --test "src/viz/*.test.ts"; erasable TS, no build step)
 *
 * KNOWN LIMITATION — WORKER-FAMILY-OVERFLOW (frozen, see
 * src/viz/screenshots/characters/KNOWN_LIMITATIONS.md):
 * the authored town character families render only when the worker
 * count is <= 8. Above 8 the viz falls back to generic instanced
 * capsules. The frozen World demo is constrained to <= 8 workers.
 *
 * This test exists so no future demo/config can silently drift above
 * 8 without somebody noticing: it locks the trigger value and asserts
 * the reducer never produces more than 8 workers for the frozen demo
 * beat. If >8 workers ever becomes a supported visible scenario, this
 * test must be revisited alongside the limitation — not silently
 * bumped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceEvents } from "./reducer.ts";
import { useFigures } from "./scene/workerMotion.ts";
import type { WEvent } from "./protocol.ts";

let seq = 0;
function reset() { seq = 0; }
function mandateCreateEvent(helper: string, n: number): WEvent {
  seq += 1;
  return {
    event_id: `guard-${seq}`,
    seq,
    task_id: "t",
    ts: "",
    source: "test",
    kind: "mandate",
    provenance: "owner-signed",
    summary: `${helper} onboarded`,
    detail: { mandate_id: `mandate-${helper}-${n}`, scopes: ["notes.read"] },
  };
}

test("useFigures keeps its <= 8 trigger — the worker-family contract", () => {
  assert.equal(useFigures(0), true);
  assert.equal(useFigures(8), true);
  assert.equal(useFigures(9), false);
  assert.equal(useFigures(128), false);
});

test("eight mandate-created workers all render as town families", () => {
  reset();
  const events = Array.from({ length: 8 }, (_, i) =>
    mandateCreateEvent(`helper${i}`, i)
  );
  const state = reduceEvents(events);
  assert.equal(state.workers.length, 8);
  assert.equal(useFigures(state.workers.length), true);
});

test("a ninth worker trips the documented overflow path — never silently", () => {
  reset();
  const events = Array.from({ length: 9 }, (_, i) =>
    mandateCreateEvent(`helper${i}`, i)
  );
  const state = reduceEvents(events);
  assert.equal(state.workers.length, 9);
  // This is the frozen limitation, asserted explicitly — not hidden.
  assert.equal(useFigures(state.workers.length), false);
});
