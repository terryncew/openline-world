/**
 * Reducer unit tests — run with: npm test
 * (node --test "src/viz/*.test.ts"; erasable TS, no build step)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceEvents } from "./reducer.ts";
import type { WEvent } from "./protocol.ts";

let seq = 0;
function ev(
  kind: string,
  provenance: WEvent["provenance"],
  detail: Record<string, unknown>,
  summary = kind
): WEvent {
  seq += 1;
  return {
    event_id: `test-${seq}`,
    seq,
    task_id: "t",
    ts: "",
    source: "test",
    kind,
    provenance,
    summary,
    detail,
  };
}
function reset() { seq = 0; }

function mandateCreate(helper: string, n = 1) {
  return ev("mandate", "owner-signed",
    { mandate_id: `mandate-${helper}-${n}`, scopes: ["notes.read"] },
    `${helper} onboarded`);
}
function mandateRevoke(helper: string, n = 1) {
  return ev("mandate", "owner-signed",
    { mandate_id: `mandate-${helper}-${n}`, status: "REVOKED" },
    `${helper} revoked`);
}
function proposal(helper: string, action: string) {
  return ev("proposal", "agent-reported", { helper, action }, `${helper} proposes ${action}`);
}
function decision(helper: string, action: string, d: "ALLOWED" | "STOPPED") {
  return ev("decision", "receiver-signed",
    { helper, action, decision: d, reason_codes: [] }, `${d} for ${action}`);
}
function receipt(helper: string, action: string, d: "ALLOWED" | "STOPPED", i: number) {
  return ev("receipt", "receiver-signed",
    { receipt: { receipt_id: `r-${i}`, subject_id: helper, action, decision: d, reason_codes: [] } },
    `receipt ${d}`);
}
function activity(helper: string, summary: string) {
  return ev("activity", "agent-reported", { helper }, summary);
}

test("1: ALLOW renders only after a real ALLOWED decision event", () => {
  reset();
  const p = proposal("wren", "notes.read");
  let s = reduceEvents([mandateCreate("wren"), p]);
  assert.equal(s.proposals[0].status, "in-flight");
  assert.equal(s.proposals[0].decisionProvenance, null);
  // a decision with no matching proposal invents nothing
  s = reduceEvents([mandateCreate("wren"), decision("wren", "notes.read", "ALLOWED")]);
  assert.equal(s.proposals.length, 0);
  assert.equal(s.unrecognized.length, 1);
  // the real sequence
  s = reduceEvents([mandateCreate("wren"), p, decision("wren", "notes.read", "ALLOWED")]);
  assert.equal(s.proposals[0].status, "allowed");
  assert.equal(s.proposals[0].decisionProvenance, "receiver-signed");
});

test("2: STOPPED renders only after a real refusal", () => {
  reset();
  const p = proposal("wren", "config.write");
  let s = reduceEvents([mandateCreate("wren"), p]);
  assert.equal(s.proposals[0].status, "in-flight");
  s = reduceEvents([mandateCreate("wren"), p, decision("wren", "config.write", "STOPPED")]);
  assert.equal(s.proposals[0].status, "stopped");
  assert.equal(s.proposals[0].decisionProvenance, "receiver-signed");
});

test("3: revoked mandate -> next attempt renders refused", () => {
  reset();
  const s = reduceEvents([
    mandateCreate("wren"),
    proposal("wren", "notes.read"),              // p1
    decision("wren", "notes.read", "ALLOWED"),
    receipt("wren", "notes.read", "ALLOWED", 1),
    mandateRevoke("wren"),
    proposal("wren", "notes.read"),              // p2
    decision("wren", "notes.read", "STOPPED"),
    receipt("wren", "notes.read", "STOPPED", 2),
  ]);
  assert.equal(s.proposals[0].status, "allowed");   // history untouched
  assert.equal(s.proposals[1].status, "stopped");   // post-revoke attempt refused
  assert.equal(s.workers[0].active, false);
  assert.equal(s.authorities[0].active, false);
});

test("4: historical receipts persist after revocation", () => {
  reset();
  const s = reduceEvents([
    mandateCreate("wren"),
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "ALLOWED"),
    receipt("wren", "notes.read", "ALLOWED", 1),
    mandateRevoke("wren"),
  ]);
  assert.equal(s.receipts.length, 1);
  assert.equal(s.receipts[0].decision, "ALLOWED");
  assert.equal(s.receipts[0].provenance, "receiver-signed");
});

test("5: worker replacement does not mutate wren's receipts or standing", () => {
  reset();
  const s = reduceEvents([
    mandateCreate("wren"),
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "ALLOWED"),
    receipt("wren", "notes.read", "ALLOWED", 1),
    mandateRevoke("wren"),
    mandateCreate("juniper"),
    proposal("juniper", "notes.write"),
    decision("juniper", "notes.write", "ALLOWED"),
    receipt("juniper", "notes.write", "ALLOWED", 2),
  ]);
  assert.equal(s.receipts.length, 2);
  assert.equal(s.receipts[0].helper, "wren");      // wren's receipt intact
  assert.equal(s.receipts[1].helper, "juniper");
  const wren = s.workers.find((w) => w.workerId === "wren")!;
  const juniper = s.workers.find((w) => w.workerId === "juniper")!;
  assert.equal(wren.active, false);
  assert.equal(juniper.active, true);
  assert.notEqual(wren.mandateId, juniper.mandateId);
  assert.equal(s.authorities.filter((a) => a.active).length, 1);
});

test("6: replay determinism — same events twice, same logical state", () => {
  reset();
  const list = [
    mandateCreate("wren"),
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "ALLOWED"),
    receipt("wren", "notes.read", "ALLOWED", 1),
    activity("wren", "Wren says done"),
    mandateRevoke("wren"),
    mandateCreate("juniper"),
  ];
  const a = reduceEvents(list);
  const b = reduceEvents(list);
  assert.deepEqual(a, b);
  // input order does not matter either: seq is the ordering key
  const shuffled = [...list].reverse();
  assert.deepEqual(reduceEvents(shuffled), a);
  // duplicates do not double-count
  assert.deepEqual(reduceEvents([...list, ...list]), a);
});

test("7: malformed events are recorded visibly, never invented around", () => {
  reset();
  const weird = ev("frobnicate", "agent-reported", {}, "???");
  const noMandateId = ev("mandate", "owner-signed", { scopes: [] }, "bad mandate");
  const orphanDecision = decision("ghost", "x.y", "ALLOWED");
  const s = reduceEvents([weird, noMandateId, orphanDecision, mandateCreate("wren")]);
  assert.equal(s.unrecognized.length, 3);
  assert.equal(s.workers.length, 1);   // only the well-formed mandate
  assert.equal(s.proposals.length, 0); // orphan decision invented nothing
  assert.equal(s.receipts.length, 0);
});

test("8: agent-reported activity never makes a receipt or a verdict visual", () => {
  reset();
  // the key teaching beat: "wren says done" — even with a suggestive summary
  const s = reduceEvents([
    mandateCreate("wren"),
    activity("wren", "Wren says done"),
    activity("wren", "ALLOWED for everything"), // hostile summary, still just speech
  ]);
  assert.equal(s.speeches.length, 2);
  assert.equal(s.speeches[0].provenance, "agent-reported");
  assert.equal(s.receipts.length, 0);
  assert.equal(s.proposals.length, 0);
  assert.equal(s.unrecognized.length, 0);
});

test("9: provenance is kept on every visual element", () => {
  reset();
  const s = reduceEvents([
    mandateCreate("wren"),
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "ALLOWED"),
    receipt("wren", "notes.read", "ALLOWED", 1),
    activity("wren", "tidying"),
  ]);
  assert.equal(s.workers[0].provenance, "owner-signed");
  assert.equal(s.authorities[0].provenance, "owner-signed");
  assert.equal(s.proposals[0].provenance, "agent-reported");
  assert.equal(s.proposals[0].decisionProvenance, "receiver-signed");
  assert.equal(s.receipts[0].provenance, "receiver-signed");
  assert.equal(s.speeches[0].provenance, "agent-reported");
});

/* ---- WORLD-AUTHORITY-001 mapping tests ---- */

function jobNote() {
  return ev("note", "owner-signed",
    { job_id: "task-workshop-1", title: "project notes" }, "Job opened");
}
function plainNote() {
  return ev("note", "owner-signed", {}, "Demo complete");
}

test("10: job anchor renders only from owner-signed note with job_id", () => {
  reset();
  const s = reduceEvents([plainNote(), jobNote()]);
  assert.ok(s.job);
  assert.equal(s.job.jobId, "task-workshop-1");
  assert.equal(s.job.title, "project notes");
  // a non-owner note with job_id must not anchor the job
  reset();
  const s2 = reduceEvents([
    ev("note", "agent-reported", { job_id: "x" }, "fake"),
  ]);
  assert.equal(s2.job, null);
});

test("11: activity-only helper figures unadmitted; mandate upgrades in place", () => {
  reset();
  const s = reduceEvents([activity("juniper", "Juniper arrives")]);
  assert.equal(s.workers.length, 1);
  assert.equal(s.workers[0].workerId, "juniper");
  assert.equal(s.workers[0].admitted, false);
  assert.equal(s.workers[0].active, false);
  assert.equal(s.authorities.length, 0); // no seal without a mandate
  const s2 = reduceEvents([
    activity("juniper", "Juniper arrives"),
    mandateCreate("juniper"),
  ]);
  assert.equal(s2.workers.length, 1); // upgraded in place, never duplicated
  assert.equal(s2.workers[0].admitted, true);
  assert.equal(s2.workers[0].active, true);
  assert.equal(s2.workers[0].provenance, "owner-signed");
  assert.equal(s2.authorities.length, 1);
});

test("12: in-flight proposal past its moment is unadmitted; latest is not", () => {
  reset();
  const p = proposal("wren", "notes.rewrite");
  const s = reduceEvents([p]);
  assert.equal(s.proposals[0].status, "in-flight");
  assert.equal(s.proposals[0].unadmitted, false); // nothing moved past it yet
  reset();
  const s2 = reduceEvents([
    proposal("wren", "notes.rewrite"),
    mandateRevoke("wren"),
  ]);
  assert.equal(s2.proposals[0].unadmitted, true); // world moved on, no decision
  // a decided proposal is never unadmitted
  reset();
  const s3 = reduceEvents([
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "STOPPED"),
    receipt("wren", "notes.read", "STOPPED", 1),
  ]);
  assert.equal(s3.proposals[0].status, "stopped");
  assert.equal(s3.proposals[0].unadmitted, false);
});

test("13: full authority-demo beat sequence maps to state", () => {
  reset();
  const s = reduceEvents([
    jobNote(),                                   // beat 1
    mandateCreate("wren"),                       // beat 2
    proposal("wren", "notes.write"),             // beat 3
    decision("wren", "notes.write", "ALLOWED"),
    receipt("wren", "notes.write", "ALLOWED", 1),
    proposal("wren", "notes.rewrite"),           // beat 8 (ambient)
    mandateRevoke("wren"),                       // beat 4a
    proposal("wren", "notes.read"),              // beat 4b
    decision("wren", "notes.read", "STOPPED"),
    receipt("wren", "notes.read", "STOPPED", 2),
    activity("juniper", "Juniper arrives"),       // beat 5a
    activity("juniper", "Juniper reaches"),       // beat 5b
    mandateCreate("juniper"),                    // beat 6
    proposal("juniper", "notes.write"),          // beat 7
    decision("juniper", "notes.write", "ALLOWED"),
    receipt("juniper", "notes.write", "ALLOWED", 3),
  ]);
  assert.ok(s.job);
  const wren = s.workers.find((w) => w.workerId === "wren");
  const juniper = s.workers.find((w) => w.workerId === "juniper");
  assert.ok(wren && juniper);
  assert.equal(wren.active, false);              // revoked, dimmed in place
  assert.equal(juniper.admitted, true);          // granted by the owner
  assert.equal(juniper.active, true);
  assert.equal(s.workers.length, 2);            // no duplicates
  const unadmitted = s.proposals.find((p) => p.action === "notes.rewrite");
  assert.ok(unadmitted);
  assert.equal(unadmitted.unadmitted, true);     // never decided, at rest
  assert.equal(s.receipts.length, 3);           // history survives replacement
  assert.equal(s.receipts.filter((r) => r.decision === "STOPPED").length, 1);
});

test("14: decision_requested=false is unadmitted from first appearance", () => {
  reset();
  const p = ev("proposal", "agent-reported",
    { helper: "wren", action: "notes.rewrite", decision_requested: false },
    "wren proposes notes.rewrite");
  const s = reduceEvents([p]);
  assert.equal(s.proposals.length, 1);
  assert.equal(s.proposals[0].status, "in-flight");
  assert.equal(s.proposals[0].unadmitted, true); // immediately, no later event needed
  // and it never receives a verdict: a later decision for ANOTHER proposal
  // does not touch it
  reset();
  const s2 = reduceEvents([
    ev("proposal", "agent-reported",
      { helper: "wren", action: "notes.rewrite", decision_requested: false }),
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "ALLOWED"),
  ]);
  const unad = s2.proposals.find((x) => x.action === "notes.rewrite");
  assert.ok(unad);
  assert.equal(unad.status, "in-flight");
  assert.equal(unad.unadmitted, true);
  const decided = s2.proposals.find((x) => x.action === "notes.read");
  assert.equal(decided.status, "allowed");
  assert.equal(decided.unadmitted, false);
});

test("15: ordinary proposals keep existing behavior (no flag)", () => {
  reset();
  const s = reduceEvents([proposal("wren", "notes.read")]);
  assert.equal(s.proposals[0].unadmitted, false); // awaiting decision, travels
  reset();
  const s2 = reduceEvents([
    proposal("wren", "notes.read"),
    decision("wren", "notes.read", "ALLOWED"),
  ]);
  assert.equal(s2.proposals[0].status, "allowed");
  assert.equal(s2.proposals[0].unadmitted, false);
});
