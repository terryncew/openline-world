import { useEffect, useMemo, useRef, useState } from "react";
import { launchAuthorityDemo } from "../viz/director";
import { reduceEvents } from "../viz/reducer";
import { fetchSnapshot, subscribeLive } from "../viz/source";
import type { WEvent } from "../viz/protocol";
import "./hero.css";

type Snapshot = Awaited<ReturnType<typeof fetchSnapshot>>;

function Robot({ kind, active, denied }: { kind: "wren" | "juniper"; active: boolean; denied?: boolean }) {
  return <div className={`hero-robot ${kind} ${active ? "active" : ""} ${denied ? "denied" : ""}`} data-testid={`${kind}-rig`}>
    <div className="antenna"><i /></div><div className="head"><span/><span/></div>
    <div className="body"><b>{kind === "wren" ? "WRN" : "JNP"}</b><i /></div>
    <div className="arm left"/><div className="arm right"/><div className="treads"><i/><i/><i/></div>
    <label>{kind === "wren" ? "WREN · precision rig" : "JUNIPER · lift rig"}</label>
  </div>;
}

export function HeroView() {
  const [events, setEvents] = useState<WEvent[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const seen = useRef(new Set<string>());
  const scene = useMemo(() => reduceEvents(events), [events]);
  const juniperClaim = events.some(e => e.kind === "activity" && /Juniper arrives/.test(e.summary));
  const juniperReach = events.some(e => e.kind === "activity" && /reaches/.test(e.summary));
  const juniperGrant = scene.authorities.find(a => a.workerId === "juniper");
  const wren = scene.workers.find(w => w.workerId === "wren");
  const checkpoints = useMemo(() => snap?.job_state?.checkpoints ?? [], [snap]);
  const complete = scene.receipts.length === 3 && checkpoints.length === 2 && !!juniperGrant;
  const phase = complete ? "The worker changed. The job and its history did not." : juniperGrant ? "Juniper continues the same job" : juniperReach ? "No authority. No work." : juniperClaim ? "Juniper arrives — without authority" : wren && !wren.active ? "Revoked means stopped" : scene.receipts.length ? "Wren advances the work" : scene.job ? "One job. Authority stays visible." : "A job enters the town";

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    const connect = () => {
      seen.current.clear(); setEvents([]);
      unsubscribe();
      unsubscribe = subscribeLive(0, ev => {
        if (seen.current.has(ev.event_id)) return;
        seen.current.add(ev.event_id); setEvents(old => [...old, ev]);
        fetchSnapshot().then(setSnap).catch(() => {});
      });
    };
    connect();
    const cancel = launchAuthorityDemo({ holdMs: 3600, deferMs: 500, shouldStop: () => cancelled, onReset: connect });
    return () => { cancelled = true; cancel(); unsubscribe(); };
  }, []);
  useEffect(() => { const start = performance.now(); const id = window.setInterval(() => setElapsed((performance.now()-start)/1000), 100); return () => clearInterval(id); }, []);
  useEffect(() => {
    window.__heroDebug = { events, scene, checkpoints, complete, elapsed };
  }, [events, scene, checkpoints, complete, elapsed]);

  return <main className={`hero ${complete ? "complete" : ""}`}>
    <header><div className="wordmark"><span>OPENLINE</span><small>WORLD / AUTHORITY</small></div><div className="live"><i/> LIVE SYSTEM HISTORY</div></header>
    <section className="hero-copy"><p>CHANGE THE WORKER.</p><h1>Keep the work.<br/><em>Keep the proof.</em></h1></section>
    <section className="town" aria-label="OpenLine robot town workshop">
      <div className="sun"/><div className="skyline"><i/><i/><i/><i/></div>
      <div className="owner-station"><span className="beacon"/><strong>OWNER</strong><small>FIXED AUTHORITY STATION</small><div className="signal"/></div>
      <div className="receiver"><div className="receiver-light"/><strong>RECEIVER</strong><small>PHYSICAL CHECKPOINT</small><div className="gate-bars"/></div>
      <Robot kind="wren" active={!!wren?.active} denied={!!wren && !wren.active}/>
      {(juniperClaim || juniperGrant) && <Robot kind="juniper" active={!!juniperGrant?.active} denied={juniperReach && !juniperGrant}/>} 
      <div className="workbench"><div className="workpiece"><span>PROJECT<br/>NOTES</span><i/></div><div className="ticket"><b>JOB TICKET</b><strong>{scene.job?.jobId ?? "AWAITING JOB"}</strong><small>ONE PERSISTENT WORKPIECE</small></div></div>
      {juniperReach && !juniperGrant && <div className="failure"><b>×</b><span>PRE-GRANT ATTEMPT</span><strong>NO AUTHORITY</strong><small>claim only · no receipt minted</small></div>}
      <div className="history" data-testid="job-history"><h2>ATTACHED HISTORY <span>same job</span></h2>
        <div className="history-track">
          {scene.authorities.filter(a=>a.workerId==="wren").map(a=><div className="record grant wren-grant" key={a.mandateId}><i>OWNER</i><b>AUTHORITY</b><small>Wren · owner-signed</small></div>)}
          {checkpoints.slice(0,1).map(c=><div className="record checkpoint" key={c.seq}><i>01</i><b>CHECKPOINT</b><small>Wren · work advanced</small></div>)}
          {scene.receipts.filter(r=>r.helper==="wren").map((r,i)=><div className={`record receipt ${r.decision.toLowerCase()}`} key={r.id}><i>R{i+1}</i><b>{r.decision}</b><small>receiver receipt</small></div>)}
          {juniperGrant && <div className="record owner-grant" data-testid="owner-grant-record"><i>OWNER SEAL</i><b>OWNER GRANT RECORD</b><strong>JUNIPER</strong><small>authority granted · not a receipt</small></div>}
          {checkpoints.slice(1,2).map(c=><div className="record checkpoint" key={c.seq}><i>02</i><b>CHECKPOINT</b><small>Juniper · work advanced</small></div>)}
          {scene.receipts.filter(r=>r.helper==="juniper").map((r,i)=><div className="record receipt allowed" key={r.id}><i>R{scene.receipts.filter(x=>x.helper==="wren").length+i+1}</i><b>{r.decision}</b><small>receiver receipt</small></div>)}
        </div>
      </div>
    </section>
    <footer><div><span>NOW</span><strong>{phase}</strong></div><div className="counts"><span><b>{scene.receipts.length}</b> RECEIVER RECEIPTS</span><span><b>{checkpoints.length}</b> CHECKPOINTS</span><span><b>{juniperGrant ? 1 : 0}</b> OWNER GRANT RECORD</span></div></footer>
  </main>;
}

declare global { interface Window { __heroDebug?: unknown } }
