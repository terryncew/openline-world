import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type HelperInfo, type ReceiptInfo, type Snapshot } from "../api";
import { OVERVIEW, WorkshopScene } from "../scene/Room";
import "./what-changed.css";

const WORKERS = ["wren", "juniper"] as const;
const ACTIONS = ["notes.read", "notes.write", "config.write"] as const;
const JUNIPER_SCOPES = ["notes.read", "notes.write"];
const WITHDRAWN_SCOPE = "notes.write";
const NARROWED_SCOPES = ["notes.read"];

type HelperId = (typeof WORKERS)[number];
type CellStatus = "pending" | "allowed" | "refused" | "undetermined" | "unavailable" | "historical";

interface AuthorityState {
  present: boolean;
  mandate_id: string | null;
  scopes: string[];
  active: boolean;
}

interface ProposeReview {
  decision: "ALLOWED" | "STOPPED";
  reason: string;
  receipt_id: string;
  decided_at: string;
}

interface CellResult {
  helper: HelperId;
  action: string;
  status: CellStatus;
  decision?: "ALLOWED" | "STOPPED";
  reason?: string;
  reasonCodes?: string[];
  receipt?: ReceiptInfo | null;
  receiptId?: string;
  receiptMissing?: boolean;
  authority?: AuthorityState;
  evaluatedAt?: string;
  why?: string;
}

interface ChangeRecord {
  label: string;
  detail: string;
  at: string;
}

const cellKey = (helper: string, action: string) => `${helper}:${action}`;

const ABSENT: AuthorityState = { present: false, mandate_id: null, scopes: [], active: false };

function authorityFrom(snap: Snapshot, helper: string): AuthorityState {
  const h = snap.helpers.find((x) => x.helper_id === helper);
  if (!h) return { ...ABSENT };
  return { present: true, mandate_id: h.mandate_id ?? null, scopes: [...h.scopes], active: h.active };
}

function classifyError(e: unknown): { status: "undetermined" | "unavailable"; why: string } {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return { status: "unavailable", why: "Could not reach the receiver, so nothing was decided." };
  }
  if (msg.includes("HELPER_UNKNOWN")) {
    return {
      status: "undetermined",
      why: "The receiver holds no mandate for this worker, so there is nothing to evaluate. Nothing was signed.",
    };
  }
  return { status: "undetermined", why: `The receiver returned “${msg}”. Nothing was signed.` };
}

const STATUS_LABEL: Record<CellStatus, string> = {
  pending: "Asking…",
  allowed: "Allowed",
  refused: "Refused",
  undetermined: "Cannot determine",
  unavailable: "Unavailable",
  historical: "Earlier answer",
};

export function WhatChanged({ onExit }: { onExit: () => void }) {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authority, setAuthority] = useState<Record<string, AuthorityState>>({});
  const [cells, setCells] = useState<Record<string, CellResult>>({});
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptCount, setReceiptCount] = useState(0);
  const [pipOpen, setPipOpen] = useState(true);
  const mounted = useRef(true);
  const started = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setCell = useCallback((key: string, patch: Partial<CellResult>) => {
    setCells((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, ...patch } };
    });
  }, []);

  const matchReceipt = useCallback(
    async (helper: string, action: string, receiptId: string): Promise<ReceiptInfo | null> => {
      try {
        const { receipts } = await api.receipts();
        const hits = receipts.filter(
          (r) => r.subject_id === helper && r.action === action && (r.signature?.value ?? "").startsWith(receiptId)
        );
        return hits.length ? hits[hits.length - 1] : null;
      } catch {
        return null;
      }
    },
    []
  );

  const evaluateAll = useCallback(
    async (auth: Record<string, AuthorityState>) => {
      for (const helper of WORKERS) {
        for (const action of ACTIONS) {
          const key = cellKey(helper, action);
          if (!mounted.current) return;
          setCell(key, { status: "pending" });
          const startedAt = new Date().toISOString();
          try {
            const res = (await api.propose(helper, action)) as { review: ProposeReview };
            const review = res.review;
            const receipt = await matchReceipt(helper, action, review.receipt_id);
            if (!mounted.current) return;
            setCell(key, {
              status: review.decision === "ALLOWED" ? "allowed" : "refused",
              decision: review.decision,
              reason: review.reason,
              reasonCodes: receipt?.reason_codes ?? [],
              receipt: receipt ?? null,
              receiptId: review.receipt_id,
              receiptMissing: receipt === null,
              authority: auth[helper] ?? { ...ABSENT },
              evaluatedAt: review.decided_at || startedAt,
              why: undefined,
            });
          } catch (e) {
            if (!mounted.current) return;
            const c = classifyError(e);
            setCell(key, {
              status: c.status,
              why: c.why,
              authority: auth[helper] ?? { ...ABSENT },
              evaluatedAt: startedAt,
              decision: undefined,
              reason: undefined,
              receipt: undefined,
            });
          }
        }
      }
      // Real session receipts on record — the PiP's archive mirrors this count.
      try {
        const { receipts } = await api.receipts();
        if (mounted.current) setReceiptCount(receipts.length);
      } catch {
        /* keep the last known count; the grid is the source of truth */
      }
    },
    [matchReceipt, setCell]
  );

  const loadIntoFresh = useCallback(async () => {
    const snap = await api.state();
    const auth: Record<string, AuthorityState> = {};
    for (const h of WORKERS) auth[h] = authorityFrom(snap, h);
    if (!mounted.current) return;
    setAuthority(auth);
    setSessionId(snap.session);
    const fresh: Record<string, CellResult> = {};
    for (const helper of WORKERS)
      for (const action of ACTIONS) fresh[cellKey(helper, action)] = { helper, action, status: "pending" };
    setCells(fresh);
    await evaluateAll(auth);
  }, [evaluateAll]);

  const boot = useCallback(async () => {
    if (!mounted.current) return;
    setBooting(true);
    setError(null);
    setChanges([]);
    setSelected(null);
    try {
      await api.resetDemo();
      await loadIntoFresh();
    } catch (e) {
      if (mounted.current) setError(`Could not start a fresh session: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (mounted.current) setBooting(false);
    }
  }, [loadIntoFresh]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void boot();
  }, [boot]);

  const markHistorical = useCallback(() => {
    setCells((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        const c = next[k];
        if (c.status === "allowed" || c.status === "refused" || c.status === "undetermined") {
          next[k] = { ...c, status: "historical" };
        }
      }
      return next;
    });
  }, []);

  const applyChange = useCallback(
    async (kind: "revoke-wren" | "authorize-juniper" | "withdraw") => {
      if (busy || booting) return;
      setBusy(true);
      setError(null);
      setSelected(null);
      markHistorical();
      const at = new Date().toLocaleTimeString();
      try {
        if (kind === "revoke-wren") {
          const info = (await api.revoke("wren")) as { mandate_id?: string; status?: string };
          setChanges((p) => [...p, { label: "Revoked Wren", detail: `Mandate ${info.mandate_id ?? "?"} revoked (${info.status ?? "REVOKED"}). The receiver admitted the revocation.`, at }]);
        } else if (kind === "authorize-juniper") {
          const info = (await api.onboard("juniper", [...JUNIPER_SCOPES])) as { mandate_id?: string; scopes?: string[] };
          setChanges((p) => [...p, { label: "Authorized Juniper", detail: `Mandate ${info.mandate_id ?? "?"} issued with scopes ${(info.scopes ?? []).join(", ")}. Its own key, its own mandate — nothing reused.`, at }]);
        } else {
          const rev = (await api.revoke("wren")) as { mandate_id?: string };
          const info = (await api.onboard("wren", [...NARROWED_SCOPES])) as { mandate_id?: string; scopes?: string[] };
          setChanges((p) => [
            ...p,
            { label: "Withdrew notes.write from Wren", detail: `Revoked ${rev.mandate_id ?? "old mandate"}, then issued ${info.mandate_id ?? "a new mandate"} with scopes ${(info.scopes ?? []).join(", ")}. Same worker, narrower relationship.`, at },
          ]);
        }
        const snap = await api.state();
        const auth: Record<string, AuthorityState> = {};
        for (const h of WORKERS) auth[h] = authorityFrom(snap, h);
        if (!mounted.current) return;
        setAuthority(auth);
        setSessionId(snap.session);
        await evaluateAll(auth);
      } catch (e) {
        if (mounted.current) setError(`Change failed: ${e instanceof Error ? e.message : String(e)} — earlier answers stay marked historical until the receiver is asked again.`);
        // Re-evaluate anyway so cells reflect the true current state.
        try {
          const snap = await api.state();
          const auth: Record<string, AuthorityState> = {};
          for (const h of WORKERS) auth[h] = authorityFrom(snap, h);
          if (mounted.current) {
            setAuthority(auth);
            await evaluateAll(auth);
          }
        } catch {
          /* keep historical markings; connection is down */
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, booting, evaluateAll, markHistorical]
  );

  const replay = useCallback(async () => {
    if (busy || booting) return;
    await boot();
  }, [boot, busy, booting]);

  const wrenAuth = authority["wren"];
  const juniperAuth = authority["juniper"];
  const canRevokeWren = !!wrenAuth?.present && wrenAuth.active;
  const canAuthorizeJuniper = !(juniperAuth?.present && juniperAuth.active);
  const canWithdraw = !!wrenAuth?.present && wrenAuth.active && wrenAuth.scopes.includes(WITHDRAWN_SCOPE);

  // The corner window shows workers as they ARE: only present workers, with
  // their real active state. review is always null — it never acts out the grid.
  const pipHelpers = useMemo<HelperInfo[]>(
    () =>
      WORKERS.filter((w) => authority[w]?.present).map((w) => {
        const a = authority[w] ?? { ...ABSENT };
        return {
          helper_id: w,
          active: a.active,
          scopes: [...a.scopes],
          mandate_id: a.mandate_id ?? "",
        };
      }),
    [authority]
  );

  const sel = selected ? cells[selected] : null;

  return (
    <div className="wc">
      <header className="wc-head">
        <div className="wc-title">
          <h1>What changed?</h1>
          <p>
            One relationship changes. The workers and the task stay the same. Every cell is a live
            question to the receiver — asked just now, answered just now. Nothing here is precomputed.
          </p>
        </div>
        <div className="wc-head-actions">
          {sessionId && <span className="wc-session" title="Isolated demo session">session {sessionId.slice(-8)}</span>}
          <button className="wc-btn" onClick={replay} disabled={busy || booting} title="Start a brand-new isolated session. The old session — revocations and all — is left behind, never undone.">
            ↺ Replay
          </button>
          <button className="wc-btn" onClick={onExit}>← Back to workshop</button>
        </div>
      </header>

      {error && <div className="wc-error">{error}</div>}

      <main className="wc-main">
        <section className="wc-board" aria-label="Relationships">
          <h2>Relationships</h2>
          <div className="wc-workers">
            {WORKERS.map((w) => (
              <WorkerCard key={w} id={w} auth={authority[w]} />
            ))}
          </div>

          <h2>Change one relationship</h2>
          <div className="wc-changes">
            <button className="wc-btn wc-change" disabled={!canRevokeWren || busy || booting} onClick={() => applyChange("revoke-wren")}>
              Revoke Wren
            </button>
            <button className="wc-btn wc-change" disabled={!canAuthorizeJuniper || busy || booting} onClick={() => applyChange("authorize-juniper")}>
              Authorize Juniper
            </button>
            <button className="wc-btn wc-change" disabled={!canWithdraw || busy || booting} onClick={() => applyChange("withdraw")}>
              Withdraw notes.write from Wren
            </button>
          </div>
          <p className="wc-fine">
            Revocation is permanent inside this session — there is no undo. Replay starts a fresh
            isolated session instead of rewriting history.
          </p>

          {changes.length > 0 && (
            <div className="wc-log">
              <h3>What you changed</h3>
              <ul>
                {changes.map((c, i) => (
                  <li key={i}>
                    <strong>{c.label}</strong> <span className="wc-fine">{c.at}</span>
                    <br />
                    <span>{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="wc-grid-wrap" aria-label="Comparison">
          <h2>What may each worker do now?</h2>
          {booting ? (
            <p className="wc-fine">Starting a fresh session and asking the receiver…</p>
          ) : (
            <table className="wc-grid">
              <thead>
                <tr>
                  <th scope="col" className="wc-rowhead"> </th>
                  {WORKERS.map((w) => (
                    <th scope="col" key={w}>{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map((a) => (
                  <tr key={a}>
                    <th scope="row" className="wc-rowhead"><code>{a}</code></th>
                    {WORKERS.map((w) => {
                      const key = cellKey(w, a);
                      const c = cells[key];
                      return (
                        <td key={key}>
                          <CellTicket cell={c} onInspect={() => setSelected(key)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="wc-fine">
            Allowed and Refused answers are backed by a signed receiver receipt, minted by asking.
            Select any cell to inspect the receipt and the exact authority it was evaluated under.
          </p>
        </section>
      </main>

      {pipOpen ? (
        <aside className="wc-pip" aria-label="The workshop, live">
          <div className="wc-pip-head">
            <div>
              <h3><span className="wc-pip-live" aria-hidden="true" />The workshop, live</h3>
              <p className="wc-fine">Workers as they are — the grid asks the questions.</p>
            </div>
            <button className="wc-btn" onClick={() => setPipOpen(false)}>Hide</button>
          </div>
          <div className="wc-pip-canvas">
            <WorkshopScene
              helpers={pipHelpers}
              review={null}
              receiptCount={receiptCount}
              focus={OVERVIEW}
              walk={false}
              tour={false}
              drift
              onSelectHelper={() => {}}
              onSelectStation={() => {}}
              onFloorTap={() => {}}
            />
          </div>
          <div key={`${sessionId}-${changes.length}`} className="wc-pip-glow" aria-hidden="true" />
        </aside>
      ) : (
        <button className="wc-btn wc-pip-open" onClick={() => setPipOpen(true)}>Show the workshop</button>
      )}

      {sel && <InspectDrawer cell={sel} onClose={() => setSelected(null)} />}
    </div>
  );
}

function WorkerCard({ id, auth }: { id: string; auth?: AuthorityState }) {
  const present = !!auth?.present;
  const active = !!auth?.active;
  const status = !present ? "no mandate" : active ? "active" : "revoked";
  return (
    <div className={`wc-worker ${status.replace(" ", "-")}`}>
      <div className={`wc-puppet puppet-${id}`} aria-hidden="true">
        <span className="eye left" />
        <span className="eye right" />
      </div>
      <div className="wc-worker-meta">
        <strong>{id}</strong>
        <span className={`wc-status st-${status.replace(" ", "-")}`}>{status}</span>
        {present && (
          <>
            <span className="wc-fine">{auth!.mandate_id}</span>
            <div className="wc-scopes">
              {auth!.scopes.map((s) => (
                <span key={s} className="wc-scope">{s}</span>
              ))}
            </div>
          </>
        )}
        {!present && <span className="wc-fine">The receiver holds nothing for this worker.</span>}
      </div>
    </div>
  );
}

function CellTicket({ cell, onInspect }: { cell?: CellResult; onInspect: () => void }) {
  if (!cell) return <div className="wc-cell wc-pending"><span className="wc-verdict">…</span></div>;
  const label = STATUS_LABEL[cell.status];
  const sub =
    cell.status === "allowed" || cell.status === "refused"
      ? cell.reason
      : cell.status === "historical"
        ? `${cell.decision === "ALLOWED" ? "Allowed" : cell.decision === "STOPPED" ? "Refused" : "No answer"} — under an earlier relationship`
        : cell.status === "pending"
          ? "Asking the receiver…"
          : cell.why;
  return (
    <button className={`wc-cell wc-${cell.status}`} onClick={onInspect} disabled={cell.status === "pending"}>
      <span className="wc-verdict">{label}</span>
      {sub && <span className="wc-why">{sub}</span>}
      {(cell.status === "allowed" || cell.status === "refused") && cell.receipt && (
        <span className="wc-signed">signed receipt · inspect →</span>
      )}
      {(cell.status === "undetermined" || cell.status === "unavailable") && (
        <span className="wc-unsigned">no signed receipt</span>
      )}
    </button>
  );
}

function InspectDrawer({ cell, onClose }: { cell: CellResult; onClose: () => void }) {
  const r = cell.receipt;
  const signed = !!(r && r.signature && r.signature.value);
  return (
    <div className="wc-drawer-backdrop" onClick={onClose}>
      <aside className="wc-drawer" onClick={(e) => e.stopPropagation()} aria-label="Inspection">
        <div className="wc-drawer-head">
          <h3>
            {cell.helper} · <code>{cell.action}</code>
          </h3>
          <button className="wc-btn" onClick={onClose}>Close</button>
        </div>

        <dl className="wc-facts">
          <div><dt>Answer</dt><dd>{STATUS_LABEL[cell.status]}{cell.decision ? ` (${cell.decision})` : ""}</dd></div>
          {cell.reason && <div><dt>Why</dt><dd>{cell.reason}</dd></div>}
          {cell.reasonCodes && cell.reasonCodes.length > 0 && (
            <div><dt>Reason codes</dt><dd>{cell.reasonCodes.map((c) => <code key={c} className="wc-code">{c}</code>)}</dd></div>
          )}
          {cell.why && <div><dt>Why</dt><dd>{cell.why}</dd></div>}
          <div><dt>Evaluated</dt><dd>{cell.evaluatedAt ?? "—"}</dd></div>
        </dl>

        <h4>Authority it was evaluated under</h4>
        {cell.authority ? (
          <dl className="wc-facts">
            <div><dt>Worker known</dt><dd>{cell.authority.present ? "yes" : "no"}</dd></div>
            {cell.authority.present && (
              <>
                <div><dt>Mandate</dt><dd><code>{cell.authority.mandate_id ?? "—"}</code></dd></div>
                <div><dt>Scopes</dt><dd>{cell.authority.scopes.length ? cell.authority.scopes.join(", ") : "—"}</dd></div>
                <div><dt>Active</dt><dd>{cell.authority.active ? "yes" : "no (revoked)"}</dd></div>
              </>
            )}
          </dl>
        ) : (
          <p className="wc-fine">Not yet evaluated.</p>
        )}

        <h4>Receipt</h4>
        {signed && r ? (
          <>
            <p className="wc-signed-line">Signed by the receiver <span className="wc-fine">(key {r.signature.public_key.slice(0, 12)}…)</span></p>
            <pre className="wc-receipt">{JSON.stringify(r, null, 2)}</pre>
          </>
        ) : cell.receiptMissing ? (
          <p className="wc-fine">The receiver decided, but the signed receipt could not be retrieved. The answer above came from the live decision, not from a stored copy.</p>
        ) : (
          <p className="wc-fine">No signed receipt — the receiver decided nothing for this cell.</p>
        )}
      </aside>
    </div>
  );
}
