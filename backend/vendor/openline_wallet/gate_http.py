"""Development-only localhost receiver with a serialized effect frontier.

Admission, authority closure, and the actual local ledger effect share one
serialization domain. This does not claim closure for external provider queues.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
from typing import Any, Callable, Mapping

from .canonical import pretty_json
from .effect_closure import EffectClosure, EffectGate
from .errors import WalletError

_MAX_BODY_BYTES = 2 * 1024 * 1024
_RELEASE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
_LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


@dataclass
class ReceiverRuntime:
    gate: EffectGate
    ledger_path: Path
    receipts_dir: Path
    _effects: EffectClosure = field(init=False, repr=False)
    # A test-only seam. It runs outside the frontier lock, so a revocation can
    # actually overtake admitted work. Never expose this as a remote control.
    before_effect: Callable[[str], None] | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if not isinstance(self.gate, EffectGate):
            raise WalletError("EFFECT_GATE_REQUIRED")
        self._effects = EffectClosure(self.gate, Path(self.ledger_path), Path(self.receipts_dir))

    @classmethod
    def create(cls, *, gate_id: str, principal_id: str, root_public_key: str,
               ledger_path: str | Path, receipts_dir: str | Path) -> "ReceiverRuntime":
        gate = EffectGate(gate_id)
        gate.pin_principal(principal_id, root_public_key)
        return cls(gate, Path(ledger_path), Path(receipts_dir))

    def shutdown(self) -> None:
        self._effects.shutdown()

    def admit(self, bundle: Mapping[str, Any]) -> dict[str, Any]:
        result = self.gate.admit_bundle(bundle)
        return {**result, "closure_status": "AUTHORIZATION_ADMITTED_ONLY"}

    def close(self, bundle: Mapping[str, Any], mandate_id: str) -> dict[str, Any]:
        return self._effects.close(bundle, mandate_id)

    def challenge(self, body: Mapping[str, Any]) -> dict[str, Any]:
        token = self.gate.issue_challenge(
            principal_id=str(body.get("principal_id", "")),
            subject_id=str(body.get("subject_id", "")),
            action=str(body.get("action", "")),
        )
        return {"challenge": token, "gate_id": self.gate.gate_id}

    def prepare(self, body: Mapping[str, Any]) -> dict[str, Any]:
        presentation = body.get("presentation")
        return self._effects.prepare(
            presentation if isinstance(presentation, Mapping) else {},
            action=str(body.get("action", "")), release=str(body.get("release", "")),
        )

    def finish(self, ticket: str, *, action: str, release: str) -> dict[str, Any]:
        return self._effects.finish(ticket, action=action, release=release)

    def execute(self, body: Mapping[str, Any]) -> dict[str, Any]:
        prepared = self.prepare(body)
        if prepared["decision"] != "PREPARED":
            return prepared
        ticket = prepared["ticket"]
        if self.before_effect is not None:
            self.before_effect(ticket)
        return self.finish(ticket, action=str(body.get("action", "")),
                           release=str(body.get("release", "")))


class _Handler(BaseHTTPRequestHandler):
    server_version = "OpenLineGate/0.1"

    @property
    def runtime(self) -> ReceiverRuntime:
        return self.server.runtime  # type: ignore[attr-defined]

    def _send(self, status: int, body: Mapping[str, Any]) -> None:
        encoded = pretty_json(dict(body)).encode("ascii")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _body(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length")
        try:
            length = int(raw_length or "0")
        except ValueError as exc:
            raise WalletError("HTTP_CONTENT_LENGTH_INVALID") from exc
        if length <= 0 or length > _MAX_BODY_BYTES:
            raise WalletError("HTTP_BODY_SIZE_INVALID")
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WalletError("HTTP_JSON_INVALID") from exc
        if not isinstance(value, dict):
            raise WalletError("HTTP_JSON_OBJECT_REQUIRED")
        return value

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path == "/health":
            self._send(200, {"status": "ok", "gate_id": self.runtime.gate.gate_id})
            return
        self._send(404, {"error": "NOT_FOUND"})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        try:
            body = self._body()
            if self.path == "/admit":
                bundle = body.get("bundle")
                if not isinstance(bundle, Mapping):
                    raise WalletError("BUNDLE_REQUIRED")
                result = self.runtime.admit(bundle)
            elif self.path == "/close":
                bundle = body.get("bundle")
                if not isinstance(bundle, Mapping):
                    raise WalletError("BUNDLE_REQUIRED")
                result = self.runtime.close(bundle, str(body.get("mandate_id", "")))
            elif self.path == "/challenge":
                result = self.runtime.challenge(body)
            elif self.path == "/execute":
                result = self.runtime.execute(body)
            else:
                self._send(404, {"error": "NOT_FOUND"})
                return
            self._send(200, result)
        except WalletError as exc:
            self._send(409, {"error": exc.code, "detail": str(exc)})
        except Exception as exc:  # development receiver: fail closed and expose only class
            self._send(500, {"error": "RECEIVER_INTERNAL_ERROR", "detail": type(exc).__name__})

    def log_message(self, fmt: str, *args: object) -> None:
        return


class GateHTTPServer(ThreadingHTTPServer):
    runtime: ReceiverRuntime

    def server_close(self) -> None:
        try:
            super().server_close()
        finally:
            self.runtime.shutdown()


def build_http_server(*, runtime: ReceiverRuntime, host: str = "127.0.0.1",
                      port: int = 8765) -> GateHTTPServer:
    if host not in _LOOPBACK_HOSTS:
        raise WalletError("DEMO_GATE_MUST_BE_LOOPBACK", host)
    server = GateHTTPServer((host, port), _Handler)
    server.runtime = runtime
    return server


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="openline-wallet-gate",
        description="Development receiver Gate for PLATFORM-EXIT-LIVE-001.",
    )
    parser.add_argument("--principal-id", required=True)
    parser.add_argument("--root-public-key", required=True)
    parser.add_argument("--ledger", required=True)
    parser.add_argument("--receipts", required=True)
    parser.add_argument("--gate-id", default="platform-exit-live-receiver")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    runtime = ReceiverRuntime.create(
        gate_id=args.gate_id, principal_id=args.principal_id,
        root_public_key=args.root_public_key, ledger_path=args.ledger,
        receipts_dir=args.receipts,
    )
    server = build_http_server(runtime=runtime, host=args.host, port=args.port)
    address, port = server.server_address[:2]
    print(f"Receiver Gate  http://{address}:{port}")
    print("Effect         receiver-owned staging ledger")
    print("Boundary       development-only; Gate state is in memory")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
