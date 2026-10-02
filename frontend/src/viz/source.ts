/**
 * OpenLine World visualization — read-only event source.
 * frontend/src/viz/source.ts
 *
 * READ-ONLY INVARIANT: this module (and everything it imports) performs
 * only GET requests against the backend. It never POSTs, never calls
 * /api/demo/advance, /api/demo/reset, /api/owner/*, /api/mode, or any
 * other mutating endpoint. A static test enforces this.
 *
 * The backend's /api/events is an SSE stream: on connect it replays the
 * persisted backlog first (honoring ?since=<seq>), then streams live.
 * fetchHistory collects the replay and closes; subscribeLive keeps the
 * same connection open for the live tail.
 */

import type { WEvent, Snapshot, ReceiptInfo } from "../api";

const EVENTS_URL = "/api/events";

function parseEvent(data: string): WEvent | null {
  try {
    const ev = JSON.parse(data) as WEvent;
    if (typeof ev.event_id !== "string" || typeof ev.seq !== "number") return null;
    return ev;
  } catch {
    return null;
  }
}

/**
 * Collect the persisted backlog from seq `since` onward, then close.
 * There is no end-of-backlog marker on the wire, so the connection is
 * considered "caught up" after `quiesceMs` with no new messages (once at
 * least one message — or an error-free settle — has been observed).
 */
export function fetchHistory(since = 0, quiesceMs = 1200): Promise<WEvent[]> {
  return new Promise((resolve, reject) => {
    const out: WEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const es = new EventSource(`${EVENTS_URL}?since=${since}`);
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      es.close();
      if (err) reject(err);
      else resolve(out);
    };
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => done(), quiesceMs);
    };
    es.onmessage = (msg) => {
      const ev = parseEvent(msg.data);
      if (ev) out.push(ev);
      arm();
    };
    es.onerror = () => {
      // If we already have the backlog, a stream error is just the tail
      // ending; if we have nothing, the backend is unreachable.
      if (out.length > 0) done();
      else done(new Error("event stream unreachable"));
    };
    arm();
  });
}

/** Open a live subscription from seq `since` onward. The persisted backlog
 *  replays first, then live events stream. Returns an unsubscribe fn. */
export function subscribeLive(since: number, cb: (ev: WEvent) => void): () => void {
  const es = new EventSource(`${EVENTS_URL}?since=${since}`);
  es.onmessage = (msg) => {
    const ev = parseEvent(msg.data);
    if (ev) cb(ev);
  };
  return () => es.close();
}

/** Read-only snapshot: helpers, gate, demo step. Never mutates. */
export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`snapshot failed: HTTP ${res.status}`);
  return (await res.json()) as Snapshot;
}

/** Read-only full receipt history. Never mutates. */
export async function fetchReceipts(): Promise<ReceiptInfo[]> {
  const res = await fetch("/api/receipts");
  if (!res.ok) throw new Error(`receipts failed: HTTP ${res.status}`);
  const data = (await res.json()) as { receipts?: ReceiptInfo[] };
  return Array.isArray(data.receipts) ? data.receipts : [];
}
