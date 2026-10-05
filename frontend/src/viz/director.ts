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
import { api } from "../api.ts";
import { promptInjection } from "../scenarios/promptInjection.ts";

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
 *
 * The per-step hold is short on purpose: the viz's paced event reveal
 * (pacing.ts) now owns the beat holds (STOP 2s, replacement 2.8s, ...),
 * so the director just keeps steps from piling up.
 */
export async function runDemoScript(opts: DirectorOpts = {}): Promise<void> {
  const { holdMs = 1200, onStep, onReset, shouldStop } = opts;
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

/**
 * WORLD-AUTHORITY-001: drive the 10-step authority demo (fresh session,
 * no boot mandate — the job exists before any worker is authorized).
 * Same contract as runDemoScript: the renderer never calls this.
 *
 * StrictMode/reset-race discipline (defect 6 repair): shouldStop is
 * checked BEFORE the reset POST (a cancelled launch never resets) and
 * again immediately after the reset resolves (a stale reset never fires
 * onReset or advances).
 */
export async function runAuthorityDemoScript(opts: DirectorOpts = {}): Promise<void> {
  const { holdMs = 1400, onStep, onReset, shouldStop } = opts;
  if (shouldStop?.()) return;
  await api.resetAuthorityDemo();
  if (shouldStop?.()) return;
  onReset?.();
  for (;;) {
    if (shouldStop?.()) return;
    const res = await api.advanceAuthorityDemo();
    onStep?.(res.step, res.total);
    if (res.finished) break;
    let waited = 0;
    while (waited < holdMs) {
      if (shouldStop?.()) return;
      await sleep(200);
      waited += 200;
    }
  }
}

export interface LaunchOpts extends DirectorOpts {
  /** Defer the first POST by this many ms (default 0 = next tick). Lets a
   *  StrictMode throwaway effect clean up before any reset is issued. */
  deferMs?: number;
}

/**
 * Deferred, cancellable authority-demo launch (defect 6 repair).
 * Returns a cancel function; cleanup cancels the pending launch so a
 * stale reset can never land after the current one. The generation
 * counter in the caller (or shouldStop) still guards later advances.
 */
export function launchAuthorityDemo(opts: LaunchOpts = {}): () => void {
  let cancelled = false;
  const { deferMs = 0, ...rest } = opts;
  const timer = setTimeout(() => {
    if (cancelled) return;
    runAuthorityDemoScript(rest).catch(() => {
      /* demo errors surface in the main app; the viz stays read-only */
    });
  }, deferMs);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

/** Prompt-injection presentation: same real gate, no model/API calls.
 * A deferred launch prevents React StrictMode's discarded mount from
 * resetting the current session. Errors are reported to the view.
 */
export function launchPromptInjection(
  opts: LaunchOpts & { onComplete: () => void; onError: (error: unknown) => void }
): () => void {
  let cancelled = false;
  const stopped = () => cancelled || !!opts.shouldStop?.();
  const timer = setTimeout(async () => {
    try {
      if (stopped()) return;
      await api.resetPromptInjection();
      if (stopped()) return;
      opts.onReset?.();
      // 3 seconds wide, then six 4-second beats; final wide at 23s.
      const beats = Object.values(promptInjection.beats);
      const t0 = performance.now();
      for (let i = 0; i < beats.length - 1; i++) {
        const until = t0 + beats[i];
        while (performance.now() < until) {
          if (stopped()) return;
          await sleep(Math.min(200, Math.max(0, until - performance.now())));
        }
        if (stopped()) return;
        const result = await api.advancePromptInjection();
        if (stopped()) return;
        opts.onStep?.(result.step, result.total);
      }
      const until = t0 + promptInjection.beats.end;
      while (performance.now() < until) {
        if (stopped()) return;
        await sleep(100);
      }
      if (!stopped()) opts.onComplete();
    } catch (error) {
      if (!stopped()) opts.onError(error);
    }
  }, opts.deferMs ?? 0);
  return () => { cancelled = true; clearTimeout(timer); };
}
