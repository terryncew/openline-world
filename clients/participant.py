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

_REPO_ROOT = Path(__file__).resolve().parent.parent
for _p in (str(_REPO_ROOT / "backend" / "vendor"), str(_REPO_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

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


def _load_task_kinds() -> dict[str, str]:
    """Kind -> gated action mapping, read from backend/world.py, never guessed.

    Prefer importing it live; fall back to parsing the source file so the
    mapping always tracks the world's own allowlist.
    """
    try:
        from backend.world import TASK_KINDS  # type: ignore

        return dict(TASK_KINDS)
    except Exception:
        pass
    src = (_REPO_ROOT / "backend" / "world.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "TASK_KINDS" for t in node.targets
        ):
            return dict(ast.literal_eval(node.value))
    raise ClientError("TASK_KINDS_UNAVAILABLE", "no TASK_KINDS in backend/world.py")


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
            return json.loads(raw) if raw.strip() else None
        except ValueError as exc:
            raise ClientError("CLIENT_BAD_RESPONSE", f"non-JSON from {path}") from exc

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
