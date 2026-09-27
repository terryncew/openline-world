import { useEffect, useState } from "react";
import { api, type HelperInfo, type ReceiptInfo, type ReviewInfo, type Snapshot, type WEvent } from "../api";
import { provenanceClass, provenanceLabel } from "../hooks";

export function ConnectionBanner({ snap }: { snap: Snapshot }) {
  const c = snap.connection;
  const cls = c.status === "LIVE" ? "ok" : c.status === "STALE" ? "stale" : c.status === "WAITING" ? "wait" : "demo";
  return (
    <div className={`banner ${cls}`} role="status">
      <strong>{snap.mode === "demo" ? "DEMO" : "CONNECTED"}</strong>
      <span>{c.status}</span>
      <span className="detail">{c.detail}</span>
      {c.status === "STALE" && <span className="warn">Telemetry is stale. Nothing is shown as working.</span>}
    </div>
  );
}

export function EventFeed({ events }: { events: WEvent[] }) {
  const [open, setOpen] = useState(true);
  const recent = events.slice(-12).reverse();
  return (
    <div className="panel feed">
      <button className="panel-title" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} What happened
      </button>
      {open && (
        <ul>
          {recent.map((e) => (
            <li key={e.event_id} className={provenanceClass(e.provenance)}>
              <span className="prov">{provenanceLabel(e.provenance)}</span>
              <span className="sum">{e.summary}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="empty">Nothing yet — start the story.</li>}
        </ul>
      )}
    </div>
  );
}

export function ReviewPanel({ review }: { review: ReviewInfo | null }) {
  if (!review) return null;
  const ok = review.decision === "ALLOWED";
  return (
    <div className="panel review" role="status">
      <div className="panel-title">Review station</div>
      <div className="proposal">
        <span className="who">{review.helper}</span> proposed <code>{review.action}</code>
      </div>
      <div className="rule">Rule: {review.rule}</div>
      <div className={`verdict ${ok ? "ok" : "no"}`}>
        {ok ? "Allowed" : "Refused"} — {review.reason}
      </div>
      <div className="receipt-id">receipt {review.receipt_id}… · signed by the receiver</div>
    </div>
  );
}

export function HelperPanel({
  helper,
  onPropose,
  onRevoke,
}: {
  helper: HelperInfo | null;
  onPropose: (action: string) => void;
  onRevoke: () => void;
}) {
  const [action, setAction] = useState("");
  if (!helper) return null;
  return (
    <div className="panel helper">
      <div className="panel-title">
        {helper.helper_id}
        <span className={`pill ${helper.active ? "active" : "revoked"}`}>{helper.active ? "active" : "revoked"}</span>
      </div>
      <div className="row">
        <span className="k">Mandate</span>
        <code className="v">{helper.mandate_id}</code>
      </div>
      <div className="row">
        <span className="k">May do</span>
        <span className="v">{helper.scopes.join(", ") || "—"}</span>
      </div>
      {helper.active && (
        <>
          <div className="propose">
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="action, e.g. notes.write"
              aria-label="Propose an action"
            />
            <button disabled={!action.trim()} onClick={() => { onPropose(action.trim()); setAction(""); }}>
              Propose
            </button>
          </div>
          <button className="danger" onClick={onRevoke}>
            Revoke mandate
          </button>
        </>
      )}
    </div>
  );
}

export function ReceiptsPanel({ onClose }: { onClose: () => void }) {
  const [receipts, setReceipts] = useState<ReceiptInfo[]>([]);
  const [sel, setSel] = useState<ReceiptInfo | null>(null);
  useEffect(() => {
    api.receipts().then((r) => setReceipts(r.receipts)).catch(() => {});
  }, []);
  return (
    <div className="drawer" role="dialog" aria-label="Signed receipts">
      <div className="drawer-head">
        <strong>Records — signed receipts</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="drawer-body">
        <ul className="receipt-list">
          <li><p className="verify-note">Each receipt was signed by the receiver's key and the signature was verified before it was recorded. Agents cannot mint these.</p></li>
          {receipts.map((r) => (
            <li key={r.signature.value}>
              <button onClick={() => setSel(r)} className={r.decision === "ALLOWED" ? "ok" : "no"}>
                <span>{r.decision}</span> <code>{r.action}</code>
                <span className="who">{r.subject_id}</span>
              </button>
            </li>
          ))}
          {receipts.length === 0 && <li className="empty">No receipts yet.</li>}
        </ul>
        {sel && (
          <div className="receipt-detail">
            <div className="row"><span className="k">Decision</span><span className="v">{sel.decision}</span></div>
            <div className="row"><span className="k">Action</span><code className="v">{sel.action}</code></div>
            <div className="row"><span className="k">Helper</span><span className="v">{sel.subject_id}</span></div>
            <div className="row"><span className="k">Reasons</span><span className="v">{sel.reason_codes.join(", ") || "—"}</span></div>
            <div className="row"><span className="k">Decided at</span><span className="v">{sel.decided_at}</span></div>
            <div className="row"><span className="k">Signature</span><code className="v sig">{sel.signature.value.slice(0, 48)}…</code></div>
            <div className="row"><span className="k">Gate key</span><code className="v sig">{sel.signature.public_key.slice(0, 48)}…</code></div>
            <p className="fine">Signed by the receiver's key. Agents cannot mint these.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function OnboardForm({ onOnboard }: { onOnboard: (id: string, scopes: string[]) => void }) {
  const [id, setId] = useState("");
  const [scopes, setScopes] = useState("notes.read");
  return (
    <div className="panel onboard">
      <div className="panel-title">Onboard a helper</div>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="name, e.g. juniper" aria-label="Helper name" />
      <input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="scopes, comma separated" aria-label="Scopes" />
      <button
        disabled={!id.trim()}
        onClick={() => {
          onOnboard(id.trim().toLowerCase(), scopes.split(",").map((s) => s.trim()).filter(Boolean));
          setId("");
        }}
      >
        Grant bounded mandate
      </button>
      <p className="fine">A fresh key, a bounded mandate, an admitted bundle. The rules and records stay yours.</p>
    </div>
  );
}

export function Onboarding({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    ["This workshop is yours.", "Helpers come and go. The rules, the records, and the decisions stay with you."],
    ["Helpers act. The receiver decides.", "A helper proposes an action. An independent receiver checks the mandate and signs the result — allowed or refused."],
    ["Saying “done” is not acceptance.", "Only a receiver-signed receipt counts as an accepted decision. Watch for the difference."],
    ["Your helper works under a delegation.", "Nothing starts until you authorize it — the delegation names the goal, the task kinds, the spending limit, and what needs your review. It is the one act that starts your helper working."],
  ];
  const last = step === steps.length - 1;
  return (
    <div className="onboarding" role="dialog" aria-label="Welcome">
      <div className="card">
        <h2>{steps[step][0]}</h2>
        <p>{steps[step][1]}</p>
        <div className="actions">
          <button onClick={onSkip}>Skip</button>
          {!last && <button onClick={() => setStep(step + 1)}>Next</button>}
          {last && <button className="primary" onClick={onStart}>Start the story</button>}
        </div>
        <div className="dots">{steps.map((_, i) => <span key={i} className={i === step ? "on" : ""} />)}</div>
      </div>
    </div>
  );
}

export function ListView({ snap, events }: { snap: Snapshot; events: WEvent[] }) {
  return (
    <div className="listview">
      <h2>Workshop — text view</h2>
      <p className="fine">Same workshop, no 3D. Everything here mirrors the room.</p>
      <h3>Helpers</h3>
      <ul>
        {snap.helpers.map((h) => (
          <li key={h.helper_id}>
            <strong>{h.helper_id}</strong> — {h.active ? "active" : "revoked"} · may do: {h.scopes.join(", ")} · mandate {h.mandate_id}
          </li>
        ))}
      </ul>
      <h3>Latest review</h3>
      {snap.review ? (
        <p>{snap.review.helper} proposed {snap.review.action} — {snap.review.decision}. {snap.review.reason}</p>
      ) : <p>No proposals yet.</p>}
      <h3>Receipts</h3>
      <p>{snap.receipts} signed receipt{snap.receipts === 1 ? "" : "s"} on record.</p>
      <h3>What happened</h3>
      <ul>
        {events.slice(-20).map((e) => (
          <li key={e.event_id}><em>[{provenanceLabel(e.provenance)}]</em> {e.summary}</li>
        ))}
      </ul>
      <p className="fine">{snap.notice}</p>
    </div>
  );
}
