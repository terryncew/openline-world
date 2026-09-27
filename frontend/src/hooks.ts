import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Snapshot, type WEvent } from "./api";

export interface WorkshopState {
  snap: Snapshot | null;
  events: WEvent[];
  error: string | null;
  refresh: () => void;
  advance: () => Promise<void>;
  reset: () => Promise<void>;
  setMode: (m: "demo" | "connected") => Promise<void>;
  propose: (helper: string, action: string) => Promise<void>;
  revoke: (helper: string) => Promise<void>;
  onboard: (helper: string, scopes: string[]) => Promise<void>;
}

export function useWorkshop(): WorkshopState {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<WEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const seenRef = useRef(new Set<string>());

  const refresh = useCallback(() => {
    api.state().then(setSnap).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource(api.streamUrl);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as WEvent;
        if (seenRef.current.has(ev.event_id)) return;
        seenRef.current.add(ev.event_id);
        seqRef.current = Math.max(seqRef.current, ev.seq);
        setEvents((prev) => [...prev.slice(-199), ev]);
        if (ev.kind === "decision" || ev.kind === "mandate" || ev.kind === "receipt") refresh();
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => setError("Event stream disconnected — retrying…");
    return () => es.close();
  }, [refresh]);

  const wrap = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        refresh();
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh]
  );

  return {
    snap,
    events,
    error,
    refresh,
    advance: () => wrap(api.advanceDemo),
    reset: () => wrap(api.resetDemo).then(() => {
      setEvents([]);
      seenRef.current.clear();
      seqRef.current = 0;
    }),
    setMode: (m) => wrap(() => api.setMode(m)),
    propose: (helper, action) => wrap(() => api.propose(helper, action)),
    revoke: (helper) => wrap(() => api.revoke(helper)),
    onboard: (helper, scopes) => wrap(() => api.onboard(helper, scopes)),
  };
}

export function provenanceLabel(p: WEvent["provenance"]): string {
  return {
    "agent-reported": "agent says",
    "receiver-signed": "receiver decided",
    "owner-signed": "owner action",
    "adapter-mapped": "hook activity",
  }[p];
}

export function provenanceClass(p: WEvent["provenance"]): string {
  return {
    "agent-reported": "prov-agent",
    "receiver-signed": "prov-receiver",
    "owner-signed": "prov-owner",
    "adapter-mapped": "prov-adapter",
  }[p];
}
