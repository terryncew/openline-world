import { TOUR_BEATS, TOUR_TITLE } from "./beats";
import type { TourPhase } from "./useTour";

export function TourOverlay({
  phase,
  beatIndex,
  paused,
  onTogglePause,
  onReplay,
  onEvidence,
  onExplore,
}: {
  phase: TourPhase;
  beatIndex: number;
  paused: boolean;
  onTogglePause: () => void;
  onReplay: () => void;
  onEvidence: () => void;
  onExplore: () => void;
}) {
  const beat = TOUR_BEATS[Math.min(beatIndex, TOUR_BEATS.length - 1)];
  const done = phase === "done";
  return (
    <div className="tour-ui">
      <div className="tour-progress" aria-hidden>
        <div
          className="tour-progress-fill"
          style={{ width: `${((done ? TOUR_BEATS.length : beatIndex) / TOUR_BEATS.length) * 100}%` }}
        />
      </div>
      <header className="tour-head">
        <div className="brand">
          <strong>OpenLine Workshop</strong>
          <span className="tagline">Change your AI. Keep your rules.</span>
        </div>
        <div className="tour-controls">
          {phase === "playing" && (
            <button onClick={onTogglePause}>{paused ? "Resume" : "Pause"}</button>
          )}
          {(phase === "playing" || done) && <button onClick={onReplay}>Replay</button>}
          <button onClick={onEvidence}>Evidence</button>
          <button className="ghost" onClick={onExplore}>
            Explore
          </button>
        </div>
      </header>
      <div className="tour-caption" role="status">
        {phase === "idle" && <p>{TOUR_TITLE}</p>}
        {phase === "playing" && <p key={beatIndex}>{beat.caption}</p>}
        {done && (
          <div className="tour-end">
            <p>{TOUR_TITLE}</p>
            <p className="fine">Every allow and refusal above was decided by the real gate and signed. Open Evidence to inspect the receipts.</p>
          </div>
        )}
      </div>
      <div className="tour-demo-note">Demo: deterministic synthetic events. No paid calls, no network services.</div>
    </div>
  );
}
