/**
 * OpenLine World visualization — inspector.
 * frontend/src/viz/Inspector.tsx
 *
 * Click a visual object: see the real backing record. Every panel shows
 * the provenance line — who had standing to say it happened, in plain
 * words — and quotes backend data verbatim, never paraphrased into new
 * claims.
 */
import {
  provenanceExplain,
  provenanceLabel,
  type Provenance,
  type VizAuthority,
  type VizProposal,
  type VizReceipt,
  type VizWorker,
} from "./protocol";

export type VizSelection =
  | { kind: "worker"; id: string }
  | { kind: "seal"; id: string }
  | { kind: "packet"; id: string }
  | { kind: "receipt"; id: string }
  | { kind: "gate" }
  | { kind: "owner" }
  | null;

function Prov({ p, who }: { p: Provenance; who?: string }) {
  return (
    <div className="viz-prov">
      <span className={`viz-prov-badge prov-${p}`}>{provenanceLabel(p)}</span>
      <span className="viz-prov-text">{provenanceExplain(p, who)}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="viz-row">
      <span className="viz-k">{k}</span>
      <span className="viz-v">{v}</span>
    </div>
  );
}

export function Inspector({
  selection,
  workers,
  authorities,
  proposals,
  receipts,
  ownerPrincipal,
  onClose,
}: {
  selection: VizSelection;
  workers: VizWorker[];
  authorities: VizAuthority[];
  proposals: VizProposal[];
  receipts: VizReceipt[];
  ownerPrincipal: string | null;
  onClose: () => void;
}) {
  if (!selection) {
    return (
      <div className="viz-inspector">
        <div className="viz-inspector-title">Inspector</div>
        <p className="viz-fine">Click a worker, seal, packet, tablet, the gate, or the owner stone.</p>
        <div className="viz-legend">
          <div><span className="sw sw-claim" /> proposal packet — agent says (claim)</div>
          <div><span className="sw sw-authority" /> tablet / gate flash — receiver decided</div>
          <div><span className="sw sw-owner" /> seal / tether — owner action (rule)</div>
          <div><span className="sw sw-speech" /> speech puff — agent says, not a receipt</div>
        </div>
      </div>
    );
  }

  let body: React.ReactNode = null;
  if (selection.kind === "worker") {
    const w = workers.find((x) => x.workerId === selection.id);
    if (!w) return null;
    body = (
      <>
        <div className="viz-inspector-title">Worker — {w.workerId}</div>
        <Prov p={w.provenance} who="The owner" />
        <Row k="mandate" v={w.mandateId} />
        <Row k="scopes" v={w.scopes.join(", ") || "—"} />
        <Row k="standing" v={w.active ? "active" : `revoked at event ${w.revokedSeq}`} />
        <Row k="entered" v={`event ${w.enteredSeq} (inferred from mandate create)`} />
      </>
    );
  } else if (selection.kind === "seal") {
    const a = authorities.find((x) => x.mandateId === selection.id);
    if (!a) return null;
    body = (
      <>
        <div className="viz-inspector-title">Authority — {a.mandateId}</div>
        <Prov p={a.provenance} />
        <Row k="holder" v={a.workerId} />
        <Row k="owner" v={ownerPrincipal ?? a.ownerPrincipal ?? "—"} />
        <Row k="scopes" v={a.scopes.join(", ") || "—"} />
        <Row k="standing" v={a.active ? "active" : `revoked at event ${a.revokedSeq}`} />
        <p className="viz-fine">The seal belongs to the owner, not the worker. Replacing the worker leaves it where it is.</p>
      </>
    );
  } else if (selection.kind === "packet") {
    const p = proposals.find((x) => x.id === selection.id);
    if (!p) return null;
    body = (
      <>
        <div className="viz-inspector-title">Proposal — {p.action}</div>
        <Prov p={p.provenance} who={p.workerId} />
        <Row k="worker" v={p.workerId} />
        <Row k="event" v={String(p.seq)} />
        <Row k="status" v={p.status === "in-flight" ? "in flight — waiting on the receiver" : p.status} />
        {p.decisionProvenance && (
          <>
            <Prov p={p.decisionProvenance} />
            <Row k="decided at" v={`event ${p.decisionSeq}`} />
            {p.reasonCodes.length > 0 && <Row k="reasons" v={p.reasonCodes.join(", ")} />}
          </>
        )}
      </>
    );
  } else if (selection.kind === "receipt") {
    const r = receipts.find((x) => x.id === selection.id);
    if (!r) return null;
    body = (
      <>
        <div className="viz-inspector-title">Receipt — {r.decision}</div>
        <Prov p={r.provenance} />
        <Row k="action" v={r.action} />
        <Row k="worker" v={r.helper} />
        <Row k="event" v={String(r.seq)} />
        {r.reasonCodes.length > 0 && <Row k="reasons" v={r.reasonCodes.join(", ")} />}
        <details className="viz-receipt-json">
          <summary>Public receipt projection (signed fields shown; not the full record)</summary>
          <pre>{JSON.stringify(r.receipt, null, 2)}</pre>
        </details>
      </>
    );
  } else if (selection.kind === "gate") {
    body = (
      <>
        <div className="viz-inspector-title">Receiver gate</div>
        <Prov p="receiver-signed" />
        <p className="viz-fine">The fixed control point. It checks the owner's mandate, then allows or stops the consequence. Nothing passes without its decision.</p>
      </>
    );
  } else if (selection.kind === "owner") {
    body = (
      <>
        <div className="viz-inspector-title">Owner</div>
        <Prov p="owner-signed" />
        <Row k="principal" v={ownerPrincipal ?? "—"} />
        <p className="viz-fine">Mandates and revocations hang from here. Workers change; this does not.</p>
      </>
    );
  }

  return (
    <div className="viz-inspector">
      <button className="viz-x" onClick={onClose} aria-label="Close inspector">×</button>
      {body}
    </div>
  );
}
