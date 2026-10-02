/**
 * OpenLine World visualization — event-reveal pacing.
 * frontend/src/viz/pacing.ts
 *
 * PURE timing policy: how long the timeline holds on the last revealed
 * event before showing the next one. This is stage direction, not state —
 * the reducer still sees the same events in the same order, so the
 * logical sequence is unchanged. Animation timing was never
 * deterministic; event order is, and this does not touch it.
 *
 * Beats:
 *   STOPPED decision  -> 2000ms hold: the refusal must be unmissable.
 *   ALLOWED decision  ->  800ms, then follow the packet through.
 *   replacement onboard (mandate create after a revocation) -> 2800ms:
 *     the payoff beat: old seal dead, new seal descends, records untouched.
 *   receipt          ->  700ms: let the tablet land before easing back.
 *   proposal         ->  900ms: let the packet travel into the close-up.
 *   revocation       -> 1200ms: watch the seal die.
 */
import type { WEvent } from "./protocol";

function detailOf(e: WEvent): Record<string, unknown> {
  const d = (e as { detail?: unknown }).detail;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
}

/** True when this mandate-create is the worker-replacement payoff: a new
 *  mandate arriving after some earlier mandate was revoked. Derived from
 *  already-revealed events only. */
export function isReplacementOnboard(ev: WEvent, visible: WEvent[]): boolean {
  if (ev.kind !== "mandate") return false;
  const d = detailOf(ev);
  if (d.status === "REVOKED") return false;
  return visible.some(
    (e) => e.kind === "mandate" && detailOf(e).status === "REVOKED"
  );
}

export function revealDelay(last: WEvent | null, visible: WEvent[]): number {
  if (!last) return 0;
  const d = detailOf(last);
  switch (last.kind) {
    case "decision":
      return d.decision === "STOPPED" ? 2000 : 800;
    case "receipt":
      return 700;
    case "proposal":
      return 900;
    case "mandate":
      if (d.status === "REVOKED") return 1200;
      return isReplacementOnboard(last, visible) ? 2800 : 600;
    case "activity":
      return 900;
    default:
      return 350;
  }
}
