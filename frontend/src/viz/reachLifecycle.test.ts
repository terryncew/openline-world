/**
 * Reach lifecycle tests (WORLD-AUTHORITY-001 CP3 §2).
 * Run with: node --test src/viz/reachLifecycle.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextReachState,
  REACH_IDLE,
  type ReachLifecycleState,
} from "./reachLifecycle.ts";

test("false → true on attempt, one trigger per event", () => {
  let s: ReachLifecycleState = REACH_IDLE;
  s = nextReachState(s, { type: "attempt_revealed", eventId: "e10" });
  assert.equal(s.active, true);
  assert.equal(s.triggeredEventId, "e10");
  // rerender / re-reveal of the same event does not restart
  const s2 = nextReachState(s, { type: "attempt_revealed", eventId: "e10" });
  assert.equal(s2, s, "same event must return identical state");
});

test("later events do not cancel; only scene completion returns false", () => {
  let s = nextReachState(REACH_IDLE, { type: "attempt_revealed", eventId: "e10" });
  // a different attempt event starts a new reach (does not cancel mid-flight
  // semantics — the new trigger wins)
  s = nextReachState(s, { type: "attempt_revealed", eventId: "e11" });
  assert.equal(s.active, true);
  assert.equal(s.triggeredEventId, "e11");
  // completion without active reach is a no-op
  const idle = nextReachState(REACH_IDLE, { type: "choreography_complete" });
  assert.equal(idle.active, false);
  // scene-reported completion returns the latch to false
  s = nextReachState(s, { type: "choreography_complete" });
  assert.equal(s.active, false);
  assert.equal(s.triggeredEventId, "e11");
});

test("reset clears the lifecycle", () => {
  let s = nextReachState(REACH_IDLE, { type: "attempt_revealed", eventId: "e10" });
  s = nextReachState(s, { type: "reset" });
  assert.deepEqual(s, REACH_IDLE);
});
