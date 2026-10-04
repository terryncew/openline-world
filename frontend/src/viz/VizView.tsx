/**
 * OpenLine World visualization — the viz view.
 * frontend/src/viz/VizView.tsx
 *
 * Composes: read-only event stream -> pure reducer -> R3F scene, plus the
 * timeline (scrub/replay/step), inspector, camera views, and the optional
 * demo director ("Run the live demo" — the only button that POSTs).
 *
 * The renderer never mutates World state. window.__vizDebug exposes the
 * current logical scene for automated tests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type VizSceneState,
  type WEvent,
} from "./protocol";
import { reduceEvents } from "./reducer";
import { fetchSnapshot, subscribeLive } from "./source";
import { runDemoScript } from "./director";
import { revealDelay, isReplacementOnboard } from "./pacing";
import { VizCanvas } from "./scene/VizCanvas";
import { OwnerObelisk } from "./scene/OwnerObelisk";
import { WorkerSwarm } from "./scene/WorkerSwarm";
import { AuthoritySeals } from "./scene/AuthoritySeals";
import { ReceiverGate } from "./scene/ReceiverGate";
import { ProposalPackets } from "./scene/ProposalPackets";
import { proposalVisibility } from "./proposalVisibility.ts";
import { ReceiptTablets } from "./scene/ReceiptTablets";
import { SpeechPuffs, UnrecognizedMarkers } from "./scene/SpeechPuffs";
import { CameraRig, type VizCameraView, type VizCloseup } from "./scene/CameraRig";
import { Timeline, type ReplayState } from "./Timeline";
import { Inspector, type VizSelection } from "./Inspector";
import type { Snapshot } from "../api";
import "./viz.css";

/* ---------------- synthetic benchmark events ---------------- */

function benchEvents(n: number): WEvent[] {
  // Synthetic but well-formed: same kinds, same provenance vocabulary,
  // through the same reducer path as real events.
  const out: WEvent[] = [];
  let seq = 0;
  const ev = (
    kind: string, provenance: WEvent["provenance"], summary: string,
    detail: Record<string, unknown>, source: string
  ): WEvent => {
    seq += 1;
    return {
      event_id: `bench-${seq}`, seq, task_id: "bench", ts: "",
      source, kind, provenance, summary, detail,
    };
  };
  for (let i = 0; i < n; i++) {
    const h = `benchw${i}`;
    out.push(ev("mandate", "owner-signed", `${h} onboarded`,
      { mandate_id: `mandate-${h}-${i + 1}`, scopes: ["notes.read"] }, "owner"));
  }
  for (let i = 0; i < n; i++) {
    const h = `benchw${i}`;
    out.push(ev("proposal", "agent-reported", `${h} proposes notes.read`,
      { helper: h, action: "notes.read" }, "agent"));
  }
  for (let i = 0; i < n; i++) {
    const h = `benchw${i}`;
    const decision = i % 5 === 4 ? "STOPPED" : "ALLOWED";
    out.push(ev("decision", "receiver-signed", `${decision} for notes.read`,
      { helper: h, action: "notes.read", decision, reason_codes: [] }, "receiver"));
  }
  for (let i = 0; i < n; i++) {
    const h = `benchw${i}`;
    const decision = i % 5 === 4 ? "STOPPED" : "ALLOWED";
    out.push(ev("receipt", "receiver-signed", `receipt ${decision}`,
      { receipt: { receipt_id: `br-${i}`, subject_id: h, action: "notes.read", decision, reason_codes: [] } }, "receiver"));
  }
  return out;
}

function benchN(): number {
  // Synthetic benchmark events carry real provenance labels through the
  // real scene — a speculation/proof contamination vector if reachable by
  // URL alone. The bench path is compiled in ONLY with the non-default
  // build flag VITE_ENABLE_VIZBENCH=1; default builds ignore ?vizbench=.
  if (import.meta.env.VITE_ENABLE_VIZBENCH !== "1") return 0;
  const v = new URLSearchParams(window.location.search).get("vizbench");
  const n = v == null ? 0 : parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ---------------- captions ---------------- */

function captionFor(events: WEvent[], cursorSeq: number): string {
  const vis = events.filter((e) => e.seq <= cursorSeq);
  const last = vis[vis.length - 1];
  if (!last) return "Waiting for the World event stream…";
  const d = (last as { detail?: Record<string, unknown> }).detail ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (last.kind) {
    case "mandate":
      if (d.status === "REVOKED")
        return "The owner revoked the mandate. The seal dims and sinks — the records stay.";
      if (isReplacementOnboard(last, vis))
        return "New worker. Same rules. Same records.";
      return `${s(d.mandate_id).replace(/^mandate-/, "").replace(/-\d+$/, "")} enters with a new mandate. The seal belongs to the owner, not the worker.`;
    case "proposal":
      return `${s(d.helper)} proposes ${s(d.action)}. The packet carries a claim to the gate — nothing decided yet.`;
    case "decision":
      return d.decision === "ALLOWED"
        ? "The receiver allowed it. The consequence proceeds."
        : "The receiver stopped it. The packet halts at the gate — nothing consequential happens.";
    case "receipt":
      return "Receipt recorded behind the gate. It stays, even after revocation, even after the worker changes.";
    case "activity":
      return /done/i.test(last.summary)
        ? "Wren says “done”. No packet leaves for the gate — only the receiver mints receipts."
        : last.summary;
    default:
      return last.summary || "…";
  }
}

/* ---------------- the view ---------------- */

export function VizView({
  onExit,
  autoRunDemo = false,
  exitLabel = "Exit",
}: {
  onExit: () => void;
  /** square entry only: run the demo once on mount, same code path as the button */
  autoRunDemo?: boolean;
  exitLabel?: string;
}) {
  const bench = useMemo(benchN, []);
  const [liveEvents, setLiveEvents] = useState<WEvent[]>([]);
  // Paced reveal: the timeline shows a prefix of the raw stream, holding
  // on consequential beats (see pacing.ts). The reducer still sees the
  // same events in the same order — pacing is stage direction only.
  const [revealed, setRevealed] = useState<WEvent[]>([]);
  const liveRef = useRef<WEvent[]>([]);
  liveRef.current = liveEvents;
  const scheduledIdx = useRef(-1);
  const [cursorSeq, setCursorSeq] = useState<number | null>(null); // null = live edge of revealed
  const [replayState, setReplayState] = useState<ReplayState>("live");
  const [speed, setSpeed] = useState(1);
  const [selection, setSelection] = useState<VizSelection>(null);
  const [cameraView, setCameraView] = useState<VizCameraView>("world");
  const [demoRunning, setDemoRunning] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  // re-render tick so the gate close-up eases back after a receipt lands
  const [graceTick, setGraceTick] = useState(0);
  const [receiptAt, setReceiptAt] = useState(0);
  const seenRef = useRef(new Set<string>());
  const stopDemoRef = useRef(false);
  const [streamEpoch, setStreamEpoch] = useState(0);

  const events = useMemo(
    () => (bench > 0 ? benchEvents(bench) : revealed),
    [bench, revealed]
  );

  // read-only subscription: backlog replay then live tail.
  // streamEpoch bumps after a demo reset, because reset replaces the
  // backend's event log — the old SSE connection would hang on the
  // abandoned log, so we resubscribe from seq 0.
  useEffect(() => {
    if (bench > 0) return;
    seenRef.current.clear();
    setLiveEvents([]);
    setRevealed([]);
    scheduledIdx.current = -1;
    const unsub = subscribeLive(0, (ev) => {
      if (seenRef.current.has(ev.event_id)) return;
      seenRef.current.add(ev.event_id);
      setLiveEvents((prev) => [...prev, ev]);
      setStreamError(null);
    });
    fetchSnapshot().then(setSnap).catch(() => {});
    return () => {
      unsub();
    };
  }, [bench, streamEpoch]);

  // Paced reveal: in live/replaying states, reveal the next raw event
  // after the hold for the last revealed beat. Paused/scrubbed states
  // freeze the reveal; replay restarts it from seq 0.
  useEffect(() => {
    if (bench > 0) return;
    if (replayState !== "live" && replayState !== "replaying") return;
    if (revealed.length >= liveRef.current.length) return;
    if (scheduledIdx.current === revealed.length) return;
    scheduledIdx.current = revealed.length;
    const last = revealed.length ? revealed[revealed.length - 1] : null;
    const delay = revealDelay(last, revealed) / speed;
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
  }, [bench, replayState, liveEvents, revealed, speed]);

  // when a receipt is revealed, the close-up holds ~1.5s so the tablet
  // landing is seen, then the camera eases back to the world view
  const lastRevealed = revealed[revealed.length - 1];
  useEffect(() => {
    if (bench > 0) return;
    if (lastRevealed?.kind === "receipt") {
      setReceiptAt(performance.now());
      const t = setTimeout(() => setGraceTick((g) => g + 1), 1600);
      return () => clearTimeout(t);
    }
  }, [bench, lastRevealed]);

  const maxSeq = events.length ? events[events.length - 1].seq : 0;
  const effectiveCursor = cursorSeq ?? maxSeq;

  // The event log is authoritative for worker/authority standing. The
  // snapshot is read-only and only supplies the owner principal, which
  // the events do not carry. Never let a stale snapshot override
  // event-derived active/revoked state.
  const scene: VizSceneState = useMemo(
    () => reduceEvents(events.filter((e) => e.seq <= effectiveCursor)),
    [events, effectiveCursor]
  );

  const ownerPrincipal = snap?.gate.principal_id ?? null;

  // replay: restart the paced reveal from the first persisted event
  const doReplay = useCallback(() => {
    scheduledIdx.current = -1;
    setRevealed([]);
    setCursorSeq(null);
    setReplayState("replaying");
  }, []);
  const doStep = useCallback(() => {
    setReplayState("paused");
    if (cursorSeq != null) {
      // scrubbed back: step the cursor through revealed events
      const next = revealed.map((e) => e.seq).find((s) => s > cursorSeq);
      if (next != null) setCursorSeq(next);
      return;
    }
    // at the live edge: reveal exactly one more event, bypassing the hold
    scheduledIdx.current = -1;
    setRevealed((r) => {
      const src = liveRef.current;
      return r.length < src.length ? [...r, src[r.length]] : r;
    });
  }, [revealed, cursorSeq]);

  // Cancellation: leaving the workshop (or unmounting for any reason)
  // must stop FUTURE demo advances immediately. An advance request that
  // is already in flight when cancellation lands may still complete and
  // append its events — the backend cannot un-send a request it has
  // received. Documented limitation, covered by e2e/cancel-demo.mjs:
  // after cancel, no NEW /api/demo/advance POST may be issued.
  useEffect(() => {
    return () => {
      stopDemoRef.current = true;
    };
  }, []);

  const handleExit = useCallback(() => {
    stopDemoRef.current = true;
    onExit();
  }, [onExit]);

  const runDemo = useCallback(async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    stopDemoRef.current = false;
    setCursorSeq(null);
    setReplayState("live");
    try {
      await runDemoScript({
        shouldStop: () => stopDemoRef.current,
        onReset: () => {
          // the backend's event log is new: resubscribe from seq 0
          setCursorSeq(null);
          setReplayState("live");
          setStreamEpoch((e) => e + 1);
        },
      });
    } catch {
      /* demo errors surface in the main app; the viz stays read-only */
    } finally {
      setDemoRunning(false);
      fetchSnapshot().then(setSnap).catch(() => {});
    }
  }, [demoRunning]);

  // square entry: run the demo on mount through the director (the same
  // path as the "Run the live demo" button). StrictMode-safe: every
  // (re)mount starts the demo; the cleanup stops it. The unmount cleanup
  // above sets stopDemoRef, so a StrictMode double-mount stops the first
  // run and this effect starts the second — no stale autoStarted guard.
  // Generation counter: only the latest run's finally() may clear
  // demoRunning, so a stale first run cannot re-enable the button mid-run.
  const autoGen = useRef(0);
  useEffect(() => {
    if (!autoRunDemo) return;
    const gen = ++autoGen.current;
    stopDemoRef.current = false;
    setDemoRunning(true);
    setCursorSeq(null);
    setReplayState("live");
    runDemoScript({
      shouldStop: () => stopDemoRef.current || autoGen.current !== gen,
      onReset: () => {
        setCursorSeq(null);
        setReplayState("live");
        setStreamEpoch((e) => e + 1);
      },
    })
      .catch(() => {
        /* demo errors surface in the main app; the viz stays read-only */
      })
      .finally(() => {
        if (autoGen.current === gen) {
          setDemoRunning(false);
          fetchSnapshot().then(setSnap).catch(() => {});
        }
      });
    return () => {
      stopDemoRef.current = true;
    };
    // run once per mount; the director owns the POST loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunDemo]);

  // timeline-driven camera close-ups. Only when the user hasn't taken
  // the camera themselves (view === "world").
  const closeup: VizCloseup = useMemo(() => {
    if (cameraView !== "world") return null;
    const vis = events.filter((e) => e.seq <= effectiveCursor);
    const last = vis[vis.length - 1] as WEvent & { detail?: Record<string, unknown> };
    if (!last) return null;
    if (last.kind === "mandate") {
      const st = last.detail?.status;
      if (st !== "REVOKED" && isReplacementOnboard(last, vis)) return "replacement";
      return null;
    }
    if (last.kind === "proposal" || last.kind === "decision") return "gate";
    if (last.kind === "receipt") {
      // the landing render (receiptAt not yet set) or the grace window
      return receiptAt === 0 || performance.now() - receiptAt < 1500 ? "gate" : null;
    }
    return null;
    // graceTick re-runs this after the window lapses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, effectiveCursor, cameraView, receiptAt, graceTick]);

  const followWorkerId =
    selection?.kind === "worker"
      ? selection.id
      : scene.workers.length
        ? scene.workers[scene.workers.length - 1].workerId
        : null;

  // debug hook for automated tests: logical state only, no DOM internals
  useEffect(() => {
    (window as unknown as { __vizDebug?: unknown }).__vizDebug = {
      seq: effectiveCursor,
      maxSeq,
      eventCount: scene.eventCount,
      events: events
        .filter((e) => e.seq <= effectiveCursor)
        .map((e) => ({ seq: e.seq, kind: e.kind, summary: e.summary })),
      workers: scene.workers.map((w) => ({
        id: w.workerId, active: w.active, mandateId: w.mandateId,
        provenance: w.provenance,
      })),
      authorities: scene.authorities.map((a) => ({
        mandateId: a.mandateId, active: a.active, provenance: a.provenance,
      })),
      proposals: scene.proposals.map((p) => ({
        id: p.id, worker: p.workerId, action: p.action, status: p.status,
        provenance: p.provenance, decisionProvenance: p.decisionProvenance,
      })),
      decisions: scene.proposals
        .filter((p) => p.status !== "in-flight")
        .map((p) => ({ worker: p.workerId, action: p.action, status: p.status })),
      receipts: scene.receipts.map((r) => ({
        id: r.id, decision: r.decision, action: r.action,
        provenance: r.provenance,
      })),
      speeches: scene.speeches.map((s) => ({
        id: s.id, worker: s.workerId, provenance: s.provenance,
      })),
      unrecognized: scene.unrecognized.map((u) => ({ kind: u.kind, reason: u.reason })),
      setCursor: (seq: number) => {
        setReplayState("paused");
        setCursorSeq(seq);
      },
      goLive: () => {
        setCursorSeq(null);
        setReplayState("live");
      },
    };
  });

  return (
    <div className="viz-root">
      <header className="viz-topbar">
        <div className="viz-brand">
          <strong>OpenLine World — visualization</strong>
          <span className="viz-fine">read-only: every object traces to a real event</span>
        </div>
        <div className="viz-controls">
          <button className="viz-btn" onClick={() => setCameraView("world")}>World</button>
          <button className="viz-btn" onClick={() => setCameraView("worker")}>Follow worker</button>
          <button className="viz-btn" onClick={() => setCameraView("receiver")}>Receiver</button>
          <button className="viz-btn" onClick={() => setCameraView("records")}>Records</button>
          <button className="viz-btn" onClick={handleExit}>{exitLabel}</button>
        </div>
      </header>
      {streamError && <div className="viz-err">{streamError}</div>}
      <main className="viz-stage">
        <VizCanvas>
          <CameraRig
            view={cameraView}
            workers={scene.workers}
            followWorkerId={followWorkerId}
            closeup={closeup}
          />
          <OwnerObelisk onSelect={() => setSelection({ kind: "owner" })} />
          <WorkerSwarm
            workers={scene.workers}
            selectedId={selection?.kind === "worker" ? selection.id : null}
            onSelect={(id) => setSelection(id ? { kind: "worker", id } : null)}
          />
          <AuthoritySeals
            authorities={scene.authorities}
            workers={scene.workers}
            selectedMandate={selection?.kind === "seal" ? selection.id : null}
            onSelect={(id) => setSelection(id ? { kind: "seal", id } : null)}
          />
          <ReceiverGate
            proposals={scene.proposals.filter((p) => proposalVisibility(p).gateDecision)}
            onSelectGate={() => setSelection({ kind: "gate" })}
          />
          <ProposalPackets
            proposals={scene.proposals.filter((p) => proposalVisibility(p).gateTravel)}
            workers={scene.workers}
            onSelect={(id) => setSelection(id ? { kind: "packet", id } : null)}
          />
          <ReceiptTablets
            receipts={scene.receipts}
            selectedId={selection?.kind === "receipt" ? selection.id : null}
            onSelect={(id) => setSelection(id ? { kind: "receipt", id } : null)}
          />
          <SpeechPuffs speeches={scene.speeches} workers={scene.workers} />
          <UnrecognizedMarkers items={scene.unrecognized} />
        </VizCanvas>
        <Inspector
          selection={selection}
          workers={scene.workers}
          authorities={scene.authorities}
          proposals={scene.proposals}
          receipts={scene.receipts}
          ownerPrincipal={ownerPrincipal}
          onClose={() => setSelection(null)}
        />
      </main>
      <Timeline
        events={events}
        cursorSeq={effectiveCursor}
        onCursor={(s) => {
          setReplayState("paused");
          setCursorSeq(s >= maxSeq ? null : s);
        }}
        replayState={cursorSeq == null ? "live" : replayState}
        speed={speed}
        onSpeed={setSpeed}
        onReplay={doReplay}
        onPause={() => setReplayState("paused")}
        onResume={() => setReplayState("replaying")}
        onStep={doStep}
        onRunDemo={runDemo}
        demoRunning={demoRunning}
        caption={captionFor(events, effectiveCursor)}
      />
      {bench > 0 && <BenchMeter />}
    </div>
  );
}

/** FPS + heap overlay for ?vizbench=N runs. */
function BenchMeter() {
  const [stats, setStats] = useState("measuring…");
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 < 5000) {
        raf = requestAnimationFrame(tick);
      } else {
        const fps = (frames / (performance.now() - t0)) * 1000;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const heap = mem ? ` heap ${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB` : " heap n/a";
        const line = `BENCH fps=${fps.toFixed(1)}${heap} frames=${frames}`;
        setStats(line);
        console.log(`[vizbench] ${line}`);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="viz-bench">{stats}</div>;
}
