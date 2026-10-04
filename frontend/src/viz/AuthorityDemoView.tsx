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
import type { VizCheckpoint, VizSceneState, WEvent } from "./protocol";
import { reduceEvents } from "./reducer";
import { fetchSnapshot, subscribeLive } from "./source";
import { launchAuthorityDemo } from "./director";
import { revealDelay, isReplacementOnboard } from "./pacing";
import { VizCanvas, VIZ_SMALL_SCREEN } from "./scene/VizCanvas";
import { OwnerObelisk } from "./scene/OwnerObelisk";
import { WorkerSwarm } from "./scene/WorkerSwarm";
import { AuthoritySeals } from "./scene/AuthoritySeals";
import { ReceiverGate } from "./scene/ReceiverGate";
import { ProposalPackets } from "./scene/ProposalPackets";
import { JobCrate, SideTable } from "./scene/JobCrate";
import { CameraRig, type VizCloseup } from "./scene/CameraRig";
import { authorityWorkerHome } from "./scene/layout";
import type { Snapshot } from "../api";
import "./viz.css";

/** The end card: outside the timed comprehension sequence. The animation
 *  before this line must carry the meaning itself (defect 7). */
const END_CARD = "The worker changed. The job did not reset. The records stayed.";

export function AuthorityDemoView({ onExit }: { onExit: () => void }) {
  const [liveEvents, setLiveEvents] = useState<WEvent[]>([]);
  const [revealed, setRevealed] = useState<WEvent[]>([]);
  const liveRef = useRef<WEvent[]>([]);
  liveRef.current = liveEvents;
  const scheduledIdx = useRef(-1);
  const [replayState, setReplayState] = useState<"live" | "done">("live");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
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
  // Defect 6 repair: the launch is deferred by one event-loop turn so a
  // StrictMode throwaway effect cleans up before any reset POST is issued;
  // cleanup cancels the pending launch. The generation counter still
  // guards later advances.
  const autoGen = useRef(0);
  useEffect(() => {
    const gen = ++autoGen.current;
    stopRef.current = false;
    const cancel = launchAuthorityDemo({
      shouldStop: () => stopRef.current || autoGen.current !== gen,
      onReset: () => {
        setStreamEpoch((e) => e + 1);
        fetchSnapshot().then(setSnap).catch(() => {});
      },
    });
    return () => {
      stopRef.current = true;
      cancel();
    };
    // run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxSeq = revealed.length ? revealed[revealed.length - 1].seq : 0;
  const scene: VizSceneState = useMemo(() => reduceEvents(revealed), [revealed]);

  // Job checkpoints come from the read-only snapshot (the gate never
  // writes them). Re-fetch when the revealed receipt count changes, then
  // filter to the revealed seq so the paced view never shows future work.
  const receiptCount = scene.receipts.length;
  useEffect(() => {
    fetchSnapshot().then(setSnap).catch(() => {});
  }, [receiptCount]);
  const visibleCheckpoints: VizCheckpoint[] = useMemo(() => {
    const all = snap?.job_state?.checkpoints ?? [];
    return all
      .filter((c) => c.seq <= maxSeq)
      .map((c) => ({ seq: c.seq, helper: c.helper, action: c.action, checkpoint: c.checkpoint }));
  }, [snap, maxSeq]);

  // Beat 7 visibly complete: Juniper authorized in the revealed view AND
  // checkpoint 2 applied to the same job with prior history visible.
  const juniperAuthorized = scene.authorities.some(
    (a) => a.workerId === "juniper" && a.active
  );
  const storyComplete =
    juniperAuthorized &&
    visibleCheckpoints.length >= 2 &&
    scene.receipts.length >= 3;

  // Failed-reach trigger (defect 3): the reach plays only while the real
  // pre-grant attempt event is the last revealed one.
  const lastRevealed = revealed[revealed.length - 1] as
    | (WEvent & { detail?: Record<string, unknown>; summary?: string })
    | undefined;
  const reachingWorkerId =
    lastRevealed?.kind === "activity" &&
    (lastRevealed.detail?.helper === "juniper") &&
    /reaches for the job/i.test(lastRevealed.summary ?? "")
      ? "juniper"
      : null;

  // debug hook for capture scripts: logical state only, no DOM internals.
  // T0 = first visible Beat 1 job state; T1 = Beat 7 visibly complete.
  useEffect(() => {
    (window as unknown as { __authorityDebug?: unknown }).__authorityDebug = {
      seq: maxSeq,
      eventCount: scene.eventCount,
      jobVisible: scene.job != null,
      storyComplete,
      job: scene.job ? { id: scene.job.jobId, title: scene.job.title } : null,
      workers: scene.workers.map((w) => ({
        id: w.workerId, active: w.active, admitted: w.admitted,
      })),
      receipts: scene.receipts.map((r) => ({
        action: r.action, decision: r.decision, helper: r.helper,
      })),
      checkpoints: visibleCheckpoints,
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
          <JobCrate job={scene.job} receipts={scene.receipts} checkpoints={visibleCheckpoints} />
          <SideTable proposals={scene.proposals} />
          <WorkerSwarm
            workers={scene.workers}
            selectedId={null}
            onSelect={() => {}}
            homeFn={authorityWorkerHome}
            reachingWorkerId={reachingWorkerId}
          />
          <AuthoritySeals
            authorities={scene.authorities}
            workers={scene.workers}
            selectedMandate={null}
            onSelect={() => {}}
            homeFn={authorityWorkerHome}
          />
          <ReceiverGate proposals={scene.proposals} onSelectGate={() => {}} />
          <ProposalPackets
            proposals={scene.proposals.filter((p) => !p.unadmitted)}
            workers={scene.workers}
            onSelect={() => {}}
            homeFn={authorityWorkerHome}
          />
        </VizCanvas>
      </main>
      {/* Defect 7: no running beat captions. The end card appears only
          after Beat 7 is visibly complete — outside the timed sequence. */}
      {storyComplete && (
        <footer className="viz-caption viz-endcard">{END_CARD}</footer>
      )}
    </div>
  );
}
