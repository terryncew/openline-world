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

/**
 * Static preview mode (?static=1): serve a recorded REAL demo run from
 * bundled JSON instead of the live backend. Every event in the recording
 * was captured from an actual backend run — the reducer, paced reveal,
 * and choreography downstream are byte-identical. Still GET-only.
 * This exists so the visualization can be previewed where no backend
 * can run (e.g. a phone). It is not a simulation: it is a recording.
 */
export function isStaticDemo(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("static") === "1"
  );
}

/** URL for a bundled static-preview asset (recorded demo data). */
export function staticUrl(name: string): string {
  return `${staticBase()}demo-static/${name}`;
}

function staticBase(): string {
  try {
    const b = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL;
    return b || "/";
  } catch {
    return "/";
  }
}

async function fetchStaticJson<T>(name: string): Promise<T> {
  const res = await fetch(staticUrl(name));
  if (!res.ok) throw new Error(`static ${name} missing: HTTP ${res.status}`);
  return (await res.json()) as T;
}

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
 *  replays first, then live events stream. Returns an unsubscribe fn.
 *  In static mode the recorded event log streams from bundled JSON with
 *  the same callback contract. */
export function subscribeLive(since: number, cb: (ev: WEvent) => void): () => void {
  if (isStaticDemo()) {
    let cancelled = false;
    fetchStaticJson<WEvent[]>("events.json")
      .then((events) => {
        events
          .filter((ev) => typeof ev.seq === "number" && ev.seq >= since)
          .forEach((ev, i) => {
            // stagger delivery; the paced reveal (pacing.ts) owns the beats
            setTimeout(() => {
              if (!cancelled && typeof ev.event_id === "string") cb(ev);
            }, i * 150);
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }
  const es = new EventSource(`${EVENTS_URL}?since=${since}`);
  es.onmessage = (msg) => {
    const ev = parseEvent(msg.data);
    if (ev) cb(ev);
  };
  return () => es.close();
}

/** Read-only snapshot: helpers, gate, demo step. Never mutates. */
export async function fetchSnapshot(): Promise<Snapshot> {
  if (isStaticDemo()) return fetchStaticJson<Snapshot>("state.json");
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`snapshot failed: HTTP ${res.status}`);
  return (await res.json()) as Snapshot;
}

/** Read-only full receipt history. Never mutates. */
export async function fetchReceipts(): Promise<ReceiptInfo[]> {
  if (isStaticDemo()) {
    const data = await fetchStaticJson<{ receipts?: ReceiptInfo[] }>("receipts.json");
    return Array.isArray(data.receipts) ? data.receipts : [];
  }
  const res = await fetch("/api/receipts");
  if (!res.ok) throw new Error(`receipts failed: HTTP ${res.status}`);
  const data = (await res.json()) as { receipts?: ReceiptInfo[] };
  return Array.isArray(data.receipts) ? data.receipts : [];
}
