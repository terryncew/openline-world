/**
 * OpenLine World visualization — pure event reducer.
 * frontend/src/viz/reducer.ts
 *
 * `(events) => VizSceneState`. No Date.now, no Math.random, no network, no
 * DOM. Same event list in => identical logical state out. Sort by seq,
 * dedupe by event_id, so replay order is the persisted order.
 *
 * Truthfulness invariants (enforced by construction, covered by tests):
 *  1. A proposal renders "allowed"/"stopped" ONLY after a real decision
 *     event for that exact proposal lands. No decision event, no verdict.
 *  2. Receipt visuals come ONLY from receipt events (receiver-signed).
 *  3. Revocation renders ONLY from a mandate event with status REVOKED.
 *  4. Worker entry is INFERRED from the owner's mandate-create event —
 *     the backend emits no explicit entry event; the inference is labeled.
 *     There is no exit event; a revoked worker is rendered dimmed in place,
 *     never animated away.
 *  5. Agent-reported activity (e.g. "wren says done") NEVER produces a
 *     receipt visual, an allow visual, or a refuse visual. It renders as
 *     speech near the worker — a claim, not a receipt.
 *  6. Malformed or unplaceable events land in `unrecognized` and are shown
 *     as unreadable markers. Nothing is invented around them.
 *  7. Provenance is kept on every visual element.
 */

import {
  EMPTY_SCENE,
  asProvenance,
  type VizSceneState,
  type WEvent,
} from "./protocol.ts";

/**
 * Derive the helper id from a mandate id of the backend's shape
 * `mandate-<helper>-<n>`. This is a display derivation only: the reducer
 * never invents a mandate, it only labels the one the owner signed.
 */
export function workerIdFromMandateId(mandateId: string): string | null {
  const m = /^mandate-(.+)-(\d+)$/.exec(mandateId);
  return m ? m[1] : null;
}

function detailOf(ev: WEvent): Record<string, unknown> {
  const d = (ev as { detail?: unknown }).detail;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function reduceEvents(input: WEvent[]): VizSceneState {
  // Deterministic order: persisted seq, tie-broken by event_id.
  const events = [...input].sort((a, b) =>
    a.seq === b.seq ? (a.event_id < b.event_id ? -1 : 1) : a.seq - b.seq
  );
  const seen = new Set<string>();
  const state: VizSceneState = {
    workers: [],
    authorities: [],
    proposals: [],
    receipts: [],
    speeches: [],
    unrecognized: [],
    maxSeq: EMPTY_SCENE.maxSeq,
    eventCount: 0,
  };

  const unrec = (
    ev: WEvent, kind: string, reason: string
  ) => {
    state.unrecognized.push({
      eventId: ev.event_id,
      seq: ev.seq,
      kind,
      reason,
      provenance: asProvenance(ev.provenance),
    });
  };

  for (const ev of events) {
    if (!ev || typeof ev.event_id !== "string" || typeof ev.seq !== "number") {
      continue; // not an event at all; the source already filters these
    }
    if (seen.has(ev.event_id)) continue;
    seen.add(ev.event_id);
    state.eventCount += 1;
    if (ev.seq > state.maxSeq) state.maxSeq = ev.seq;

    const kind = typeof ev.kind === "string" ? ev.kind : "";
    const provenance = asProvenance(ev.provenance);
    const detail = detailOf(ev);

    switch (kind) {
      case "mandate": {
        const mandateId = str(detail.mandate_id);
        if (!mandateId) {
          unrec(ev, kind, "mandate event without a mandate_id");
          break;
        }
        const status = str(detail.status);
        if (status === "REVOKED") {
          // Invariant 3: revocation only from a real REVOKED mandate event.
          const auth = state.authorities.find((a) => a.mandateId === mandateId);
          if (!auth) {
            unrec(ev, kind, `revocation for unknown mandate ${mandateId}`);
            break;
          }
          auth.active = false;
          auth.revokedSeq = ev.seq;
          const worker = state.workers.find((w) => w.mandateId === mandateId);
          if (worker) {
            worker.active = false;
            worker.revokedSeq = ev.seq;
          }
          break;
        }
        // Mandate create: the owner admitted a worker. Worker "entry" is
        // inferred here and labeled as such (invariant 4).
        if (state.authorities.some((a) => a.mandateId === mandateId)) {
          unrec(ev, kind, `duplicate mandate create for ${mandateId}`);
          break;
        }
        const workerId = workerIdFromMandateId(mandateId);
        if (!workerId) {
          unrec(ev, kind, `mandate_id not shaped like mandate-<helper>-<n>: ${mandateId}`);
          break;
        }
        const scopes = strArray(detail.scopes);
        state.authorities.push({
          mandateId,
          workerId,
          ownerPrincipal: null, // filled from snapshot by the view layer
          scopes,
          active: true,
          createdSeq: ev.seq,
          revokedSeq: null,
          provenance, // owner-signed: this is the rule
        });
        state.workers.push({
          workerId,
          mandateId,
          scopes,
          active: true,
          enteredSeq: ev.seq, // INFERRED from mandate create; see protocol.ts
          revokedSeq: null,
          provenance, // owner-signed: the owner's admission
        });
        break;
      }

      case "proposal": {
        const helper = str(detail.helper);
        const action = str(detail.action);
        if (!helper || !action) {
          unrec(ev, kind, "proposal event without helper/action");
          break;
        }
        state.proposals.push({
          id: ev.event_id,
          workerId: helper,
          action,
          seq: ev.seq,
          status: "in-flight",
          decisionSeq: null,
          reasonCodes: [],
          provenance, // agent-reported: a claim, not yet a decision
          decisionProvenance: null,
        });
        break;
      }

      case "decision": {
        const helper = str(detail.helper);
        const action = str(detail.action);
        const decision = str(detail.decision);
        if (!helper || !action || (decision !== "ALLOWED" && decision !== "STOPPED")) {
          unrec(ev, kind, "decision event without helper/action/ALLOWED|STOPPED");
          break;
        }
        // Invariant 1: verdict visuals only for a real decision on a real,
        // still-open proposal. Latest open proposal for this helper+action.
        const open = state.proposals
          .filter((p) => p.workerId === helper && p.action === action && p.status === "in-flight" && p.seq < ev.seq)
          .sort((a, b) => b.seq - a.seq)[0];
        if (!open) {
          unrec(ev, kind, `decision ${decision} with no open proposal for ${helper}/${action}`);
          break;
        }
        open.status = decision === "ALLOWED" ? "allowed" : "stopped";
        open.decisionSeq = ev.seq;
        open.reasonCodes = strArray(detail.reason_codes);
        open.decisionProvenance = provenance; // receiver-signed: the decision
        break;
      }

      case "receipt": {
        // Invariant 2: receipt visuals only from receipt events.
        const r = detail.receipt;
        if (!r || typeof r !== "object") {
          unrec(ev, kind, "receipt event without a receipt record");
          break;
        }
        const rec = r as Record<string, unknown>;
        state.receipts.push({
          id: ev.event_id,
          receiptId: str(rec.receipt_id) ?? ev.event_id,
          seq: ev.seq,
          helper: str(rec.subject_id) ?? "",
          action: str(rec.action) ?? "",
          decision: rec.decision === "STOPPED" ? "STOPPED" : "ALLOWED",
          reasonCodes: strArray(rec.reason_codes),
          receipt: rec,
          provenance, // receiver-signed: the receiver minted it
        });
        break;
      }

      case "activity": {
        // Invariant 5: activity is speech. It never becomes a receipt,
        // an allow, or a refuse — no matter what the summary says.
        const helper = str(detail.helper);
        if (!helper) {
          unrec(ev, kind, "activity event without a helper");
          break;
        }
        state.speeches.push({
          id: ev.event_id,
          workerId: helper,
          text: typeof ev.summary === "string" ? ev.summary : "activity",
          seq: ev.seq,
          provenance, // agent-reported: a claim, never a receipt
        });
        break;
      }

      case "note":
      case "connection":
        // Legitimate non-visual events: recorded in the log, not the scene.
        break;

      default:
        unrec(ev, kind || "(missing kind)", `no visual mapping for kind "${kind}"`);
        break;
    }
  }

  return state;
}
