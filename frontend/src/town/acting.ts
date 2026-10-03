/**
 * Keyframed acting for the Square's vignettes.
 * frontend/src/town/acting.ts
 *
 * Every vignette is a deterministic function of loop time: pose = f(t).
 * No randomness, no external state. Loops are seamless by construction:
 * each track's first and last keys share the same value (neutral).
 *
 * The craft vocabulary: anticipation (wind up before the effort), weight
 * (strain reads as tremor + lean), held poses (stillness is a beat), and
 * follow-through (settle past neutral, then rest).
 */

/** A key: [timeSeconds, value]. */
export type Key = [number, number];

/** Evaluate a key track at time t with smoothstep easing between keys.
 *  Holds the first/last value outside the key range. */
export function track(keys: Key[], t: number): number {
  if (keys.length === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      const s = u * u * (3 - 2 * u); // smoothstep
      return v0 + (v1 - v0) * s;
    }
  }
  return last[1];
}

/** Small tremor layered over a base value: strain under weight. */
export function tremor(t: number, amp: number, freq = 31): number {
  return Math.sin(t * freq) * amp;
}

/** Loop time t into [0, duration). */
export function loop(t: number, duration: number): number {
  return ((t % duration) + duration) % duration;
}

/** Degrees to radians, for readability in key tables. */
export const d = (deg: number): number => (deg * Math.PI) / 180;

/**
 * A smooth bump: 0 outside [t0,t1], rises to amp and falls back.
 * Good for transient efforts (a heave, a nod).
 */
export function bump(t: number, t0: number, t1: number, amp: number): number {
  if (t <= t0 || t >= t1) return 0;
  const u = (t - t0) / (t1 - t0);
  return amp * Math.sin(u * Math.PI);
}

/**
 * A plateau pulse: ramps 0->amp over [t0,t1], holds through t2,
 * ramps back over [t2,t3]. Good for sustained poses (crouch, grip, carry).
 */
export function pulse(
  t: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  amp: number
): number {
  if (t <= t0 || t >= t3) return 0;
  if (t < t1) {
    const u = (t - t0) / Math.max(1e-6, t1 - t0);
    return amp * u * u * (3 - 2 * u);
  }
  if (t < t2) return amp;
  const u = (t - t2) / Math.max(1e-6, t3 - t2);
  const s = u * u * (3 - 2 * u);
  return amp * (1 - s);
}

/** A walk-cycle oscillator: 0 when still, sin phasing when walking. */
export function gait(t: number, t0: number, t1: number, steps: number): number {
  if (t <= t0 || t >= t1) return 0;
  const u = (t - t0) / (t1 - t0);
  const env = Math.sin(u * Math.PI); // ease in/out of the walk
  return Math.sin(u * steps * Math.PI * 2) * env;
}

/**
 * Assert a track is loop-safe: first and last keys match in time/value
 * so the vignette has no visible pop at the seam. Throws in dev/tests.
 */
export function assertLoopSafe(name: string, keys: Key[], duration: number): void {
  const first = keys[0];
  const last = keys[keys.length - 1];
  const ok =
    Math.abs(first[0]) < 1e-6 &&
    Math.abs(last[0] - duration) < 1e-6 &&
    Math.abs(first[1] - last[1]) < 1e-6;
  if (!ok) {
    throw new Error(
      `vignette track "${name}" is not loop-safe: first=${first} last=${last} duration=${duration}`
    );
  }
}
