import { test } from "node:test";
import assert from "node:assert/strict";
import { carrierPoseAt, CARRIER_LOOP, CRANK_CENTER, crankHandleAt } from "../town/robots/motion.ts";

test("carrier holds the destination through set-down and meets the mirrored loop seam", () => {
  const beforeSetDown = carrierPoseAt(9.0, 1);
  const afterSetDown = carrierPoseAt(12.0, 1);
  assert.ok(beforeSetDown.rootX > 0.9, "carrier must still be at the destination before set-down");
  assert.equal(afterSetDown.rootX, 1.15);
  assert.equal(afterSetDown.timberX, 1.15);
  const end = carrierPoseAt(CARRIER_LOOP - 1e-6, 1);
  const next = carrierPoseAt(CARRIER_LOOP, -1);
  assert.ok(Math.abs(end.rootX - next.rootX) < 1e-6, "robot position must not jump at seam");
  assert.ok(Math.abs(end.timberX - next.timberX) < 1e-6, "timber must not jump at seam");
  const angleDelta = Math.atan2(Math.sin(end.turnY - next.turnY), Math.cos(end.turnY - next.turnY));
  assert.ok(Math.abs(angleDelta) < 1e-6, "facing must not flip at seam");
  assert.ok(Math.abs(end.timberY - 0.56) < 1e-6, "timber must rest on the destination sawhorse");
});

test("crank contact anchor follows the visible transformed handle", () => {
  assert.deepEqual(CRANK_CENTER, [0.95, 1.02, 0]);
  assert.deepEqual(crankHandleAt(0), [CRANK_CENTER[0], CRANK_CENTER[1] + 0.2, 0.08]);
  const q = crankHandleAt(Math.PI / 2);
  assert.ok(Math.abs(q[0] - 0.95) < 1e-12);
  assert.ok(Math.abs(q[1] - 0.94) < 1e-12);
  assert.ok(Math.abs(q[2] - 0.2) < 1e-12);
});
