/**
 * Session-safe snapshot commit guard (WORLD-AUTHORITY-001 defect 3, pass 2).
 *
 * A delayed snapshot from a previous backend session (or an out-of-order
 * older response) must never overwrite current checkpoint state. The guard
 * is threefold — generation, session identity, monotonic checkpoint count —
 * plus the task_id must match the currently rendered job.
 *
 * No new event kind, no second ledger: it reuses the snapshot's existing
 * `session` identity and the revealed event ordering.
 */

export interface SnapshotCommitState {
  generation: number;
  session: string | null;
  checkpointCount: number;
}

export interface SnapshotResponse {
  generation: number;
  session: string;
  checkpointCount: number;
  taskId: string;
}

/**
 * Pure commit decision: may this snapshot response be committed?
 * - generation must equal the current generation (reset increments it;
 *   a delayed pre-reset response carries the old generation)
 * - task_id must match the currently rendered job
 * - session must match the committed session, if one is committed
 *   (a delayed prior-session response carries the old session)
 * - checkpoint count must not go backwards within a session
 *   (an older same-session response must not overwrite newer state)
 */
export function shouldCommitSnapshot(
  state: SnapshotCommitState,
  response: SnapshotResponse,
  currentJobId: string | null
): boolean {
  if (response.generation !== state.generation) return false;
  if (currentJobId !== null && response.taskId !== currentJobId) return false;
  if (state.session !== null && response.session !== state.session) return false;
  if (response.checkpointCount < state.checkpointCount) return false;
  return true;
}

/** Checkpoint visibility: a checkpoint renders only once its causal
 *  receipt seq has been revealed. Current backend state must never leak
 *  future progress into an earlier replay frame. */
export function visibleCheckpoints<T extends { seq: number }>(
  checkpoints: T[],
  maxRevealedSeq: number
): T[] {
  return checkpoints.filter((c) => c.seq <= maxRevealedSeq);
}
