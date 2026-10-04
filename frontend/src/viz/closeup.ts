/**
 * Camera close-up decisions for WORLD-AUTHORITY-001 (defect 6, pass 2).
 *
 * An explicitly unadmitted proposal (decision_requested=false) is ambient:
 * it appears on the side table and never takes the camera. Ordinary
 * proposals and decisions still select the gate close-up; a replacement
 * onboarding still selects the replacement close-up.
 */
import type { WEvent } from "./protocol.ts";
import { isReplacementOnboard } from "./pacing.ts";

export type CloseupKind = "gate" | "replacement" | null;

export function closeupFor(
  revealed: WEvent[],
  last: (WEvent & { detail?: Record<string, unknown> }) | undefined
): CloseupKind {
  if (!last) return null;
  if (last.kind === "mandate") {
    const st = last.detail?.status;
    if (st !== "REVOKED" && isReplacementOnboard(last, revealed))
      return "replacement";
    return null;
  }
  if (last.kind === "proposal") {
    if (last.detail?.decision_requested === false) return null;
    return "gate";
  }
  if (last.kind === "decision") return "gate";
  return null;
}
