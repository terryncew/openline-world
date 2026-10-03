/**
 * OpenLine World visualization — the control bench.
 * frontend/src/viz/ControlBench.tsx
 *
 * Replaces the dashboard timeline bar with a workshop-native console: a
 * dark-wood bench with brass fittings. Same controls, same semantics —
 * the bench scrubs the EVENT LOG, not a video; "Run the demo" drives the
 * real demo script through the director (the only button that POSTs).
 */
import type { WEvent } from "./protocol";

export type ReplayState = "idle" | "replaying" | "paused" | "live";

const SPEEDS = [0.5, 1, 2, 4];

export function ControlBench({
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
  const live = replayState === "live" || atLive;

  return (
    <div className="bench">
      <div className="bench-plate" aria-live="polite">
        <span className={`bench-lamp ${live ? "on" : ""}`} title={live ? "live" : "held"} />
        <span className="bench-caption">{caption}</span>
      </div>
      <div className="bench-row">
        <button className="bench-brass" onClick={onRunDemo} disabled={demoRunning}>
          {demoRunning ? "Demo running…" : "Run the demo"}
        </button>
        <div className="bench-transport" role="group" aria-label="Replay controls">
          <button className="bench-key" onClick={onReplay} title="Replay from the first event">
            Replay
          </button>
          {replayState === "replaying" ? (
            <button className="bench-key" onClick={onPause}>Pause</button>
          ) : (
            <button className="bench-key" onClick={onResume} disabled={atLive}>Play</button>
          )}
          <button className="bench-key" onClick={onStep} title="Step one event">Step ▸</button>
        </div>
        <div className="bench-speed" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`bench-detent ${speed === s ? "set" : ""}`}
              onClick={() => onSpeed(s)}
              aria-pressed={speed === s}
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="bench-fine">{live ? "live" : `event ${cursorSeq} of ${max}`}</span>
      </div>
      <input
        className="bench-rail"
        type="range"
        min={min}
        max={Math.max(max, min + 1)}
        value={Math.min(cursorSeq, max)}
        onChange={(e) => onCursor(Number(e.target.value))}
        aria-label="Scrub the event log"
      />
    </div>
  );
}
