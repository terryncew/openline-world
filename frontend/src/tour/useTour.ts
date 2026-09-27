import { useCallback, useEffect, useRef, useState } from "react";
import { TOUR_BEATS } from "./beats";

export type TourPhase = "idle" | "playing" | "done";

const paceFactor = () =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("pace") === "slow"
    ? 1.5
    : 1;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Drives the public tour: reset into a fresh isolated session, then advance
 * the real demo script beat by beat. Every decision the tour shows comes from
 * the backend's EffectGate; this hook only paces the presentation.
 */
export function useTour(opts: {
  step: number;
  advance: () => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => void;
}) {
  const [phase, setPhase] = useState<TourPhase>("idle");
  const [beatIndex, setBeatIndex] = useState(0);
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const stepRef = useRef(opts.step);
  stepRef.current = opts.step;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPausedState(p);
  }, []);

  const play = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase("playing");
    setPaused(false);
    setBeatIndex(0);
    const o = optsRef.current;
    const pace = paceFactor();
    try {
      await o.reset();
      for (let i = 0; i < TOUR_BEATS.length; i++) {
        setBeatIndex(i);
        await o.advance();
        // wait until the backend snapshot reflects the new step
        const target = TOUR_BEATS[i].step;
        const t0 = Date.now();
        while (stepRef.current < target && Date.now() - t0 < 8000) {
          await sleep(150);
          o.refresh();
          await sleep(150);
        }
        // hold the beat so a viewer can read the outcome; pause-aware
        let waited = 0;
        const hold = TOUR_BEATS[i].holdMs * pace;
        while (waited < hold) {
          if (pausedRef.current) {
            await sleep(250);
            continue;
          }
          await sleep(200);
          waited += 200;
        }
      }
      setPhase("done");
    } finally {
      runningRef.current = false;
    }
  }, []);

  // keep the latest callbacks without re-creating play
  useEffect(() => {
    optsRef.current = opts;
  });

  return { phase, beatIndex, paused, play, setPaused };
}
