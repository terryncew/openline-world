/**
 * OpenLine World — WORLD-AUTHORITY-001 focused demonstration view.
 * frontend/src/viz/AuthorityDemoView.tsx
 *
 * One ~30-second authoritative spatial demonstration: a worker is
 * authorized, works, is revoked and refused; a replacement arrives
 * without authority, is explicitly granted it, and continues the SAME
 * job with its history intact.
 *
 * Same pipeline as the full viz view — read-only event stream (source.ts)
 * -> pure reducer -> paced reveal -> R3F scene — but a fixed, minimal
 * composition: no timeline scrubber, no inspector, no camera controls.
 * The renderer never mutates backend state; the director (run on mount)
 * is the only thing that POSTs, exactly like the existing demo button.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { VizSceneState, WEvent } from "./protocol";
import { reduceEvents } from "./reducer";
import { subscribeLive } from "./source";
import { runAuthorityDemoScript } from "./director";
import { revealDelay, isReplacementOnboard } from "./pacing";
import { VizCanvas, VIZ_SMALL_SCREEN } from "./scene/VizCanvas";
import { OwnerObelisk } from "./scene/OwnerObelisk";
import { WorkerSwarm } from "./scene/WorkerSwarm";
import { AuthoritySeals } from "./scene/AuthoritySeals";
import { ReceiverGate } from "./scene/ReceiverGate";
import { ProposalPackets } from "./scene/ProposalPackets";
import { JobCrate, SideTable } from "./scene/JobCrate";
import { CameraRig, type VizCloseup } from "./scene/CameraRig";
import "./viz.css";

/** Minimal beat captions: the scene works through action, not prose. */
function beatCaption(events: WEvent[], cursorSeq: number): string {
  const vis = events.filter((e) => e.seq <= cursorSeq);
  const last = vis[vis.length - 1];
  if (!last) return "WORLD-AUTHORITY-001 — the worker can change; the job must not reset.";
  const d = (last as { detail?: Record<string, unknown> }).detail ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (last.kind) {
    case "note":
      return s(d.job_id)
        ? "A job exists. It belongs to no worker."
        : "The worker changed. The job did not reset. The records stayed.";
    case "mandate":
      if (d.status === "REVOKED")
        return "The owner revoked Wren. The seal dies — the records stay.";
      return s(d.mandate_id).includes("juniper")
        ? "The owner authorizes Juniper — explicitly, not by inheritance."
        : "The owner authorizes Wren. Only then does Wren begin.";
    case "proposal":
      return s(d.action) === "notes.rewrite"
        ? "A newer proposal exists. It was never admitted — it stays on the side table."
        : `${s(d.helper) === "juniper" ? "Juniper" : "Wren"} proposes ${s(d.action)}. A claim — nothing decided yet.`;
    case "decision":
      return d.decision === "ALLOWED"
        ? "The receiver allowed it. The receipt belongs to the job."
        : "The receiver stopped it. Revoked authority cannot act.";
    case "receipt":
      return "Receipt stamped onto the job's ticket. It survives the worker.";
    case "activity":
      return /arrives/i.test(last.summary)
        ? "Juniper arrives — with no authority."
        : "Juniper reaches for the job. Nothing happens.";
    default:
      return last.summary || "…";
  }
}

export function AuthorityDemoView({ onExit }: { onExit: () => void }) {
  const [liveEvents, setLiveEvents] = useState<WEvent[]>([]);
  const [revealed, setRevealed] = useState<WEvent[]>([]);
  const liveRef = useRef<WEvent[]>([]);
  liveRef.current = liveEvents;
  const scheduledIdx = useRef(-1);
  const [replayState, setReplayState] = useState<"live" | "done">("live");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [demoDone, setDemoDone] = useState(false);
  const stopRef = useRef(false);
  const seenRef = useRef(new Set<string>());

  // read-only subscription, resubscribed after the authority reset
  useEffect(() => {
    seenRef.current.clear();
    setLiveEvents([]);
    setRevealed([]);
    scheduledIdx.current = -1;
    setReplayState("live");
    const unsub = subscribeLive(0, (ev) => {
      if (seenRef.current.has(ev.event_id)) return;
      seenRef.current.add(ev.event_id);
      setLiveEvents((prev) => [...prev, ev]);
      setStreamError(null);
    });
    return () => unsub();
  }, [streamEpoch]);

  // paced reveal: same stage-direction policy as the full viz
  useEffect(() => {
    if (replayState !== "live") return;
    if (revealed.length >= liveRef.current.length) return;
    if (scheduledIdx.current === revealed.length) return;
    scheduledIdx.current = revealed.length;
    const last = revealed.length ? revealed[revealed.length - 1] : null;
    const delay = revealDelay(last, revealed);
    const t = setTimeout(() => {
      scheduledIdx.current = -1;
      setRevealed((r) => {
        const src = liveRef.current;
        return r.length < src.length ? [...r, src[r.length]] : r;
      });
    }, delay);
    return () => {
      clearTimeout(t);
      scheduledIdx.current = -1;
    };
  }, [replayState, liveEvents, revealed]);

  // auto-run the authority demo on mount (the director owns all POSTs).
  // StrictMode-safe: the generation counter ensures only the latest mount's
  // director survives; a stale first run cannot advance after the second
  // mount resets stopRef.
  const autoGen = useRef(0);
  useEffect(() => {
    const gen = ++autoGen.current;
    stopRef.current = false;
    setDemoDone(false);
    runAuthorityDemoScript({
      shouldStop: () => stopRef.current || autoGen.current !== gen,
      onReset: () => setStreamEpoch((e) => e + 1),
    })
      .catch(() => {
        /* demo errors surface in the main app; the viz stays read-only */
      })
      .finally(() => {
        if (autoGen.current === gen && !stopRef.current) setDemoDone(true);
      });
    return () => {
      stopRef.current = true;
    };
    // run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxSeq = revealed.length ? revealed[revealed.length - 1].seq : 0;
  const scene: VizSceneState = useMemo(() => reduceEvents(revealed), [revealed]);

  // debug hook for capture scripts: logical state only, no DOM internals
  useEffect(() => {
    (window as unknown as { __authorityDebug?: unknown }).__authorityDebug = {
      seq: maxSeq,
      eventCount: scene.eventCount,
      demoDone,
      job: scene.job ? { id: scene.job.jobId, title: scene.job.title } : null,
      workers: scene.workers.map((w) => ({
        id: w.workerId, active: w.active, admitted: w.admitted,
      })),
      receipts: scene.receipts.map((r) => ({
        action: r.action, decision: r.decision, helper: r.helper,
      })),
      unadmitted: scene.proposals
        .filter((p) => p.unadmitted)
        .map((p) => ({ worker: p.workerId, action: p.action })),
    };
  });

  // beat-driven close-ups: the refusal and the replacement must be legible
  const closeup: VizCloseup = useMemo(() => {
    const last = revealed[revealed.length - 1] as
      | (WEvent & { detail?: Record<string, unknown> })
      | undefined;
    if (!last) return null;
    if (last.kind === "mandate") {
      const st = last.detail?.status;
      if (st !== "REVOKED" && isReplacementOnboard(last, revealed))
        return "replacement";
      return null;
    }
    if (last.kind === "proposal" || last.kind === "decision") return "gate";
    return null;
  }, [revealed]);

  return (
    <div className="viz-root">
      <header className="viz-topbar">
        <div className="viz-brand">
          <strong>WORLD-AUTHORITY-001</strong>
          <span className="viz-fine">read-only: every object traces to a real event</span>
        </div>
        <div className="viz-controls">
          <button className="viz-btn" onClick={onExit}>Exit</button>
        </div>
      </header>
      {streamError && <div className="viz-err">{streamError}</div>}
      <main className="viz-stage">
        <VizCanvas>
          <CameraRig
            view="world"
            workers={scene.workers}
            followWorkerId={null}
            closeup={closeup}
            portrait={VIZ_SMALL_SCREEN}
          />
          <OwnerObelisk />
          <JobCrate job={scene.job} receipts={scene.receipts} />
          <SideTable proposals={scene.proposals} />
          <WorkerSwarm workers={scene.workers} selectedId={null} onSelect={() => {}} />
          <AuthoritySeals
            authorities={scene.authorities}
            workers={scene.workers}
            selectedMandate={null}
            onSelect={() => {}}
          />
          <ReceiverGate proposals={scene.proposals} onSelectGate={() => {}} />
          <ProposalPackets
            proposals={scene.proposals.filter((p) => !p.unadmitted)}
            workers={scene.workers}
            onSelect={() => {}}
          />
        </VizCanvas>
      </main>
      <footer className="viz-caption">
        {beatCaption(revealed, maxSeq)}
        {demoDone && <span className="viz-fine"> — complete</span>}
      </footer>
    </div>
  );
}
