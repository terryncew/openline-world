/**
 * Close-up decision tests (WORLD-AUTHORITY-001 defect 6, pass 2).
 * Run with: node --test src/viz/closeup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { closeupFor } from "./closeup.ts";

let seq = 0;
const ev = (kind: string, detail: Record<string, unknown> = {}) =>
  ({ event_id: `e${++seq}`, seq: seq, kind, detail }) as never;

test("unadmitted proposal never takes the camera", () => {
  const last = ev("proposal", { decision_requested: false });
  assert.equal(closeupFor([], last), null);
});

test("ordinary proposal still selects gate close-up", () => {
  const last = ev("proposal", { helper: "wren", action: "notes.write" });
  assert.equal(closeupFor([], last), "gate");
});

test("decision still selects gate close-up", () => {
  const last = ev("decision", { decision: "ALLOWED" });
  assert.equal(closeupFor([], last), "gate");
});
