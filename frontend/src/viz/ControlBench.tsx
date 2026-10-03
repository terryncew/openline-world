/**
 * OpenLine World visualization — the control bench, compact form.
 * frontend/src/viz/ControlBench.tsx
 *
 * Three layers only: the scene, one caption sentence, one compact strip.
 * The strip holds play/pause, step, and replay. Everything else — demo
 * run, speed, scrub rail, event count — lives behind the workshop menu.
 * The bench still drives the same EVENT LOG semantics; nothing about the
 * replay path changed.
 */
export type ReplayState = "idle" | "replaying" | "paused" | "live";

export function ControlBench({
  replayState,
  atLive,
  onReplay,
  onPause,
  onResume,
  onStep,
  caption,
}: {
  replayState: ReplayState;
  /** at the live edge of the event log: Play has nothing to resume */
  atLive: boolean;
  onReplay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  caption: string;
}) {
  const live = replayState === "live" || replayState === "idle";

  return (
    <div className="bench">
      <div className="bench-plate" aria-live="polite">
        <span className={`bench-lamp ${live ? "on" : ""}`} title={live ? "live" : "held"} />
        <span className="bench-caption">{caption}</span>
      </div>
      <div className="bench-row bench-compact">
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
      </div>
    </div>
  );
}
