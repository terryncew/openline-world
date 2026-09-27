"""Transport abstraction for the shared OpenLine world.

What a Transport IS: an adapter between a participant's world client and the
world backend. It carries versioned message envelopes -- join, presence,
offer, accept, transaction notices -- and nothing else. Identity, receiver
policy, signed records, wallets, and transaction state are INDEPENDENT of
transport; they live in world.py / workshop_gate.py and stay there. A
transport never evaluates a gate, never mints a receipt, never holds a key.

The adapter contract (mirrors docs/transports.md; the doc is the spec,
this module is the interface):

1. status() -> exactly one of "connected" | "pending" | "disconnected".
   - "disconnected": no path to the world; the client must not present
     actions as sent.
   - "pending": discovery, pairing, handshake, or reconnection in progress.
     The client may queue; it must not claim delivery.
   - "connected": the world has acknowledged this participant's join profile
     and standing. Only in this state may the client submit proposals and
     expect receipts.
   The scene/API must never imply a live peer when there isn't one: while a
   peer has not completed join the honest status is "pending"; if the
   transport reports "disconnected", the API must report "disconnected".

2. Versioned envelopes: every frame is {"envelope_version", "kind",
   "payload"}. A transport REJECTS envelopes whose version it does not
   understand rather than guessing at the bytes. Version negotiation happens
   at connect; there is no silent downgrade.

3. close(): deterministic teardown -- flush pending outbound, notify the
   client of final status, release the underlying resource, and leave the
   adapter in "disconnected". No half-open state is legal after close().

What the contract does NOT promise: authentication, key custody, or delivery
guarantees beyond the underlying medium. Those belong to the layers above
(world.py bearer-token checks, same-operator custody notice) and below.

Shipped adapter:
- LocalTransport: in-process delivery for local development. status() is
  always "connected" until close(), after which it is "disconnected".
  Both participants share one process (same-operator custody), so there is
  no remote peer and no live network -- the status detail says exactly that.

Extension point (NOT implemented): an internet or nearby/offline transport
plugs in by subclassing Transport and implementing status(),
send_envelope(), and close() against the contract above, then passing the
instance to World(transport=...). docs/transports.md documents why no
nearby/offline adapter exists yet (no Bluetooth hardware, no wireless
interfaces on the dev VM; the one paired iPhone needs a native app that
does not exist) and records it as UNTESTED.
"""
from __future__ import annotations

import abc
from typing import Any, Callable

ENVELOPE_VERSION = "openline-envelope/v1"
ENVELOPE_VERSIONS_SUPPORTED = frozenset({ENVELOPE_VERSION})

VALID_STATUSES = frozenset({"connected", "pending", "disconnected"})


class TransportError(Exception):
    """The transport could not deliver or is unusable -> caller-visible."""


def validate_envelope(envelope: Any) -> dict[str, Any]:
    """Check envelope shape and version. Unknown versions are rejected,
    never downgraded."""
    if not isinstance(envelope, dict):
        raise TransportError("ENVELOPE_NOT_AN_OBJECT")
    version = envelope.get("envelope_version")
    if version not in ENVELOPE_VERSIONS_SUPPORTED:
        raise TransportError(
            f"ENVELOPE_VERSION_UNSUPPORTED: {version!r}")
    kind = envelope.get("kind")
    if not isinstance(kind, str) or not kind:
        raise TransportError("ENVELOPE_KIND_INVALID")
    payload = envelope.get("payload")
    if not isinstance(payload, dict):
        raise TransportError("ENVELOPE_PAYLOAD_INVALID")
    return envelope


class Transport(abc.ABC):
    """Abstract message-carrying adapter. See module docstring for contract."""

    name: str = "transport"

    @abc.abstractmethod
    def status(self) -> str:
        """One of "connected" | "pending" | "disconnected". No other values."""

    @abc.abstractmethod
    def send_envelope(self, envelope: dict) -> dict:
        """Deliver one versioned envelope. Returns an acknowledgement dict.
        Raises TransportError if the envelope is malformed, its version is
        unsupported, or the transport cannot deliver."""

    @abc.abstractmethod
    def close(self) -> None:
        """Deterministic teardown. After close(), status() is "disconnected"
        and send_envelope() raises."""

    def detail(self) -> str:
        """Human-readable status detail for the API. May be overridden."""
        return "No additional detail."


class LocalTransport(Transport):
    """In-process development transport. Delivers envelopes synchronously to
    in-process subscribers; there is no socket, no radio, no remote peer."""

    name = "local"

    def __init__(self) -> None:
        self._subscribers: list[Callable[[dict[str, Any]], None]] = []
        self._closed = False

    def status(self) -> str:
        return "disconnected" if self._closed else "connected"

    def detail(self) -> str:
        if self._closed:
            return "Local transport closed."
        return ("In-process local delivery (same-operator custody): "
                "no remote peer, no live network.")

    def subscribe(self, fn: Callable[[dict[str, Any]], None]) -> None:
        self._subscribers.append(fn)

    def unsubscribe(self, fn: Callable[[dict[str, Any]], None]) -> None:
        try:
            self._subscribers.remove(fn)
        except ValueError:
            pass

    def send_envelope(self, envelope: dict) -> dict:
        if self._closed:
            raise TransportError("TRANSPORT_CLOSED")
        validate_envelope(envelope)
        # In-process bus: notify subscribers synchronously. Subscriber errors
        # are contained so one bad listener cannot break delivery to others.
        for fn in list(self._subscribers):
            try:
                fn(envelope)
            except Exception:
                pass
        return {"ack": True, "envelope_version": ENVELOPE_VERSION,
                "kind": envelope["kind"]}

    def close(self) -> None:
        # Deterministic teardown: notify subscribers of final status, drop
        # the subscriber list, and land in "disconnected". Idempotent.
        final = {"envelope_version": ENVELOPE_VERSION, "kind": "transport-closed",
                 "payload": {"status": "disconnected"}}
        for fn in list(self._subscribers):
            try:
                fn(final)
            except Exception:
                pass
        self._subscribers = []
        self._closed = True
