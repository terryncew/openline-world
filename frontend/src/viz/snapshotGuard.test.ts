/**
 * Snapshot session/epoch guard tests (WORLD-AUTHORITY-001 defect 3, pass 2).
 * Run with: node --test src/viz/snapshotGuard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldCommitSnapshot,
  visibleCheckpoints,
  type SnapshotCommitState,
} from "./snapshotGuard.ts";

const base: SnapshotCommitState = { generation: 1, session: "sess-A", checkpointCount: 2 };

test("old-session snapshot arriving after reset is discarded", () => {
  // reset incremented the generation; the delayed response carries the old one
  const ok = shouldCommitSnapshot(
    { generation: 2, session: null, checkpointCount: 0 },
    { generation: 1, session: "sess-A", checkpointCount: 2, taskId: "task-workshop-1" },
    "task-workshop-1"
  );
  assert.equal(ok, false);
});

test("empty stale response arriving after completed snapshot is discarded", () => {
  // same session, same generation, but checkpoint count went backwards
  const ok = shouldCommitSnapshot(
    base,
    { generation: 1, session: "sess-A", checkpointCount: 0, taskId: "task-workshop-1" },
    "task-workshop-1"
  );
  assert.equal(ok, false);
});

test("prior-session response with matching generation is discarded", () => {
  const ok = shouldCommitSnapshot(
    base,
    { generation: 1, session: "sess-B", checkpointCount: 2, taskId: "task-workshop-1" },
    "task-workshop-1"
  );
  assert.equal(ok, false);
});

test("task_id mismatch is discarded", () => {
  const ok = shouldCommitSnapshot(
    base,
    { generation: 1, session: "sess-A", checkpointCount: 2, taskId: "other-task" },
    "task-workshop-1"
  );
  assert.equal(ok, false);
});

test("current-session newer snapshot commits", () => {
  const ok = shouldCommitSnapshot(
    base,
    { generation: 1, session: "sess-A", checkpointCount: 3, taskId: "task-workshop-1" },
    "task-workshop-1"
  );
  assert.equal(ok, true);
});

test("first snapshot after reset commits (no committed session yet)", () => {
  const ok = shouldCommitSnapshot(
    { generation: 2, session: null, checkpointCount: 0 },
    { generation: 2, session: "sess-C", checkpointCount: 0, taskId: "task-workshop-1" },
    "task-workshop-1"
  );
  assert.equal(ok, true);
});

test("future checkpoint hidden until its causal receipt seq is revealed", () => {
  const cps = [
    { seq: 6, checkpoint: 1 },
    { seq: 17, checkpoint: 2 },
  ];
  // only the first receipt revealed: checkpoint 2 stays hidden
  assert.deepEqual(visibleCheckpoints(cps, 6).map((c) => c.checkpoint), [1]);
  // both receipts revealed: both visible, ordered
  assert.deepEqual(visibleCheckpoints(cps, 17).map((c) => c.checkpoint), [1, 2]);
  // nothing revealed: nothing visible
  assert.deepEqual(visibleCheckpoints(cps, 0), []);
});
