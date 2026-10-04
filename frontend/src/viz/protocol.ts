/**
 * OpenLine World visualization — protocol types.
 * frontend/src/viz/protocol.ts
 *
 * Every visual element carries the provenance of the event that created it:
 * the EventLog already separates who had standing to say something happened,
 * and the scene shows that standing, not just the happening.
 *
 * Provenance vocabulary (verbatim from the backend EventLog):
 *   agent-reported   — a worker said it (a claim, never a receipt)
 *   receiver-signed  — the receiver gate decided it (the decision)
 *   owner-signed     — the owner authorized it (the rule)
 *   adapter-mapped   — a hook reported it (activity only, never a receipt)
 */

import type { WEvent } from "../api";

export type { WEvent };

export type Provenance =
  | "agent-reported"
  | "receiver-signed"
  | "owner-signed"
  | "adapter-mapped"
  | "unknown";

/** Normalize a backend provenance string; anything unexpected becomes
 *  "unknown" rather than being guessed at. */
export function asProvenance(p: unknown): Provenance {
  return p === "agent-reported" ||
    p === "receiver-signed" ||
    p === "owner-signed" ||
    p === "adapter-mapped"
    ? p
    : "unknown";
}

/** Short standing label for badges. */
export function provenanceLabel(p: Provenance): string {
  switch (p) {
    case "agent-reported": return "agent says";
    case "receiver-signed": return "receiver decided";
    case "owner-signed": return "owner action";
    case "adapter-mapped": return "hook activity";
    default: return "standing unknown";
  }
}

/** One plain-words line explaining what the standing means. The `who`
 *  is the worker/helper display id when the speaker is an agent. */
export function provenanceExplain(p: Provenance, who?: string): string {
  switch (p) {
    case "agent-reported":
      return `${who ?? "The worker"} said this — a claim, not a receipt.`;
    case "receiver-signed":
      return "The receiver signed this — this is the decision.";
    case "owner-signed":
      return "The owner signed this — this is the rule.";
    case "adapter-mapped":
      return "A hook reported this — activity only, never a receipt.";
    default:
      return "No standing recorded — shown as-is, trusted as nothing.";
  }
}

/** A worker in the scene. Entry is INFERRED from the owner's mandate-create
 *  event — the backend emits no explicit "worker entered" event, so
 *  enteredSeq is documented as an inference, never as a protocol fact.
 *  `admitted` is false when the figure comes from an agent-reported
 *  activity claim alone (no mandate): such a figure carries no authority,
 *  never acts, and never receives receipts. */
export interface VizWorker {
  workerId: string;
  mandateId: string;
  scopes: string[];
  active: boolean;
  admitted: boolean;
  enteredSeq: number;
  revokedSeq: number | null;
  /** Standing of the mandate event that admitted this worker. */
  provenance: Provenance;
}

/** An authority (mandate) in the scene. Visibly separate from the worker:
 *  the seal belongs to the owner, not to the machine carrying it. */
export interface VizAuthority {
  mandateId: string;
  workerId: string;
  ownerPrincipal: string | null;
  scopes: string[];
  active: boolean;
  createdSeq: number;
  revokedSeq: number | null;
  provenance: Provenance;
}

/** A proposed action traveling toward the receiver gate.
 *  `unadmitted` is true only when the proposal is still in-flight and the
 *  event stream has moved past it without any decision: the claim exists,
 *  was never decided, and renders at rest (side table), never stamped,
 *  never acted on. */
export interface VizProposal {
  /** event_id of the proposal event. */
  id: string;
  workerId: string;
  action: string;
  seq: number;
  status: "in-flight" | "allowed" | "stopped";
  unadmitted: boolean;
  /** Structural flag from the event: decision_requested=false. */
  decisionRequested: boolean;
  decisionSeq: number | null;
  reasonCodes: string[];
  /** The proposal is a claim: agent-reported. */
  provenance: Provenance;
  /** Set only when a real decision event lands: receiver-signed. */
  decisionProvenance: Provenance | null;
}

/** A durable receipt left behind after a receiver decision. */
export interface VizReceipt {
  /** event_id of the receipt event. */
  id: string;
  receiptId: string;
  seq: number;
  helper: string;
  action: string;
  decision: "ALLOWED" | "STOPPED";
  reasonCodes: string[];
  /** The backend's public receipt projection, exactly as sent (a subset of the full signed record). */
  receipt: Record<string, unknown>;
  provenance: Provenance;
}

/** Agent-reported speech/activity: rendered near the worker, explicitly
 *  NOT routed to the gate. The "wren says done" beat is the key teaching
 *  moment — speech is a claim, and only the receiver mints receipts. */
export interface VizSpeech {
  /** event_id of the activity event. */
  id: string;
  workerId: string;
  text: string;
  seq: number;
  provenance: Provenance;
}

/** Events the reducer could not honestly place: shown as a visible
 *  "unreadable" marker, never silently dropped, never invented around. */
export interface VizUnrecognized {
  eventId: string;
  seq: number;
  kind: string;
  reason: string;
  provenance: Provenance;
}

/** The job: declared by the owner, belonging to no worker. Rendered ONLY
 *  from an owner-signed note carrying a job_id — the crate's anchor. */
export interface VizJob {
  jobId: string;
  title: string;
  openedSeq: number;
}

/** A job checkpoint: the workshop executor applied an ALLOWED action to
 *  the persistent job state. Distinct from the receipt (authorization).
 *  Carried on the read-only snapshot, filtered by revealed seq in the view
 *  so the paced reveal never shows future work. */
export interface VizCheckpoint {
  seq: number;
  helper: string;
  action: string;
  checkpoint: number;
}

export interface VizSceneState {
  job: VizJob | null;
  workers: VizWorker[];
  authorities: VizAuthority[];
  proposals: VizProposal[];
  receipts: VizReceipt[];
  speeches: VizSpeech[];
  unrecognized: VizUnrecognized[];
  maxSeq: number;
  eventCount: number;
}

export const EMPTY_SCENE: VizSceneState = {
  job: null,
  workers: [],
  authorities: [],
  proposals: [],
  receipts: [],
  speeches: [],
  unrecognized: [],
  maxSeq: 0,
  eventCount: 0,
};

/** Deterministic 32-bit hash of a string (FNV-1a). Used for hues and
 *  layout jitter so replays are stable without Math.random. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Canonical worker hues: wren teal, juniper amber, anything else derived. */
export function workerHue(workerId: string): number {
  if (workerId === "wren") return 0.47; // teal #2a9d8f
  if (workerId === "juniper") return 0.11; // amber #e9c46a
  return (hashStr(workerId) % 360) / 360;
}
