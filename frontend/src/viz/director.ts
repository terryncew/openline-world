/**
 * OpenLine World visualization — demo director.
 * frontend/src/viz/director.ts
 *
 * The ONLY module in the viz tree allowed to mutate backend state. It
 * drives the real demo script (reset + paced advances) exactly like the
 * existing tour does — the renderer never calls it and never POSTs.
 *
 * The UI labels the entry point "Run the live demo" so nobody mistakes a
 * driven demo for a passive replay.
 */
import { api } from "../api";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface DirectorOpts {
  /** paced hold between steps, ms */
  holdMs?: number;
  onStep?: (step: number, total: number) => void;
  /** fired right after the reset lands: the backend's event log is new,
   *  so readers must resubscribe from seq 0 */
  onReset?: () => void;
  /** return true to stop early */
  shouldStop?: () => boolean;
}

/**
 * Reset into a fresh isolated session, then advance the real 9-step
 * custody demo with holds. Every decision shown comes from the backend's
 * EffectGate; this only paces the presentation.
 */
export async function runDemoScript(opts: DirectorOpts = {}): Promise<void> {
  const { holdMs = 2600, onStep, onReset, shouldStop } = opts;
  await api.resetDemo();
  onReset?.();
  for (let i = 0; i < 9; i++) {
    if (shouldStop?.()) return;
    const res = await api.advanceDemo();
    onStep?.(res.step, res.total);
    if (res.finished) break;
    // pause-aware hold so a viewer can read each beat
    let waited = 0;
    while (waited < holdMs) {
      if (shouldStop?.()) return;
      await sleep(200);
      waited += 200;
    }
  }
}
