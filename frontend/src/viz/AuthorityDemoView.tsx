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
import {
  shouldCommitSnapshot,
  visibleCheckpoints as filterVisibleCheckpoints,
  type SnapshotCommitState,
} from "./snapshotGuard.ts";
import { revealDelay } from "./pacing";
import { VizCanvas, VIZ_SMALL_SCREEN } from "./scene/VizCanvas";
import { OwnerObelisk, OBELISK_POS } from "./scene/OwnerObelisk";
import { Nameplate } from "./scene/Nameplate";
import { WorkerSwarm } from "./scene/WorkerSwarm";
import { AuthoritySeals } from "./scene/AuthoritySeals";
import { ReceiverGate } from "./scene/ReceiverGate";
import { ProposalPackets } from "./scene/ProposalPackets";
import { JobCrate, SideTable } from "./scene/JobCrate";
import { CameraRig, type VizCloseup } from "./scene/CameraRig";
import { closeupFor } from "./closeup.ts";
import { proposalVisibility } from "./proposalVisibility.ts";
import {
  nextReachState,
  REACH_IDLE,
  type ReachLifecycleState,
} from "./reachLifecycle.ts";
import { useFrame } from "@react-three/fiber";

/**
 * CP3 §5: captures performance.now() on actual rendered R3F frames.
 * T0: first frame where the Beat 1 persistent job is visibly present.
 * T1: first frame where final visual readiness holds.
 */
function FrameTimer({
  jobVisible,
  complete,
  onT0,
  onT1,
}: {
  jobVisible: boolean;
  complete: boolean;
  onT0: () => void;
  onT1: () => void;
}) {
  const t0Done = useRef(false);
  const t1Done = useRef(false);
  useFrame(() => {
    if (jobVisible && !t0Done.current) {
      t0Done.current = true;
      onT0();
    }
    if (complete && !t1Done.current) {
      t1Done.current = true;
      onT1();
    }
  });
  return null;
}
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
  // the currently rendered job id, for the snapshot task_id match check
  const sceneJobIdRef = useRef<string | null>(null);
  // Snapshot commit guard (defect 3, pass 2): generation increments on
  // every reset/epoch change; a response commits only if its generation,
  // session, and checkpoint monotonicity all hold.
  const snapGuard = useRef<SnapshotCommitState>({
    generation: 0, session: null, checkpointCount: 0,
  });
  const guardedFetchSnapshot = () => {
    const gen = snapGuard.current.generation;
    fetchSnapshot()
      .then((s) => {
        const cps = s.job_state?.checkpoints ?? [];
        const ok = shouldCommitSnapshot(
          snapGuard.current,
          {
            generation: gen,
            session: s.session,
            checkpointCount: cps.length,
            taskId: s.job_state?.task_id ?? s.task.task_id,
          },
          sceneJobIdRef.current
        );
        if (!ok) return;
        snapGuard.current.session = s.session;
        snapGuard.current.checkpointCount = cps.length;
        setSnap(s);
      })
      .catch(() => {});
  };
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
        // Defect 3: on epoch change, clear snapshot state immediately and
        // increment the generation so delayed pre-reset responses cannot
        // commit.
        setSnap(null);
        snapGuard.current = { generation: snapGuard.current.generation + 1, session: null, checkpointCount: 0 };
        setStreamEpoch((e) => e + 1);
        guardedFetchSnapshot();
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
    sceneJobIdRef.current = scene.job?.jobId ?? null;
  }, [scene.job?.jobId]);
  useEffect(() => {
    guardedFetchSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptCount]);
  const visibleCheckpoints: VizCheckpoint[] = useMemo(() => {
    const all = (snap?.job_state?.checkpoints ?? []).map((c) => ({
      seq: c.seq, helper: c.helper, action: c.action, checkpoint: c.checkpoint,
    }));
    return filterVisibleCheckpoints(all, maxSeq);
  }, [snap, maxSeq]);

  // Beat 7 VISUAL completion (defect 7): not logical state arrival, but
  // the visible scene having settled. All must hold:
  // - Juniper authority visibly active
  // - checkpoint 2 visibly present (and checkpoint 1 remains visible)
  // - all three receipt marks visibly present
  // - persistent crate/ticket visible
  // - no required final animation still in progress (1.2s settle)
  const juniperAuthorized = scene.authorities.some(
    (a) => a.workerId === "juniper" && a.active
  );
  const storyComplete =
    juniperAuthorized &&
    visibleCheckpoints.length >= 2 &&
    scene.receipts.length >= 3 &&
    scene.job != null;
  // CP3 §4: scene-owned settle — the final visual completion may not rely
  // on a guessed parent timer. Each signal re-arms only when its own visual
  // inputs change (crate: job/receipts/checkpoints; seals: authorities;
  // camera: closeup/view goal).
  const [crateSettled, setCrateSettled] = useState(false);
  const [sealsSettled, setSealsSettled] = useState(false);
  const [cameraSettled, setCameraSettled] = useState(false);
  const crateInputs = `${scene.job?.jobId ?? ""}:${scene.receipts.length}:${visibleCheckpoints.map((c) => c.checkpoint).join(",")}`;
  const sealsInputs = scene.authorities
    .map((a) => `${a.mandateId}:${a.active}`)
    .join("|");
  // cameraInputs is defined after closeup (below); the re-arm effect for
  // the camera lives there too.
  useEffect(() => {
    setCrateSettled(false);
  }, [crateInputs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSealsSettled(false);
  }, [sealsInputs]); // eslint-disable-line react-hooks/exhaustive-deps
  const visualComplete =
    storyComplete && crateSettled && sealsSettled && cameraSettled;

  // §2: TRUE PRE-ENDCARD STATE. visualComplete marks the settled Beat-7
  // scene (T1 is the first R3F frame where it holds). The explanatory end
  // card appears only after a deterministic presentation hold, so the
  // caption-free settled world is capturable. The hold is presentation-only:
  // it changes no timing, receipts, checkpoints, authority, or semantics.
  const END_CARD_HOLD_MS = 2500;
  const [endCardVisible, setEndCardVisible] = useState(false);
  const endCardTimer = useRef<number | null>(null);
  useEffect(() => {
    if (visualComplete && !endCardVisible) {
      if (endCardTimer.current !== null) window.clearTimeout(endCardTimer.current);
      endCardTimer.current = window.setTimeout(() => setEndCardVisible(true), END_CARD_HOLD_MS);
    } else if (!visualComplete && endCardVisible) {
      if (endCardTimer.current !== null) {
        window.clearTimeout(endCardTimer.current);
        endCardTimer.current = null;
      }
      setEndCardVisible(false);
    }
    return () => {
      if (endCardTimer.current !== null) {
        window.clearTimeout(endCardTimer.current);
        endCardTimer.current = null;
      }
    };
  }, [visualComplete, endCardVisible]);

  // CP3 §5: actual R3F-frame timing. FrameTimer sits inside the Canvas and
  // captures performance.now() on the first R3F frame where the Beat 1
  // persistent job is visible (T0) and on the first R3F frame where final
  // visual readiness holds (T1).
  const [visualT0Ms, setVisualT0Ms] = useState<number | null>(null);
  const [visualT1Ms, setVisualT1Ms] = useState<number | null>(null);
  const visualDurationMs =
    visualT0Ms != null && visualT1Ms != null
      ? visualT1Ms - visualT0Ms
      : null;

  // Failed-reach trigger (defect 3, latched per defect 5): when the real
  // Failed-reach lifecycle (CP3 §2): deterministic state machine.
  // false → true on the attempt event (stable identity) → full
  // choreography → false on scene-reported completion.
  const [reach, setReach] = useState<ReachLifecycleState>(REACH_IDLE);
  const lastRevealed = revealed[revealed.length - 1] as
    | (WEvent & { event_id?: string; detail?: Record<string, unknown>; summary?: string })
    | undefined;
  const attemptEventId =
    lastRevealed?.kind === "activity" &&
    lastRevealed.detail?.helper === "juniper" &&
    typeof lastRevealed.detail?.attempted_action === "string" &&
    /reaches for the job/i.test(lastRevealed.summary ?? "")
      ? lastRevealed.event_id ?? `seq-${lastRevealed.seq}`
      : null;
  useEffect(() => {
    if (attemptEventId) {
      setReach((r) => nextReachState(r, { type: "attempt_revealed", eventId: attemptEventId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptEventId]);

  // debug hook for capture scripts: logical state only, no DOM internals.
  // visualT0Ms/visualT1Ms are performance.now() on actual R3F frames.
  useEffect(() => {
    (window as unknown as { __authorityDebug?: unknown }).__authorityDebug = {
      seq: maxSeq,
      eventCount: scene.eventCount,
      jobVisible: scene.job != null,
      storyComplete,
      visualComplete,
      endCardVisible,
      crateSettled,
      sealsSettled,
      cameraSettled,
      visualT0Ms,
      visualT1Ms,
      visualDurationMs,
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

  // beat-driven close-ups: the refusal and the replacement must be legible.
  // Defect 6: an explicitly unadmitted proposal (decision_requested=false)
  // is ambient — it never takes the camera.
  const closeup: VizCloseup = useMemo(() => {
    const last = revealed[revealed.length - 1] as
      | (WEvent & { detail?: Record<string, unknown> })
      | undefined;
    return closeupFor(revealed, last);
  }, [revealed]);

  // CP3 §4: once the story is complete, the camera returns to the wide
  // view (no closeup required) so the settle can engage.
  const effectiveCloseup = storyComplete ? null : closeup;
  // re-arm the camera settle when its visual inputs change
  const cameraInputs = `${effectiveCloseup}:${VIZ_SMALL_SCREEN ? "p" : "d"}`;
  useEffect(() => {
    setCameraSettled(false);
  }, [cameraInputs]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <FrameTimer
            jobVisible={scene.job != null}
            complete={visualComplete}
            onT0={() => setVisualT0Ms((v) => (v === null ? performance.now() : v))}
            onT1={() => setVisualT1Ms((v) => (v === null ? performance.now() : v))}
          />
          <CameraRig
            view="world"
            workers={scene.workers}
            followWorkerId={null}
            closeup={effectiveCloseup}
            portrait={VIZ_SMALL_SCREEN}
            onCameraSettled={() => setCameraSettled(true)}
          />
          <OwnerObelisk />
          {/* §4: scene-native identity cues — restrained nameplates attached
              to the physical objects. No prose, no explanations. */}
          <Nameplate
            text="Wren"
            position={[-3.1, 1.75, 1.4]}
            accent="#4a9e5c"
          />
          <Nameplate
            text="Juniper"
            position={[0.9, 1.75, 1.6]}
            accent="#c9a84c"
          />
          <Nameplate
            text="Owner"
            position={[OBELISK_POS[0], 3.6, OBELISK_POS[2]]}
            accent="#d4af37"
          />
          <JobCrate
            job={scene.job}
            receipts={scene.receipts}
            checkpoints={visibleCheckpoints}
            onSettled={() => setCrateSettled(true)}
          />
          <SideTable proposals={scene.proposals} />
          <WorkerSwarm
            workers={scene.workers}
            selectedId={null}
            onSelect={() => {}}
            homeFn={authorityWorkerHome}
            reachingWorkerId={reach.active ? "juniper" : null}
            onReachComplete={() =>
              setReach((r) => nextReachState(r, { type: "choreography_complete" }))
            }
          />
          <AuthoritySeals
            authorities={scene.authorities}
            workers={scene.workers}
            selectedMandate={null}
            onSelect={() => {}}
            homeFn={authorityWorkerHome}
            onSealsSettled={() => setSealsSettled(true)}
          />
          <ReceiverGate
            proposals={scene.proposals.filter((p) => proposalVisibility(p).gateDecision)}
            onSelectGate={() => {}}
          />
          <ProposalPackets
            proposals={scene.proposals.filter((p) => proposalVisibility(p).gateTravel)}
            workers={scene.workers}
            onSelect={() => {}}
            homeFn={authorityWorkerHome}
          />
        </VizCanvas>
      </main>
      {/* The end card appears only after the caption-free presentation hold
          following visual completion — outside the timed sequence. */}
      {endCardVisible && (
        <footer className="viz-caption viz-endcard">{END_CARD}</footer>
      )}
    </div>
  );
}
