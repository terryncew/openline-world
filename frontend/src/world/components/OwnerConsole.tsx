/**
 * OwnerConsole — frontend/src/world/components/OwnerConsole.tsx
 *
 * The owner's control surface for their own agent's operating model: a
 * compact panel reachable from anywhere WITHOUT walking — a fixed
 * overlay/drawer, phone-friendly. It owns nothing the backend doesn't:
 * every value shown comes from GET /delegation, GET /escalations, or the
 * world state the parent polls every 3 seconds. When the backend build
 * predates the Track A contract, the console says so plainly instead of
 * inventing a delegation.
 *
 * Sections:
 *   · delegation state — active / paused / awaiting owner (icon + text +
 *     shape, never color alone), derived from the backend's own status when
 *     it names one, else from paused + pending escalations.
 *   · set/edit delegation — goal text, permitted-action checkboxes from
 *     the three supported task kinds (tidy-notes, summarize, draft),
 *     permitted resources, spending/work limits, review-condition toggles.
 *   · pause / resume — POST /agent/pause.
 *   · redirect — edit the goal and re-authorize (a new delegation).
 *   · revoke — the existing control, verbatim; revoking ends everything.
 *   · escalations inbox — pending escalations with plain-language reasons
 *     and Approve / Deny buttons.
 *
 * Quiet world: when the owner has no delegation on record, the automation
 * section carries the honest empty-state note: "No agents have authorized
 * work right now." Nothing here implies model inference — Track A is
 * deterministic automation, and the copy says so.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentApi,
  escalationsApi,
  BackendTooOld,
  TASK_KINDS,
  REVIEW_CONDITION_LABELS,
  WORKER_STATE_LABELS,
  type Delegation,
  type DelegationInput,
  type Escalation,
  type WorkerState,
} from "../api";

export interface OwnerCreds {
  participant_id: string;
  token: string;
}

interface OwnerConsoleProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** the owner's own credentials; null = not joined — the console says so */
  creds: OwnerCreds | null;
  ownerName: string;
  agentName: string;
  revoked: boolean;
  onRevoke: () => Promise<void>;
  /** increments on every 3s backend poll — the console refreshes with it */
  pollTick: number;
  /** the session's owner pause switch, from world state (the delegation
   *  summary does not carry it) */
  paused?: boolean | null;
  /** Track A's worker stop-condition state for this session, from world
   *  state — rendered verbatim */
  workerState?: WorkerState | null;
  /** quiet notice that an agreement the owner is party to moved while the
   *  owner looked elsewhere — extends the FAB flag mechanism used for
   *  escalations; null = nothing to flag */
  workerNotice?: string | null;
  cue: (kind: "ui" | "allow" | "refuse" | "paper" | "stamp" | "arrive" | "depart", text: string) => void;
  note: (text: string) => void;
}

type DelegationState = "active" | "paused" | "awaiting owner" | "complete" | "revoked";

/** Review conditions the console offers to POST /delegate. Keys are the
 *  backend's vocabulary (anything else is rejected) — labels are plain
 *  language for what the worker escalates. Whatever the backend returns
 *  is rendered with the same labels. */
const REVIEW_TOGGLES: { key: string; label: string }[] =
  Object.entries(REVIEW_CONDITION_LABELS).map(([key, label]) => ({ key, label }));

const KIND_LABELS: Record<string, string> = {
  "tidy-notes": "Tidy notes",
  summarize: "Summarize",
  draft: "Draft",
};

function DelegationChip({ state }: { state: DelegationState }) {
  // icon + text + shape, never color alone
  const icon = state === "active" ? "●" : state === "paused" ? "❚❚" : state === "awaiting owner" ? "⚑" : state === "complete" ? "✓" : "✕";
  return (
    <span className={`dstate dstate-${state.replace(" ", "-")}`} role="status" aria-label={`Delegation: ${state}`}>
      <span aria-hidden="true">{icon}</span> {state}
    </span>
  );
}

export function OwnerConsole(p: OwnerConsoleProps) {
  const [delegation, setDelegation] = useState<Delegation | null | undefined>(undefined);
  const [delegationMissing, setDelegationMissing] = useState(false);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [escalationsMissing, setEscalationsMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DelegationInput>({
    goal: "",
    permitted_actions: [],
    permitted_resources: [],
    spending_limit: 5,
    work_limit: 10,
    review_conditions: { new_counterpart: true, over_spending: false },
  });
  const [resourcesText, setResourcesText] = useState("");
  const [resolveNote, setResolveNote] = useState<Record<string, string>>({});
  const lastTick = useRef(-1);

  const loadDelegation = useCallback(async () => {
    if (!p.creds || delegationMissing) return;
    try {
      const d = await agentApi.delegation(p.creds.participant_id, p.creds.token);
      setDelegation(d.delegation);
    } catch (e) {
      if (e instanceof BackendTooOld) setDelegationMissing(true);
      else setDelegation(null); // a transient failure reads as "none on record" until the next tick
    }
  }, [p.creds, delegationMissing]);

  const loadEscalations = useCallback(async () => {
    if (!p.creds || escalationsMissing) return;
    try {
      const d = await escalationsApi.list(p.creds.participant_id, p.creds.token);
      setEscalations(d.escalations);
    } catch (e) {
      if (e instanceof BackendTooOld) setEscalationsMissing(true);
    }
  }, [p.creds, escalationsMissing]);

  // Refresh with the parent's 3s poll tick — worker-driven changes appear
  // when the backend reports them. A build that 404s is remembered as
  // missing so the console stops asking.
  useEffect(() => {
    if (p.pollTick === lastTick.current || !p.creds) return;
    lastTick.current = p.pollTick;
    void loadDelegation();
    void loadEscalations();
  }, [p.pollTick, p.creds, loadDelegation, loadEscalations]);

  // Load immediately when credentials arrive (the drawer may open before
  // the next poll tick).
  useEffect(() => {
    if (!p.creds) { setDelegation(undefined); setEscalations([]); return; }
    void loadDelegation();
    void loadEscalations();
  }, [p.creds, loadDelegation, loadEscalations]);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]);

  const pending = escalations.filter((e) => (e.status || "").toLowerCase() === "pending");
  const resolved = escalations.filter((e) => (e.status || "").toLowerCase() !== "pending");

  // The owner pause switch lives on the session, not the delegation
  // summary — the parent feeds it from world state. A just-toggled value
  // wins until the next poll tick brings the backend's word.
  const [pausedOverride, setPausedOverride] = useState<boolean | null>(null);
  useEffect(() => { setPausedOverride(null); }, [p.pollTick]);
  const pausedNow = pausedOverride ?? p.paused ?? false;

  const delegationState: DelegationState | null = (() => {
    if (!delegation) return null;
    const named = (delegation.status || "").toLowerCase();
    if (named === "complete") return "complete";
    if (named === "revoked") return "revoked";
    if (named === "paused" || pausedNow) return "paused";
    // the backend keeps status "active" while an escalation pends — the
    // pending owner decision is the state the UI must show. The worker
    // waits quietly: no repeated requests, no spending, no side effects.
    if (pending.length > 0) return "awaiting owner";
    if (named === "active") return "active";
    return "active";
  })();

  const startEdit = useCallback((from?: Delegation | null) => {
    const base: DelegationInput = from
      ? {
          goal: from.goal ?? "",
          permitted_actions: [...(from.permitted_actions ?? [])],
          permitted_resources: [...(from.permitted_resources ?? [])],
          spending_limit: from.spending_limit ?? 5,
          work_limit: from.work_limit ?? 10,
          review_conditions: { ...(from.review_conditions ?? {}) },
        }
      : {
          goal: "",
          permitted_actions: [],
          permitted_resources: [],
          spending_limit: 5,
          work_limit: 10,
          review_conditions: { new_counterpart: true, over_spending: false },
        };
    // keep the known toggles present so the checkboxes bind
    for (const t of REVIEW_TOGGLES) {
      if (!(t.key in base.review_conditions)) base.review_conditions[t.key] = false;
    }
    setForm(base);
    setResourcesText(base.permitted_resources.join(", "));
    setEditing(true);
    p.cue("ui", "delegation form — soft tap");
  }, [p]);

  const toggleAction = (kind: string) => {
    setForm((f) => ({
      ...f,
      permitted_actions: f.permitted_actions.includes(kind)
        ? f.permitted_actions.filter((a) => a !== kind)
        : [...f.permitted_actions, kind],
    }));
  };

  const submitDelegation = useCallback(async () => {
    if (!p.creds) return;
    const goal = form.goal.trim();
    if (!goal) { p.note("A delegation needs a goal — write what the agent should do."); return; }
    if (form.permitted_actions.length === 0) { p.note("Pick at least one permitted action — tidy notes, summarize, or draft."); return; }
    const resources = resourcesText.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy("delegate");
    try {
      const r = await agentApi.delegate(p.creds.participant_id, p.creds.token, {
        ...form,
        goal,
        permitted_resources: resources,
      });
      setDelegation(r.delegation);
      setEditing(false);
      p.cue("stamp", "delegation recorded — deep stamp");
      p.note(`${p.agentName} now has a delegation: “${goal.slice(0, 60)}${goal.length > 60 ? "…" : ""}”. Deterministic automation only — nothing inferred.`);
    } catch (e) {
      p.note(`Delegation failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [p, form, resourcesText]);

  const togglePause = useCallback(async () => {
    if (!p.creds || !delegation) return;
    const next = !pausedNow;
    setBusy("pause");
    try {
      const r = await agentApi.pause(p.creds.participant_id, p.creds.token, next);
      setPausedOverride(r.paused);
      p.cue("ui", next ? "agent paused — soft tap" : "agent resumed — soft tap");
      p.note(next ? `${p.agentName} is paused — the automation stops issuing work.` : `${p.agentName} resumed.`);
    } catch (e) {
      p.note(`Pause failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [p, delegation, pausedNow]);

  /** Return the session to manual mode: the worker stops stepping, the
   *  delegation stays on record. Re-delegating re-arms automation. */
  const returnToManual = useCallback(async () => {
    if (!p.creds || !delegation) return;
    setBusy("manual");
    try {
      const r = await agentApi.setActivityMode(p.creds.participant_id, p.creds.token, "manual");
      p.cue("ui", "back to manual — soft tap");
      p.note(`${p.agentName} is back to manual — the worker stopped. The delegation stays on record; re-delegate to re-arm. (mode: ${r.activity_mode ?? "unavailable"})`);
      await loadDelegation();
    } catch (e) {
      p.note(`Return to manual failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [p, delegation, loadDelegation]);

  const resolveEscalation = useCallback(async (esc: Escalation, decision: "approve" | "deny") => {
    if (!p.creds) return;
    setBusy(`resolve:${esc.id}`);
    try {
      await escalationsApi.resolve(p.creds.participant_id, p.creds.token, esc.id, decision, resolveNote[esc.id]);
      p.cue(decision === "approve" ? "allow" : "refuse", `escalation ${decision}d — ${decision === "approve" ? "warm pluck" : "low thud"}`);
      p.note(`Escalation ${decision === "approve" ? "approved" : "denied"}: “${esc.proposed_action?.label ?? esc.id}”.`);
      await loadEscalations();
      await loadDelegation();
    } catch (e) {
      p.note(`Resolve failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [p, resolveNote, loadEscalations, loadDelegation]);

  const doRevoke = useCallback(async () => {
    setBusy("revoke");
    try {
      await p.onRevoke();
      setDelegation(null);
      setEscalations([]);
    } finally {
      setBusy(null);
    }
  }, [p]);

  const pendingCount = pending.length;

  return (
    <>
      <button
        className="oc-fab"
        onClick={() => { p.cue("ui", "owner console — soft tap"); p.onOpen(); }}
        aria-label={`Owner console${pendingCount > 0 ? ` — ${pendingCount} escalation${pendingCount === 1 ? "" : "s"} awaiting you` : ""}${p.workerNotice ? ` — ${p.workerNotice}` : ""}`}
      >
        Owner console
        {pendingCount > 0 && (
          <span className="oc-fab-flag" aria-hidden="true">⚑ {pendingCount}</span>
        )}
        {p.workerNotice && (
          <span className="oc-fab-flag oc-fab-moved" aria-hidden="true" title={p.workerNotice}>✦</span>
        )}
      </button>

      {p.open && (
        <div className="oc-veil" onClick={p.onClose}>
          <div
            className="oc-drawer"
            role="dialog"
            aria-label={`Owner console — ${p.agentName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="oc-head">
              <div>
                <div className="panel-title">Owner console — {p.ownerName}</div>
                <p className="fine">
                  Your agent: <strong>{p.agentName}</strong> · {p.revoked
                    ? "mandate revoked — standing down until you set a new delegation."
                    : delegationMissing
                      ? "no delegation contract on this backend build — it does nothing without your explicit instruction."
                      : delegation
                        ? "deterministic automation, bounded by your delegation."
                        : "no active delegation — it does nothing without your explicit instruction."}
                </p>
              </div>
              <button className="oc-close" onClick={p.onClose} aria-label="Close owner console">×</button>
            </div>

            {!p.creds ? (
              <p className="fine">You have not joined the world yet — the console controls your own agent. Enter the square first.</p>
            ) : p.revoked ? (
              <p className="fine">{p.agentName} is revoked — the delegation ended with it. Rejoin to delegate again.</p>
            ) : (
              <>
                {/* development allowance — the delegation, stated as the
                 *  owner's spending allowance. Everything here comes from
                 *  the durable backend delegation summary (spending_limit,
                 *  spent) — no new accounting, no reservation ledger. */}
                <section className="oc-section" aria-label="Development allowance">
                  <div className="oc-row">
                    <span className="oc-label">Development allowance</span>
                    {delegationMissing ? (
                      <span className="fine">not available in this backend build</span>
                    ) : delegation === undefined ? (
                      <span className="fine">checking…</span>
                    ) : delegation && delegationState ? (
                      <DelegationChip state={delegationState} />
                    ) : (
                      <span className="fine">none on record</span>
                    )}
                  </div>
                  {delegation && (
                    <>
                      <dl className="oc-facts">
                        <div><dt>Goal</dt><dd>{delegation.goal || "—"}</dd></div>
                        <div><dt>Supported tasks</dt><dd>
                          {(delegation.permitted_actions ?? []).map((a) => KIND_LABELS[a] ?? a).join(", ") || "—"}{" "}
                          <span className="fine">— the goal is mapped to these task kinds; anything else waits on your clarification.</span>
                        </dd></div>
                        {(delegation.permitted_resources?.length ?? 0) > 0 && (
                          <div><dt>Resources</dt><dd>{delegation.permitted_resources!.join(", ")} <span className="fine">(labels — not enforced)</span></dd></div>
                        )}
                        <div><dt>Allowance</dt><dd>
                          {(delegation.spending_limit ?? 0) - (delegation.spent ?? 0)} of {delegation.spending_limit ?? 0} units available · spent {delegation.spent ?? 0}
                          <span className="fine"> — hard limit, no automatic replenishment; unspent allowance stays available.</span>
                        </dd></div>
                        <div><dt>Limits</dt><dd>
                          work {delegation.actions_count ?? 0} / {delegation.work_limit}
                        </dd></div>
                        {Object.keys(delegation.review_conditions ?? {}).length > 0 && (
                          <div><dt>Needs your review</dt><dd>{Object.entries(delegation.review_conditions).filter(([, v]) => v).map(([k]) => REVIEW_CONDITION_LABELS[k] ?? k).join("; ") || "none enabled"}</dd></div>
                        )}
                        {p.workerState && (
                          <div><dt>Worker</dt><dd>{pausedNow ? WORKER_STATE_LABELS.paused : (WORKER_STATE_LABELS[p.workerState] ?? p.workerState)}</dd></div>
                        )}
                      </dl>
                      <p className="fine">
                        Permission to spend does not grant permission to install capabilities,
                        change acceptance rules, or expand authority.
                      </p>
                      <p className="fine">
                        The receiver decides every consequential action — acceptance is
                        receiver-owned, never the agent's.
                      </p>
                    </>
                  )}
                  {!delegationMissing && !delegation && (
                    <p className="oc-quiet">No agents have authorized work right now.</p>
                  )}
                </section>

                {/* set / edit / redirect */}
                {!editing ? (
                  <div className="oc-btnrow">
                    <button
                      className="primary"
                      disabled={busy !== null || delegationMissing}
                      onClick={() => startEdit(delegation ?? null)}
                    >
                      {delegation ? "Redirect — edit & re-authorize" : "Set delegation"}
                    </button>
                    {delegation && (
                      <>
                        <button disabled={busy !== null} onClick={togglePause}>
                          {busy === "pause" ? "Working…" : pausedNow ? "Resume agent" : "Pause agent"}
                        </button>
                        <button
                          disabled={busy !== null}
                          onClick={returnToManual}
                          title="The worker stops stepping; the delegation stays on record."
                        >
                          {busy === "manual" ? "Working…" : "Return to manual"}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <section className="oc-section oc-form" aria-label="Delegation form">
                    <div className="panel-title">{delegation ? "Redirect — edit the goal, re-authorize" : "Delegate work to your agent"}</div>
                    <label>Goal — what should the agent do?
                      <textarea
                        value={form.goal}
                        onChange={(e) => setForm({ ...form, goal: e.target.value })}
                        maxLength={280}
                        rows={3}
                        placeholder="e.g. Tidy my workbench notes each evening"
                      />
                    </label>
                    <fieldset className="oc-checks">
                      <legend>Permitted actions — the three task kinds the world supports</legend>
                      {TASK_KINDS.map((k) => (
                        <label key={k} className="oc-check">
                          <input
                            type="checkbox"
                            checked={form.permitted_actions.includes(k)}
                            onChange={() => toggleAction(k)}
                          />
                          {KIND_LABELS[k]} <span className="fine mono">{k}</span>
                        </label>
                      ))}
                    </fieldset>
                    <label>Permitted resources <span className="fine">(comma-separated — recorded as labels, not enforced)</span>
                      <input
                        value={resourcesText}
                        onChange={(e) => setResourcesText(e.target.value)}
                        maxLength={200}
                        placeholder="notes, drafts"
                      />
                    </label>
                    <div className="oc-limits">
                      <label>Spending limit <span className="fine">(required — one unit per gate evaluation)</span>
                        <input
                          type="number" min={0}
                          value={form.spending_limit}
                          onChange={(e) => setForm({ ...form, spending_limit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                        />
                      </label>
                      <label>Work limit <span className="fine">(required — max worker steps)</span>
                        <input
                          type="number" min={1} step={1}
                          value={form.work_limit}
                          onChange={(e) => setForm({ ...form, work_limit: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                        />
                      </label>
                    </div>
                    <fieldset className="oc-checks">
                      <legend>Review conditions — when the agent must ask you first</legend>
                      {REVIEW_TOGGLES.map((t) => (
                        <label key={t.key} className="oc-check">
                          <input
                            type="checkbox"
                            checked={!!form.review_conditions[t.key]}
                            onChange={(e) => setForm({ ...form, review_conditions: { ...form.review_conditions, [t.key]: e.target.checked } })}
                          />
                          {t.label}
                        </label>
                      ))}
                    </fieldset>
                    <p className="fine">
                      Deterministic automation only — the agent follows this delegation,
                      it does not improvise. The backend enforces it; this console only records it.
                    </p>
                    <div className="oc-btnrow">
                      <button className="primary" disabled={busy !== null} onClick={submitDelegation}>
                        {busy === "delegate" ? "Recording…" : delegation ? "Re-authorize" : "Authorize delegation"}
                      </button>
                      <button disabled={busy !== null} onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                  </section>
                )}

                {/* escalations inbox */}
                <section className="oc-section" aria-label="Escalations inbox">
                  <div className="oc-row">
                    <span className="oc-label">Escalations inbox</span>
                    {pendingCount > 0 && <span className="oc-flag" role="status">⚑ {pendingCount} awaiting you</span>}
                  </div>
                  {escalationsMissing ? (
                    <p className="fine">Escalations are not available in this backend build.</p>
                  ) : escalations.length === 0 ? (
                    <p className="fine">Nothing waiting — the agent has not asked for a decision.</p>
                  ) : (
                    <ul className="oc-esclist">
                      {pending.map((e) => {
                        // a goal that maps to no supported task waits here —
                        // an out_of_scope hold is the owner's clarification
                        // queue, never an error.
                        const waitingClarification = (e.reason || "").toLowerCase() === "out_of_scope";
                        return (
                          <li key={e.id} className="oc-esc">
                            <p className="oc-esc-reason">
                              {waitingClarification ? "Waiting on the owner's clarification" : `“${e.reason}”`}
                            </p>
                            {waitingClarification && (
                              <p className="fine">
                                The worker reached work outside the delegated task kinds. Nothing
                                ran and nothing was spent — it is held for your clarification, not an error.
                              </p>
                            )}
                            <dl className="oc-facts">
                              <div><dt>Proposes</dt><dd><strong>{e.proposed_action?.label ?? e.proposed_action?.kind ?? "—"}</strong></dd></div>
                              {e.proposed_action?.detail && <div><dt>Detail</dt><dd>{e.proposed_action.detail}</dd></div>}
                              {e.created_at && <div><dt>Asked</dt><dd>{e.created_at}</dd></div>}
                            </dl>
                            {(<>
                              <label className="fine">Note for the record <span className="fine">(optional)</span>
                                <input
                                  value={resolveNote[e.id] ?? ""}
                                  onChange={(ev) => setResolveNote({ ...resolveNote, [e.id]: ev.target.value })}
                                  maxLength={200}
                                  placeholder="why you decided this"
                                />
                              </label>
                              <div className="oc-btnrow">
                                <button
                                  className="primary"
                                  disabled={busy !== null}
                                  onClick={() => resolveEscalation(e, "approve")}
                                >
                                  {busy === `resolve:${e.id}` ? "Working…" : "Approve"}
                                </button>
                                <button disabled={busy !== null} onClick={() => resolveEscalation(e, "deny")}>
                                  Deny
                                </button>
                              </div>
                            </>)}
                          </li>
                        );
                      })}
                      {resolved.map((e) => (
                        <li key={e.id} className="oc-esc oc-esc-done">
                          <p className="fine">
                            <span className={`badge ${(e.status || "").toLowerCase() === "approved" ? "ok" : "no"}`}>{e.status}</span>{" "}
                            “{e.reason}”
                            {e.resolution && <span> — {e.resolution}</span>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* revoke — the existing control */}
                <section className="oc-section" aria-label="Revoke">
                  <button
                    className="danger"
                    disabled={busy !== null}
                    onClick={doRevoke}
                  >
                    {busy === "revoke" ? "Revoking…" : `Revoke ${p.agentName}`}
                  </button>
                  <p className="fine">Revoking stops the agent entirely — the delegation ends with it. Nothing else in the world is touched.</p>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
