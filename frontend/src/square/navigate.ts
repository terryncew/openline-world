/**
 * Navigation intent validator (parent side).
 * frontend/src/square/navigate.ts
 *
 * Dependency-free by design: the unit test imports this module directly
 * without pulling React or the viz tree. The mirror of this check lives
 * in src/town/protocol.ts, duplicated deliberately — no shared module
 * crosses the frame boundary.
 */

export const NAVIGATE_TYPE = "openline:navigate";
export const ENTER_WORKSHOP = "enter-workshop";

export interface NavigateMessage {
  type: typeof NAVIGATE_TYPE;
  intent: typeof ENTER_WORKSHOP;
}

/**
 * Strict shape check: exactly two keys, exact values. Extra fields fail,
 * wrong types fail, case/whitespace variants fail. The caller must ALSO
 * bind by source frame (ev.source === iframe.contentWindow) — shape
 * alone is never sufficient.
 */
export function isNavigateMessage(data: unknown): data is NavigateMessage {
  if (typeof data !== "object" || data === null) return false;
  const keys = Object.keys(data);
  if (keys.length !== 2) return false;
  const d = data as Record<string, unknown>;
  return d.type === NAVIGATE_TYPE && d.intent === ENTER_WORKSHOP;
}
