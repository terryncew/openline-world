import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSHOP_SPATIAL_CONTRACT as W } from "../spatial/workshopContract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

test("workshop spatial contract pins the exterior and threshold", () => {
  assert.deepEqual(W.exterior, { width: 3.4, depth: 5.8, wallHeight: 2.2, totalHeight: 3.8 });
  assert.deepEqual(W.door, { width: 1.3, height: 2.15, centerX: 0, floorY: 0, facadeZ: 2.96 });
  assert.equal(W.orientationY, -0.12);
  assert.equal(W.floorElevation, 0);
  assert.equal(W.thresholdDepth, 1.3);
  assert.deepEqual(W.entranceAxis, [0, 0, -1]);
  assert.ok(Object.isFrozen(W) && Object.isFrozen(W.exterior) && Object.isFrozen(W.door));
});

test("town exterior and proven interior consume the same immutable threshold", () => {
  const exterior = read("../town/buildings.tsx");
  const interior = read("../viz/scene/WorkshopInterior.tsx");
  for (const source of [exterior, interior]) {
    assert.match(source, /WORKSHOP_SPATIAL_CONTRACT as W/);
    assert.match(source, /name=\{W\.id\}/);
    assert.match(source, /W\.door\.width/);
    assert.match(source, /W\.door\.height/);
    assert.match(source, /W\.door\.facadeZ/);
    assert.match(source, /W\.thresholdDepth/);
  }
});

test("entry and exit traverse the same threshold identity without widening the message", () => {
  const town = read("../town/TownApp.tsx");
  const host = read("SquareHost.tsx");
  const viz = read("../viz/VizView.tsx");
  assert.match(town, /requestEnterWorkshop/);
  assert.match(host, /\?threshold=return/);
  assert.match(viz, /setThresholdPhase\("leaving"\)/);
  assert.match(viz, /setCameraView\("entrance"\)/);
  assert.doesNotMatch(host, /postMessage\s*\(/);
});
