"""Participant client for the separate-key-custody world.

One ParticipantClient = one participant, pointed at an isolated key dir. It
holds the participant's OWN keys: the owner root Ed25519 key, the worker
(agent) Ed25519 key, and the owner wallet (grant / revoke / export). Private
keys live only in the key dir and this process; they are never transmitted.
The world server sees only public keys, the owner-signed mandate bundle, and
worker-signed presentations.

Implements the contract in docs/separate-custody-design.md:
  join()     GET /api/world/challenge -> worker proof-of-control
             -> POST /api/world/join {profile}
  authorize() POST /api/world/gate/challenge {participant_id, token, action}
             -> create_presentation(...)
  owner acts post_offer / post_need / propose_agreement / agree / submit
             each carry the owner-signed presentation ("authorization")
  revoke()   local wallet.revoke -> export_bundle -> POST
             /api/world/authority/refresh; returns measured latency (seconds)
             from local revoke to admitted refresh response

HTTP is stdlib urllib only. Bearer tokens stay in memory; they are never
written to disk or printed. Run as `python clients/participant.py` from the
repo root (sys.path is fixed up below) or import it.
"""
from __future__ import annotations

import ast
import json
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

# Standalone bundle: this file's directory holds participant.py and the
# vendored openline_wallet package (see VENDORING.md). No machine-local
# repo paths are referenced.
_BUNDLE_DIR = Path(__file__).resolve().parent
if str(_BUNDLE_DIR) not in sys.path:
    sys.path.insert(0, str(_BUNDLE_DIR))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from openline_wallet import Wallet, create_presentation
from openline_wallet import crypto as wcrypto
from openline_wallet.errors import WalletError

JOIN_PROFILE_VERSION = "openline-join-profile/v1"
_ID = __import__("re").compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$")


class ClientError(Exception):
    """A refused or failed world call. `code` is the server error code."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


# Standalone bundle: pinned copy of the world's TASK_KINDS mapping, taken
# verbatim from backend/world.py at the vendoring commit (see VENDORING.md).
# The bundle has no backend to read live, so this is the last fallback.
_PINNED_TASK_KINDS = {
    "tidy-notes": "notes.write",
    "summarize": "notes.read",
    "draft": "draft.write",
    "challenge-contribute": "challenge.contribute",
}


def _load_task_kinds() -> dict[str, str]:
    """Kind -> gated action mapping, read from backend/world.py, never guessed.

    Prefer importing it live; fall back to parsing the source file so the
    mapping always tracks the world's own allowlist. In the standalone
    bundle neither exists, so fall back to the pinned copy above.
    """
    try:
        from backend.world import TASK_KINDS  # type: ignore

        return dict(TASK_KINDS)
    except Exception:
        pass
    world_py = _BUNDLE_DIR / "backend" / "world.py"
    if world_py.exists():
        src = world_py.read_text(encoding="utf-8")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "TASK_KINDS" for t in node.targets
            ):
                return dict(ast.literal_eval(node.value))
    return dict(_PINNED_TASK_KINDS)


TASK_KINDS: dict[str, str] = _load_task_kinds()


def _redact_pub(public_hex: str) -> str:
    return (public_hex or "")[:8] + "..."


class ParticipantClient:
    """One participant's key custody + world session."""

    def __init__(self, key_dir: str | Path, server_base: str, *, timeout: float = 10.0) -> None:
        self.key_dir = Path(key_dir)
        self.server_base = server_base.rstrip("/")
        self.timeout = timeout
        self.participant_id: str | None = None
        self.agent_id: str | None = None
        self._root_key: Ed25519PrivateKey | None = None
        self._worker_key: Ed25519PrivateKey | None = None
        self._wallet: Wallet | None = None
        self._bundle: dict[str, Any] | None = None
        self._mandate_id: str | None = None
        self._token: str | None = None

    def __repr__(self) -> str:
        return (
            f"ParticipantClient(participant_id={self.participant_id!r}, "
            f"agent_id={self.agent_id!r}, token={'***' if self._token else None})"
        )

    @property
    def worker_public_key(self) -> str:
        """The worker's PUBLIC key hex. The private key never leaves the client."""
        if self._worker_key is None:
            raise ClientError("CLIENT_NO_CEREMONY", "ceremony() first")
        return wcrypto.public_key_hex(self._worker_key)

    # -- key ceremony --------------------------------------------------------

    @staticmethod
    def _check_id(value: str, label: str) -> str:
        if not isinstance(value, str) or _ID.fullmatch(value) is None:
            raise ClientError("CLIENT_ID_INVALID", f"{label}: {value!r}")
        return value

    def _load_or_generate(self, name: str) -> Ed25519PrivateKey:
        path = self.key_dir / f"{name}.key"
        if path.exists():
            return wcrypto.load_private_key(path)
        key = Ed25519PrivateKey.generate()
        # save_private_key writes with 0o600 and refuses to clobber.
        wcrypto.save_private_key(path, key)
        return key

    def ceremony(
        self,
        participant_id: str,
        display_name: str,
        agent_id: str,
        agent_display_name: str,
        scopes: list[str],
        *,
        mandate_ttl_hours: int = 24,
    ) -> dict[str, Any]:
        """Generate owner root + worker keys, create the wallet, grant the
        worker mandate, export the first bundle. Keys are the participant's
        own: generated here, persisted at 0o600 in the key dir, never sent
        anywhere. Re-running against an existing key dir re-opens the wallet
        instead of replacing keys.
        """
        participant_id = self._check_id(participant_id, "participant_id")
        agent_id = self._check_id(agent_id, "agent_id")
        self.key_dir.mkdir(parents=True, exist_ok=True)
        self._root_key = self._load_or_generate("owner-root")
        self._worker_key = self._load_or_generate("worker")
        wallet_dir = self.key_dir / "wallet"
        try:
            self._wallet = Wallet.create(
                wallet_dir, label=f"Owner wallet for {participant_id}", root_key=self._root_key
            )
        except WalletError as exc:
            if exc.code == "WALLET_DIRECTORY_NOT_EMPTY":
                self._wallet = Wallet.open(wallet_dir)
            else:
                raise
        root_pub = wcrypto.public_key_hex(self._root_key)
        worker_pub = wcrypto.public_key_hex(self._worker_key)
        principal_id = wcrypto.principal_id(root_pub)
        if principal_id != self._wallet.principal_id:
            raise ClientError("CLIENT_PRINCIPAL_MISMATCH", "wallet principal != derived principal")
        timeline = self._wallet.timeline()
        mandate_id = timeline.active_by_subject.get(agent_id)
        if mandate_id is None:
            self._wallet.grant(
                subject_id=agent_id,
                subject_public_key=worker_pub,
                scopes=scopes,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=mandate_ttl_hours),
            )
            mandate_id = self._wallet.timeline().active_by_subject.get(agent_id)
        self.participant_id = participant_id
        self.agent_id = agent_id
        self._display_name = display_name
        self._agent_display_name = agent_display_name
        self._mandate_id = mandate_id
        self._bundle = self._wallet.export_bundle()
        return {
            "participant_id": participant_id,
            "agent_id": agent_id,
            "principal_id": principal_id,
            "mandate_id": mandate_id,
            "root_public_key": _redact_pub(root_pub),
            "worker_public_key": _redact_pub(worker_pub),
            "scopes": list(scopes),
        }

    # -- http ----------------------------------------------------------------

    def _url(self, path: str) -> str:
        return self.server_base + path

    def _request(self, method: str, path: str, body: Any = None) -> Any:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urlrequest.Request(self._url(path), data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urlrequest.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
        except HTTPError as exc:
            try:
                payload = json.loads(exc.read().decode("utf-8"))
            except Exception:
                payload = None
            if isinstance(payload, dict) and payload.get("error"):
                raise ClientError(str(payload["error"]), str(payload.get("detail", ""))) from exc
            raise ClientError(f"HTTP_{exc.code}", self._url(path)) from exc
        except URLError as exc:
            raise ClientError("CLIENT_CONNECTION_FAILED", str(exc)) from exc
        try:
            parsed = json.loads(raw) if raw.strip() else None
        except ValueError as exc:
            raise ClientError("CLIENT_BAD_RESPONSE", f"non-JSON from {path}") from exc
        # Wire-shape guard (transport hardening): the server's contract is
        # that error bodies ({"error": ...}) are always sent with a non-200
        # status (403/404/409). An HTTP 200 carrying the error shape is
        # transport corruption — observed on the public path as a 200 with
        # a mismatched {"error": ...} body — never a server verdict. Treat
        # it as a transport failure (safe to retry), never as a success.
        if isinstance(parsed, dict) and "error" in parsed:
            raise ClientError(
                "CLIENT_TRANSPORT_FAILURE",
                f"HTTP 200 from {path} carried an error-shaped body "
                f"(error={parsed.get('error')!r}); treating as transport "
                "corruption — safe to retry, not a server verdict",
            )
        return parsed

    def _get(self, path: str) -> Any:
        return self._request("GET", path)

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        return self._request("POST", path, body)

    def _auth(self) -> tuple[str, str]:
        if not self.participant_id or not self._token:
            raise ClientError("CLIENT_NOT_JOINED", "join() first")
        return self.participant_id, self._token

    # -- join ----------------------------------------------------------------

    def join(self) -> dict[str, Any]:
        """Proof-of-control join: server nonce, worker signs the nonce bytes,
        signature sent as hex (matches the server's _verify_proof shape). The
        returned bearer token stays in memory only.
        """
        if self._wallet is None or self._worker_key is None or self._bundle is None:
            raise ClientError("CLIENT_NO_CEREMONY", "ceremony() first")
        nonce = self._get("/api/world/challenge").get("nonce")
        if not nonce:
            raise ClientError("CLIENT_BAD_RESPONSE", "challenge returned no nonce")
        signature = self._worker_key.sign(nonce.encode("utf-8")).hex()
        profile = {
            "version": JOIN_PROFILE_VERSION,
            "participant": {
                "id": self.participant_id,
                "display_name": getattr(self, "_display_name", self.participant_id),
            },
            "agent": {
                "id": self.agent_id,
                "display_name": getattr(self, "_agent_display_name", self.agent_id),
                "public_key": wcrypto.public_key_hex(self._worker_key),
            },
            "owner": {
                "principal_id": self._wallet.principal_id,
                "root_public_key": self._wallet.root_public_key,
            },
            "mandate_bundle": self._bundle,
            "mandate": {"scopes": list(self._bundle_scopes())},
            "proof": {"nonce": nonce, "signature": signature},
            "capabilities": ["exchange"],
        }
        resp = self._post("/api/world/join", {"profile": profile})
        token = resp.get("token") if isinstance(resp, dict) else None
        if not token:
            raise ClientError("CLIENT_BAD_RESPONSE", "join returned no token")
        self._token = token
        return resp

    def _bundle_scopes(self) -> list[str]:
        timeline = self._wallet.timeline() if self._wallet else None
        if timeline and self._mandate_id:
            mandate = timeline.mandates.get(self._mandate_id)
            if mandate:
                return list(mandate.get("scopes", []))
        return []

    # -- authorize -------------------------------------------------------------

    def action_for_kind(self, kind: str) -> str:
        try:
            return TASK_KINDS[kind]
        except KeyError:
            raise ClientError("CLIENT_UNKNOWN_TASK_KIND", kind) from None

    def authorize(self, action: str) -> dict[str, Any]:
        """Fetch a one-use gate challenge for this exact action and sign the
        worker presentation over the latest exported bundle. Each call consumes
        one challenge; a presentation is single-use by construction.
        """
        participant_id, token = self._auth()
        if self._wallet is None or self._worker_key is None:
            raise ClientError("CLIENT_NO_CEREMONY", "ceremony() first")
        if self._bundle is None or self._mandate_id is None or self.agent_id is None:
            raise ClientError("CLIENT_NO_MANDATE", "no active mandate")
        challenge = self._post(
            "/api/world/gate/challenge",
            {"participant_id": participant_id, "token": token, "action": action},
        ).get("challenge")
        if not challenge:
            raise ClientError("CLIENT_BAD_RESPONSE", "gate/challenge returned no challenge")
        return create_presentation(
            bundle=self._bundle,
            mandate_id=self._mandate_id,
            subject_id=self.agent_id,
            subject_key=self._worker_key,
            action=action,
            receiver_challenge=challenge,
        )

    # -- owner acts ------------------------------------------------------------

    @staticmethod
    def _idempotency_key(provided: str | None) -> str:
        return provided or uuid.uuid4().hex

    def post_offer(self, task: dict[str, Any], idempotency_key: str | None = None) -> dict[str, Any]:
        """Post an offer. The poster's presentation is evaluated at posting;
        the ALLOWED receipt is stored on the listing."""
        participant_id, token = self._auth()
        authorization = self.authorize(self.action_for_kind(task["kind"]))
        return self._post(
            "/api/world/offer",
            {
                "participant_id": participant_id,
                "token": token,
                "task": task,
                "authorization": authorization,
                "idempotency_key": self._idempotency_key(idempotency_key),
            },
        )

    def post_need(self, task: dict[str, Any], idempotency_key: str | None = None) -> dict[str, Any]:
        """Post a need. A need is a request, not an action: no gate."""
        participant_id, token = self._auth()
        return self._post(
            "/api/world/needs",
            {
                "participant_id": participant_id,
                "token": token,
                "task": task,
                "idempotency_key": self._idempotency_key(idempotency_key),
            },
        )

    def _listing_kind(self, listing_id: str) -> str:
        board = self.board()
        candidates: list[dict[str, Any]] = []
        if isinstance(board, dict):
            for key in ("offers", "needs", "listings"):
                items = board.get(key)
                if isinstance(items, list):
                    candidates.extend(i for i in items if isinstance(i, dict))
        elif isinstance(board, list):
            candidates.extend(i for i in board if isinstance(i, dict))
        for listing in candidates:
            if listing.get("listing_id") in (listing_id,) or listing.get("offer_id") == listing_id \
                    or listing.get("need_id") == listing_id:
                kind = listing.get("kind") or (listing.get("task") or {}).get("kind")
                if kind:
                    return kind
        raise ClientError("CLIENT_LISTING_UNKNOWN", listing_id)

    def propose_agreement(self, listing_id: str, idempotency_key: str | None = None) -> dict[str, Any]:
        """Propose an agreement on a listing. The proposer's receipt is stored.
        The authorized action is the listing task's gated action."""
        participant_id, token = self._auth()
        authorization = self.authorize(self.action_for_kind(self._listing_kind(listing_id)))
        return self._post(
            "/api/world/agreements",
            {
                "participant_id": participant_id,
                "token": token,
                "listing_id": listing_id,
                "authorization": authorization,
                "idempotency_key": self._idempotency_key(idempotency_key),
            },
        )

    def agree(self, agreement_id: str) -> dict[str, Any]:
        """Agree to an agreement. Agree is consent; the stored receipt is the
        authorization artifact, evaluated now."""
        participant_id, token = self._auth()
        agreement = self.agreement(agreement_id)
        listing_id = agreement.get("listing_id")
        if not listing_id:
            raise ClientError("CLIENT_BAD_RESPONSE", f"agreement {agreement_id} has no listing")
        authorization = self.authorize(self.action_for_kind(self._listing_kind(listing_id)))
        return self._post(
            f"/api/world/agreements/{agreement_id}/agree",
            {"participant_id": participant_id, "token": token, "authorization": authorization},
        )

    def submit(self, agreement_id: str) -> dict[str, Any]:
        """Submit an agreed agreement. No new presentation: both stored
        receipts are re-validated against current authority heads."""
        participant_id, token = self._auth()
        return self._post(
            f"/api/world/agreements/{agreement_id}/submit",
            {"participant_id": participant_id, "token": token},
        )

    def propose(self, action: str, presentation: dict[str, Any] | None = None) -> dict[str, Any]:
        """Generic single-action gate check. presentation is optional so the
        missing-authorization refusal path is testable."""
        participant_id, token = self._auth()
        body: dict[str, Any] = {"participant_id": participant_id, "token": token, "action": action}
        if presentation is not None:
            body["presentation"] = presentation
        return self._post("/api/world/propose", body)

    # -- inspectors (public, no auth) ------------------------------------------

    def state(self) -> dict[str, Any]:
        return self._get("/api/world/state")

    def board(self) -> dict[str, Any]:
        return self._get("/api/world/board")

    def agreements(self) -> dict[str, Any]:
        return self._get("/api/world/agreements")

    def agreement(self, agreement_id: str) -> dict[str, Any]:
        return self._get(f"/api/world/agreements/{agreement_id}")

    # -- authority refresh -------------------------------------------------------

    def refresh(self) -> dict[str, Any]:
        """Export the current bundle and submit it as the new authority head."""
        participant_id, token = self._auth()
        if self._wallet is None:
            raise ClientError("CLIENT_NO_CEREMONY", "ceremony() first")
        bundle = self._wallet.export_bundle()
        resp = self._post(
            "/api/world/authority/refresh",
            {"participant_id": participant_id, "token": token, "bundle": bundle},
        )
        self._bundle = bundle
        return resp

    # -- standing refresh (working-copy addition, pending publication) --------

    def standing_refresh(self) -> dict[str, Any]:
        """Prove possession of the existing session key and refresh standing
        after inactivity, without a new bundle and without rejoining.
        Mirrors the committed repo change in openline-world
        (clients/participant.py); the server route is already deployed."""
        participant_id, token = self._auth()
        return self._post(
            "/api/world/standing/refresh",
            {"participant_id": participant_id, "token": token},
        )

    def revoke(self) -> tuple[float, dict[str, Any]]:
        """Revoke the worker mandate locally, export, and push the new head to
        the world. Returns (latency_seconds, server response): the measured
        interval from local revoke to admitted refresh. Revocation is not
        instant across the network; this number is the honest interval.
        """
        t0 = time.perf_counter()
        if self._wallet is None or self._mandate_id is None:
            raise ClientError("CLIENT_NO_MANDATE", "no active mandate to revoke")
        self._wallet.revoke(self._mandate_id)
        bundle = self._wallet.export_bundle()
        participant_id, token = self._auth()
        resp = self._post(
            "/api/world/authority/refresh",
            {"participant_id": participant_id, "token": token, "bundle": bundle},
        )
        latency = time.perf_counter() - t0
        self._bundle = bundle
        return latency, resp

    # -- participant retirement (owner-signed, irreversible) -------------------

    RETIRE_MESSAGE_PREFIX = "openline-world/retire/v1:"

    def retire_session(self) -> dict[str, Any]:
        """Owner-signed irreversible retirement of this participant's session.

        The owner signs the action-bound message
        ``openline-world/retire/v1:{participant_id}:{nonce}`` with the owner
        ROOT key pinned at join (not the worker key: retirement is an owner
        act). The nonce is server-issued, single-use, TTL-bound
        (GET /api/world/challenge, same proof-of-control endpoint as join).

        Server effects: the session is archived irreversibly, all future
        worker authority for it dies, the logical slot is freed for a fresh
        join, and history / receipts / attribution are preserved. The
        receiver returns a signed RETIRED receipt, which is verified here
        before this client drops its session: an unverified retirement is
        refused and the local session is kept, so a garbled response can
        never strand the owner without a token or a way back in.

        After a verified retirement this client holds no session: the
        cached bearer token is discarded and any further authed call
        raises CLIENT_NOT_JOINED. There is no un-retire; a later join
        starts a fresh session.
        """
        participant_id, _token = self._auth()
        if self._root_key is None:
            raise ClientError("CLIENT_NO_CEREMONY", "ceremony() first")
        nonce = self._get("/api/world/challenge").get("nonce")
        if not nonce:
            raise ClientError("CLIENT_BAD_RESPONSE",
                              "challenge returned no nonce")
        message = f"{self.RETIRE_MESSAGE_PREFIX}{participant_id}:{nonce}"
        owner_signature = self._root_key.sign(
            message.encode("utf-8")).hex()
        resp = self._post("/api/world/retire", {
            "participant_id": participant_id,
            "nonce": nonce,
            "owner_signature": owner_signature,
        })
        if not isinstance(resp, dict) or resp.get("retired") is not True:
            raise ClientError("CLIENT_BAD_RESPONSE",
                              "retire returned no retirement confirmation")
        receipt = resp.get("receipt")
        verified, detail = self._verify_retirement_receipt(
            participant_id, receipt)
        if not verified:
            # Fail closed: do not drop the local session on unverified
            # news. The owner keeps their token and can retry or inspect.
            raise ClientError("CLIENT_RETIRE_UNVERIFIED", detail)
        # The session is dead server-side and the receiver's verdict is
        # verified. Kill it client-side too: drop the bearer token from
        # memory and delete the cached token file so this client cannot
        # act further for the retired session.
        self._token = None
        try:
            (self.key_dir / ".session-token").unlink()
        except OSError:
            pass
        return {
            "retired": True,
            "participant_id": participant_id,
            "retired_at": resp.get("retired_at"),
            "receipt_verified": True,
            "receipt_verify_detail": detail,
            "receipt": receipt,
        }

    @staticmethod
    def _verify_retirement_receipt(participant_id: str,
                                   receipt: Any) -> tuple[bool, str]:
        """Verify the receiver's signed RETIRED receipt.

        Returns (ok, detail). Checks the receipt schema, the Ed25519
        signature over the canonical body, that the signer is the claimed
        gate key, and that the receipt names this participant with a
        RETIRED decision.
        """
        if not isinstance(receipt, dict):
            return False, "receipt missing or malformed"
        if receipt.get("schema") != "openline.world.retirement_receipt.v1":
            return False, \
                f"unexpected receipt schema: {receipt.get('schema')!r}"
        ok, why = wcrypto.verify_record(receipt)
        if not ok:
            return False, f"receipt signature invalid: {why}"
        sig_key = (receipt.get("signature") or {}).get("public_key", "")
        gate_key = receipt.get("gate_public_key", "")
        try:
            if wcrypto.normalize_public_key(
                    sig_key) != wcrypto.normalize_public_key(gate_key):
                return False, "receipt signer != claimed gate key"
        except Exception as exc:
            return False, f"receipt key encoding invalid: {exc}"
        if receipt.get("participant_id") != participant_id:
            return False, "receipt names a different participant"
        if receipt.get("decision") != "RETIRED":
            return False, \
                f"receipt decision != RETIRED: {receipt.get('decision')!r}"
        return True, ("Ed25519 signature valid; signer is the claimed gate "
                      "key; schema, participant, and RETIRED decision match")
