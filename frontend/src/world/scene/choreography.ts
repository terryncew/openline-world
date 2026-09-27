/**
 * TRACK 3 — workflow-to-stage binding for the shared world.
 *
 * Pure staging logic: turns real backend workflow state (listings + agreements
 * from the frozen backend) into a single concrete scene plan — where the worker
 * is, where the counterpart is, what happens to the work-object token, and how
 * the camera frames the active interaction.
 *
 * Every staged element is traceable to a real backend fact:
 *  - the worker is always the agreement's proposer (backend: "the fulfiller is
 *    always the proposer — they do the work"), the counterpart the listing owner;
 *  - placement follows the agreement status (proposed / agreed / settled …);
 *  - the verdict beat is staged only when the agreement's `history` carries a
 *    real accepted/refused entry, and only for a few seconds after it landed;
 *  - "awaiting review" is staged only while the submit request is genuinely in
 *    flight (the backend resolves submitted → verdict → settled synchronously,
 *    so no durable "submitted" state is ever observed — the in-flight request
 *    is the honest signal);
 *  - a record folder lands in the cabinet only for settled agreements that
 *    actually carry receipts.
 *
 * Nothing here invents state. When the world is quiet (no live work), the plan
 * is null and the scene rests.
 */
import type { WorldAgreement, WorldListing } from "../api";

/* ------------------------------------------------------------------ types */

/** Display stages — the viewer-facing reading of the workflow state. */
export type DisplayStage =
  | "discovery"
  | "proposal"
  | "production"
  | "awaiting-review"
  | "verdict-accepted"
  | "verdict-refused"
  | "recorded";

/** Token appearance vocabulary (matches the AgreementToken stage prop). */
export type WorkItemStage =
  | "discovery"
  | "proposed"
  | "agreed"
  | "submitted"
  | "accepted"
  | "refused"
  | "settled";

export interface StageCamera {
  target: [number, number, number];
  camera: [number, number, number];
}

export interface TokenCopy {
  stageWord: string;
  placeWord: string;
  desc: string;
  title: string;
}

export type TokenPlacement =
  | { mode: "held"; holderPid: string }
  | { mode: "placed"; spot: [number, number, number] };

export interface StagePlan {
  /** Stable-ish key: stage + agreement id, used to detect stage changes. */
  key: string;
  stage: DisplayStage;
  tokenLook: WorkItemStage;
  copy: TokenCopy;
  agreement: WorldAgreement | null;
  listing: WorldListing | null;
  /** The proposer — the one who does the work. */
  workerPid: string | null;
  /** The listing owner — the one whose manual agree/release decides it. */
  counterpartPid: string | null;
  /** Scene anchors; null means "not staged — stay at natural idle". */
  workerAnchor: [number, number, number] | null;
  counterpartAnchor: [number, number, number] | null;
  token: TokenPlacement;
  boothX: number | null;
  verdict: "accepted" | "refused" | null;
  camera: StageCamera;
}

export interface StageInput {
  agreements: WorldAgreement[];
  listings: WorldListing[];
  /** Receiving-counter booth x for a participant id (null when unknown). */
  boothXOf: (pid: string) => number | null;
  /** Natural anchor of a participant's figure (host home / visitor spot). */
  homeOf: (pid: string) => [number, number, number] | null;
  /** Agreement id whose submit request is currently in flight, if any. */
  submitInFlightId: string | null;
  nowMs: number;
}

/* ------------------------------------------------- agreement picking (moved
   from WorldScene; picks the single active interaction to stage) */

const LIVE_STAGES = new Set(["proposed", "agreed", "submitted"]);
const CLOSED_STAGES = new Set(["settled", "accepted", "refused", "declined"]);

export interface WorkItem {
  stage: WorkItemStage;
  agreement: WorldAgreement | null;
  listing: WorldListing | null;
}

export function pickWorkItem(agreements: WorldAgreement[], listings: WorldListing[]): WorkItem | null {
  const byNew = (a: WorldAgreement, b: WorldAgreement) =>
    (b.created_at || "").localeCompare(a.created_at || "");
  const active = [...agreements].filter((a) => LIVE_STAGES.has((a.status || "").toLowerCase())).sort(byNew)[0];
  if (active) {
    return { stage: (active.status || "").toLowerCase() as WorkItemStage, agreement: active, listing: null };
  }
  const terminal = [...agreements]
    .filter((a) => CLOSED_STAGES.has((a.status || "").toLowerCase()))
    .sort(byNew)[0];
  if (terminal && terminal.status !== "declined") {
    return { stage: (terminal.status || "").toLowerCase() as WorkItemStage, agreement: terminal, listing: null };
  }
  const newest = [...listings]
    .filter((l) => (l.status || "").toLowerCase() === "open")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
  if (newest) return { stage: "discovery", agreement: null, listing: newest };
  return null;
}

/* ---------------------------------------------------------------- verdict */

interface VerdictInfo {
  verdict: "accepted" | "refused";
  atMs: number;
}

/** The verdict is real only when the backend wrote it into the agreement's history. */
function verdictOf(a: WorldAgreement): VerdictInfo | null {
  const h = a.history ?? [];
  for (let i = h.length - 1; i >= 0; i--) {
    const s = (h[i]?.status || "").toLowerCase();
    if (s === "accepted" || s === "refused") {
      const at = Date.parse(h[i]?.at ?? "");
      return { verdict: s, atMs: Number.isFinite(at) ? at : 0 };
    }
  }
  // Fallback: the backend's recorded decision (no reliable timestamp).
  const d = String((a.decision as { decision?: unknown } | null)?.decision ?? "").toUpperCase();
  if (d === "STOPPED") return { verdict: "refused", atMs: 0 };
  if (d === "ALLOWED") return { verdict: "accepted", atMs: 0 };
  return null;
}

/** The verdict beat plays for a few seconds after the verdict lands, then the
 *  record is filed. Fresh enough that the viewer saw the transition happen. */
const VERDICT_BEAT_MS = 9000;

/* ---------------------------------------------------------------- anchors */

/** Workbench (bench): work end / review end. */
const BENCH_WORK: [number, number, number] = [-3.1, 0, -1.05];
const BENCH_REVIEW: [number, number, number] = [-1.6, 0, -1.05];
const BENCH_TOKEN: [number, number, number] = [-3.1, 1.17, -2.2];
/** The receiving tray at the bench's review end (tray local [1.0,·,-0.2]). */
const TRAY_TOKEN: [number, number, number] = [-1.4, 1.5, -2.4];
const BOARD_TOKEN: [number, number, number] = [0, 1.16, 2.35];
const CABINET_TOKEN: [number, number, number] = [3.0, 2.42, 1.6];

/* ----------------------------------------------------------------- cameras */

/** Phone-size framing: 3/4 views at figure height, never top-down, never on
 *  the interaction axis. The worker must read as an upright character at
 *  phone size in every beat — the camera pulls back/out to clear geometry
 *  rather than sitting inside it.
 *
 *  The exchange board is a 5.4-wide, 3.5-tall wall at z=0.6 (x in [-2.7,2.7],
 *  y in [0.35,3.85]). Cameras and their lerp paths stay clear of it: the
 *  discovery camera sits east of the board (x>2.7) and every stage-to-stage
 *  path crosses z=0.6 at x>2.7 (around the board's east edge), never through.
 */
const CAM_DISCOVERY: StageCamera = { target: [-0.5, 1.2, 2.8], camera: [5.0, 2.2, 4.5] };
const CAM_PRODUCTION: StageCamera = { target: [-2.6, 1.0, -1.5], camera: [-5.0, 2.2, 0.0] };
const CAM_REVIEW: StageCamera = { target: [-1.4, 1.0, -1.8], camera: [-3.8, 2.2, 0.2] };
const CAM_RECORDED: StageCamera = { target: [2.8, 1.9, 1.5], camera: [2.8, 4.2, 5.8] };

function proposalCamera(bx: number): StageCamera {
  // 3/4 view from the southeast, north of the board: the worker (south of
  // the booth, holding the parcel) in the foreground, the counter booth
  // beyond. Never top-down. The camera x (bx+4.0) keeps the lerp path from
  // the discovery camera around the board's east edge (crosses z=0.6 at
  // x>2.9).
  return { target: [bx, 1.0, -3.8], camera: [bx + 4.0, 2.4, -1.8] };
}

/* ------------------------------------------------------------------- main */

function tokenTitle(a: WorldAgreement | null, listing: WorldListing | null): string {
  return a?.listing_title ?? listing?.title ?? a?.agreement_id.slice(0, 12) ?? "work";
}

function counterpartyName(a: WorldAgreement): string {
  return a.counterpart_display ?? "the listing owner";
}

export function describeStage(inp: StageInput): StagePlan | null {
  const item = pickWorkItem(inp.agreements, inp.listings);
  if (!item) return null;

  /* --- discovery: a listing on the board, nothing agreed yet --- */
  if (!item.agreement) {
    const listing = item.listing!;
    return {
      key: `discovery:${listing.listing_id}`,
      stage: "discovery",
      tokenLook: "discovery",
      copy: {
        stageWord: "discovery",
        placeWord: "on the exchange board",
        desc: "listed — nothing agreed yet",
        title: tokenTitle(null, listing),
      },
      agreement: null,
      listing,
      workerPid: null,
      counterpartPid: null,
      workerAnchor: null,
      counterpartAnchor: null,
      token: { mode: "placed", spot: BOARD_TOKEN },
      boothX: null,
      verdict: null,
      camera: CAM_DISCOVERY,
    };
  }

  const a = item.agreement;
  const id = a.agreement_id;
  const status = (a.status || "").toLowerCase();
  const workerPid = a.proposer;
  const counterpartPid = a.counterpart;
  const boothX = inp.boothXOf(counterpartPid) ?? 0;

  /* --- proposal: the worker has brought the sealed parcel to the listing
         owner's counter and waits. The owner's explicit agree is the only
         thing that moves this forward — the worker is not acting. --- */
  if (status === "proposed") {
    const workerAnchor: [number, number, number] = [boothX + 0.95, 0, -3.5];
    const counterpartAnchor: [number, number, number] = [boothX - 0.15, 0, -5.3];
    return {
      key: `proposal:${id}`,
      stage: "proposal",
      tokenLook: "proposed",
      copy: {
        stageWord: "proposal",
        placeWord: "at the receiving counters",
        desc: `waiting on ${counterpartyName(a)} — their explicit agree comes next`,
        title: tokenTitle(a, null),
      },
      agreement: a,
      listing: null,
      workerPid,
      counterpartPid,
      workerAnchor,
      counterpartAnchor,
      token: { mode: "held", holderPid: workerPid },
      boothX,
      verdict: null,
      camera: proposalCamera(boothX),
    };
  }

  /* --- production: agreed — the worker has the open crate at the bench --- */
  if (status === "agreed" && inp.submitInFlightId !== id) {
    return {
      key: `production:${id}`,
      stage: "production",
      tokenLook: "agreed",
      copy: {
        stageWord: "production",
        placeWord: "at the workbench",
        desc: "both sides agreed — work underway",
        title: tokenTitle(a, null),
      },
      agreement: a,
      listing: null,
      workerPid,
      counterpartPid,
      workerAnchor: [...BENCH_WORK],
      counterpartAnchor: null,
      token: { mode: "placed", spot: [...BENCH_TOKEN] as [number, number, number] },
      boothX,
      verdict: null,
      camera: CAM_PRODUCTION,
    };
  }

  /* --- awaiting review: the submit request is at the receiver. The worker
         carries the parcel to the receiving tray and waits with it — nothing
         is released until the backend's verdict arrives. The token is held
         (not pre-placed) so the carry reads: the worker visibly brings the
         work object to the tray. --- */
  if (status === "agreed" || status === "submitted") {
    return {
      key: `awaiting-review:${id}`,
      stage: "awaiting-review",
      tokenLook: "submitted",
      copy: {
        stageWord: "review",
        placeWord: "at the bench — review end",
        desc: "with the receiver — awaiting the verdict",
        title: tokenTitle(a, null),
      },
      agreement: a,
      listing: null,
      workerPid,
      counterpartPid,
      workerAnchor: [...BENCH_REVIEW],
      counterpartAnchor: null,
      token: { mode: "held", holderPid: workerPid },
      boothX,
      verdict: null,
      camera: CAM_REVIEW,
    };
  }

  /* --- settled: the backend wrote the verdict. Show it for a beat, then file. --- */
  if (status === "settled") {
    const v = verdictOf(a);
    const hasReceipts = a.receipts != null && Object.keys(a.receipts).length > 0;
    const fresh = v != null && inp.nowMs - v.atMs < VERDICT_BEAT_MS;

    if (fresh && v!.verdict === "accepted") {
      return {
        key: `verdict-accepted:${id}`,
        stage: "verdict-accepted",
        tokenLook: "accepted",
        copy: {
          stageWord: "accepted",
          placeWord: "at the bench — review end",
          desc: "the receiver authorized it",
          title: tokenTitle(a, null),
        },
        agreement: a,
        listing: null,
        workerPid,
        counterpartPid,
        // The worker steps back from the bench — the release is the receiver's.
        workerAnchor: [-1.6, 0, -0.2],
        counterpartAnchor: null,
        token: { mode: "placed", spot: [...TRAY_TOKEN] as [number, number, number] },
        boothX,
        verdict: "accepted",
        camera: CAM_REVIEW,
      };
    }

    if (fresh && v!.verdict === "refused") {
      return {
        key: `verdict-refused:${id}`,
        stage: "verdict-refused",
        tokenLook: "refused",
        copy: {
          stageWord: "refused",
          placeWord: "at the bench — review end",
          desc: "the receiver stopped it",
          title: tokenTitle(a, null),
        },
        agreement: a,
        listing: null,
        workerPid,
        counterpartPid,
        // The worker carries the refused parcel back home.
        workerAnchor: inp.homeOf(workerPid) ?? [...BENCH_WORK],
        counterpartAnchor: null,
        token: { mode: "held", holderPid: workerPid },
        boothX,
        verdict: "refused",
        camera: CAM_REVIEW,
      };
    }

    /* --- recorded: the verdict is old enough to file. The folder lands in
           the cabinet only when the receipts actually exist. --- */
    if (v?.verdict === "accepted" && hasReceipts) {
      return {
        key: `recorded:${id}`,
        stage: "recorded",
        tokenLook: "settled",
        copy: {
          stageWord: "settled",
          placeWord: "in the records cabinet",
          desc: "closed — sealed & filed",
          title: tokenTitle(a, null),
        },
        agreement: a,
        listing: null,
        workerPid,
        counterpartPid,
        workerAnchor: null,
        counterpartAnchor: null,
        token: { mode: "placed", spot: [...CABINET_TOKEN] as [number, number, number] },
        boothX,
        verdict: "accepted",
        camera: CAM_RECORDED,
      };
    }
    return {
      key: `recorded:${id}`,
      stage: "recorded",
      tokenLook: "settled",
      copy: {
        stageWord: "settled",
        placeWord: "filed — refused",
        desc: "refused — the record is filed, the worker kept the parcel",
        title: tokenTitle(a, null),
      },
      agreement: a,
      listing: null,
      workerPid,
      counterpartPid,
      workerAnchor: inp.homeOf(workerPid),
      counterpartAnchor: null,
      token: { mode: "held", holderPid: workerPid },
      boothX,
      verdict: v?.verdict ?? "refused",
      camera: CAM_RECORDED,
    };
  }

  return null;
}
