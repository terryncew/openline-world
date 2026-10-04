/**
 * Shared interpretation for explicit unadmitted proposals
 * (WORLD-AUTHORITY-001 CP3 §6).
 *
 * If a proposal is explicitly unadmitted — decision_requested=false on the
 * event, or unadmitted=true structurally — then it must:
 * - remain on the side table
 * - never enter ProposalPackets gate travel
 * - never enter ReceiverGate decision visuals
 * - never trigger a gate closeup
 * - never create receipt/effect visuals
 *
 * Ordinary proposals remain unchanged. Used by both AuthorityDemoView and
 * the generic VizView so the interpretation is identical everywhere.
 */

export interface ProposalLike {
  unadmitted?: boolean;
  decisionRequested?: boolean;
}

export interface ProposalVisibility {
  /** rest on the side table, ambient */
  sideTable: boolean;
  /** may travel the ProposalPackets gate path */
  gateTravel: boolean;
  /** may appear in ReceiverGate decision visuals */
  gateDecision: boolean;
  /** may trigger the gate camera closeup */
  gateCloseup: boolean;
}

const ADMITTED: ProposalVisibility = {
  sideTable: false,
  gateTravel: true,
  gateDecision: true,
  gateCloseup: true,
};

const UNADMITTED: ProposalVisibility = {
  sideTable: true,
  gateTravel: false,
  gateDecision: false,
  gateCloseup: false,
};

/** A proposal is explicitly unadmitted when the backend encoded
 *  decision_requested=false, or when the reducer structurally marked it
 *  unadmitted. */
export function isExplicitlyUnadmitted(p: ProposalLike): boolean {
  return p.unadmitted === true || p.decisionRequested === false;
}

export function proposalVisibility(p: ProposalLike): ProposalVisibility {
  return isExplicitlyUnadmitted(p) ? UNADMITTED : ADMITTED;
}
