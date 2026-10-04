/**
 * Failed-reach lifecycle (WORLD-AUTHORITY-001 CP3 §2).
 *
 * Deterministic state machine for Juniper's pre-grant reach:
 *   false → true → full reach choreography → false
 *
 * - one trigger per attempt event (stable event identity)
 * - rerenders do not restart it
 * - later revealed events do not cancel the reach
 * - the latch returns to false only when the scene reports the full
 *   reach / hold / return choreography complete
 * - the reach carries no authority, no receipt, no checkpoint, no job effect
 */
export interface ReachLifecycleState {
  /** true while the reach choreography is playing */
  active: boolean;
  /** event_id of the attempt that triggered the current/last reach */
  triggeredEventId: string | null;
}

export const REACH_IDLE: ReachLifecycleState = {
  active: false,
  triggeredEventId: null,
};

export type ReachLifecycleEvent =
  | { type: "attempt_revealed"; eventId: string }
  | { type: "choreography_complete" }
  | { type: "reset" };

export function nextReachState(
  current: ReachLifecycleState,
  event: ReachLifecycleEvent
): ReachLifecycleState {
  switch (event.type) {
    case "attempt_revealed":
      // stable identity: the same attempt event revealed again (rerender,
      // re-reveal) must not restart the choreography
      if (current.triggeredEventId === event.eventId) return current;
      return { active: true, triggeredEventId: event.eventId };
    case "choreography_complete":
      // latch returns false only on scene-reported completion
      if (!current.active) return current;
      return { active: false, triggeredEventId: current.triggeredEventId };
    case "reset":
      return { active: false, triggeredEventId: null };
  }
}
