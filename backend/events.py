"""Normalized workshop event stream.

One stream, three provenances kept visibly apart:

- agent-reported  : what a helper *says* it did. Never a receipt.
- receiver-signed : what the gate *decided*. The only source of receipts.
- owner-signed    : mandate grants and revocations from the workshop owner.
- adapter-mapped  : external hook events, mapped to activity only.

An agent saying "done" emits an activity event. It cannot create a receipt.
"""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


@dataclass
class EventLog:
    max_events: int = 2000
    _events: list[dict[str, Any]] = field(default_factory=list, init=False)
    _by_id: dict[str, dict[str, Any]] = field(default_factory=dict, init=False)
    _seq: int = field(default=0, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)
    _listeners: list[Callable[[dict[str, Any]], None]] = field(default_factory=list, init=False)

    def emit(
        self,
        *,
        source: str,
        kind: str,
        provenance: str,
        summary: str,
        task_id: str = "",
        event_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Append an event; duplicates by event_id are dropped (idempotent)."""
        with self._lock:
            eid = event_id or uuid.uuid4().hex
            if eid in self._by_id:
                return self._by_id[eid]
            self._seq += 1
            event = {
                "event_id": eid,
                "seq": self._seq,
                "task_id": task_id,
                "ts": _now_iso(),
                "source": source,
                "kind": kind,
                "provenance": provenance,
                "summary": summary,
                "detail": detail or {},
            }
            self._events.append(event)
            self._by_id[eid] = event
            if len(self._events) > self.max_events:
                dropped = self._events.pop(0)
                self._by_id.pop(dropped["event_id"], None)
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener(event)
            except Exception:
                pass
        return event

    def replay(self, since_seq: int = 0, limit: int = 500) -> list[dict[str, Any]]:
        with self._lock:
            out = [e for e in self._events if e["seq"] > since_seq][:limit]
            return [dict(e) for e in out]

    def latest_seq(self) -> int:
        with self._lock:
            return self._seq

    def subscribe(self, listener: Callable[[dict[str, Any]], None]) -> None:
        with self._lock:
            self._listeners.append(listener)

    def unsubscribe(self, listener: Callable[[dict[str, Any]], None]) -> None:
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)
