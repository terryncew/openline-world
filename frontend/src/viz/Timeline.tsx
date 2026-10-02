/**
 * OpenLine World visualization — timeline controls.
 * frontend/src/viz/Timeline.tsx
 *
 * The timeline scrubs the EVENT LOG, not a video: cursorSeq selects which
 * persisted events are in state. Replay = deterministic re-reduction.
 * "Run the live demo" drives the real demo script through the director
 * (the only module allowed to POST); everything else here is read-only.
 */
import type { WEvent } from "./protocol";

export type ReplayState = "idle" | "replaying" | "paused" | "live";

export function Timeline({
  events,
  cursorSeq,
  onCursor,
  replayState,
  speed,
  onSpeed,
  onReplay,
  onPause,
  onResume,
  onStep,
  onRunDemo,
  demoRunning,
  caption,
}: {
  events: WEvent[];
  cursorSeq: number;
  onCursor: (seq: number) => void;
  replayState: ReplayState;
  speed: number;
  onSpeed: (s: number) => void;
  onReplay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onRunDemo: () => void;
  demoRunning: boolean;
  caption: string;
}) {
  const seqs = events.map((e) => e.seq);
  const min = seqs.length ? Math.min(...seqs) : 0;
  const max = seqs.length ? Math.max(...seqs) : 0;
  const atLive = cursorSeq >= max;

  return (
    <div className="viz-timeline">
      <div className="viz-timeline-row">
        <button className="viz-btn primary" onClick={onRunDemo} disabled={demoRunning}>
          {demoRunning ? "Demo running…" : "Run the live demo"}
        </button>
        <button className="viz-btn" onClick={onReplay} title="Replay from the first event">
          Replay
        </button>
        {replayState === "replaying" ? (
          <button className="viz-btn" onClick={onPause}>Pause</button>
        ) : (
          <button className="viz-btn" onClick={onResume} disabled={atLive}>Play</button>
        )}
        <button className="viz-btn" onClick={onStep} title="Step one event">Step ▸</button>
        <label className="viz-speed">
          Speed
          <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <span className="viz-fine">
          {replayState === "live" || atLive ? "live" : `event ${cursorSeq} of ${max}`}
        </span>
      </div>
      <input
        className="viz-scrub"
        type="range"
        min={min}
        max={Math.max(max, min + 1)}
        value={Math.min(cursorSeq, max)}
        onChange={(e) => onCursor(Number(e.target.value))}
        aria-label="Scrub the event log"
      />
      <div className="viz-caption">{caption}</div>
    </div>
  );
}
