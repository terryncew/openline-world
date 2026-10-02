/**
 * OpenLine World — the Square.
 * frontend/src/square/SquareView.tsx
 *
 * The home screen: a small working robot town. The workshop door is the
 * one real destination — entering it mounts the proven custody
 * visualization (auto-running the demo); leaving returns here.
 *
 * This component composes screens. It never touches protocol state:
 * the town is pure local animation, and the workshop is VizView's own
 * read-only replay path. See square.boundary.test.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { VizView } from "../viz/VizView";
import { SquareCanvas } from "./scene/SquareCanvas";
import { Town } from "./scene/Town";
import "./square.css";

type Place = "square" | "entering" | "workshop" | "leaving";

const FADE_MS = 550;

function go(view: string) {
  window.location.search = `?view=${view}`;
}

export function SquareView() {
  const [place, setPlace] = useState<Place>("square");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const enter = useCallback(() => {
    setPlace((p) => {
      if (p !== "square") return p;
      timer.current = window.setTimeout(() => setPlace("workshop"), FADE_MS);
      return "entering";
    });
  }, []);

  const exit = useCallback(() => {
    setPlace((p) => {
      if (p !== "workshop") return p;
      timer.current = window.setTimeout(() => setPlace("square"), FADE_MS);
      return "leaving";
    });
  }, []);

  const fading = place === "entering" || place === "leaving";

  if (place === "workshop" || place === "leaving") {
    return (
      <div className="square-view">
        <VizView onExit={exit} autoRunDemo exitLabel="Back to the Square" />
        <div className={`square-fade${fading ? " on" : ""}`}>
          {place === "leaving" && <span>Back to the Square…</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="square-view">
      <SquareCanvas>
        <Town onEnterWorkshop={enter} />
      </SquareCanvas>

      <header className="square-hud square-hud-top">
        <div className="square-brand">
          <strong>OpenLine World</strong>
          <span>Bring your agent. Keep your rules.</span>
        </div>
        <nav className="square-nav">
          <button onClick={() => go("watch")}>Tour</button>
          <button onClick={() => go("viz")}>Visualize</button>
          <button onClick={() => go("world")}>World</button>
        </nav>
      </header>

      <div className="square-hud square-hud-bottom">
        <p className="square-hint">Drag to look around · Click the workshop to see the real rules</p>
        <button className="square-enter" onClick={enter}>
          Enter the workshop
        </button>
      </div>

      <div className={`square-fade${fading ? " on" : ""}`}>
        {place === "entering" && (
          <span>The workshop — where every consequential action is approved, or stopped.</span>
        )}
      </div>
    </div>
  );
}
