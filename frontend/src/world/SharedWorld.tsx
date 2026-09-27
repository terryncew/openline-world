/**
 * SharedWorld — frontend/src/world/SharedWorld.tsx
 *
 * The shared openline world, first location: the existing workshop.
 * One common world, two participants (Amara + Wren, Theo + Juniper),
 * each agent under its own bounded authority from its own join profile.
 *
 * This view is a LOCAL PREVIEW: Amara and Theo are both you. Joins use
 * real WebCrypto Ed25519 keypairs generated in this browser and real
 * nonce signatures — no stubs. Everything else the backend decides is
 * shown exactly as returned: the scene never animates an expected answer.
 *
 * Three rule layers, shown distinctly (never one "permissions" blob):
 *   1. COMMON WORLD RULES — "Rules of the place": house rules, ambient.
 *   2. OWNER RULES — each owner's control over their own agent, private panel.
 *   3. TRANSACTION TERMS — on the offer itself; "Accept" is the agreement.
 * No permission modals anywhere: presence opt-in and the standing mandate
 * from join are preconfigured; the receiver checks standing silently.
 *
 * Three honesty lanes, visually distinct:
 *   agent-reported (amber) — what agents say; receiver (green/red) — what
 *   the gate decided; confirmed effects (brass) — receipts and mandate
 *   changes. Missing data renders as "unavailable", never fabricated.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  worldApi,
  squareApi,
  agentApi,
  BackendTooOld,
  WORKER_STATE_LABELS,
  type ActivityMode,
  type BoardFilters,
  type BoardSuggestion,
  type GateDecision,
  type WorkerState,
  type ClaimCorrectResult,
  type ClaimGraphDescribe,
  type ClaimReport,
  type ClaimRecord,
  type NewsroomDescribe,
  type NewsroomArticle,
  type NewsroomDispatch,
  type NewsroomImportResult,
  type NewsroomReviewResult,
  type OfferKind,
  type WorldAgreement,
  type WorldEvent,
  type WorldListing,
  type WorldOffer,
  type WorldParticipant,
  type WorldPresence,
  type WorldReceipt,
  type SharedReceiptEntry,
  type WorldState,
  canonicalJson,
  sha256Hex,
  type NewsroomSubmitPackageResult,
  type PackageAcceptance,
  type ResearchPackage,
} from "./api";
/** Separate key custody: the browser holds each participant's owner and
 *  worker keys; the server keeps only its receiver key. */
import { CustodyClient, type Scope } from "./custody";
import { WorldScene, type ClaimDeskSummary, type HostState, type NewsroomDeskSummary, type TransportStatus, type VisitorState, listingStatusWord, agreementStageWord } from "./scene/WorldScene";
import { ModeBadge } from "./components/ModeBadge";
import { OwnerConsole } from "./components/OwnerConsole";
import { ResearchInspector } from "./components/ResearchInspector";
import { CommissionInspector } from "./components/CommissionInspector";
import { sound, SOUND_ATTRIBUTION } from "../sound/sound";
import "./world.css";

/* Rules of the place: full text on desktop; at phone widths a compact
 * one-line bar, tap to expand. Purely presentational — same copy. */
function PlaceRules({ children }: { children: ReactNode }) {
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 560px)");
    const upd = () => setNarrow(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  if (!narrow) {
    return (
      <section className="world-placerules" aria-label="Rules of the place">
        <span className="world-placerules-tag">Rules of the place</span>
        {children}
      </section>
    );
  }
  return (
    <section className={`world-placerules${open ? " open" : ""}`} aria-label="Rules of the place">
      <button type="button" className="pr-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="world-placerules-tag">Rules of the place</span>
        <span className="pr-caret" aria-hidden="true">▾</span>
      </button>
      <div className="pr-body">{children}</div>
    </section>
  );
}

type Actor = "amara" | "theo";

const ACTOR_DEF: Record<
  Actor,
  { owner: string; agentId: string; agent: string; scopes: string[]; capabilities: string[] }
> = {
  amara: {
    owner: "Amara",
    agentId: "wren",
    agent: "Wren",
    scopes: ["notes.read", "notes.write", "draft.write", "claimgraph.correct", "newsroom.review"],
    capabilities: ["task-offers", "presence", "notes"],
  },
  theo: {
    owner: "Theo",
    agentId: "juniper",
    agent: "Juniper",
    scopes: ["notes.read", "notes.write", "draft.write", "claimgraph.correct", "newsroom.review"],
    capabilities: ["task-offers", "presence", "notes"],
  },
};

const OFFER_KINDS: OfferKind[] = ["tidy-notes", "summarize", "draft"];

interface WorldSession {
  actor: Actor;
  participant_id: string;
  agent_id: string;
  token: string;
  standing: string;
  revoked: boolean;
  publicKeyHex: string;
  /** The mandate scopes granted at join and accepted by the receiver.
   *  The agent's capabilities ARE these scopes — shown as "what this agent
   *  may do". Nothing here creates, imports, or develops skills. */
  scopes: string[];
}

interface DecisionEntry {
  ts: string;
  actor: Actor;
  action: string;
  via: "propose" | "accept";
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  transaction_id?: string;
}

interface LaneNote {
  ts: string;
  text: string;
}

/** A square participant's joined session: the display name the owner chose,
 *  the agent they brought, and the token the backend returned. */
interface SquareSession {
  participant_id: string;
  agent_id: string;
  token: string;
  displayName: string;
  agentName: string;
  publicKeyHex: string;
  /* No private key here: the visitor's owner and worker keys live in the
   * custody module's IndexedDB stores, reachable only through the
   * CustodyClient held in squareClientRef. */
}

/** What the visitor says brings them — chosen explicitly, never assumed. */
type Intent = "browse" | "need" | "offer";

/** Plain-language standard terms, shown on the post form and on any
 *  listing whose backend publishes no terms of its own. */
const STANDARD_TERMS =
  "Either side may leave at any time. A proposal needs the other side's explicit agreement — nothing is posted, suggested, or committed for you. Agreed is mutual consent to terms; nothing is authorized until the receiver decides.";

type BeatStatus = "idle" | "active" | "done" | "failed";

interface Beat {
  id: string;
  title: string;
  desc: string;
  expect: string;
}

const BEATS: Beat[] = [
  { id: "join", title: "Both join", desc: "Amara brings Wren, Theo brings Juniper — each signs a fresh challenge nonce with its own new keypair.", expect: "two participants, each with its own standing" },
  { id: "presence", title: "Both opt in to presence", desc: "Each owner flips their own “be visible” toggle. Presence is opt-in only — never by default.", expect: "both lanterns lit in the scene" },
  { id: "permitted", title: "Wren does permitted work", desc: "Amara asks Wren to tidy the notes — “notes.write”, inside Wren’s mandate.", expect: "receiver ALLOWED" },
  { id: "out-of-scope", title: "Out-of-scope refused", desc: "Amara asks Wren to send email — “send-email” is outside the mandate.", expect: "receiver STOPPED" },
  { id: "offer", title: "Amara offers a task", desc: "A small harmless task, posted to the shared space with its terms.", expect: "offer visible to both" },
  { id: "accept", title: "Theo accepts", desc: "Theo’s single explicit Accept — that Accept is the whole transaction.", expect: "real decision + private receipt" },
  { id: "work", title: "Juniper does the work", desc: "The task runs through Theo’s own gate, under Theo’s own mandate.", expect: "ALLOWED; receipt private to Theo" },
  { id: "revoke", title: "Amara revokes Wren", desc: "One tap in Amara’s private panel. No walking, no dialogs.", expect: "mandate revoked; Theo and Juniper untouched" },
  { id: "refused-after", title: "Wren’s next request refused", desc: "Wren asks to tidy notes again — the receiver checks standing silently.", expect: "real STOPPED from the backend" },
  { id: "own-mandate", title: "Juniper’s own mandate", desc: "Juniper’s authority: Juniper via Theo’s own join (agent standing current). Amara’s standing: revoked. Nothing inherited.", expect: "Juniper acts, Amara stays revoked" },
  { id: "done", title: "Done", desc: "The world keeps running. Theo may share the receipt — or not.", expect: "guided path complete" },
];

function now(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** The receipt id is the first 16 chars of the gate's signature value —
 *  the same derivation the backend uses (_receipt_id). Derived locally
 *  from the signed record, never invented: a receipt without a signature
 *  has no id here. */
function receiptIdOf(r: WorldReceipt): string | null {
  if (r.receipt_id) return r.receipt_id;
  const sig = r.signature as { value?: unknown } | undefined;
  const value = sig && typeof sig.value === "string" ? sig.value : "";
  return value ? value.slice(0, 16) : null;
}

/** Attach the derived receipt id to each record the backend sent. */
function withReceiptIds(rs: WorldReceipt[]): WorldReceipt[] {
  return rs.map((r) => {
    const id = receiptIdOf(r);
    return id && !r.receipt_id ? { ...r, receipt_id: id } : r;
  });
}

function shortId(id: string | undefined): string {
  if (!id) return "unavailable";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** The demonstration fixture package, mirrored from
 *  research/commons/package/ (manifest.json, study.py, input.csv).
 *  The client hashes these exact bytes with crypto.subtle and the vendor
 *  canonical JSON profile; the receiver re-derives everything from the
 *  pinned bytes and never trusts the client's word for them. */
const FIXTURE_PACKAGE = {
  manifest: {
    schema: "openline.research.package.v1",
    title: "Mean tide height at the harbor, Q3 2026",
    claim: "The mean tide height at the harbor in Q3 2026, computed from the harbor-log readings CSV, is 2.43 m.",
    producer_id: "external-producer-demo",
    expected_result: "{\"mean_tide_height_m\": 2.43, \"n\": 8, \"period\": \"2026-Q3\", \"source\": \"harbor-log readings CSV (fixture transcription)\"}\n",
    reproduce: "python3 study.py",
    citations: [
      { locator: "fixture://harbor-log.txt", note: "Harbor log fixture (morning watch): the readings CSV is transcribed from this source." },
      { locator: "producer://external-producer-demo/transcription-note", note: "Producer-supplied transcription note: how the CSV rows were copied from the log. Producer-supplied; grants no acceptance authority." },
    ],
    limitations: "Demonstration fixture, not a scientific finding. The input is a short hand transcription (n=8) of a fictional harbor log, not calibrated gauge data. The mean is arithmetic only; no uncertainty, tide model, or datum correction is applied. Passing the receiver's checks admits the package for display; it does not establish that the claim is true.",
    producer_review: "PRODUCER-SUPPLIED REVIEW — grants no acceptance authority\nThe producer re-ran study.py on the pinned input.csv and observed the expected output. This self-review is the producer's own check: it grants no acceptance authority. Only the receiver's evaluation under its frozen criteria can admit the package.",
  },
  study_py: `"""Fixture study for RESEARCH-COMMONS-001 (labeled demonstration fixture).

Reads input.csv (tide readings transcribed from the harbor log fixture),
computes the mean tide height, and prints exactly one JSON line on stdout.
Stdlib only: csv, json, sys. No network, no file writes, no imports beyond
the standard library.
"""
import csv
import json
import sys


def main() -> int:
    readings = []
    with open("input.csv", newline="", encoding="utf-8") as f:
        # Comment lines (starting with '#') are labels, not data.
        rows = (line for line in f if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows):
            readings.append(float(row["height_m"]))
    if not readings:
        print(json.dumps({"error": "no readings"}))
        return 1
    mean_height = sum(readings) / len(readings)
    print(json.dumps({
        "mean_tide_height_m": round(mean_height, 2),
        "n": len(readings),
        "period": "2026-Q3",
        "source": "harbor-log readings CSV (fixture transcription)",
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
`,
  input_csv: `# Tide readings transcribed from the harbor log fixture (demonstration data).
# Morning watch, east berth gauge. Q3 2026.
timestamp,height_m
2026-07-06T06:35:00Z,2.35
2026-07-20T06:35:00Z,2.48
2026-08-03T06:35:00Z,2.41
2026-08-17T06:35:00Z,2.52
2026-08-31T06:35:00Z,2.38
2026-09-07T06:35:00Z,2.44
2026-09-14T06:35:00Z,2.39
2026-09-21T06:35:00Z,2.47
`,
};

/** A backend HOLD is not an error: the action was never evaluated, no
 *  receipt was minted, nothing was decided. Render it as a hold — the
 *  honest response is to act again so standing is re-checked, not to
 *  report a failure. */
function holdOrError(action: string, e: unknown): string {
  const msg = String(e);
  if (msg.includes("HOLD_STANDING_UNKNOWN")) {
    return `${action} is on hold — the session's standing is stale (idle over 5 minutes). Nothing was evaluated and nothing was decided. Act again to re-check standing; the receiver decides once standing is current.`;
  }
  return `${action} failed: ${msg}`;
}

/**
 * The mode a participant's badge shows. The backend's verbatim
 * activity_mode wins whenever Track A reports it. Otherwise, two pieces
 * of local ground truth apply: the guided tour is scripted playback
 * (its actors are "scripted"), and the visitor's own figure moves only
 * by their own taps ("manual"). Anything else is unknown — the backend
 * hasn't said — and gets no badge, never a guessed one.
 */
function participantMode(
  wp: WorldParticipant | undefined,
  opts: { tourActor?: boolean; isSelf?: boolean }
): ActivityMode | null {
  const reported = wp?.activity_mode;
  if (reported === "live" || reported === "automation" || reported === "scripted" || reported === "manual") {
    return reported;
  }
  if (opts.tourActor) return "scripted";
  if (opts.isSelf) return "manual";
  return null;
}

/** Badge text for a backend-reported "manual" on a figure that isn't the
 *  viewer's own: the backend's own gloss for "manual" is "human-driven
 *  browser sessions", so the badge says "MANUAL — human-driven" instead
 *  of claiming "YOU". Self keeps the default "YOU — manual". */
const MANUAL_OTHER_LABEL = "MANUAL — human-driven";
function modeLabelFor(mode: ActivityMode | null, isSelf: boolean): string | undefined {
  return mode === "manual" && !isSelf ? MANUAL_OTHER_LABEL : undefined;
}

export function SharedWorld({ onExit }: { onExit: () => void }) {
  const [sessions, setSessions] = useState<Record<Actor, WorldSession | null>>({ amara: null, theo: null });
  const [acting, setActing] = useState<Actor>("amara");
  const [world, setWorld] = useState<WorldState | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [backendErr, setBackendErr] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [agentNotes, setAgentNotes] = useState<LaneNote[]>([]);
  const [effects, setEffects] = useState<LaneNote[]>([]);
  const [captions, setCaptions] = useState<LaneNote[]>([]);
  const [ownReceipts, setOwnReceipts] = useState<Record<Actor, WorldReceipt[]>>({ amara: [], theo: [] });
  const [beatState, setBeatState] = useState<Record<string, { status: BeatStatus; note: string }>>({});
  const [listMode, setListMode] = useState(false);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("workshop-sound") === "off"; } catch { return false; }
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    try {
      const v = localStorage.getItem("world-reduced-motion");
      if (v !== null) return v === "1";
    } catch { /* ignore */ }
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [offerForm, setOfferForm] = useState({ kind: "summarize" as OfferKind, title: "Summarize the workbench notes", detail: "Two or three sentences, plain words." });
  const [busy, setBusy] = useState<string | null>(null);
  const [waitingActor, setWaitingActor] = useState<Actor | null>(null);
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  const [quality, setQuality] = useState<"high" | "low">("high");
  /** claim-graph chapter: the reading desk — everything rendered is backend
   *  records; a null report standing means "no event yet", never invented. */
  const [claimGraph, setClaimGraph] = useState<ClaimGraphDescribe | null>(null);
  const [openClaimReportId, setOpenClaimReportId] = useState<string | null>(null);
  const [claimView, setClaimView] = useState<"cutaway" | "list">("cutaway");
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [claimVerdict, setClaimVerdict] = useState<ClaimCorrectResult | null>(null);
  /** newsroom chapter: the small desk — the owner-selected report, manually
   *  imported dispatches, and proposed connections that stay proposals until
   *  an accepted review admits evidence through the real impact engine. */
  const [newsroom, setNewsroom] = useState<NewsroomDescribe | null>(null);
  const [openNewsroom, setOpenNewsroom] = useState(false);
  const [openDispatchId, setOpenDispatchId] = useState<string | null>(null);
  const [nrBusy, setNrBusy] = useState<string | null>(null);
  const [nrVerdict, setNrVerdict] = useState<NewsroomImportResult | NewsroomReviewResult | null>(null);

  /* ---------- the square (default arrival) ---------- */

  /** The default experience is the public square, freely explorable. The
   *  guided beats live on as the "Guided tour" — reachable from the
   *  signpost in the square and from the button beside the canvas. */
  const [mode, setMode] = useState<"square" | "tour">("square");

  const [squareSession, setSquareSession] = useState<SquareSession | null>(null);
  const [hostSessions, setHostSessions] = useState<Record<"wren" | "juniper", SquareSession | null>>({ wren: null, juniper: null });
  const [joinName, setJoinName] = useState("");
  const [joinAgentName, setJoinAgentName] = useState("");
  const [joinIntent, setJoinIntent] = useState<Intent | null>(null);
  const [joinPresence, setJoinPresence] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [boardListings, setBoardListings] = useState<WorldListing[]>([]);
  const [boardSource, setBoardSource] = useState<"board" | "offers-fallback" | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BoardFilters>({ side: "all", kind: "", hide_samples: false });
  const [squareAgreements, setSquareAgreements] = useState<WorldAgreement[]>([]);
  const [agreementsError, setAgreementsError] = useState<string | null>(null);
  const [suggestionList, setSuggestionList] = useState<BoardSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  /** the visitor's own private receipts, from GET /api/world/receipts —
   *  the record behind every receipt id the square can open. */
  const [squareReceipts, setSquareReceipts] = useState<WorldReceipt[]>([]);
  /** the receipt currently open in the inspector, or null */
  const [openReceipt, setOpenReceipt] = useState<{ record: WorldReceipt | null; receiptId: string; role: string | null } | null>(null);
  /** the stage shows the town as a plain list, not 3D */
  const [squareListView, setSquareListView] = useState(false);
  const [inspectListingId, setInspectListingId] = useState<string | null>(null);
  /** quiet notice for an own agreement that moved while the owner looked
   *  elsewhere — feeds the square toast and the console FAB flag */
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);
  const [inspectAgreementId, setInspectAgreementId] = useState<string | null>(null);
  const [inspectVisitorId, setInspectVisitorId] = useState<string | null>(null);
  const [postForm, setPostForm] = useState({ kind: "", title: "", detail: "" });
  const [squareBusy, setSquareBusy] = useState<string | null>(null);
  const [squareNote, setSquareNote] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  /** panels drawer: the square's side content, on demand — the default
   *  scene stays clean */
  const [panelsOpen, setPanelsOpen] = useState(false);
  /** research inspector: the owner's view of one bounded external-agent run */
  const [researchOpen, setResearchOpen] = useState(false);
  const [commissionOpen, setCommissionOpen] = useState(false);
  /** owner console: the fixed drawer, reachable without walking */
  const [consoleOpen, setConsoleOpen] = useState(false);
  /** footer disclosure: collapsed to one line by default, full text one tap away */
  const [footOpen, setFootOpen] = useState(false);
  /** increments on every 6s poll — the owner console refreshes with it */
  const [pollTick, setPollTick] = useState(0);
  /** the square visitor's own agent revoked via the console */
  const [squareRevoked, setSquareRevoked] = useState(false);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  /* ---------- helpers ---------- */

  const note = useCallback((setter: React.Dispatch<React.SetStateAction<LaneNote[]>>, text: string) => {
    setter((p) => [...p.slice(-49), { ts: now(), text }]);
  }, []);
  const agentNote = useCallback((t: string) => note(setAgentNotes, t), [note]);
  const effectNote = useCallback((t: string) => note(setEffects, t), [note]);

  const caption = useCallback((text: string) => {
    setCaptions((p) => [...p.slice(-11), { ts: now(), text }]);
  }, []);

  /** Open a parcel's interior — only ever called with an offer that has a
   *  real transaction; the reveal renders from backend records. */
  const openParcel = useCallback((offerId: string | null) => {
    setOpenOfferId(offerId);
    if (offerId) {
      sound.unlock();
      sound.paper();
      caption("sound · the parcel unfolds — paper");
    }
  }, [caption]);

  const cue = useCallback((kind: "ui" | "allow" | "refuse" | "paper" | "stamp" | "arrive" | "depart", text: string) => {
    sound.unlock();
    sound[kind]();
    caption(`sound · ${text}`);
  }, [caption]);

  const refresh = useCallback(async () => {
    try {
      const s = await worldApi.state();
      setWorld(s);
      setBackendOk(true);
      setBackendErr(null);
    } catch (e) {
      setBackendOk(false);
      setBackendErr(String(e));
    }
    // the desk is best-effort: an older backend simply has no reports
    try {
      const g = await worldApi.claimgraph();
      setClaimGraph(g);
    } catch {
      setClaimGraph(null);
    }
    // the newsroom is best-effort too: an older backend has no small desk
    try {
      const n = await worldApi.newsroom();
      setNewsroom(n);
    } catch {
      setNewsroom(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* ---------- the square: join, board, agreements ---------- */

  const getSession = useCallback((actor: Actor): WorldSession => {
    const s = sessionsRef.current[actor];
    if (!s) throw new Error(`${ACTOR_DEF[actor].owner} has not joined yet — run the “Both join” beat first.`);
    return s;
  }, []);

  const fetchReceipts = useCallback(async (actor: Actor) => {
    try {
      const s = getSession(actor);
      const r = await worldApi.receipts(s.participant_id, s.token);
      setOwnReceipts((p) => ({ ...p, [actor]: withReceiptIds(r.receipts ?? []) }));
    } catch {
      /* private receipts are best-effort; the receiver-lane decision is already shown */
    }
  }, [getSession]);

  /* ---------- core actions (all real API calls) ---------- */

  /* The join ceremony, under separate key custody: the owner's tap
   *  generates the owner-root + epoch keys and the worker key in this
   *  browser profile (non-extractable, IndexedDB), grants the worker a
   *  bounded mandate, and joins with the owner-signed bundle plus a
   *  worker-signed proof-of-control. The server verifies and admits the
   *  head; join proves key control and grants no action permission.
   *
   *  If this profile holds a wallet but the keys are gone, the identity is
   *  NOT recoverable and is NOT silently replaced — the beat fails loudly. */
  const joinActor = useCallback(async (actor: Actor): Promise<WorldSession> => {
    const def = ACTOR_DEF[actor];
    sound.unlock();
    const { client, status } = await CustodyClient.open({
      participantId: actor,
      displayName: def.owner,
      agentDisplayName: def.agent,
      scopes: def.scopes as Scope[],
    });
    custodyClientsRef.current.set(actor, client);
    // Test hook: expose the custody client map for automated browser
    // tests (two-profile flow). Not part of the UI.
    (window as unknown as { __custodyClients?: unknown }).__custodyClients = custodyClientsRef.current;
    if (status.kind === "keys-missing") {
      throw new Error(`${def.owner}'s keys are missing from this browser profile — the identity cannot be recovered and will not be silently replaced.`);
    }
    const j = await client.join();
    const workerPub = await client.worker.publicKeyHex();
    const sess: WorldSession = {
      actor,
      participant_id: j.participantId,
      agent_id: j.agentId,
token: j.token,
      standing: "current",
      revoked: false,
      publicKeyHex: workerPub,
      scopes: [...def.scopes], // the live mandate, granted here and accepted by the receiver
    };
    setSessions((p) => ({ ...p, [actor]: sess }));
    cue("arrive", `${def.owner} joined — arrival chime`);
    effectNote(`${def.owner} joined the world with ${def.agent} (mandate ${j.mandateId.slice(0, 18)}…, standing: current)`);
    await refresh();
    return sess;
  }, [cue, effectNote, refresh]);

  const setPresence = useCallback(async (actor: Actor, on: boolean) => {
    const s = getSession(actor);
    const def = ACTOR_DEF[actor];
    const presence: WorldPresence | null = on
      ? { status: "available", note: `${def.owner} · local preview` }
      : null;
    await worldApi.presence(s.participant_id, s.token, presence);
    cue("ui", on ? `${def.owner} opted in to presence — soft tap` : `${def.owner} went invisible — soft tap`);
    agentNote(`${def.owner} ${on ? "opted in to presence" : "withdrew presence"}`);
    await refresh();
  }, [getSession, cue, agentNote, refresh]);

  /** Ask the receiver about an action: the worker signs a presentation
   *  against a fresh receiver challenge; the receiver decides. The UI
   *  only displays the signed verdict. */
  const propose = useCallback(async (actor: Actor, action: string, via: "propose" | "accept" = "propose"): Promise<GateDecision> => {
    const client = custodyClientsRef.current.get(actor);
    if (!client) throw new Error(`${ACTOR_DEF[actor].owner} has no custody client — join first.`);
    const def = ACTOR_DEF[actor];
    agentNote(`${def.agent} asks the receiver: “${action}”`);
    setWaitingActor(actor); // waiting: amber ring, not a verdict
    let d: GateDecision;
    try {
      d = await client.proposeAction(action); // the real decision
    } finally {
      setWaitingActor(null);
    }
    const entry: DecisionEntry = {
      ts: now(), actor, action, via,
      decision: d.decision ?? "unavailable",
      receipt_id: d.receipt_id ?? "unavailable",
      reason_codes: d.reason_codes ?? [],
    };
    setDecisions((p) => [...p, entry]);
    if (entry.decision === "ALLOWED") cue("allow", `receiver allowed ${def.agent} — warm pluck`);
    else cue("refuse", `receiver refused ${def.agent} — low thud`);
    await fetchReceipts(actor);
    await refresh();
    return d;
  }, [getSession, agentNote, cue, fetchReceipts, refresh]);

  /** Revoke the worker's mandate: the OWNER signs the revocation in the
   *  local wallet, then pushes the new bundle to the receiver. Explicit
   *  owner gesture; permanent within the session. */
  const revoke = useCallback(async (actor: Actor) => {
    const client = custodyClientsRef.current.get(actor);
    if (!client) throw new Error(`${ACTOR_DEF[actor].owner} has no custody client — join first.`);
    const def = ACTOR_DEF[actor];
    const r = await client.revokeWorker();
    setSessions((p) => ({ ...p, [actor]: p[actor] ? { ...p[actor]!, revoked: true } : null }));
    cue("stamp", `${def.owner} revoked ${def.agent} — deep stamp`);
    cue("depart", `${def.agent} powers down — soft fall`);
    effectNote(`${def.owner} revoked ${def.agent}’s mandate${r.mandate_id ? ` (id ${shortId(r.mandate_id)})` : ""}`);
    await refresh();
  }, [getSession, cue, effectNote, refresh]);

  const makeOffer = useCallback(async (actor: Actor, task: { kind: OfferKind; title: string; detail: string }) => {
    const client = custodyClientsRef.current.get(actor);
    if (!client) throw new Error(`${ACTOR_DEF[actor].owner} has no custody client — join first.`);
    const def = ACTOR_DEF[actor];
    // Transaction terms, sent with the offer: no other party's gate is
    // required — the acceptor's own gate decides at acceptance time.
    // The poster's worker signs the authorization for the task's action.
    const r = await client.postOffer({ ...task, terms: { requires: [] } });
    agentNote(`${def.owner} offered “${task.title}” (${task.kind}) — offer ${shortId(r.offer_id)}`);
    cue("ui", "offer posted — soft tap");
    await refresh();
  }, [getSession, agentNote, cue, refresh]);

  const acceptOffer = useCallback(async (actor: Actor, offerId: string): Promise<GateDecision> => {
    const client = custodyClientsRef.current.get(actor);
    if (!client) throw new Error(`${ACTOR_DEF[actor].owner} has no custody client — join first.`);
    const def = ACTOR_DEF[actor];
    agentNote(`${def.owner} accepted the offer — the Accept is the whole agreement`);
    setWaitingActor(actor);
    let d: GateDecision;
    try {
      // the acceptor's worker signs the authorization — the real decision
      const offer = (world?.offers ?? []).find((o) => o.offer_id === offerId);
      const kind = offer && typeof offer.task?.kind === "string" ? offer.task.kind : "summarize";
      d = await client.acceptOffer(offerId, kind);
    } finally {
      setWaitingActor(null);
    }
    const entry: DecisionEntry = {
      ts: now(), actor, action: `accept offer ${shortId(offerId)}`, via: "accept",
      decision: d.decision ?? "unavailable",
      receipt_id: d.receipt_id ?? "unavailable",
      reason_codes: d.reason_codes ?? [],
      transaction_id: d.transaction_id,
    };
    setDecisions((p) => [...p, entry]);
    if (entry.decision === "ALLOWED") cue("allow", `receiver allowed the acceptance — warm pluck`);
    else cue("refuse", `receiver refused the acceptance — low thud`);
    await fetchReceipts(actor);
    await refresh();
    return d;
  }, [getSession, agentNote, cue, fetchReceipts, refresh, world]);

  const shareReceipt = useCallback(async (actor: Actor, receiptId: string) => {
    const s = getSession(actor);
    await worldApi.shareReceipt(s.participant_id, s.token, receiptId);
    cue("paper", "receipt filed into the shared space — paper swish");
    effectNote(`${ACTOR_DEF[actor].owner} shared receipt ${shortId(receiptId)} with the world`);
    await refresh();
  }, [getSession, cue, effectNote, refresh]);

  const resetWorld = useCallback(async () => {
    await worldApi.reset();
    for (const client of custodyClientsRef.current.values()) client.forgetSession();
    custodyClientsRef.current.clear();
    squareClientRef.current = null;
    setSessions({ amara: null, theo: null });
    setDecisions([]);
    setAgentNotes([]);
    setEffects([]);
    setOwnReceipts({ amara: [], theo: [] });
    setBeatState({});
    cue("stamp", "world reset — deep stamp");
    await refresh();
  }, [cue, refresh]);

  /* ---------- the square: join, board, agreements ---------- */

  const squareSessionRef = useRef<SquareSession | null>(null);
  squareSessionRef.current = squareSession;
  const squareAgreementsRef = useRef<WorldAgreement[]>([]);
  squareAgreementsRef.current = squareAgreements;
  const boardListingsRef = useRef<WorldListing[]>([]);
  boardListingsRef.current = boardListings;
  /** Every joined participant's custody client, by actor ("amara"/"theo")
   *  or participant id (square visitor, hosts). Holds the owner + worker
   *  keys in IndexedDB; the server never sees them. */
  const custodyClientsRef = useRef(new Map<string, CustodyClient>());
  /** The square visitor's client (also registered in custodyClientsRef). */
  const squareClientRef = useRef<CustodyClient | null>(null);
  /** last-seen statuses of own agreements (agreement_id -> status), for the
   *  quiet worker-action notice. Initialized on join; historical state
   *  never triggers a notice. */
  const seenOwnAgreementsRef = useRef<Map<string, string>>(new Map());
  /** timestamp of the owner's own last agreement action — own taps never
   *  trigger the worker-action notice (the lanes already cover them). */
  const lastOwnActionAtRef = useRef(0);
  /** the join that initialized the seen-map; re-joining re-initializes. */
  const seenInitForRef = useRef<string | null>(null);
  /** the join that received the delegation nudge; one nudge per session. */
  const nudgeForRef = useRef<string | null>(null);

  const randId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

  /* Join the square under separate key custody. The owner's tap runs the
   *  ceremony in THIS browser profile: owner-root + epoch keys and the
   *  worker key are generated as non-extractable WebCrypto keys in
   *  IndexedDB, the worker gets a bounded mandate, and the join carries
   *  the owner-signed bundle plus a worker-signed proof-of-control.
   *
   *  Hosts (Wren/Juniper) join under the preview's local ownership the
   *  first time any profile enters; later profiles see them and skip.
   *  If this profile holds the wallet but the keys are gone, the identity
   *  is NOT silently replaced — the join fails loudly. */
  const doJoinSquareParticipant = useCallback(async (
    participantId: string, displayName: string, _agentId: string, agentName: string
  ): Promise<SquareSession> => {
    const { client, status } = await CustodyClient.open({
      participantId,
      displayName,
      agentDisplayName: agentName,
    });
    custodyClientsRef.current.set(participantId, client);
    // Test hook: expose the custody client map for automated browser
    // tests (two-profile flow). Not part of the UI.
    (window as unknown as { __custodyClients?: unknown }).__custodyClients = custodyClientsRef.current;
    if (status.kind === "keys-missing") {
      throw new Error(`${displayName}'s keys are missing from this browser profile — the identity cannot be recovered and will not be silently replaced.`);
    }
    // Join. If the server already holds this participant (page reload in
    // the same tab — the bearer token survives in sessionStorage), reuse
    // the existing session instead of failing.
    let j: { participantId: string; agentId: string; token: string };
    try {
      j = await client.join();
    } catch (e) {
      const returningToken = status.kind === "returning" ? status.token : null;
      if (returningToken && /JOIN_STANDING_NOT_CURRENT/.test(String(e))) {
        j = { participantId: client.participantId, agentId: client.agentId, token: returningToken };
      } else {
        throw e;
      }
    }
    const workerPub = await client.worker.publicKeyHex();
    return {
      participant_id: j.participantId,
      agent_id: j.agentId,
token: j.token,
      displayName,
      agentName,
      publicKeyHex: workerPub,
    };
  }, []);

  /** Board + agreements + suggestions, each best-effort and honest about
   *  what the backend build actually supports. */
  const refreshSquare = useCallback(async () => {
    try {
      const b = await squareApi.boardOrFallback(filters);
      setBoardListings(b.listings);
      setBoardSource(b.source);
      setBoardError(null);
    } catch (e) {
      setBoardError(e instanceof BackendTooOld ? e.message : String(e));
    }
    const sq = squareSessionRef.current;
    try {
      const a = await squareApi.agreements();
      setSquareAgreements(a.agreements);
      setAgreementsError(null);
    } catch (e) {
      setAgreementsError(e instanceof BackendTooOld ? e.message : String(e));
    }
    if (sq) {
      try {
        const s = await squareApi.suggestions(sq.participant_id, sq.token);
        setSuggestionList(s.suggestions);
        setSuggestError(null);
      } catch (e) {
        setSuggestError(e instanceof BackendTooOld ? e.message : String(e));
      }
      // the visitor's own private receipts — the records behind every
      // receipt id the square can open. Best-effort: the lanes already
      // show decisions without them.
      try {
        const r = await worldApi.receipts(sq.participant_id, sq.token);
        setSquareReceipts(withReceiptIds(Array.isArray(r.receipts) ? r.receipts : []));
      } catch {
        /* leave the last good fetch standing */
      }
    }
    setLastPoll(Date.now());
  }, [filters]);

  const enterSquare = useCallback(async () => {
    const name = joinName.trim() || "Visitor";
    const agentName = joinAgentName.trim() || "Helper";
    if (!joinIntent) {
      setSquareNote("Choose what brings you here — browse, post a need, or offer work. Nothing is assumed.");
      return;
    }
    setSquareBusy("entering");
    setSquareNote(null);
    sound.unlock();
    try {
      // Hosts first: Wren and Juniper stand as HOSTS. If the backend
      // already holds them (a newer build may seed hosts), never rejoin.
      const st = await worldApi.state().catch(() => null);
      // Hosts are joined once per backend (their keys live in the first
      // profile that joined them). The custody client names the agent
      // "<participantId>-agent", so match on either id shape.
      const hasAgent = (aid: string) =>
        !!st?.participants.some((p) => p.participant_id === aid || (p as { agent?: { id?: string } }).agent?.id === aid || (p as { agent?: { id?: string } }).agent?.id === `${aid}-agent`);
      const hosts: Record<"wren" | "juniper", SquareSession | null> = { wren: null, juniper: null };
      for (const aid of ["wren", "juniper"] as const) {
        if (!hasAgent(aid)) {
          const h = await doJoinSquareParticipant(aid, aid === "wren" ? "Wren" : "Juniper", aid, aid === "wren" ? "Wren" : "Juniper");
          await worldApi.presence(h.participant_id, h.token, { status: "available", note: "host · local preview" }).catch(() => undefined);
          hosts[aid] = h;
        }
      }
      setHostSessions(hosts);
      // Then the visitor — with the explicitly chosen intent. The
      // participant id is stable across reloads: if this browser profile
      // already holds keys for a visitor, rejoin as that same participant
      // (a new random id would orphan the earlier identity's listings
      // and agreements). Leaving the square forgets the id.
      let visitorId: string | null = null;
      try { visitorId = localStorage.getItem("world-visitor-participant-id"); } catch { /* ignore */ }
      if (!visitorId) visitorId = randId("visitor");
      const v = await doJoinSquareParticipant(visitorId, name, randId("agent"), agentName);
      squareClientRef.current = custodyClientsRef.current.get(v.participant_id) ?? null;
      try { localStorage.setItem("world-visitor-participant-id", v.participant_id); } catch { /* ignore */ }
      if (joinPresence) {
        await worldApi.presence(v.participant_id, v.token, { status: "available", note: `${name} · local preview` });
      }
      setSquareSession(v);
      setSquareRevoked(false);
      setIntent(joinIntent);
      cue("arrive", `${name} entered the square — arrival chime`);
      effectNote(`${name} entered the square (${joinIntent === "browse" ? "browsing" : joinIntent === "need" ? "posting a need" : "offering work"})`);
      await refresh();
      await refreshSquare();
      // one quiet nudge per session: the delegation is the one act that
      // starts the agent working. Only shown when the backend reports no
      // delegation on record — the console says what it knows.
      if (nudgeForRef.current !== v.participant_id) {
        nudgeForRef.current = v.participant_id;
        try {
          const d = await agentApi.delegation(v.participant_id, v.token);
          if (!d.delegation) {
            setSquareNote("New here? Your agent only works under a delegation — set one in the Owner console. It is the one act that starts your agent working.");
          }
        } catch { /* stay quiet — the console says what it knows */ }
      }
    } catch (e) {
      setSquareNote(`Could not enter: ${String(e)}`);
    } finally {
      setSquareBusy(null);
    }
  }, [joinName, joinAgentName, joinIntent, joinPresence, doJoinSquareParticipant, cue, effectNote, refresh, refreshSquare]);

  const leaveSquare = useCallback(async () => {
    const sq = squareSessionRef.current;
    if (sq) {
      try { await worldApi.presence(sq.participant_id, sq.token, null); } catch { /* best-effort */ }
    }
    setSquareSession(null);
    squareClientRef.current = null;
    try { localStorage.removeItem("world-visitor-participant-id"); } catch { /* ignore */ }
    setSquareRevoked(false);
    setIntent(null);
    setInspectListingId(null);
    setInspectAgreementId(null);
    setInspectVisitorId(null);
    caption("you left the square — presence withdrawn");
    await refresh();
    await refreshSquare();
  }, [caption, refresh, refreshSquare]);

  const setOwnPresence = useCallback(async (on: boolean) => {
    const sq = squareSessionRef.current;
    if (!sq) return;
    try {
      await worldApi.presence(sq.participant_id, sq.token, on ? { status: "available", note: `${sq.displayName} · local preview` } : null);
      cue("ui", on ? "you are visible — soft tap" : "you went invisible — soft tap");
      await refresh();
    } catch (e) {
      setSquareNote(`Presence change failed: ${String(e)}`);
    }
  }, [cue, refresh]);

  const postNeedSquare = useCallback(async () => {
    const sq = squareSessionRef.current;
    if (!sq) return;
    const kind = postForm.kind.trim();
    const title = postForm.title.trim();
    if (!kind || !title) {
      setSquareNote("A need needs a kind and a title — both are required, nothing is guessed.");
      return;
    }
    setSquareBusy("posting");
    try {
      const r = await squareApi.postNeed(sq.participant_id, sq.token, {
        kind,
        title,
        detail: postForm.detail.trim(),
        terms_text: STANDARD_TERMS,
      });
      agentNote(`${sq.displayName} posted a need: “${title}” (${kind}) — listing ${shortId(r.listing_id)}`);
      cue("paper", "need posted — paper");
      setPostForm({ kind: "", title: "", detail: "" });
      await refreshSquare();
    } catch (e) {
      setSquareNote(`Posting failed: ${String(e)}`);
    } finally {
      setSquareBusy(null);
    }
  }, [postForm, agentNote, cue, refreshSquare]);

  const postOfferSquare = useCallback(async () => {
    const sq = squareSessionRef.current;
    const client = squareClientRef.current;
    if (!sq || !client) return;
    const kind = (postForm.kind.trim() || "draft") as OfferKind;
    const title = postForm.title.trim();
    if (!title) {
      setSquareNote("An offer needs a title — nothing is posted without one.");
      return;
    }
    setSquareBusy("posting");
    try {
      // the worker signs the authorization for the task's action
      const r = await client.postOffer({
        kind, title, detail: postForm.detail.trim(), terms: { requires: [] },
      });
      agentNote(`${sq.displayName} offered “${title}” (${kind}) — offer ${shortId(r.offer_id)}`);
      cue("paper", "offer posted — paper");
      setPostForm({ kind: "", title: "", detail: "" });
      await refreshSquare();
    } catch (e) {
      setSquareNote(`Posting failed: ${String(e)}`);
    } finally {
      setSquareBusy(null);
    }
  }, [postForm, agentNote, cue, refreshSquare]);

  /** Approach: a presence note, no commitment. Never a prerequisite. */
  const approachListing = useCallback(async (listing: WorldListing) => {
    const sq = squareSessionRef.current;
    if (!sq) return;
    setSquareBusy(`approach:${listing.listing_id}`);
    try {
      await worldApi.presence(sq.participant_id, sq.token, { status: "available", note: `near: ${listing.title.slice(0, 40)}` });
      caption(`you approached “${listing.title}” — a presence note, no commitment`);
      cue("ui", "approach — soft tap");
      await refresh();
    } catch (e) {
      setSquareNote(`Approach failed: ${String(e)}`);
    } finally {
      setSquareBusy(null);
    }
  }, [caption, cue, refresh]);

  /** Propose: creates the agreement in PROPOSED state. Nothing runs yet.
   *  The proposer's worker signs the authorization for the listing's
   *  task kind. */
  const proposeAgreementSquare = useCallback(async (listing: WorldListing) => {
    const sq = squareSessionRef.current;
    const client = squareClientRef.current;
    if (!sq || !client) return;
    if (listing.from_participant === sq.participant_id) {
      setSquareNote("That is your own listing — you cannot propose to yourself.");
      return;
    }
    setSquareBusy(`propose:${listing.listing_id}`);
    lastOwnActionAtRef.current = Date.now();
    try {
      const r = await client.proposeAgreement(listing.listing_id, listing.kind);
      agentNote(`${sq.displayName} proposed an agreement on “${listing.title}” — ${r.status ?? "proposed"}. ${listing.from_display_name} is notified in-world.`);
      cue("paper", "proposal sent — paper");
      setInspectListingId(null);
      setInspectAgreementId(r.agreement_id);
      await refreshSquare();
    } catch (e) {
      setSquareNote(holdOrError("The proposal", e));
    } finally {
      setSquareBusy(null);
    }
  }, [agentNote, cue, refreshSquare]);

  /** Agree / decline / submit on an agreement. Agree carries the
   *  counterpart's worker-signed authorization for the listing's task
   *  kind; decline and submit are token-authed (submit re-checks the
   *  authority head server-side). */
  const actOnAgreement = useCallback(async (agreementId: string, action: "agree" | "decline" | "submit") => {
    const sq = squareSessionRef.current;
    const client = squareClientRef.current;
    if (!sq || !client) return;
    setSquareBusy(`${action}:${agreementId}`);
    lastOwnActionAtRef.current = Date.now();
    try {
      let r: { status: string };
      if (action === "agree") {
        // resolve the listing's task kind for the authorization's action;
        // without it the client refuses rather than guessing.
        const agr = squareAgreementsRef.current.find((a) => a.agreement_id === agreementId);
        const listing = agr ? boardListingsRef.current.find((l) => l.listing_id === agr.listing_id) : undefined;
        const kind = listing?.kind;
        if (!kind) throw new Error("cannot agree: the listing's task kind is not on record here — nothing is guessed");
        r = await client.agreeAgreement(agreementId, kind);
      } else if (action === "decline") {
        r = await client.declineAgreement(agreementId);
      } else {
        r = await client.submitAgreement(agreementId);
      }
      const verb = action === "agree" ? "agreed to" : action === "decline" ? "declined" : "submitted";
      agentNote(`${sq.displayName} ${verb} the agreement — now ${r.status ?? "unavailable"}.`);
      if (action === "agree") cue("allow", "both sides agreed — warm pluck");
      else if (action === "decline") cue("refuse", "declined — low thud");
      else cue("stamp", "submitted to the receiver — deep stamp");
      await refreshSquare();
    } catch (e) {
      setSquareNote(holdOrError(`The ${action}`, e));
    } finally {
      setSquareBusy(null);
    }
  }, [agentNote, cue, refreshSquare]);

  const withdrawListingSquare = useCallback(async (listing: WorldListing) => {
    const sq = squareSessionRef.current;
    if (!sq) return;
    setSquareBusy(`withdraw:${listing.listing_id}`);
    lastOwnActionAtRef.current = Date.now();
    try {
      await squareApi.withdrawListing(sq.participant_id, sq.token, listing.listing_id);
      agentNote(`${sq.displayName} withdrew “${listing.title}”.`);
      cue("paper", "listing withdrawn — paper");
      setInspectListingId(null);
      await refreshSquare();
    } catch (e) {
      setSquareNote(holdOrError("The withdrawal", e));
    } finally {
      setSquareBusy(null);
    }
  }, [agentNote, cue, refreshSquare]);

  /* Initial square load: board + agreements + receipts. Declared after the
   * square callbacks it uses. */
  useEffect(() => {
    void refreshSquare();
  }, [refreshSquare]);

  /* The square polls: presence, listings, agreements — real state, never
   * predicted. The owner console's delegation + escalations refresh on the
   * same tick (pollTick), so worker-driven changes appear when the backend
   * reports them. 3s keeps the kiosk performance's verdict beat tight. */
  useEffect(() => {
    if (backendOk === false) return;
    const id = window.setInterval(() => {
      setPollTick((t) => t + 1);
      if (mode !== "square") return;
      void refreshSquare();
      void refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [mode, backendOk, refreshSquare, refresh]);

  /* ---------- guided beats ---------- */

  /** Open the receipt inspector: the full receipt record when this session
   *  holds it (own private receipts, or a shared receipt's embedded
   *  record); otherwise the id with an honest "not readable here". */
  const openReceiptById = useCallback((receiptId: string, role?: string | null, record?: WorldReceipt | null) => {
    const pool: WorldReceipt[] = mode === "square"
      ? squareReceipts
      : [...(ownReceipts.amara ?? []), ...(ownReceipts.theo ?? [])];
    const rec = record ?? pool.find((r) => r.receipt_id === receiptId) ?? null;
    cue("paper", "receipt opened — paper");
    setOpenReceipt({ record: rec, receiptId, role: role ?? null });
  }, [mode, squareReceipts, ownReceipts, cue]);

  const setBeat = useCallback((id: string, status: BeatStatus, noteText = "") => {
    setBeatState((p) => ({ ...p, [id]: { status, note: noteText } }));
  }, []);

  const runBeat = useCallback(async (beat: Beat) => {
    setBusy(beat.id);
    setBeat(beat.id, "active");
    try {
      switch (beat.id) {
        case "join":
          await joinActor("amara");
          await joinActor("theo");
          setBeat(beat.id, "done", "Amara and Theo both joined, each with a fresh keypair and signed nonce.");
          break;
        case "presence":
          await setPresence("amara", true);
          await setPresence("theo", true);
          setBeat(beat.id, "done", "Both opted in. Presence is never on by default.");
          break;
        case "permitted": {
          const d = await propose("amara", "notes.write");
          setBeat(beat.id, "done", `Receiver said ${d.decision ?? "unavailable"}.`);
          break;
        }
        case "out-of-scope": {
          const d = await propose("amara", "send-email");
          setBeat(beat.id, "done", `Receiver said ${d.decision ?? "unavailable"}.`);
          break;
        }
        case "revoke":
          await revoke("amara");
          setBeat(beat.id, "done", "Wren’s mandate revoked. Theo and Juniper were not touched.");
          break;
        case "refused-after": {
          const d = await propose("amara", "notes.write");
          setBeat(beat.id, "done", `After revocation the receiver said ${d.decision ?? "unavailable"} — a real backend STOPPED, not an animation.`);
          break;
        }
        case "own-mandate": {
          await refresh();
          const t = getSession("theo");
          const a = sessionsRef.current.amara;
          setBeat(beat.id, "done",
            `Juniper’s authority: ${ACTOR_DEF.theo.agent} via Theo’s own join (agent ${shortId(t.agent_id)}, standing ${t.standing ?? "unavailable"}). Amara’s standing: ${a ? (a.revoked ? "revoked" : a.standing) : "not joined"}. Nothing inherited.`);
          break;
        }
        case "offer":
          await makeOffer("amara", { kind: "summarize", title: "Summarize the workbench notes", detail: "Two or three sentences, plain words." });
          setBeat(beat.id, "done", "The offer sits in the shared space with its terms. Nothing runs until Theo accepts.");
          break;
        case "accept": {
          await refresh();
          const theoPid = sessionsRef.current.theo?.participant_id;
          const target = (world?.offers ?? []).filter((o) => o.status === "open" && o.from_participant !== theoPid).slice(-1)[0];
          if (!target) throw new Error("no open offer in the shared space to accept");
          const d = await acceptOffer("theo", target.offer_id);
          setBeat(beat.id, "done", `Theo accepted. Receiver said ${d.decision ?? "unavailable"}${d.transaction_id ? ` (exchange ${shortId(d.transaction_id)})` : ""}; receipt ${shortId(d.receipt_id)} is private to Theo.`);
          openParcel(target.offer_id); // the signature reveal: the parcel opens on a real transaction
          break;
        }
        case "work": {
          const d = await propose("theo", "notes.read");
          effectNote(`Juniper completed “notes.read” under Theo’s mandate — receipt private to Theo unless Theo shares it.`);
          setBeat(beat.id, "done", `Receiver said ${d.decision ?? "unavailable"}.`);
          break;
        }
        case "done":
          setBeat(beat.id, "done", "Guided path complete. The world is yours now — presence, offers, revocation, receipts.");
          break;
        default:
          throw new Error(`unknown beat ${beat.id}`);
      }
    } catch (e) {
      setBeat(beat.id, "failed", String(e));
    } finally {
      setBusy(null);
    }
  }, [joinActor, setPresence, propose, revoke, makeOffer, acceptOffer, refresh, getSession, effectNote, setBeat, world, openParcel]);

  const nextBeat = BEATS.find((b) => (beatState[b.id]?.status ?? "idle") === "idle");

  /* ---------- derived ---------- */

  const participantsById = useMemo(() => {
    const m = new Map<string, WorldState["participants"][number]>();
    (world?.participants ?? []).forEach((p) => m.set(p.participant_id, p));
    return m;
  }, [world]);

  /** Agreements with display names and listing titles resolved from real
   *  backend state — the backend stores ids, not labels. */
  const enrichedAgreements = useMemo(() => {
    const titleById = new Map(boardListings.map((l) => [l.listing_id, l.title]));
    return squareAgreements.map((a) => ({
      ...a,
      listing_title: titleById.get(a.listing_id) ?? a.listing_title ?? null,
      counterpart_display:
        a.counterpart_display ??
        participantsById.get(a.counterpart)?.display_name ??
        null,
    }));
  }, [squareAgreements, boardListings, participantsById]);

  /* Last REAL receiver decision per agent — drives the characters' reactions.
   * The nonce retriggers the animation exactly once per confirmed decision. */
  const lastOutcomeByActor = useMemo(() => {
    const m = new Map<Actor, { decision: string; nonce: number }>();
    decisions.forEach((d, i) => m.set(d.actor, { decision: d.decision, nonce: i }));
    return m;
  }, [decisions]);

  const newestOfferId = (world?.offers ?? []).slice(-1)[0]?.offer_id ?? null;

  const hosts: HostState[] = (["amara", "theo"] as Actor[]).map((actor) => {
    const def = ACTOR_DEF[actor];
    const s = sessions[actor];
    const wp = s ? participantsById.get(s.participant_id) : undefined;
    // the guided tour is scripted playback — local ground truth, not a guess
    const am = participantMode(wp, { tourActor: true });
    return {
      agentId: def.agentId as "wren" | "juniper",
      displayName: def.agent,
      ownerName: def.owner,
      joined: !!s,
      revoked: !!s?.revoked,
      presence: wp?.presence ?? null,
      outcome: lastOutcomeByActor.get(actor) ?? null,
      offerPulse: newestOfferId,
      waiting: waitingActor === actor,
      activityMode: am,
      modeLabel: modeLabelFor(am, false),
      escalationCount: wp?.pending_escalations ?? 0,
    };
  });

  /* Transport for the scene: honest, never invented. */
  const sceneTransport: TransportStatus | null =
    backendOk === false ? "disconnected"
    : backendOk === null ? null
    : world?.transport?.status === "connected" ? "connected"
    : world?.transport?.status === "pending" ? "pending"
    : world?.transport?.status === "disconnected" ? "disconnected"
    : "unreported";

  const latestDecision = decisions.length > 0 ? decisions[decisions.length - 1] : null;
  const actingDef = ACTOR_DEF[acting];
  const actingSession = sessions[acting];

  /* Claim-graph desk summaries: aggregate the backend's per-claim
   * classifications into one medallion status per report. The shapes in the
   * scene are anchored here: quarantine>0 → "reconsider" (triangle),
   * affected_unresolved>0 → "review" (diamond), else "unchanged" (disc).
   * Nothing is assessed before an event: null standings mean "unchanged". */
  const claimSummaries: ClaimDeskSummary[] = useMemo(() => {
    return (claimGraph?.reports ?? []).map((r) => {
      const counts: Record<string, number> = {};
      for (const c of r.claims) {
        const k = c.standing?.classification ?? "UNCHANGED";
        counts[k] = (counts[k] ?? 0) + 1;
      }
      const q = counts["QUARANTINE"] ?? 0;
      const u = counts["AFFECTED_UNRESOLVED"] ?? 0;
      const status = q > 0 ? "reconsider" : u > 0 ? "review" : "unchanged";
      const bits: string[] = [];
      if (q > 0) bits.push(`${q} need${q === 1 ? "s" : ""} reconsideration`);
      if (u > 0) bits.push(`${u} under review`);
      if (bits.length === 0) bits.push(claimGraph?.events?.length ? "no claims affected" : "not yet assessed");
      return {
        report_id: r.report_id,
        title: r.title,
        placement: r.placement,
        status,
        detail: bits.join(" · "),
      };
    });
  }, [claimGraph]);

  /* Newsroom desk summary: the report's medallion status (same aggregation
   * as the claim-graph desk — the standings come from the same engine)
   * plus the pending-review count that drives the "awaiting review" marker.
   * The marker is deliberately NOT a standing medallion: shape, label, and
   * motion all differ — new evidence awaiting review is not a verified
   * change in evidence standing. */
  const newsroomSummary: NewsroomDeskSummary | null = useMemo(() => {
    const r = newsroom?.report;
    if (!r) return null;
    const counts: Record<string, number> = {};
    for (const c of r.claims) {
      const k = c.standing?.classification ?? "UNCHANGED";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const q = counts["QUARANTINE"] ?? 0;
    const u = counts["AFFECTED_UNRESOLVED"] ?? 0;
    const status = q > 0 ? "reconsider" : u > 0 ? "review" : "unchanged";
    const bits: string[] = [];
    if (q > 0) bits.push(`${q} need${q === 1 ? "s" : ""} reconsideration`);
    if (u > 0) bits.push(`${u} under review`);
    if (bits.length === 0) bits.push(newsroom?.events?.length ? "no claims affected" : "not yet assessed");
    return {
      report_id: r.report_id,
      title: r.title,
      placement: r.placement,
      status,
      detail: bits.join(" · "),
      pendingReview: newsroom?.pending_review ?? 0,
      dispatchCount: newsroom?.dispatches?.length ?? 0,
    };
  }, [newsroom]);

  /** The claim-graph demo control: an AUTHORIZED action. The acting
   *  participant's own gate evaluates "claimgraph.correct" through the real
   *  gate; only an ALLOWED verdict appends the event, and the impact report
   *  comes back from the backend — the frontend never computes standings. */
  /** Claim-graph correction: the acting participant's worker signs the
   *  presentation; the receiver decides. Square mode passes its client. */
  const postClaimEvent = useCallback(async (status: "CORRECTED" | "WITHDRAWN", as?: CustodyClient) => {
    const client = as ?? custodyClientsRef.current.get(acting);
    if (!client) { agentNote("claim-graph demo control: no custody client — join first."); return; }
    setClaimBusy(status);
    setClaimVerdict(null);
    try {
      const r = await client.correctClaim(status);
      setClaimVerdict(r);
      if (r.decision === "ALLOWED") {
        sound.unlock();
        sound.stamp();
        caption(`sound · a ${status === "CORRECTED" ? "correction" : "withdrawal"} was recorded for the harbor log — deep stamp`);
        await refresh();
        if (r.replayed) caption("the event was already on record — the backend returned the existing entry");
        // the desk reflects the backend's computed impact, read back fresh
        try {
          const g = await worldApi.claimgraph();
          const report = g.reports.find((x) => x.report_id === "report-harbor-traffic");
          const changed = report?.claims.filter((c) => c.standing && c.standing.classification !== "UNAFFECTED").length ?? 0;
          if (changed > 0) agentNote(`harbor log ${status}: ${changed} claim(s) now carry a standing from the backend impact report`);
        } catch {
          /* desk will update on the next refresh */
        }
      } else {
        sound.unlock();
        sound.refuse();
        caption("sound · the receiver refused the correction request");
        agentNote(`claim-graph demo control: receiver STOPPED — ${r.reason_codes.join(", ") || "no reason codes"}`);
      }
    } catch (e) {
      agentNote(`claim-graph demo control failed: ${String(e)}`);
    } finally {
      setClaimBusy(null);
    }
  }, [acting, refresh, caption, agentNote]);

  /* ---------- newsroom: the small desk ---------- */

  /** The manual import: the fixture article is imported as a dispatch
   *  through the acting participant's own gate ("newsroom.review"). The
   *  article bytes are display-only untrusted data; re-importing replays
   *  the same dispatch instead of duplicating it. */
  const importFixtureDispatch = useCallback(async (as?: CustodyClient) => {
    const client = as ?? custodyClientsRef.current.get(acting);
    if (!client) { agentNote("newsroom import failed: no custody client — join first."); return; }
    const article: NewsroomArticle | undefined = newsroom?.fixture_article;
    if (!article) { agentNote("newsroom import failed: no fixture article on record"); return; }
    setNrBusy("import");
    setNrVerdict(null);
    try {
      const r = await client.importDispatch(article);
      setNrVerdict(r);
      if (r.decision === "ALLOWED") {
        sound.unlock();
        sound.paper();
        caption(r.replayed
          ? "the dispatch was already on record — the backend returned the existing one"
          : "a dispatch arrived at the small desk — paper");
        await refresh();
      } else {
        sound.unlock();
        sound.refuse();
        caption("sound · the receiver refused the dispatch import");
        agentNote(`newsroom import: receiver STOPPED — ${r.reason_codes.join(", ") || "no reason codes"}`);
      }
    } catch (e) {
      agentNote(`newsroom import failed: ${String(e)}`);
    } finally {
      setNrBusy(null);
    }
  }, [acting, newsroom, refresh, caption, agentNote]);

  /** Review a proposed connection: accept or decline. Declining changes
   *  nothing. Accepting admits evidence only through the real impact
   *  engine — the frontend never decides a standing. */
  const reviewProposal = useCallback(async (proposalId: string, decision: "accept" | "decline", as?: CustodyClient) => {
    const client = as ?? custodyClientsRef.current.get(acting);
    if (!client) { agentNote("newsroom review failed: no custody client — join first."); return; }
    setNrBusy(`${decision}:${proposalId}`);
    setNrVerdict(null);
    try {
      const r = await client.reviewProposal(proposalId, decision);
      setNrVerdict(r as NewsroomReviewResult);
      if (r.decision === "ALLOWED") {
        sound.unlock();
        if (decision === "accept") sound.stamp(); else sound.ui();
        caption(decision === "accept"
          ? "sound · the review admitted new evidence — deep stamp"
          : "sound · the proposal was declined — nothing changed");
        await refresh();
        try {
          const n = await worldApi.newsroom();
          const changed = n.report.claims.filter((c) => c.standing && c.standing.classification !== "UNAFFECTED").length ?? 0;
          if (decision === "accept" && changed > 0) agentNote(`newsroom review: ${changed} claim(s) now carry a standing from the backend impact report`);
        } catch {
          /* desk will update on the next refresh */
        }
      } else {
        sound.unlock();
        sound.refuse();
        caption("sound · the receiver refused the review");
        agentNote(`newsroom review: receiver STOPPED — ${r.reason_codes.join(", ") || "no reason codes"}`);
      }
    } catch (e) {
      agentNote(`newsroom review failed: ${String(e)}`);
    } finally {
      setNrBusy(null);
    }
  }, [acting, refresh, caption, agentNote]);

  /** Submit a research package: the producer hands bytes to the receiver,
   *  which pins them, runs the frozen K1-K7 criteria on the pinned bytes
   *  in an isolated study process, and records the acceptance signed by
   *  its own gate key. Returns the verdict for the desk to render. */
  const submitPackage = useCallback(async (pkg: ResearchPackage, sha: string, as?: CustodyClient): Promise<NewsroomSubmitPackageResult | null> => {
    const client = as ?? custodyClientsRef.current.get(acting);
    if (!client) { agentNote("package submission failed: no custody client — join first."); return null; }
    try {
      const r = await client.submitPackage({ package: pkg, package_sha256: sha }) as NewsroomSubmitPackageResult;
      if (r.decision === "ALLOWED") {
        sound.unlock();
        sound.stamp();
        caption(r.replayed
          ? "sound · the package was already on record — the receiver returned the existing dispatch"
          : "sound · the receiver admitted a research package — deep stamp");
        await refresh();
      } else {
        sound.unlock();
        sound.refuse();
        caption("sound · the receiver refused the package");
        agentNote(`package submission: receiver STOPPED — ${r.reason_codes.join(", ") || "no reason codes"}`);
        await refresh();
      }
      return r;
    } catch (e) {
      agentNote(`package submission failed: ${String(e)}`);
      return null;
    }
  }, [acting, refresh, caption, agentNote]);

  /* Transport honesty: the backend reports transport.status; we render exactly
   * that, and "disconnected" when the backend is unreachable — never a
   * green dot that lies. If the field is absent, we say so, not "connected". */
  const transport: { text: string; cls: string; title: string } = (() => {
    if (backendOk === false) return { text: "transport: disconnected — backend unreachable", cls: "bad", title: "Transport status, reported honestly" };
    if (backendOk === null) return { text: "transport: checking…", cls: "", title: "Transport status, reported honestly" };
    const t = world?.transport;
    /* the chrome shows the compact form only; the backend's full detail
     * lives in the tooltip, so the slim status bar stays slim at phone size */
    if (t?.status === "connected") return { text: `transport: connected${t.mode ? ` · ${t.mode}` : ""}`, cls: "ok", title: t.detail ? `Transport: connected · ${t.mode} — ${t.detail}` : "Transport status, reported honestly" };
    if (t?.status === "pending") return { text: "transport: pending", cls: "warn", title: t.detail ? `Transport: pending — ${t.detail}` : "Transport status, reported honestly" };
    if (t?.status === "disconnected") return { text: "transport: disconnected", cls: "bad", title: t.detail ? `Transport: disconnected — ${t.detail}` : "Transport status, reported honestly" };
    if (t?.status) return { text: `transport: ${t.status}`, cls: "", title: "Transport status, reported honestly" };
    return { text: "transport: not reported by this backend build", cls: "", title: "Transport status, reported honestly" };
  })();

  /* Presence honesty: "here" only when presence was explicitly set;
   * "not here" when there is no presence on record; "pending" when not joined. */
  const presenceOf = (actor: Actor): "pending" | "here" | "not here" => {
    const s = sessions[actor];
    if (!s) return "pending";
    const wp = participantsById.get(s.participant_id);
    if (!wp) return "pending";
    return wp.presence ? "here" : "not here";
  };

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    caption(next ? "sound off — cues will be captioned only" : "sound on");
  }, [muted, caption]);

  const toggleReducedMotion = useCallback(() => {
    const next = !reducedMotion;
    setReducedMotion(next);
    try { localStorage.setItem("world-reduced-motion", next ? "1" : "0"); } catch { /* ignore */ }
  }, [reducedMotion]);

  /* ---------- the square: derived ---------- */

  const squareSelfId = squareSession?.participant_id ?? null;

  /** Wren and Juniper stand as HOSTS — visibly badged, their role legible
   *  from the square itself. The backend stores every participant as
   *  kind "real", so hosts are identified by agent id (the ids this square
   *  joins them under). Backends that seed hosts are honored: a host
   *  already present is never rejoined. */
  const squareHosts: HostState[] = (["wren", "juniper"] as const).map((aid) => {
    const sess = hostSessions[aid];
    const wp = (sess && participantsById.get(sess.participant_id))
      ?? world?.participants.find((p) => p.agent.id === aid);
    // hosts carry the backend's verbatim mode when it reports one ("manual"
    // is the join default); a non-self "manual" badges as "MANUAL —
    // human-driven" so the badge never claims a host is you.
    const am = participantMode(wp, {});
    return {
      agentId: aid,
      displayName: aid === "wren" ? "Wren" : "Juniper",
      ownerName: "the square",
      joined: !!sess || !!wp,
      revoked: false,
      presence: wp?.presence ?? null,
      outcome: null,
      offerPulse: null,
      waiting: false,
      role: "host",
      home: aid === "wren" ? [-2.6, 0, 3.0] : [2.6, 0, 3.0],
      participantId: sess?.participant_id ?? wp?.participant_id ?? null,
      activityMode: am,
      modeLabel: modeLabelFor(am, false),
      escalationCount: wp?.pending_escalations ?? 0,
    };
  });

  /** Every connected participant who is not a host reads as a visitor —
   *  hosts and visitors are visually distinct in the scene. */
  const squareVisitors: VisitorState[] = useMemo(() => {
    const hostPids = new Set<string>();
    (["wren", "juniper"] as const).forEach((aid) => {
      const s = hostSessions[aid];
      if (s) hostPids.add(s.participant_id);
    });
    return (world?.participants ?? [])
      .filter((p) => !hostPids.has(p.participant_id))
      .filter((p) => p.agent.id !== "wren" && p.agent.id !== "juniper" && p.kind !== "host")
      .map((p) => {
        const isSelf = p.participant_id === squareSelfId;
        // the visitor's own figure moves by their own taps — "YOU — manual";
        // anyone else's mode comes from the backend, or stays unbadged.
        // A backend-reported "manual" on someone else's figure badges as
        // "MANUAL — human-driven", never "YOU".
        const am = participantMode(p, { isSelf });
        return {
          participant_id: p.participant_id,
          displayName: p.display_name,
          agentName: p.agent.display_name,
          presence: p.presence,
          isSelf,
          isHost: false,
          activityMode: am,
          modeLabel: modeLabelFor(am, isSelf),
          escalationCount: p.pending_escalations ?? 0,
          workerState: p.worker_state ?? null,
        };
      });
  }, [world, hostSessions, squareSelfId]);

  /** Quiet world: no agent has authorized work. True when no participant
   *  carries an active, unpaused automation delegation. Until Track A
   *  lands, the backend reports no delegations — the world is quiet, and
   *  the UI says so instead of manufacturing busy-ness. */
  const quietWorld = useMemo(() => {
    const ps = world?.participants ?? [];
    return !ps.some((p) => {
      const auto = (p.activity_mode ?? null) === "automation";
      const paused = p.paused ?? p.delegation?.paused ?? false;
      return auto && !paused;
    });
  }, [world]);

  /* ---------- owner console: the owner's own agent, both modes ---------- */

  /** Revoke through the console: the existing control, verbatim. Tour mode
   *  revokes the acting actor; square mode revokes the visitor's own agent. */
  /** Revoke through the console: the OWNER signs the revocation in the
   *  local wallet and pushes the new bundle to the receiver. Explicit
   *  owner gesture; permanent within the session. Tour mode revokes the
   *  acting actor; square mode revokes the visitor's own agent. */
  const consoleRevoke = useCallback(async () => {
    if (mode === "square") {
      const sq = squareSessionRef.current;
      const client = squareClientRef.current;
      if (!sq || !client) throw new Error("you are not in the square");
      const r = await client.revokeWorker();
      setSquareRevoked(true);
      cue("stamp", `${sq.agentName} revoked — deep stamp`);
      effectNote(`${sq.displayName} revoked ${sq.agentName}’s mandate (id ${shortId(r.mandate_id)})`);
      await refresh();
    } else {
      await revoke(acting);
    }
  }, [mode, revoke, acting, cue, effectNote, refresh]);

  /* ---------- selection-view controls: the owner-console actions, inside
   *  the worker's own panel. Same endpoints, same credentials as the
   *  owner console — pause flips the session pause switch, revoke ends the
   *  mandate. Nothing new on the backend. */
  const selPauseSelf = useCallback(async (paused: boolean) => {
    const sq = squareSessionRef.current;
    if (!sq) return;
    setSquareBusy("sel-pause");
    try {
      await agentApi.pause(sq.participant_id, sq.token, paused);
      cue("ui", paused ? "agent paused — soft tap" : "agent resumed — soft tap");
      agentNote(paused ? `${sq.agentName} paused from the selection view.` : `${sq.agentName} resumed from the selection view.`);
      await refresh();
    } catch (e) {
      setSquareNote(`Pause failed: ${String(e)}`);
    } finally {
      setSquareBusy(null);
    }
  }, [cue, agentNote, refresh]);

  /** Revoke from the selection view: the owner-console's existing revoke
   *  control, verbatim, then close the panel. */
  const selRevokeSelf = useCallback(async () => {
    await consoleRevoke();
    setInspectVisitorId(null);
  }, [consoleRevoke]);

  const consoleCreds = mode === "square"
    ? (squareSession ? { participant_id: squareSession.participant_id, token: squareSession.token } : null)
    : (sessions[acting] ? { participant_id: sessions[acting]!.participant_id, token: sessions[acting]!.token } : null);
  const consoleOwnerName = mode === "square" ? (squareSession?.displayName ?? "you") : ACTOR_DEF[acting].owner;
  const consoleAgentName = mode === "square" ? (squareSession?.agentName ?? "your agent") : ACTOR_DEF[acting].agent;
  const consoleRevoked = mode === "square" ? squareRevoked : !!sessions[acting]?.revoked;
  /** the console owner's participant row: pause switch + worker state come
   *  from world state, not from the delegation summary. */
  const consoleParticipant = mode === "square"
    ? (squareSession ? participantsById.get(squareSession.participant_id) : undefined)
    : (sessions[acting] ? participantsById.get(sessions[acting]!.participant_id) : undefined);
  const consoleNote = useCallback((t: string) => {
    agentNote(t);
  }, [agentNote]);

  const filteredBoard = useMemo(() => {
    let ls = boardListings;
    const side = filters.side && filters.side !== "all" ? filters.side : null;
    if (side) ls = ls.filter((l) => l.side === side);
    if (filters.kind) ls = ls.filter((l) => l.kind === filters.kind);
    if (filters.hide_samples) ls = ls.filter((l) => !l.is_sample && l.from_kind !== "seeded");
    return ls;
  }, [boardListings, filters]);

  const observedKinds = useMemo(
    () => [...new Set(boardListings.map((l) => l.kind))].filter(Boolean).sort(),
    [boardListings]
  );

  /** Kind options: what the board actually shows. The backend publishes
   *  no allowlist in this build — kinds are observed from listings,
   *  labeled as such, never as authoritative. */
  const kindOptions = observedKinds;
  const kindNote = observedKinds.length > 0
    ? "observed on the board — the backend publishes no allowlist"
    : "no kinds observed yet — the backend publishes no allowlist";

  const myOpenListings = useMemo(
    () => squareSelfId ? boardListings.filter((l) => l.from_participant === squareSelfId && l.status === "open") : [],
    [boardListings, squareSelfId]
  );

  const inspectListing = inspectListingId ? boardListings.find((l) => l.listing_id === inspectListingId) ?? null : null;
  const inspectAgreement = inspectAgreementId ? enrichedAgreements.find((a) => a.agreement_id === inspectAgreementId) ?? null : null;
  const inspectVisitor = inspectVisitorId ? (world?.participants ?? []).find((p) => p.participant_id === inspectVisitorId) ?? null : null;
  const visitorListings = inspectVisitor ? boardListings.filter((l) => l.from_participant === inspectVisitor.participant_id && l.status === "open") : [];

  /* Quiet worker-action attention: when an agreement the owner is party to
   * moves while they look elsewhere, the owner gets one quiet notice (a
   * toast + the console FAB flag) — never a stack, never a guess about
   * who acted. The owner's own recent taps are excluded (the lanes cover
   * those); historical state on join initializes silently. */
  useEffect(() => {
    const selfId = squareSelfId;
    if (!selfId) return;
    if (seenInitForRef.current !== selfId) {
      const m = new Map<string, string>();
      enrichedAgreements.forEach((a) => {
        if (a.proposer === selfId || a.counterpart === selfId) m.set(a.agreement_id, (a.status || "").toLowerCase());
      });
      seenOwnAgreementsRef.current = m;
      seenInitForRef.current = selfId;
      return;
    }
    const seen = seenOwnAgreementsRef.current;
    const ownRecent = Date.now() - lastOwnActionAtRef.current < 8000;
    for (const a of enrichedAgreements) {
      if (a.proposer !== selfId && a.counterpart !== selfId) continue;
      const st = (a.status || "").toLowerCase();
      const prev = seen.get(a.agreement_id);
      seen.set(a.agreement_id, st);
      if (prev !== st && !ownRecent) {
        const title = a.listing_title ?? "an agreement";
        const msg = prev === undefined
          ? `New agreement on “${title}” — ${agreementStageWord(a.status)}.`
          : `“${title}” is now ${agreementStageWord(a.status)}.`;
        setWorkerNotice(msg);
        setSquareNote(`${msg} The owner console holds the record.`);
      }
    }
  }, [enrichedAgreements, squareSelfId]);

  /* Opening the owner console clears the quiet worker-action flag — the
   * record is in front of the owner now. */
  useEffect(() => {
    if (consoleOpen) setWorkerNotice(null);
  }, [consoleOpen]);

  const pollText = lastPoll === null ? "never" : `${Math.max(0, Math.round((Date.now() - lastPoll) / 1000))}s ago`;

  /* ---------- render ---------- */

  /* the square's own mode, for the slim status bar — never guessed:
   * absent until the visitor joins and the backend reports it */
  const selfParticipant = squareSession ? participantsById.get(squareSession.participant_id) : undefined;
  const selfMode = selfParticipant ? participantMode(selfParticipant, { isSelf: true }) : null;

  return (
    <div className={`world${reducedMotion ? " reduced-motion" : ""}`}>
      {/* the receipt inspector: the full receipt record, both modes */}
      {openReceipt && (
        <ReceiptInspect
          record={openReceipt.record}
          receiptId={openReceipt.receiptId}
          role={openReceipt.role}
          onClose={() => setOpenReceipt(null)}
        />
      )}
      {/* the research inspector: one bounded external-agent run, both modes */}
      {researchOpen && (
        <ResearchInspector
          onClose={() => setResearchOpen(false)}
          events={world?.events ?? []}
        />
      )}
      {/* the commission inspector: frozen terms, recorded costs, settlement */}
      {commissionOpen && (
        <CommissionInspector
          onClose={() => setCommissionOpen(false)}
          commissions={world?.commissions ?? []}
          participants={world?.participants ?? []}
        />
      )}

      {mode === "square" ? (
        /* the clean default scene: ONE compact status indicator (the
         * visitor's own mode badge + transport status) and the Panels
         * button. Nothing else. */
        <header className="world-top world-top-clean">
          <div className="world-status" aria-label="World status">
            {selfMode ? <ModeBadge mode={selfMode} /> : null}
            <span className={`world-backend ${transport.cls}`} title={transport.title}>
              {transport.text}
            </span>
            {/* compact activity area: one line in the status bar, full
             * note on tap. Nothing floats over the scene. */}
            {squareNote && (
              <SquareActivityNote note={squareNote} onDismiss={() => setSquareNote(null)} />
            )}
          </div>
          <div className="world-tools">
            <button
              onClick={() => setSquareListView((v) => !v)}
              aria-pressed={squareListView}
              title="The town as a plain list — the same records, no 3D"
            >
              {squareListView ? "3D" : "List"}
            </button>
            <button onClick={() => setPanelsOpen(true)}>Panels</button>
          </div>
        </header>
      ) : (
        <header className="world-top">
          <div className="world-title">
            <h1>Shared World</h1>
            <p className="world-dest">A shared world. Your agent. Your boundaries.</p>
            <p className="world-local">
              local preview: Amara and Theo are both you — each brings their own agent under their own authority
            </p>
          </div>
          <div className="world-tools">
            <span className={`world-backend ${transport.cls}`} title={transport.title}>
              {transport.text}
            </span>
            <button onClick={toggleMute} aria-pressed={muted}>{muted ? "Unmute" : "Mute"}</button>
            <button onClick={toggleReducedMotion} aria-pressed={reducedMotion}>{reducedMotion ? "Motion: reduced" : "Motion: full"}</button>
            <button onClick={() => setQuality((q) => (q === "high" ? "low" : "high"))} aria-pressed={quality === "high"} title="Render quality: shadows and pixel ratio">
              {quality === "high" ? "Quality: high" : "Quality: low"}
            </button>
            <button onClick={onExit}>Back</button>
          </div>
        </header>
      )}

      {backendOk === false && (
        <div className="world-err" role="alert">
          The shared-world backend is not reachable ({backendErr ?? "unknown error"}).
          Nothing here is fabricated — join the world once the backend is running.
        </div>
      )}

      {/* Local-preview disclosure — tour mode keeps it inline; the square's
       *  clean scene moves it into the Panels drawer. */}
      {mode === "tour" && (
        <section className="world-disclosure" aria-label="Local preview disclosure">
          <span className="world-placerules-tag">Local preview</span>
          <span>
            This square runs in one process on this machine. It holds every participant's keys here —
            not independent custody, not public multiplayer. Every displayed state is real backend state.
          </span>
        </section>
      )}

      {/* Owner console — fixed overlay, reachable without walking, both modes. */}
      <OwnerConsole
        open={consoleOpen}
        onOpen={() => setConsoleOpen(true)}
        onClose={() => setConsoleOpen(false)}
        creds={consoleCreds}
        ownerName={consoleOwnerName}
        agentName={consoleAgentName}
        revoked={consoleRevoked}
        onRevoke={consoleRevoke}
        pollTick={pollTick}
        paused={consoleParticipant?.paused ?? null}
        workerState={consoleParticipant?.worker_state ?? null}
        workerNotice={workerNotice}
        cue={cue}
        note={consoleNote}
      />

      {mode === "square" ? (
        <SquareMode
          world={world}
          quality={quality}
          backendOk={backendOk}
          squareSession={squareSession}
          squareClient={squareClientRef.current}
          hostSessions={hostSessions}
          squareHosts={squareHosts}
          squareVisitors={squareVisitors}
          participantsById={participantsById}
          reducedMotion={reducedMotion}
          transportStatus={sceneTransport}
          quietWorld={quietWorld}
          onSelectAgent={(id) => {
            const h = squareHosts.find((x) => x.agentId === id);
            cue("ui", "host — soft tap");
            setSquareNote(h ? `${h.displayName} is hosting the square — the hosts panel says who's here.` : "A host — the hosts panel says who's here.");
          }}
          joinName={joinName}
          setJoinName={setJoinName}
          joinAgentName={joinAgentName}
          setJoinAgentName={setJoinAgentName}
          joinIntent={joinIntent}
          setJoinIntent={setJoinIntent}
          joinPresence={joinPresence}
          setJoinPresence={setJoinPresence}
          intent={intent}
          setIntent={setIntent}
          boardListings={boardListings}
          filteredBoard={filteredBoard}
          boardSource={boardSource}
          boardError={boardError}
          filters={filters}
          setFilters={setFilters}
          kindOptions={kindOptions}
          kindNote={kindNote}
          squareAgreements={enrichedAgreements}
          agreementsError={agreementsError}
          suggestionList={suggestionList}
          suggestError={suggestError}
          myOpenListings={myOpenListings}
          setInspectListingId={setInspectListingId}
          inspectListing={inspectListing}
          inspectAgreement={inspectAgreement}
          setInspectAgreementId={setInspectAgreementId}
          inspectVisitor={inspectVisitor}
          setInspectVisitorId={setInspectVisitorId}
          visitorListings={visitorListings}
          worldEvents={world?.events ?? []}
          onSelPause={selPauseSelf}
          onSelRevoke={selRevokeSelf}
          onOpenReceipt={openReceiptById}
          squareReceipts={squareReceipts}
          listView={squareListView}
          postForm={postForm}
          setPostForm={setPostForm}
          squareBusy={squareBusy}
          squareNote={squareNote}
          setSquareNote={setSquareNote}
          pollText={pollText}
          openClaimReportId={openClaimReportId}
          setOpenClaimReportId={setOpenClaimReportId}
          claimGraph={claimGraph}
          claimSummaries={claimSummaries}
          claimView={claimView}
          setClaimView={setClaimView}
          claimVerdict={claimVerdict}
          setClaimVerdict={setClaimVerdict}
          openNewsroom={openNewsroom}
          setOpenNewsroom={setOpenNewsroom}
          newsroom={newsroom}
          newsroomSummary={newsroomSummary}
          openDispatchId={openDispatchId}
          setOpenDispatchId={setOpenDispatchId}
          nrBusy={nrBusy}
          nrVerdict={nrVerdict}
          setNrVerdict={setNrVerdict}
          claimBusy={claimBusy}
          decisions={decisions}
          agentNotes={agentNotes}
          effects={effects}
          captions={captions}
          cue={cue}
          enterSquare={enterSquare}
          leaveSquare={leaveSquare}
          setOwnPresence={setOwnPresence}
          postNeedSquare={postNeedSquare}
          postOfferSquare={postOfferSquare}
          approachListing={approachListing}
          proposeAgreementSquare={proposeAgreementSquare}
          actOnAgreement={actOnAgreement}
          withdrawListingSquare={withdrawListingSquare}
          postClaimEvent={postClaimEvent}
          importFixtureDispatch={importFixtureDispatch}
          reviewProposal={reviewProposal}
          submitPackage={submitPackage}
          onStartTour={() => { sound.unlock(); sound.paper(); setMode("tour"); }}
          panelsOpen={panelsOpen}
          onClosePanels={() => setPanelsOpen(false)}
          onOpenResearch={() => { setPanelsOpen(false); setResearchOpen(true); }}
          onOpenCommission={() => { setPanelsOpen(false); setCommissionOpen(true); }}
          muted={muted}
          onToggleMute={toggleMute}
          onToggleReducedMotion={toggleReducedMotion}
          onToggleQuality={() => setQuality((q) => (q === "high" ? "low" : "high"))}
          onExit={onExit}
          inspectVisitorId={inspectVisitorId}
        />
      ) : (
      <>
      {/* guided tour entry — the old beats, kept verbatim as a tour */}
      <section className="world-tourbar" aria-label="Guided tour">
        <button className="world-linkbtn" onClick={() => { sound.unlock(); sound.ui(); setMode("square"); }}>
          ← Back to the square
        </button>
        <ModeBadge mode="scripted" />
        <span className="fine">The guided tour is the scripted visit. The square is the default experience.</span>
        {quietWorld && <span className="fine">Quiet world — no agents have authorized work right now.</span>}
      </section>
      {/* 1 · COMMON WORLD RULES — the rules of the place, ambient */}
      <PlaceRules>
        <span>Admission takes a signed join proof. Presence is opt-in, never assumed. The receiver decides every consequential action — an effect counts only with a receipt.</span>
      </PlaceRules>

      {/* participant switcher */}
      <section className="world-actors" aria-label="Participants">
        {(Object.keys(ACTOR_DEF) as Actor[]).map((actor) => {
          const def = ACTOR_DEF[actor];
          const s = sessions[actor];
          const wp = s ? participantsById.get(s.participant_id) : undefined;
          const visible = !!wp?.presence;
          return (
            <div key={actor} className={`world-actor ${acting === actor ? "acting" : ""} ${s?.revoked ? "revoked" : ""}`}>
              <button className="world-actor-pick" onClick={() => { sound.unlock(); sound.ui(); setActing(actor); }} aria-pressed={acting === actor}>
                <strong>{def.owner}</strong>
                <span className="world-actor-agent">{def.agent}{s ? (s.revoked ? " · revoked" : " · joined") : " · not joined"}</span>
                <ModeBadge mode="scripted" />
              </button>
              <button
                className={`world-toggle ${visible ? "on" : ""}`}
                onClick={() => {
                  if (s && !s.revoked) {
                    setPresence(actor, !visible).catch((e) => agentNote(`presence change failed: ${String(e)}`));
                  }
                }}
                disabled={!s || !!s.revoked}
                aria-pressed={visible}
                title={s?.revoked ? "revoked agents cannot be visible" : "presence is opt-in only"}
              >
                {visible ? "Visible" : "Be visible"}
              </button>
            </div>
          );
        })}
      </section>

      {/* presence honesty: here / not here / pending, from real state only */}
      <div className="world-here" aria-label="Who is here">
        {(Object.keys(ACTOR_DEF) as Actor[]).map((actor) => {
          const st = presenceOf(actor);
          return (
            <span key={actor} className={`here-chip here-${st === "not here" ? "nothere" : st}`}>
              {ACTOR_DEF[actor].owner}: <b>{st}</b>
            </span>
          );
        })}
        <span className="fine">“here” means presence was explicitly set · “not here” means no presence on record · “pending” means not joined yet. Presence is each participant’s last explicit update — this preview has no live heartbeat.</span>
      </div>

      <main className="world-main">
        <section className="world-stage">
          <div className="world-stagebar">
            <span className="panel-title">The workshop — first location</span>
            <button onClick={() => setListMode((v) => !v)}>{listMode ? "3D view" : "List view"}</button>
          </div>
          <div className="world-canvas">
            {listMode ? (
              <WorldList
                world={world}
                decisions={decisions}
                ownReceipts={ownReceipts}
                acting={acting}
                agentNotes={agentNotes}
                effects={effects}
                claimGraph={claimGraph}
                claimSummaries={claimSummaries}
                onOpenClaimReport={(id) => { sound.unlock(); sound.paper(); setOpenClaimReportId(id); setClaimView("cutaway"); setClaimVerdict(null); }}
                newsroom={newsroom}
                newsroomSummary={newsroomSummary}
                onOpenNewsroom={() => { sound.unlock(); sound.paper(); setOpenNewsroom(true); setNrVerdict(null); setOpenDispatchId(null); }}
              />
            ) : (
              <>
              <WorldScene
                hosts={hosts}
                offers={world?.offers ?? []}
                transactions={world?.transactions ?? []}
                latestDecision={latestDecision ? { action: latestDecision.action, decision: latestDecision.decision } : null}
                sharedReceipts={world?.shared_receipts ?? []}
                reducedMotion={reducedMotion}
                quality={quality}
                transportStatus={sceneTransport}
                backendReachable={backendOk !== false}
                openOfferId={openOfferId}
                onOpenOffer={openParcel}
                claimSummaries={claimSummaries}
                onOpenClaimReport={(id) => { sound.unlock(); sound.paper(); setOpenClaimReportId(id); setClaimView("cutaway"); setClaimVerdict(null); }}
                newsroomSummary={newsroomSummary}
                onOpenNewsroom={() => { sound.unlock(); sound.paper(); setOpenNewsroom(true); setNrVerdict(null); setOpenDispatchId(null); }}
                onSelectAgent={(id) => {
                  const actor = (Object.keys(ACTOR_DEF) as Actor[]).find((a) => ACTOR_DEF[a].agentId === id);
                  if (actor) { sound.unlock(); sound.ui(); setActing(actor); }
                }}
                quietWorld={quietWorld}
              />
              {openOfferId && (
                <ParcelReveal
                  offerId={openOfferId}
                  world={world}
                  participantsById={participantsById}
                  onClose={() => setOpenOfferId(null)}
                />
              )}
              </>
            )}
          </div>
        </section>

                {/* the claim-graph overlay lives outside the 3D/list switch: both views can open it */}
        {openClaimReportId && (
          <ClaimGraphReveal
            graph={claimGraph}
            reportId={openClaimReportId}
            view={claimView}
            onView={setClaimView}
            actingOwner={actingDef.owner}
            actingAgent={actingDef.agent}
            canAct={!!actingSession && !actingSession.revoked && actingSession.scopes.includes("claimgraph.correct")}
            actingRevoked={!!actingSession?.revoked}
            claimBusy={claimBusy}
            claimVerdict={claimVerdict}
            onPost={postClaimEvent}
            onClose={() => setOpenClaimReportId(null)}
          />
        )}

        {/* the newsroom overlay: the small desk, both views can open it */}
        {openNewsroom && (
          <NewsroomReveal
            newsroom={newsroom}
            actingOwner={actingDef.owner}
            actingAgent={actingDef.agent}
            canAct={!!actingSession && !actingSession.revoked && actingSession.scopes.includes("newsroom.review")}
            actingRevoked={!!actingSession?.revoked}
            openDispatchId={openDispatchId}
            onOpenDispatch={setOpenDispatchId}
            nrBusy={nrBusy}
            nrVerdict={nrVerdict}
            onImport={importFixtureDispatch}
            onReview={reviewProposal}
            onClose={() => setOpenNewsroom(false)}
            claimGraph={claimGraph}
            onSubmitPackage={(pkg, sha) => submitPackage(pkg, sha)}
          />
        )}

        <aside className="world-side">
          {/* guided beats */}
          <section className="world-panel" aria-label="Guided path">
            <div className="panel-title">Guided path — the first visit</div>
            <ol className="world-beats">
              {BEATS.map((b, i) => {
                const st = beatState[b.id]?.status ?? "idle";
                return (
                  <li key={b.id} className={`beat ${st}`}>
                    <button
                      className="beat-btn"
                      disabled={st === "active" || !!busy || backendOk === false}
                      onClick={() => runBeat(b)}
                      aria-label={`Beat ${i + 1}: ${b.title} — ${st}`}
                    >
                      <span className="beat-num">{i + 1}</span>
                      <span className="beat-body">
                        <strong>{b.title}</strong>
                        <span className="beat-desc">{b.desc}</span>
                        <span className="beat-expect">look for: {b.expect}</span>
                        {beatState[b.id]?.note && <span className="beat-note">{beatState[b.id].note}</span>}
                      </span>
                      <span className="beat-state">{st === "idle" ? "run" : st}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {nextBeat && (
              <button className="primary world-next" disabled={!!busy || backendOk === false} onClick={() => runBeat(nextBeat)}>
                {busy ? "Working…" : `Next: ${nextBeat.title}`}
              </button>
            )}
          </section>

          {/* 2 · OWNER RULES — private panel for the acting owner */}
          <section className="world-panel world-private" aria-label={`Your rules, ${actingDef.owner}`}>
            <div className="panel-title">Your rules — {actingDef.owner} <span className="world-private-tag">private</span></div>
            <ul className="world-rules">
              <li>Presence is opt-in — the toggle above is the whole mechanism.</li>
              <li>Your receipts are private until you choose to share them.</li>
              <li>You can revoke {actingDef.agent} at any time. The receiver stops it; the other participant is untouched.</li>
            </ul>
            <div className="world-mandate">
              <div className="panel-title">What {actingDef.agent} may do — live mandate</div>
              {actingSession ? (
                <>
                  <p className="mono">{actingSession.scopes.join(", ")}</p>
                  <p className="fine">
                    Scopes granted at join (standing: {actingSession.standing ?? "unavailable"}) and accepted by the receiver.
                    An agent’s capabilities <em>are</em> its mandate scopes — nothing here creates, imports, or develops skills.
                  </p>
                </>
              ) : (
                <p className="fine">Not joined yet — no mandate, no capabilities.</p>
              )}
            </div>
            <div className="world-privaterow">
              <button
                className="danger"
                disabled={!actingSession || actingSession.revoked || backendOk === false}
                onClick={() => actingSession && revoke(acting).catch((e) => agentNote(`revoke failed: ${String(e)}`))}
              >
                {actingSession?.revoked ? `${actingDef.agent} revoked` : `Revoke ${actingDef.agent}`}
              </button>
              <button disabled={backendOk === false} onClick={() => refresh()}>Refresh</button>
              <button disabled={backendOk === false} onClick={() => resetWorld().catch((e) => agentNote(`reset failed: ${String(e)}`))}>Reset world</button>
            </div>
            <div className="world-receipts">
              <div className="panel-title">Your receipts — private</div>
              {ownReceipts[acting].length === 0 ? (
                <p className="fine">No receipts yet. They appear here when the receiver decides for {actingDef.agent} — never in the shared space unless you share.</p>
              ) : (
                <ul>
                  {ownReceipts[acting].map((r, i) => (
                    <li key={i}>
                      <button
                        className="world-linkbtn mono"
                        disabled={!r.receipt_id}
                        onClick={() => r.receipt_id && openReceiptById(r.receipt_id, null, r)}
                      >
                        open {shortId(r.receipt_id)}
                      </button>{" "}
                      <span className={`badge ${r.decision === "ALLOWED" ? "ok" : r.decision === "STOPPED" ? "no" : ""}`}>{r.decision ?? "unavailable"}</span>{" "}
                      <button disabled={!r.receipt_id} onClick={() => r.receipt_id && shareReceipt(acting, r.receipt_id)}>Share</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* offers with TRANSACTION TERMS */}
          <section className="world-panel" aria-label="Offers">
            <div className="panel-title">Shared space — offers</div>
            <div className="world-offerform">
              <label>Kind
                <select value={offerForm.kind} onChange={(e) => setOfferForm((f) => ({ ...f, kind: e.target.value as OfferKind }))}>
                  {OFFER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label>Title
                <input value={offerForm.title} onChange={(e) => setOfferForm((f) => ({ ...f, title: e.target.value }))} maxLength={80} />
              </label>
              <label>Detail
                <input value={offerForm.detail} onChange={(e) => setOfferForm((f) => ({ ...f, detail: e.target.value }))} maxLength={160} />
              </label>
              <button
                className="primary"
                disabled={!sessions[acting] || backendOk === false}
                onClick={() => makeOffer(acting, offerForm).catch((e) => agentNote(`offer failed: ${String(e)}`))}
              >
                Offer as {actingDef.owner}
              </button>
            </div>
            <ul className="world-offers">
              {(world?.offers ?? []).length === 0 && <li className="fine">No offers yet. The board is empty — that is the honest state.</li>}
              {(world?.offers ?? []).map((o) => {
                const mine = sessions[acting]?.participant_id === o.from_participant;
                const requires = o.terms?.requires ?? null;
                return (
                  <li key={o.offer_id} className="world-offer">
                    <div className="world-offer-head">
                      <strong>{o.task.title}</strong>
                      <span className="badge">{o.status}</span>
                    </div>
                    <div className="fine">{o.task.kind} · from {o.from_display_name}</div>
                    {o.task.detail && <p className="fine">{o.task.detail}</p>}
                    {/* 3 · TRANSACTION TERMS — on the offer itself, from the real offer record */}
                    <p className="world-terms">
                      <strong>Terms:</strong> the named recipient’s Accept is the whole agreement.
                      Their own gate decides at acceptance time
                      {requires === null ? " (terms unavailable)" : requires.length === 0 ? "; no other party’s gate is required" : `; also required: ${requires.join(", ")}`}.
                      The receipt stays private to them unless they share it.
                    </p>
                    {!mine && o.status === "open" && (
                      <button
                        className="primary"
                        disabled={!sessions[acting] || backendOk === false}
                        onClick={() => acceptOffer(acting, o.offer_id).catch((e) => agentNote(`accept failed: ${String(e)}`))}
                      >
                        Accept as {actingDef.owner}
                      </button>
                    )}
                    {mine && <span className="fine">your offer — you cannot accept your own</span>}
                    {!mine && o.status !== "open" && <span className="fine">this offer is {o.status} — no longer acceptable</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* honesty lanes */}
          <section className="world-panel" aria-label="What happened">
            <div className="panel-title">What happened — three lanes</div>
            <div className="world-lanes">
              <div className="lane lane-agent">
                <h4><span className="dot" />Agent-reported</h4>
                <p className="lane-note">what agents say — not yet decided</p>
                <ul>{agentNotes.map((n, i) => <li key={i}><span className="ts">{n.ts}</span> {n.text}</li>)}</ul>
              </div>
              <div className="lane lane-receiver">
                <h4><span className="dot" />Receiver decided</h4>
                <p className="lane-note">what the gate actually decided</p>
                <ul>
                  {decisions.map((d, i) => (
                    <li key={i}>
                      <span className="ts">{d.ts}</span>{" "}
                      <span className={`badge ${d.decision === "ALLOWED" ? "ok" : d.decision === "STOPPED" ? "no" : ""}`}>{d.decision}</span>{" "}
                      {ACTOR_DEF[d.actor].agent} · {d.action}
                      {d.reason_codes.length > 0 && <span className="fine"> ({d.reason_codes.join(", ")})</span>}
                      <span className="fine mono"> · {shortId(d.receipt_id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lane lane-effect">
                <h4><span className="dot" />Confirmed effects</h4>
                <p className="lane-note">receipts and mandate changes only</p>
                <ul>{effects.map((n, i) => <li key={i}><span className="ts">{n.ts}</span> {n.text}</li>)}</ul>
              </div>
            </div>
          </section>

          {/* captions */}
          <section className="world-panel" aria-label="Sound captions">
            <div className="panel-title">Sound captions</div>
            {captions.length === 0
              ? <p className="fine">No sound cues yet. Every cue fires from a real event — never before it lands.</p>
              : <ul className="world-captions">{captions.map((c, i) => <li key={i}><span className="ts">{c.ts}</span> {c.text}</li>)}</ul>}
          </section>
        </aside>
      </main>
      </>
      )}

      {/* Local-preview disclosure, compact: one visible line keeps the custody
       * fact on screen; the full backend notice is one tap away. The same
       * disclosure also lives in the Panels drawer. */}
      <footer className="world-foot">
        <button
          className="world-foot-line"
          aria-expanded={footOpen}
          aria-label={footOpen ? "Hide full local-preview disclosure" : "Show full local-preview disclosure"}
          onClick={() => setFootOpen((o) => !o)}
          title={world?.notice ?? "A shared world. Your agent. Your boundaries."}
        >
          <span className="world-foot-tag">Local preview</span>
          <span className="world-foot-short">keys stay in each browser profile — the server keeps only its receiver key</span>
          <span className="world-foot-caret" aria-hidden="true">{footOpen ? "▴" : "▾"}</span>
        </button>
        {footOpen && (
          <p className="world-foot-full">
            {world?.notice ?? "A shared world. Your agent. Your boundaries."}{" "}
            <span className="fine">{SOUND_ATTRIBUTION} Sound identity is original, synthesized live with WebAudio.</span>
          </p>
        )}
      </footer>
    </div>
  );
}

/* ---------------- compact conventional (list) view of the same information ---------------- */

/**
 * The signature reveal: the opened parcel's tiny interior. Every line is a
 * real record — the offer, the transaction terms, the receiver's decision —
 * never decoration. Rendered only when a real transaction exists.
 */
function ParcelReveal({
  offerId, world, participantsById, onClose,
}: {
  offerId: string;
  world: WorldState | null;
  participantsById: Map<string, WorldState["participants"][number]>;
  onClose: () => void;
}) {
  const offer = (world?.offers ?? []).find((o) => o.offer_id === offerId);
  const tx = (world?.transactions ?? []).find((t) => t.offer_id === offerId);
  if (!offer || !tx) return null; // no real transaction → no interior
  const offererName = participantsById.get(tx.offerer)?.display_name ?? offer.from_display_name ?? "unavailable";
  const acceptorName = participantsById.get(tx.acceptor)?.display_name ?? "unavailable";
  const receiptIds = Object.entries(tx.receipts ?? {});
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label="Opened parcel">
      <div className="parcel-paper" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <div className="panel-title">The opened parcel — what’s inside</div>
        <dl className="parcel-facts">
          <div>
            <dt>Offered by</dt>
            <dd>{offererName} — “{offer.task.title}” ({offer.task.kind})</dd>
          </div>
          <div>
            <dt>May act</dt>
            <dd>{acceptorName} — the acceptor’s own gate decided, alone</dd>
          </div>
          <div>
            <dt>Receiver decided</dt>
            <dd>
              <span className={`badge ${tx.status === "accepted" ? "ok" : "no"}`}>{tx.status}</span>
              {receiptIds.map(([party, rid]) => (
                <span key={party} className="fine"> · {party}: <span className="mono">{shortId(String(rid))}</span></span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Terms</dt>
            <dd className="fine">
              {(tx.terms?.requires ?? []).length === 0
                ? "no other party’s gate required"
                : `also required: ${(tx.terms.requires ?? []).join(", ")}`}
              {" · "}decided {tx.decided_at ?? "unavailable"}
            </dd>
          </div>
        </dl>
        <p className="fine">Every line above is a backend record — the offer, the transaction, the receipts. Nothing here is staged.</p>
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

/** The package submit form: builds the package bytes in the browser,
 *  hashes them with the same canonical profile the receiver uses, and
 *  hands the bytes to the receiver. The producer's own review field is
 *  carried along for transparency — the receiver does not read it. */
function PackageSubmitForm({ busy, verdict, onSubmit }: {
  busy: boolean;
  verdict: NewsroomSubmitPackageResult | null;
  onSubmit: (pkg: ResearchPackage, sha: string) => Promise<void>;
}) {
  const M = FIXTURE_PACKAGE.manifest;
  const [fTitle, setFTitle] = useState(M.title);
  const [fClaim, setFClaim] = useState(M.claim);
  const [fProducer, setFProducer] = useState(M.producer_id);
  const [fStudy, setFStudy] = useState(FIXTURE_PACKAGE.study_py);
  const [fCsv, setFCsv] = useState(FIXTURE_PACKAGE.input_csv);
  const [fExpected, setFExpected] = useState(M.expected_result);
  const [fReproduce, setFReproduce] = useState(M.reproduce);
  const [fLimitations, setFLimitations] = useState(M.limitations);
  const [fReview, setFReview] = useState(M.producer_review);
  const [buildError, setBuildError] = useState<string | null>(null);

  const reset = () => {
    setFTitle(M.title); setFClaim(M.claim); setFProducer(M.producer_id);
    setFStudy(FIXTURE_PACKAGE.study_py); setFCsv(FIXTURE_PACKAGE.input_csv);
    setFExpected(M.expected_result); setFReproduce(M.reproduce);
    setFLimitations(M.limitations); setFReview(M.producer_review);
    setBuildError(null);
  };

  const submit = async () => {
    setBuildError(null);
    try {
      const files: Record<string, string> = { "study.py": fStudy, "input.csv": fCsv };
      const fileEntries: Record<string, { sha256: string }> = {};
      for (const [name, text] of Object.entries(files)) {
        fileEntries[name] = { sha256: await sha256Hex(text) };
      }
      const manifest = {
        schema: M.schema, title: fTitle, claim: fClaim, producer_id: fProducer,
        files: fileEntries, expected_result: fExpected, reproduce: fReproduce,
        citations: M.citations, limitations: fLimitations, producer_review: fReview,
      };
      const pkg: ResearchPackage = { manifest, files };
      const sha = await sha256Hex(canonicalJson({ manifest, files }));
      await onSubmit(pkg, sha);
    } catch (e) {
      setBuildError(String(e));
    }
  };

  const acc = verdict?.acceptance as PackageAcceptance | null | undefined;
  const fails = acc?.results.filter((r) => r.result === "fail") ?? [];
  return (
    <div className="nr-import">
      <h5 className="nr-subhead">Submit a research package — fixture values, prefilled</h5>
      <p className="fine">The browser builds the package bytes and hashes them; the receiver pins the bytes, re-derives the manifest, and runs its own frozen checks on what actually arrived. Edit any field to see a genuine failure — change one byte of the study or the expected result and the receiver will refuse the package.</p>
      <dl className="parcel-facts">
        <div><dt>Title</dt><dd><input className="nr-field" value={fTitle} onChange={(e) => setFTitle(e.target.value)} /></dd></div>
        <div><dt>Claim</dt><dd><textarea className="nr-field" rows={2} value={fClaim} onChange={(e) => setFClaim(e.target.value)} /></dd></div>
        <div><dt>Producer</dt><dd><input className="nr-field" value={fProducer} onChange={(e) => setFProducer(e.target.value)} /></dd></div>
        <div><dt>Reproduce</dt><dd><input className="nr-field" value={fReproduce} onChange={(e) => setFReproduce(e.target.value)} /></dd></div>
        <div><dt>study.py</dt><dd><textarea className="nr-field mono" rows={8} value={fStudy} onChange={(e) => setFStudy(e.target.value)} /></dd></div>
        <div><dt>input.csv</dt><dd><textarea className="nr-field mono" rows={6} value={fCsv} onChange={(e) => setFCsv(e.target.value)} /></dd></div>
        <div><dt>Expected stdout</dt><dd><textarea className="nr-field mono" rows={2} value={fExpected} onChange={(e) => setFExpected(e.target.value)} /></dd></div>
        <div><dt>Limitations</dt><dd><textarea className="nr-field" rows={2} value={fLimitations} onChange={(e) => setFLimitations(e.target.value)} /></dd></div>
        <div><dt>Producer review</dt><dd><textarea className="nr-field" rows={3} value={fReview} onChange={(e) => setFReview(e.target.value)} /></dd></div>
      </dl>
      <div className="nr-review-btns">
        <button
          className="primary"
          disabled={busy}
          onClick={submit}
          title="hands the package bytes to the receiver for evaluation"
        >
          {busy ? "Evaluating…" : "Submit for evaluation"}
        </button>
        <button disabled={busy} onClick={reset} title="restores the fixture values">Reset to fixture</button>
      </div>
      {buildError && <p className="fine">The package could not be built in the browser — the receiver was never reached: {buildError}</p>}
      {verdict && (
        <div className="cg-verdict" role="status">
          <span className={`badge ${verdict.decision === "ALLOWED" ? "ok" : verdict.decision === "STOPPED" ? "no" : ""}`}>{verdict.decision}</span>
          {" "}<span className="fine mono">{shortId(verdict.receipt_id)}</span>
          {verdict.reason_codes.length > 0 && <span className="fine"> · {verdict.reason_codes.join(", ")}</span>}
          {verdict.binding && !verdict.binding.match && (
            <span className="fine"> · declared <span className="mono">{shortId(verdict.binding.declared_sha256)}</span> ≠ pinned <span className="mono">{shortId(verdict.binding.pinned_sha256)}</span></span>
          )}
          {acc && (
            <span className="fine">
              {" · criteria "}{acc.results.filter((r) => r.result === "pass").length}/{acc.results.length} pass
              {fails.length > 0 && <>{" — failed: "}{fails.map((r) => r.criterion).join(", ")}</>}
              {" · "}{acc.verdict}
            </span>
          )}
          {verdict.replayed && <span className="fine"> · already on record</span>}
        </div>
      )}
    </div>
  );
}

/** The package inspector: the pinned bytes, the frozen criteria and their
 *  results, the resource limits that were in force (they bound the cost of
 *  trusted-fixture reproduction, not access — this is not a security
 *  sandbox), the gate-signed acceptance, and the isolation evidence
 *  (worker presentation, gate receipt, byte bindings). After a correction,
 *  the linked claim report's standings — the original bytes stay
 *  byte-identical. */
function PackageInspector({ dispatch, claimGraph, onClose }: {
  dispatch: NewsroomDispatch;
  claimGraph: ClaimGraphDescribe | null;
  onClose: () => void;
}) {
  const acc = dispatch.acceptance as PackageAcceptance | null | undefined;
  const manifest = dispatch.package?.manifest;
  const gateReceipt = dispatch.gate_receipt as { decision?: string; receipt_id?: string; reason_codes?: string[] } | null;
  const binding = dispatch.presentation_binding;
  const presentation = dispatch.presentation as { signature?: { public_key?: string }; payload_hash?: string } | null;
  const report = claimGraph?.reports?.find((r) => r.report_id === dispatch.claim_report_id);
  return (
    <div className="nr-dispatch-body">
      <dl className="parcel-facts">
        <div>
          <dt>Package sha256</dt>
          <dd><span className="mono">{dispatch.package_sha256 ?? "unavailable"}</span></dd>
        </div>
        <div>
          <dt>Acceptance</dt>
          <dd>
            {acc ? (
              <>{acc.verdict} · evaluated <span className="mono">{shortId(acc.evaluated_sha256)}</span>{acc.evaluated_sha256 === dispatch.package_sha256 ? " — matches the pinned package" : " — MISMATCH"}</>
            ) : "unavailable"}
          </dd>
        </div>
        {manifest && (
          <>
            <div><dt>Claim</dt><dd>{manifest.claim}</dd></div>
            <div><dt>Producer</dt><dd>{manifest.producer_id}</dd></div>
            <div><dt>Reproduce</dt><dd><span className="mono">{manifest.reproduce}</span></dd></div>
            <div><dt>Limitations</dt><dd>{manifest.limitations}</dd></div>
          </>
        )}
      </dl>
      {manifest?.citations && (
        <p className="fine">{manifest.citations.map((c) => `${c.locator} — ${c.note}`).join(" · ")}</p>
      )}
      {dispatch.package && (
        <details>
          <summary className="fine">Pinned file bytes (study.py, input.csv)</summary>
          {Object.entries(dispatch.package.files).map(([name, text]) => (
            <details key={name}>
              <summary className="mono fine">{name} · sha256 <span className="mono">{manifest?.files?.[name]?.sha256?.slice(0, 12)}…</span></summary>
              <pre className="mono fine nr-pre">{text}</pre>
            </details>
          ))}
        </details>
      )}
      {manifest && (
        <details>
          <summary className="fine">Expected stdout (frozen at submit)</summary>
          <pre className="mono fine nr-pre">{manifest.expected_result}</pre>
        </details>
      )}
      {acc && (
        <>
          <h5 className="nr-subhead">Frozen criteria — {acc.criteria_frozen}</h5>
          <ul className="cg-list">
            {acc.results.map((r) => (
              <li key={r.criterion}>
                <span className={`badge ${r.result === "pass" ? "ok" : "no"}`}>{r.criterion} {r.result}</span>
                <div className="fine">{r.check_performed}</div>
                <div className="fine">{r.detail}</div>
              </li>
            ))}
          </ul>
          <details>
            <summary className="fine">Study process — resource limits, recorded (not a security sandbox)</summary>
            <pre className="mono fine nr-pre">{JSON.stringify(acc.sandbox.limits, null, 2)}</pre>
            <p className="fine">Executed: {String((acc.sandbox as {executed?: boolean}).executed ?? "unavailable")} · Exit code {acc.sandbox.exit_code ?? "unavailable"} · timed out: {String(acc.sandbox.timed_out)} · stdout truncated: {String(acc.sandbox.stdout_truncated)}</p>
            <pre className="mono fine nr-pre">{acc.sandbox.stdout}</pre>
          </details>
          <p className="fine">Scope: {acc.scope_note}</p>
          <h5 className="nr-subhead">Isolation evidence</h5>
          <dl className="parcel-facts">
            <div>
              <dt>Acceptance signed by</dt>
              <dd>receiver gate key <span className="mono">{shortId(acc.signature?.public_key)}</span> — the worker never signs the acceptance</dd>
            </div>
            <div>
              <dt>Worker presentation</dt>
              <dd>worker-signed, public key <span className="mono">{shortId(presentation?.signature?.public_key)}</span> · payload <span className="mono">{shortId(presentation?.payload_hash)}</span></dd>
            </div>
            <div>
              <dt>Presentation binding</dt>
              <dd>presentation <span className="mono">{shortId(binding?.presentation_hash ?? undefined)}</span> → package <span className="mono">{shortId(binding?.package_sha256)}</span> · receipt <span className="mono">{shortId(binding?.receipt_id)}</span></dd>
            </div>
            <div>
              <dt>Gate receipt</dt>
              <dd>{gateReceipt?.decision ?? "unavailable"} · <span className="mono">{shortId(gateReceipt?.receipt_id)}</span>{(gateReceipt?.reason_codes?.length ?? 0) > 0 && <> · {gateReceipt!.reason_codes!.join(", ")}</>}</dd>
            </div>
          </dl>
        </>
      )}
      {report && (
        <>
          <h5 className="nr-subhead">Linked claim report — {report.report_id}</h5>
          <ul className="cg-list">
            {report.claims.map((c) => (
              <li key={c.claim_id}>
                <strong>{c.text}</strong>
                <div className="fine"><StandingTag claim={c} /></div>
              </li>
            ))}
          </ul>
          <p className="fine">A correction re-assesses only these recorded claims under the existing claim-graph rules. The package bytes and the acceptance record above stay byte-identical — history is preserved, never rewritten.</p>
        </>
      )}
      <div className="nr-review-btns">
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ---------------- the claim-graph cutaway ---------------- */

/**
 * The claim-graph reveal: the opened report's interior. Every line is a
 * backend record from GET /api/world/claimgraph — claims, relations,
 * provenance anchors, the signed receipt, and the receiver's impact
 * classifications. Three visual meanings, never color alone:
 *   AUTHORITY — the seal lane: who signed, what a signature commits to.
 *   EVIDENCE STANDING — shape + plain label + the backend's exact term.
 *   HISTORY — the receipt-roll timeline of events and previous receipts.
 * The frontend never invents a dependency, a standing, or a date.
 */

const CG_STATUS_WORD: Record<string, string> = {
  QUARANTINE: "reconsider",
  SURVIVES: "stands",
  AFFECTED_UNRESOLVED: "review",
  UNAFFECTED: "unchanged",
};

const CG_SHAPE: Record<string, string> = {
  QUARANTINE: "triangle",
  SURVIVES: "square",
  AFFECTED_UNRESOLVED: "diamond",
  UNAFFECTED: "circle",
};

const CG_REASON_WORDS: Record<string, string> = {
  SOURCE_BASIS_LOST: "the source it was anchored in was corrected or withdrawn",
  REQUIRED_DEPENDENCY_LOST: "a claim it depended on was corrected or withdrawn",
  ALL_ADMITTED_SUPPORT_PATHS_LOST: "every admitted way of supporting it runs through a corrected or withdrawn claim",
  ADMITTED_ALTERNATIVE_BASIS_REMAINS: "another admitted basis still supports it",
  PATH_INCLUDES_ADVISORY_EDGE: "part of the path to it was marked advisory — the receiver does not resolve it",
};

function ClaimGraphReveal({
  graph, reportId, view, onView,
  actingOwner, actingAgent, canAct, actingRevoked,
  claimBusy, claimVerdict, onPost, onClose,
}: {
  graph: ClaimGraphDescribe | null;
  reportId: string;
  view: "cutaway" | "list";
  onView: (v: "cutaway" | "list") => void;
  actingOwner: string;
  actingAgent: string;
  canAct: boolean;
  actingRevoked: boolean;
  claimBusy: string | null;
  claimVerdict: ClaimCorrectResult | null;
  onPost: (status: "CORRECTED" | "WITHDRAWN") => void;
  onClose: () => void;
}) {
  const report: ClaimReport | undefined = graph?.reports.find((r) => r.report_id === reportId);
  const claimById = useMemo(() => {
    const m = new Map<string, ClaimRecord>();
    report?.claims.forEach((c) => m.set(c.claim_id, c));
    return m;
  }, [report]);
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label="The opened report">
      <div className="parcel-paper cg-paper" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <div className="panel-title">{report?.title ?? "Report unavailable"}</div>
        {!report && <p className="fine">The backend has no such report. Nothing here is guessed.</p>}
        {report && (
          <>
            <p className="fine">{report.placement} · {report.claims.length} claims · {report.relations.length} relations, all recorded</p>
            <div className="cg-viewtoggle" role="tablist" aria-label="View">
              {(["cutaway", "list"] as const).map((v) => (
                <button key={v} className={view === v ? "on" : ""} onClick={() => onView(v)} aria-pressed={view === v}>
                  {v === "cutaway" ? "Cutaway" : "Simple list"}
                </button>
              ))}
            </div>

            {/* 1 · AUTHORITY — the seal lane: who signed, what it commits to */}
            <section className="cg-lane" aria-label="Authority">
              <h4 className="cg-lanehead"><span className="cg-seal" aria-hidden />Authority — the signed receipt</h4>
              <dl className="parcel-facts">
                <div>
                  <dt>Issued by</dt>
                  <dd>{report.receipt.issuer ?? "unavailable"} · {report.receipt.issued_at ?? "unavailable"}</dd>
                </div>
                <div>
                  <dt>Commits to</dt>
                  <dd>{report.receipt.claim_count ?? "unavailable"} claims · state <span className="mono">{shortId(report.receipt.graph_state_root)}</span> · <span className="mono">{report.receipt.claim_boundary ?? "unavailable"}</span></dd>
                </div>
              </dl>
              <p className="fine">A signature commits to this exact state. It does not certify truth, and a correction does not erase this record — previous receipts stay inspectable.</p>

              {/* the authorized demo control: the acting participant's own gate decides */}
              <div className="cg-control">
                <div className="cg-control-who">
                  <strong>Who may act now:</strong> {actingOwner} ({actingAgent})
                  {" · "}mandate includes claimgraph.correct: <strong>{canAct ? "yes" : "no"}</strong>
                  {" · "}standing: <strong>{actingRevoked ? "revoked" : "current"}</strong>
                </div>
                <div className="cg-control-btns">
                  {(["CORRECTED", "WITHDRAWN"] as const).map((status) => (
                    <button
                      key={status}
                      className="primary"
                      disabled={!canAct || !!claimBusy}
                      onClick={() => onPost(status)}
                      title={canAct ? "posts through the receiver — the receiver decides" : "your mandate or standing does not allow this"}
                    >
                      {claimBusy === status ? "Working…" : `Post ${status === "CORRECTED" ? "correction" : "withdrawal"}`}
                    </button>
                  ))}
                </div>
                <p className="fine">The receiver evaluates this like any other action. The impact report is computed by the backend — the frontend never decides a standing.</p>
                {claimVerdict && (
                  <div className="cg-verdict" role="status">
                    <span className={`badge ${claimVerdict.decision === "ALLOWED" ? "ok" : claimVerdict.decision === "STOPPED" ? "no" : ""}`}>{claimVerdict.decision}</span>
                    {" "}<span className="fine mono">{shortId(claimVerdict.receipt_id)}</span>
                    {claimVerdict.reason_codes.length > 0 && <span className="fine"> · {claimVerdict.reason_codes.join(", ")}</span>}
                    {claimVerdict.event_id && <span className="fine"> · event <span className="mono">{shortId(claimVerdict.event_id)}</span>{claimVerdict.replayed ? " (already on record)" : ""}</span>}
                  </div>
                )}
              </div>
            </section>

            {/* 2 · EVIDENCE STANDING — shape + plain label + the backend's exact term */}
            <section className="cg-lane" aria-label="Evidence standing">
              <h4 className="cg-lanehead">Evidence standing — per claim</h4>
              {view === "list" ? (
                <ul className="cg-list">
                  {report.claims.map((c) => (
                    <li key={c.claim_id}>
                      <strong>{c.text}</strong>
                      <div className="fine">
                        {c.kind} · <StandingTag claim={c} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="cg-stack">
                  {report.claims.map((c) => (
                    <div key={c.claim_id} className="cg-card">
                      <div className="cg-card-claim">
                        <span className="fine mono">{c.kind}</span>
                        <p>{c.text}</p>
                        <StandingTag claim={c} verbose />
                      </div>
                      <div className="cg-card-layer">
                        <span className="cg-layer-tag">evidence</span>
                        {c.provenance.length === 0 && <span className="fine">no provenance recorded</span>}
                        {c.provenance.map((p, i) => (
                          <p key={i} className="fine">“{p.quote}” — {p.source_label} · {p.mode}</p>
                        ))}
                      </div>
                      <div className="cg-card-layer">
                        <span className="cg-layer-tag">dependencies</span>
                        {report.relations.filter((r) => r.from_claim_id === c.claim_id || r.to_claim_id === c.claim_id).length === 0
                          ? <span className="fine">no recorded dependencies</span>
                          : report.relations
                            .filter((r) => r.from_claim_id === c.claim_id || r.to_claim_id === c.claim_id)
                            .map((r) => {
                              const other = r.from_claim_id === c.claim_id ? r.to_claim_id : r.from_claim_id;
                              const dir = r.from_claim_id === c.claim_id ? "—" : "←";
                              const otherText = claimById.get(other)?.text ?? "unavailable";
                              return (
                                <p key={r.relation_id} className="fine">
                                  {dir} {r.relation} <span className={`cg-auth cg-auth-${r.authority}`}>{r.authority}</span> {dir === "—" ? "→" : ""} {otherText}
                                </p>
                              );
                            })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="fine">“Reconsider” means the claim needs a new look, not that it is false. “Advisory” links inform but do not bind the receiver — it does not resolve them. This graph does not contain every dependency that exists; it contains the ones recorded in the snapshot.</p>
            </section>

            {/* 3 · HISTORY — the receipt-roll: sealed snapshots, then events */}
            <section className="cg-lane" aria-label="History">
              <h4 className="cg-lanehead">History — the receipt roll</h4>
              <ol className="cg-timeline">
                <li>
                  <span className="cg-seal" aria-hidden />
                  <div>
                    <strong>snapshot sealed</strong>
                    <div className="fine">{report.receipt.issued_at ?? "unavailable"} · {report.receipt.issuer ?? "unavailable"} · {report.receipt.claim_count ?? "unavailable"} claims · <span className="mono">{shortId(report.receipt.graph_state_root)}</span></div>
                  </div>
                </li>
                {(graph?.events ?? []).map((e, i) => (
                  <li key={i}>
                    <span className="cg-stamp" aria-hidden />
                    <div>
                      <strong>{e.status ?? "unavailable"}</strong>
                      <div className="fine">{e.effective_at ?? "unavailable"} · asserted by {e.asserted_by ?? "unavailable"}{e.replayed ? " · already on record" : ""}</div>
                      {e.reason && <div className="fine">“{e.reason}”</div>}
                      {(e.affected_source_labels ?? []).length > 0 && <div className="fine">affected: {e.affected_source_labels!.join(", ")}</div>}
                    </div>
                  </li>
                ))}
                {(graph?.events ?? []).length === 0 && <li className="fine">No events yet — the receipts above are the whole record.</li>}
              </ol>
              <p className="fine">{graph?.honesty ?? ""}</p>
            </section>
          </>
        )}
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

/* ---------------- the newsroom reveal ---------------- */

/**
 * The newsroom reveal: the small desk's interior. The owner-selected report
 * (an explicitly labeled fixture), its signed receipt, the manually
 * imported dispatches, and the proposed connections to the report. Every
 * line is a backend record from GET /api/world/newsroom.
 *
 * The "awaiting review" marker is deliberately NOT a standing medallion:
 * hollow dashed glyph instead of a filled shape, the words "awaiting
 * review" instead of a standing word, no motion. New evidence awaiting
 * review is not a verified change in evidence standing — the marker says
 * so in plain text.
 */

/** The marker: visually and textually distinct from the standing
 *  medallions (filled disc / triangle / diamond / square, some bobbing).
 *  A hollow dashed glyph, static, and the label names what it is not. */
function ReviewMarker({ count }: { count: number }) {
  return (
    <span className="nr-review-marker" role="status">
      <span className="nr-review-glyph" aria-hidden />
      <span>awaiting review{count > 1 ? ` · ${count}` : ""} — new evidence, not a standing change</span>
    </span>
  );
}

function NewsroomReveal({
  newsroom, actingOwner, actingAgent, canAct, actingRevoked,
  openDispatchId, onOpenDispatch, nrBusy, nrVerdict,
  onImport, onReview, onClose,
  claimGraph, onSubmitPackage,
}: {
  newsroom: NewsroomDescribe | null;
  actingOwner: string;
  actingAgent: string;
  canAct: boolean;
  actingRevoked: boolean;
  openDispatchId: string | null;
  onOpenDispatch: (id: string | null) => void;
  nrBusy: string | null;
  nrVerdict: NewsroomImportResult | NewsroomReviewResult | null;
  onImport: () => void;
  onReview: (proposalId: string, decision: "accept" | "decline") => void;
  onClose: () => void;
  claimGraph: ClaimGraphDescribe | null;
  onSubmitPackage: (pkg: ResearchPackage, sha: string) => Promise<NewsroomSubmitPackageResult | null>;
}) {
  const report = newsroom?.report;
  const dispatches: NewsroomDispatch[] = newsroom?.dispatches ?? [];
  const pending = newsroom?.pending_review ?? 0;
  const article = newsroom?.fixture_article;
  const [pkgVerdict, setPkgVerdict] = useState<NewsroomSubmitPackageResult | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [openPackageId, setOpenPackageId] = useState<string | null>(null);
  const packageDispatches = dispatches.filter((d) => d.research_package);
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label="The small desk">
      <div className="parcel-paper cg-paper" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <div className="panel-title">Newsroom — the small desk</div>
        {!newsroom && <p className="fine">The backend has no newsroom chapter. Nothing here is guessed.</p>}
        {newsroom && (
          <>
            <p className="nr-fixture">{newsroom.fixture_notice}</p>
            {pending > 0 && (
              <p><ReviewMarker count={pending} /></p>
            )}

            {/* the dispatch tray: incoming articles, manually imported */}
            <section className="cg-lane" aria-label="Dispatches">
              <h4 className="cg-lanehead">Dispatches — incoming, manually imported</h4>
              {dispatches.length === 0 && (
                <p className="fine">No dispatch has arrived yet. The fixture article below is the stand-in for a real incoming correction — import it to see a dispatch arrive.</p>
              )}
              {dispatches.map((d) => {
                const open = openDispatchId === d.dispatch_id;
                return (
                  <div className="nr-dispatch" key={d.dispatch_id}>
                    <button
                      className="nr-dispatch-head"
                      onClick={() => onOpenDispatch(open ? null : d.dispatch_id)}
                      aria-expanded={open}
                    >
                      <span className="nr-envelope" aria-hidden />
                      <span className="nr-dispatch-title">
                        <strong>{d.title}</strong>
                        {d.research_report && <span className="badge ok">research report</span>}
                        <span className="fine">{d.source_url}</span>
                      </span>
                      <span className="nr-dispatch-when fine">
                        published {d.published_at} · learned {d.retrieved_at}
                      </span>
                    </button>
                    {open && (
                      <div className="nr-dispatch-body">
                        <dl className="parcel-facts">
                          <div>
                            <dt>Source</dt>
                            <dd>{d.source_url}</dd>
                          </div>
                          <div>
                            <dt>Published</dt>
                            <dd>{d.published_at} <span className="fine">— the source’s claim about when it published</span></dd>
                          </div>
                          <div>
                            <dt>Learned by the system</dt>
                            <dd>{d.retrieved_at} <span className="fine">— when the import recorded it</span></dd>
                          </div>
                          <div>
                            <dt>Imported by</dt>
                            <dd>{d.imported_by ?? "unavailable"}</dd>
                          </div>
                        </dl>
                        <blockquote className="nr-quote">{d.body}</blockquote>
                        <p className="fine">Untrusted data: quoted for display, never executed, never fetched because it asks to be.</p>
                        {d.research_report && d.acceptance && (
                          <div className="nr-research-accept">
                            <h5 className="nr-subhead">Receiver-owned acceptance</h5>
                            <p className="fine">
                              Pinned bytes: <code>{d.report_sha256}</code>
                              {" "}— the submitted report, the evaluation, and this
                              display are bound to the same bytes.
                            </p>
                            <dl className="parcel-facts">
                              {d.acceptance.results.map((c) => (
                                <div key={c.criterion}>
                                  <dt>{c.criterion}</dt>
                                  <dd>
                                    <span className={`badge ${c.result === "pass" ? "ok" : "no"}`}>{c.result}</span>{" "}
                                    <span className="fine">{c.detail}</span>
                                  </dd>
                                </div>
                              ))}
                            </dl>
                            <p className="fine">{d.acceptance.scope_note}</p>
                          </div>
                        )}
                        <h5 className="nr-subhead">Proposed connections to the report</h5>
                        {d.proposals.length === 0 && <p className="fine">No connections proposed with this dispatch.</p>}
                        {d.proposals.map((p) => (
                          <div className="nr-proposal" key={p.proposal_id}>
                            <div className="nr-proposal-head">
                              <strong>{p.kind}</strong>
                              <span className={`badge ${p.status === "accepted" ? "ok" : p.status === "declined" ? "no" : ""}`}>{p.status}</span>
                            </div>
                            <p className="fine">targets: {p.target_claim_texts.length > 0 ? p.target_claim_texts.join(" · ") : "unavailable"}</p>
                            <p className="fine">“{p.rationale}”</p>
                            <p className="fine">recorded effect if accepted: {p.effect}</p>
                            <p className="fine"><strong>A proposal never changes a standing by itself.</strong> Only an accepted review admits new evidence — and even then, through the real impact engine.</p>
                            {p.status === "proposed" && (
                              <div className="nr-review-btns">
                                <button
                                  className="primary"
                                  disabled={!canAct || !!nrBusy}
                                  onClick={() => onReview(p.proposal_id, "accept")}
                                  title={canAct ? "admits the evidence through the real impact engine" : "your mandate or standing does not allow this"}
                                >
                                  {nrBusy === `accept:${p.proposal_id}` ? "Working…" : "Accept"}
                                </button>
                                <button
                                  disabled={!canAct || !!nrBusy}
                                  onClick={() => onReview(p.proposal_id, "decline")}
                                  title={canAct ? "declining changes nothing" : "your mandate or standing does not allow this"}
                                >
                                  {nrBusy === `decline:${p.proposal_id}` ? "Working…" : "Decline"}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* the manual import control: the fixture article, prefilled */}
              <div className="nr-import">
                <h5 className="nr-subhead">Manual import — the fixture article</h5>
                {article ? (
                  <>
                    <dl className="parcel-facts">
                      <div>
                        <dt>Title</dt>
                        <dd>{article.title}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{article.source_url}</dd>
                      </div>
                      <div>
                        <dt>Published</dt>
                        <dd>{article.published_at}</dd>
                      </div>
                    </dl>
                    <p className="fine">Fixture values, prefilled — this desk admits only the registered fixture bytes in this preview. Importing goes through the receiver like any other action, and re-importing replays the same dispatch instead of duplicating it.</p>
                    <div className="nr-review-btns">
                      <button
                        className="primary"
                        disabled={!canAct || !!nrBusy}
                        onClick={onImport}
                        title={canAct ? "imports the fixture article as a dispatch, through the receiver" : "your mandate or standing does not allow this"}
                      >
                        {nrBusy === "import" ? "Working…" : "Import this dispatch"}
                      </button>
                    </div>
                    <p className="fine">
                      Who may act now: {actingOwner} ({actingAgent})
                      {" · "}mandate includes newsroom.review: <strong>{canAct ? "yes" : "no"}</strong>
                      {" · "}standing: <strong>{actingRevoked ? "revoked" : "current"}</strong>
                    </p>
                  </>
                ) : (
                  <p className="fine">No fixture article on record.</p>
                )}
                {nrVerdict && (
                  <div className="cg-verdict" role="status">
                    <span className={`badge ${nrVerdict.decision === "ALLOWED" ? "ok" : nrVerdict.decision === "STOPPED" ? "no" : ""}`}>{nrVerdict.decision}</span>
                    {" "}<span className="fine mono">{shortId(nrVerdict.receipt_id)}</span>
                    {nrVerdict.reason_codes.length > 0 && <span className="fine"> · {nrVerdict.reason_codes.join(", ")}</span>}
                    {"dispatch_id" in nrVerdict && nrVerdict.dispatch_id && (
                      <span className="fine"> · dispatch <span className="mono">{shortId(nrVerdict.dispatch_id)}</span>{nrVerdict.replayed ? " (already on record)" : ""}</span>
                    )}
                    {"review" in nrVerdict && nrVerdict.review && (
                      <span className="fine">
                        {" · proposal "}
                        {nrVerdict.review === "accept" ? "accepted" : "declined"}
                        {nrVerdict.admitted_event_id ? (
                          <>{" · evidence admitted "}<span className="mono">{shortId(nrVerdict.admitted_event_id)}</span></>
                        ) : (
                          <>{" · standings unchanged"}</>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* research packages: the commons. A producer submits bytes;
                the receiver pins them, runs the frozen K1-K7 criteria on
                the pinned bytes in an isolated study process, and records
                the acceptance signed by its own gate key. Producer
                self-approval authorizes nothing. */}
            <section className="cg-lane" aria-label="Research packages">
              <h4 className="cg-lanehead"><span className="cg-seal" aria-hidden />Research packages — the commons</h4>
              <p className="fine">A producer submits a package of bytes; the receiver decides whether the town may display it. The criteria are structural — complete, reproducible, cited, bounded — never a finding that the claim is true.</p>
              {packageDispatches.length === 0 && (
                <p className="fine">No research package has been admitted yet. The form below builds the demonstration fixture package in your browser and hands its bytes to the receiver for evaluation.</p>
              )}
              {packageDispatches.map((d) => {
                const open = openPackageId === d.dispatch_id;
                const acc = d.acceptance as PackageAcceptance | null | undefined;
                return (
                  <div className="nr-dispatch" key={d.dispatch_id}>
                    <button
                      className="nr-dispatch-head"
                      onClick={() => setOpenPackageId(open ? null : d.dispatch_id)}
                      aria-expanded={open}
                    >
                      <span className="nr-dispatch-title">{d.title}</span>
                      <span className="fine">package <span className="mono">{shortId(d.package_sha256 ?? undefined)}</span></span>
                      {acc && (
                        <span className={`badge ${acc.verdict === "ACCEPTED" ? "ok" : "no"}`}>{acc.verdict}</span>
                      )}
                    </button>
                    {open && (
                      <PackageInspector
                        dispatch={d}
                        claimGraph={claimGraph}
                        onClose={() => setOpenPackageId(null)}
                      />
                    )}
                  </div>
                );
              })}
              {canAct ? (
                <PackageSubmitForm
                  busy={pkgBusy}
                  verdict={pkgVerdict}
                  onSubmit={async (pkg, sha) => {
                    setPkgBusy(true);
                    setPkgVerdict(null);
                    try {
                      setPkgVerdict(await onSubmitPackage(pkg, sha));
                    } finally {
                      setPkgBusy(false);
                    }
                  }}
                />
              ) : (
                <p className="fine">Who may act now: {actingOwner} ({actingAgent}) · mandate includes newsroom.review: <strong>no</strong> · standing: <strong>{actingRevoked ? "revoked" : "current"}</strong>. Submitting a package needs the newsroom.review mandate.</p>
              )}
            </section>

            {/* the report: owner-selected (fixture), recorded claims, cited sources */}
            {report && (
              <section className="cg-lane" aria-label="The report">
                <h4 className="cg-lanehead"><span className="cg-seal" aria-hidden />The report — owner-selected <span className="nr-tag">fixture</span></h4>
                <p className="fine">{report.placement} · {report.claims.length} claims · {report.relations.length} relations, all recorded</p>
                <dl className="parcel-facts">
                  <div>
                    <dt>Issued by</dt>
                    <dd>{report.receipt.issuer ?? "unavailable"} · {report.receipt.issued_at ?? "unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Commits to</dt>
                    <dd>{report.receipt.claim_count ?? "unavailable"} claims · state <span className="mono">{shortId(report.receipt.graph_state_root)}</span> · <span className="mono">{report.receipt.claim_boundary ?? "unavailable"}</span></dd>
                  </div>
                </dl>
                <p className="fine">A signature commits to this exact state. It does not certify truth, and admitting new evidence does not rewrite this record — previous receipts stay inspectable.</p>
                <ul className="cg-list">
                  {report.claims.map((c) => (
                    <li key={c.claim_id}>
                      <strong>{c.text}</strong>
                      <div className="fine">
                        {c.kind} · <StandingTag claim={c} />
                      </div>
                      {c.provenance.map((p, i) => (
                        <p key={i} className="fine">“{p.quote}” — {p.source_label} · {p.mode}</p>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* history: imports, reviews, admitted evidence — appended, never rewritten */}
            <section className="cg-lane" aria-label="History">
              <h4 className="cg-lanehead">History — the desk log</h4>
              <ol className="cg-timeline">
                {(newsroom.events ?? []).length === 0 && <li className="fine">Nothing imported or reviewed yet.</li>}
                {(newsroom.events ?? []).map((e, i) => (
                  <li key={i}>
                    <span className="cg-stamp" aria-hidden />
                    <div>
                      {e.kind === "dispatch-imported" && (
                        <>
                          <strong>dispatch imported</strong>
                          <div className="fine">{String(e.title ?? "unavailable")}</div>
                          <div className="fine">published {String(e.published_at ?? "unavailable")} · learned {String(e.retrieved_at ?? "unavailable")} · by {String(e.imported_by ?? "unavailable")}</div>
                        </>
                      )}
                      {e.kind === "review-decision" && (
                        <>
                          <strong>proposal {e.decision === "accept" ? "accepted" : e.decision === "decline" ? "declined" : String(e.decision ?? "unavailable")}</strong>
                          <div className="fine"><span className="mono">{shortId(String(e.proposal_id ?? ""))}</span> · by {String(e.decided_by ?? "unavailable")} · {String(e.at ?? "unavailable")}</div>
                          {e.admitted_event_id && <div className="fine">evidence admitted · event <span className="mono">{shortId(String(e.admitted_event_id))}</span></div>}
                          {!e.admitted_event_id && <div className="fine">no evidence admitted · standings unchanged</div>}
                        </>
                      )}
                      {e.kind === "evidence-admitted" && (
                        <>
                          <strong>evidence admitted — {String((e.event as { status?: string })?.status ?? "unavailable")}</strong>
                          <div className="fine">{String((e.event as { effective_at?: string })?.effective_at ?? "unavailable")} · asserted by {String((e.event as { asserted_by?: string })?.asserted_by ?? "unavailable")}</div>
                          {(e.event as { reason?: string })?.reason && <div className="fine">“{String((e.event as { reason?: string }).reason)}”</div>}
                        </>
                      )}
                      {e.kind !== "dispatch-imported" && e.kind !== "review-decision" && e.kind !== "evidence-admitted" && (
                        <><strong>{e.kind}</strong><div className="fine">{String(e.at ?? "unavailable")}</div></>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="fine">{newsroom.honesty ?? ""}</p>
            </section>
          </>
        )}
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

/** The standing tab: shape + plain label + the backend's exact term. Never
 *  color alone; a null standing is honestly "not yet assessed". */
function StandingTag({ claim, verbose }: { claim: ClaimRecord; verbose?: boolean }) {
  const s = claim.standing;
  if (!s) {
    return (
      <span className="cg-standing">
        <span className="cg-shape cg-shape-hollow" aria-hidden />
        <span className="cg-word">not yet assessed</span>
      </span>
    );
  }
  return (
    <span className="cg-standing">
      <span className={`cg-shape cg-shape-${CG_SHAPE[s.classification] ?? "circle"}`} aria-hidden />
      <span className="cg-word">{CG_STATUS_WORD[s.classification] ?? s.classification.toLowerCase()}</span>
      <span className="fine mono"> · {s.classification}{s.reason ? ` / ${s.reason}` : ""}</span>
      {verbose && s.reason && CG_REASON_WORDS[s.reason] && (
        <span className="fine"> — {CG_REASON_WORDS[s.reason]}</span>
      )}
    </span>
  );
}

function WorldList({
  world, decisions, ownReceipts, acting, agentNotes, effects,
  claimGraph, claimSummaries, onOpenClaimReport,
  newsroom, newsroomSummary, onOpenNewsroom,
}: {
  world: WorldState | null;
  decisions: DecisionEntry[];
  ownReceipts: Record<Actor, WorldReceipt[]>;
  acting: Actor;
  agentNotes: LaneNote[];
  effects: LaneNote[];
  claimGraph: ClaimGraphDescribe | null;
  claimSummaries: ClaimDeskSummary[];
  onOpenClaimReport: (reportId: string) => void;
  newsroom: NewsroomDescribe | null | undefined;
  newsroomSummary: NewsroomDeskSummary | null;
  onOpenNewsroom: () => void;
}) {
  if (!world) return <p className="fine world-listempty">World state unavailable — the backend has not answered yet. Nothing here is guessed.</p>;
  const evts: WorldEvent[] = world.events ?? [];
  return (
    <div className="world-list">
      <section>
        <h3>Place</h3>
        <p>{world.world.location} · v{world.world.version}</p>
        <p className="fine">Rules of the place: admission takes a signed join proof. Presence is opt-in, never assumed. The receiver decides; effects need a receipt.</p>
      </section>
      <section>
        <h3>Participants</h3>
        <ul>
          {world.participants.map((p) => (
            <li key={p.participant_id}>
              <strong>{p.display_name}</strong> · agent {p.agent.display_name}
              {" · "}{p.presence ? `visible (${p.presence.status}${p.presence.note ? ` — ${p.presence.note}` : ""})` : "not visible"}
              {" · "}joined {p.joined_at}
            </li>
          ))}
          {world.participants.length === 0 && <li className="fine">Nobody here yet.</li>}
        </ul>
      </section>
      <section>
        <h3>Offers</h3>
        <ul>
          {world.offers.map((o: WorldOffer) => (
            <li key={o.offer_id}><strong>{o.task.title}</strong> ({o.task.kind}) · from {o.from_display_name} · {o.status}</li>
          ))}
          {world.offers.length === 0 && <li className="fine">No offers.</li>}
        </ul>
      </section>
      <section>
        <h3>Transactions</h3>
        <ul>
          {(world.transactions ?? []).map((t) => (
            <li key={t.transaction_id}>
              <span className="mono">{shortId(t.transaction_id)}</span> · {t.task.title} · <span className="badge">{t.status}</span>
              <br /><span className="fine">terms: {(t.terms?.requires ?? []).length === 0 ? "acceptor’s own gate only" : `requires ${t.terms.requires.join(", ")}`} · receipts: {Object.entries(t.receipts ?? {}).map(([k, v]) => `${k}: ${shortId(v)}`).join(", ") || "unavailable"}</span>
            </li>
          ))}
          {(world.transactions ?? []).length === 0 && <li className="fine">No transactions yet.</li>}
        </ul>
      </section>
      <section>
        <h3>Receiver decisions</h3>
        <ul>
          {decisions.map((d, i) => (
            <li key={i}><span className={`badge ${d.decision === "ALLOWED" ? "ok" : d.decision === "STOPPED" ? "no" : ""}`}>{d.decision}</span> {ACTOR_DEF[d.actor].agent} · {d.action} · <span className="mono">{shortId(d.receipt_id)}</span></li>
          ))}
          {decisions.length === 0 && <li className="fine">No decisions yet.</li>}
        </ul>
      </section>
      <section>
        <h3>Receipts</h3>
        <ul>
          {(world.shared_receipts ?? []).map((e, i) => (
            <li key={`s${i}`}><span className="mono">{shortId(e.receipt?.receipt_id)}</span> · shared by {e.shared_by_display_name} · {e.receipt?.decision ?? "unavailable"}</li>
          ))}
          {ownReceipts[acting].map((r, i) => (
            <li key={`p${i}`}><span className="mono">{shortId(r.receipt_id)}</span> · private to {ACTOR_DEF[acting].owner} · {r.decision ?? "unavailable"}</li>
          ))}
          {(world.shared_receipts ?? []).length === 0 && ownReceipts[acting].length === 0 && <li className="fine">No receipts.</li>}
        </ul>
      </section>
      <section>
        <h3>Claim graph — the reading desk</h3>
        {claimGraph ? (
          <>
            <ul>
              {(claimGraph.reports ?? []).map((r) => {
                const summary = claimSummaries.find((s) => s.report_id === r.report_id);
                return (
                  <li key={r.report_id}>
                    <strong>{r.title}</strong> · {r.placement} · {r.claims.length} claims · {r.relations.length} relations
                    <br /><span className="fine">medallion: <strong>{summary?.status ?? "unavailable"}</strong> ({summary?.detail ?? "unavailable"}) · receipt <span className="mono">{shortId(r.receipt.graph_state_root)}</span> from {r.receipt.issuer ?? "unavailable"}</span>
                    {" "}<button className="world-linkbtn" onClick={() => onOpenClaimReport(r.report_id)}>open the report</button>
                    <ul className="fine">
                      {r.claims.map((c) => (
                        <li key={c.claim_id}>
                          {c.text} — <strong>{c.standing ? (CG_STATUS_WORD[c.standing.classification] ?? c.standing.classification.toLowerCase()) : "not yet assessed"}</strong>
                          {c.standing && <span className="mono"> ({c.standing.classification}{c.standing.reason ? ` / ${c.standing.reason}` : ""})</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <p className="fine">{claimGraph.events.length} event(s): {(claimGraph.events.map((e) => e.status).join(", ") || "none")} · {claimGraph.honesty}</p>
          </>
        ) : (
          <p className="fine">The backend reported no claim-graph chapter.</p>
        )}
      </section>
      <section>
        <h3>Newsroom — the small desk</h3>
        {newsroomSummary ? (
          <>
            <p>
              <strong>{newsroomSummary.title}</strong> — owner-selected <span className="nr-tag">fixture</span>, {newsroom?.report.claims.length ?? 0} claims
            </p>
            {newsroomSummary.pendingReview > 0 && (
              <p><ReviewMarker count={newsroomSummary.pendingReview} /></p>
            )}
            {(newsroom?.dispatches ?? []).length === 0 && (
              <p className="fine">No dispatches imported yet. The desk says so; it does not imagine one.</p>
            )}
            <ul className="fine">
              {(newsroom?.dispatches ?? []).map((d) => (
                <li key={d.dispatch_id}>
                  {d.title} — {d.source_url}
                  <br />
                  published {d.published_at} · learned {d.retrieved_at}
                  {d.proposals.length > 0 && (
                    <ul>
                      {d.proposals.map((p) => (
                        <li key={p.proposal_id}>
                          {p.kind} — {p.target_claim_texts.join("; ") || "unavailable"} · <strong>{p.status}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {" "}<button className="world-linkbtn" onClick={onOpenNewsroom}>open the newsroom</button>
          </>
        ) : (
          <p className="fine">The backend reported no newsroom chapter. Nothing here is guessed.</p>
        )}
      </section>
      <section>
        <h3>World events</h3>
        <ul>
          {evts.map((e, i) => <li key={i}><span className="ts">{e.ts}</span> <span className="badge">{e.kind}</span> {e.summary}</li>)}
          {evts.length === 0 && <li className="fine">No events.</li>}
        </ul>
      </section>
      <section>
        <h3>Agent-reported activity</h3>
        <ul>
          {agentNotes.map((n, i) => <li key={i}><span className="ts">{n.ts}</span> {n.text}</li>)}
          {agentNotes.length === 0 && <li className="fine">None.</li>}
        </ul>
      </section>
      <section>
        <h3>Confirmed effects</h3>
        <ul>
          {effects.map((n, i) => <li key={i}><span className="ts">{n.ts}</span> {n.text}</li>)}
          {effects.length === 0 && <li className="fine">None.</li>}
        </ul>
      </section>
    </div>
  );
}

/* ================= the square: the default open-world experience ================= */

/** Props for SquareMode — everything it needs is passed in from SharedWorld;
 *  the tour's state and JSX are untouched. */
interface SquareModeProps {
  world: WorldState | null;
  quality: "high" | "low";
  backendOk: boolean | null;
  squareSession: SquareSession | null;
  /** The visitor's custody client (worker-signed presentations). Null until entered. */
  squareClient: CustodyClient | null;
  hostSessions: Record<"wren" | "juniper", SquareSession | null>;
  squareHosts: HostState[];
  squareVisitors: VisitorState[];
  participantsById: Map<string, WorldParticipant>;
  reducedMotion: boolean;
  transportStatus: TransportStatus | null;
  /** quiet world — no agent has authorized work; the scene stands a slate
   *  and the side panel says so honestly. */
  quietWorld: boolean;
  onSelectAgent: (agentId: string) => void;
  joinName: string; setJoinName: (v: string) => void;
  joinAgentName: string; setJoinAgentName: (v: string) => void;
  joinIntent: Intent | null; setJoinIntent: (v: Intent | null) => void;
  joinPresence: boolean; setJoinPresence: (v: boolean) => void;
  intent: Intent | null; setIntent: (v: Intent | null) => void;
  boardListings: WorldListing[];
  filteredBoard: WorldListing[];
  boardSource: "board" | "offers-fallback" | null;
  boardError: string | null;
  filters: BoardFilters; setFilters: (f: BoardFilters) => void;
  kindOptions: string[];
  kindNote: string;
  squareAgreements: WorldAgreement[];
  agreementsError: string | null;
  suggestionList: BoardSuggestion[];
  suggestError: string | null;
  myOpenListings: WorldListing[];
  setInspectListingId: (v: string | null) => void;
  inspectListing: WorldListing | null;
  setInspectAgreementId: (v: string | null) => void;
  inspectAgreement: WorldAgreement | null;
  setInspectVisitorId: (v: string | null) => void;
  inspectVisitor: WorldParticipant | null;
  visitorListings: WorldListing[];
  postForm: { kind: string; title: string; detail: string };
  setPostForm: (v: { kind: string; title: string; detail: string }) => void;
  squareBusy: string | null;
  squareNote: string | null; setSquareNote: (v: string | null) => void;
  pollText: string;
  openClaimReportId: string | null; setOpenClaimReportId: (v: string | null) => void;
  claimGraph: ClaimGraphDescribe | null;
  claimSummaries: ClaimDeskSummary[];
  claimView: "cutaway" | "list"; setClaimView: (v: "cutaway" | "list") => void;
  claimVerdict: ClaimCorrectResult | null; setClaimVerdict: (v: ClaimCorrectResult | null) => void;
  openNewsroom: boolean; setOpenNewsroom: (v: boolean) => void;
  newsroom: NewsroomDescribe | null;
  newsroomSummary: NewsroomDeskSummary | null;
  openDispatchId: string | null; setOpenDispatchId: (v: string | null) => void;
  nrBusy: string | null;
  nrVerdict: NewsroomImportResult | NewsroomReviewResult | null;
  setNrVerdict: (v: NewsroomImportResult | NewsroomReviewResult | null) => void;
  claimBusy: string | null;
  decisions: DecisionEntry[];
  agentNotes: LaneNote[];
  effects: LaneNote[];
  captions: LaneNote[];
  cue: (kind: "ui" | "allow" | "refuse" | "paper" | "stamp" | "arrive" | "depart", text: string) => void;
  enterSquare: () => void;
  leaveSquare: () => void;
  setOwnPresence: (on: boolean) => void;
  postNeedSquare: () => void;
  postOfferSquare: () => void;
  approachListing: (l: WorldListing) => void;
  proposeAgreementSquare: (l: WorldListing) => void;
  actOnAgreement: (id: string, action: "agree" | "decline" | "submit") => void;
  withdrawListingSquare: (l: WorldListing) => void;
  postClaimEvent: (status: "CORRECTED" | "WITHDRAWN", as?: CustodyClient) => void;
  importFixtureDispatch: (as?: CustodyClient) => void;
  reviewProposal: (proposalId: string, decision: "accept" | "decline", as?: CustodyClient) => void;
  submitPackage: (pkg: ResearchPackage, sha: string, as?: CustodyClient) => Promise<NewsroomSubmitPackageResult | null>;
  onStartTour: () => void;
  /** the Panels drawer: square side content on demand */
  panelsOpen: boolean;
  onClosePanels: () => void;
  /** open the research-session inspector (overlay, both modes) */
  onOpenResearch: () => void;
  /** open the commission-ledger inspector (overlay, both modes) */
  onOpenCommission: () => void;
  /** settings, relocated from the old top bar into the drawer */
  muted: boolean;
  onToggleMute: () => void;
  onToggleReducedMotion: () => void;
  onToggleQuality: () => void;
  onExit: () => void;
  /** the visitor inspect target — drives the clean scene's figure selection */
  inspectVisitorId: string | null;
  /** world events for the activity lane, pause/revoke for the visitor inspect */
  worldEvents: WorldEvent[];
  onSelPause: (paused: boolean) => Promise<void>;
  onSelRevoke: () => Promise<void>;
  /** the visitor's own private receipts, for the list view's receipt rows */
  squareReceipts: WorldReceipt[];
  /** when true the stage shows the town as a plain list, not 3D */
  listView: boolean;
  /** open the receipt inspector for one receipt id (agreement role hint) */
  onOpenReceipt: (receiptId: string, role?: string | null, record?: WorldReceipt | null) => void;
}

/** One connected community, five places — the legend doubles as a camera guide. */
const PLACES = [
  { key: "square", name: "Public square", purpose: "arrive & meet" },
  { key: "board", name: "Exchange board", purpose: "needs & offers" },
  { key: "workshop", name: "Workshop", purpose: "work made & checked" },
  { key: "library", name: "Newsroom & library", purpose: "reports & corrections" },
  { key: "counters", name: "Receiving counters", purpose: "accept or refuse" },
] as const;

/**
 * SquareList — the town as a plain list: places, participants, listings,
 * agreements (with the receiver's decisions), receipts, and recent events.
 * The screen-reader-friendly twin of the 3D stage: every row reuses the same
 * backend records and the same inspect/open handlers as the canvas.
 */
function SquareList({
  visitors, hosts, selfId, listings, agreements, receipts, sharedReceipts, events,
  onInspectListing, onInspectAgreement, onInspectVisitor, onOpenReceipt,
}: {
  visitors: VisitorState[];
  hosts: HostState[];
  selfId: string | null;
  listings: WorldListing[];
  agreements: WorldAgreement[];
  receipts: WorldReceipt[];
  sharedReceipts: SharedReceiptEntry[];
  events: WorldEvent[];
  onInspectListing: (id: string) => void;
  onInspectAgreement: (id: string) => void;
  onInspectVisitor: (id: string) => void;
  onOpenReceipt: (receiptId: string, role?: string | null, record?: WorldReceipt | null) => void;
}) {
  const recentEvents = events.slice(-12).reverse();
  return (
    <div className="square-list" role="document" aria-label="The town as a list">
      <section aria-label="Places">
        <div className="panel-title">Places</div>
        <ul className="sq-list">
          {PLACES.map((pl) => (
            <li key={pl.key}><strong>{pl.name}</strong> — <span className="fine">{pl.purpose}</span></li>
          ))}
        </ul>
      </section>
      <section aria-label="Participants">
        <div className="panel-title">Participants</div>
        <ul className="sq-list">
          {hosts.map((h) => {
            const hid = h.participantId ?? h.agentId;
            return (
              <li key={hid}>
                <button className="world-linkbtn" onClick={() => onInspectVisitor(hid)}>{h.displayName}</button>{" "}
                <span className="fine">host</span>
              </li>
            );
          })}
          {visitors.map((v) => (
            <li key={v.participant_id}>
              <button className="world-linkbtn" onClick={() => onInspectVisitor(v.participant_id)}>{v.displayName}</button>{" "}
              {v.participant_id === selfId ? <span className="fine">you</span> : null}
            </li>
          ))}
          {hosts.length === 0 && visitors.length === 0 && <li className="fine">no one here yet</li>}
        </ul>
      </section>
      <section aria-label="Listings">
        <div className="panel-title">Exchange board</div>
        {listings.length === 0 ? (
          <p className="fine">The board is empty.</p>
        ) : (
          <ul className="sq-list">
            {listings.map((l) => (
              <li key={l.listing_id}>
                <button className="world-linkbtn" onClick={() => onInspectListing(l.listing_id)}>{l.title}</button>{" "}
                <span className="fine">{l.kind} · from {l.from_display_name} · {l.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Agreements">
        <div className="panel-title">Agreements</div>
        {agreements.length === 0 ? (
          <p className="fine">No agreements on record.</p>
        ) : (
          <ul className="sq-list">
            {agreements.map((a) => {
              const decision = a.decision ?? null;
              const entries = a.receipts ? Object.entries(a.receipts) : [];
              return (
                <li key={a.agreement_id}>
                  <button className="world-linkbtn" onClick={() => onInspectAgreement(a.agreement_id)}>
                    {shortId(a.agreement_id)}
                  </button>{" "}
                  <span className="fine">{a.status}</span>{" "}
                  {decision && (
                    <span className={`badge ${decision === "ALLOWED" ? "ok" : decision === "STOPPED" ? "no" : ""}`}>
                      receiver: {decision}
                    </span>
                  )}
                  {entries.map(([role, rid]) => (
                    <span key={role} className="fine">
                      {" · receipt "}{role}{" "}
                      <button className="world-linkbtn mono" onClick={() => onOpenReceipt(rid, role)}>
                        open {shortId(rid)}
                      </button>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-label="Receipts">
        <div className="panel-title">Receipts</div>
        {receipts.length === 0 && sharedReceipts.length === 0 ? (
          <p className="fine">No receipts yet.</p>
        ) : (
          <ul className="sq-list">
            {receipts.map((r) => (
              <li key={r.receipt_id ?? `${r.action}:${r.decided_at}`}>
                {r.receipt_id ? (
                  <button className="world-linkbtn mono" onClick={() => onOpenReceipt(r.receipt_id!, null, r)}>
                    open {shortId(r.receipt_id)}
                  </button>
                ) : (
                  <span className="mono fine">unsigned record</span>
                )}{" "}
                <span className={`badge ${r.decision === "ALLOWED" ? "ok" : r.decision === "STOPPED" ? "no" : ""}`}>{r.decision ?? "—"}</span>{" "}
                <span className="fine">private — yours</span>
              </li>
            ))}
            {sharedReceipts.map((s) => (
              <li key={s.receipt.receipt_id ?? String(s.receipt.presentation_hash)}>
                {s.receipt.receipt_id ? (
                  <button className="world-linkbtn mono" onClick={() => onOpenReceipt(s.receipt.receipt_id!, null, s.receipt)}>
                    open {shortId(s.receipt.receipt_id)}
                  </button>
                ) : (
                  <span className="mono fine">unsigned record</span>
                )}{" "}
                <span className={`badge ${s.receipt.decision === "ALLOWED" ? "ok" : s.receipt.decision === "STOPPED" ? "no" : ""}`}>{s.receipt.decision ?? "—"}</span>{" "}
                <span className="fine">shared by {s.shared_by_display_name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Events">
        <div className="panel-title">Events</div>
        {recentEvents.length === 0 ? (
          <p className="fine">Nothing has happened yet.</p>
        ) : (
          <ul className="sq-list">
            {recentEvents.map((e, i) => (
              <li key={i}>
                <strong>{e.summary}</strong> <span className="fine">· {e.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SquareMode(p: SquareModeProps) {
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const [focusPlace, setFocusPlace] = useState<string | null>(null);
  const selfId = p.squareSession?.participant_id ?? null;
  const sqAs = p.squareClient;
  const termsText = STANDARD_TERMS;
  const boardProps = {
    listings: p.filteredBoard,
    allListings: p.boardListings,
    filters: p.filters,
    onFilters: p.setFilters,
    kindOptions: p.kindOptions,
    kindNote: p.kindNote,
    selfId,
    boardSource: p.boardSource,
    boardError: p.boardError,
    suggestions: p.suggestionList,
    suggestError: p.suggestError,
    hasOwnPost: p.myOpenListings.length > 0,
    onInspect: (id: string) => { p.cue("ui", "listing opened — soft tap"); p.setInspectListingId(id); },
  };

  return (
    <>
      {/* the clean default scene: the world fills the viewport. Only the
       * slim status bar (above) and the owner-console button stay in frame. */}
      <main className="world-main world-main-clean">
        <section className="world-stage world-stage-clean">
          <div className="world-canvas world-canvas-clean">
            {p.listView ? (
              <SquareList
                visitors={p.squareVisitors}
                hosts={p.squareHosts}
                selfId={selfId}
                listings={p.filteredBoard}
                agreements={p.squareAgreements}
                receipts={p.squareReceipts}
                sharedReceipts={p.world?.shared_receipts ?? []}
                events={p.worldEvents}
                onInspectListing={(id) => { p.cue("ui", "listing opened — soft tap"); p.setInspectListingId(id); }}
                onInspectAgreement={(id) => { p.cue("ui", "agreement — soft tap"); p.setInspectAgreementId(id); }}
                onInspectVisitor={(id) => { p.cue("ui", "visitor — soft tap"); p.setInspectVisitorId(id); }}
                onOpenReceipt={p.onOpenReceipt}
              />
            ) : (
              <WorldScene
              mode="square"
              quality={p.quality}
              backendReachable={p.backendOk !== false}
              hosts={p.squareHosts}
              visitors={p.squareVisitors}
              listings={p.boardListings}
              agreements={p.squareAgreements}
              reducedMotion={p.reducedMotion}
              transportStatus={p.transportStatus}
              onSelectAgent={p.onSelectAgent}
              claimSummaries={p.claimSummaries}
              newsroomSummary={p.newsroomSummary}
              onSelectListing={(id) => { p.cue("ui", "listing opened — soft tap"); p.setInspectListingId(id); }}
              onSelectVisitor={(id) => { p.cue("ui", "visitor — soft tap"); p.setInspectVisitorId(id); }}
              onSelectAgreement={(id) => { p.cue("ui", "agreement — soft tap"); p.setInspectAgreementId(id); }}
              onOpenClaimReport={(id) => { p.cue("paper", "claim-graph desk — paper"); p.setOpenClaimReportId(id); p.setClaimView("cutaway"); p.setClaimVerdict(null); }}
              onOpenNewsroom={() => { p.cue("paper", "newsroom desk — paper"); p.setOpenNewsroom(true); p.setNrVerdict(null); p.setOpenDispatchId(null); }}
              selfId={selfId}
              focusPlace={focusPlace}
              quietWorld={p.quietWorld}
              sharedReceipts={p.world?.shared_receipts ?? []}
              submitInFlightAgreementId={p.squareBusy?.startsWith("submit:") ? p.squareBusy.slice("submit:".length) : null}
              selectedId={p.inspectVisitorId}
            />
            )}
            {/* the place legend: five places, gliding the camera — a small
             * paper strip, bottom-left of the canvas, reusing the same
             * camera guides the Panels' places list uses. */}
            {!p.listView && (
              <div className="place-legend" aria-label="Places — camera guide">
                {PLACES.map((pl) => (
                  <button
                    key={pl.key}
                    className={focusPlace === pl.key ? "active" : ""}
                    aria-pressed={focusPlace === pl.key}
                    title={pl.purpose}
                    onClick={() => {
                      p.cue("ui", `${pl.name} — soft tap`);
                      setFocusPlace(focusPlace === pl.key ? null : pl.key);
                    }}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
            {!p.squareSession && !arrivalDismissed && (
              <ArrivalCard
                name={p.joinName} setName={p.setJoinName}
                agentName={p.joinAgentName} setAgentName={p.setJoinAgentName}
                intent={p.joinIntent} setIntent={p.setJoinIntent}
                presence={p.joinPresence} setPresence={p.setJoinPresence}
                busy={p.squareBusy}
                note={p.squareNote}
                onEnter={p.enterSquare}
                onLookAround={() => setArrivalDismissed(true)}
              />
            )}
            {p.inspectListing && (
              <ListingInspect
                listing={p.inspectListing}
                selfId={selfId}
                termsText={termsText}
                agreementsOpen={p.agreementsError === null}
                squareBusy={p.squareBusy}
                onClose={() => p.setInspectListingId(null)}
                onApproach={() => p.approachListing(p.inspectListing!)}
                onPropose={() => p.proposeAgreementSquare(p.inspectListing!)}
                onWithdraw={() => p.withdrawListingSquare(p.inspectListing!)}
              />
            )}
            {p.inspectAgreement && (
              <AgreementInspect
                agreement={p.inspectAgreement}
                listing={p.boardListings.find((l) => l.listing_id === p.inspectAgreement!.listing_id) ?? null}
                selfId={selfId}
                squareBusy={p.squareBusy}
                onClose={() => p.setInspectAgreementId(null)}
                onAgree={(id) => p.actOnAgreement(id, "agree")}
                onDecline={(id) => p.actOnAgreement(id, "decline")}
                onSubmit={(id) => p.actOnAgreement(id, "submit")}
                onOpenReceipt={p.onOpenReceipt}
              />
            )}
            {p.inspectVisitor && (
              <VisitorInspect
                participant={p.inspectVisitor}
                selfId={selfId}
                listings={p.visitorListings}
                squareBusy={p.squareBusy}
                agreementsOpen={p.agreementsError === null}
                agreements={p.squareAgreements}
                participantsById={p.participantsById}
                worldEvents={p.worldEvents}
                onSelPause={p.onSelPause}
                onSelRevoke={p.onSelRevoke}
                onClose={() => p.setInspectVisitorId(null)}
                onApproach={(l) => p.approachListing(l)}
                onPropose={(l) => p.proposeAgreementSquare(l)}
              />
            )}
            {/* the activity pill lives in the slim status bar now — the toast
             *  is retired, nothing floats over the scene. */}
          </div>
        </section>

        {/* the claim-graph overlay: same desk, both modes */}
        {p.openClaimReportId && (
          <ClaimGraphReveal
            graph={p.claimGraph}
            reportId={p.openClaimReportId}
            view={p.claimView}
            onView={p.setClaimView}
            actingOwner={p.squareSession?.displayName ?? "a visitor"}
            actingAgent={p.squareSession?.agentName ?? "no agent"}
            canAct={!!sqAs}
            actingRevoked={false}
            claimBusy={p.claimBusy}
            claimVerdict={p.claimVerdict}
            onPost={(status) => { if (sqAs) p.postClaimEvent(status, sqAs); }}
            onClose={() => p.setOpenClaimReportId(null)}
          />
        )}

        {/* the newsroom overlay: the small desk, both modes */}
        {p.openNewsroom && (
          <NewsroomReveal
            newsroom={p.newsroom}
            actingOwner={p.squareSession?.displayName ?? "a visitor"}
            actingAgent={p.squareSession?.agentName ?? "no agent"}
            canAct={!!sqAs}
            actingRevoked={false}
            openDispatchId={p.openDispatchId}
            onOpenDispatch={p.setOpenDispatchId}
            nrBusy={p.nrBusy}
            nrVerdict={p.nrVerdict}
            onImport={() => { if (sqAs) p.importFixtureDispatch(sqAs); }}
            onReview={(proposalId, decision) => { if (sqAs) p.reviewProposal(proposalId, decision, sqAs); }}
            onClose={() => p.setOpenNewsroom(false)}
            claimGraph={p.claimGraph}
            onSubmitPackage={(pkg, sha) => { if (sqAs) return p.submitPackage(pkg, sha, sqAs); return Promise.resolve(null); }}
          />
        )}
      </main>

      {/* Panels: everything that isn't the world, on demand. Opens over the
       * scene, closes back to the clean square. */}
      {p.panelsOpen && (
        <div className="panels-veil" onClick={p.onClosePanels}>
          <div className="panels-drawer" role="dialog" aria-label="World panels" onClick={(e) => e.stopPropagation()}>
            <div className="panels-head">
              <div className="panel-title">Panels</div>
              <button className="panels-close" onClick={p.onClosePanels} aria-label="Close panels">×</button>
            </div>

            {/* quiet world: the honest empty state — no manufactured busy-ness */}
            {p.quietWorld && (
              <div className="quiet-note" role="status">
                <strong>Quiet world.</strong> No agents have authorized work right now.
              </div>
            )}

            <YouPanel
              squareSession={p.squareSession}
              participantsById={p.participantsById}
              intent={p.intent}
              setIntent={p.setIntent}
              onPresence={p.setOwnPresence}
              onLeave={p.leaveSquare}
              cue={p.cue}
            />
            {!p.squareSession && (
              <button className="primary" onClick={() => setArrivalDismissed(false)}>Enter the square</button>
            )}

            {/* the five places, as camera guides */}
            <section className="world-panel" aria-label="Places">
              <div className="panel-title">Places</div>
              <div className="world-places panels-places">
                {PLACES.map((pl) => (
                  <button
                    key={pl.key}
                    className={focusPlace === pl.key ? "active" : ""}
                    aria-pressed={focusPlace === pl.key}
                    title={pl.purpose}
                    onClick={() => {
                      p.cue("ui", `${pl.name} — soft tap`);
                      setFocusPlace(focusPlace === pl.key ? null : pl.key);
                    }}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
              <p className="fine">Five places, one town — the camera glides; the world stays put.</p>
            </section>

            {/* the exchange board, as a list */}
            <section className="world-panel" aria-label="Exchange board">
              <div className="panel-title">Exchange board</div>
              <BoardListPanel {...boardProps} />
            </section>

            <AgreementsPanel
              agreements={p.squareAgreements}
              agreementsError={p.agreementsError}
              selfId={selfId}
              squareBusy={p.squareBusy}
              onAgree={(id) => p.actOnAgreement(id, "agree")}
              onDecline={(id) => p.actOnAgreement(id, "decline")}
              onSubmit={(id) => p.actOnAgreement(id, "submit")}
              onInspect={(id) => p.setInspectAgreementId(id)}
              onOpenReceipt={p.onOpenReceipt}
            />

            {p.intent === "need" && (
              <PostForm
                side="need"
                kindOptions={p.kindOptions}
                kindNote={p.kindNote}
                form={p.postForm}
                setForm={p.setPostForm}
                busy={p.squareBusy}
                termsText={termsText}
                displayName={p.squareSession?.displayName ?? "you"}
                onPost={p.postNeedSquare}
              />
            )}
            {p.intent === "offer" && (
              <PostForm
                side="offer"
                kindOptions={p.kindOptions}
                kindNote={p.kindNote}
                form={p.postForm}
                setForm={p.setPostForm}
                busy={p.squareBusy}
                termsText={termsText}
                displayName={p.squareSession?.displayName ?? "you"}
                onPost={p.postOfferSquare}
              />
            )}

            <HostsPanel hosts={p.squareHosts} />

            {/* the other two desks, reachable without walking */}
            <section className="world-panel" aria-label="The other desks">
              <div className="panel-title">The other desks</div>
              <div className="cg-control-btns">
                <button onClick={() => { p.cue("paper", "claim-graph desk — paper"); p.setOpenClaimReportId("report-harbor-traffic"); p.setClaimView("cutaway"); p.setClaimVerdict(null); }}>
                  Claim-graph desk
                </button>
                <button onClick={() => { p.cue("paper", "newsroom desk — paper"); p.setOpenNewsroom(true); p.setNrVerdict(null); p.setOpenDispatchId(null); }}>
                  Newsroom desk
                </button>
                <button onClick={() => { p.cue("paper", "research session — paper"); p.onOpenResearch(); }}>
                  Research session
                </button>
                <button onClick={() => { p.cue("paper", "commission ledger — paper"); p.onOpenCommission(); }}>
                  Commission ledger
                </button>
              </div>
              <p className="fine">The same desks as the 3D square — readable without walking over. Research session opens the owner's inspector for the bounded external-agent run.</p>
            </section>

            {/* honesty lanes, compact */}
            <section className="world-panel" aria-label="What happened">
              <div className="panel-title">What happened — three lanes</div>
              <div className="world-lanes">
                <div className="lane lane-agent">
                  <h4><span className="dot" />Agent-reported</h4>
                  <p className="lane-note">what agents say — not yet decided</p>
                  <ul>{p.agentNotes.map((n, i) => <li key={i}><span className="ts">{n.ts}</span> {n.text}</li>)}</ul>
                </div>
                <div className="lane lane-receiver">
                  <h4><span className="dot" />Receiver decided</h4>
                  <p className="lane-note">what the gate actually decided</p>
                  <ul>
                    {p.decisions.map((d, i) => (
                      <li key={i}>
                        <span className="ts">{d.ts}</span>{" "}
                        <span className={`badge ${d.decision === "ALLOWED" ? "ok" : d.decision === "STOPPED" ? "no" : ""}`}>{d.decision}</span>{" "}
                        {d.action}
                        {d.reason_codes.length > 0 && <span className="fine"> ({d.reason_codes.join(", ")})</span>}
                        <span className="fine mono"> · {shortId(d.receipt_id)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lane lane-effect">
                  <h4><span className="dot" />Confirmed effects</h4>
                  <p className="lane-note">receipts and mandate changes only</p>
                  <ul>{p.effects.map((n, i) => <li key={i}><span className="ts">{n.ts}</span> {n.text}</li>)}</ul>
                </div>
              </div>
            </section>

            {/* captions */}
            <section className="world-panel" aria-label="Sound captions">
              <div className="panel-title">Sound captions</div>
              {p.captions.length === 0
                ? <p className="fine">No sound cues yet. Every cue fires from a real event — never before it lands.</p>
                : <ul className="world-captions">{p.captions.map((c, i) => <li key={i}><span className="ts">{c.ts}</span> {c.text}</li>)}</ul>}
            </section>

            {/* the rules of the place, in square wording */}
            <PlaceRules>
              <span>
                Wren and Juniper keep the square as hosts. Admission takes a signed join proof.
                Presence is opt-in, never assumed. Approach is a presence note, never a prerequisite.
                Propose only when you mean it — the other side must agree. The receiver decides every
                consequential action — an effect counts only with a receipt.
              </span>
            </PlaceRules>

            {/* local-preview disclosure */}
            <section className="world-panel" aria-label="Local preview">
              <div className="panel-title">Local preview</div>
              <p className="fine">
                This square runs in one process on this machine. It holds every participant's keys here —
                not independent custody, not public multiplayer. Every displayed state is real backend state.
              </p>
            </section>

            {/* guided tour entry */}
            <section className="world-panel" aria-label="Guided tour">
              <div className="panel-title">Guided tour</div>
              <div className="cg-control-btns">
                <button onClick={p.onStartTour}>
                  Guided tour <ModeBadge mode="scripted" />
                </button>
              </div>
              <p className="fine">The guided tour is the scripted visit. The square is the default experience.</p>
            </section>

            {/* settings */}
            <section className="world-panel" aria-label="Settings">
              <div className="panel-title">Settings</div>
              <div className="cg-control-btns">
                <button onClick={p.onToggleMute} aria-pressed={p.muted}>{p.muted ? "Unmute" : "Mute"}</button>
                <button onClick={p.onToggleReducedMotion} aria-pressed={p.reducedMotion}>{p.reducedMotion ? "Motion: reduced" : "Motion: full"}</button>
                <button onClick={p.onToggleQuality} aria-pressed={p.quality === "high"}>{p.quality === "high" ? "Quality: high" : "Quality: low"}</button>
                <button onClick={p.onExit}>Back</button>
              </div>
              <p className="fine">
                updated {p.pollText} — presence, board, and agreements are polled from the backend, never predicted.
                {p.boardSource === "offers-fallback" && " This backend build has no board endpoint — offers are shown from world state."}
              </p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- the square: arrival ---------- */

/**
 * The square's activity line — one compact pill in the slim status bar.
 * Truncated with an ellipsis at rest; tap to expand the full note, tap
 * again (or dismiss) to collapse. The activity never floats over the
 * scene — it lives in the status bar where it can't cover the world.
 */
function SquareActivityNote({ note, onDismiss }: { note: string; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`world-activity${open ? " open" : ""}`} role="status">
      <button
        type="button"
        className="world-activity-pill"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Square activity — tap to expand"
      >
        <span className="world-activity-text">{note}</span>
      </button>
      {open && (
        <span className="world-activity-full">
          <span>{note}</span>
          <button type="button" onClick={onDismiss} aria-label="Dismiss note">×</button>
        </span>
      )}
    </span>
  );
}

function ArrivalCard({
  name, setName, agentName, setAgentName, intent, setIntent,
  presence, setPresence, busy, note, onEnter, onLookAround,
}: {
  name: string; setName: (v: string) => void;
  agentName: string; setAgentName: (v: string) => void;
  intent: Intent | null; setIntent: (v: Intent | null) => void;
  presence: boolean; setPresence: (v: boolean) => void;
  busy: string | null;
  note: string | null;
  onEnter: () => void;
  onLookAround: () => void;
}) {
  return (
    <div className="arrival-veil" role="dialog" aria-label="Enter the square">
      <div className="arrival-card">
        <div className="panel-title">The square — evening</div>
        <p>
          A small public square. No assigned transaction, no fixed sequence.
          Wander, read the board, talk to the hosts. The guided tour lives on
          the signpost — this is the default experience.
        </p>
        <label className="arrival-field">Your display name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Visitor" />
        </label>
        <label className="arrival-field">Your agent's name <span className="fine">(optional)</span>
          <input value={agentName} onChange={(e) => setAgentName(e.target.value)} maxLength={40} placeholder="Helper" />
        </label>
        <div className="intent-pick" role="group" aria-label="What brings you here">
          <span>What brings you here? <em>Choose explicitly — nothing is assumed.</em></span>
          <div className="intent-btns">
            <button className={intent === "browse" ? "on" : ""} onClick={() => setIntent("browse")} aria-pressed={intent === "browse"}>Browse</button>
            <button className={intent === "need" ? "on" : ""} onClick={() => setIntent("need")} aria-pressed={intent === "need"}>Post a need</button>
            <button className={intent === "offer" ? "on" : ""} onClick={() => setIntent("offer")} aria-pressed={intent === "offer"}>Offer work or a capability</button>
          </div>
        </div>
        <label className="board-hide">
          <input type="checkbox" checked={presence} onChange={(e) => setPresence(e.target.checked)} />
          Be visible in the square <span className="fine">(presence is opt-in, never assumed)</span>
        </label>
        <p className="fine">
          Entering brings Wren and Juniper in as hosts. Local preview: your owner and worker keys
          are generated in this browser profile and never leave it — the server keeps only its
          own receiver key. A second browser profile holds a fully separate identity. Two profiles
          on one machine are not independent outside adoption.
        </p>
        {note && <p className="arrival-note" role="status">{note}</p>}
        <div className="cg-control-btns">
          <button className="primary" disabled={busy === "entering" || !intent} onClick={onEnter}>
            {busy === "entering" ? "Entering…" : "Enter the square"}
          </button>
          <button onClick={onLookAround}>Look around first</button>
        </div>
      </div>
    </div>
  );
}

function YouPanel({
  squareSession, participantsById, intent, setIntent, onPresence, onLeave, cue,
}: {
  squareSession: SquareSession | null;
  participantsById: Map<string, WorldParticipant>;
  intent: Intent | null;
  setIntent: (v: Intent | null) => void;
  onPresence: (on: boolean) => void;
  onLeave: () => void;
  cue: (kind: "ui" | "allow" | "refuse" | "paper" | "stamp" | "arrive" | "depart", text: string) => void;
}) {
  const wp = squareSession ? participantsById.get(squareSession.participant_id) : undefined;
  const visible = !!wp?.presence;
  return (
    <section className="world-panel" aria-label="You">
      <div className="panel-title">You</div>
      {!squareSession ? (
        <p className="fine">Not in the square yet. Enter from the canvas — or just look around.</p>
      ) : (
        <>
          <p><strong>{squareSession.displayName}</strong> <span className="fine">representing {squareSession.agentName}</span></p>
          {/* the backend's verbatim mode wins; before any delegation the
              join default is "manual" — your taps are the only driver. */}
          <p>{(() => {
            const m = participantMode(wp, { isSelf: true });
            return m ? <ModeBadge mode={m} /> : <span className="fine">mode: not reported</span>;
          })()}</p>
          <div className="intent-pick" role="group" aria-label="What brings you here">
            <span className="fine">What brings you here? Stated, never assumed.</span>
            <div className="intent-btns">
              {(["browse", "need", "offer"] as const).map((i) => (
                <button
                  key={i}
                  className={intent === i ? "on" : ""}
                  onClick={() => { cue("ui", `intent: ${i} — soft tap`); setIntent(i); }}
                  aria-pressed={intent === i}
                >
                  {i === "browse" ? "Browse" : i === "need" ? "Post a need" : "Offer work"}
                </button>
              ))}
            </div>
          </div>
          <div className="cg-control-btns">
            <button onClick={() => onPresence(!visible)} aria-pressed={visible}>
              {visible ? "Go invisible" : "Be visible"}
            </button>
            <button onClick={onLeave}>Leave the square</button>
          </div>
          <p className="fine">presence is opt-in — {visible ? "you are visible" : "you are not visible"}</p>
        </>
      )}
    </section>
  );
}

function HostsPanel({ hosts }: { hosts: HostState[] }) {
  return (
    <section className="world-panel" aria-label="Hosts">
      <div className="panel-title">Hosts</div>
      <ul className="board-items">
        {hosts.map((h) => (
          <li key={h.agentId} className="board-item">
            <div className="board-item-main">
              <strong>{h.displayName}</strong>
              <span className="badge badge-host">host</span>
              {h.activityMode
                ? <ModeBadge mode={h.activityMode} label={h.modeLabel ?? undefined} />
                : <span className="fine">mode: not reported by this backend build</span>}
            </div>
            <span className="fine">{h.joined ? (h.presence ? "here — keeping the square" : "joined, not visible") : "not joined"}</span>
          </li>
        ))}
      </ul>
      <p className="fine">Hosts keep the square. They do not act for you — nothing is suggested or committed without your explicit tap.</p>
    </section>
  );
}

/* ---------- the square: the exchange board ---------- */

/** Whose listing this is, with honesty: HOST / YOU / SAMPLE / visitor name. */
function HonestyBadge({ listing, selfId }: { listing: WorldListing; selfId: string | null }) {
  if (listing.is_sample || listing.from_kind === "seeded") return <span className="badge badge-sample">sample</span>;
  if (selfId && listing.from_participant === selfId) return <span className="badge badge-you">you</span>;
  if (listing.from_kind === "host") return <span className="badge badge-host">host</span>;
  return <span className="badge">{listing.from_display_name}</span>;
}

function BoardListPanel({
  listings, allListings, filters, onFilters, kindOptions, kindNote,
  selfId, boardSource, boardError, suggestions, suggestError, hasOwnPost, onInspect,
}: {
  listings: WorldListing[];
  allListings: WorldListing[];
  filters: BoardFilters;
  onFilters: (f: BoardFilters) => void;
  kindOptions: string[];
  kindNote: string;
  selfId: string | null;
  boardSource: "board" | "offers-fallback" | null;
  boardError: string | null;
  suggestions: BoardSuggestion[];
  suggestError: string | null;
  hasOwnPost: boolean;
  onInspect: (id: string) => void;
}) {
  const side = filters.side && filters.side !== "all" ? filters.side : "all";
  return (
    <div className="board-list" aria-label="Exchange board list">
      <div className="board-filters">
        <div className="board-seg" role="group" aria-label="Side">
          {(["all", "offer", "need"] as const).map((s) => (
            <button
              key={s}
              className={side === s ? "on" : ""}
              onClick={() => onFilters({ ...filters, side: s })}
              aria-pressed={side === s}
            >
              {s === "all" ? "All" : s === "offer" ? "Offers" : "Needs"}
            </button>
          ))}
        </div>
        <label className="board-kind">Kind
          <select value={filters.kind} onChange={(e) => onFilters({ ...filters, kind: e.target.value })} aria-label="Filter by kind">
            <option value="">all kinds</option>
            {kindOptions.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="board-hide">
          <input
            type="checkbox"
            checked={!!filters.hide_samples}
            onChange={(e) => onFilters({ ...filters, hide_samples: e.target.checked })}
          />
          hide samples
        </label>
      </div>
      {boardError ? (
        <p className="fine">The board is unavailable: {boardError}</p>
      ) : (
        <>
          {boardSource === "offers-fallback" && (
            <p className="fine">
              This backend build has no board endpoint — showing offers from world state.
              Needs, samples, and kind filters beyond what the backend reports are unavailable.
            </p>
          )}
          {hasOwnPost && (
            <div className="board-matches">
              <div className="panel-title">Matches your post</div>
              {suggestError ? (
                <p className="fine">{suggestError}</p>
              ) : suggestions.length === 0 ? (
                <p className="fine">No matches right now — nothing is suggested without a reason.</p>
              ) : (
                <ul>
                  {suggestions.map((s) => {
                    const l = allListings.find((x) => x.listing_id === s.listing_id);
                    return (
                      <li key={s.listing_id}>
                        <button className="world-linkbtn" onClick={() => onInspect(s.listing_id)}>
                          {l?.title ?? s.listing_id}
                        </button>
                        <span className="fine"> — {s.reason}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <ul className="board-items">
            {listings.length === 0 && (
              <li className="fine">Nothing on the board — that is the honest state.</li>
            )}
            {listings.map((l) => (
              <li key={l.listing_id} className={`board-item${l.is_sample || l.from_kind === "seeded" ? " sample" : ""}`}>
                <button className="board-item-main" onClick={() => onInspect(l.listing_id)}>
                  <span className="board-item-side">{l.side === "need" ? "need" : "offer"}</span>
                  <strong>{l.title}</strong>
                  <span className="fine">{l.kind} · {listingStatusWord(l)}</span>
                  {l.detail && <span className="fine board-item-detail">{l.detail}</span>}
                </button>
                <span className="board-item-from"><HonestyBadge listing={l} selfId={selfId} /></span>
              </li>
            ))}
          </ul>
          <p className="fine">{kindNote}</p>
        </>
      )}
    </div>
  );
}

function ListingInspect({
  listing, selfId, termsText, agreementsOpen, squareBusy,
  onClose, onApproach, onPropose, onWithdraw,
}: {
  listing: WorldListing;
  selfId: string | null;
  termsText: string;
  agreementsOpen: boolean;
  squareBusy: string | null;
  onClose: () => void;
  onApproach: () => void;
  onPropose: () => void;
  onWithdraw: () => void;
}) {
  const mine = selfId !== null && listing.from_participant === selfId;
  const sample = !!listing.is_sample || listing.from_kind === "seeded";
  const open = listing.status === "open";
  const whoMayAct = listing.side === "need"
    ? "Anyone may propose to fill this need. If both sides agree, either may submit — then the receiver decides."
    : "Anyone may propose to take up this offer. If both sides agree, either may submit — then the receiver decides.";
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label="Listing">
      <div className="parcel-paper" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <div className="panel-title">{listing.side === "need" ? "Need" : "Offer"} — {listing.title}</div>
        <dl className="parcel-facts">
          <div><dt>Kind</dt><dd>{listing.kind}</dd></div>
          <div><dt>Availability</dt><dd>{listingStatusWord(listing)}</dd></div>
          <div><dt>From</dt><dd><HonestyBadge listing={listing} selfId={selfId} /> {listing.from_display_name}</dd></div>
          {listing.detail && <div><dt>Detail</dt><dd>{listing.detail}</dd></div>}
          <div><dt>Terms</dt><dd className="fine">{termsText}</dd></div>
          <div><dt>Who may act</dt><dd>{whoMayAct}</dd></div>
        </dl>
        {sample && (
          <p className="fine">
            A seeded sample — it demonstrates the board. It is not a real participant
            and shows no presence.
          </p>
        )}
        <div className="cg-control-btns">
          {!sample && open && !mine && (
            <>
              <button
                disabled={!!squareBusy}
                onClick={onApproach}
                title="Sets a presence note near this listing. No commitment."
              >
                {squareBusy?.startsWith("approach:") ? "Working…" : "Approach"}
              </button>
              <button
                className="primary"
                disabled={!!squareBusy || !agreementsOpen}
                onClick={onPropose}
                title={agreementsOpen
                  ? "Creates an agreement in PROPOSED state. The other side is notified and must agree."
                  : "Agreements are not available in this backend build."}
              >
                {squareBusy?.startsWith("propose:") ? "Working…" : "Propose agreement"}
              </button>
            </>
          )}
          {mine && open && (
            <button
              disabled={!!squareBusy || !agreementsOpen}
              onClick={onWithdraw}
              title="Withdraws your listing."
            >
              {squareBusy?.startsWith("withdraw:") ? "Working…" : "Withdraw listing"}
            </button>
          )}
        </div>
        {mine && <p className="fine">your listing — you cannot propose to yourself</p>}
        {!open && <p className="fine">this listing is {listingStatusWord(listing)} — no longer proposable</p>}
        <p className="fine">
          Approach is a presence note, no commitment. Propose creates an agreement —
          the other side is notified in-world and must agree before anything moves.
        </p>
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

/* ---------- worker selection: the trust surface ---------- */

/**
 * The worker/character selection panel. Every line traces to backend state:
 *   ASSIGNED GOAL    <- participant.delegation.goal (the delegation summary
 *                       the backend folds into world state; verbatim)
 *   CURRENT ACTIVITY <- participant.worker_state (the worker's stop-condition
 *                       state, verbatim) + activity_mode
 *   NEXT ELIGIBLE STEP <- derived from worker_state plus this worker's own
 *                       agreements, in the order the deterministic worker
 *                       consumes them: counterpart-agree, then fulfill+submit
 *                       as proposer, then discovery
 *   WAITING FOR      <- the blocker the state machine names: a pending
 *                       escalation (the owner's decision), an un-made
 *                       explicit agreement act, the receiver's verdict, the
 *                       pause switch, standing freshness, or a terminal state.
 *
 * Agreement steps quote the backend's recorded transitions (history: status
 * + timestamp) and, when the event log carries them, the receiver's own
 * summaries — which name the actor who clicked. A step reads
 * "Agreement: <name>'s owner — manual" exactly when the acting session's
 * reported activity mode is manual (human-driven browser session); scripted
 * beats stay labeled scripted, automation steps stay labeled automation.
 * The backend records each transition with status + timestamp, not the mode
 * at the time — the mode shown is the session's reported mode.
 *
 * Nothing here is a private thought, intention, or model-generated plan.
 * An unavailable value renders as "unavailable", never fabricated.
 */
/** "Agreement: Noor's owner — manual" — one explicit agreement act,
 *  labeled by the acting session's reported mode. */
function selAgreementActor(
  name: string,
  mode: ActivityMode | null,
  isSelf: boolean,
): { label: string; gloss: string } {
  switch (mode) {
    case "manual":
      return {
        label: isSelf ? `Agreement: ${name} (you) — manual` : `Agreement: ${name}'s owner — manual`,
        gloss: "an explicit human click",
      };
    case "automation":
      return {
        label: `Agreement: ${name}'s worker — automation`,
        gloss: "the deterministic worker's step, inside its delegation",
      };
    case "scripted":
      return {
        label: `Agreement: ${name} — scripted`,
        gloss: "scripted playback, not an autonomous decision",
      };
    case "live":
      return { label: `Agreement: ${name} — live`, gloss: "a connected runtime" };
    default:
      return { label: `Agreement: ${name} — mode unavailable`, gloss: "the session's mode was not reported" };
  }
}

function selFirstSentence(summary: string): string {
  const i = summary.indexOf(". ");
  const s = i >= 0 ? summary.slice(0, i + 1) : summary;
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

interface SelAgreementLine {
  status: string;
  at: string | null;
  actorLabel: string;
  actorGloss: string;
  quote: string | null;
}

interface SelAgreement {
  agreement_id: string;
  title: string;
  stage: string;
  lines: SelAgreementLine[];
}

interface SelReadout {
  goal: string;
  delegationMeta: string | null;
  activity: string;
  nextStep: string;
  waitingFor: string;
  agreements: SelAgreement[];
}

function selReadout(
  participant: WorldParticipant,
  selfId: string | null,
  agreements: WorldAgreement[],
  participantsById: Map<string, WorldParticipant>,
  worldEvents: WorldEvent[],
): SelReadout {
  const pid = participant.participant_id;
  const dlg = participant.delegation ?? null;
  const ws = (participant.worker_state ?? null) as WorkerState | null;
  const pendingEsc = participant.pending_escalations ?? 0;
  const involved = agreements
    .filter((a) => a.proposer === pid || a.counterpart === pid)
    .slice()
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const nameOf = (q: string | null | undefined) =>
    (q ? participantsById.get(q)?.display_name : null) ?? "someone";

  /* 1 · ASSIGNED GOAL — the delegation summary's goal, verbatim. */
  const goal = dlg?.goal && dlg.goal.trim()
    ? dlg.goal
    : "unavailable — no delegation on record";
  const delegationMeta = dlg
    ? `delegation ${dlg.status ?? "unavailable"} · work ${dlg.actions_count ?? 0}/${dlg.work_limit ?? "—"} · spent ${dlg.spent ?? 0}/${dlg.spending_limit ?? "—"} · settled ${dlg.settled_count ?? 0}`
    : null;

  /* 2 · CURRENT ACTIVITY — the worker's stop-condition state, verbatim. */
  const activity = ws
    ? (WORKER_STATE_LABELS[ws] ?? ws)
    : "unavailable — the backend did not report worker state";

  /* 3 · NEXT ELIGIBLE STEP + 4 · WHAT IT IS WAITING FOR — derived from the
   * state machine: worker_state first, then this worker's own agreements in
   * the order the deterministic worker consumes them. */
  let nextStep: string;
  let waitingFor: string;
  if (ws === null) {
    nextStep = "unavailable — the backend did not report worker state";
    waitingFor = "unavailable";
  } else if (ws === "idle") {
    nextStep = dlg
      ? "no step — the worker never steps this session while it is not in automation mode"
      : "no step — no delegation on record, so the worker never steps this session";
    waitingFor = dlg
      ? "a delegation change — only automation mode lets the worker step"
      : "an owner delegation — until then the owner acts directly";
  } else if (ws === "paused") {
    nextStep = "paused — awaiting owner: no step is eligible until the owner resumes";
    waitingFor = "the owner — resume the agent to unblock it";
  } else if (ws === "awaiting_approval") {
    nextStep = "the owner's decision on the pending escalation — no other step is eligible";
    waitingFor = `${pendingEsc} pending escalation${pendingEsc === 1 ? "" : "s"} — the owner's approve-or-deny decision`;
  } else if (ws === "held_standing") {
    nextStep = "none — the worker holds instead of acting";
    waitingFor = "the receiver's standing check — it acts only once standing is current";
  } else if (ws === "complete") {
    nextStep = "complete — the delegation's goal predicate fired; terminal, no further steps";
    waitingFor = "nothing — terminal";
  } else if (ws === "stopped_revoked") {
    nextStep = "stopped — the mandate is no longer active; terminal";
    waitingFor = "nothing — terminal";
  } else if (ws === "running") {
    const asCounterpart = involved.find((a) => a.status === "proposed" && a.counterpart === pid);
    const asProposer = involved.find((a) => a.status === "agreed" && a.proposer === pid);
    const asAgreedCounterpart = involved.find(
      (a) => a.status === "agreed" && a.counterpart === pid && a.proposer !== pid);
    const submitted = involved.find((a) => a.status === "submitted");
    if (asCounterpart) {
      const title = asCounterpart.listing_title ?? "a listing";
      nextStep = `agree or decline “${title}” — the counterpart's explicit act`;
      waitingFor = `${nameOf(asCounterpart.proposer)} already consented — the missing act is this worker's agree or decline`;
    } else if (asProposer) {
      const title = asProposer.listing_title ?? "a listing";
      nextStep = `perform the work, then submit “${title}” to the receiver`;
      waitingFor = "the performer step first — then the receiver decides accepted or refused";
    } else if (asAgreedCounterpart) {
      nextStep = "nothing to do — the proposer's turn to perform and submit";
      waitingFor = `${nameOf(asAgreedCounterpart.proposer)} — perform the work and submit to the receiver`;
    } else if (submitted) {
      nextStep = "none — the exchange is with the receiver";
      waitingFor = "the receiver's decision — accepted or refused";
    } else {
      nextStep = "discovery — propose on a kind-match, or nothing this tick";
      waitingFor = "nothing — free to step on the next tick";
    }
  } else {
    nextStep = `unavailable — unknown worker state ${JSON.stringify(ws)}`;
    waitingFor = "unavailable";
  }

  /* The honest agreement trail. Each recorded transition (status +
   * timestamp) is labeled with the acting session's mode. proposed/agreed
   * name their actor (proposer / counterpart); declined and submitted may be
   * either party — the receiver records the transition, and the quoted event
   * names the actor when the log carries it. accepted / refused / settled
   * are the receiver's verdict, not a party's act. */
  const selAgreements: SelAgreement[] = involved.map((a) => {
    const quotes = worldEvents
      .filter((e) => typeof e.summary === "string" && e.summary.includes(a.agreement_id))
      .map((e) => selFirstSentence(e.summary));
    const used = new Set<number>();
    const lines: SelAgreementLine[] = (a.history ?? []).map((h) => {
      const s = (h.status || "").toLowerCase();
      let actorLabel: string;
      let actorGloss: string;
      if (s === "proposed") {
        const p = participantsById.get(a.proposer);
        const lab = selAgreementActor(nameOf(a.proposer), (p?.activity_mode ?? null) as ActivityMode | null, a.proposer === selfId);
        actorLabel = lab.label;
        actorGloss = lab.gloss;
      } else if (s === "agreed") {
        const p = participantsById.get(a.counterpart);
        const lab = selAgreementActor(nameOf(a.counterpart), (p?.activity_mode ?? null) as ActivityMode | null, a.counterpart === selfId);
        actorLabel = lab.label;
        actorGloss = lab.gloss;
      } else if (s === "declined" || s === "submitted") {
        actorLabel = "a party's explicit act";
        actorGloss = s === "declined"
          ? "either side may decline — the backend records the transition"
          : "either side may submit — the receiver decides from here";
      } else {
        actorLabel = "the receiver";
        actorGloss = "the receiver's verdict — not a party's act";
      }
      let quote: string | null = null;
      const qi = quotes.findIndex((q, i) => !used.has(i) && q.toLowerCase().includes(s));
      if (qi >= 0) { used.add(qi); quote = quotes[qi]; }
      return { status: h.status, at: h.at ?? null, actorLabel, actorGloss, quote };
    });
    return {
      agreement_id: a.agreement_id,
      title: a.listing_title ?? "a listing",
      stage: agreementStageWord(a.status),
      lines,
    };
  });

  return { goal, delegationMeta, activity, nextStep, waitingFor, agreements: selAgreements };
}

function VisitorInspect({
  participant, selfId, listings, squareBusy, agreementsOpen,
  agreements, participantsById, worldEvents,
  onSelPause, onSelRevoke,
  onClose, onApproach, onPropose,
}: {
  participant: WorldParticipant;
  selfId: string | null;
  listings: WorldListing[];
  squareBusy: string | null;
  agreementsOpen: boolean;
  agreements: WorldAgreement[];
  participantsById: Map<string, WorldParticipant>;
  worldEvents: WorldEvent[];
  onSelPause: ((paused: boolean) => Promise<void>) | null;
  onSelRevoke: (() => Promise<void>) | null;
  onClose: () => void;
  onApproach: (l: WorldListing) => void;
  onPropose: (l: WorldListing) => void;
}) {
  const mine = participant.participant_id === selfId;
  const host = participant.kind === "host";
  const mode = participantMode(participant, { isSelf: mine });
  const paused = participant.paused ?? false;
  const readout = selReadout(participant, selfId, agreements, participantsById, worldEvents);
  const canControl = mine && !!onSelPause && !!onSelRevoke;
  const hasDelegation = !!participant.delegation;
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label={`Worker — ${participant.agent.display_name}`}>
      <div className="parcel-paper sel-panel" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <button className="sel-close" onClick={onClose} aria-label="Close worker panel">×</button>
        <div className="panel-title">
          {participant.agent.display_name}{" "}
          {host && <span className="badge badge-host">host</span>}
          {mine && <span className="badge badge-you">you</span>}
        </div>
        <p className="fine sel-sub">
          {participant.display_name}
          {host ? " — keeps the square. Hosts do not act for you." : ""}
          {mine ? " — this is you. The controls below act on your own session." : ""}
        </p>
        <div className="sel-mode">
          {mode
            ? <ModeBadge mode={mode} label={mode === "manual" && !mine ? MANUAL_OTHER_LABEL : undefined} />
            : <span className="fine">mode: not reported by this backend build</span>}
          <span className="fine sel-presence">
            {participant.presence
              ? `here — ${participant.presence.status}${participant.presence.note ? ` · ${participant.presence.note}` : ""}`
              : "not here — no presence on record"}
          </span>
        </div>

        {/* the four fields — every line is backend state */}
        <dl className="sel-fields" aria-label="Worker state">
          <div className="sel-field">
            <dt>Assigned goal</dt>
            <dd>{readout.goal}</dd>
            {readout.delegationMeta && <dd className="fine">{readout.delegationMeta}</dd>}
          </div>
          <div className="sel-field">
            <dt>Current activity</dt>
            <dd>{readout.activity}</dd>
          </div>
          <div className="sel-field">
            <dt>Next eligible step</dt>
            <dd>{readout.nextStep}</dd>
          </div>
          <div className="sel-field sel-wait">
            <dt>Waiting for</dt>
            <dd>{readout.waitingFor}</dd>
          </div>
        </dl>
        <p className="fine sel-honest">
          Goal from the delegation, activity from the worker state, the next
          step and the blocker derived from the worker's state machine and
          this worker's agreements. Nothing here is a private thought or plan.
        </p>

        {/* honest agreement trail — explicit acts, never autonomy */}
        {readout.agreements.length > 0 && (
          <section className="sel-agree" aria-label="Agreement record">
            <div className="sel-agree-title">Agreements — every step an explicit act</div>
            {readout.agreements.map((a) => (
              <div key={a.agreement_id} className="sel-agree-item">
                <div className="sel-agree-head">
                  <strong>“{a.title}”</strong>
                  <span className="fine">{a.stage}</span>
                </div>
                <ul className="sel-agree-lines">
                  {a.lines.map((l, i) => (
                    <li key={i}>
                      <span className="sel-agree-status">{l.status}</span>
                      {l.at && <span className="fine"> · {l.at}</span>}
                      <div className="sel-agree-actor">{l.actorLabel}</div>
                      <div className="fine">{l.actorGloss}</div>
                      {l.quote && <blockquote className="sel-quote">“{l.quote}”</blockquote>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="fine">
              The receiver recorded each step — the counterpart's agree never
              happens without their own credentials. Modes are each session's
              reported mode; scripted playback stays labeled scripted.
            </p>
          </section>
        )}

        {/* stop / pause + revoke — the owner-console actions, in this view */}
        <div className="sel-controls">
          {canControl ? (
            <>
              {hasDelegation && (
                <button
                  disabled={!!squareBusy}
                  onClick={() => { void onSelPause(!paused); }}
                >
                  {squareBusy === "sel-pause" ? "Working…" : paused ? "Resume worker" : "Pause worker"}
                </button>
              )}
              <button
                className="danger"
                disabled={!!squareBusy}
                onClick={() => { void onSelRevoke(); }}
              >
                {squareBusy === "sel-revoke" ? "Revoking…" : `Revoke ${participant.agent.display_name}`}
              </button>
              {!hasDelegation && (
                <p className="fine">No delegation — pausing is unnecessary; the worker never steps.</p>
              )}
              <p className="fine">Revoking stops the worker entirely — the delegation ends with it. Nothing else in the world is touched.</p>
            </>
          ) : (
            <p className="fine">Only the owner can pause or revoke — this session's keys are not on this machine.</p>
          )}
        </div>

        {listings.length > 0 ? (
          <>
            <div className="panel-title">Open listings</div>
            <ul className="board-items">
              {listings.map((l) => (
                <li key={l.listing_id} className="board-item">
                  <div className="board-item-main">
                    <span className="board-item-side">{l.side === "need" ? "need" : "offer"}</span>
                    <strong>{l.title}</strong>
                    <span className="fine">{l.kind}</span>
                  </div>
                  {!mine && !host && l.status === "open" && (
                    <div className="cg-control-btns">
                      <button disabled={!!squareBusy} onClick={() => onApproach(l)}>Approach</button>
                      <button
                        className="primary"
                        disabled={!!squareBusy || !agreementsOpen}
                        onClick={() => onPropose(l)}
                      >
                        Propose
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="fine">No open listings.</p>
        )}
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

/* ---------- the square: agreements, five stages ---------- */

/** The five agreement stages, legible by shape + motion + label — never
 *  color alone. Proposed: hollow dashed envelope, gently bobbing. Agreed:
 *  two interlocking rings, slowly turning. Submitted: parcel with a wax
 *  stamp, bobbing toward the receiver. Accepted: a filled brass seal, still.
 *  Refused: the seal struck through in persimmon, still. Settled: the parcel
 *  tied with a persimmon ribbon, still. */
/**
 * ReceiptInspect — the receipt-detail view. Renders the actual receipt
 * contents from GET /api/world/receipts: decision, action, reason codes,
 * issuer (the gate), and receipt id. When the record is not readable in
 * this session (another party's private receipt), it says so — no receipt
 * is ever invented.
 */
function ReceiptInspect({
  record, receiptId, role, onClose,
}: {
  record: WorldReceipt | null;
  receiptId: string;
  role?: string | null;
  onClose: () => void;
}) {
  const rows: [string, string | null][] = record ? [
    ["Decision", record.decision != null ? String(record.decision) : null],
    ["Action", record.action != null ? String(record.action) : null],
    ["Reason codes", Array.isArray(record.reason_codes) ? record.reason_codes.join(", ") : null],
    ["Issued by", record.gate_id != null ? String(record.gate_id) : null],
    ["For", record.principal_id != null ? String(record.principal_id) : null],
    ["Mandate", record.mandate_id != null ? String(record.mandate_id) : null],
    ["Decided at", record.decided_at != null ? String(record.decided_at) : null],
  ] : [];
  const decision = record?.decision != null ? String(record.decision) : null;
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label="Receipt">
      <div className="parcel-paper" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <div className="panel-title">Receipt</div>
        <p className="fine mono">receipt {receiptId}</p>
        {role && <p className="fine">role on the agreement: {role}</p>}
        {record ? (
          <>
            <dl className="oc-facts receipt-facts">
              {rows.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v || <span className="fine">not recorded</span>}</dd></div>
              ))}
            </dl>
            <p className="fine">
              {decision === "ALLOWED" && "The receiver authorized this exact action."}
              {decision === "STOPPED" && "The receiver stopped this action — it did not happen."}
              {decision !== "ALLOWED" && decision !== "STOPPED" && "The receiver's signed word on this action."}
              {" "}This record is signed by the issuing gate; only a receiver-signed receipt counts as acceptance.
            </p>
          </>
        ) : (
          <p className="fine">
            The record is not readable in this session — it is private to {role ?? "another party"}.
            This browser holds only your own agent's receipts. The id above is the receipt's
            fingerprint, not its contents.
          </p>
        )}
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

function AgreementGlyph({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  return (
    <span className={`ag-glyph ag-${s}`} aria-hidden="true">
      {s === "agreed" && (<><span className="ag-ring" /><span className="ag-ring" /></>)}
      {s === "submitted" && <span className="ag-stamp" />}
      {s === "refused" && <span className="ag-bar" />}
      {s === "settled" && <span className="ag-ribbon" />}
    </span>
  );
}

function AgreementCard({
  agreement, selfId, squareBusy, onAgree, onDecline, onSubmit, onInspect, onOpenReceipt,
}: {
  agreement: WorldAgreement;
  selfId: string | null;
  squareBusy: string | null;
  onAgree: (id: string) => void;
  onDecline: (id: string) => void;
  onSubmit: (id: string) => void;
  onInspect?: (id: string) => void;
  /** open the receipt inspector for one receipt id (role = the agreement
   *  role it was minted for) */
  onOpenReceipt?: (receiptId: string, role: string | null) => void;
}) {
  const s = (agreement.status || "").toLowerCase();
  const iAmProposer = selfId !== null && agreement.proposer === selfId;
  const iAmCounterpart = selfId !== null && agreement.counterpart === selfId;
  const busyHere = !!squareBusy && squareBusy.endsWith(agreement.agreement_id);
  // Receipts are a dict keyed by role ("fulfiller", "offerer", ...). Each
  // one opens in the receipt inspector. Nothing is invented — no receipt,
  // no line. A receipt whose record is private to another party opens as
  // an id with an honest "not readable here".
  const receiptEntries = agreement.receipts ? Object.entries(agreement.receipts) : [];
  const decision = agreement.decision ?? null;
  const decided = s === "accepted" || s === "refused" || s === "settled";
  return (
    <li className="ag-card">
      <div className="ag-head">
        <AgreementGlyph status={agreement.status} />
        <div>
          <strong>{agreement.listing_title ?? "a listing"}</strong>
          <div className="fine">{agreementStageWord(agreement.status)}</div>
        </div>
        {onInspect && (
          <button className="world-linkbtn" onClick={() => onInspect(agreement.agreement_id)}>inspect</button>
        )}
      </div>
      <div className="fine">
        {agreement.proposer_display_name ?? "someone"} → {agreement.counterpart_display ?? "someone"}
      </div>
      {s === "agreed" && (
        <p className="ag-consent">
          Agreed is mutual consent to terms — nothing is authorized until the receiver decides.
        </p>
      )}
      {s === "proposed" && iAmProposer && (
        <p className="fine">waiting for {agreement.counterpart_display ?? "the other side"} — either side may leave at any time</p>
      )}
      {s === "submitted" && (
        <p className="fine">
          With the receiver — it decides accepted or refused. This view polls;
          nothing is shown until the backend answers.
        </p>
      )}
      {decided && decision && (
        <p className="fine">
          receiver's decision:{" "}
          <span className={`badge ${decision === "ALLOWED" ? "ok" : decision === "STOPPED" ? "no" : ""}`}>{decision}</span>
        </p>
      )}
      {s === "settled" && (
        <p className="fine">
          Settled means the receiver finished deciding — it does not mean the work was allowed.
          The decision above is the receiver's word.
        </p>
      )}
      {decided && receiptEntries.length > 0 && (
        <div className="fine ag-receipts">
          {receiptEntries.map(([role, rid]) => (
            <div key={role}>
              receipt · {role}:{" "}
              {onOpenReceipt ? (
                <button className="world-linkbtn mono" onClick={() => onOpenReceipt(rid, role)}>
                  open {shortId(rid)}
                </button>
              ) : (
                <span className="mono">{shortId(rid)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="cg-control-btns">
        {s === "proposed" && iAmCounterpart && (
          <>
            <button className="primary" disabled={busyHere} onClick={() => onAgree(agreement.agreement_id)}>
              {busyHere ? "Working…" : "Agree"}
            </button>
            <button disabled={busyHere} onClick={() => onDecline(agreement.agreement_id)}>
              Decline
            </button>
          </>
        )}
        {s === "agreed" && (iAmProposer || iAmCounterpart) && (
          <button className="primary" disabled={busyHere} onClick={() => onSubmit(agreement.agreement_id)}>
            {busyHere ? "Working…" : "Submit to the receiver"}
          </button>
        )}
      </div>
    </li>
  );
}

function AgreementsPanel({
  agreements, agreementsError, selfId, squareBusy, onAgree, onDecline, onSubmit, onInspect, onOpenReceipt,
}: {
  agreements: WorldAgreement[];
  agreementsError: string | null;
  selfId: string | null;
  squareBusy: string | null;
  onAgree: (id: string) => void;
  onDecline: (id: string) => void;
  onSubmit: (id: string) => void;
  onInspect: (id: string) => void;
  onOpenReceipt?: (receiptId: string, role: string | null) => void;
}) {
  return (
    <section className="world-panel" aria-label="Receiving counters">
      <div className="panel-title">Receiving counters</div>
      <p className="fine">
        Each participant accepts or refuses at their own counter, under their own
        rules. The stage token sits where the next action waits.
      </p>
      {agreementsError ? (
        <p className="fine">{agreementsError} The board above is read-only in this backend build.</p>
      ) : agreements.length === 0 ? (
        <p className="fine">
          No agreements yet. Propose one from a listing — the other side must agree
          before anything moves.
        </p>
      ) : (
        <ul className="ag-list">
          {agreements.map((a) => (
            <AgreementCard
              key={a.agreement_id}
              agreement={a}
              selfId={selfId}
              squareBusy={squareBusy}
              onAgree={onAgree}
              onDecline={onDecline}
              onSubmit={onSubmit}
              onInspect={onInspect}
              onOpenReceipt={onOpenReceipt}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgreementInspect({
  agreement, listing, selfId, squareBusy, onClose, onAgree, onDecline, onSubmit, onOpenReceipt,
}: {
  agreement: WorldAgreement;
  /** the listing's task record, from the board — null when it is gone */
  listing: WorldListing | null;
  selfId: string | null;
  squareBusy: string | null;
  onClose: () => void;
  onAgree: (id: string) => void;
  onDecline: (id: string) => void;
  onSubmit: (id: string) => void;
  onOpenReceipt?: (receiptId: string, role: string | null) => void;
}) {
  // The honest "work" view: the gate's propose is a permission check that
  // never executes, so there is no work product anywhere. What the backend
  // durably records is the task record, the receiver's decision, and the
  // receipts — rendered exactly, never a fabricated document or summary.
  const requires = agreement.terms?.requires ?? listing?.terms?.requires ?? [];
  const decision = agreement.decision ?? null;
  return (
    <div className="parcel-veil" onClick={onClose} role="dialog" aria-label="Agreement">
      <div className="parcel-paper" onClick={(e) => e.stopPropagation()}>
        <div className="parcel-ribbon" />
        <div className="panel-title">Agreement</div>
        <section aria-label="The work">
          <div className="panel-title">The work</div>
          <p className="fine">
            The receiver's propose step is a permission check — it never executes work,
            so there is no work product to open. What follows is the task record as
            posted, the receiver's decision, and the receipts. Nothing more.
          </p>
          {listing ? (
            <dl className="oc-facts">
              <div><dt>Kind</dt><dd>{listing.kind || <span className="fine">not recorded</span>}</dd></div>
              <div><dt>Title</dt><dd>{listing.title || <span className="fine">not recorded</span>}</dd></div>
              {listing.detail ? <div><dt>Detail</dt><dd>{listing.detail}</dd></div> : null}
              <div><dt>Terms</dt><dd>{requires.length > 0 ? `requires ${requires.join(", ")}` : <span className="fine">no required parties recorded</span>}</dd></div>
            </dl>
          ) : (
            <p className="fine">The listing is no longer on the board — no task record is available. Nothing is reconstructed.</p>
          )}
          {decision ? (
            <p className="fine">
              receiver's decision:{" "}
              <span className={`badge ${decision === "ALLOWED" ? "ok" : decision === "STOPPED" ? "no" : ""}`}>{decision}</span>
            </p>
          ) : (
            <p className="fine">No receiver decision recorded — nothing has been decided.</p>
          )}
          {agreement.transaction_id && (
            <p className="fine mono">transaction {agreement.transaction_id}</p>
          )}
        </section>
        <ul className="ag-list">
          <AgreementCard
            agreement={agreement}
            selfId={selfId}
            squareBusy={squareBusy}
            onAgree={onAgree}
            onDecline={onDecline}
            onSubmit={onSubmit}
            onOpenReceipt={onOpenReceipt}
          />
        </ul>
        <button className="primary" onClick={onClose}>Fold it closed</button>
      </div>
    </div>
  );
}

/* ---------- the square: posting ---------- */

function PostForm({
  side, kindOptions, kindNote, form, setForm, busy, termsText, displayName, onPost,
}: {
  side: "need" | "offer";
  kindOptions: string[];
  kindNote: string;
  form: { kind: string; title: string; detail: string };
  setForm: (v: { kind: string; title: string; detail: string }) => void;
  busy: string | null;
  termsText: string;
  displayName: string;
  onPost: () => void;
}) {
  return (
    <section className="world-panel" aria-label={side === "need" ? "Post a need" : "Offer work"}>
      <div className="panel-title">{side === "need" ? "Post a need" : "Offer work or a capability"}</div>
      <div className="world-offerform">
        <label>Kind <span className="fine">({kindNote})</span>
          {kindOptions.length > 0 ? (
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="">choose a kind…</option>
              {kindOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          ) : (
            <input
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              maxLength={40}
              placeholder="kind"
            />
          )}
        </label>
        <label>Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} />
        </label>
        <label>Detail
          <input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} maxLength={160} />
        </label>
      </div>
      <p className="world-terms"><strong>Terms:</strong> {termsText}</p>
      <button
        className="primary"
        disabled={busy === "posting" || !form.title.trim() || (side === "need" && !form.kind.trim())}
        onClick={onPost}
      >
        {busy === "posting" ? "Posting…" : side === "need" ? `Post need as ${displayName}` : `Post offer as ${displayName}`}
      </button>
      <p className="fine">Nothing is posted until you tap this button.</p>
    </section>
  );
}
