import { useEffect, useState } from 'react';
import './bounty.css';

type RecordReceipt = {
  receipt_id: string; action: { type: string }; decision: { outcome: string };
  effect: { observed: boolean | null }; extensions: { 'openline.world/bounty': { evidence_json: string } };
};
type Attempt = { number: number; status: string; effect: unknown; verification: null | {
  accepted: boolean; reason: string; checks: unknown; independence: string;
} };
type Payment = { key: string; kind: string; status: string; observation?: string; job_id: string };
type Snapshot = {
  id: string; phase: string; approval: string | null; terms: {
    max_attempt_sim_usd: number; attempt_sim_usd: number; reward_sim_usd: number;
    max_attempts: number; attempt_evidence: string; reward_conditions: string;
  }; mandate: null | { data: { expires_at: string; scopes: string[] } };
  attempts: Attempt[]; payments: Payment[]; reward_verification: string | null;
  records: RecordReceipt[]; events: { actor: string; kind: string; summary: string; at: string }[];
  ledger: { transfers: { amount: number; job_id: string }[] };
  bureau: { records: { receipt_id: string; action: string; decision: string | null; effect_observed: boolean | null }[]; limits: string };
  reconciliation?: string; owner_public_key: string; receiver_public_key: string;
};

const candidate = (target: 'alice' | 'bob') => ({ requester: 'alice', target, claim: 'cross-user-note' });

export function BountyView() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  async function request(action?: string, body = {}) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(action ? `/api/bounty/${action}` : '/api/bounty/state', action ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : undefined);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnap(data);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void request(); }, []);

  function next(): { label: string; action: string; body: object } | null {
    if (!snap || !snap.approval) return null;
    if (snap.payments.some(p => p.status === 'UNRESOLVED' || p.status === 'PREPARING')) return null;
    for (const a of snap.attempts) {
      if (a.status === 'UNRESOLVED' || a.status === 'REFUSED') return null;
      if (!a.verification) return { label: `Buyer verifies attempt ${a.number}`, action: 'verify', body: { number: a.number } };
      const p = snap.payments.find(p => p.key === `attempt-${a.number}`);
      if (!p) return { label: `Check attempt ${a.number} compensation evidence`, action: 'prepare-payment', body: { kind: 'attempt', number: a.number } };
      if (p.status === 'ELIGIBLE') return { label: `Settle attempt ${a.number}: $10 simulated`, action: 'settle', body: { key: p.key } };
    }
    if (snap.attempts.length < 2) return { label: snap.attempts.length === 0 ? 'Worker tries an unsupported finding' : 'Worker tries the cross-user finding',
      action: 'attempt', body: { candidate: candidate(snap.attempts.length === 0 ? 'alice' : 'bob') } };
    if (snap.reward_verification) {
      const p = snap.payments.find(p => p.key === 'reward');
      if (!p) return { label: 'Buyer checks success reward evidence', action: 'prepare-payment', body: { kind: 'reward' } };
      if (p.status === 'ELIGIBLE') return { label: 'Settle verified reward: $100 simulated', action: 'settle', body: { key: 'reward' } };
    }
    return null;
  }
  const step = next();
  const receipt = snap?.records.find(r => r.receipt_id === selected);
  const paid = snap?.ledger.transfers.reduce((total, t) => total + t.amount, 0) ?? 0;
  return <main className="bounty-page">
    <header className="bounty-header"><a href="/">← World Square</a><span>OpenLine World / BOUNTY-001</span><strong>LOCAL · SIMULATED FUNDS · $0 API SPEND</strong></header>
    <section className="bounty-intro"><p className="bounty-eyebrow">Who gets to say yes?</p><h1>One bounded job.<br />Every decision visible.</h1>
      <p>A buyer authorizes two attempts against a harmless, deliberately vulnerable notes fixture. The worker proposes; the receiver controls execution; the buyer verifies the finding; the existing Exchange Kernel settles.</p>
      <p className="bounty-notice">Deterministic local worker. Buyer-controlled local verification, all roles operated on one host. This demonstrates no outside receiver, real security assessment, real money, or worker ranking.</p>
    </section>
    {error && <p className="bounty-error" role="alert">{error}</p>}
    {!snap ? <p>Start <code>./bounty/run.sh</code> to enable this local scenario.</p> : <>
      <section className="bounty-grid">
        <article><p className="bounty-eyebrow">01 / Buyer authorization</p><h2>Worker A · Local notes fixture</h2>
          <p><strong>$20 maximum attempt budget</strong> · two attempts at $10 each</p><p><strong>$100 conditional success reward</strong> · first verified, reproducible finding</p>
          <details><summary>Read the fixed evidence and reward conditions</summary><p>{snap.terms.attempt_evidence}</p><p>{snap.terms.reward_conditions}</p></details>
          <p>Mandate: {snap.mandate ? <>signed · expires {new Date(snap.mandate.data.expires_at).toLocaleString()}<br /><code>{snap.mandate.data.scopes.join(', ')}</code></> : 'No worker authorized'}</p>
          {!snap.approval ? <button disabled={busy} onClick={() => request('approve')}>Buyer approves these fixed terms</button> : <button disabled={busy} onClick={() => request('revoke')}>Revoke future fixture attempts</button>}
          <p className="bounty-fine">Explicit local operator gesture; not browser key custody. Owner, worker and receiver use separate local signing keys. A signed permission proves no vulnerability.</p>
        </article>
        <article><p className="bounty-eyebrow">02 / Consequence boundary</p><h2>Attempt → verify → accept → settle</h2>
          <p>Attempt compensation requires authorization, an observed fixture response, a buyer verification record, and accepted evidence packaging. A failed finding can meet those evidence requirements.</p>
          {step && <button className="bounty-primary" disabled={busy} onClick={() => request(step.action, step.body)}>{busy ? 'Receiver working…' : step.label}</button>}
          {snap.payments.length === 3 && snap.payments.every(p => p.status === 'SETTLED') && <p className="bounty-success" role="status">Transaction complete · $120 SIM_USD settled through the existing kernel</p>}
          <div className="bounty-stats"><span><b>{snap.attempts.length}/2</b> attempts</span><span><b>${paid}</b> simulated payout</span><span><b>{snap.records.length}</b> evidence records</span></div>
          <button disabled={busy} onClick={() => request('reconcile')}>Read-only kernel reconciliation</button>
          {snap.reconciliation && <pre>{snap.reconciliation}</pre>}
          {snap.payments.filter(p => p.status === 'UNRESOLVED').map(p => <div key={p.key} className="bounty-notice"><strong>{p.key}: unresolved</strong><p>{p.observation}. Missing confirmation does not authorize a retry.</p>
            {p.observation === 'COMMITTED_LOCAL_RECORDS_INCOMPLETE' && <button disabled={busy} onClick={() => request('complete-committed', { key: p.key })}>Complete local records for confirmed transfer</button>}
          </div>)}
          {snap.payments.filter(p => p.status === 'PREPARING').map(p => <button key={p.key} disabled={busy} onClick={() => request('prepare-payment', { kind: p.kind, number: Number(p.key.split('-')[1]) })}>Resume the same evidence-package commission</button>)}
          {snap.attempts.some(a => a.status === 'UNRESOLVED') && <p className="bounty-notice">Fixture effect unresolved. No automatic redispatch. Inspect the retained local records.</p>}
        </article>
      </section>
      <section className="bounty-grid">
        <article><h2>Observed attempts</h2>{snap.attempts.length === 0 && <p>No effects yet. Authorization and execution are separate facts.</p>}
          {snap.attempts.map(a => <div className="bounty-attempt" key={a.number}><h3>Attempt {a.number} · {a.status}</h3><p>Finding: <strong>{a.verification?.reason ?? 'Not verified'}</strong></p>
            <details><summary>Observed effect and buyer checks</summary><pre>{JSON.stringify({ effect: a.effect, verification: a.verification }, null, 2)}</pre></details>
            <p className="bounty-fine">{a.verification?.independence ?? 'A response alone establishes no accepted finding.'}</p></div>)}
          <h3>Simulated obligations</h3>{snap.payments.map(p => <p key={p.key}>{p.key} · <strong>{p.status}</strong></p>)}
        </article>
        <article><h2>Decision timeline</h2><ol className="bounty-timeline">{snap.events.map((event, i) => <li key={i}><span>{event.actor} · {event.kind}</span><p>{event.summary}</p></li>)}</ol></article>
      </section>
      <section className="bounty-grid">
        <article><h2>Verifiable receipts</h2><p>Existing <code>bureau.receipt.v0.1</code> records, signed with Wallet’s Ed25519 record primitive. Raw native component evidence is retained inside the signed extension.</p>
          <div className="bounty-receipts">{snap.records.map(r => <button className={selected === r.receipt_id ? 'selected' : ''} key={r.receipt_id} onClick={() => setSelected(r.receipt_id)}>{r.action.type} · {r.decision.outcome} · effect {r.effect.observed === null ? 'unknown' : String(r.effect.observed)}</button>)}</div>
          {receipt && <pre aria-label="Selected signed receipt">{JSON.stringify(receipt, null, 2)}</pre>}
          <details><summary>Local signer public keys</summary><pre>{JSON.stringify({ owner: snap.owner_public_key, receiver: snap.receiver_public_key }, null, 2)}</pre></details>
        </article>
        <article><h2>What Bureau can establish</h2><p>{snap.bureau.limits}</p><p>Permission, attempted work, actual effect, finding verification, package acceptance and simulated settlement remain separate records. No trust score is computed.</p>
          <div className="bounty-ledger"><table><thead><tr><th>Record</th><th>Decision</th><th>Effect</th></tr></thead><tbody>{snap.bureau.records.map(r => <tr key={r.receipt_id}><td>{r.action}</td><td>{r.decision ?? 'unknown'}</td><td>{r.effect_observed === null ? 'unknown' : String(r.effect_observed)}</td></tr>)}</tbody></table></div>
        </article>
      </section>
    </>}
  </main>;
}
