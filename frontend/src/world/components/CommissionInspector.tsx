import type {
  CommissionSummary,
  WorldParticipant,
} from "../api";

/**
 * CommissionInspector — the owner's read-only view of unattended
 * commissions. Every figure comes from the backend's recorded state:
 * frozen terms, recorded cost events, and receiver-computed settlement.
 * Nothing is invented; amounts are simulated funds only, never provider
 * invoices.
 */
export function CommissionInspector({
  commissions,
  participants,
  onClose,
}: {
  commissions: CommissionSummary[];
  participants: WorldParticipant[];
  onClose: () => void;
}) {
  const balanceOf = (pid: string) =>
    participants.find((p) => p.participant_id === pid)
      ?.simulated_balance_cents ?? null;
  const fmt = (c: number | null | undefined) =>
    c === null || c === undefined ? "—" : `${(c / 100).toFixed(2)}`;

  return (
    <div className="world-overlay" role="dialog" aria-label="Commission ledger">
      <div className="world-sheet">
        <div className="sheet-head">
          <h3>Commission ledger</h3>
          <button className="world-linkbtn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="fine">
          Two owners authorize frozen terms once; workers complete the job
          unattended; the receiver settles from the frozen contract plus
          recorded cost events. Simulated funds only — cost events are never
          provider invoices.
        </p>
        {commissions.length === 0 && (
          <p className="fine">No commissions yet in this world.</p>
        )}
        {commissions.map((c) => (
          <section key={c.commission_id} className="world-panel">
            <div className="panel-title">
              {c.commission_id} — {c.status}
            </div>
            <dl className="kv">
              <dt>Terms</dt>
              <dd>
                {c.contract_id} · buyer {c.buyer_id} · seller {c.seller_id}
              </dd>
              <dt>Recorded costs</dt>
              <dd>
                {fmt(c.recorded_cost_cents)} of {fmt(c.max_cost_cents)} cap
              </dd>
              <dt>Success fee</dt>
              <dd>{fmt(c.success_fee_cents)} (on acceptance only)</dd>
              {c.settlement && (
                <>
                  <dt>Outcome</dt>
                  <dd>{c.settlement.outcome}</dd>
                  <dt>Actual costs</dt>
                  <dd>{fmt(c.settlement.recorded_cost_cents)}</dd>
                  <dt>Seller compensation</dt>
                  <dd>{fmt(c.settlement.seller_payout_cents)}</dd>
                  <dt>Released to buyer</dt>
                  <dd>{fmt(c.settlement.buyer_release_cents)}</dd>
                  <dt>Payee</dt>
                  <dd>{c.settlement.payee} (frozen contract)</dd>
                </>
              )}
              <dt>Buyer balance</dt>
              <dd>{fmt(balanceOf(c.buyer_id))} (simulated)</dd>
              <dt>Seller balance</dt>
              <dd>{fmt(balanceOf(c.seller_id))} (simulated)</dd>
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
