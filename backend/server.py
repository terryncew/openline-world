"""OpenLine Workshop backend.

Layers: browser -> this workshop server -> the real OpenLine gate
(see workshop_gate.py / NOTICE). Rendering, execution, and authorization
stay separate.

Binds to 127.0.0.1 only. Validates every input. Redacts at the boundary:
no private keys, prompts, tool inputs, or filesystem paths reach the browser.
"""
from __future__ import annotations

import json
import os
import queue
import re
import shutil
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from adapter_claude_hooks import (
    MAX_BODY_BYTES as HOOK_MAX_BYTES,
    describe_activity,
    validate_hook_payload,
)
from events import EventLog
from workshop_gate import WorkshopGate, describe_receipt
from world import World, WorldAuthError, WorldRuleError
from openline_wallet.errors import WalletError

HOST = os.environ.get("WORKSHOP_HOST", "127.0.0.1")
PORT = int(os.environ.get("WORKSHOP_PORT", "8471"))
MAX_BODY = 256 * 1024
STALE_AFTER_SECONDS = 15
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$")
def _origin_allowed(origin: str) -> bool:
    """Loopback dev origins only (any local port): the workshop frontend."""
    try:
        host = origin.split("://", 1)[1].rsplit(":", 1)[0]
    except IndexError:
        return False
    return host in ("127.0.0.1", "localhost", "[::1]")


_ALLOWED_ORIGINS = {"http://127.0.0.1:5173", "http://localhost:5173"}

TASK_ID = "task-workshop-1"
TASK_TITLE = "Prepare the weekly notes summary"
WREN_SCOPES = ["notes.read", "notes.write"]

SESSION_KEEP = 10


def new_session_dir() -> Path:
    """Fresh isolated session directory.

    Every demo reset starts a new session directory and never touches an
    old one: revocation in a previous session is neither reversed nor
    erased, it is simply left behind with that session.
    """
    sessions = Path(__file__).resolve().parent / "data" / "sessions"
    sessions.mkdir(parents=True, exist_ok=True)
    d = sessions / f"session-{uuid.uuid4().hex[:12]}"
    d.mkdir(parents=True)
    old = sorted(sessions.glob("session-*"), key=lambda p: p.stat().st_mtime)
    for stale in old[: -SESSION_KEEP]:
        shutil.rmtree(stale, ignore_errors=True)
    return d


class Workshop:
    def __init__(self, data_dir: Path) -> None:
        self.log = EventLog()
        self.gate = WorkshopGate(data_dir)
        self.mode = "demo"  # demo | connected
        self.last_adapter_ts = 0.0
        self.demo_step = 0
        self.demo_finished = False
        self.review: dict[str, Any] | None = None
        self._boot()

    # -- boot -----------------------------------------------------------
    def _boot(self) -> None:
        info = self.gate.onboard_helper("wren", WREN_SCOPES)
        self.log.emit(
            source="owner", kind="mandate", provenance="owner-signed",
            task_id=TASK_ID,
            summary="You gave Wren a bounded mandate: read and write project notes, nothing else.",
            detail={"mandate_id": info["mandate_id"], "scopes": info["scopes"],
                    "admission": info["admission"]},
        )
        self.log.emit(
            source="workshop", kind="connection", provenance="owner-signed",
            task_id=TASK_ID,
            summary="Workshop is running in DEMO mode: deterministic synthetic events, no paid calls.",
            detail={"mode": "demo"},
        )

    # -- demo script ------------------------------------------------------
    def demo_steps(self) -> list[tuple[str, Any]]:
        return [
            ("Wren reads the project notes", self._s_wren_reads),
            ("Wren proposes notes.write", self._s_propose_write),
            ("Wren tidies the workbench", self._s_wren_tidies),
            ("Wren proposes config.write", self._s_propose_config),
            ("Wren says \u201cdone\u201d", self._s_wren_done),
            ("You revoke Wren\u2019s mandate", self._s_revoke_wren),
            ("Wren tries notes.read anyway", self._s_wren_after_revoke),
            ("You onboard Juniper", self._s_onboard_juniper),
            ("Juniper proposes notes.write", self._s_juniper_write),
        ]

    def advance_demo(self) -> dict[str, Any]:
        steps = self.demo_steps()
        if self.demo_step >= len(steps):
            self.demo_finished = True
            return {"finished": True, "step": self.demo_step, "total": len(steps)}
        label, fn = steps[self.demo_step]
        fn()
        self.demo_step += 1
        if self.demo_step >= len(steps):
            self.demo_finished = True
            self.log.emit(
                source="workshop", kind="note", provenance="owner-signed", task_id=TASK_ID,
                summary="Demo complete. The human owns the workshop. Helpers can change. Rules and records remain.",
                detail={},
            )
        return {"finished": self.demo_finished, "step": self.demo_step,
                "total": len(steps), "label": label}

    def _s_wren_reads(self) -> None:
        # A real gated decision: reading the notes is inside Wren's mandate,
        # so the receiver signs an ALLOWED receipt for it.
        self._propose("wren", "notes.read")

    def _propose(self, helper: str, action: str) -> None:
        self.log.emit(source="agent", kind="proposal", provenance="agent-reported",
                      task_id=TASK_ID,
                      summary=f"{helper.title()} proposes: {action}.",
                      detail={"helper": helper, "action": action})
        receipt = self.gate.request_decision(helper, action)
        decision = receipt["decision"]
        plain = describe_receipt(receipt)
        rule = "The action must be inside the helper's mandate scopes, and the mandate must be active."
        sig = receipt.get("signature") or {}
        self.review = {
            "helper": helper, "action": action, "rule": rule,
            "decision": decision, "reason": plain,
            "receipt_id": (sig.get("value", "") if isinstance(sig, dict) else "")[:16],
            "decided_at": receipt.get("decided_at"),
        }
        self.log.emit(source="receiver", kind="decision", provenance="receiver-signed",
                      task_id=TASK_ID, summary=plain,
                      detail={"helper": helper, "action": action, "decision": decision,
                              "reason_codes": list(receipt.get("reason_codes", []))})
        self.log.emit(source="receiver", kind="receipt", provenance="receiver-signed",
                      task_id=TASK_ID,
                      summary=f"Signed receipt recorded: {decision} for {action}.",
                      detail={"receipt": _public_receipt(receipt)})

    def _s_propose_write(self) -> None:
        self._propose("wren", "notes.write")

    def _s_wren_tidies(self) -> None:
        self.log.emit(source="agent", kind="activity", provenance="agent-reported",
                      task_id=TASK_ID, summary="Wren is tidying the workbench.",
                      detail={"helper": "wren"})

    def _s_propose_config(self) -> None:
        self._propose("wren", "config.write")

    def _s_wren_done(self) -> None:
        self.log.emit(source="agent", kind="activity", provenance="agent-reported",
                      task_id=TASK_ID,
                      summary="Wren says \u201cdone\u201d — but nothing was sent to the receiver.",
                      detail={"helper": "wren"})
        self.log.emit(source="workshop", kind="note", provenance="owner-signed",
                      task_id=TASK_ID,
                      summary="No accepted-work receipt: saying \u201cdone\u201d is activity, not acceptance. Only the receiver mints receipts.",
                      detail={})

    def _s_revoke_wren(self) -> None:
        info = self.gate.revoke_helper("wren", reason="USER_REVOKED")
        self.log.emit(source="owner", kind="mandate", provenance="owner-signed",
                      task_id=TASK_ID,
                      summary="You revoked Wren\u2019s mandate. The receiver admitted the revocation.",
                      detail={"mandate_id": info["mandate_id"], "status": info["status"],
                              "admission": info["admission"]})

    def _s_wren_after_revoke(self) -> None:
        self._propose("wren", "notes.read")

    def _s_onboard_juniper(self) -> None:
        info = self.gate.onboard_helper("juniper", WREN_SCOPES)
        self.log.emit(source="owner", kind="mandate", provenance="owner-signed",
                      task_id=TASK_ID,
                      summary="You gave Juniper its own mandate with the same bounds. The rules and the records stayed; only the helper changed.",
                      detail={"mandate_id": info["mandate_id"], "scopes": info["scopes"],
                              "admission": info["admission"]})

    def _s_juniper_write(self) -> None:
        self._propose("juniper", "notes.write")

    # -- owner actions ------------------------------------------------------
    def owner_propose(self, helper: str, action: str) -> dict[str, Any]:
        if not _ID.fullmatch(helper) or not _ID.fullmatch(action):
            raise WalletError("WORKSHOP_INPUT_INVALID")
        if helper not in self.gate.helpers:
            raise WalletError("HELPER_UNKNOWN", helper)
        self._propose(helper, action)
        return {"review": self.review}

    def owner_revoke(self, helper: str) -> dict[str, Any]:
        if not _ID.fullmatch(helper):
            raise WalletError("WORKSHOP_INPUT_INVALID")
        return self.gate.revoke_helper(helper)

    def owner_onboard(self, helper: str, scopes: list[str]) -> dict[str, Any]:
        if not _ID.fullmatch(helper) or not scopes or len(scopes) > 16:
            raise WalletError("WORKSHOP_INPUT_INVALID")
        clean = [s for s in scopes if isinstance(s, str) and _ID.fullmatch(s)]
        if len(clean) != len(scopes):
            raise WalletError("WORKSHOP_INPUT_INVALID")
        info = self.gate.onboard_helper(helper, clean)
        self.log.emit(source="owner", kind="mandate", provenance="owner-signed",
                      task_id=TASK_ID,
                      summary=f"You gave {helper} a bounded mandate: {', '.join(clean)}.",
                      detail={"mandate_id": info["mandate_id"], "scopes": clean})
        return info

    # -- adapter --------------------------------------------------------------
    def ingest_hook(self, body: Any) -> dict[str, Any]:
        ok, result = validate_hook_payload(body)
        if not ok:
            raise WalletError(str(result))
        self.last_adapter_ts = time.time()
        summary = describe_activity(result)
        event = self.log.emit(
            source="adapter", kind="activity", provenance="adapter-mapped",
            task_id=TASK_ID, summary=summary,
            detail={"hook_event": result["hook_event_name"],
                    "tool_name": result.get("tool_name") or None,
                    "note": "Activity only — never a receipt."},
        )
        return {"accepted": True, "event_id": event["event_id"]}

    # -- state ------------------------------------------------------------------
    def connection(self) -> dict[str, Any]:
        if self.mode == "demo":
            return {"status": "LOCAL_DEMO",
                    "detail": "Deterministic synthetic events. No paid calls, no network services."}
        if self.last_adapter_ts == 0:
            return {"status": "WAITING",
                    "detail": "Connected mode: waiting for the first hook event."}
        idle = time.time() - self.last_adapter_ts
        if idle > STALE_AFTER_SECONDS:
            return {"status": "STALE",
                    "detail": f"No hook events for {int(idle)}s — telemetry is UNKNOWN. Nothing is shown as working."}
        return {"status": "LIVE",
                "detail": f"Receiving hook events. Last event {int(idle)}s ago."}

    def snapshot(self) -> dict[str, Any]:
        helpers = []
        for hid, h in self.gate.helpers.items():
            rec = self.gate.mandate_record(hid) or {}
            helpers.append({
                "helper_id": hid, "active": h.active,
                "scopes": rec.get("scopes", []), "mandate_id": rec.get("mandate_id"),
            })
        steps = self.demo_steps()
        return {
            "mode": self.mode,
            "connection": self.connection(),
            "task": {"task_id": TASK_ID, "title": TASK_TITLE},
            "helpers": helpers,
            "review": self.review,
            "receipts": len(self.gate.receipts),
            "demo": {
                "step": self.demo_step, "total": len(steps),
                "finished": self.demo_finished,
                "next": steps[self.demo_step][0] if self.demo_step < len(steps) else None,
            },
            "gate": {"gate_id": self.gate.gate_id,
                     "gate_public_key": self.gate.gate.public_key,
                     "principal_id": self.gate.wallet.principal_id},
            "session": self.gate.data_dir.name,
            "notice": ("Trusted-operator local preview: this interface does not "
                       "authenticate separate people."),
        }


def _public_receipt(receipt: dict[str, Any]) -> dict[str, Any]:
    keep = ["schema", "gate_id", "gate_public_key", "principal_id", "mandate_id",
            "subject_id", "action", "decision", "reason_codes", "presentation_hash",
            "decided_at", "signature"]
    return {k: receipt.get(k) for k in keep}


class Handler(BaseHTTPRequestHandler):
    server_version = "OpenLineWorkshop/0.1"

    @property
    def workshop(self) -> Workshop:
        return self.server.workshop  # type: ignore[attr-defined]

    @property
    def world(self) -> World:
        return self.server.world  # type: ignore[attr-defined]

    # -- helpers -----------------------------------------------------------
    def _send(self, status: int, body: Any) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        origin = self.headers.get("Origin", "")
        if _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        self.wfile.write(encoded)

    def _body(self) -> Any:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            raise WalletError("HTTP_CONTENT_LENGTH_INVALID")
        if length <= 0 or length > MAX_BODY:
            raise WalletError("HTTP_BODY_SIZE_INVALID")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise WalletError("HTTP_JSON_INVALID")

    def log_message(self, *args: object) -> None:
        return

    # -- routes --------------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        origin = self.headers.get("Origin", "")
        if _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            if self.path == "/api/health":
                self._send(200, {"status": "ok", "mode": self.workshop.mode})
            elif self.path == "/api/state":
                self._send(200, self.workshop.snapshot())
            elif self.path.startswith("/api/events"):
                self._sse()
            elif self.path == "/api/receipts":
                self._send(200, {"receipts": [_public_receipt(r) for r in self.workshop.gate.receipt_records()]})
            elif self.path == "/api/world/state":
                self._send(200, self.world.state())
            elif self.path == "/api/world/claimgraph":
                self._send(200, self.world.claimgraph_describe())
            elif self.path == "/api/world/newsroom":
                self._send(200, self.world.newsroom_describe())
            elif self.path == "/api/world/challenge":
                self._send(200, self.world.challenge())
            elif self.path == "/api/world/challenge/read":
                # Read-only challenge board. Note: /api/world/challenge
                # itself is the join-nonce endpoint; the board lives here
                # so the two never collide.
                self._send(200, self.world.challenge_describe())
            elif self.path.startswith("/api/world/receipts"):
                qs = parse_qs(urlparse(self.path).query)
                self._send(200, self.world.receipts_for(
                    qs.get("participant_id", [""])[0], qs.get("token", [""])[0]))
            elif self.path.startswith("/api/world/agreements/"):
                agr_id = self.path[len("/api/world/agreements/"):]
                agreement = self.world.agreements.get(agr_id)
                if agreement is None:
                    self._send(404, {"error": "NOT_FOUND"})
                else:
                    self._send(200, agreement)
            elif self.path.startswith("/api/world/board"):
                qs = parse_qs(urlparse(self.path).query)
                self._send(200, self.world.board({
                    "side": qs.get("side", [None])[0],
                    "kind": qs.get("kind", [None])[0],
                    "from_participant": qs.get("from_participant", [None])[0],
                    "hide_samples": qs.get("hide_samples", [None])[0],
                }))
            elif self.path.startswith("/api/world/suggestions"):
                qs = parse_qs(urlparse(self.path).query)
                self._send(200, self.world.suggestions_for(
                    qs.get("participant_id", [""])[0], qs.get("token", [""])[0]))
            elif self.path.startswith("/api/world/delegation"):
                qs = parse_qs(urlparse(self.path).query)
                self._send(200, self.world.delegation_for(
                    qs.get("participant_id", [""])[0], qs.get("token", [""])[0]))
            elif self.path.startswith("/api/world/escalations"):
                qs = parse_qs(urlparse(self.path).query)
                self._send(200, self.world.escalations_for(
                    qs.get("participant_id", [""])[0], qs.get("token", [""])[0]))
            else:
                self._send(404, {"error": "NOT_FOUND"})
        except WorldAuthError as exc:
            self._send(403, {"error": str(exc) or "WORLD_AUTH_MISMATCH"})
        except WorldRuleError as exc:
            self._send(409, {"error": exc.code, "detail": str(exc)})
        except WalletError as exc:
            self._send(409, {"error": exc.code, "detail": str(exc)})
        except BrokenPipeError:
            pass

    def do_POST(self) -> None:  # noqa: N802
        try:
            path = self.path
            if path == "/api/adapter/hooks":
                body = self._body()
                if len(json.dumps(body).encode()) > HOOK_MAX_BYTES:
                    raise WalletError("HOOK_BODY_TOO_LARGE")
                self._send(200, self.workshop.ingest_hook(body))
                return
            body = self._body() if path not in (
                "/api/demo/advance", "/api/demo/reset",
                "/api/world/challenge", "/api/world/reset") else {}
            if not isinstance(body, dict):
                raise WalletError("HTTP_JSON_OBJECT_REQUIRED")
            if path == "/api/demo/advance":
                self._send(200, self.workshop.advance_demo())
            elif path == "/api/demo/reset":
                # Fresh isolated session: the old session (and its revocation
                # history) is left untouched on disk, never reversed or erased.
                self.server.workshop = Workshop(new_session_dir())  # type: ignore[attr-defined]
                self._send(200, {"reset": True})
            elif path == "/api/mode":
                mode = body.get("mode")
                if mode not in ("demo", "connected"):
                    raise WalletError("WORKSHOP_MODE_INVALID")
                self.workshop.mode = mode
                self.workshop.log.emit(
                    source="workshop", kind="connection", provenance="owner-signed",
                    task_id=TASK_ID, summary=f"Switched to {mode.upper()} mode.",
                    detail={"mode": mode})
                self._send(200, {"mode": mode})
            elif path == "/api/owner/propose":
                self._send(200, self.workshop.owner_propose(
                    str(body.get("helper", "")), str(body.get("action", ""))))
            elif path == "/api/owner/revoke":
                info = self.workshop.owner_revoke(str(body.get("helper", "")))
                self.workshop.log.emit(
                    source="owner", kind="mandate", provenance="owner-signed",
                    task_id=TASK_ID,
                    summary=f"You revoked {body.get('helper')}\u2019s mandate.",
                    detail={"mandate_id": info["mandate_id"]})
                self._send(200, info)
            elif path == "/api/owner/onboard":
                scopes = body.get("scopes", [])
                self._send(200, self.workshop.owner_onboard(
                    str(body.get("helper", "")), list(scopes) if isinstance(scopes, list) else []))
            elif path == "/api/world/challenge":
                self._send(200, self.world.challenge())
            elif path == "/api/world/join":
                self._send(200, self.world.join(body.get("profile")))
            elif path == "/api/world/presence":
                self._send(200, self.world.presence(
                    body.get("participant_id"), body.get("token"), body.get("presence")))
            elif path == "/api/world/offer":
                self._send(200, self.world.offer(
                    body.get("participant_id"), body.get("token"), body.get("task"),
                    body.get("authorization"), body.get("idempotency_key")))
            elif path == "/api/world/offer/accept":
                self._send(200, self.world.accept_offer(
                    body.get("participant_id"), body.get("token"), body.get("offer_id"),
                    body.get("authorization"), body.get("idempotency_key")))
            elif path == "/api/world/propose":
                self._send(200, self.world.propose(
                    body.get("participant_id"), body.get("token"), body.get("action"),
                    body.get("presentation"), body.get("idempotency_key")))
            elif path == "/api/world/gate/challenge":
                self._send(200, self.world.gate_challenge(
                    body.get("participant_id"), body.get("token"), body.get("action")))
            elif path == "/api/world/authority/refresh":
                self._send(200, self.world.authority_refresh(
                    body.get("participant_id"), body.get("token"), body.get("bundle")))
            elif path == "/api/world/receipts/share":
                self._send(200, self.world.share_receipt(
                    body.get("participant_id"), body.get("token"), body.get("receipt_id")))
            elif path == "/api/world/claimgraph/correct":
                self._send(200, self.world.claimgraph_correct(
                    body.get("participant_id"), body.get("token"), body.get("status"),
                    body.get("presentation"), body.get("idempotency_key")))
            elif path == "/api/world/newsroom/import":
                self._send(200, self.world.newsroom_import(
                    body.get("participant_id"), body.get("token"), body.get("article"),
                    body.get("presentation"), body.get("idempotency_key")))
            elif path == "/api/world/newsroom/submit-report":
                self._send(200, self.world.newsroom_submit_report(
                    body.get("participant_id"), body.get("token"), body.get("report"),
                    body.get("idempotency_key")))
            elif path == "/api/world/newsroom/submit-package":
                self._send(200, self.world.newsroom_submit_package(
                    body.get("participant_id"), body.get("token"),
                    body.get("submission"), body.get("presentation"),
                    body.get("idempotency_key")))
            elif path == "/api/world/newsroom/review":
                self._send(200, self.world.newsroom_review(
                    body.get("participant_id"), body.get("token"), body.get("proposal_id"),
                    body.get("decision"), body.get("presentation"),
                    body.get("idempotency_key")))
            elif path == "/api/world/challenge/create":
                self._send(200, self.world.challenge_create(
                    body.get("participant_id"), body.get("token"),
                    body.get("spec"), body.get("presentation"),
                    body.get("idempotency_key")))
            elif path == "/api/world/challenge/contribute":
                self._send(200, self.world.challenge_contribute(
                    body.get("participant_id"), body.get("token"),
                    body.get("contribution"), body.get("presentation"),
                    body.get("idempotency_key")))
            elif path == "/api/world/challenge/evaluate":
                self._send(200, self.world.challenge_evaluate(
                    body.get("participant_id"), body.get("token"),
                    body.get("contribution_id"), body.get("decision"),
                    body.get("reason"), body.get("presentation"),
                    body.get("idempotency_key")))
            elif path == "/api/world/reset":
                # Fresh isolated sessions; the snapshot is removed.
                self._send(200, self.world.reset())
            elif path == "/api/world/needs":
                self._send(200, self.world.need(
                    body.get("participant_id"), body.get("token"), body.get("task"),
                    body.get("authorization"), body.get("idempotency_key")))
            elif path == "/api/world/agreements":
                self._send(200, self.world.propose_agreement(
                    body.get("participant_id"), body.get("token"), body.get("listing_id"),
                    body.get("authorization"), body.get("idempotency_key")))
            elif path.startswith("/api/world/agreements/"):
                rest = path[len("/api/world/agreements/"):]
                agr_id, _, action = rest.partition("/")
                if not agr_id or _ID.fullmatch(agr_id) is None:
                    raise WalletError("WORKSHOP_INPUT_INVALID")
                if action == "agree":
                    self._send(200, self.world.agree(
                        body.get("participant_id"), body.get("token"), agr_id,
                        body.get("authorization"), body.get("idempotency_key")))
                elif action == "decline":
                    self._send(200, self.world.decline(
                        body.get("participant_id"), body.get("token"), agr_id,
                        body.get("idempotency_key")))
                elif action == "submit":
                    self._send(200, self.world.submit(
                        body.get("participant_id"), body.get("token"), agr_id,
                        body.get("idempotency_key")))
                else:
                    self._send(404, {"error": "NOT_FOUND"})
            elif path.startswith("/api/world/listings/") and path.endswith("/withdraw"):
                listing_id = path[len("/api/world/listings/"):-len("/withdraw")]
                if not listing_id or _ID.fullmatch(listing_id) is None:
                    raise WalletError("WORKSHOP_INPUT_INVALID")
                self._send(200, self.world.withdraw_listing(
                    body.get("participant_id"), body.get("token"), listing_id,
                    body.get("idempotency_key")))
            elif path == "/api/world/delegate":
                self._send(200, self.world.delegate(
                    body.get("participant_id"), body.get("token"),
                    body.get("delegation")))
            elif path == "/api/world/commission/fund":
                self._send(200, self.world.fund_simulated(
                    body.get("participant_id"), body.get("token"),
                    body.get("amount_cents"), body.get("idempotency_key")))
            elif path == "/api/world/commission/propose-contract":
                self._send(200, self.world.commission_propose_contract(
                    body.get("participant_id"), body.get("token"),
                    body.get("contract")))
            elif path == "/api/world/commission/authorize-contract":
                self._send(200, self.world.commission_authorize_contract(
                    body.get("participant_id"), body.get("token"),
                    body.get("contract_id"), body.get("owner_signature")))
            elif path == "/api/world/commission/start":
                self._send(200, self.world.commission_start(
                    body.get("participant_id"), body.get("token"),
                    body.get("contract_id"), body.get("idempotency_key")))
            elif path == "/api/world/commission/report-cost":
                self._send(200, self.world.commission_report_cost(
                    body.get("participant_id"), body.get("token"),
                    body.get("commission_id"), body.get("op"),
                    body.get("units"), body.get("claimed_cents"),
                    body.get("presentation"), body.get("idempotency_key")))
            elif path == "/api/world/commission/submit-deliverable":
                self._send(200, self.world.commission_submit_deliverable(
                    body.get("participant_id"), body.get("token"),
                    body.get("commission_id"), body.get("deliverable_text"),
                    body.get("presentation"), body.get("idempotency_key")))
            elif path == "/api/world/commission/revoke":
                self._send(200, self.world.commission_revoke(
                    body.get("participant_id"), body.get("token"),
                    body.get("commission_id"), body.get("owner_signature")))
            elif path == "/api/world/commission/close-expired":
                self._send(200, self.world.commission_close_expired(
                    body.get("participant_id"), body.get("token"),
                    body.get("commission_id"), body.get("idempotency_key")))
            elif path == "/api/world/commission/describe":
                self._send(200, self.world.commission_describe(
                    body.get("commission_id")))
            elif path == "/api/world/activity-mode":
                self._send(200, self.world.set_activity_mode(
                    body.get("participant_id"), body.get("token"),
                    body.get("mode")))
            elif path == "/api/world/agent/pause":
                self._send(200, self.world.set_paused(
                    body.get("participant_id"), body.get("token"),
                    body.get("paused")))
            elif path.startswith("/api/world/escalations/") and path.endswith("/resolve"):
                esc_id = path[len("/api/world/escalations/"):-len("/resolve")]
                if not esc_id or _ID.fullmatch(esc_id) is None:
                    raise WalletError("WORKSHOP_INPUT_INVALID")
                self._send(200, self.world.resolve_escalation(
                    body.get("participant_id"), body.get("token"), esc_id,
                    body.get("decision")))
            else:
                self._send(404, {"error": "NOT_FOUND"})
        except WorldAuthError as exc:
            self._send(403, {"error": str(exc) or "WORLD_AUTH_MISMATCH"})
        except WorldRuleError as exc:
            self._send(409, {"error": exc.code, "detail": str(exc)})
        except WalletError as exc:
            self._send(409, {"error": exc.code, "detail": str(exc)})
        except BrokenPipeError:
            pass
        except Exception as exc:
            self._send(500, {"error": "WORKSHOP_INTERNAL_ERROR",
                             "detail": type(exc).__name__})

    def _sse(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        origin = self.headers.get("Origin", "")
        if _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        q: queue.Queue = queue.Queue()
        def listener(event: dict[str, Any]) -> None:
            q.put(event)
        self.workshop.log.subscribe(listener)
        try:
            since = 0
            if "?" in self.path:
                qs = self.path.split("?", 1)[1]
                for part in qs.split("&"):
                    if part.startswith("since="):
                        try:
                            since = int(part.split("=", 1)[1])
                        except ValueError:
                            pass
            for event in self.workshop.log.replay(since):
                self._sse_send(event)
            while True:
                event = q.get(timeout=25)
                self._sse_send(event)
        except (BrokenPipeError, ConnectionResetError, queue.Empty):
            pass
        finally:
            self.workshop.log.unsubscribe(listener)

    def _sse_send(self, event: dict[str, Any]) -> None:
        data = json.dumps(event).encode("utf-8")
        self.wfile.write(b"data: " + data + b"\n\n")
        self.wfile.flush()


def main() -> int:
    workshop = Workshop(new_session_dir())
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.workshop = workshop  # type: ignore[attr-defined]
    # Data root from WORLD_DATA_DIR (the custody demo passes it to the
    # server subprocess); the default is backend/data/world. The world
    # snapshot lives under this root.
    data_dir = os.environ.get("WORLD_DATA_DIR")
    server.world = (World(data_root=Path(data_dir))  # type: ignore[attr-defined]
                    if data_dir else World())  # type: ignore[attr-defined]
    print(f"OpenLine Workshop backend  http://{HOST}:{PORT}")
    print("Receiver: real OpenLine EffectGate (in-process), loopback only.")
    print("World: separate key custody -- one server receiver key; "
          "participants hold their own keys.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
