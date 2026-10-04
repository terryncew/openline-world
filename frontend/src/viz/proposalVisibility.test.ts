/**
 * Proposal visibility tests (WORLD-AUTHORITY-001 CP3 §6).
 * Run with: node --test src/viz/proposalVisibility.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isExplicitlyUnadmitted,
  proposalVisibility,
} from "./proposalVisibility.ts";

test("decision_requested=false is explicitly unadmitted", () => {
  assert.equal(
    isExplicitlyUnadmitted({ decisionRequested: false }),
    true
  );
  const v = proposalVisibility({ decisionRequested: false });
  assert.deepEqual(v, {
    sideTable: true,
    gateTravel: false,
    gateDecision: false,
    gateCloseup: false,
  });
});

test("structural unadmitted=true is explicitly unadmitted", () => {
  assert.equal(isExplicitlyUnadmitted({ unadmitted: true }), true);
  const v = proposalVisibility({ unadmitted: true });
  assert.equal(v.sideTable, true);
  assert.equal(v.gateTravel, false);
});

test("ordinary proposals remain unchanged", () => {
  assert.equal(isExplicitlyUnadmitted({}), false);
  assert.equal(isExplicitlyUnadmitted({ unadmitted: false }), false);
  const v = proposalVisibility({ unadmitted: false });
  assert.deepEqual(v, {
    sideTable: false,
    gateTravel: true,
    gateDecision: true,
    gateCloseup: true,
  });
});
