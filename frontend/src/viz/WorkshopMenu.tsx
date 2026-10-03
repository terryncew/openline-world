/**
 * OpenLine World visualization — the workshop menu.
 * frontend/src/viz/WorkshopMenu.tsx
 *
 * The only persistent chrome besides the caption sentence and the three
 * transport keys: one small brass knob that opens a wooden menu holding
 * everything else — camera views, demo run, speed, scrub rail, event
 * count, exit. Nothing else competes with the scene.
 */
import { useEffect, useRef, useState } from "react";
import type { VizCameraView } from "./scene/CameraRig";

const VIEWS: { id: VizCameraView; label: string }[] = [
  { id: "world", label: "Room" },
  { id: "worker", label: "Workroom" },
  { id: "receiver", label: "Gate" },
  { id: "records", label: "Records" },
];

const SPEEDS = [0.5, 1, 2, 4];

export function WorkshopMenu({
  cameraView,
  onView,
  onRunDemo,
  demoRunning,
  speed,
  onSpeed,
  statusText,
  scrubMin,
  scrubMax,
  scrubValue,
  onScrub,
  exitLabel,
  onExit,
}: {
  cameraView: VizCameraView;
  onView: (v: VizCameraView) => void;
  onRunDemo: () => void;
  demoRunning: boolean;
  speed: number;
  onSpeed: (s: number) => void;
  statusText: string;
  scrubMin: number;
  scrubMax: number;
  scrubValue: number;
  onScrub: (seq: number) => void;
  exitLabel: string;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The menu is a tap-to-reveal drawer: Escape or a tap outside closes it;
  // any button inside closes it after acting. The scrub rail stays usable
  // while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="workshop-menu" ref={wrapRef}>
      <button
        className="menu-knob"
        aria-label="Workshop menu"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">≡</span>
      </button>
      {open && (
        <div className="menu-panel" aria-label="Workshop menu">
          <div className="menu-section">
            <span className="menu-head">Views</span>
            <div className="menu-views" role="group" aria-label="Camera views">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  className={`menu-key ${cameraView === v.id ? "set" : ""}`}
                  aria-pressed={cameraView === v.id}
                  onClick={act(() => onView(v.id))}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="menu-section">
            <button
              className="bench-brass menu-wide"
              onClick={act(onRunDemo)}
              disabled={demoRunning}
            >
              {demoRunning ? "Demo running…" : "Run the demo"}
            </button>
          </div>
          <div className="menu-section">
            <span className="menu-head">Speed</span>
            <div className="bench-speed" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`bench-detent ${speed === s ? "set" : ""}`}
                  aria-pressed={speed === s}
                  onClick={act(() => onSpeed(s))}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="menu-section">
            <input
              className="bench-rail menu-rail"
              type="range"
              min={scrubMin}
              max={Math.max(scrubMax, scrubMin + 1)}
              value={Math.min(scrubValue, scrubMax)}
              onChange={(e) => onScrub(Number(e.target.value))}
              aria-label="Scrub the event log"
            />
            <span className="bench-fine">{statusText}</span>
          </div>
          <div className="menu-section">
            <button className="menu-key menu-wide menu-exit" onClick={onExit}>
              {exitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
