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
