/**
 * Shared-world client — frontend/src/world/api.ts
 *
 * Implements the /api/world/* (v1) contract exactly as handed down:
 *   GET  /api/world/state                -> {world, participants, offers, shared_receipts, events, notice}
 *   POST /api/world/presence             -> presence opt-in/out
 *   GET  /api/world/receipts             -> {receipts}
 *   POST /api/world/receipts/share       -> share a receipt into the shared space
 *   (POST /api/world/reset is administrative-only: requires WORLD_ADMIN_TOKEN
 *    via X-Admin-Token header; not exposed in the preview UI.)
 *
 * Custody note: every gated act (join, propose, offer, accept, agreement
 * steps, revocation, claim-graph and newsroom actions) now requires
 * client-held keys and worker-signed presentations. That entire surface
 * lives in ./custody.ts (CustodyClient) — this module deliberately exposes
 * NO presentation-less path for gated acts, so nothing here can silently
 * fall back to server-side key custody (which no longer exists).
 *
 * No modal permission prompts, no invented data: every function returns what
 * the backend returned, and throws on transport/HTTP failure.
 */

// Same-origin API path: the browser only talks to the dev server that served
// this page, and Vite proxies /api/* to the loopback-only backend. The
// backend port is never exposed to the LAN and never hard-coded here.
const BASE = "";
const PREFIX = "/api/world";

export type OfferKind = "tidy-notes" | "summarize" | "draft";

export interface JoinProof {
  nonce: string;
  signature: string; // hex
}

export interface JoinProfile {
  version: "openline-join-profile/v1";
  participant: { id: string; display_name: string };
  agent: { id: string; display_name: string; public_key: string }; // hex
  proof: JoinProof;
  mandate: { scopes: string[] };
  capabilities: string[];
  /** participant kind (host | real | seeded) — honored by newer backends,
   *  ignored by older ones */
  kind?: string;
}

export interface JoinResult {
  participant_id: string;
  agent_id: string;
  token: string;
  standing: string;
  world: { location: string; version: string };
}

export interface WorldPresence {
  status: string;
  note: string | null;
}

export interface WorldParticipant {
  participant_id: string;
  display_name: string;
  agent: { id: string; display_name: string };
  presence: WorldPresence | null;
  joined_at: string;
  /** sibling track: host | real | seeded. Absent on older builds. */
  kind?: string | null;
  /** seeded sample participants never show presence */
  is_sample?: boolean | null;
  /** Track A operating-model fields (see ParticipantOperating above).
   *  Absent until Track A lands — the UI treats absence as "not reported",
   *  never as a mode it can assume. */
  activity_mode?: ActivityMode | null;
  delegation?: DelegationSummary | null;
  paused?: boolean | null;
  pending_escalations?: number | null;
  /** Track A's worker stop-condition state for this session ("idle" |
   *  "running" | "awaiting_approval" | "paused" | "held_standing" |
   *  "complete" | "stopped_revoked") — rendered verbatim in the console. */
  worker_state?: WorkerState | null;
  /** UNATTENDED-COMMISSION-001: simulated-funds balance in integer cents.
   *  Simulated money only, never a provider invoice. Absent on older builds. */
  simulated_balance_cents?: number | null;
}

export interface WorldOffer {
  offer_id: string;
  from_participant: string;
  from_display_name: string;
  task: { kind: string; title: string; detail: string };
  terms?: { requires: string[] };
  status: string;
  created_at: string;
}

export interface WorldEvent {
  ts: string;
  kind: string;
  summary: string;
}

/** Receipt shape is intentionally loose: the contract names the endpoints
 *  and keys ({receipts}, receipt_id) but not the full receipt fields.
 *  We render only fields the backend actually sent. */
export interface WorldReceipt {
  receipt_id?: string;
  decision?: string;
  action?: string;
  reason_codes?: string[];
  [k: string]: unknown;
}

/** A shared receipt: who shared it plus the receipt itself. */
export interface SharedReceiptEntry {
  shared_by: string;
  shared_by_display_name: string;
  receipt: WorldReceipt;
}

export interface WorldTransaction {
  transaction_id: string;
  offer_id: string;
  offerer: string;
  acceptor: string;
  task: { kind: string; title: string; detail: string };
  terms: { requires: string[] };
  status: string;
  receipts: Record<string, string>;
  decided_at: string;
}

export interface WorldTransport {
  mode?: string;
  status?: string; // backend-defined: "connected" | "disconnected" | "pending"
  detail?: string;
}

/** One unattended commission as reported by /api/world/state. All amounts
 *  are integer cents of SIMULATED funds — never provider invoices. */
export interface CommissionSettlement {
  settlement_id: string;
  outcome: string; // accepted | rejected | stopped_cap | stopped_deadline | revoked
  recorded_cost_cents: number;
  success_fee_cents: number;
  seller_payout_cents: number;
  buyer_release_cents: number;
  payee: string;
}

export interface CommissionSummary {
  commission_id: string;
  contract_id: string;
  status: string;
  buyer_id: string;
  seller_id: string;
  recorded_cost_cents: number;
  max_cost_cents: number;
  success_fee_cents: number;
  settlement: CommissionSettlement | null;
}

export interface WorldState {
  world: { location: string; version: string };
  participants: WorldParticipant[];
  offers: WorldOffer[];
  transactions: WorldTransaction[];
  shared_receipts: SharedReceiptEntry[];
  events: WorldEvent[];
  notice: string | null;
  transport?: WorldTransport | null;
  /** sibling track may fold these into /state; absent on older builds */
  listings?: WorldListing[];
  agreements?: WorldAgreement[];
  /** UNATTENDED-COMMISSION-001: active and settled commissions. Absent on
   *  older builds; the UI treats absence as "not reported". */
  commissions?: CommissionSummary[];
  commission_ledger?: Array<Record<string, unknown>>;
}

export interface GateDecision {
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  transaction_id?: string;
}

/* ---------------- claim graph: the reading desk ---------------- */

/** Everything here is recorded backend data: claims, relations, anchors,
 *  receipts, and impact classifications. The frontend never infers a
 *  dependency or invents a standing label. */
export interface ClaimStanding {
  classification: string; // QUARANTINE | SURVIVES | AFFECTED_UNRESOLVED | UNAFFECTED
  reason: string | null;  // the backend's exact reason term, or null
}

export interface ClaimProvenance {
  source_id: string;
  source_label: string;
  mode: string;
  quote: string;
}

export interface ClaimRecord {
  claim_id: string;
  kind: string;
  text: string;
  provenance: ClaimProvenance[];
  /** null before any event: honestly "not yet assessed", never invented */
  standing: ClaimStanding | null;
}

export interface ClaimRelation {
  relation_id: string;
  from_claim_id: string;
  to_claim_id: string;
  relation: string;
  authority: string; // hard | advisory | unadmitted, from the admitted policy
}

export interface ClaimSource {
  source_id: string;
  label: string;
  locator: string | null;
}

export interface ClaimReceipt {
  schema?: string;
  issuer?: string;
  issued_at?: string;
  graph_state_root?: string;
  claim_count?: number;
  relation_count?: number;
  public_key?: string;
  signature?: string;
  claim_boundary?: string;
}

export interface ClaimImpact {
  status?: string;
  report_id?: string;
  event_id?: string;
  summary?: Record<string, number>;
  decision_claim_ids_touched?: string[];
  claim_boundary?: string;
}

export interface ClaimReport {
  report_id: string;
  title: string;
  placement: string;
  claims: ClaimRecord[];
  relations: ClaimRelation[];
  sources: ClaimSource[];
  receipt: ClaimReceipt;
  impact: ClaimImpact | null;
}

export interface ClaimEvent {
  event_id?: string;
  status?: string;
  effective_at?: string;
  asserted_by?: string;
  reason?: string;
  affected_source_labels?: string[];
  replayed?: boolean;
}

export interface ClaimGraphDescribe {
  chapter: { id: string; title: string };
  issuer: { issuer: string; public_key: string };
  reports: ClaimReport[];
  events: ClaimEvent[];
  honesty: string;
}

export interface ClaimCorrectResult {
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  event_id: string | null;
  replayed: boolean;
}

/* ---------------- newsroom: the small desk ---------------- */

/** Everything here is recorded backend data. Imported article text is
 *  untrusted data: quoted for display, never executed. A proposal never
 *  changes a standing by itself — only an accepted review admits evidence. */
export interface NewsroomProposal {
  proposal_id: string;
  dispatch_id: string;
  kind: string; // disputes-source | challenges | supports
  target_claim_ids: string[];
  target_claim_texts: string[];
  effect: string; // source_status:CORRECTED | source_status:WITHDRAWN | none
  rationale: string;
  status: string; // proposed | accepted | declined
  proposed_by?: string | null;
  proposed_at?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
}

export interface NewsroomAcceptanceResult {
  criterion: string;
  check_performed: string;
  result: "pass" | "fail";
  detail: string;
}

export interface NewsroomAcceptance {
  criteria_frozen: string;
  evaluator: string;
  evaluated_sha256: string;
  scope_note: string;
  results: NewsroomAcceptanceResult[];
  verdict: "ACCEPTED" | "REJECTED";
}

export interface NewsroomDispatch {
  dispatch_id: string;
  title: string;
  source_url: string;
  /** The article's own publication time — the source's claim, never merged
   *  with retrieved_at. */
  published_at: string;
  /** When the system learned about it — the import time. */
  retrieved_at: string;
  imported_by?: string | null;
  content_hash?: string;
  body: string;
  proposals: NewsroomProposal[];
  /** Present only on dispatches admitted through the receiver-owned
   *  research-report path (not the fixture import path). */
  research_report?: boolean;
  /** SHA-256 of the exact displayed body bytes. */
  report_sha256?: string | null;
  /** The structural acceptance record, evaluated on the pinned bytes.
   *  Structural only — never factual verification. On research-package
   *  dispatches this is the K1-K7 package acceptance record. */
  acceptance?: NewsroomAcceptance | PackageAcceptance | null;
  /** Present only on dispatches admitted through the receiver-owned
   *  research-package path. On these dispatches `acceptance` carries the
   *  K1-K7 package acceptance record (PackageAcceptance). */
  research_package?: boolean;
  /** package_sha256 of the pinned canonical bytes. */
  package_sha256?: string | null;
  /** The full pinned package: manifest + carried file bytes. */
  package?: ResearchPackage | null;
  /** claim_graph report holding the package's claim. */
  claim_report_id?: string | null;
  /** The worker's signed submission presentation and the gate receipt. */
  gate_receipt?: Record<string, unknown> | null;
  presentation?: Record<string, unknown> | null;
  presentation_binding?: PackagePresentationBinding | null;
}

export interface NewsroomArticleProposal {
  kind: string;
  target_claim_id: string | null;
  effect: string;
  rationale: string;
}

export interface NewsroomArticle {
  title: string;
  source_url: string;
  published_at: string;
  body: string;
  proposals: NewsroomArticleProposal[];
}

export interface NewsroomEvent {
  kind: string;
  at?: string;
  [k: string]: unknown;
}

/** The newsroom report reuses the claim-graph report shape (claims,
 *  relations, sources, signed receipt, impact) plus its fixture flag. */
export interface NewsroomReport extends ClaimReport {
  fixture: boolean;
}

export interface NewsroomDescribe {
  chapter: { id: string; title: string };
  fixture_notice: string;
  issuer: { issuer: string; public_key: string };
  report: NewsroomReport;
  dispatches: NewsroomDispatch[];
  pending_review: number;
  fixture_article: NewsroomArticle;
  events: NewsroomEvent[];
  honesty: string;
}

export interface NewsroomImportResult {
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  dispatch_id: string | null;
  replayed: boolean;
}

/** Result of newsroom/submit-report: the byte binding and the acceptance
 *  record ride alongside the import result. */
export interface NewsroomSubmitReportResult extends NewsroomImportResult {
  binding?: { declared_sha256: string; pinned_sha256: string; match: boolean } | null;
  acceptance?: NewsroomAcceptance | null;
}

/* ---------------- research packages: the commons ---------------- */

/** The pinned package: manifest + carried file bytes. The canonical bytes
 *  are canonicalJson({manifest, files}); package_sha256 names them. */
export interface ResearchPackageManifest {
  schema: string;
  title: string;
  claim: string;
  producer_id: string;
  files: Record<string, { sha256: string }>;
  expected_result: string;
  reproduce: string;
  citations: { locator: string; note: string }[];
  limitations: string;
  producer_review: string;
}

export interface ResearchPackage {
  manifest: ResearchPackageManifest;
  files: Record<string, string>;
}

export interface PackageAcceptanceResult {
  criterion: string;
  check_performed: string;
  result: "pass" | "fail";
  detail: string;
}

export interface PackageAcceptance {
  criteria_frozen: string;
  evaluator: string;
  evaluated_sha256: string;
  scope_note: string;
  sandbox: {
    limits: Record<string, unknown>;
    /** True only when the study actually ran (receiver-trusted fixture
     *  pin); false when execution was refused (STUDY_EXECUTION_DISABLED).
     *  The limits bound the cost of reproduction, not access. */
    executed?: boolean;
    exit_code: number | null;
    stdout: string;
    stdout_truncated: boolean;
    stderr_tail: string;
    timed_out: boolean;
    error?: string;
  };
  results: PackageAcceptanceResult[];
  verdict: "ACCEPTED" | "REJECTED";
  /** Receiver gate signature over the record (payload_hash + signature);
   *  the worker never signs the acceptance. */
  payload_hash?: string;
  signature?: { algorithm: string; public_key: string; value: string };
}

export interface PackagePresentationBinding {
  presentation_hash: string | null;
  package_sha256: string;
  receipt_id: string;
}

/** Result of newsroom/submit-package: the gate verdict, the byte binding,
 *  the (gate-signed) acceptance record, and the presentation binding. */
export interface NewsroomSubmitPackageResult {
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  binding?: { declared_sha256: string; pinned_sha256: string; match: boolean } | null;
  acceptance?: PackageAcceptance | null;
  presentation_binding?: PackagePresentationBinding | null;
  dispatch_id: string | null;
  claim_report_id?: string | null;
  replayed: boolean;
}

/** Canonical JSON matching backend/vendor/openline_wallet/canonical.py:
 *  sorted keys, no whitespace, non-ASCII escaped as \uXXXX, ASCII output.
 *  Floats are rejected (the profile is integer/string-only). */
export function canonicalJson(value: unknown): string {
  const escapeNonAscii = (s: string) => s.replace(/[^\x00-\x7F]/g, (ch) =>
    `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const go = (v: unknown): string => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "string") return escapeNonAscii(JSON.stringify(v));
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") {
      if (!Number.isInteger(v)) throw new Error("canonicalJson: floats forbidden");
      return String(v);
    }
    if (Array.isArray(v)) return `[${v.map(go).join(",")}]`;
    if (typeof v === "object") {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return `{${keys.map((k) => `${escapeNonAscii(JSON.stringify(k))}:${go((v as Record<string, unknown>)[k])}`).join(",")}}`;
    }
    throw new Error(`canonicalJson: unsupported value ${typeof v}`);
  };
  return go(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface NewsroomReviewResult {
  decision: string;
  receipt_id: string;
  reason_codes: string[];
  proposal_id: string;
  review: "accept" | "decline" | null;
  proposal_status: string;
  admitted_event_id: string | null;
}

async function req<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${PREFIX}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(`world backend unreachable: ${String(e)}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`world backend returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}

/* ---------------- real local crypto ---------------- */

/* NOTE: participant key custody moved to ./custody.ts. The helpers that
 * generated extractable in-memory keys for the old join are gone: keys are
 * non-extractable, persisted in IndexedDB, and never leave the client. */

/* ---------------- contract client ---------------- */

export const worldApi = {
  /** Liveness probe for the shared-world backend. */
  async state(): Promise<WorldState> {
    return req<WorldState>("/state");
  },

  presence(participant_id: string, token: string, presence: WorldPresence | null): Promise<unknown> {
    return req("/presence", "POST", { participant_id, token, presence });
  },

  receipts(participant_id: string, token: string): Promise<{ receipts: WorldReceipt[] }> {
    return req<{ receipts: WorldReceipt[] }>(`/receipts?participant_id=${encodeURIComponent(participant_id)}&token=${encodeURIComponent(token)}`);
  },

  shareReceipt(participant_id: string, token: string, receipt_id: string): Promise<unknown> {
    return req("/receipts/share", "POST", { participant_id, token, receipt_id });
  },

  /** Inspectable claim-graph chapter state, from recorded data only. */
  claimgraph(): Promise<ClaimGraphDescribe> {
    return req<ClaimGraphDescribe>("/claimgraph");
  },

  /** Inspectable newsroom chapter state, from recorded data only. */
  newsroom(): Promise<NewsroomDescribe> {
    return req<NewsroomDescribe>("/newsroom");
  },

  /** Submit an actual research artifact for receiver-owned acceptance.
   *  The participant's own gate evaluates "newsroom.review"; the report
   *  is pinned by sha256 at submit; the frozen structural criteria run
   *  server-side on the pinned bytes. Altered bytes or failed criteria
   *  are refused before any effect. */
  newsroomSubmitReport(participant_id: string, token: string, report: {
    title: string; source_url: string; published_at: string; body: string; report_sha256: string;
  }, idempotency_key?: string): Promise<NewsroomSubmitReportResult> {
    return req<NewsroomSubmitReportResult>("/newsroom/submit-report", "POST", { participant_id, token, report, idempotency_key });
  },

  /** Submit a research package for receiver-owned acceptance. The server
   *  pins the exact bytes, runs the frozen K1-K7 criteria on them in an
   *  isolated study process, and records the acceptance signed by the
   *  receiver gate. The worker's presentation is worker-signed; the
   *  acceptance never is. Altered bytes or failed criteria are refused
   *  before any effect. */
  newsroomSubmitPackage(participant_id: string, token: string, submission: {
    package: ResearchPackage; package_sha256: string; attestation?: unknown;
  }, presentation: unknown, idempotency_key?: string): Promise<NewsroomSubmitPackageResult> {
    return req<NewsroomSubmitPackageResult>("/newsroom/submit-package", "POST", { participant_id, token, submission, presentation, idempotency_key });
  },
};

/* ---------------- the square: board, needs, agreements ---------------- */

/**
 * The exchange-board contract (sibling backend track). Shapes below follow
 * the described contract; every new function treats a backend NOT_FOUND as
 * "this backend build does not have the feature" (BackendTooOld) rather
 * than inventing data. The UI renders that honestly instead of guessing.
 */

export type ListingSide = "need" | "offer";

export interface WorldListing {
  listing_id: string;
  side: ListingSide | string;
  kind: string;
  title: string;
  detail?: string | null;
  /** plain-language terms from the backend, when it publishes them */
  terms_text?: string | null;
  terms?: { requires?: string[] } | null;
  /** open | in_agreement | withdrawn | closed (backend-defined; read verbatim) */
  status: string;
  from_participant: string;
  from_display_name: string;
  /** host | real | seeded (sibling track); absent on older builds */
  from_kind?: string | null;
  is_sample?: boolean | null;
  created_at?: string | null;
}

export interface BoardFilters {
  side?: "all" | ListingSide;
  kind?: string;
  hide_samples?: boolean;
}

export type AgreementStatus =
  | "proposed" | "agreed" | "submitted"
  | "accepted" | "refused" | "settled"
  | string;

/** An agreement, in the backend's own field names (see /api/world/state).
 *  Display names and listing titles are resolved in the component from
 *  participants and board listings — the backend stores ids, not labels. */
export interface WorldAgreement {
  agreement_id: string;
  listing_id: string;
  listing_side?: string | null;
  status: AgreementStatus;
  /** participant id of the proposer */
  proposer: string;
  proposer_display_name?: string | null;
  /** participant id of the counterpart (the listing owner) */
  counterpart: string;
  created_at?: string | null;
  history?: { status: string; at: string }[];
  receipts?: Record<string, string>;
  transaction_id?: string | null;
  decision?: string | null;
  /** Snapshotted from the listing when the agreement was proposed:
   *  the terms both sides consented to. Read verbatim from the record. */
  terms?: { requires?: string[] } | null;
  /** Resolved in the UI, not from the backend: */
  listing_title?: string | null;
  counterpart_display?: string | null;
}

export interface BoardSuggestion {
  listing_id: string;
  reason: string;
}

export class BackendTooOld extends Error {
  feature: string;
  constructor(feature: string) {
    super(`${feature} is not available in this backend build`);
    this.name = "BackendTooOld";
    this.feature = feature;
  }
}

function isNotFoundError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("NOT_FOUND");
}

async function squareReq<T>(feature: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isNotFoundError(e)) throw new BackendTooOld(feature);
    throw e;
  }
}

function offerToListing(o: WorldOffer): WorldListing {
  return {
    listing_id: o.offer_id,
    side: "offer",
    kind: o.task.kind,
    title: o.task.title,
    detail: o.task.detail,
    terms: o.terms ?? null,
    status: o.status === "open" ? "open" : "closed",
    from_participant: o.from_participant,
    from_display_name: o.from_display_name,
    created_at: o.created_at,
  };
}

export const squareApi = {
  /**
   * The exchange board. Passes the caller's filters through; the caller
   * also filters client-side so the offers-fallback behaves the same.
   */
  board(filters: BoardFilters = {}): Promise<{ listings: WorldListing[] }> {
    const q = new URLSearchParams();
    if (filters.side && filters.side !== "all") q.set("side", filters.side);
    if (filters.kind) q.set("kind", filters.kind);
    if (filters.hide_samples) q.set("hide_samples", "1");
    const qs = q.toString();
    return squareReq("the exchange board", () =>
      req<{ listings: WorldListing[] }>(`/board${qs ? `?${qs}` : ""}`).then((d) => ({
        listings: Array.isArray(d.listings) ? d.listings : [],
      }))
    );
  },

  /**
   * Board with an honest fallback: older backends have no /board, so the
   * legacy offers from world state stand in as offer-side listings. The
   * source is returned so the UI can label the fallback plainly.
   */
  async boardOrFallback(filters: BoardFilters = {}): Promise<{ listings: WorldListing[]; source: "board" | "offers-fallback" }> {
    try {
      const b = await squareApi.board(filters);
      return { listings: b.listings, source: "board" };
    } catch (e) {
      if (!(e instanceof BackendTooOld)) throw e;
      const s = await worldApi.state();
      let listings = (s.offers ?? []).map(offerToListing);
      if (filters.side && filters.side !== "all") listings = listings.filter((l) => l.side === filters.side);
      if (filters.kind) listings = listings.filter((l) => l.kind === filters.kind);
      return { listings, source: "offers-fallback" };
    }
  },

  /** Post a need. The backend allowlists kinds; a rejection surfaces verbatim. */
  postNeed(
    participant_id: string,
    token: string,
    need: { kind: string; title: string; detail: string; terms_text?: string }
  ): Promise<{ listing_id: string }> {
    // The backend contract names the payload "task" (mirrors /offer), and
    // answers with { need_id } rather than { listing_id }.
    const { terms_text, ...task } = need;
    return squareReq("posting needs", () =>
      req<{ listing_id?: string; need_id?: string }>("/needs", "POST", { participant_id, token, task }).then((d) => ({
        listing_id: d.listing_id ?? d.need_id ?? "unavailable",
      }))
    );
  },

  /** "Matches your post": mechanical suggestions, each with its reason. */
  suggestions(participant_id: string, token: string): Promise<{ suggestions: BoardSuggestion[] }> {
    return squareReq("matching", () =>
      req<{ suggestions: BoardSuggestion[] }>(`/suggestions?participant_id=${encodeURIComponent(participant_id)}&token=${encodeURIComponent(token)}`).then((d) => ({
        suggestions: Array.isArray(d.suggestions) ? d.suggestions : [],
      }))
    );
  },

  /* proposeAgreement and agreementAgree moved to CustodyClient: both require
   *  worker-signed authorizations, and no presentation-less path may remain. */

  /** Agreements: the backend folds them into /state (there is no separate
   *  list endpoint). Public, like the board — it's a shared world. */
  async agreements(): Promise<{ agreements: WorldAgreement[] }> {
    const s = await worldApi.state();
    return { agreements: Array.isArray(s.agreements) ? s.agreements : [] };
  },

  agreementDecline(participant_id: string, token: string, agreement_id: string): Promise<{ status: string }> {
    return squareReq("agreements", () =>
      req<{ status: string }>(`/agreements/${encodeURIComponent(agreement_id)}/decline`, "POST", { participant_id, token })
    );
  },

  /** After both sides agree, either may submit: the receiver-controlled
   *  exchange runs and decides ACCEPTED or REFUSED. */
  agreementSubmit(participant_id: string, token: string, agreement_id: string): Promise<{ status: string }> {
    return squareReq("agreements", () =>
      req<{ status: string }>(`/agreements/${encodeURIComponent(agreement_id)}/submit`, "POST", { participant_id, token })
    );
  },

  withdrawListing(participant_id: string, token: string, listing_id: string): Promise<unknown> {
    return squareReq("withdraw", () =>
      req(`/listings/${encodeURIComponent(listing_id)}/withdraw`, "POST", { participant_id, token })
    );
  },
};

/* ---------------- operating model: delegation + escalations ---------------- */

/**
 * The Track A operating-model contract (deterministic automation).
 * Shapes follow the contract handed to Track B:
 *   POST /delegate {goal, permitted_actions[], permitted_resources[],
 *                   spending_limit, work_limit, review_conditions{}}
 *                   -> {delegation}
 *   GET  /delegation -> {delegation | null}
 *   POST /agent/pause {paused: bool}
 *   GET  /escalations -> {escalations: [{id, participant_id, reason,
 *                   proposed_action: {kind, label, detail}, created_at,
 *                   status, resolution?}]}
 *   POST /escalations/{id}/resolve {decision: "approve" | "deny", note?}
 *
 * Auth convention: participant_id + token, exactly like every other
 * authorized endpoint in this file (query string on GET, body on POST).
 * If the backend answers NOT_FOUND, the feature is treated as "not in this
 * backend build" — the UI says so, it never invents a delegation.
 * (Track A's deterministic-automation endpoints are live on shared-world;
 * the NOT_FOUND path covers older builds.)
 *
 * Nothing here implies model inference. Track A builds DETERMINISTIC
 * AUTOMATION only; the frontend renders "AUTOMATION — deterministic"
 * exclusively when the backend reports activity_mode === "automation".
 * Delegation summaries use the backend's field names verbatim (spent,
 * actions_count); review_conditions keys are the backend's vocabulary
 * (new_counterpart, over_spending) — see REVIEW_CONDITION_LABELS.
 */

export type ActivityMode = "live" | "automation" | "scripted" | "manual";

/** Track A extension fields on a world participant. All optional: older
 *  backends (and the current one, until Track A lands) omit them, and the
 *  UI treats absence as "not reported" — never as a mode it can assume. */
export interface ParticipantOperating {
  /** backend-reported activity mode, verbatim; absent = not reported */
  activity_mode?: ActivityMode | null;
  /** Track A's delegation summary for this participant, when it exists */
  delegation?: DelegationSummary | null;
  /** true while the owner's agent is paused via POST /agent/pause */
  paused?: boolean | null;
  /** pending (unresolved) escalations awaiting this participant's owner */
  pending_escalations?: number | null;
}

/** The delegation summary the backend folds into world state per
 *  participant (Track A). Rendered verbatim; the frontend never infers
 *  activity from it. Field names follow the backend exactly: spent (not
 *  "spending_used"), actions_count (not "work_done"). */
export interface DelegationSummary {
  delegation_id?: string;
  goal?: string | null;
  /** backend status vocabulary: "active" | "complete" | "revoked" (and
   *  whatever Track A names next); the frontend renders it verbatim. */
  status?: string | null;
  paused?: boolean | null;
  permitted_actions?: string[] | null;
  permitted_resources?: string[] | null;
  review_conditions?: Record<string, boolean> | null;
  complete_after_settled?: number | null;
  spending_limit?: number | null;
  /** units spent against the limit (backend: "spent") */
  spent?: number | null;
  work_limit?: number | null;
  /** worker steps taken (backend: "actions_count") */
  actions_count?: number | null;
  settled_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Full delegation record from GET /delegation (the backend's summary).
 *  The pause switch is NOT part of it — it lives on the session and
 *  arrives via world state, so the console takes it as a separate prop. */
export interface Delegation extends DelegationSummary {
  goal: string;
  permitted_actions: string[];
  permitted_resources: string[];
  spending_limit: number;
  work_limit: number;
  review_conditions: Record<string, boolean>;
  paused?: boolean | null;
}

/** The input the owner console sends to POST /delegate. review_conditions
 *  keys are the backend's vocabulary: "new_counterpart" (ask before the
 *  worker acts with a counterpart it has not seen under this delegation)
 *  and "over_spending" (ask before the first spend, so the owner sees
 *  the spend plan before anything runs). */
export interface DelegationInput {
  goal: string;
  permitted_actions: string[];
  permitted_resources: string[];
  /** required int >= 0 — the backend has no "unlimited": one unit per
   *  worker-initiated gate evaluation. */
  spending_limit: number;
  /** required int >= 1 — the backend has no "unlimited": max worker steps. */
  work_limit: number;
  review_conditions: Record<string, boolean>;
}

/** The review-condition keys the backend accepts, with plain-language
 *  labels for the owner console. Anything else is rejected by the
 *  backend — the form offers only these. */
export const REVIEW_CONDITION_LABELS: Record<string, string> = {
  new_counterpart: "Ask before acting with a new counterpart",
  over_spending: "Ask before the first spend (spend-plan review)",
};

/** The deterministic worker's stop-condition state for one session, from
 *  world state. Track A's data contract names these explicitly "for UI
 *  display"; the frontend renders them verbatim, never reinterprets. */
export type WorkerState =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "paused"
  | "held_standing"
  | "complete"
  | "stopped_revoked";

/** Plain-language worker states, in the backend's own words. */
export const WORKER_STATE_LABELS: Record<WorkerState, string> = {
  idle: "idle — no delegation, or not in automation mode; the worker will never step this session",
  running: "running — active delegation, automation mode, unpaused",
  awaiting_approval: "awaiting approval — stopped, waiting quietly for the owner's decision",
  paused: "paused — the worker takes no step while paused",
  held_standing: "holding — standing could not be established as current",
  complete: "complete — the mechanical goal predicate fired",
  stopped_revoked: "stopped — the mandate is no longer active",
};

export interface EscalationProposedAction {
  kind: string;
  label: string;
  detail?: string | null;
}

export interface Escalation {
  id: string;
  participant_id: string;
  /** plain-language reason, from the backend — quoted, never paraphrased */
  reason: string;
  proposed_action: EscalationProposedAction;
  created_at: string;
  status: string; // "pending" | "approved" | "denied" (backend-defined)
  resolution?: string | null;
}

export const TASK_KINDS: OfferKind[] = ["tidy-notes", "summarize", "draft"];

export const agentApi = {
  /**
   * Authorize deterministic automation for the caller's own agent.
   * participant_id + token ride in the body, per the established
   * convention; Track A confirms if it prefers a different binding.
   */
  delegate(
    participant_id: string,
    token: string,
    input: DelegationInput
  ): Promise<{ delegation: Delegation }> {
    return squareReq("delegation", () =>
      req<{ delegation: Delegation }>("/delegate", "POST", { participant_id, token, delegation: input })
    );
  },

  /** The caller's current delegation, or null when none is on record. */
  delegation(participant_id: string, token: string): Promise<{ delegation: Delegation | null }> {
    return squareReq("delegation", () =>
      req<{ delegation: Delegation | null }>(
        `/delegation?participant_id=${encodeURIComponent(participant_id)}&token=${encodeURIComponent(token)}`
      ).then((d) => ({ delegation: d.delegation ?? null }))
    );
  },

  /** Pause or resume the caller's agent. The automation stops issuing
   *  work while paused; nothing is predicted about in-flight work. */
  pause(participant_id: string, token: string, paused: boolean): Promise<{ paused: boolean }> {
    return squareReq("agent pause", () =>
      req<{ paused: boolean }>("/agent/pause", "POST", { participant_id, token, paused }).then((d) => ({
        paused: d.paused ?? paused,
      }))
    );
  },

  /**
   * Return the caller's session to manual mode. The deterministic worker
   * stops stepping (worker state goes idle); the delegation stays on
   * record and re-delegating re-arms automation. The backend assigns
   * "manual" and "scripted" only — "automation" comes solely from
   * delegate(), and "live" is always refused.
   */
  setActivityMode(
    participant_id: string,
    token: string,
    mode: "manual" | "scripted"
  ): Promise<{ activity_mode: string }> {
    return squareReq("activity mode", () =>
      req<{ activity_mode: string }>("/activity-mode", "POST", { participant_id, token, mode })
    );
  },
};

export const escalationsApi = {
  /** Pending and resolved escalations for the caller, newest first. */
  list(participant_id: string, token: string): Promise<{ escalations: Escalation[] }> {
    return squareReq("escalations", () =>
      req<{ escalations: Escalation[] }>(
        `/escalations?participant_id=${encodeURIComponent(participant_id)}&token=${encodeURIComponent(token)}`
      ).then((d) => ({ escalations: Array.isArray(d.escalations) ? d.escalations : [] }))
    );
  },

  /** Resolve one escalation: approve or deny the proposed action, with an
   *  optional owner note. The decision is the whole effect. */
  resolve(
    participant_id: string,
    token: string,
    id: string,
    decision: "approve" | "deny",
    note?: string
  ): Promise<unknown> {
    return squareReq("escalations", () =>
      req(`/escalations/${encodeURIComponent(id)}/resolve`, "POST", {
        participant_id,
        token,
        decision,
        ...(note && note.trim() ? { note: note.trim() } : {}),
      })
    );
  },
};
