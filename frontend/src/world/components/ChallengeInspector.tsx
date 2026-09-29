import { useState } from "react";
import {
  worldApi,
  type ChallengeBoard,
  type ChallengeContribution,
} from "../api";
/**
 * ChallengeInspector — the public board for CHALLENGE-001.
 *
 * Read-only: no tokens, no keys, no gated acts. Everything shown is
 * recorded backend data from GET /api/world/challenge/read. Submitted
 * bodies are inert text — quoted for display, never executed.
 *
 * The two-stage distinction is the point:
 *   (a) structural admission (K1-K7) — machine, verifies shape only,
 *       never the truth of any claim;
 *   (b) merit evaluation — the designated evaluator's ACCEPT/DECLINE
 *       with a checkable reason, receiver-signed.
 */
export function ChallengeInspector({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<ChallengeBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await worldApi.challenge();
      setBoard(b);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load the challenge board");
      setLoaded(false);
    } finally {
      setBusy(false);
    }
  };

  const rc = (k: string, v: React.ReactNode) => (
    <div className="row" key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
  const short = (id: string | null | undefined) =>
    id ? `${id.slice(0, 12)}…` : "—";
  const decisionFor = (c: ChallengeContribution) =>
    board?.decisions.find((d) => d.contribution_id === c.contribution_id);
  const titleFor = (id: string) =>
    board?.contributions.find((c) => c.contribution_id === id)?.title ?? "—";
  const reviews = (board?.contributions ?? []).filter((c) => c.kind === "review");

  return (
    <div className="drawer" role="dialog" aria-label="Challenge board inspector">
      <div className="drawer-head">
        <strong>Challenge board — CHALLENGE-001</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="drawer-body ri-scroll">
        <p className="verify-note">
          Public, read-only. Submitted patches and tests are inert text —
          displayed, never executed. Structural admission (K1–K7) checks a
          contribution's shape; only the evaluator's signed decision is
          merit. Source: GET /api/world/challenge/read.
        </p>
        <button className="primary" disabled={busy} onClick={load}>
          {busy ? "Loading…" : loaded ? "Reload board" : "Load board"}
        </button>
        {error && <p className="err">{error}</p>}

        {loaded && board && (
          <>
            {/* frozen problem */}
            <section className="world-panel" aria-label="Frozen problem">
              <div className="panel-title">The frozen challenge</div>
              {board.challenges.length === 0 && (
                <p className="fine">No challenge created yet on this server.</p>
              )}
              {board.challenges.map((ch) => (
                <div key={ch.challenge_id}>
                  {rc("Challenge", <code>{ch.challenge_id}</code>)}
                  {rc("Criteria hash", <code>{short(ch.criteria_hash)}</code>)}
                  {rc("Problem sha256", <code>{short(ch.problem_sha256)}</code>)}
                  {rc("Deadline", ch.deadline_iso)}
                  {rc("Evaluator", <code>{ch.owner_participant_id}</code>)}
                  {rc("Created", ch.created_at)}
                  {rc("Create receipt", <code>{short(ch.create_receipt_id)}</code>)}
                </div>
              ))}
              <p className="fine">{board.scope_note}</p>
            </section>

            {/* contributions */}
            <section className="world-panel ri-unverified" aria-label="Contributions">
              <div className="panel-title">Contributions — authorship and standing</div>
              <p className="ri-band">
                Agent-submitted content. Not facts. Admission is structural;
                the evaluator's decision is the merit verdict.
              </p>
              {(board.contributions ?? []).length === 0 && (
                <p className="fine">No contributions yet.</p>
              )}
              {(board.contributions ?? []).map((c) => {
                const d = decisionFor(c);
                return (
                  <div key={c.contribution_id} className="ri-dispatch">
                    <div className="row">
                      <span className="k">Contribution</span>
                      <code className="v">{c.contribution_id}</code>
                    </div>
                    <p>
                      <span className={`badge ${c.status === "accepted" ? "ok" : c.status === "declined" ? "no" : ""}`}>
                        {c.status}
                      </span>{" "}
                      <strong>{c.title}</strong>{" "}
                      <span className="fine">({c.kind}, by {c.display_name})</span>
                    </p>
                    <pre className="fine" style={{ whiteSpace: "pre-wrap" }}>{c.body}</pre>
                    <p className="fine">
                      Author: <code>{c.participant_id}</code> · sha256{" "}
                      <code>{short(c.body_sha256)}</code> · admission{" "}
                      <code>{c.acceptance.verdict}</code> · gate receipt{" "}
                      <code>{short(c.gate_receipt_id)}</code>
                      {c.references && (
                        <> · reviews <code>{c.references}</code></>
                      )}
                      {!c.original && c.derived_from.length > 0 && (
                        <> · derived from {c.derived_from.join(", ")}</>
                      )}
                    </p>
                    {d ? (
                      <p className="fine">
                        Evaluator <code>{d.evaluator_id}</code>:{" "}
                        <span className={`badge ${d.decision === "ACCEPT" ? "ok" : "no"}`}>
                          {d.decision}
                        </span>{" "}
                        — {d.reason}{" "}
                        <span className="fine">(receipt {short(d.gate_receipt_id)})</span>
                      </p>
                    ) : (
                      <p className="fine">Awaiting evaluator decision.</p>
                    )}
                    {(c.builds_on ?? []).length > 0 && (
                      <p className="fine">
                        Reuse chain:{" "}
                        {(c.builds_on ?? []).map((b) => (
                          <span key={b.contribution_id}>
                            builds on <code>{b.contribution_id}</code> —{" "}
                            {titleFor(b.contribution_id)} ·{" "}
                            <span className="fine">{b.what_reused}</span>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>

            {/* reviews with visible credit */}
            <section className="world-panel" aria-label="Reviews">
              <div className="panel-title">Reviews — visible credit</div>
              <p className="fine">
                Reviews of other contributions earn credit here whether or
                not the reviewed work is accepted. Negative findings are
                credit too.
              </p>
              {reviews.length === 0 && (
                <p className="fine">No reviews yet.</p>
              )}
              {reviews.map((r) => {
                const d = decisionFor(r);
                return (
                  <div key={r.contribution_id}>
                    {rc(
                      r.contribution_id,
                      <span>
                        <strong>{r.title}</strong> by {r.display_name} —{" "}
                        {d ? (
                          <span>
                            evaluator <code>{d.decision}</code>: {d.reason}
                          </span>
                        ) : (
                          "awaiting evaluator decision"
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </section>

            {/* correction and reassessment — the continuous record */}
            <section className="world-panel" aria-label="Correction and reassessment">
              <div className="panel-title">Correction and reassessment — one continuous record</div>
              <p className="fine">
                Accepted contributions are linked as claim nodes with
                dependency edges (the recorded reuse chain, in graph form).
                An evaluator-signed correction then propagates through the
                existing rules: the corrected source's claims are exposed,
                recorded dependents are reassessed, and the original bytes
                and the evaluator's decisions stay on the record, unchanged.
              </p>
              {(!board.cascade ||
                (board.cascade.reports.length === 0 && board.cascade.events.length === 0)) && (
                <p className="fine">No claim linkage or correction events recorded yet.</p>
              )}
              {board.cascade?.events.map((e) => (
                <div key={e.event_id} className="ri-dispatch">
                  <div className="row">
                    <span className="k">Correction event</span>
                    <code className="v">{short(e.event_id)}</code>
                  </div>
                  <p className="fine">
                    <span className="badge no">{e.status}</span>{" "}
                    asserted by <code>{e.asserted_by}</code> · {e.effective_at}
                    {e.replayed && <span className="fine"> (replayed)</span>}
                  </p>
                  <p className="fine">{e.reason}</p>
                  {(e.affected ?? []).map((a) => (
                    <p className="fine" key={a.source_id}>
                      corrected: <code>{a.contribution_id ?? a.source_id}</code>{" "}
                      — {a.label}
                    </p>
                  ))}
                </div>
              ))}
              {board.cascade?.reports.map((r) => (
                <div key={r.report_id} className="ri-dispatch">
                  <div className="row">
                    <span className="k">Claim report</span>
                    <code className="v">{r.report_id}</code>
                  </div>
                  <p className="fine"><strong>{r.title}</strong></p>
                  {(r.claims ?? []).map((cl) => (
                    <p className="fine" key={cl.claim_id}>
                      <code>{cl.contribution_id ?? "—"}</code> · {cl.kind}:{" "}
                      {cl.text}{" "}
                      <span className={`badge ${cl.standing ? (cl.standing.classification === "UNAFFECTED" ? "ok" : "no") : ""}`}>
                        {cl.standing ? cl.standing.classification : "not yet assessed"}
                      </span>
                      {cl.standing?.reason && (
                        <span className="fine"> — {cl.standing.reason}</span>
                      )}
                    </p>
                  ))}
                  {(r.relations ?? []).map((rel) => (
                    <p className="fine" key={rel.relation_id}>
                      dependency: <code>{rel.from_claim_id.slice(0, 8)}…</code>{" "}
                      {rel.relation}{" "}
                      <code>{rel.to_claim_id.slice(0, 8)}…</code>{" "}
                      <span className="fine">({rel.authority})</span>
                    </p>
                  ))}
                </div>
              ))}
              {board.cascade?.preservation && (
                <p className="fine">{board.cascade.preservation}</p>
              )}
            </section>

            {/* refusal ledger */}
            <section className="world-panel ri-testcontrol" aria-label="Refusal ledger">
              <div className="panel-title">Refusal ledger — named reasons</div>
              <p className="fine">
                Refusals are supporting evidence, not an embarrassment: each
                one is a signed receiver verdict with a named reason, part of
                the same continuous record as the acceptances and the
                corrections above.
              </p>
              {(board.refusals ?? []).length === 0 && (
                <p className="fine">No refusals recorded.</p>
              )}
              {(board.refusals ?? []).map((r) => (
                <div key={r.refusal_id}>
                  {rc(
                    r.refusal_id,
                    <span>
                      <code>{r.participant_id ?? "—"}</code>{" "}
                      <span className="fine">· {(r.reason_codes ?? []).join(", ")}</span>
                      {r.note && <span className="fine"> — {r.note}</span>}
                    </span>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
