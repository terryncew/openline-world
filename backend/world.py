"""Shared OpenLine world: two participant sessions, fully isolated authority.

Three rule layers, kept separate in code and in the API:

LAYER 1 -- COMMON WORLD RULES (this module, enforced by the world layer):
    admission (join profile + standing), moderation (input limits),
    spam limits (cap on open offers per participant, presence-update throttle),
    shared-space behavior. Violations raise WorldRuleError -> HTTP 409 with a
    WORLD_RULE_* code. These are policy refusals, never gate decisions: no
    receipt is minted, no signature is produced.

LAYER 2 -- OWNER RULES (one server receiver, client-held keys):
    the world server holds exactly ONE Ed25519 key: its own receiver gate
    key ("world-receiver"). Per participant it holds ONLY pinned public
    authority records: the owner principal id + root public key, the worker
    (agent) public key, the mandate id + scopes, and the latest verified
    owner-signed authority bundle. No owner private keys. No worker private
    keys. No wallets. Each participant's client holds its own keys and
    signs every authorization as a worker-signed presentation against a
    server-issued challenge; the receiver evaluates it and signs an
    ALLOWED/STOPPED receipt. A participant's private receipts, files, and
    tools are never exposed to anyone else.

LAYER 3 -- TRANSACTION TERMS (transaction record):
    what each party explicitly agreed to for one exchange: the offer record
    plus the explicit acceptance, stored as its own record, separate from
    layers 1 and 2. An offer alone NEVER obligates the other party -- only an
    explicit accept through the acceptor's own gate creates an obligation.
    terms.requires lists parties whose protected resources the task touches
    (currently only "offerer"); each listed party's gate must independently
    ALLOW at the backend receiver, or the exchange is refused. The preview's
    harmless task kinds touch only the acceptor's resources (single-party),
    but the dual-authorization path is implemented and tested.

Authorization model: each owner authorizes its own side at its explicit
act; the receiver evaluates immediately and signs a receipt; execution
re-checks that the authority head has not moved since the authorization.
    offer: the poster's presentation is evaluated at posting; the ALLOWED
        receipt + presentation are stored on the listing.
    need: no gate (a request, not an action). An optional authorization may
        be attached and is evaluated at need time; it auto-attaches as the
        need-poster's authorization on agreements formed from the need.
    propose_agreement: the proposer's presentation is evaluated; its receipt
        is stored on the agreement.
    agree: the counterpart's presentation is evaluated; its receipt is
        stored. Agree stays consent; the stored receipt is the authorization
        artifact.
    accept_offer (legacy single step): the acceptor's presentation is
        evaluated now; the poster's stored receipt is reused.
    submit: no new presentation. Both stored receipts are re-validated:
        each party's authority head hash must equal the head hash recorded
        at authorization time, else WORLD_AUTHORITY_STALE (re-authorize).
        Then the settlement is written.
Missing presentation -> WORLD_AUTHORIZATION_MISSING. Binding mismatch ->
WORLD_PRESENTATION_BINDING. All refusal paths raise; nothing is silently
allowed. A permission check never executes the action: gate.evaluate only
decides; nothing performs the task effect.

Revocation semantics: the owner revokes locally in their own wallet, then
submits the updated bundle to POST /api/world/authority/refresh. The world
verifies the signature, requires the principal+root to match the pinned
values, and admits the new head (monotonic; forks quarantine). Revocation
is not instant across the network: it stops the agent's NEXT gated action
only after the refresh is admitted. It does NOT reverse completed actions
or erase an already-earned obligation -- completed receipts keep verifying
and accepted/completed exchanges stand as records. Only subsequent gated
actions are STOPPED (signed MANDATE_REVOKED).

Local-preview honesty (separate key custody):
    - The server holds exactly one private key: its own receiver gate key.
      It never generates, holds, or sees any participant's owner or worker
      private key.
    - Tokens are opaque bearer strings, not authentication. A gated action
      additionally requires a worker-signed presentation; the token is not
      authority.
    - Proof of control is real: the agent signs a server-issued single-use
      nonce with its own Ed25519 key; the server verifies against the
      claimed agent public key, which must equal the mandate's
      subject_public_key for the subject in the owner-signed bundle.
    - Every returned decision is a real, signed gate evaluation against the
      admitted owner-signed bundle -- nothing is invented.
    - Offer/need detail is UNTRUSTED data: it never authorizes anything.
      Only the acceptor's mandate + receiver decide, via the allowlisted
      kind->action mapping.

Transport (message carriage ONLY -- see backend/transport.py):
    presence and world-event notices travel as versioned envelopes through a
    Transport instance (constructor-injectable, default LocalTransport).
    Identity, receiver policy, signed records, wallets, and transaction state
    are INDEPENDENT of transport and stay exactly where they are: the
    transport never evaluates a gate, never mints a receipt, never holds a
    key. The API exposes transport status honestly -- "pending" while a peer
    has not completed join, "disconnected" if the transport reports it --
    never implying a live peer that isn't there. The nearby/offline adapter
    does not exist (see docs/transports.md); nothing here demonstrates one.

Offline / standing-freshness rule (layer 1):
    standing checks record `standing_checked_at` on the participant session.
    Policy MAX_STANDING_AGE_SECONDS (300): when a consequential action
    (propose/accept) arrives and the required standing cannot be established
    as current -- the recorded check is stale (older than the policy) or
    unknown -- the world HOLDS: HTTP 409 HOLD_STANDING_UNKNOWN. No receipt is
    minted, nothing is evaluated, no effects are applied. A disconnected peer
    is NEVER assumed to know the latest revocation: stale standing data is a
    visible HOLD, not a quiet ALLOW, and never a silent reuse of old data.
    An idempotent retry is NOT a new consequential action -- it replays a
    prior committed outcome and does not require fresh standing.

Idempotency (layer 1):
    offer/accept/propose accept an optional client-generated idempotency_key.
    Same key + same participant + same action -> the ORIGINAL result is
    returned (same receipt_ids, same transaction_id); no new receipts are
    minted and no new effects are applied. Only successful outcomes are
    recorded: a failed attempt stores nothing, so a retry re-executes.
    Reusing a key for a DIFFERENT action is a conflict (409
    WORLD_IDEMPOTENCY_CONFLICT), never a silent overwrite.

TRACK A -- needs, agreements, board, honest population:

NEEDS mirror offers: a participant posts a REQUEST for work
(kind/title/detail/terms). A need is a proposal only -- it obligates nobody
and authorizes nothing. The open-listing cap counts needs+offers together
per participant.

AGREEMENTS record an explicit two-act lifecycle, separate from the legacy
single-step accept_offer() (which keeps working unchanged):
    proposed  -- the proposer records explicit agreement to the listing's
                 terms. Nothing is evaluated, no receipt is minted.
    agreed    -- the COUNTERPART (listing owner) explicitly agrees. Both
                 parties' consent is now on record. This is NOT
                 authorization: no gate is evaluated, no receipt is minted,
                 no effects are applied, the receiver owes nothing.
    submitted -- either party submits an "agreed" agreement; evaluation
                 begins. Submit before both explicit acts is rejected.
    accepted / refused -- the receiver's verdict, receipt ids recorded.
    settled   -- transaction record durably written, envelopes emitted.
    declined  -- either party declines while "proposed": no receipts, no
                 obligation, no effects; the listing stays open and both
                 parties remain free.
Every transition is appended to the agreement's history with a timestamp.
Role mapping for evaluation: the fulfiller is always the proposer (they do
the work); the poster is the listing owner. terms.requires may name
"offerer" or "needer" -- both resolve to the poster's session; the poster's
side is covered by its stored authorization receipt (from posting, or from
agree for needs), re-validated at submit against the current authority head.
If any required side lacks an ALLOWED stored receipt, or a head has moved,
the exchange is refused -- exactly as in the legacy path.

BOARD lists every listing (offers + needs) with transparent filters only
(side, kind, from_participant, hide_samples): no ranking, no scoring, no
AI. suggestions_for() is purely mechanical -- open listings whose kind
appears in the participant's OWN open listings (their stated intent) --
and labels each hit with the mechanical reason. Sample listings are never
suggested.

HONEST POPULATION: sessions carry kind "host" | "real" | "seeded"; real
joins are "real". seed_listing() is a world-operator demo-seeding call,
not a participant action: it creates sample:true listings with from_kind
"seeded", never reports presence, never acts, never evaluates a gate, and
can never form an agreement (propose/accept on a sample listing is refused
as a world rule).
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import secrets
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

_VENDOR_SRC = Path(__file__).resolve().parent / "vendor"
if str(_VENDOR_SRC) not in sys.path:
    sys.path.insert(0, str(_VENDOR_SRC))

from events import EventLog
from transport import ENVELOPE_VERSION, LocalTransport, Transport
from claim_graph_chapter import (
    ALLOWED_EVENT_STATUSES,
    ClaimGraphChapter,
)
from commission import (
    CommissionError,
    compute_cost_cents as commission_compute_cost,
    contract_id_for as commission_id_for,
    contract_sha256 as commission_sha,
    evaluate_deliverable as commission_evaluate,
    new_settlement_id as commission_new_id,
    settle_amounts as commission_settle_amounts,
    validate_contract as commission_validate,
    verify_owner_authorization as commission_verify_owner,
)
from newsroom_chapter import NewsroomChapter
from package_acceptance import canonical_package_bytes, evaluate_package
from report_acceptance import evaluate_report
from openline_wallet.clock import parse_time, utc_now
from openline_wallet.crypto import (
    private_key_hex,
    sign_record,
    verify_record,
)
from openline_wallet.effect_closure import EffectGate
from openline_wallet.errors import WalletError
from openline_wallet.wallet import verify_bundle

# ---------------------------------------------------------------------------
# LAYER 1 -- common world rules
# ---------------------------------------------------------------------------

JOIN_PROFILE_VERSION = "openline-join-profile/v1"

# Allowlisted harmless task kinds -> the existing supported action the
# ACCEPTOR's agent proposes through the ACCEPTOR's own gate. Offer detail is
# untrusted; this mapping is the only thing that reaches the receiver.
TASK_KINDS = {
    "tidy-notes": "notes.write",
    "summarize": "notes.read",
    "draft": "draft.write",
}
# Scopes a join profile may request in this preview. All map to harmless,
# evaluation-only actions through the participant's own gate.
# "claimgraph.correct" authorizes the claim-graph demo control: posting a
# correction or withdrawal event against the harbor log. The action is
# evaluated by the participant's own gate like any other propose; only an
# ALLOWED verdict appends the event.
# "newsroom.review" authorizes the newsroom review lane: importing an
# incoming article/correction as a dispatch, and accepting or declining a
# proposed connection to the report. Both actions are evaluated by the
# participant's own gate; only an ALLOWED verdict records anything.
SUPPORTED_SCOPES = {"notes.read", "notes.write", "draft.write", "claimgraph.correct",
                    "newsroom.review", "commission.report-cost",
                    "commission.submit-deliverable"}
# Parties that transaction terms may name as required authorizers. Both
# resolve to the listing's poster session: "offerer" for offer listings,
# "needer" for need listings -- side-specific spellings of the same role,
# the participant who posted the listing.
REQUIRES_PARTIES = {"offerer", "needer"}
# TRACK A -- activity modes a session may carry. "live" is reserved for a
# genuinely connected runtime (none exists in this preview) and is never
# assigned; "automation" is assigned only by delegate(), never directly.
ACTIVITY_MODES = ("live", "automation", "scripted", "manual")
# TRACK A -- review conditions an owner may attach to a delegation.
REVIEW_CONDITION_KEYS = ("new_counterpart", "over_spending")

MAX_OPEN_OFFERS_PER_PARTICIPANT = 5
PRESENCE_MIN_INTERVAL_SECONDS = 2.0
NONCE_TTL_SECONDS = 600
# Standing-freshness policy: a recorded standing check older than this is
# stale, and a consequential action must HOLD rather than assume it still
# holds. See the module docstring (Offline / standing-freshness rule).
MAX_STANDING_AGE_SECONDS = 300

WORLD_NOTICE = (
    "Local preview with separate key custody: the world server holds only "
    "its own receiver key; each participant's owner and worker keys stay "
    "with that participant's client. Tokens are bearer strings, not "
    "authentication."
)

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$")
_IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
_PUBKEY = re.compile(r"^[0-9a-fA-F]{64}$")
_SIG = re.compile(r"^[0-9a-fA-F]{128}$")


class WorldAuthError(Exception):
    """Bearer token / participant mismatch -> HTTP 403."""


class WorldRuleError(Exception):
    """Common-world-rule violation -> HTTP 409 with a WORLD_RULE_* code.

    Distinct from gate decisions: no receipt is minted, nothing is signed.
    """

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code


class WorldRules:
    """Layer 1: admission, moderation, spam limits, shared-space behavior."""

    @staticmethod
    def check_offer_allowed(open_count: int) -> None:
        if open_count >= MAX_OPEN_OFFERS_PER_PARTICIPANT:
            raise WorldRuleError(
                "WORLD_RULE_OFFER_LIMIT",
                f"at most {MAX_OPEN_OFFERS_PER_PARTICIPANT} open offers per participant",
            )

    @staticmethod
    def check_listing_allowed(open_count: int) -> None:
        # The shared open-listing cap: offers and needs count together per
        # participant. Offers keep the legacy code for compatibility; needs
        # trip the listing-scoped code.
        if open_count >= MAX_OPEN_OFFERS_PER_PARTICIPANT:
            raise WorldRuleError(
                "WORLD_RULE_LISTING_LIMIT",
                f"at most {MAX_OPEN_OFFERS_PER_PARTICIPANT} open listings per participant",
            )

    @staticmethod
    def check_presence_allowed(last_ts: float, now: float) -> None:
        if now - last_ts < PRESENCE_MIN_INTERVAL_SECONDS:
            raise WorldRuleError(
                "WORLD_RULE_PRESENCE_THROTTLE",
                "presence updates are throttled",
            )

    @staticmethod
    def moderate_text(value: Any, max_len: int, field_name: str) -> str:
        if not isinstance(value, str) or not value.strip() or len(value) > max_len:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", field_name)
        return value.strip()

    @staticmethod
    def moderate_optional_text(value: Any, max_len: int, field_name: str) -> str | None:
        if value is None:
            return None
        return WorldRules.moderate_text(value, max_len, field_name)


# ---------------------------------------------------------------------------
# LAYER 2 -- owner rules: one server receiver, client-held keys
# ---------------------------------------------------------------------------

# Snapshot file: the server gate key plus per-session authority records.
# Lives under the world's data root. Removed by reset().
SNAPSHOT_FILENAME = "world-snapshot.json"
SNAPSHOT_SCHEMA = "openline-world-snapshot/v1"


@dataclass
class ParticipantSession:
    participant_id: str
    display_name: str
    agent_id: str
    agent_display_name: str
    # The worker's public key, proven at join (proof-of-control) and pinned
    # to the mandate's subject_public_key. The server never holds the
    # worker's private key.
    agent_public_key: str
    token: str             # opaque bearer string, not authentication
    # Pinned owner authority: principal id + root public key from the
    # owner-signed bundle, verified at join and re-checked on every refresh.
    owner_principal_id: str
    owner_root_public_key: str
    worker_public_key: str  # == agent_public_key; the presentation binding key
    mandate_id: str
    mandate_scopes: list[str] = field(default_factory=list)
    # The latest verified owner-signed authority bundle, and the admitted
    # head hash the receiver evaluates against.
    authority_bundle: dict[str, Any] = field(default_factory=dict)
    authority_head_hash: str | None = None
    # True once a refresh admitted a bundle where the subject's mandate is
    # REVOKED (or absent). Terminal for this session's gated actions.
    revoked: bool = False
    # Server-signed ALLOWED receipts for this participant's gated actions.
    receipts: list[dict[str, Any]] = field(default_factory=list)
    joined_at: str = ""
    presence: dict[str, Any] | None = None
    last_presence_ts: float = 0.0
    # Epoch seconds of the last standing check the world layer performed or
    # observed (join, _assert_standing, a completed gate evaluation). A
    # consequential action with a stale or unknown value HOLDS instead of
    # assuming the standing still holds. Never serialized to other parties.
    standing_checked_at: float | None = None
    # Honest population: "host" | "real" | "seeded". Real joins are "real";
    # "seeded" marks demo-seeded listings (which have no session at all).
    kind: str = "real"
    # TRACK A -- activity mode: "manual" | "automation" | "scripted" |
    # "live". Human-driven browser sessions are "manual" (the join
    # default). "automation" is assigned only by delegate() -- it records
    # that the owner handed this session to a deterministic worker loop;
    # no in-process worker runs in this server (separate key custody: the
    # server cannot sign for the participant). Tutorial playback actors
    # are "scripted". "live" is reserved for a genuinely connected runtime:
    # none exists in this preview, so it is never assigned.
    activity_mode: str = "manual"
    # TRACK A -- owner pause switch (POST /api/world/agent/pause). A paused
    # session's delegation is inert. Separate from revocation, which stops
    # the NEXT gated action.
    paused: bool = False


def _receipt_id(receipt: dict[str, Any]) -> str:
    sig = receipt.get("signature") or {}
    value = sig.get("value", "") if isinstance(sig, dict) else ""
    return str(value)[:16]


def _public_receipt(receipt: dict[str, Any]) -> dict[str, Any]:
    keep = ["schema", "gate_id", "gate_public_key", "principal_id", "mandate_id",
            "subject_id", "action", "decision", "reason_codes", "presentation_hash",
            "decided_at", "signature"]
    return {k: receipt.get(k) for k in keep}


class World:
    """The shared world. Two participant sessions coexist; authority never does."""

    def __init__(self, data_root: Path | None = None,
                 transport: Transport | None = None) -> None:
        self._data_root = Path(data_root) if data_root else (
            Path(__file__).resolve().parent / "data" / "world")
        self._data_root.mkdir(parents=True, exist_ok=True)
        self.sessions: dict[str, ParticipantSession] = {}
        self.offers: dict[str, dict[str, Any]] = {}
        self.needs: dict[str, dict[str, Any]] = {}
        self.agreements: dict[str, dict[str, Any]] = {}
        self.transactions: dict[str, dict[str, Any]] = {}
        self.shared_receipts: list[dict[str, Any]] = []
        self._challenges: dict[str, float] = {}
        self.events = EventLog(max_events=500)
        # TRACK A -- owner delegations (participant_id -> record) and owner
        # escalations (escalation_id -> record). See the delegate() /
        # escalations_for() / resolve_escalation() methods and
        # backend/agent_worker.py. Both are session-scoped: reset() clears
        # them with the sessions they belonged to.
        self.delegations: dict[str, dict[str, Any]] = {}
        self.escalations: dict[str, dict[str, Any]] = {}
        # UNATTENDED COMMISSION -- simulated-funds ledger and commission
        # state (backend/commission.py). Simulated funds only; cost events
        # are never provider invoices.
        self.simulated_balances: dict[str, int] = {}
        self.commission_contracts: dict[str, dict[str, Any]] = {}
        self.commissions: dict[str, dict[str, Any]] = {}
        self.commission_ledger: list[dict[str, Any]] = []
        # Coarse lock held by the deterministic worker around one tick so a
        # tick never interleaves with itself. HTTP handlers do not take it
        # (same posture as two concurrent handlers today).
        self._lock = threading.Lock()
        # The claim-graph chapter: two inspectable reports on the reading
        # desk (see claim_graph_chapter.py). A correction/withdrawal event is
        # appended only through claimgraph_correct below -- a real gated
        # action through the participant's own gate, never a free write.
        self.claim_graph = ClaimGraphChapter()
        # The newsroom chapter: the owner-selected report on the small desk,
        # manually imported dispatches, and an append-only review history.
        # Import and review are gated below through the participant's own
        # gate ("newsroom.review") -- never free writes.
        self.newsroom = NewsroomChapter()
        # Message carriage only: presence/event notices travel as versioned
        # envelopes through this transport. Gate evaluations, wallets,
        # receipts, and transaction records stay in this module -- the
        # transport never touches them.
        self.transport: Transport = transport if transport is not None else LocalTransport()
        # Idempotency ledger: (participant_id, action_label, idempotency_key)
        # -> {"ref": action_ref, "result": <stored outcome>}. Only successful
        # outcomes are recorded.
        self._idempotency: dict[tuple[str, str, str], dict[str, Any]] = {}
        # The world's own receiver: exactly one Ed25519 key, the server's.
        # Restored from the snapshot when present, generated otherwise.
        self.gate = EffectGate("world-receiver")
        self._load_snapshot()

    # -- layer 1: admission -------------------------------------------------
    def challenge(self) -> dict[str, str]:
        """Issue a single-use nonce for proof-of-control at join."""
        now = time.time()
        for nonce, issued in list(self._challenges.items()):
            if now - issued > NONCE_TTL_SECONDS:
                del self._challenges[nonce]
        nonce = secrets.token_hex(16)
        self._challenges[nonce] = now
        return {"nonce": nonce}

    def _id_field(self, value: Any, field_name: str) -> str:
        if not isinstance(value, str) or _ID.fullmatch(value) is None:
            raise WalletError("JOIN_PROFILE_INVALID", field_name)
        return value

    @staticmethod
    def _principal_id_field(value: Any) -> str:
        # Wallet principal ids are namespaced ("openline:principal:<hex>"):
        # a non-empty opaque string, never a path or a glob.
        if (not isinstance(value, str) or not value or len(value) > 128
                or any(c in value for c in "\n\r\t /\\")):
            raise WalletError("JOIN_PROFILE_INVALID", "owner.principal_id")
        return value

    def _agent_public_key(self, value: Any) -> str:
        if not isinstance(value, str) or _PUBKEY.fullmatch(value) is None:
            raise WalletError("JOIN_PROFILE_INVALID", "agent.public_key")
        return value.lower()

    def _verify_proof(self, public_key: str, nonce: str, signature: Any) -> None:
        try:
            if not isinstance(signature, str) or _SIG.fullmatch(signature) is None:
                raise ValueError("bad signature encoding")
            pub = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key))
            pub.verify(bytes.fromhex(signature), nonce.encode("utf-8"))
        except Exception as exc:
            raise WalletError("JOIN_PROOF_INVALID", "signature verification failed") from exc

    def join(self, profile: Any) -> dict[str, Any]:
        """Admit a participant on the strength of their owner's signed
        authority -- without the server ever holding their keys.

        Requires: owner {principal_id, root_public_key}, mandate_bundle (the
        owner's signed wallet export), mandate {scopes}, agent {id,
        public_key}, and the worker proof-of-control. The server verifies
        the bundle signature, checks the pinned principal/root, admits the
        head (monotonic; forks quarantine), and requires exactly one ACTIVE
        mandate for the subject whose subject_public_key equals the agent's
        public key and whose scopes equal the profile's. Join proves key
        control; it grants no action permission.
        """
        if not isinstance(profile, dict):
            raise WalletError("JOIN_PROFILE_INVALID", "profile")
        if profile.get("version") != JOIN_PROFILE_VERSION:
            raise WalletError("JOIN_PROFILE_VERSION_UNSUPPORTED")
        participant = profile.get("participant") or {}
        agent = profile.get("agent") or {}
        proof = profile.get("proof") or {}
        owner = profile.get("owner") or {}
        mandate = profile.get("mandate") or {}
        capabilities = profile.get("capabilities")

        pid = self._id_field(participant.get("id"), "participant.id")
        display = WorldRules.moderate_text(
            participant.get("display_name"), 40, "participant.display_name")
        aid = self._id_field(agent.get("id"), "agent.id")
        adisplay = WorldRules.moderate_text(
            agent.get("display_name"), 40, "agent.display_name")
        apub = self._agent_public_key(agent.get("public_key"))

        if pid in self.sessions:
            raise WalletError("JOIN_STANDING_NOT_CURRENT",
                              "participant already holds a current standing")

        owner_principal = self._principal_id_field(owner.get("principal_id"))
        owner_root = self._agent_public_key(owner.get("root_public_key"))

        bundle = profile.get("mandate_bundle")
        if not isinstance(bundle, dict):
            raise WalletError("JOIN_PROFILE_INVALID", "mandate_bundle")
        # Verifies the owner-root signature; raises on forgery or bad shape.
        verified, timeline = verify_bundle(bundle)
        if (verified["principal"]["principal_id"] != owner_principal
                or str(verified["principal"]["root_public_key"]).lower() != owner_root):
            raise WalletError("JOIN_PRINCIPAL_MISMATCH",
                              "bundle principal does not match the owner block")

        scopes = mandate.get("scopes")
        if not isinstance(scopes, list) or not scopes or len(scopes) > 16:
            raise WalletError("JOIN_STANDING_NOT_CURRENT",
                              "no current mandate standing: scopes not granted")
        clean_scopes: list[str] = []
        for s in scopes:
            if not isinstance(s, str) or s not in SUPPORTED_SCOPES:
                raise WalletError("JOIN_STANDING_NOT_CURRENT",
                                  f"scope not grantable in this preview: {s!r}")
            clean_scopes.append(s)
        if (not isinstance(capabilities, list) or not capabilities
                or len(capabilities) > 16
                or any(not isinstance(c, str) or not c for c in capabilities)):
            raise WalletError("JOIN_PROFILE_INVALID", "capabilities")

        # Exactly one ACTIVE mandate for this subject in the verified
        # bundle: its subject key must be the agent's key and its scopes
        # must equal the profile's.
        now = utc_now()
        active = [m for m in timeline.mandates.values()
                  if m.get("subject_id") == aid
                  and m.get("status") == "ACTIVE"
                  and parse_time(m["expires_at"]) > now]
        if not active:
            raise WalletError("JOIN_MANDATE_MISSING",
                              "no active mandate for the subject in the bundle")
        if len(active) > 1:
            raise WalletError("JOIN_MANDATE_AMBIGUOUS",
                              "more than one active mandate for the subject")
        grant = active[0]
        if str(grant.get("subject_public_key") or "").lower() != apub:
            raise WalletError("JOIN_SUBJECT_KEY_MISMATCH",
                              "agent public key is not the mandate's subject key")
        if sorted(grant.get("scopes") or []) != sorted(clean_scopes):
            raise WalletError("JOIN_SCOPES_MISMATCH",
                              "mandate scopes do not match the join profile")
        mandate_id = str(grant["mandate_id"])

        # Pin the owner root, then admit the head (monotonic; forks
        # quarantine). The receiver evaluates against this admitted head.
        self.gate.pin_principal(owner_principal, owner_root)
        admission = self.gate.admit_bundle(verified)

        # Proof of control, unchanged: the worker signs a server-issued
        # single-use nonce with its own key.
        nonce = proof.get("nonce")
        issued = self._challenges.pop(nonce, None) if isinstance(nonce, str) else None
        if issued is None or time.time() - issued > NONCE_TTL_SECONDS:
            raise WalletError("JOIN_PROOF_INVALID", "unknown, used, or expired nonce")
        self._verify_proof(apub, nonce, proof.get("signature"))

        token = secrets.token_urlsafe(32)
        joined_at = utc_now().isoformat()
        self.sessions[pid] = ParticipantSession(
            participant_id=pid, display_name=display, agent_id=aid,
            agent_display_name=adisplay, agent_public_key=apub, token=token,
            owner_principal_id=owner_principal,
            owner_root_public_key=owner_root,
            worker_public_key=apub, mandate_id=mandate_id,
            mandate_scopes=sorted(clean_scopes),
            authority_bundle=verified,
            authority_head_hash=admission["head_hash"],
            joined_at=joined_at, standing_checked_at=time.time(), kind="real",
        )
        self.events.emit(
            source="world", kind="join", provenance="world-rules",
            summary=f"{display} joined the world as {aid}.",
            detail={"participant_id": pid, "agent_id": aid,
                    "mandate_id": mandate_id, "scopes": sorted(clean_scopes),
                    "admission": admission["decision"]},
        )
        self._emit_envelope("join", {
            "participant_id": pid, "agent_id": aid,
            "display_name": display, "standing": "current",
        })
        self.save()
        return {
            "participant_id": pid, "agent_id": aid, "token": token,
            "mandate_id": mandate_id, "standing": "current",
            "world": {"location": "workshop", "version": 1},
        }

    # -- auth boundary (bearer token check) ----------------------------------
    def _auth(self, participant_id: Any, token: Any) -> ParticipantSession:
        session = self.sessions.get(participant_id) if isinstance(participant_id, str) else None
        if session is None or not isinstance(token, str) or not secrets.compare_digest(session.token, token):
            raise WorldAuthError("WORLD_AUTH_MISMATCH")
        return session

    def _emit_envelope(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Send one versioned envelope through the transport (message
        carriage only). Raises TransportError if the transport cannot
        deliver; the caller decides whether that fails the operation. The
        world's own records (events, receipts, transactions) are committed
        before this is called, so a transport failure never silently loses
        an outcome -- and an idempotent retry returns the stored result."""
        return self.transport.send_envelope({
            "envelope_version": ENVELOPE_VERSION,
            "kind": kind,
            "payload": payload,
        })

    def _require_fresh_standing(self, session: ParticipantSession) -> None:
        """Offline rule: standing information must be current before a
        consequential action is evaluated. Stale (older than
        MAX_STANDING_AGE_SECONDS) or unknown -> HOLD. Mints no receipt,
        evaluates nothing, applies no effects. Never assumes a disconnected
        peer knows the latest revocation."""
        checked = session.standing_checked_at
        if checked is None or (time.time() - checked) > MAX_STANDING_AGE_SECONDS:
            raise WalletError(
                "HOLD_STANDING_UNKNOWN",
                "standing cannot be established as current: "
                "re-check standing before this action")

    def _active_mandate(self, session: ParticipantSession) -> dict[str, Any] | None:
        """The session's mandate as of the latest admitted authority bundle.
        None when the mandate is revoked, absent, expired, or the bundle no
        longer verifies. The admitted bundle -- not any local copy -- is the
        source of truth."""
        try:
            _, timeline = verify_bundle(session.authority_bundle)
        except WalletError:
            return None
        mandate = timeline.mandates.get(session.mandate_id)
        if mandate is None or mandate.get("status") != "ACTIVE":
            return None
        try:
            if parse_time(mandate["expires_at"]) <= utc_now():
                return None
        except WalletError:
            return None
        return mandate

    def _assert_standing(self, session: ParticipantSession) -> None:
        """Layer-1 standing re-check before a consequential world action.

        Freshness first: a stale or unknown standing check HOLDS
        (HOLD_STANDING_UNKNOWN) without evaluating anything. Then the
        mandate check against the latest admitted authority: a revoked,
        unknown, or expired mandate is JOIN_STANDING_NOT_CURRENT. A passing
        check records standing_checked_at.

        For the generic propose() the world checks freshness only, so a
        revoked mandate still reaches the receiver and the signed STOPPED
        verdict (not a world-layer error) is the response.
        """
        self._require_fresh_standing(session)
        if session.revoked or self._active_mandate(session) is None:
            raise WalletError("JOIN_STANDING_NOT_CURRENT")
        session.standing_checked_at = time.time()

    # -- layer 2: presentations at the server receiver -----------------------
    def gate_challenge(self, participant_id: Any, token: Any,
                       action: Any) -> dict[str, str]:
        """Issue a single-use receiver challenge for one exact action, bound
        to this participant's principal and agent. The client signs a
        worker-signed presentation against it; the receiver evaluates that
        presentation and signs the verdict."""
        session = self._auth(participant_id, token)
        if not isinstance(action, str) or _ID.fullmatch(action) is None:
            raise WalletError("WORLD_ACTION_INVALID")
        challenge = self.gate.issue_challenge(
            principal_id=session.owner_principal_id,
            subject_id=session.agent_id,
            action=action,
        )
        return {"challenge": challenge}

    def _evaluate_presentation(self, session: ParticipantSession, action: str,
                               presentation: Any) -> dict[str, Any]:
        """Evaluate one worker-signed presentation at the server receiver.

        Binding first: the presentation must name this session's principal,
        agent, and worker public key, else WORLD_PRESENTATION_BINDING. Then
        the real gate evaluation; the receipt signature is verified against
        the server gate key (WORLD_RECEIPT_INVALID on failure). An ALLOWED
        receipt is appended to the session's receipts and re-stamps
        standing. A STOPPED receipt is returned as-is: the signed refusal
        is the response, never a silent allow. Missing presentation ->
        WORLD_AUTHORIZATION_MISSING.
        """
        if not isinstance(presentation, dict):
            raise WalletError("WORLD_AUTHORIZATION_MISSING",
                              "this action requires a worker-signed presentation")
        if (presentation.get("principal_id") != session.owner_principal_id
                or presentation.get("subject_id") != session.agent_id
                or str(presentation.get("subject_public_key") or "").lower()
                   != session.worker_public_key):
            raise WalletError("WORLD_PRESENTATION_BINDING",
                              "presentation does not bind to this session")
        receipt = self.gate.evaluate(presentation, expected_action=action)
        valid, reason = verify_record(receipt,
                                      expected_public_key=self.gate.public_key)
        if valid is not True:
            raise WalletError("WORLD_RECEIPT_INVALID", reason or "")
        if receipt["decision"] == "ALLOWED":
            session.receipts.append(receipt)
            session.standing_checked_at = time.time()
        return receipt

    @staticmethod
    def _require_allowed(receipt: dict[str, Any]) -> dict[str, Any]:
        """A STOPPED authorization authorizes nothing: the act cannot
        proceed. The signed refusal surfaces as an explicit error."""
        if receipt["decision"] != "ALLOWED":
            raise WalletError("WORLD_AUTHORIZATION_REFUSED",
                              ";".join(receipt.get("reason_codes") or []))
        return receipt

    def _store_authorization(self, session: ParticipantSession, action: str,
                             presentation: Any) -> dict[str, Any]:
        """Evaluate a presentation for an explicit authorizing act and store
        the authorization artifact: the ALLOWED receipt, the presentation,
        and the authority head hash it was evaluated against (for the
        submit-time staleness re-check)."""
        receipt = self._require_allowed(
            self._evaluate_presentation(session, action, presentation))
        return {
            "receipt": receipt,
            "presentation": copy.deepcopy(presentation),
            "authority_head_hash": session.authority_head_hash,
            "mandate_id": receipt.get("mandate_id"),
            "authorized_at": utc_now().isoformat(),
        }

    # -- idempotency -------------------------------------------------------
    @staticmethod
    def _clean_idempotency_key(value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or _IDEMPOTENCY_KEY.fullmatch(value) is None:
            raise WalletError("WORLD_IDEMPOTENCY_KEY_INVALID", "idempotency_key")
        return value

    def _idempotent(self, participant_id: str, label: str, ref: Any,
                    idempotency_key: str | None, execute: Any) -> tuple[dict[str, Any], bool]:
        """Idempotent execution wrapper. Same key + same participant + same
        action (label + ref) -> the ORIGINAL stored result, with no new
        receipts and no new effects. Returns (result, replayed): replayed is
        True when the result came from the ledger rather than a fresh
        execution. A failed execute() stores nothing, so a retry re-executes.
        Reusing a key for a different action is a conflict, never a silent
        overwrite."""
        if idempotency_key is None:
            return execute(), False
        slot = (participant_id, label, idempotency_key)
        prior = self._idempotency.get(slot)
        if prior is not None:
            if prior["ref"] != ref:
                raise WalletError(
                    "WORLD_IDEMPOTENCY_CONFLICT",
                    "idempotency key reused for a different action")
            return copy.deepcopy(prior["result"]), True
        result = execute()
        self._idempotency[slot] = {"ref": ref, "result": copy.deepcopy(result)}
        return result, False

    # -- layer 1: shared-space behavior --------------------------------------
    def presence(self, participant_id: Any, token: Any, presence: Any) -> dict[str, bool]:
        session = self._auth(participant_id, token)
        if presence is None:
            session.presence = None
        else:
            if not isinstance(presence, dict):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "presence")
            status = WorldRules.moderate_text(presence.get("status"), 24, "presence.status")
            note = WorldRules.moderate_optional_text(presence.get("note"), 280, "presence.note")
            WorldRules.check_presence_allowed(session.last_presence_ts, time.time())
            session.presence = {"status": status, "note": note}
            session.last_presence_ts = time.time()
        self.events.emit(
            source="world", kind="presence", provenance="world-rules",
            summary=f"{session.display_name} updated presence.",
            detail={"participant_id": session.participant_id},
        )
        self._emit_envelope("presence", {
            "participant_id": session.participant_id,
            "presence": dict(session.presence) if session.presence else None,
        })
        self.save()
        return {"ok": True}

    # -- layer 1: listings (offers and needs) ----------------------------------
    @staticmethod
    def _clean_task(task: Any) -> tuple[str, str, str, list[str]]:
        """Validate a posted task. The detail is UNTRUSTED input: it is
        stored for display and never reaches a receiver except through the
        allowlisted TASK_KINDS mapping at evaluation time."""
        if not isinstance(task, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "task")
        kind = task.get("kind")
        if kind not in TASK_KINDS:
            raise WorldRuleError("WORLD_RULE_OFFER_KIND_INVALID", f"kind: {kind!r}")
        title = WorldRules.moderate_text(task.get("title"), 80, "task.title")
        detail = WorldRules.moderate_text(task.get("detail"), 2000, "task.detail")
        terms_in = task.get("terms") or {}
        if not isinstance(terms_in, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "task.terms")
        requires = terms_in.get("requires") or []
        if (not isinstance(requires, list) or len(requires) > 4
                or any(r not in REQUIRES_PARTIES for r in requires)):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "task.terms.requires")
        return kind, title, detail, list(requires)

    def _open_listing_count(self, participant_id: str) -> int:
        """Open offers AND needs count together toward the per-participant cap."""
        return sum(1 for listing in list(self.offers.values()) + list(self.needs.values())
                   if listing["from_participant"] == participant_id
                   and listing["status"] == "open")

    def _create_listing(self, session: ParticipantSession, side: str,
                        kind: str, title: str, detail: str,
                        requires: list[str],
                        authorization: dict[str, Any] | None = None) -> dict[str, Any]:
        """Commit one open listing. A listing is a proposal only -- it
        obligates nobody and authorizes nothing. The optional authorization
        is the poster's evaluated presentation artifact (offer, or a need
        posted with one)."""
        self._assert_standing(session)
        if side == "offer":
            WorldRules.check_offer_allowed(self._open_listing_count(session.participant_id))
        else:
            WorldRules.check_listing_allowed(self._open_listing_count(session.participant_id))
        prefix = "offer" if side == "offer" else "need"
        listing_id = f"{prefix}-{uuid.uuid4().hex[:12]}"
        record = {
            "listing_id": listing_id,
            f"{prefix}_id": listing_id,  # legacy key: offers keep "offer_id"
            "side": side,
            "from_participant": session.participant_id,
            "from_display_name": session.display_name,
            "from_kind": session.kind,
            "task": {"kind": kind, "title": title, "detail": detail},
            "terms": {"requires": list(requires)},
            "status": "open",
            "sample": False,
            "created_at": utc_now().isoformat(),
            # The poster's stored authorization artifact (ALLOWED receipt +
            # presentation + authority head hash), or None.
            "authorization": copy.deepcopy(authorization) if authorization else None,
        }
        (self.offers if side == "offer" else self.needs)[listing_id] = record
        self.events.emit(
            source="world", kind=side, provenance="world-rules",
            summary=f"{session.display_name} posted a {side}: {title}.",
            detail={f"{prefix}_id": listing_id, "kind": kind,
                    "requires": list(requires)},
        )
        return record

    def _find_listing(self, listing_id: Any) -> tuple[dict[str, Any] | None, str | None]:
        """Look up an offer or need by id. Returns (record, side) or (None, None)."""
        if not isinstance(listing_id, str):
            return None, None
        if listing_id in self.offers:
            return self.offers[listing_id], "offer"
        if listing_id in self.needs:
            return self.needs[listing_id], "need"
        return None, None

    def offer(self, participant_id: Any, token: Any, task: Any,
              authorization: Any = None,
              idempotency_key: Any = None) -> dict[str, str]:
        """Post a task offer. An offer is a proposal only -- it obligates
        nobody and authorizes nothing. Acceptance is a separate explicit act.

        The poster authorizes their side at posting: their worker-signed
        presentation is evaluated now (missing -> WORLD_AUTHORIZATION_
        MISSING; STOPPED -> WORLD_AUTHORIZATION_REFUSED) and the ALLOWED
        receipt + presentation are stored on the listing for the exchange.
        """
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        kind, title, detail, requires = self._clean_task(task)

        def execute() -> dict[str, str]:
            self._assert_standing(session)
            # World rules first: a refused post evaluates nothing and mints
            # no receipt -- the cap is policy, not a gate decision.
            WorldRules.check_offer_allowed(
                self._open_listing_count(session.participant_id))
            auth = self._store_authorization(session, TASK_KINDS[kind],
                                             authorization)
            record = self._create_listing(session, "offer", kind, title,
                                          detail, requires,
                                          authorization=auth)
            self.save()
            return {"offer_id": record["listing_id"]}

        result, replayed = self._idempotent(
            session.participant_id, "offer", (kind, title, detail,
                                             tuple(requires)),
            key, execute)
        if not replayed:
            self._emit_envelope("offer", {
                "offer_id": result["offer_id"],
                "from_participant": session.participant_id,
                "kind": kind, "title": title,
            })
        return result

    def need(self, participant_id: Any, token: Any, task: Any,
             authorization: Any = None,
             idempotency_key: Any = None) -> dict[str, str]:
        """Post a REQUEST for work. A need is a proposal only -- it obligates
        nobody and authorizes nothing. The need's detail is UNTRUSTED: it is
        stored for display and never reaches a receiver except through the
        allowlisted kind->action mapping if an agreement is later submitted.
        Forming an obligation takes two further explicit acts (propose +
        agree) plus a submit through the receiver.

        No gate: a need is a request, not an action. An optional
        authorization may be attached; it is evaluated at need time and
        auto-attaches as the need-poster's authorization on agreements
        formed from the need.
        """
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        kind, title, detail, requires = self._clean_task(task)

        def execute() -> dict[str, str]:
            self._assert_standing(session)
            # World rules first: a refused post evaluates nothing.
            WorldRules.check_listing_allowed(
                self._open_listing_count(session.participant_id))
            auth = (self._store_authorization(session, TASK_KINDS[kind],
                                              authorization)
                    if authorization is not None else None)
            record = self._create_listing(session, "need", kind, title,
                                          detail, requires,
                                          authorization=auth)
            self.save()
            return {"need_id": record["listing_id"]}

        result, replayed = self._idempotent(
            session.participant_id, "need", (kind, title, detail,
                                            tuple(requires)),
            key, execute)
        if not replayed:
            self._emit_envelope("need", {
                "need_id": result["need_id"],
                "from_participant": session.participant_id,
                "kind": kind, "title": title,
            })
        return result

    # -- layer 3: shared authorization helpers ---------------------------------
    @staticmethod
    def _stored_allowed(auth: Any) -> dict[str, Any]:
        """A stored authorization artifact must carry an ALLOWED receipt, or
        the exchange cannot use it."""
        if (not isinstance(auth, dict) or not isinstance(auth.get("receipt"), dict)
                or auth["receipt"].get("decision") != "ALLOWED"):
            raise WalletError("WORLD_AUTHORIZATION_MISSING",
                              "a party's stored authorization is missing or not ALLOWED")
        return auth

    # -- layer 3: transaction terms (offer + explicit acceptance) ------------
    def accept_offer(self, participant_id: Any, token: Any, offer_id: Any,
                     authorization: Any = None,
                     idempotency_key: Any = None) -> dict[str, Any]:
        """Acceptance is always the acceptor's explicit act. The acceptor's
        worker-signed presentation is evaluated now (missing ->
        WORLD_AUTHORIZATION_MISSING; STOPPED -> WORLD_AUTHORIZATION_
        REFUSED); the poster's stored receipt -- evaluated at posting -- is
        reused, provided the poster's authority head has not moved since
        (WORLD_AUTHORITY_STALE otherwise). Offer detail is UNTRUSTED: only
        the allowlisted kind->action mapping reaches a receiver.

        Standing freshness applies to the acting party: a stale standing
        HOLDS (HOLD_STANDING_UNKNOWN) before anything is evaluated.
        """
        me = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        ref = offer_id if isinstance(offer_id, str) else None

        def execute() -> dict[str, Any]:
            self._assert_standing(me)
            offer = self.offers.get(offer_id) if isinstance(offer_id, str) else None
            if offer is None:
                raise WalletError("WORLD_OFFER_UNKNOWN")
            if offer["status"] != "open":
                raise WalletError("WORLD_OFFER_NOT_OPEN")
            if offer["from_participant"] == me.participant_id:
                raise WorldRuleError("WORLD_RULE_SELF_ACCEPT")
            if offer.get("sample"):
                # Sample listings are demo content: no real party stands
                # behind them, so no exchange can be formed from one.
                raise WorldRuleError("WORLD_RULE_SEEDED_LISTING",
                                     "sample listings cannot form agreements")
            poster = self.sessions.get(offer["from_participant"])
            if poster is None:
                raise WalletError("WORLD_PARTY_UNKNOWN")

            action = TASK_KINDS[offer["task"]["kind"]]
            acceptor_auth = self._store_authorization(me, action, authorization)
            poster_auth = self._stored_allowed(offer.get("authorization"))
            if poster.authority_head_hash != poster_auth["authority_head_hash"]:
                # The poster's authority moved after posting (revoked, narrowed,
                # or re-issued): the banked authorization is no longer current.
                # This closes the revocation-between-post-and-accept gap in the
                # legacy single-step path; the agreement path checks the same
                # thing at submit time.
                raise WalletError(
                    "WORLD_AUTHORITY_STALE",
                    "the poster's authority changed since this offer was "
                    "posted: re-authorize before accepting")

            offer["status"] = "accepted"
            tx_id = f"tx-{uuid.uuid4().hex[:12]}"
            self.transactions[tx_id] = {
                "transaction_id": tx_id,
                "offer_id": offer_id,
                "offerer": offer["from_participant"],
                "acceptor": me.participant_id,
                "task": dict(offer["task"]),
                "terms": dict(offer["terms"]),
                "status": "accepted",
                "receipts": {"acceptor": _receipt_id(acceptor_auth["receipt"]),
                             "offerer": _receipt_id(poster_auth["receipt"])},
                "decided_at": utc_now().isoformat(),
            }
            self.events.emit(
                source="world", kind="transaction", provenance="receiver-signed",
                summary=(f"Exchange {tx_id} accepted: {action} for {me.display_name}."),
                detail={"transaction_id": tx_id, "status": "accepted",
                        "parties": ["acceptor", "offerer"]},
            )
            self.save()
            return {
                "decision": "ALLOWED",
                "receipt_id": _receipt_id(acceptor_auth["receipt"]),
                "reason_codes": [],
                "transaction_id": tx_id,
            }

        result, replayed = self._idempotent(
            me.participant_id, "accept", ref, key, execute)
        if not replayed:
            # The outcome is committed (and idempotency-recorded) before the
            # bus is notified: a transport failure here surfaces to the
            # caller, but a retry with the same key returns this result --
            # the exchange can never be applied twice.
            tx = self.transactions[result["transaction_id"]]
            self._emit_envelope("transaction", {
                "transaction_id": result["transaction_id"],
                "status": tx["status"],
                "offer_id": tx["offer_id"],
                "parties": {"offerer": tx["offerer"], "acceptor": tx["acceptor"]},
                "decision": result["decision"],
            })
        return result

    # -- layer 3: agreements (explicit two-act lifecycle) -----------------------
    @staticmethod
    def _record_transition(agreement: dict[str, Any], status: str) -> None:
        """Append one real state transition to the agreement's history."""
        agreement["status"] = status
        agreement["history"].append({"status": status, "at": utc_now().isoformat()})

    def _get_agreement(self, agreement_id: Any) -> dict[str, Any]:
        agreement = (self.agreements.get(agreement_id)
                     if isinstance(agreement_id, str) else None)
        if agreement is None:
            raise WalletError("WORLD_AGREEMENT_UNKNOWN")
        return agreement

    def _agreement_parties(self, agreement: dict[str, Any]) -> dict[str, str]:
        return {"proposer": agreement["proposer"],
                "counterpart": agreement["counterpart"]}

    def propose_agreement(self, participant_id: Any, token: Any,
                          listing_id: Any, authorization: Any = None,
                          idempotency_key: Any = None) -> dict[str, Any]:
        """Record the proposer's explicit agreement to an open listing's
        terms (status "proposed"). The listing owner becomes the counterpart.
        Proposing to your own listing, or to a sample (seeded) listing, is
        refused as a world rule. The proposer's worker-signed presentation is
        evaluated now and its ALLOWED receipt stored on the agreement --
        nothing is obligated yet; a proposal records one party's consent
        plus their authorization artifact. The terms are snapshotted from
        the listing at proposal time. On a need posted with an authorization,
        the need-poster's authorization auto-attaches as the counterpart's.
        """
        me = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        ref = listing_id if isinstance(listing_id, str) else None

        def execute() -> dict[str, Any]:
            self._assert_standing(me)
            listing, side = self._find_listing(listing_id)
            if listing is None:
                raise WalletError("WORLD_LISTING_UNKNOWN")
            if listing["status"] != "open":
                raise WalletError("WORLD_LISTING_NOT_OPEN")
            if listing["from_participant"] == me.participant_id:
                raise WorldRuleError("WORLD_RULE_SELF_PROPOSE",
                                     "cannot propose an agreement on your own listing")
            if listing.get("sample"):
                raise WorldRuleError("WORLD_RULE_SEEDED_LISTING",
                                     "sample listings cannot form agreements")
            action = TASK_KINDS[listing["task"]["kind"]]
            proposer_auth = self._store_authorization(me, action, authorization)
            agreement_id = f"agr-{uuid.uuid4().hex[:12]}"
            agreement: dict[str, Any] = {
                "agreement_id": agreement_id,
                "listing_id": listing["listing_id"],
                "listing_side": side,
                "task_kind": listing["task"]["kind"],
                "proposer": me.participant_id,
                "proposer_display_name": me.display_name,
                "counterpart": listing["from_participant"],
                "terms": copy.deepcopy(listing["terms"]),
                "status": "proposed",
                "history": [],
                "created_at": utc_now().isoformat(),
                "receipts": {},
                "authorizations": {
                    "proposer": proposer_auth,
                    # Auto-match: a need posted with an authorization
                    # attaches the need-poster's artifact as the
                    # counterpart's until agree() stores a fresh one.
                    "counterpart": (
                        copy.deepcopy(listing["authorization"])
                        if side == "need" and listing.get("authorization")
                        else None),
                },
                "transaction_id": None,
                "decision": None,
            }
            self._record_transition(agreement, "proposed")
            self.agreements[agreement_id] = agreement
            self.events.emit(
                source="world", kind="agreement", provenance="world-rules",
                summary=(f"{me.display_name} proposed an agreement on "
                         f"{listing['from_display_name']}'s {side}: "
                         f"{listing['task']['title']}. One party's consent recorded; "
                         "the counterpart has not agreed."),
                detail={"agreement_id": agreement_id,
                        "listing_id": listing["listing_id"], "listing_side": side,
                        "proposer": me.participant_id,
                        "counterpart": listing["from_participant"]},
            )
            self.save()
            return {"agreement_id": agreement_id, "status": "proposed"}

        result, replayed = self._idempotent(
            me.participant_id, "agreement.propose", ref, key, execute)
        if not replayed:
            self._emit_envelope("agreement", {
                "agreement_id": result["agreement_id"],
                "listing_id": ref, "status": "proposed",
                "parties": self._agreement_parties(
                    self.agreements[result["agreement_id"]]),
            })
        return result

    def agree(self, participant_id: Any, token: Any, agreement_id: Any,
              authorization: Any = None,
              idempotency_key: Any = None) -> dict[str, Any]:
        """The counterpart's explicit act (status "agreed").

        "agreed" means BOTH parties' explicit agreement to the terms is now
        on record, and the counterpart's authorization artifact -- their
        worker-signed presentation evaluated now (missing ->
        WORLD_AUTHORIZATION_MISSING; STOPPED -> WORLD_AUTHORIZATION_
        REFUSED) -- is stored on the agreement, replacing any need-post
        auto-attached one. Nothing is obligated here: only submit() runs
        the exchange through the receiver. COUNTERPART ONLY may agree (the
        proposer agreeing with themselves is refused). Consent is recorded
        against the snapshotted terms even if the listing has since closed;
        only submit() requires the listing still open.
        """
        me = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        ref = agreement_id if isinstance(agreement_id, str) else None

        def execute() -> dict[str, Any]:
            self._assert_standing(me)
            agreement = self._get_agreement(agreement_id)
            if me.participant_id != agreement["counterpart"]:
                raise WorldRuleError("WORLD_RULE_NOT_COUNTERPART",
                                     "only the listing owner (counterpart) can agree")
            if agreement["status"] != "proposed":
                raise WalletError("WORLD_AGREEMENT_STATUS",
                                  f"cannot agree while status is {agreement['status']!r}")
            action = TASK_KINDS[agreement["task_kind"]]
            counterpart_auth = self._store_authorization(me, action, authorization)
            agreement["authorizations"]["counterpart"] = counterpart_auth
            self._record_transition(agreement, "agreed")
            self.events.emit(
                source="world", kind="agreement", provenance="world-rules",
                summary=(f"{me.display_name} agreed to the terms of agreement "
                         f"{agreement['agreement_id']}. Mutual consent recorded; "
                         "their authorization is stored -- a submit still has to "
                         "run the exchange through the receiver."),
                detail={"agreement_id": agreement["agreement_id"], "status": "agreed"},
            )
            self.save()
            return {"agreement_id": agreement["agreement_id"], "status": "agreed"}

        result, replayed = self._idempotent(
            me.participant_id, "agreement.agree", ref, key, execute)
        if not replayed:
            self._emit_envelope("agreement", {
                "agreement_id": result["agreement_id"], "status": "agreed",
                "parties": self._agreement_parties(
                    self.agreements[result["agreement_id"]]),
            })
        return result

    def decline(self, participant_id: Any, token: Any, agreement_id: Any,
                idempotency_key: Any = None) -> dict[str, Any]:
        """Either party declines a merely-proposed agreement (status
        "declined"). No receipts, no obligation, no effects. The listing
        stays open and both parties remain free to post or propose again."""
        me = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        ref = agreement_id if isinstance(agreement_id, str) else None

        def execute() -> dict[str, Any]:
            self._assert_standing(me)
            agreement = self._get_agreement(agreement_id)
            if me.participant_id not in (agreement["proposer"],
                                         agreement["counterpart"]):
                raise WorldRuleError("WORLD_RULE_NOT_PARTY",
                                     "only the agreement's parties can decline it")
            if agreement["status"] != "proposed":
                raise WalletError("WORLD_AGREEMENT_STATUS",
                                  f"cannot decline while status is {agreement['status']!r}")
            self._record_transition(agreement, "declined")
            self.events.emit(
                source="world", kind="agreement", provenance="world-rules",
                summary=(f"{me.display_name} declined agreement "
                         f"{agreement['agreement_id']}. No obligation, no receipts; "
                         "the listing stays open."),
                detail={"agreement_id": agreement["agreement_id"], "status": "declined"},
            )
            self.save()
            return {"agreement_id": agreement["agreement_id"], "status": "declined"}

        result, replayed = self._idempotent(
            me.participant_id, "agreement.decline", ref, key, execute)
        if not replayed:
            self._emit_envelope("agreement", {
                "agreement_id": result["agreement_id"], "status": "declined",
                "parties": self._agreement_parties(
                    self.agreements[result["agreement_id"]]),
            })
        return result

    def submit(self, participant_id: Any, token: Any, agreement_id: Any,
               idempotency_key: Any = None) -> dict[str, Any]:
        """Run an agreed exchange through the receiver.

        Either party may submit, but only when the status is "agreed":
        submit before the counterpart's explicit agree() is rejected
        (WORLD_AGREEMENT_NOT_AGREED) -- there is no agreement without both
        explicit acts. Submit takes no new presentation: it re-validates
        the stored authorizations. Each party's current authority head
        hash must equal the head hash recorded when their presentation was
        evaluated; if authority moved (refresh, revocation, narrow), the
        submit is refused with WORLD_AUTHORITY_STALE and the parties
        re-authorize. Missing or non-ALLOWED stored authorization ->
        WORLD_AUTHORIZATION_MISSING. The listing closes on verdict
        ("accepted"), mirroring the legacy single-step path; submitting
        after the listing closed is rejected (WORLD_LISTING_NOT_OPEN).
        Duplicate submit of a settled agreement returns the recorded
        settlement (idempotent). Role mapping: the fulfiller is always the
        proposer (they do the work); the poster is the listing owner;
        terms.requires names ("offerer"/"needer") resolve to the poster's
        stored authorization.
        """
        me = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        ref = agreement_id if isinstance(agreement_id, str) else None

        def execute() -> dict[str, Any]:
            self._assert_standing(me)
            agreement = self._get_agreement(agreement_id)
            if me.participant_id not in (agreement["proposer"],
                                         agreement["counterpart"]):
                raise WorldRuleError("WORLD_RULE_NOT_PARTY",
                                     "only the agreement's parties can submit it")
            if agreement["status"] == "settled":
                # Idempotent by agreement: return the recorded settlement.
                tx = self.transactions[agreement["transaction_id"]]
                return {
                    "agreement_id": agreement["agreement_id"],
                    "status": "settled",
                    "decision": agreement["decision"],
                    "receipt_id": agreement["receipts"]["fulfiller"],
                    "reason_codes": [],
                    "transaction_id": tx["transaction_id"],
                }
            if agreement["status"] != "agreed":
                raise WalletError("WORLD_AGREEMENT_NOT_AGREED",
                                  "both parties must explicitly agree before submit")
            listing, side = self._find_listing(agreement["listing_id"])
            if listing is None or listing["status"] != "open":
                raise WalletError("WORLD_LISTING_NOT_OPEN",
                                  "the listing closed before this exchange ran")
            fulfiller = self.sessions.get(agreement["proposer"])
            poster = self.sessions.get(agreement["counterpart"])
            if fulfiller is None or poster is None:
                raise WalletError("WORLD_PARTY_UNKNOWN")
            # Re-validate the stored authorizations: both sides ALLOWED, and
            # each party's authority head must not have moved since their
            # presentation was evaluated. A moved head (refresh, revocation,
            # narrow) means the authorization no longer binds to current
            # authority -> WORLD_AUTHORITY_STALE; re-authorize.
            auths = agreement.get("authorizations") or {}
            proposer_auth = self._stored_allowed(auths.get("proposer"))
            counterpart_auth = self._stored_allowed(auths.get("counterpart"))
            if (fulfiller.authority_head_hash
                    != proposer_auth["authority_head_hash"]):
                raise WalletError("WORLD_AUTHORITY_STALE",
                                  "the proposer's authority moved since "
                                  "authorization; re-authorize")
            if (poster.authority_head_hash
                    != counterpart_auth["authority_head_hash"]):
                raise WalletError("WORLD_AUTHORITY_STALE",
                                  "the counterpart's authority moved since "
                                  "authorization; re-authorize")
            # Freshness for both parties before committing.
            self._require_fresh_standing(fulfiller)
            self._require_fresh_standing(poster)

            action = TASK_KINDS[agreement["task_kind"]]
            self._record_transition(agreement, "submitted")
            self._record_transition(agreement, "accepted")
            listing["status"] = "accepted"
            tx_id = f"tx-{uuid.uuid4().hex[:12]}"
            receipt_ids = {"fulfiller": _receipt_id(proposer_auth["receipt"]),
                           "poster": _receipt_id(counterpart_auth["receipt"])}
            self.transactions[tx_id] = {
                "transaction_id": tx_id,
                "agreement_id": agreement["agreement_id"],
                "listing_id": listing["listing_id"],
                "listing_side": side,
                "fulfiller": fulfiller.participant_id,
                "poster": poster.participant_id,
                "task": copy.deepcopy(listing["task"]),
                "terms": copy.deepcopy(agreement["terms"]),
                "status": "accepted",
                "receipts": receipt_ids,
                "decided_at": utc_now().isoformat(),
            }
            agreement["receipts"] = dict(receipt_ids)
            agreement["transaction_id"] = tx_id
            agreement["decision"] = "ALLOWED"
            self.events.emit(
                source="world", kind="transaction",
                provenance="receiver-signed",
                summary=(f"Agreement {agreement['agreement_id']} settled: exchange "
                         f"{tx_id} accepted ({action} for "
                         f"{fulfiller.display_name})."),
                detail={"transaction_id": tx_id,
                        "agreement_id": agreement["agreement_id"],
                        "status": "accepted", "parties": sorted(receipt_ids)},
            )
            self._record_transition(agreement, "settled")
            self.save()
            return {
                "agreement_id": agreement["agreement_id"],
                "status": "settled",
                "decision": "ALLOWED",
                "receipt_id": receipt_ids["fulfiller"],
                "reason_codes": [],
                "transaction_id": tx_id,
            }

        result, replayed = self._idempotent(
            me.participant_id, "agreement.submit", ref, key, execute)
        if not replayed:
            agreement = self.agreements[result["agreement_id"]]
            tx = self.transactions[result["transaction_id"]]
            self._emit_envelope("agreement", {
                "agreement_id": result["agreement_id"],
                "listing_id": agreement["listing_id"], "status": "settled",
                "decision": result["decision"],
                "parties": self._agreement_parties(agreement),
            })
            self._emit_envelope("transaction", {
                "transaction_id": result["transaction_id"],
                "status": tx["status"],
                "agreement_id": result["agreement_id"],
                "parties": {"fulfiller": tx["fulfiller"], "poster": tx["poster"]},
                "decision": result["decision"],
            })
        return result

    def withdraw_listing(self, participant_id: Any, token: Any,
                         listing_id: Any,
                         idempotency_key: Any = None) -> dict[str, Any]:
        """The listing owner withdraws an open listing ("withdrawn"). Owner
        only, only while open. Agreements already proposed on it stay as
        records but can no longer be submitted (WORLD_LISTING_NOT_OPEN)."""
        me = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        ref = listing_id if isinstance(listing_id, str) else None

        def execute() -> dict[str, Any]:
            self._assert_standing(me)
            listing, side = self._find_listing(listing_id)
            if listing is None:
                raise WalletError("WORLD_LISTING_UNKNOWN")
            if listing["from_participant"] != me.participant_id:
                raise WorldRuleError("WORLD_RULE_NOT_OWNER",
                                     "only the listing owner can withdraw it")
            if listing["status"] != "open":
                raise WalletError("WORLD_LISTING_STATUS",
                                  f"cannot withdraw while status is {listing['status']!r}")
            listing["status"] = "withdrawn"
            listing["withdrawn_at"] = utc_now().isoformat()
            self.events.emit(
                source="world", kind="listing", provenance="world-rules",
                summary=(f"{me.display_name} withdrew their {side}: "
                         f"{listing['task']['title']}."),
                detail={"listing_id": listing["listing_id"], "side": side,
                        "status": "withdrawn"},
            )
            self.save()
            return {"listing_id": listing["listing_id"], "status": "withdrawn"}

        result, replayed = self._idempotent(
            me.participant_id, "listing.withdraw", ref, key, execute)
        if not replayed:
            self._emit_envelope("listing", {
                "listing_id": result["listing_id"], "status": "withdrawn",
            })
        return result

    # -- world-operator demo seeding (NOT a participant action) ----------------
    def seed_listing(self, side: str, kind: str, title: str, detail: str,
                     terms: dict[str, Any] | None = None) -> dict[str, str]:
        """WORLD-OPERATOR DEMO SEEDING -- not a participant action.

        Puts sample content on the board so the shared world has something
        to show before any real participant posts. A seeded listing:
          - always carries sample:true on the board and the API;
          - has from_kind "seeded" and from_participant "seeded": there is
            no session, no presence, no gate behind it -- it can never
            agree, submit, or act;
          - can never form an agreement: propose/accept on it is refused
            (WORLD_RULE_SEEDED_LISTING).
        Seeding invents no presence, no conversations, no demand, and no
        autonomous activity. It is labeled content, nothing more. Seeded
        listings bypass participant standing because they are the
        operator's, not a participant's -- and they authorize nothing.

TRACK A -- owner delegation and the deterministic automation worker:

        Sessions carry an activity_mode: "manual" (human-driven browser
        sessions, the join default), "automation" (the deterministic worker
        loop owns this session's next steps), "scripted" (tutorial playback
        actors), "live" (reserved for a genuinely connected runtime -- none
        exists in this preview, so it is never assigned).

        An owner delegation (delegate()) hands a session to the worker:
        goal, permitted_actions (subset of TASK_KINDS keys),
        permitted_resources (labels), spending_limit (one unit per
        worker-initiated gate evaluation), work_limit (max worker steps),
        review_conditions ({new_counterpart, over_spending}). Re-delegating
        replaces the delegation (a redirect): counters reset, the goal
        updates, the delegation unpauses, mode becomes "automation".

        The worker (backend/agent_worker.py) is DETERMINISTIC AUTOMATION: a
        fixed rule loop -- standing-freshness HOLD, mechanical discovery
        via suggestions_for(), propose/agree within limits, perform the
        TASK_KINDS-mapped action through the participant's OWN gate, then
        submit through the receiver. No model, no inference, no scoring.
        Limit or review breaches -- and any task kind outside
        permitted_actions -- become ESCALATIONS: the delegation pauses, no
        gate is evaluated, no receipt is minted, and nothing executes until
        the owner approves (one-shot authorization, the action still goes
        through the receiver) or denies (the delegation resumes without
        that action; the denial is recorded so it is never re-proposed).
        The loop STOPS for a delegation when (a) its goal is complete
        (complete_after_settled worker-settled exchanges), (b) its budget
        is exhausted (a limit breach escalates and pauses), (c) authority
        is revoked (inactive mandate -- the worker stops before any
        further gate evaluation), or (d) required approval is pending
        (it waits quietly: no repeated requests, no spending, no polling
        side effects). The per-participant worker_state in world state
        (idle/running/awaiting_approval/paused/held_standing/complete/
        stopped_revoked) is the UI's display contract. Replays are fresh
        sessions: reset() clears delegations and escalations with the
        sessions they belonged to.
        """
        if side not in ("offer", "need"):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "side")
        if kind not in TASK_KINDS:
            raise WorldRuleError("WORLD_RULE_OFFER_KIND_INVALID", f"kind: {kind!r}")
        title = WorldRules.moderate_text(title, 80, "title")
        detail = WorldRules.moderate_text(detail, 2000, "detail")
        requires: list[str] = []
        if terms is not None:
            if not isinstance(terms, dict):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "terms")
            raw = terms.get("requires") or []
            if (not isinstance(raw, list) or len(raw) > 4
                    or any(r not in REQUIRES_PARTIES for r in raw)):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "terms.requires")
            requires = list(raw)
        prefix = "offer" if side == "offer" else "need"
        listing_id = f"{prefix}-{uuid.uuid4().hex[:12]}"
        record = {
            "listing_id": listing_id,
            f"{prefix}_id": listing_id,
            "side": side,
            "from_participant": "seeded",
            "from_display_name": "OpenLine demo seeding",
            "from_kind": "seeded",
            "task": {"kind": kind, "title": title, "detail": detail},
            "terms": {"requires": requires},
            "status": "open",
            "sample": True,
            "created_at": utc_now().isoformat(),
        }
        (self.offers if side == "offer" else self.needs)[listing_id] = record
        self.events.emit(
            source="world", kind="seed", provenance="world-rules",
            summary=f"Operator seeded a sample {side}: {title}. Sample content only.",
            detail={"listing_id": listing_id, "side": side, "sample": True},
        )
        self.save()
        return {"listing_id": listing_id}

    # -- layer 2: the participant's own authority -----------------------------
    def propose(self, participant_id: Any, token: Any, action: Any,
                presentation: Any = None,
                idempotency_key: Any = None) -> dict[str, Any]:
        """Run one action through the server receiver as this participant's
        worker. The client supplies a worker-signed presentation
        (challenge/action/principal bound by the receiver); the receiver
        evaluates it against the admitted authority head and returns the
        signed verdict. Missing presentation -> WORLD_AUTHORIZATION_MISSING;
        binding mismatch -> WORLD_PRESENTATION_BINDING. A STOPPED verdict
        is returned as-is (the signed refusal IS the response) -- never
        raised, never a silent allow. A completed ALLOWED evaluation
        re-stamps standing.

        Freshness only here: a revoked mandate must still reach the
        receiver so the signed STOPPED verdict (not a world-layer error)
        is the response. A permission check never executes the action."""
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        if not isinstance(action, str) or _ID.fullmatch(action) is None:
            raise WalletError("WORLD_ACTION_INVALID")

        def execute() -> dict[str, Any]:
            self._require_fresh_standing(session)
            receipt = self._evaluate_presentation(session, action, presentation)
            self.save()
            return {
                "decision": receipt["decision"],
                "receipt_id": _receipt_id(receipt),
                "reason_codes": list(receipt.get("reason_codes", []) or []),
            }

        result, _replayed = self._idempotent(
            session.participant_id, "propose", action, key, execute)
        return result

    # -- claim graph: the reading desk ----------------------------------------
    def claimgraph_describe(self) -> dict[str, Any]:
        """The chapter's inspectable state, from recorded data only."""
        return self.claim_graph.describe()

    def claimgraph_correct(self, participant_id: Any, token: Any, status: Any,
                           presentation: Any = None,
                           idempotency_key: Any = None) -> dict[str, Any]:
        """Append a correction or withdrawal event for the harbor log --
        but only as an authorized action. The participant's worker-signed
        presentation is evaluated at the server receiver for
        "claimgraph.correct" exactly like any other propose: standing must
        be establishable as current, and only an ALLOWED verdict appends the
        event. A STOPPED verdict is returned as-is and appends nothing.

        The event and its deterministic impact report are computed by the
        real claim-graph machinery (claim_graph_chapter.py): snapshots and
        receipts are never mutated, so previous receipts stay inspectable
        and unchanged.
        """
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        if status not in ALLOWED_EVENT_STATUSES:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "status")

        def execute() -> dict[str, Any]:
            self._require_fresh_standing(session)
            receipt = self._evaluate_presentation(session, "claimgraph.correct",
                                                  presentation)
            base = {
                "decision": receipt["decision"],
                "receipt_id": _receipt_id(receipt),
                "reason_codes": list(receipt.get("reason_codes", []) or []),
            }
            if receipt["decision"] != "ALLOWED":
                return {**base, "event_id": None, "replayed": False}
            entry = self.claim_graph.append_event(
                status, asserted_by=f"world:participant:{session.participant_id}")
            self.events.emit(
                source="world", kind="claim-graph", provenance="receiver-signed",
                summary=(f"{session.display_name} posted a {status} event for the harbor log. "
                         "The receiver allowed it; the desk shows the computed impact."),
                detail={"participant_id": session.participant_id,
                        "event_id": entry["event"]["event_id"], "status": status,
                        "replayed": entry.get("replayed", False)},
            )
            self.save()
            return {**base, "event_id": entry["event"]["event_id"],
                    "replayed": entry.get("replayed", False)}

        result, _replayed = self._idempotent(
            session.participant_id, "claimgraph.correct", status, key, execute)
        return result

    # -- newsroom: the small desk ---------------------------------------------
    def newsroom_describe(self) -> dict[str, Any]:
        """The newsroom's inspectable state, from recorded data only."""
        return self.newsroom.describe()

    def _gated_newsroom(self, session: ParticipantSession,
                        presentation: Any = None) -> dict[str, Any]:
        """Evaluate the client-supplied worker-signed presentation for
        "newsroom.review" at the server receiver, exactly like any other
        propose. Only an ALLOWED verdict records anything; a STOPPED verdict
        returns as-is and records nothing."""
        self._require_fresh_standing(session)
        receipt = self._evaluate_presentation(session, "newsroom.review",
                                              presentation)
        return {
            "decision": receipt["decision"],
            "receipt_id": _receipt_id(receipt),
            "reason_codes": list(receipt.get("reason_codes", []) or []),
        }

    def newsroom_import(self, participant_id: Any, token: Any, article: Any,
                        presentation: Any = None,
                        idempotency_key: Any = None) -> dict[str, Any]:
        """Record an incoming article/correction as a dispatch -- but only as
        an authorized action. Imported text is untrusted data: it is quoted
        for display, never executed, and no link is fetched because of it.
        Re-importing the same article yields the same dispatch (replayed),
        never a duplicate."""
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        clean = self._clean_article(article)

        def execute() -> dict[str, Any]:
            base = self._gated_newsroom(session, presentation)
            if base["decision"] != "ALLOWED":
                return {**base, "dispatch_id": None, "replayed": False}
            out = self.newsroom.import_dispatch(
                clean, imported_by=f"world:participant:{session.participant_id}")
            dispatch = out["dispatch"]
            self.events.emit(
                source="world", kind="newsroom", provenance="receiver-signed",
                summary=(f"{session.display_name} imported a dispatch: "
                         f"\u201c{dispatch['title']}\u201d. "
                         "The receiver allowed it; proposed connections stay proposals."),
                detail={"participant_id": session.participant_id,
                        "dispatch_id": dispatch["dispatch_id"],
                        "replayed": out["replayed"]},
            )
            self.save()
            return {**base, "dispatch_id": dispatch["dispatch_id"],
                    "replayed": out["replayed"]}

        result, _replayed = self._idempotent(
            session.participant_id, "newsroom.import",
            clean["source_url"] + "|" + clean["published_at"] + "|" + clean["title"],
            key, execute)
        return result

    @staticmethod
    def _clean_report_submission(report: Any) -> dict[str, str]:
        """Validate a research-report submission and pin its bytes.

        The body is pinned EXACTLY as submitted: no stripping or other
        normalization. This is deliberate. The submitter declares
        report_sha256; if the server altered the bytes (even trailing
        whitespace) before pinning, the declared hash could never name the
        stored/evaluated bytes, and the byte-binding the whole path rests on
        would be broken. Emptiness and the 16384-char ceiling are checked,
        but the bytes themselves are untouched.

        The declared/pinned equality is checked inside the gated execution
        (not here), so a mismatch becomes a receiver-signed refusal rather
        than an input error."""
        if not isinstance(report, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "report")
        title = WorldRules.moderate_text(report.get("title"), 120, "title")
        body = report.get("body")
        if (not isinstance(body, str) or not body.strip()
                or len(body) > 16384):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "body")
        source_url = WorldRules.moderate_text(report.get("source_url"), 200, "source_url")
        published_at = WorldRules.moderate_text(report.get("published_at"), 64, "published_at")
        declared = report.get("report_sha256")
        if (not isinstance(declared, str)
                or not re.fullmatch(r"[0-9a-f]{64}", declared)):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "report_sha256")
        pinned = hashlib.sha256(body.encode("utf-8")).hexdigest()
        return {"title": title, "body": body, "source_url": source_url,
                "published_at": published_at, "declared_sha256": declared,
                "pinned_sha256": pinned}

    def newsroom_submit_report(self, participant_id: Any, token: Any, report: Any,
                               presentation: Any = None,
                               idempotency_key: Any = None) -> dict[str, Any]:
        """Admit an actual research artifact into the newsroom — but only as
        an authorized action, and only when the submitted bytes, the
        evaluation, the acceptance, and the displayed artifact are bound to
        the SAME exact bytes.

        Which checks run, in order, inside the gated execution:
        1. RECEIVER GATE: the client-supplied worker-signed presentation is
           evaluated at the server receiver for "newsroom.review" (scope
           membership, standing freshness, revocation). A STOPPED verdict
           records nothing and is returned as-is.
        2. BYTE BINDING: sha256 of the exact body bytes received must equal
           the submitter's declared report_sha256. A mismatch returns STOPPED
           with REPORT_HASH_MISMATCH and records nothing.
        3. STRUCTURAL ACCEPTANCE: the frozen criteria C1-C5 (research/
           CRITERIA.md, run server-side by backend/report_acceptance.py) are
           evaluated on the pinned bytes. A non-ACCEPTED verdict returns
           STOPPED with REPORT_ACCEPTANCE_FAILED and records nothing.
           These are STRUCTURAL checks — section presence, citation format,
           scope conformance — and are never presented as factual
           verification of the report's claims.

        Only when the gate ALLOWS, the bytes bind, and the acceptance passes
        is the dispatch stored: body, report_sha256, and the acceptance
        record all name the same bytes. The original fixture import path is
        untouched.
        """
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        clean = self._clean_report_submission(report)

        def execute() -> dict[str, Any]:
            self._require_fresh_standing(session)
            receipt = self._evaluate_presentation(session, "newsroom.review",
                                                  presentation)
            receipt_id = _receipt_id(receipt)
            gate_codes = list(receipt.get("reason_codes", []) or [])
            gate_decision = receipt["decision"]
            binding = {"declared_sha256": clean["declared_sha256"],
                       "pinned_sha256": clean["pinned_sha256"],
                       "match": clean["declared_sha256"] == clean["pinned_sha256"]}
            # The acceptance checks run on the pinned (actually received)
            # bytes, whatever the submitter declared.
            acceptance = evaluate_report(clean["body"])

            def refused(codes: list[str]) -> dict[str, Any]:
                return {"decision": "STOPPED",
                        "receipt_id": receipt_id,
                        "reason_codes": codes,
                        "binding": binding,
                        "acceptance": acceptance,
                        "dispatch_id": None,
                        "replayed": False}

            if gate_decision != "ALLOWED":
                return refused(gate_codes)
            if not binding["match"]:
                # The bytes presented are not the bytes pinned: refuse before
                # any effect. The gate was consulted, so the refusal is a
                # signed receiver verdict.
                return refused(gate_codes + ["REPORT_HASH_MISMATCH"])
            if acceptance["verdict"] != "ACCEPTED":
                return refused(gate_codes + ["REPORT_ACCEPTANCE_FAILED"])
            out = self.newsroom.import_research_report(
                {"title": clean["title"], "source_url": clean["source_url"],
                 "published_at": clean["published_at"], "body": clean["body"],
                 "report_sha256": clean["pinned_sha256"]},
                acceptance,
                imported_by=f"world:participant:{session.participant_id}")
            dispatch = out["dispatch"]
            self.events.emit(
                source="world", kind="newsroom", provenance="receiver-signed",
                summary=(f"{session.display_name} submitted a research report: "
                         f"\u201c{dispatch['title']}\u201d. "
                         "The receiver allowed it and the structural checks "
                         "accepted the pinned bytes; the report is displayed "
                         "as authored, not verified as true."),
                detail={"participant_id": session.participant_id,
                        "dispatch_id": dispatch["dispatch_id"],
                        "report_sha256": dispatch["report_sha256"],
                        "replayed": out["replayed"]},
            )
            self.save()
            return {"decision": "ALLOWED",
                    "receipt_id": receipt_id,
                    "reason_codes": gate_codes,
                    "binding": binding,
                    "acceptance": acceptance,
                    "dispatch_id": dispatch["dispatch_id"],
                    "replayed": out["replayed"]}

        result, _replayed = self._idempotent(
            session.participant_id, "newsroom.submit-report",
            clean["declared_sha256"] + "|" + clean["pinned_sha256"],
            key, execute)
        return result

    @staticmethod
    def _clean_package_submission(submission: Any) -> dict[str, Any]:
        """Validate a research-package submission and pin its bytes.

        The package is pinned EXACTLY as {manifest, files} canonicalized —
        nothing else. A producer-supplied `attestation` (e.g. a
        self-signed "APPROVED") is accepted on the wire but DISCARDED here:
        it is not canonicalized, not hashed, not stored, not evaluated,
        and never appears in any acceptance record. It authorizes nothing;
        the package is evaluated on its merits only.

        The declared/pinned equality is checked inside the gated execution
        (not here), so a mismatch becomes a receiver-signed refusal
        (ARTIFACT_HASH_MISMATCH) rather than an input error.
        """
        if not isinstance(submission, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package")
        package = submission.get("package")
        if not isinstance(package, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package")
        manifest = package.get("manifest")
        files = package.get("files")
        if not isinstance(manifest, dict) or not isinstance(files, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package.manifest/files")
        title = manifest.get("title")
        if not isinstance(title, str) or not title.strip() or len(title) > 120:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package.manifest.title")
        if len(files) > 8:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package.files")
        for name, body in files.items():
            if (not isinstance(name, str) or not name.isascii() or len(name) > 64
                    or not isinstance(body, str) or len(body) > 65536):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package.files entry")
        try:
            pinned_bytes = canonical_package_bytes(package)
        except Exception:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package")
        declared = submission.get("package_sha256")
        if (not isinstance(declared, str)
                or not re.fullmatch(r"[0-9a-f]{64}", declared)):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "package_sha256")
        pinned = hashlib.sha256(pinned_bytes).hexdigest()
        # NOTE: submission.get("attestation") is deliberately unread here.
        # Reading it into any stored or evaluated structure would give a
        # producer attestation a place in the records; the frozen brief
        # requires it to authorize nothing and appear nowhere.
        return {"package": {"manifest": manifest, "files": files},
                "declared_sha256": declared,
                "pinned_sha256": pinned}

    def newsroom_submit_package(self, participant_id: Any, token: Any,
                                submission: Any, presentation: Any = None,
                                idempotency_key: Any = None) -> dict[str, Any]:
        """Admit a research package into the newsroom — but only as an
        authorized action, and only when the submitted bytes, the
        evaluation, the acceptance, and the displayed artifact are bound to
        the SAME exact bytes.

        Which checks run, in order, inside the gated execution:
        1. RECEIVER GATE: the client-supplied worker-signed presentation is
           evaluated at the server receiver for "newsroom.review" (scope
           membership, standing freshness, revocation). A STOPPED verdict
           records nothing and is returned as-is. The presentation is the
           worker's only signature in this run: it never signs the
           acceptance.
        2. BYTE BINDING: sha256 of the exact canonical package bytes
           received must equal the submitter's declared package_sha256. A
           mismatch returns STOPPED with ARTIFACT_HASH_MISMATCH and records
           nothing.
        3. STRUCTURAL ACCEPTANCE: the frozen criteria K1-K7
           (research/COMMONS-CRITERIA.md as amended 2026-09-27, run
           server-side by backend/package_acceptance.py; the study
           executes only for byte-pinned receiver-trusted fixtures --
           trusted-fixture reproduction, not a security sandbox) are
           evaluated on the pinned bytes. A
           non-ACCEPTED verdict returns STOPPED with
           PACKAGE_ACCEPTANCE_FAILED plus one CRITERION_FAILED_<K> code per
           failing criterion, and records nothing. These checks are
           structural/mechanical — never presented as factual verification
           of the package's claim.

        Only when the gate ALLOWS, the bytes bind, and the acceptance passes
        is the dispatch stored: the package bytes, package_sha256, the
        gate-signed acceptance record, the gate receipt, and the
        worker-signed presentation all name the same bytes. The package's
        claim is then registered in the claim graph (a quote claim on the
        harbor log + an INFERENCE claim with the package's claim text,
        hard SUPPORTS), so later source-status events propagate to it under
        the existing engine.

        A producer-supplied attestation is ignored entirely: it authorizes
        nothing, produces no receipt, changes no state, and appears in no
        acceptance record.
        """
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        clean = self._clean_package_submission(submission)

        def execute() -> dict[str, Any]:
            self._require_fresh_standing(session)
            receipt = self._evaluate_presentation(session, "newsroom.review",
                                                  presentation)
            receipt_id = _receipt_id(receipt)
            gate_codes = list(receipt.get("reason_codes", []) or [])
            gate_decision = receipt["decision"]
            binding = {"declared_sha256": clean["declared_sha256"],
                       "pinned_sha256": clean["pinned_sha256"],
                       "match": clean["declared_sha256"] == clean["pinned_sha256"]}
            # The acceptance checks run on the pinned (actually received)
            # bytes, whatever the submitter declared. Pure function: the
            # study executes only for receiver-trusted fixture pins
            # (trusted-fixture reproduction; never imported).
            acceptance = evaluate_package(
                canonical_package_bytes(clean["package"]))
            failed = [r["criterion"] for r in acceptance["results"]
                      if r["result"] != "pass"]

            def refused(codes: list[str]) -> dict[str, Any]:
                return {"decision": "STOPPED",
                        "receipt_id": receipt_id,
                        "reason_codes": codes,
                        "binding": binding,
                        "acceptance": acceptance,
                        "dispatch_id": None,
                        "replayed": False}

            if gate_decision != "ALLOWED":
                return refused(gate_codes)
            if not binding["match"]:
                # The bytes presented are not the bytes pinned: refuse before
                # any effect. The gate was consulted, so the refusal is a
                # signed receiver verdict.
                return refused(gate_codes + ["ARTIFACT_HASH_MISMATCH"])
            if acceptance["verdict"] != "ACCEPTED":
                return refused(gate_codes + ["PACKAGE_ACCEPTANCE_FAILED"]
                               + [f"CRITERION_FAILED_{c}" for c in failed])
            # Decision locus: the receiver signs the acceptance record with
            # the gate key, in the receiver process. The worker never signs it.
            signed_acceptance = sign_record(acceptance, self.gate.gate_key)
            out = self.newsroom.import_research_package(
                clean["package"],
                signed_acceptance,
                copy.deepcopy(receipt),
                copy.deepcopy(presentation),
                imported_by=f"world:participant:{session.participant_id}")
            dispatch = out["dispatch"]
            claim_text = str(clean["package"]["manifest"].get("claim", ""))
            report_id = f"package-report:{clean['pinned_sha256'][:16]}"
            self.claim_graph.register_package_report(
                report_id=report_id,
                title=str(clean["package"]["manifest"].get("title", "")),
                claim_text=claim_text,
                asserted_by=f"world:participant:{session.participant_id}")
            self.newsroom.link_package_claim_report(dispatch["dispatch_id"],
                                                    report_id)
            presentation_binding = {
                "presentation_hash": receipt.get("presentation_hash"),
                "package_sha256": clean["pinned_sha256"],
                "receipt_id": receipt_id,
            }
            self.events.emit(
                source="world", kind="newsroom", provenance="receiver-signed",
                summary=(f"{session.display_name} submitted a research package: "
                         f"\u201c{dispatch['title']}\u201d. "
                         "The receiver allowed it and the K1-K7 checks "
                         "accepted the pinned bytes; the package is displayed "
                         "as authored, not verified as true."),
                detail={"participant_id": session.participant_id,
                        "dispatch_id": dispatch["dispatch_id"],
                        "package_sha256": dispatch["package_sha256"],
                        "claim_report_id": report_id,
                        "presentation_binding": presentation_binding,
                        "replayed": out["replayed"]},
            )
            self.save()
            return {"decision": "ALLOWED",
                    "receipt_id": receipt_id,
                    "reason_codes": gate_codes,
                    "binding": binding,
                    "acceptance": signed_acceptance,
                    "presentation_binding": presentation_binding,
                    "dispatch_id": dispatch["dispatch_id"],
                    "claim_report_id": report_id,
                    "replayed": out["replayed"]}

        result, _replayed = self._idempotent(
            session.participant_id, "newsroom.submit-package",
            clean["declared_sha256"] + "|" + clean["pinned_sha256"],
            key, execute)
        return result

    @staticmethod
    def _clean_article(article: Any) -> dict[str, Any]:
        """Validate and clean a manually imported article. Proposals are
        records asserted by the importer: they never change a standing by
        themselves."""
        if not isinstance(article, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "article")
        title = WorldRules.moderate_text(article.get("title"), 120, "title")
        source_url = WorldRules.moderate_text(article.get("source_url"), 200, "source_url")
        published_at = WorldRules.moderate_text(article.get("published_at"), 64, "published_at")
        body = WorldRules.moderate_text(article.get("body"), 2000, "body")
        proposals: list[dict[str, Any]] = []
        raw_proposals = article.get("proposals") or []
        if not isinstance(raw_proposals, list) or len(raw_proposals) > 4:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "proposals")
        for raw in raw_proposals:
            if not isinstance(raw, dict):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "proposal")
            kind = raw.get("kind")
            if kind not in ("disputes-source", "challenges", "supports"):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "proposal.kind")
            effect = raw.get("effect", "none")
            if effect not in ("source_status:CORRECTED", "source_status:WITHDRAWN", "none"):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "proposal.effect")
            target = raw.get("target_claim_id")
            # Claim ids are content-addressed (longer than the short-id
            # pattern); the chapter checks them against recorded claims.
            if target is not None and (not isinstance(target, str)
                                       or not target.strip() or len(target) > 200):
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "proposal.target_claim_id")
            rationale = WorldRules.moderate_text(raw.get("rationale"), 500, "proposal.rationale")
            proposals.append({"kind": kind, "target_claim_id": target,
                              "effect": effect, "rationale": rationale})
        return {"title": title, "source_url": source_url,
                "published_at": published_at, "body": body, "proposals": proposals}

    def newsroom_review(self, participant_id: Any, token: Any, proposal_id: Any,
                        decision: Any, presentation: Any = None,
                        idempotency_key: Any = None) -> dict[str, Any]:
        """Accept or decline a proposed connection -- only as an authorized
        action. A declined proposal changes nothing. An accepted proposal
        whose recorded effect is a source-status change admits one
        source-status event through the real impact engine; the original
        report and receipts are never rewritten."""
        session = self._auth(participant_id, token)
        key = self._clean_idempotency_key(idempotency_key)
        if not isinstance(proposal_id, str) or not _ID.fullmatch(proposal_id):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "proposal_id")
        if decision not in ("accept", "decline"):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "decision")

        def execute() -> dict[str, Any]:
            base = self._gated_newsroom(session, presentation)
            if base["decision"] != "ALLOWED":
                return {**base, "proposal_id": proposal_id, "review": None}
            try:
                out = self.newsroom.review_proposal(
                    proposal_id, decision,
                    asserted_by=f"world:participant:{session.participant_id}")
            except ValueError as exc:
                raise WorldRuleError("WORLD_RULE_INPUT_INVALID", str(exc))
            admitted = out["admitted"]
            self.events.emit(
                source="world", kind="newsroom", provenance="receiver-signed",
                summary=(f"{session.display_name} "
                         f"{'accepted' if decision == 'accept' else 'declined'} "
                         f"proposal {proposal_id}: "
                         + ("new evidence admitted under the report's recorded policy."
                            if admitted else "no evidence admitted; standings unchanged.")),
                detail={"participant_id": session.participant_id,
                        "proposal_id": proposal_id, "decision": decision,
                        "admitted_event_id": (
                            admitted["event"]["event_id"] if admitted else None)},
            )
            self.save()
            return {**base, "proposal_id": proposal_id, "review": decision,
                    "proposal_status": out["proposal"]["status"],
                    "admitted_event_id": (
                        admitted["event"]["event_id"] if admitted else None)}

        result, _replayed = self._idempotent(
            session.participant_id, "newsroom.review", proposal_id, key, execute)
        return result

    def authority_refresh(self, participant_id: Any, token: Any,
                          bundle: Any) -> dict[str, Any]:
        """Admit an updated owner-signed authority bundle for a session.

        The owner revokes/narrows/grants locally in their own wallet, then
        submits the new bundle here. The world verifies the owner-root
        signature, requires the principal id + root public key to match the
        pinned values (WORLD_AUTHORITY_PRINCIPAL_MISMATCH), and admits the
        new head (monotonic; BUNDLE_HEAD_STALE / BUNDLE_FORK_QUARANTINED
        surface). Revocation is not instant across the network: it stops the
        agent's NEXT gated action only once this refresh is admitted.

        If the subject's mandate is now REVOKED (or absent), the session is
        marked revoked, its delegation flips to "revoked", and a revocation
        envelope + event are emitted (the old server-side revoke shape).
        Otherwise the session's bundle/head/mandate fields update.
        """
        session = self._auth(participant_id, token)
        if not isinstance(bundle, dict):
            raise WalletError("WORLD_BUNDLE_INVALID", "bundle")
        verified, timeline = verify_bundle(bundle)
        if (verified["principal"]["principal_id"] != session.owner_principal_id
                or str(verified["principal"]["root_public_key"]).lower()
                   != session.owner_root_public_key):
            raise WalletError("WORLD_AUTHORITY_PRINCIPAL_MISMATCH",
                              "bundle principal does not match the pinned owner")
        admission = self.gate.admit_bundle(verified)
        session.authority_bundle = verified
        session.authority_head_hash = admission["head_hash"]
        session.standing_checked_at = time.time()

        now = utc_now()
        active = [m for m in timeline.mandates.values()
                  if m.get("subject_id") == session.agent_id
                  and m.get("status") == "ACTIVE"
                  and parse_time(m["expires_at"]) > now]
        revoked = False
        if len(active) == 1:
            grant = active[0]
            session.mandate_id = str(grant["mandate_id"])
            session.mandate_scopes = sorted(grant.get("scopes") or [])
            session.revoked = False
        else:
            known = timeline.mandates.get(session.mandate_id)
            if known is None or known.get("status") != "ACTIVE":
                revoked = True
        if revoked:
            session.revoked = True
            dlg = self.delegations.get(session.participant_id)
            if dlg is not None:
                dlg["status"] = "revoked"
                dlg["updated_at"] = utc_now().isoformat()
            self.events.emit(
                source="world", kind="revocation", provenance="world-rules",
                summary=f"{session.display_name} revoked their agent's mandate.",
                detail={"participant_id": session.participant_id,
                        "mandate_id": session.mandate_id, "status": "REVOKED"},
            )
            self._emit_envelope("revocation", {
                "participant_id": session.participant_id,
                "mandate_id": session.mandate_id, "status": "REVOKED",
            })
        self.save()
        return {
            "revoked": revoked,
            "mandate_id": session.mandate_id,
            "head_hash": admission["head_hash"],
            "head_sequence": admission["head_sequence"],
        }

    # -- receipts: private per participant, explicit share only ---------------
    def receipts_for(self, participant_id: Any, token: Any) -> dict[str, Any]:
        session = self._auth(participant_id, token)
        return {"receipts": [_public_receipt(r) for r in session.receipts]}

    def share_receipt(self, participant_id: Any, token: Any, receipt_id: Any) -> dict[str, bool]:
        session = self._auth(participant_id, token)
        target = None
        for r in session.receipts:
            if _receipt_id(r) == receipt_id:
                target = r
                break
        if target is None:
            raise WalletError("WORLD_RECEIPT_UNKNOWN")
        # A forged or tampered receipt fails verification here and is never shared.
        valid, reason = verify_record(target, expected_public_key=self.gate.public_key)
        if valid is not True:
            raise WalletError("WORLD_RECEIPT_INVALID", reason or "")
        if not any(e["receipt_id"] == receipt_id and e["shared_by"] == session.participant_id
                   for e in self.shared_receipts):
            self.shared_receipts.append({
                "shared_by": session.participant_id,
                "shared_by_display_name": session.display_name,
                "receipt_id": receipt_id,
                "receipt": _public_receipt(target),
            })
            self.events.emit(
                source="world", kind="share", provenance="world-rules",
                summary=f"{session.display_name} shared a receipt.",
                detail={"participant_id": session.participant_id,
                        "receipt_id": receipt_id},
            )
            self._emit_envelope("share", {
                "shared_by": session.participant_id,
                "receipt_id": receipt_id,
            })
        self.save()
        return {"shared": True}

    # -- board: transparent listings, mechanical suggestions -------------------
    def _all_listings(self) -> list[tuple[dict[str, Any], str]]:
        return ([(o, "offer") for o in self.offers.values()]
                + [(n, "need") for n in self.needs.values()])

    def board(self, filters: Any = None) -> dict[str, Any]:
        """The public board: every listing, offers and needs together. No
        ranking, no scoring, no AI. Filters are transparent only: side,
        kind, from_participant, hide_samples. Seeded (sample) listings are
        always labeled sample:true with from_kind "seeded"."""
        filters = filters or {}
        if not isinstance(filters, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "filters")
        side = filters.get("side")
        if side is not None and side not in ("offer", "need"):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "filters.side")
        kind = filters.get("kind")
        if kind is not None and kind not in TASK_KINDS:
            raise WorldRuleError("WORLD_RULE_OFFER_KIND_INVALID", f"kind: {kind!r}")
        from_participant = filters.get("from_participant")
        if from_participant is not None and not isinstance(from_participant, str):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "filters.from_participant")
        hide = filters.get("hide_samples")
        hide_samples = (hide is True or (isinstance(hide, str)
                                         and hide.lower() in ("1", "true", "yes")))
        out = []
        for listing, lside in sorted(
                self._all_listings(),
                key=lambda pair: (pair[0]["created_at"], pair[0]["listing_id"])):
            if side is not None and lside != side:
                continue
            if kind is not None and listing["task"]["kind"] != kind:
                continue
            if (from_participant is not None
                    and listing["from_participant"] != from_participant):
                continue
            if hide_samples and listing.get("sample"):
                continue
            out.append({
                "listing_id": listing["listing_id"],
                "side": lside,
                "kind": listing["task"]["kind"],
                "title": listing["task"]["title"],
                "detail": listing["task"]["detail"],
                "terms": copy.deepcopy(listing["terms"]),
                "from_participant": listing["from_participant"],
                "from_display_name": listing["from_display_name"],
                "from_kind": listing.get("from_kind", "real"),
                "sample": bool(listing.get("sample", False)),
                "status": listing["status"],
                "created_at": listing["created_at"],
            })
        return {"listings": out}

    def suggestions_for(self, participant_id: Any, token: Any) -> dict[str, Any]:
        """Purely mechanical suggestions, labeled as such: open listings
        whose kind appears in the participant's OWN open listings (their
        stated intent). No listing posted -> no suggestions. Sample (seeded)
        listings are never suggested: they are demo content, not real
        intent. Deterministic: the same state yields the same order every
        call. No ranking, no scoring, no AI -- the reason string states the
        mechanical rule that produced each match."""
        me = self._auth(participant_id, token)
        own_kinds: dict[str, str] = {}
        for listing, lside in self._all_listings():
            if (listing["from_participant"] == me.participant_id
                    and listing["status"] == "open"
                    and not listing.get("sample")):
                own_kinds.setdefault(listing["task"]["kind"], lside)
        suggestions = []
        for listing, lside in sorted(
                self._all_listings(),
                key=lambda pair: (pair[0]["created_at"], pair[0]["listing_id"])):
            if listing["status"] != "open" or listing.get("sample"):
                continue
            if listing["from_participant"] == me.participant_id:
                continue
            kind = listing["task"]["kind"]
            my_side = own_kinds.get(kind)
            if my_side is None:
                continue
            suggestions.append({
                "listing_id": listing["listing_id"],
                "side": lside,
                "kind": kind,
                "title": listing["task"]["title"],
                "from_participant": listing["from_participant"],
                "from_display_name": listing["from_display_name"],
                "reason": f"matches your posted {my_side} for kind {kind}",
            })
        return {"suggestions": suggestions}

    # -- track A: owner delegation, activity mode, escalations -------------
    # DETERMINISTIC AUTOMATION support. An owner delegation hands one
    # participant's session to the deterministic worker loop
    # (backend/agent_worker.py -- a fixed rule loop, no model, no
    # inference, no scoring). The worker may only propose, consent, and act
    # inside the delegation's permitted_actions and limits; anything else
    # becomes an ESCALATION that pauses the delegation and awaits the
    # owner's explicit approve/deny. Every consequential action still runs
    # through the participant's OWN gate and the backend receiver -- the
    # worker holds no authority of its own, and agreement ("agreed") stays
    # mutual consent only, exactly as in the agreement lifecycle above.

    @staticmethod
    def _clean_delegation(delegation: Any) -> dict[str, Any]:
        """Validate an owner delegation body. All text is moderated like
        other world inputs; every field is validated, nothing is trusted."""
        if not isinstance(delegation, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "delegation")
        goal = WorldRules.moderate_text(delegation.get("goal"), 500,
                                        "delegation.goal")
        actions = delegation.get("permitted_actions")
        if not isinstance(actions, list):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID",
                                 "delegation.permitted_actions")
        permitted: list[str] = []
        for a in actions:
            if not isinstance(a, str) or a not in TASK_KINDS:
                raise WorldRuleError(
                    "WORLD_RULE_INPUT_INVALID",
                    f"delegation.permitted_actions: {a!r} is not a supported task kind")
            if a not in permitted:
                permitted.append(a)
        resources = delegation.get("permitted_resources") or []
        if (not isinstance(resources, list) or len(resources) > 16
                or any(not isinstance(r, str) or not r.strip()
                       or len(r) > 64 for r in resources)):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID",
                                 "delegation.permitted_resources")
        spending = delegation.get("spending_limit")
        if (isinstance(spending, bool) or not isinstance(spending, int)
                or spending < 0):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID",
                                 "delegation.spending_limit")
        work = delegation.get("work_limit")
        if isinstance(work, bool) or not isinstance(work, int) or work < 1:
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID",
                                 "delegation.work_limit")
        rc = delegation.get("review_conditions") or {}
        if not isinstance(rc, dict):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID",
                                 "delegation.review_conditions")
        review: dict[str, bool] = {}
        for k, v in rc.items():
            if k not in REVIEW_CONDITION_KEYS or not isinstance(v, bool):
                raise WorldRuleError(
                    "WORLD_RULE_INPUT_INVALID",
                    f"delegation.review_conditions: {k!r}")
            review[k] = v
        # Mechanical goal-completion predicate: the worker is deterministic
        # (no model, no inference), so it cannot judge free-text goal
        # completion. complete_after_settled (optional int >= 1) defines it
        # mechanically: after the worker has settled this many exchanges,
        # the delegation is "complete" and the loop stops. Without it, the
        # delegation runs until limits, revocation, approval-pending, or an
        # owner redirect.
        complete = delegation.get("complete_after_settled")
        if (complete is not None
                and (isinstance(complete, bool)
                     or not isinstance(complete, int) or complete < 1)):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID",
                                 "delegation.complete_after_settled")
        return {
            "goal": goal,
            "permitted_actions": permitted,
            "permitted_resources": [r.strip() for r in resources],
            "spending_limit": spending,
            "work_limit": work,
            "review_conditions": {
                "new_counterpart": review.get("new_counterpart", False),
                "over_spending": review.get("over_spending", False),
            },
            "complete_after_settled": complete,
        }

    def delegate(self, participant_id: Any, token: Any,
                 delegation: Any) -> dict[str, Any]:
        """Record (or replace) an owner delegation for a participant.

        A delegation is the owner's control-plane config: goal text,
        permitted_actions (subset of TASK_KINDS keys), permitted_resources
        (labels only), spending_limit (one unit per worker-initiated gate
        evaluation), work_limit (max worker steps), review_conditions
        ({new_counterpart, over_spending} bools), and the optional
        complete_after_settled (mechanical goal-completion: stop after the
        worker settles this many exchanges).

        This server records the delegation only; it does NOT run a worker
        loop in-process (separate key custody: the server cannot sign for
        the participant). The worker that consumes these records is
        out-of-process and holds its own keys; it authorizes every action
        through this same receiver with its own presentations. Delegating
        assigns activity_mode "automation" and clears the pause switch.

        Re-delegating REPLACES the delegation -- a redirect: the goal
        updates, counters and grants/denials reset, the delegation
        unpauses, and activity_mode becomes "automation"."""
        session = self._auth(participant_id, token)
        clean = self._clean_delegation(delegation)
        now = utc_now().isoformat()
        delegation_id = f"dlg-{uuid.uuid4().hex[:12]}"
        self.delegations[session.participant_id] = {
            "delegation_id": delegation_id,
            "participant_id": session.participant_id,
            **clean,
            "status": "active",
            "actions_count": 0,
            "spent": 0,
            # Worker-settled exchanges under this delegation; compared
            # against complete_after_settled for mechanical goal completion.
            "settled_count": 0,
            # Set when the owner approves a spending-review escalation: the
            # first spend has had owner eyes.
            "spending_reviewed": False,
            # Counterparts this delegation has already acted with (for the
            # new_counterpart review condition).
            "known_counterparts": set(),
            # One-shot owner grants, fingerprint -> record. Consumed by the
            # worker when it reaches the exact approved action.
            "grants": {},
            # Denied fingerprints: the worker never re-proposes or
            # re-escalates these.
            "denied": set(),
            # Standing-hold records (HOLD, nothing acted on).
            "holds": [],
            "created_at": now,
            "updated_at": now,
        }
        # Delegating is what assigns "automation": the mode is never set
        # directly (see set_activity_mode).
        session.activity_mode = "automation"
        session.paused = False
        self.events.emit(
            source="world", kind="delegation", provenance="world-rules",
            summary=(f"{session.display_name} delegated to the deterministic "
                     f"automation worker: {clean['goal']}"),
            detail={"participant_id": session.participant_id,
                    "delegation_id": delegation_id,
                    "permitted_actions": clean["permitted_actions"],
                    "spending_limit": clean["spending_limit"],
                    "work_limit": clean["work_limit"]},
        )
        self.save()
        return {"delegation_id": delegation_id, "activity_mode": "automation",
                "status": "active"}

    def _delegation_summary(self, participant_id: str) -> dict[str, Any] | None:
        """The delegation as exposed in world state: goal + limits, no
        secrets. (Delegations carry no secrets at all -- the bearer token
        stays on the session, never in the delegation record.)"""
        dlg = self.delegations.get(participant_id)
        if dlg is None:
            return None
        return {
            "delegation_id": dlg["delegation_id"],
            "participant_id": dlg["participant_id"],
            "goal": dlg["goal"],
            "permitted_actions": list(dlg["permitted_actions"]),
            "permitted_resources": list(dlg["permitted_resources"]),
            "spending_limit": dlg["spending_limit"],
            "work_limit": dlg["work_limit"],
            "review_conditions": dict(dlg["review_conditions"]),
            "complete_after_settled": dlg["complete_after_settled"],
            "status": dlg["status"],
            "actions_count": dlg["actions_count"],
            "spent": dlg["spent"],
            "settled_count": dlg["settled_count"],
            "created_at": dlg["created_at"],
            "updated_at": dlg["updated_at"],
        }

    def delegation_for(self, participant_id: Any,
                       token: Any) -> dict[str, Any]:
        """Return the participant's current delegation summary, or null."""
        session = self._auth(participant_id, token)
        return {"delegation": self._delegation_summary(session.participant_id)}

    def set_activity_mode(self, participant_id: Any, token: Any,
                          mode: Any) -> dict[str, str]:
        """Label a session's activity mode.

        "manual" (human-driven browser sessions; the join default) and
        "scripted" (tutorial playback actors) may be assigned directly.
        "automation" is assigned ONLY by delegate() -- it means the
        deterministic worker loop owns this session's next steps. "live"
        is reserved for a genuinely connected runtime; none exists in this
        preview, so assigning it is always refused."""
        session = self._auth(participant_id, token)
        if mode == "automation":
            raise WorldRuleError(
                "WORLD_RULE_ACTIVITY_MODE_INVALID",
                "'automation' is assigned only by recording a delegation")
        if mode == "live":
            raise WorldRuleError(
                "WORLD_RULE_ACTIVITY_MODE_INVALID",
                "'live' is reserved for a genuinely connected runtime, "
                "which does not exist in this preview")
        if mode not in ("manual", "scripted"):
            raise WorldRuleError("WORLD_RULE_ACTIVITY_MODE_INVALID",
                                 f"mode: {mode!r}")
        session.activity_mode = mode
        self.events.emit(
            source="world", kind="activity-mode", provenance="world-rules",
            summary=(f"{session.display_name} activity mode -> {mode}."),
            detail={"participant_id": session.participant_id, "mode": mode},
        )
        self.save()
        return {"activity_mode": mode}

    def _worker_state(self, session: ParticipantSession) -> str:
        """The worker's stop-condition state for one session, for UI display
        (Track B renders it; this is the data contract). The worker is
        out-of-process; this state is computed from the recorded delegation,
        the pause switch, pending escalations, and the admitted authority.

        "idle" -- no delegation, or not in "automation" mode: the worker
            will never step this session.
        "running" -- active delegation, automation mode, unpaused, no
            pending escalation, mandate active, standing fresh enough to
            act on the next tick.
        "awaiting_approval" -- an escalation is pending: the worker has
            STOPPED for this delegation (limit breached or review fired)
            and waits quietly until the owner approves or denies.
        "paused" -- the owner pause switch is set.
        "held_standing" -- standing cannot be established as current; the
            next tick HOLDS and records the hold instead of acting.
        "complete" -- the delegation's mechanical goal predicate fired
            (complete_after_settled reached): terminal.
        "stopped_revoked" -- the mandate is no longer active: terminal.
            The worker stops before any further gate evaluation.
        """
        dlg = self.delegations.get(session.participant_id)
        if dlg is None or session.activity_mode != "automation":
            return "idle"
        status = dlg.get("status")
        if status == "complete":
            return "complete"
        if status == "revoked" or session.revoked:
            return "stopped_revoked"
        if self._active_mandate(session) is None:
            return "stopped_revoked"
        if any(e["participant_id"] == session.participant_id
               and e["status"] == "pending"
               for e in self.escalations.values()):
            return "awaiting_approval"
        if session.paused:
            return "paused"
        checked = session.standing_checked_at
        if checked is None or (time.time() - checked) > MAX_STANDING_AGE_SECONDS:
            return "held_standing"
        return "running"

    def set_paused(self, participant_id: Any, token: Any,
                   paused: Any) -> dict[str, bool]:
        """Owner pause switch for the worker. Paused means the worker takes
        no step for this session. Separate from revocation, which stops the
        NEXT gated action permanently within the session."""
        session = self._auth(participant_id, token)
        if not isinstance(paused, bool):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "paused")
        session.paused = paused
        self.events.emit(
            source="world", kind="pause", provenance="world-rules",
            summary=(f"{session.display_name} worker "
                     f"{'paused' if paused else 'resumed'}."),
            detail={"participant_id": session.participant_id,
                    "paused": paused},
        )
        self.save()
        return {"paused": paused}

    def _create_escalation(self, session: ParticipantSession,
                           delegation: dict[str, Any], reason: str,
                           proposed_action: dict[str, Any],
                           context: dict[str, Any]) -> dict[str, Any]:
        """Create an ESCALATION and PAUSE the delegation. The worker calls
        this instead of acting whenever a limit or review condition is
        breached, or a task kind falls outside permitted_actions. An
        out-of-scope action is held here with NO gate evaluation and NO
        receipt -- the escalation is created before any gate runs. The
        owner resolves it with resolve_escalation()."""
        fingerprint = (f"{reason}:{proposed_action.get('kind')}:"
                       f"{context.get('target_id', '-')}")
        for existing in self.escalations.values():
            if (existing["participant_id"] == session.participant_id
                    and existing["fingerprint"] == fingerprint
                    and existing["status"] == "pending"):
                return dict(existing)
        esc_id = f"esc-{uuid.uuid4().hex[:12]}"
        record = {
            "id": esc_id,
            "participant_id": session.participant_id,
            "delegation_id": delegation["delegation_id"],
            "reason": reason,
            "proposed_action": {"kind": proposed_action.get("kind"),
                                "label": proposed_action.get("label")},
            "context": dict(context),
            "fingerprint": fingerprint,
            "created_at": utc_now().isoformat(),
            "status": "pending",
            "resolved_at": None,
            "decision": None,
        }
        self.escalations[esc_id] = record
        session.paused = True
        self.events.emit(
            source="worker", kind="escalation", provenance="worker-loop",
            summary=(f"Escalation for {session.display_name} ({reason}): "
                     f"{proposed_action.get('label')} -- delegation paused, "
                     "awaiting owner."),
            detail={"escalation_id": esc_id,
                    "participant_id": session.participant_id,
                    "reason": reason},
        )
        return dict(record)

    def _public_escalation(self, esc: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": esc["id"],
            "participant_id": esc["participant_id"],
            "delegation_id": esc["delegation_id"],
            "reason": esc["reason"],
            "proposed_action": dict(esc["proposed_action"]),
            "created_at": esc["created_at"],
            "status": esc["status"],
            "resolved_at": esc["resolved_at"],
            "decision": esc["decision"],
        }

    def escalations_for(self, participant_id: Any,
                        token: Any) -> dict[str, Any]:
        """List this participant's escalations, newest first."""
        session = self._auth(participant_id, token)
        mine = [e for e in self.escalations.values()
                if e["participant_id"] == session.participant_id]
        mine.sort(key=lambda e: e["created_at"], reverse=True)
        return {"escalations": [self._public_escalation(e) for e in mine]}

    def resolve_escalation(self, participant_id: Any, token: Any,
                           escalation_id: Any,
                           decision: Any) -> dict[str, Any]:
        """Resolve a pending escalation. "approve" records a one-shot owner
        authorization for the exact proposed action (consumed by the worker
        on its next tick; the action still goes through the receiver) and
        resumes the delegation. "deny" resumes the delegation WITHOUT the
        action: the denial is recorded by fingerprint, so the worker never
        re-proposes or re-escalates that exact action."""
        session = self._auth(participant_id, token)
        esc = (self.escalations.get(escalation_id)
               if isinstance(escalation_id, str) else None)
        if esc is None or esc["participant_id"] != session.participant_id:
            raise WalletError("WORLD_ESCALATION_UNKNOWN")
        if decision not in ("approve", "deny"):
            raise WorldRuleError("WORLD_RULE_INPUT_INVALID", "decision")
        if esc["status"] != "pending":
            raise WorldRuleError("WORLD_ESCALATION_NOT_PENDING",
                                 f"escalation is {esc['status']}")
        dlg = self.delegations.get(session.participant_id)
        now = utc_now().isoformat()
        if decision == "approve":
            esc["status"] = "approved"
            esc["decision"] = "approve"
            esc["resolved_at"] = now
            if dlg is not None:
                if esc["reason"] == "new_counterpart":
                    counterpart = (esc.get("context") or {}).get("counterpart")
                    if counterpart:
                        dlg["known_counterparts"].add(counterpart)
                if esc["reason"] in ("over_spending", "spending_review"):
                    dlg["spending_reviewed"] = True
                # One-shot owner authorization for the exact proposed
                # action. It bypasses the limit/review breach that caused
                # the escalation exactly once; the action itself is still
                # evaluated by the receiver. Reasons whose blocking
                # condition the approval itself clears (new_counterpart,
                # spending_review) need no grant.
                if esc["reason"] in ("out_of_scope", "over_spending",
                                     "work_limit"):
                    dlg["grants"][esc["fingerprint"]] = {
                        "proposed_action": dict(esc["proposed_action"]),
                        "uses": 1,
                        "escalation_id": esc["id"],
                    }
        else:
            esc["status"] = "denied"
            esc["decision"] = "deny"
            esc["resolved_at"] = now
            if dlg is not None:
                dlg["denied"].add(esc["fingerprint"])
        # Both decisions resume the delegation: approve to perform the
        # one-shot, deny to continue without that action.
        session.paused = False
        if dlg is not None:
            dlg["updated_at"] = now
        self.events.emit(
            source="world", kind="escalation", provenance="world-rules",
            summary=(f"{session.display_name} {decision}d escalation "
                     f"{esc['id']} ({esc['reason']}). Delegation resumed"
                     + ("" if decision == "approve"
                        else " without the proposed action") + "."),
            detail={"escalation_id": esc["id"],
                    "participant_id": session.participant_id,
                    "decision": decision},
        )
        self.save()
        return {"id": esc["id"], "status": esc["status"],
                "decision": esc["decision"]}

    # -- state -----------------------------------------------------------------
    def state(self) -> dict[str, Any]:
        participants = [{
            "participant_id": s.participant_id,
            "display_name": s.display_name,
            "kind": s.kind,
            "agent": {"id": s.agent_id, "display_name": s.agent_display_name},
            "presence": dict(s.presence) if s.presence else None,
            "joined_at": s.joined_at,
            "standing_checked_at": (
                datetime.fromtimestamp(s.standing_checked_at, tz=timezone.utc).isoformat()
                if s.standing_checked_at is not None else None),
            # TRACK A: activity mode ("manual" default, "automation" while
            # delegated to the deterministic worker, "scripted" for
            # tutorial playback), the owner pause switch, the delegation
            # summary (goal + limits, no secrets), the pending escalation
            # count, and the worker's stop-condition state for UI display.
            "activity_mode": s.activity_mode,
            "paused": s.paused,
            "delegation": self._delegation_summary(s.participant_id),
            "pending_escalations": sum(
                1 for e in self.escalations.values()
                if e["participant_id"] == s.participant_id
                and e["status"] == "pending"),
            "worker_state": self._worker_state(s),
            # UNATTENDED COMMISSION: simulated-funds balance (integer
            # cents; simulated money only, never a provider invoice).
            "simulated_balance_cents": self.simulated_balances.get(
                s.participant_id, 0),
        } for s in self.sessions.values()]
        shared = [{
            "shared_by": e["shared_by"],
            "shared_by_display_name": e["shared_by_display_name"],
            "receipt": dict(e["receipt"]),
        } for e in self.shared_receipts]
        events = [{"ts": e["ts"], "kind": e["kind"], "summary": e["summary"]}
                  for e in self.events.replay(0)]
        # Honest transport status: "pending" while a peer has not completed
        # join is a rule for remote transports; the local bus reports its own
        # status and its detail states plainly that there is no remote peer.
        return {
            "world": {"location": "workshop", "version": 1},
            "transport": {
                "mode": self.transport.name,
                "status": self.transport.status(),
                "detail": self.transport.detail(),
            },
            "participants": participants,
            "offers": [dict(o) for o in self.offers.values()],
            "needs": [dict(n) for n in self.needs.values()],
            "agreements": [dict(a) for a in self.agreements.values()],
            "transactions": [dict(t) for t in self.transactions.values()],
            "shared_receipts": shared,
            "events": events,
            "commissions": [{
                "commission_id": c["commission_id"],
                "contract_id": c["contract_id"],
                "status": c["status"],
                "buyer_id": c["contract"]["buyer_id"],
                "seller_id": c["contract"]["seller_id"],
                "recorded_cost_cents": c["recorded_cost_cents"],
                "max_cost_cents": c["contract"]["max_cost_cents"],
                "success_fee_cents": c["contract"]["success_fee_cents"],
                "settlement": copy.deepcopy(c["settlement"]),
            } for c in self.commissions.values()],
            "commission_ledger": copy.deepcopy(self.commission_ledger),
            "notice": WORLD_NOTICE,
        }

    def reset(self) -> dict[str, bool]:
        """Fresh isolated sessions. The snapshot is removed, and the server
        gate key rotates: a reset world is a new world, so old receipts
        verify only against the old key, which is gone. The idempotency
        ledger is cleared with the sessions it belonged to. The transport
        (the world's bus) is kept."""
        closed = len(self.sessions)
        self.sessions = {}
        self.offers = {}
        self.needs = {}
        self.agreements = {}
        self.transactions = {}
        self.shared_receipts = []
        self._challenges = {}
        self._idempotency = {}
        # TRACK A: delegations and escalations are session-scoped -- they
        # belong to the closed sessions and are cleared, never carried over.
        # (Replays are fresh sessions; a new delegation must be recorded.)
        self.delegations = {}
        self.escalations = {}
        self.simulated_balances = {}
        self.commission_contracts = {}
        self.commissions = {}
        self.commission_ledger = []
        self.events = EventLog(max_events=500)
        # Fresh desk: the claim-graph chapter is session-scoped like the
        # receipts; the old chapter (and its event history) is left behind
        # with the closed sessions, never rewritten.
        self.claim_graph = ClaimGraphChapter()
        # Fresh news desk: same session scoping, same leave-behind rule.
        self.newsroom = NewsroomChapter()
        # A reset world is a new world: rotate the receiver key and drop
        # the snapshot.
        self.gate = EffectGate("world-receiver")
        self._snapshot_path().unlink(missing_ok=True)
        self.events.emit(
            source="world", kind="reset", provenance="world-rules",
            summary=f"World reset: {closed} sessions closed; the receiver "
                    "key rotated.",
            detail={},
        )
        return {"reset": True}

    # -- unattended commission -------------------------------------------------
    # One bounded service job: two owners authorize frozen terms once, workers
    # complete the job without further owner input, and the receiver settles
    # from the frozen contract plus recorded cost events. Correct accounting
    # on rejection. Simulated funds only: cost events are never presented as
    # provider invoices.
    #
    # Isolation inheritance (2026-09-27): submitted code never executes.
    # Cost amounts are receiver-computed from the frozen contract's rates;
    # worker-reported totals are audit data only. The payee is always the
    # frozen contract's seller_id.

    def fund_simulated(self, participant_id: Any, token: Any,
                       amount_cents: Any,
                       idempotency_key: Any = None) -> dict[str, Any]:
        """Credit simulated funds to the caller's own balance.

        An owner action on the caller's own simulated balance; token auth is
        enough because it moves no other party's funds. Integer cents.
        """
        session = self._auth(participant_id, token)
        pid = session.participant_id
        if (isinstance(amount_cents, bool) or not isinstance(amount_cents, int)
                or amount_cents <= 0):
            raise WalletError("COMMISSION_FUND_INVALID", "amount_cents")
        key = self._clean_idempotency_key(idempotency_key)

        def execute() -> dict[str, Any]:
            balance = self.simulated_balances.get(pid, 0) + amount_cents
            self.simulated_balances[pid] = balance
            self.commission_ledger.append({
                "kind": "fund", "participant_id": pid,
                "amount_cents": amount_cents, "balance_cents": balance,
                "simulated": True, "at": utc_now().isoformat(),
            })
            self.events.emit(
                source="world", kind="commission.funded",
                provenance="commission",
                summary=(f"{session.display_name} funded "
                         f"{amount_cents}c (simulated)."),
                detail={"participant_id": pid, "balance_cents": balance},
            )
            self.save()
            return {"participant_id": pid, "balance_cents": balance,
                    "simulated": True}

        result, replayed = self._idempotent(
            pid, "commission-fund", {"amount_cents": amount_cents}, key,
            execute)
        result = dict(result)
        result["replayed"] = replayed
        return result

    def commission_propose_contract(
            self, participant_id: Any, token: Any,
            contract: Any) -> dict[str, Any]:
        """Record a proposed commission contract; both owners must then
        authorize it with their root keys before it freezes."""
        session = self._auth(participant_id, token)
        norm = commission_validate(contract)  # raises CommissionError
        sha = commission_sha(norm)
        cid = commission_id_for(norm)
        self.commission_contracts[cid] = {
            "contract_id": cid,
            "contract_sha256": sha,
            "contract": norm,
            "status": "proposed",
            "authorizations": {},
            "proposed_by": session.participant_id,
            "proposed_at": utc_now().isoformat(),
        }
        self.events.emit(
            source="world", kind="commission.contract_proposed",
            provenance="commission",
            summary=(f"Commission contract {cid} proposed: "
                     f"{norm['job']['task'][:80]}."),
            detail={"contract_id": cid, "contract_sha256": sha},
        )
        self.save()
        return {"contract_id": cid, "contract_sha256": sha,
                "status": "proposed"}

    def commission_authorize_contract(
            self, participant_id: Any, token: Any, contract_id: Any,
            owner_signature: Any) -> dict[str, Any]:
        """Record one owner's root-key authorization of the frozen contract.

        The signature covers the contract sha256 and is verified against the
        participant's pinned owner root public key. Only the contract's
        buyer_id or seller_id may authorize; when both have, the contract
        is frozen and can no longer change.
        """
        session = self._auth(participant_id, token)
        entry = self.commission_contracts.get(contract_id)
        if not isinstance(entry, dict) or entry.get("status") not in (
                "proposed", "frozen"):
            raise WalletError("COMMISSION_CONTRACT_UNKNOWN", "contract_id")
        contract = entry["contract"]
        pid = session.participant_id
        if pid not in (contract["buyer_id"], contract["seller_id"]):
            raise WalletError("COMMISSION_AUTHORIZATION_INVALID",
                              "only the contract's buyer or seller may "
                              "authorize")
        if not isinstance(owner_signature, str) or not owner_signature:
            raise WalletError("COMMISSION_AUTHORIZATION_INVALID",
                              "owner_signature")
        try:
            commission_verify_owner(session.owner_root_public_key,
                                    entry["contract_sha256"], owner_signature)
        except CommissionError as exc:
            raise WalletError(exc.code, exc.detail)
        entry["authorizations"][pid] = {
            "signature": owner_signature,
            "at": utc_now().isoformat(),
        }
        if (contract["buyer_id"] in entry["authorizations"]
                and contract["seller_id"] in entry["authorizations"]
                and entry["status"] != "frozen"):
            entry["status"] = "frozen"
            self.events.emit(
                source="world", kind="commission.contract_frozen",
                provenance="commission",
                summary=(f"Commission contract {contract_id} frozen: both "
                         "owners authorized."),
                detail={"contract_id": contract_id,
                        "contract_sha256": entry["contract_sha256"]},
            )
        self.save()
        return {"contract_id": contract_id, "status": entry["status"],
                "authorizations": sorted(entry["authorizations"])}

    def commission_start(self, participant_id: Any, token: Any,
                        contract_id: Any,
                        idempotency_key: Any = None) -> dict[str, Any]:
        """Buyer-only: reserve max_cost + success_fee from simulated funds
        and open the commission. Idempotent: a retried start never reserves
        twice."""
        session = self._auth(participant_id, token)
        entry = self.commission_contracts.get(contract_id)
        if not isinstance(entry, dict) or entry.get("status") != "frozen":
            raise WalletError("COMMISSION_CONTRACT_NOT_FROZEN", "contract_id")
        contract = entry["contract"]
        pid = session.participant_id
        if pid != contract["buyer_id"]:
            raise WalletError("COMMISSION_START_BUYER_ONLY",
                              "only the contract's buyer starts the job")
        key = self._clean_idempotency_key(idempotency_key)

        def execute() -> dict[str, Any]:
            reserved = (contract["max_cost_cents"]
                        + contract["success_fee_cents"])
            balance = self.simulated_balances.get(pid, 0)
            if balance < reserved:
                raise WalletError(
                    "COMMISSION_INSUFFICIENT_SIMULATED_FUNDS",
                    f"need {reserved}c, have {balance}c")
            self.simulated_balances[pid] = balance - reserved
            commission_id = "com-" + secrets.token_hex(8)
            now = utc_now().isoformat()
            self.commissions[commission_id] = {
                "commission_id": commission_id,
                "contract_id": contract_id,
                "contract_sha256": entry["contract_sha256"],
                "contract": copy.deepcopy(contract),
                "status": "active",
                "reserved_cents": reserved,
                "cost_events": [],
                "recorded_cost_cents": 0,
                "deliverable": None,
                "settlement": None,
                "revoked_by": None,
                "started_at": now,
            }
            self.commission_ledger.append({
                "kind": "reserve", "commission_id": commission_id,
                "participant_id": pid, "amount_cents": reserved,
                "balance_cents": self.simulated_balances[pid],
                "simulated": True, "at": now,
            })
            self.events.emit(
                source="world", kind="commission.started",
                provenance="commission",
                summary=(f"Commission {commission_id} started: "
                         f"{reserved}c reserved (simulated)."),
                detail={"commission_id": commission_id,
                        "contract_id": contract_id,
                        "reserved_cents": reserved},
            )
            self.save()
            return {"commission_id": commission_id, "status": "active",
                    "reserved_cents": reserved,
                    "buyer_balance_cents": self.simulated_balances[pid]}

        result, replayed = self._idempotent(
            pid, "commission-start", {"contract_id": contract_id}, key,
            execute)
        result = dict(result)
        result["replayed"] = replayed
        return result

    def _commission_get(self, commission_id: Any) -> dict[str, Any]:
        com = self.commissions.get(commission_id)
        if not isinstance(com, dict):
            raise WalletError("COMMISSION_UNKNOWN", "commission_id")
        return com

    def _commission_check_liveness(
            self, com: dict[str, Any]) -> None:
        """Refuse gated work on a commission that can no longer proceed.

        Revoked -> refused outright. Expired deadline -> transition to
        stopped_deadline and settle costs-only, then refuse. The frozen
        contract's terms decide; nothing here depends on worker claims.
        """
        if com["status"] == "revoked":
            raise WalletError("COMMISSION_REVOKED",
                              "the commission was revoked; no new gated work")
        if com["status"] != "active":
            raise WalletError("COMMISSION_NOT_ACTIVE", com["status"])
        if time.time() > com["contract"]["deadline_ts"]:
            com["status"] = "stopped_deadline"
            settlement = self._commission_settle(com, "stopped_deadline")
            self.events.emit(
                source="world", kind="commission.deadline",
                provenance="commission",
                summary=(f"Commission {com['commission_id']} hit its "
                         "deadline; settled costs-only."),
                detail={"commission_id": com["commission_id"],
                        "settlement_id": settlement["settlement_id"]},
            )
            self.save()
            raise WalletError("COMMISSION_DEADLINE_PASSED", "deadline_ts")

    def _commission_settle(self, com: dict[str, Any],
                           outcome: str) -> dict[str, Any]:
        """Settle from the frozen contract + recorded events. Idempotent.

        The payee is always the contract's seller_id; the amounts are
        receiver-computed. Reused across accept / reject / cap / deadline /
        revoke paths so no path can settle differently.
        """
        if com.get("settlement") is not None:
            return copy.deepcopy(com["settlement"])
        accepted = outcome == "accepted"
        amounts = commission_settle_amounts(
            com["contract"], com["recorded_cost_cents"], accepted)
        seller = com["contract"]["seller_id"]
        buyer = com["contract"]["buyer_id"]
        self.simulated_balances[seller] = (
            self.simulated_balances.get(seller, 0)
            + amounts["seller_payout_cents"])
        self.simulated_balances[buyer] = (
            self.simulated_balances.get(buyer, 0)
            + amounts["buyer_release_cents"])
        now = utc_now().isoformat()
        self.commission_ledger.append({
            "kind": "settle", "commission_id": com["commission_id"],
            "outcome": outcome,
            "seller_payout_cents": amounts["seller_payout_cents"],
            "buyer_release_cents": amounts["buyer_release_cents"],
            "payee": seller, "simulated": True, "at": now,
        })
        settlement = {
            "settlement_id": commission_new_id(),
            "commission_id": com["commission_id"],
            "contract_id": com["contract_id"],
            "contract_sha256": com["contract_sha256"],
            "outcome": outcome,
            "recorded_cost_cents": amounts["recorded_cost_cents"],
            "success_fee_cents": amounts["success_fee_cents"],
            "seller_payout_cents": amounts["seller_payout_cents"],
            "buyer_release_cents": amounts["buyer_release_cents"],
            "payee": seller,
            "simulated": True,
            "at": now,
        }
        com["settlement"] = settlement
        com["status"] = outcome
        self.events.emit(
            source="world", kind="commission.settled",
            provenance="commission",
            summary=(f"Commission {com['commission_id']} settled "
                     f"({outcome}): seller {amounts['seller_payout_cents']}c, "
                     f"buyer released {amounts['buyer_release_cents']}c "
                     "(simulated)."),
            detail={"commission_id": com["commission_id"],
                    "settlement_id": settlement["settlement_id"],
                    "outcome": outcome},
        )
        self.save()
        return copy.deepcopy(settlement)

    def commission_report_cost(
            self, participant_id: Any, token: Any, commission_id: Any,
            op: Any, units: Any, claimed_cents: Any, presentation: Any,
            idempotency_key: Any = None) -> dict[str, Any]:
        """Worker-reported cost event, recorded by the receiver.

        Gated: the worker must present an ALLOWED receipt for
        "commission.report-cost" under a fresh mandate, and the caller must
        be the contract's seller. The recorded amount is computed from the
        frozen contract's rate for `op`; `claimed_cents` is stored as audit
        data and never enters settlement. An event that would push recorded
        costs past max_cost_cents is refused and the commission stops with
        an honest costs-only settlement.
        """
        session = self._auth(participant_id, token)
        com = self._commission_get(commission_id)
        if session.participant_id != com["contract"]["seller_id"]:
            raise WalletError("COMMISSION_SELLER_ONLY",
                              "only the contract's seller reports costs")
        key = self._clean_idempotency_key(idempotency_key)
        ref = {"commission_id": com["commission_id"], "op": op,
               "units": units, "claimed_cents": claimed_cents}

        def execute() -> dict[str, Any]:
            # The presentation is evaluated inside the idempotent boundary:
            # a replayed retry returns the recorded result with no new
            # receipts and no new effects.
            self._require_fresh_standing(session)
            receipt = self._require_allowed(self._evaluate_presentation(
                session, "commission.report-cost", presentation))
            self._commission_check_liveness(com)
            try:
                cost_cents = commission_compute_cost(com["contract"], op,
                                                     units)
            except CommissionError as exc:
                raise WalletError(exc.code, exc.detail)
            if com["recorded_cost_cents"] + cost_cents > com["contract"]["max_cost_cents"]:
                com["status"] = "stopped_cap"
                settlement = self._commission_settle(com, "stopped_cap")
                self.events.emit(
                    source="world", kind="commission.cap",
                    provenance="commission",
                    summary=(f"Commission {com['commission_id']} hit its "
                             "cost cap; settled costs-only."),
                    detail={"commission_id": com["commission_id"],
                            "settlement_id": settlement["settlement_id"]},
                )
                self.save()
                raise WalletError("COMMISSION_COST_CAP_EXCEEDED",
                                  "recorded costs would exceed max_cost_cents")
            event = {
                "event_id": "ce-" + secrets.token_hex(8),
                "op": op, "units": units,
                "rate_cents": cost_cents // units,
                "cost_cents": cost_cents,
                "claimed_cents": claimed_cents,
                "receipt_id": receipt.get("receipt_id"),
                "at": utc_now().isoformat(),
            }
            com["cost_events"].append(event)
            com["recorded_cost_cents"] += cost_cents
            self.events.emit(
                source="world", kind="commission.cost_recorded",
                provenance="commission",
                summary=(f"Commission {com['commission_id']}: {op} x{units} "
                         f"= {cost_cents}c recorded (simulated)."),
                detail={"commission_id": com["commission_id"],
                        "event_id": event["event_id"],
                        "cost_cents": cost_cents,
                        "recorded_cost_cents": com["recorded_cost_cents"]},
            )
            self.save()
            return {"commission_id": com["commission_id"],
                    "event_id": event["event_id"],
                    "recorded_cost_cents": cost_cents,
                    "total_recorded_cents": com["recorded_cost_cents"]}

        result, replayed = self._idempotent(
            session.participant_id, "commission-report-cost", ref, key,
            execute)
        result = dict(result)
        result["replayed"] = replayed
        return result

    def commission_submit_deliverable(
            self, participant_id: Any, token: Any, commission_id: Any,
            deliverable_text: Any, presentation: Any,
            idempotency_key: Any = None) -> dict[str, Any]:
        """Seller's worker submits the deliverable; the receiver evaluates
        it against the frozen acceptance criteria and settles. Acceptance is
        deterministic and receiver-side; no submitted code executes."""
        session = self._auth(participant_id, token)
        com = self._commission_get(commission_id)
        if session.participant_id != com["contract"]["seller_id"]:
            raise WalletError("COMMISSION_SELLER_ONLY",
                              "only the contract's seller submits the "
                              "deliverable")
        key = self._clean_idempotency_key(idempotency_key)
        ref = {"commission_id": com["commission_id"],
               "deliverable_sha256": hashlib.sha256(
                   repr(deliverable_text).encode("utf-8")).hexdigest()}

        def execute() -> dict[str, Any]:
            # Inside the idempotent boundary: a retried submit after a
            # crash replays the recorded settlement instead of raising
            # COMMISSION_NOT_ACTIVE.
            self._require_fresh_standing(session)
            self._require_allowed(self._evaluate_presentation(
                session, "commission.submit-deliverable", presentation))
            self._commission_check_liveness(com)
            accepted, reasons = commission_evaluate(
                com["contract"], deliverable_text)
            com["deliverable"] = {
                "text": deliverable_text if isinstance(deliverable_text, str)
                else None,
                "accepted": accepted,
                "reasons": reasons,
                "at": utc_now().isoformat(),
            }
            outcome = "accepted" if accepted else "rejected"
            settlement = self._commission_settle(com, outcome)
            self.events.emit(
                source="world", kind="commission.deliverable_decided",
                provenance="commission",
                summary=(f"Commission {com['commission_id']} deliverable "
                         f"{outcome}."),
                detail={"commission_id": com["commission_id"],
                        "outcome": outcome, "reasons": reasons,
                        "settlement_id": settlement["settlement_id"]},
            )
            self.save()
            return {"commission_id": com["commission_id"],
                    "outcome": outcome, "reasons": reasons,
                    "settlement": settlement}

        result, replayed = self._idempotent(
            session.participant_id, "commission-submit", ref, key, execute)
        result = dict(result)
        result["replayed"] = replayed
        return result

    def commission_revoke(self, participant_id: Any, token: Any,
                          commission_id: Any,
                          owner_signature: Any) -> dict[str, Any]:
        """Either owner revokes the commission with their root key.

        Revocation stops new gated work; already-incurred authorized costs
        are accounted under the frozen contract (costs-only settlement).
        The signature covers "<commission_id>:revoke" and is verified
        against the caller's pinned owner root public key.
        """
        session = self._auth(participant_id, token)
        com = self._commission_get(commission_id)
        pid = session.participant_id
        if pid not in (com["contract"]["buyer_id"],
                       com["contract"]["seller_id"]):
            raise WalletError("COMMISSION_REVOKE_OWNER_ONLY",
                              "only the contract's buyer or seller revokes")
        if com["status"] not in ("active",):
            raise WalletError("COMMISSION_NOT_ACTIVE", com["status"])
        if not isinstance(owner_signature, str) or not owner_signature:
            raise WalletError("COMMISSION_AUTHORIZATION_INVALID",
                              "owner_signature")
        try:
            commission_verify_owner(session.owner_root_public_key,
                                    f"{com['commission_id']}:revoke",
                                    owner_signature)
        except CommissionError as exc:
            raise WalletError(exc.code, exc.detail)
        com["status"] = "revoked"
        com["revoked_by"] = pid
        settlement = self._commission_settle(com, "revoked")
        self.events.emit(
            source="world", kind="commission.revoked",
            provenance="commission",
            summary=(f"Commission {com['commission_id']} revoked by "
                     f"{session.display_name}; settled costs-only."),
            detail={"commission_id": com["commission_id"],
                    "revoked_by": pid,
                    "settlement_id": settlement["settlement_id"]},
        )
        self.save()
        return {"commission_id": com["commission_id"], "status": "revoked",
                "settlement": settlement}

    def commission_close_expired(
            self, participant_id: Any, token: Any, commission_id: Any,
            idempotency_key: Any = None) -> dict[str, Any]:
        """Either owner closes a commission whose deadline has passed with
        no deliverable: honest costs-only settlement, no blind re-charge."""
        session = self._auth(participant_id, token)
        com = self._commission_get(commission_id)
        pid = session.participant_id
        if pid not in (com["contract"]["buyer_id"],
                       com["contract"]["seller_id"]):
            raise WalletError("COMMISSION_REVOKE_OWNER_ONLY",
                              "only the contract's buyer or seller closes")
        if com["status"] != "active":
            raise WalletError("COMMISSION_NOT_ACTIVE", com["status"])
        if time.time() <= com["contract"]["deadline_ts"]:
            raise WalletError("COMMISSION_DEADLINE_NOT_PASSED",
                              "the deadline has not passed")
        key = self._clean_idempotency_key(idempotency_key)

        def execute() -> dict[str, Any]:
            com["status"] = "stopped_deadline"
            settlement = self._commission_settle(com, "stopped_deadline")
            self.events.emit(
                source="world", kind="commission.deadline",
                provenance="commission",
                summary=(f"Commission {com['commission_id']} closed after "
                         "its deadline; settled costs-only."),
                detail={"commission_id": com["commission_id"],
                        "settlement_id": settlement["settlement_id"]},
            )
            self.save()
            return {"commission_id": com["commission_id"],
                    "status": "stopped_deadline", "settlement": settlement}

        result, replayed = self._idempotent(
            pid, "commission-close-expired",
            {"commission_id": com["commission_id"]}, key, execute)
        result = dict(result)
        result["replayed"] = replayed
        return result

    def commission_describe(self, commission_id: Any) -> dict[str, Any]:
        """Public view: frozen terms, recorded events, and the accounting
        reconciliation — actual costs, seller compensation, released funds,
        and net balances shown separately."""
        com = self._commission_get(commission_id)
        contract = com["contract"]
        settlement = copy.deepcopy(com.get("settlement"))
        accounting: dict[str, Any] | None = None
        if settlement is not None:
            buyer = contract["buyer_id"]
            seller = contract["seller_id"]
            accounting = {
                "recorded_cost_cents": settlement["recorded_cost_cents"],
                "success_fee_cents": settlement["success_fee_cents"],
                "seller_compensation_cents":
                    settlement["seller_payout_cents"],
                "released_to_buyer_cents":
                    settlement["buyer_release_cents"],
                "buyer_net_cents": (
                    -(settlement["seller_payout_cents"])),
                "seller_net_cents": settlement["seller_payout_cents"],
                "buyer_balance_cents":
                    self.simulated_balances.get(buyer, 0),
                "seller_balance_cents":
                    self.simulated_balances.get(seller, 0),
                "cost_events": copy.deepcopy(com["cost_events"]),
                "simulated": True,
            }
        return {
            "commission_id": com["commission_id"],
            "contract_id": com["contract_id"],
            "contract_sha256": com["contract_sha256"],
            "contract": copy.deepcopy(contract),
            "status": com["status"],
            "reserved_cents": com["reserved_cents"],
            "recorded_cost_cents": com["recorded_cost_cents"],
            "cost_events": copy.deepcopy(com["cost_events"]),
            "deliverable": copy.deepcopy(com["deliverable"]),
            "settlement": settlement,
            "accounting": accounting,
            "deadline_passed": (
                time.time() > contract["deadline_ts"]
                and com["status"] == "active"),
        }

    # -- persistence ------------------------------------------------------------
    def _snapshot_path(self) -> Path:
        return self._data_root / SNAPSHOT_FILENAME

    @staticmethod
    def _freeze_ref(ref: Any) -> Any:
        """JSON-safe serialization of idempotency refs: tuples become
        {"__tuple__": [...]} so plain lists in results stay lists."""
        if isinstance(ref, tuple):
            return {"__tuple__": [World._freeze_ref(v) for v in ref]}
        if isinstance(ref, list):
            return [World._freeze_ref(v) for v in ref]
        if isinstance(ref, dict):
            return {k: World._freeze_ref(v) for k, v in ref.items()}
        return ref

    @staticmethod
    def _thaw_ref(value: Any) -> Any:
        if isinstance(value, dict) and set(value) == {"__tuple__"}:
            return tuple(World._thaw_ref(v) for v in value["__tuple__"])
        if isinstance(value, list):
            return [World._thaw_ref(v) for v in value]
        if isinstance(value, dict):
            return {k: World._thaw_ref(v) for k, v in value.items()}
        return value

    def save(self) -> None:
        """Durably write world state: the server gate key, per-session
        authority records + tokens + metadata, and all public world state.
        Called after every mutating call."""
        sessions = {}
        for pid, s in self.sessions.items():
            sessions[pid] = {
                "participant_id": s.participant_id,
                "display_name": s.display_name,
                "agent_id": s.agent_id,
                "agent_display_name": s.agent_display_name,
                "agent_public_key": s.agent_public_key,
                "token": s.token,
                "owner_principal_id": s.owner_principal_id,
                "owner_root_public_key": s.owner_root_public_key,
                "worker_public_key": s.worker_public_key,
                "mandate_id": s.mandate_id,
                "mandate_scopes": list(s.mandate_scopes),
                "authority_bundle": copy.deepcopy(s.authority_bundle),
                "authority_head_hash": s.authority_head_hash,
                "revoked": s.revoked,
                "receipts": copy.deepcopy(s.receipts),
                "joined_at": s.joined_at,
                "presence": copy.deepcopy(s.presence),
                "last_presence_ts": s.last_presence_ts,
                "standing_checked_at": s.standing_checked_at,
                "kind": s.kind,
                "activity_mode": s.activity_mode,
                "paused": s.paused,
            }
        delegations = {}
        for pid, dlg in self.delegations.items():
            record = dict(dlg)
            record["known_counterparts"] = sorted(dlg["known_counterparts"])
            record["denied"] = sorted(dlg["denied"])
            delegations[pid] = record
        data = {
            "schema": SNAPSHOT_SCHEMA,
            "saved_at": utc_now().isoformat(),
            "gate_private_key_hex": private_key_hex(self.gate.gate_key),
            "sessions": sessions,
            "offers": copy.deepcopy(self.offers),
            "needs": copy.deepcopy(self.needs),
            "agreements": copy.deepcopy(self.agreements),
            "transactions": copy.deepcopy(self.transactions),
            "shared_receipts": copy.deepcopy(self.shared_receipts),
            "idempotency": [
                {"participant_id": pid, "label": label, "key": key,
                 "ref": self._freeze_ref(entry["ref"]),
                 "result": copy.deepcopy(entry["result"])}
                for (pid, label, key), entry in self._idempotency.items()
            ],
            "delegations": delegations,
            "escalations": copy.deepcopy(self.escalations),
            "simulated_balances": dict(self.simulated_balances),
            "commission_contracts": copy.deepcopy(self.commission_contracts),
            "commissions": copy.deepcopy(self.commissions),
            "commission_ledger": copy.deepcopy(self.commission_ledger),
        }
        tmp = self._snapshot_path().with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(self._snapshot_path())

    def _load_snapshot(self) -> None:
        """Restore a saved world: gate key, pinned principals, admitted
        bundle heads, sessions, and public world state. A session whose
        head cannot be re-admitted (stale export) is kept but cannot be
        evaluated until the owner refreshes: the receiver will STOP with
        BUNDLE_NOT_ADMITTED rather than assume authority."""
        path = self._snapshot_path()
        if not path.exists():
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if not isinstance(data, dict) or data.get("schema") != SNAPSHOT_SCHEMA:
            return
        key_hex = data.get("gate_private_key_hex")
        if (not isinstance(key_hex, str)
                or re.fullmatch(r"[0-9a-fA-F]{64}", key_hex) is None):
            return
        try:
            restored = EffectGate(
                "world-receiver",
                gate_key=Ed25519PrivateKey.from_private_bytes(
                    bytes.fromhex(key_hex)))
        except (ValueError, WalletError):
            return
        self.gate = restored
        for _pid, rec in (data.get("sessions") or {}).items():
            try:
                self.gate.pin_principal(rec["owner_principal_id"],
                                        rec["owner_root_public_key"])
            except WalletError:
                continue
            admitted_head = None
            try:
                admission = self.gate.admit_bundle(rec["authority_bundle"])
                admitted_head = admission["head_hash"]
            except WalletError:
                pass  # kept, unevaluatable until the owner refreshes
            self.sessions[_pid] = ParticipantSession(
                participant_id=rec["participant_id"],
                display_name=rec["display_name"],
                agent_id=rec["agent_id"],
                agent_display_name=rec["agent_display_name"],
                agent_public_key=rec["agent_public_key"],
                token=rec["token"],
                owner_principal_id=rec["owner_principal_id"],
                owner_root_public_key=rec["owner_root_public_key"],
                worker_public_key=rec["worker_public_key"],
                mandate_id=rec["mandate_id"],
                mandate_scopes=list(rec.get("mandate_scopes") or []),
                authority_bundle=rec.get("authority_bundle") or {},
                authority_head_hash=(admitted_head
                                     if admitted_head is not None
                                     else rec.get("authority_head_hash")),
                revoked=bool(rec.get("revoked")),
                receipts=list(rec.get("receipts") or []),
                joined_at=rec.get("joined_at") or "",
                presence=rec.get("presence"),
                last_presence_ts=float(rec.get("last_presence_ts") or 0.0),
                standing_checked_at=rec.get("standing_checked_at"),
                kind=rec.get("kind") or "real",
                activity_mode=rec.get("activity_mode") or "manual",
                paused=bool(rec.get("paused")),
            )
        self.offers = data.get("offers") or {}
        self.needs = data.get("needs") or {}
        self.agreements = data.get("agreements") or {}
        self.transactions = data.get("transactions") or {}
        self.shared_receipts = data.get("shared_receipts") or []
        for entry in data.get("idempotency") or []:
            try:
                slot = (entry["participant_id"], entry["label"], entry["key"])
                self._idempotency[slot] = {
                    "ref": self._thaw_ref(entry["ref"]),
                    "result": entry["result"],
                }
            except (KeyError, TypeError):
                continue
        for pid, dlg in (data.get("delegations") or {}).items():
            record = dict(dlg)
            record["known_counterparts"] = set(
                record.get("known_counterparts") or [])
            record["denied"] = set(record.get("denied") or [])
            self.delegations[pid] = record
        self.escalations = data.get("escalations") or {}
        self.simulated_balances = {
            str(k): int(v) for k, v in
            (data.get("simulated_balances") or {}).items()}
        self.commission_contracts = data.get("commission_contracts") or {}
        self.commissions = data.get("commissions") or {}
        self.commission_ledger = data.get("commission_ledger") or []
