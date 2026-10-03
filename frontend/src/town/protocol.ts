/**
 * Town -> parent navigation protocol (child side).
 * frontend/src/town/protocol.ts
 *
 * The town lives in an opaque-origin sandboxed iframe. Its ONLY channel to
 * the parent is this single intent. The parent validates every message by
 * exact shape AND by source frame, and ignores everything else.
 *
 * Mirror: the parent re-implements the same 5-line shape check in
 * src/square/SquareHost.tsx (duplicated deliberately — no shared module
 * crosses the frame boundary).
 */

export const NAVIGATE_TYPE = "openline:navigate";
export const ENTER_WORKSHOP = "enter-workshop";

export interface NavigateMessage {
  type: typeof NAVIGATE_TYPE;
  intent: typeof ENTER_WORKSHOP;
}

/** Request the parent to open the workshop. Fire-and-forget: the child
 *  never waits for, reads, or depends on any reply. */
export function requestEnterWorkshop(): void {
  const msg: NavigateMessage = { type: NAVIGATE_TYPE, intent: ENTER_WORKSHOP };
  // '*': the parent is same-origin here in dev but the child must not
  // assume anything about it. The parent binds by source frame, not origin.
  window.parent.postMessage(msg, "*");
}
