import { useState } from "react";
import {
  worldApi,
  agentApi,
  type Delegation,
  type NewsroomDispatch,
  type WorldEvent,
  type WorldReceipt,
} from "../api";

/**
 * ResearchInspector — the owner's view of one bounded external-agent
 * research session. Every row cites its source: a receipt id, a dispatch
 * id, a backend endpoint, or the harness ledger (owner-side files the
 * browser cannot read). Nothing is invented.
 *
 * The three-way distinction is the point:
 *   (ii)  model output — UNVERIFIED agent-submitted content
 *   (iii) receiver decisions — SIGNED gate receipts
 *   (iv)  confirmed effects — what ALLOWED verdicts actually recorded
 */
export function ResearchInspector({
  onClose,
  events,
}: {
  onClose: () => void;
  events: WorldEvent[];
}) {
  const [participantId, setParticipantId] = useState("research-desk");
  const [token, setToken] = useState("");
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delegation, setDelegation] = useState<Delegation | null>(null);
  const [receipts, setReceipts] = useState<WorldReceipt[]>([]);
  const [dispatches, setDispatches] = useState<NewsroomDispatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const pid = participantId.trim();
      const [d, r, n] = await Promise.all([
        agentApi.delegation(pid, token),
        worldApi.receipts(pid, token),
        worldApi.newsroom(),
      ]);
      setDelegation(d.delegation);
      setReceipts(r.receipts ?? []);
      setDispatches(
        (n.dispatches ?? []).filter(
          (x) => x.imported_by === `world:participant:${pid}`
        )
      );
      setLoaded(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "could not load the session"
      );
      setLoaded(false);
    } finally {
      setBusy(false);
    }
  };

  /** The receipt id is the first 16 chars of the gate's signature value —
   *  the same derivation the backend uses (_receipt_id) and the one
   *  SharedWorld's receiptIdOf documents. Derived locally from the signed
   *  record, never invented: a receipt without a signature has no id here. */
  const receiptIdOf = (r: WorldReceipt): string | null => {
    if (r.receipt_id) return r.receipt_id;
    const sig = r.signature as { value?: unknown } | undefined;
    const value = sig && typeof sig.value === "string" ? sig.value : "";
    return value ? value.slice(0, 16) : null;
  };
  const short = (id: string | undefined) =>
    id ? `${id.slice(0, 12)}…` : "—";
  const shortReceipt = (r: WorldReceipt | undefined) =>
    short(r ? receiptIdOf(r) ?? undefined : undefined);
  const testControl = receipts.find((r) => r.action === "claimgraph.correct");
  const revokedReceipt = receipts.find((r) =>
    (r.reason_codes ?? []).includes("MANDATE_REVOKED")
  );
  const allowedFor = (action: string) =>
    receipts.find((r) => r.action === action && r.decision === "ALLOWED");
  // Public revocation event for this run (the demo backend holds one run).
  const revocationEvent = [...events]
    .reverse()
    .find((e) => e.kind === "revocation" && e.summary.includes("revoked their agent"));
  const rc = (k: string, v: React.ReactNode) => (
    <div className="row" key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );

  return (
    <div className="drawer" role="dialog" aria-label="Research session inspector">
      <div className="drawer-head">
        <strong>Research session — external agent</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="drawer-body ri-scroll">
        <p className="verify-note">
          The owner's view of one bounded research run. Every row cites its
          source. The agent's words are never presented as facts; the
          receiver's signed receipts are never presented as the agent's claims.
        </p>

        <div className="ri-connect">
          <label>
            Participant id
            <input
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            Agent session token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste the harness session token"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label>
            Run id <span className="fine">(optional — locates owner-side files)</span>
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="e.g. 20260926T233231Z"
              spellCheck={false}
            />
          </label>
          <button className="primary" disabled={busy || !token.trim()} onClick={load}>
            {busy ? "Loading…" : loaded ? "Reload" : "Load session"}
          </button>
          {error && <p className="err">{error}</p>}
        </div>

        {loaded && (
          <>
            {/* (i) delegation bounds */}
            <section className="world-panel" aria-label="Delegation bounds">
              <div className="panel-title">(i) Delegation bounds — the owner's limits</div>
              {delegation ? (
                <div>
                  {rc("Goal", delegation.goal)}
                  {rc("Permitted actions", delegation.permitted_actions.join(", "))}
                  {rc("Permitted resources", delegation.permitted_resources.join(", ") || "—")}
                  {rc("Spending limit", `${delegation.spent ?? 0} / ${delegation.spending_limit}`)}
                  {rc("Work limit", `${delegation.actions_count ?? 0} / ${delegation.work_limit}`)}
                  {rc("Review conditions", Object.entries(delegation.review_conditions ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—")}
                  {rc("Status", delegation.status ?? "—")}
                  <p className="fine">Source: GET /api/world/delegation — the owner-set bounds the agent had to stay inside.</p>
                </div>
              ) : (
                <p className="fine">No delegation on record for this participant.</p>
              )}
            </section>

            {/* (ii) model output — UNVERIFIED */}
            <section className="world-panel ri-unverified" aria-label="Model output, unverified">
              <div className="panel-title">(ii) Model output — UNVERIFIED</div>
              <p className="ri-band">Agent-submitted content. Not a fact. Not a receiver decision.</p>
              {dispatches.length === 0 && (
                <p className="fine">No agent-imported dispatches found for this participant.</p>
              )}
              {dispatches.map((d) => (
                <div key={d.dispatch_id} className="ri-dispatch">
                  <div className="row"><span className="k">Dispatch</span><code className="v">{short(d.dispatch_id)}</code></div>
                  <p><strong>{d.title}</strong></p>
                  <p className="fine">{d.body}</p>
                  <p className="fine">
                    Source: newsroom dispatch {short(d.dispatch_id)} (imported_by {d.imported_by}).
                    The desk admits only its fixture article's bytes — this is the fixture
                    article, imported by the agent. The research report itself is private
                    to the owner, never published here.
                  </p>
                </div>
              ))}
            </section>

            {/* (iii) receiver decisions — SIGNED */}
            <section className="world-panel" aria-label="Receiver decisions, signed">
              <div className="panel-title">(iii) Receiver decisions — SIGNED</div>
              <p className="fine">
                Signed by the participant's own receiver gate. Private to the agent
                session — shown here because this is the owner's demo and you hold
                the session token. Source: GET /api/world/receipts.
              </p>
              <ul className="sq-list">
                {receipts.map((r, i) => (
                  <li key={receiptIdOf(r) ?? i}>
                    <span className={`badge ${r.decision === "ALLOWED" ? "ok" : r.decision === "STOPPED" ? "no" : ""}`}>
                      {r.decision}
                    </span>{" "}
                    <code>{r.action}</code>{" "}
                    <span className="fine">receipt {shortReceipt(r)}</span>{" "}
                    {(r.reason_codes ?? []).length > 0 && (
                      <span className="fine">· {(r.reason_codes ?? []).join(", ")}</span>
                    )}
                  </li>
                ))}
                {receipts.length === 0 && <li className="fine">No receipts.</li>}
              </ul>
            </section>

            {/* (iv) confirmed effects */}
            <section className="world-panel" aria-label="Confirmed effects">
              <div className="panel-title">(iv) Confirmed effects — what ALLOWED verdicts actually recorded</div>
              <ul className="sq-list">
                <li>
                  Newsroom intake dispatch:{" "}
                  {dispatches.length > 0 ? <code>{short(dispatches[0].dispatch_id)}</code> : "—"}{" "}
                  <span className="fine">(source: newsroom data)</span>
                </li>
                <li>
                  Research notes recorded:{" "}
                  {allowedFor("notes.write") ? <span>receipt <code>{shortReceipt(allowedFor("notes.write"))}</code></span> : "—"}{" "}
                  <span className="fine">(source: signed receipt; the note file is owner-side)</span>
                </li>
                <li>
                  Report recorded:{" "}
                  {allowedFor("draft.write") ? <span>receipt <code>{shortReceipt(allowedFor("draft.write"))}</code></span> : "—"}{" "}
                  <span className="fine">
                    (source: signed receipt; the file is owner-side
                    {runId.trim() ? <>: <code>research/report-{runId.trim()}.md</code></> : " — give the run id above to locate it"})
                  </span>
                </li>
                <li>
                  Evaluation verdict per criterion:{" "}
                  <span className="fine">
                    owner-side record, not browser-verifiable
                    {runId.trim() ? <>: <code>research/evaluation-{runId.trim()}.json</code></> : " — give the run id above to locate it"}
                    {" "}(C1–C5, deterministic, no model)
                  </span>
                </li>
              </ul>
            </section>

            {/* (v) TEST CONTROL refusal */}
            <section className="world-panel ri-testcontrol" aria-label="Test control refusal">
              <div className="panel-title">(v) TEST CONTROL refusal — refused BEFORE any effect</div>
              {testControl ? (
                <div>
                  <p>
                    <span className="badge no">{testControl.decision}</span>{" "}
                    <code>{testControl.action}</code>{" "}
                    <span className="fine">receipt {shortReceipt(testControl)}</span>
                  </p>
                  <p className="fine">
                    Reason: {(testControl.reason_codes ?? []).join(", ") || "—"}.
                    The gate evaluated the exact action against the live mandate;
                    the scope was never granted, so nothing was appended and no
                    effect followed. Source: signed receipt {shortReceipt(testControl)}.
                  </p>
                </div>
              ) : (
                <p className="fine">No TEST CONTROL receipt found in this session.</p>
              )}
            </section>

            {/* (vi) revocation state */}
            <section className="world-panel" aria-label="Revocation state">
              <div className="panel-title">(vi) Revocation state</div>
              {revokedReceipt ? (
                <div>
                  <p>
                    <span className="badge no">{revokedReceipt.decision}</span>{" "}
                    <code>{revokedReceipt.action}</code> after revocation{" "}
                    <span className="fine">receipt {shortReceipt(revokedReceipt)}</span>
                  </p>
                  <p className="fine">
                    Reason: {(revokedReceipt.reason_codes ?? []).join(", ")}.
                    The mandate was revoked; the NEXT gated action was STOPPED.
                    Completed receipts stand as records. Source: signed receipt{" "}
                    {shortReceipt(revokedReceipt)}.
                  </p>
                </div>
              ) : (
                <p className="fine">No post-revocation STOPPED receipt in this session.</p>
              )}
              {revocationEvent && (
                <p className="fine">Public feed: “{revocationEvent.summary}”</p>
              )}
              {delegation?.status && (
                <p className="fine">Delegation status on record: {delegation.status}.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
