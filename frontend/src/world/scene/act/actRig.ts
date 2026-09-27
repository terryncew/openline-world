/**
 * actRig.ts — the character action rig (Track 2).
 *
 * A deterministic, model-call-free animation controller that drives any of
 * the four figures through readable physical behavior: walking with weight
 * (stride or waddle gait, no sliding), turning, reaching, carrying, placing,
 * looking, and reacting.
 *
 * Design:
 *  - The rig owns locomotion (world position + heading + gait) and a pose
 *    (torso/head/arm targets, damped toward their marks each frame).
 *  - A behavior is an entry plan (a short step list: go/face/take/place/
 *    release/hold) followed by a sustain loop (the pose the figure holds
 *    while the workflow state persists).
 *  - The rig never invents state: behaviors are set from outside, from real
 *    backend workflow state (see bindBehavior.ts). The rig only moves.
 *  - Reduced motion snaps to final poses; frozen (disconnected) holds still.
 *
 * Honesty note: idle motion (breathing, blinking, weight shifts, glances)
 * is decorative and must never imply productive work — the sustain poses
 * for productive states only run while the matching backend state holds.
 */
import * as THREE from "three";

/** Workflow-derived figure behaviors. The rig performs them; bindBehavior.ts
 *  decides them, from backend state only. */
export type FigureBehavior =
  | "idle"            // at home, decorative life only
  | "discovering"     // walk to the exchange board, lean in, examine
  | "proposing"       // stand at a counter, present the offer across it
  | "working"         // at the workbench: visibly write / tidy papers
  | "submitting"      // carry the work object to the review end, set it down
  | "awaiting_review" // wait at the receiving tray, object on the tray
  | "accepted"        // release the object — it goes to the cabinet/receiver
  | "delivering"      // kiosk host: carry the accepted object to the tray, set it down
  | "refused"         // calmly take the object back, return home
  | "attending"       // counterpart: walk to their booth, examine the proposal
  | "receiving"       // counterpart: take the accepted object, file it deliberately
  | "returning"       // counterpart: hand the refused object back, calmly
  | "awaiting"        // backend says awaiting_approval: still, calm, at home
  | "still";          // backend says paused/held/revoked: hold, no drift

/** Named world spots the choreography walks between. Built once per scene
 *  layout in WorldScene (see buildActAnchors). */
export interface ActAnchors {
  home: THREE.Vector3;
  boardSpot: THREE.Vector3;
  boardLook: THREE.Vector3;
  benchWork: THREE.Vector3;
  benchLook: THREE.Vector3;
  traySpot: THREE.Vector3;
  trayTop: THREE.Vector3;
  cabinetSpot: THREE.Vector3;
  cabinetTop: THREE.Vector3;
  /** where a fresh record's flight starts (the review end) */
  recordFrom: THREE.Vector3;
  counterStand: (x: number) => THREE.Vector3;
  counterLook: (x: number) => THREE.Vector3;
  /** idle wander waypoints (Wren); empty = stay home */
  wander: THREE.Vector3[];
}

export type Gait = "stride" | "waddle";

/** The mesh handles the rig drives. Legs/arms/eyes are optional — figures
 *  without them (Juniper's dome, the traveler's hood) get the waddle or a
 *  still hold instead. */
export interface RigHandles {
  root: THREE.Group | null;   // world position + heading
  torso: THREE.Group | null;  // bob, lean, roll
  head: THREE.Group | null;   // gaze
  eyes?: THREE.Group | null;
  armL?: THREE.Group | null;  // shoulder pivots; rotation.x<0 reaches forward
  armR?: THREE.Group | null;
  legL?: THREE.Group | null;  // hip pivots; swing on rotation.x
  legR?: THREE.Group | null;
}

/** Per-behavior context supplied alongside setBehavior. */
export interface BehaviorCtx {
  /** receiving-counter booth x for proposing / attending */
  boothX?: number | null;
  /** small per-figure offset so two tray objects never z-fight */
  traySlot?: number;
}

type Step =
  | { k: "go"; to: THREE.Vector3 }
  | { k: "face"; at: THREE.Vector3; hold?: number }
  | { k: "hold"; s: number }
  | { k: "take" }
  | { k: "place" }
  | { k: "release" }
  | { k: "inspect"; s: number } // folio check: hold the carried folio, open it,
    // look at it, close it — before carrying on. A read of what is carried,
    // never proof the contents were verified. Runs only inside behaviors the
    // backend actually staged (submitting / delivering / receiving).
  | { k: "stepback"; d: number };

export type HeldObject = "hidden" | "held" | "placed" | "flying";

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function damp(cur: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(cur, target, lambda, dt);
}
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pose {
  torsoX: number; torsoY: number;
  headX: number; headY: number;
  armLx: number; armRx: number; armLz: number; armRz: number;
}
const NEUTRAL: Pose = { torsoX: 0, torsoY: 0, headX: 0, headY: 0, armLx: 0, armRx: 0, armLz: 0.08, armRz: -0.08 };

/**
 * ActRig — one per figure. Call setBehavior() when the derived behavior
 * changes, then rig.update() every frame with the figure's handles.
 */
export class ActRig {
  readonly pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  gaitPhase = 0;
  gait: Gait = "stride";
  behavior: FigureBehavior = "idle";
  /** true while the figure is under locomotion this frame (lets figures
   *  layer personality, e.g. Wren's hop, on top of the walk) */
  locomoting = false;
  /** 0..1 — how much gait is in the legs right now */
  gaitAmount = 0;
  /** playback tempo multiplier for staged performances (software-rendered
   *  captures run slow; a tempo > 1 keeps the acting at real-time pace).
   *  Presentation speed only — never changes state or timing semantics. */
  timeScale = 1;
  obj: HeldObject = "hidden";
  /** 0..1 — the carried folio's open hinge, driven by the inspect step.
   *  Figures read this to open the folio and look at it. Presentation
   *  only: the inspection beat itself comes from the staged plan, which
   *  comes from the backend's stage. */
  folioOpen = 0;
  /** world-space flight of the released object (mode "flying") */
  readonly objFrom = new THREE.Vector3();
  readonly objTo = new THREE.Vector3();
  objT = 0;

  private plan: Step[] = [];
  private stepIdx = 0;
  private stepT = 0;
  /** latched destination for the stepback step (see execStep) */
  private stepLatch = new THREE.Vector3();
  private stepLatchIdx = -1;
  private sustainT = 0;
  private ctx: BehaviorCtx = {};
  private pose: Pose = { ...NEUTRAL };
  private torsoBaseY = 0;
  private torsoBaseX = 0;
  private rng: () => number;
  private wanderIdx = 0;
  private nextWander = 0;
  private nextBlink = 2;
  private blinkT = 99;
  /** component-set: walk here even while idle (Wren's curiosity dart) */
  overrideTarget: THREE.Vector3 | null = null;

  constructor(seed: number) {
    this.rng = mulberry(seed);
    this.nextWander = 2 + this.rng() * 3;
    this.nextBlink = 1.5 + this.rng() * 3;
  }

  setBehavior(b: FigureBehavior, ctx: BehaviorCtx = {}): void {
    if (b === this.behavior && ctx.boothX === this.ctx.boothX && ctx.traySlot === this.ctx.traySlot) return;
    this.behavior = b;
    this.ctx = { ...ctx };
    this.plan = []; // rebuilt lazily on the next update, once anchors exist
    this.stepIdx = 0;
    this.stepT = 0;
    this.stepLatchIdx = -1;
    this.sustainT = 0;
    // entering a behavior never invents the object: it appears only where
    // the workflow genuinely hands the figure something to carry.
    if (b !== "submitting" && b !== "awaiting_review" && b !== "accepted" && b !== "refused" && b !== "proposing"
      && b !== "receiving" && b !== "returning" && b !== "delivering") {
      this.obj = "hidden";
    }
    if (b === "proposing") this.obj = "held";
  }

  /** world position where the held object should appear while placed */
  trayRest(anchors: ActAnchors): THREE.Vector3 {
    const s = this.ctx.traySlot ?? 0;
    return _v2.set(anchors.trayTop.x + s * 0.22, anchors.trayTop.y, anchors.trayTop.z).clone();
  }

  private planFor(b: FigureBehavior, a: ActAnchors): Step[] {
    const bx = this.ctx.boothX ?? 0;
    switch (b) {
      case "discovering":
        return [
          { k: "go", to: a.boardSpot },
          { k: "face", at: a.boardLook, hold: 0.4 },
        ];
      case "proposing":
        return [
          { k: "go", to: a.counterStand(bx) },
          { k: "face", at: a.counterLook(bx), hold: 0.5 },
        ];
      case "working":
        return [
          { k: "go", to: a.benchWork },
          { k: "face", at: a.benchLook, hold: 0.4 },
        ];
      case "submitting":
        // pick the work up at the bench, check the folio in hand (open,
        // look, close — a read of what is carried, never a verification),
        // carry it to the review end, set it on the receiving tray,
        // step back — then sustain as awaiting_review.
        return [
          { k: "go", to: a.benchWork },
          { k: "face", at: a.benchLook, hold: 0.3 },
          { k: "take" },
          { k: "inspect", s: 2.2 },
          { k: "go", to: a.traySpot },
          { k: "face", at: a.trayTop, hold: 0.3 },
          { k: "place" },
          { k: "stepback", d: 0.45 },
        ];
      case "awaiting_review":
        return [
          { k: "go", to: a.traySpot },
          { k: "face", at: a.trayTop, hold: 0.4 },
        ];
      case "accepted":
        // released: step back from the tray, hands open — calm. The object
        // goes to the receiver/cabinet via the staged token and the record
        // flight; the figure does not carry it (no second object).
        return [
          { k: "go", to: a.traySpot },
          { k: "face", at: a.trayTop, hold: 0.4 },
          { k: "hold", s: 1.4 },
        ];
      case "delivering":
        // kiosk host: check the accepted folio in hand (open, look, close),
        // carry it to the tray and set it down — take first (he's been
        // presenting it), then place on the tray.
        // Kiosk anchor convention: traySpot = stand at the counter,
        // trayTop = the object on the tray.
        return [
          { k: "take" },
          { k: "inspect", s: 2.2 },
          { k: "go", to: a.traySpot },
          { k: "face", at: a.trayTop, hold: 0.5 },
          { k: "place" },
          { k: "stepback", d: 0.4 },
        ];
      case "refused":
        // calm: take the object back, hold it close, walk home. No shake,
        // no red flash, no drama — a refusal is an ordinary outcome.
        return [
          { k: "go", to: a.traySpot },
          { k: "face", at: a.trayTop, hold: 0.3 },
          { k: "take" },
          { k: "stepback", d: 0.4 },
          { k: "go", to: a.home },
        ];
      case "attending":
        return [
          { k: "go", to: a.counterStand(bx) },
          { k: "face", at: a.counterLook(bx), hold: 0.5 },
        ];
      case "receiving":
        // take the accepted object from the counter, check the folio in
        // hand (open, look, close), file it in the records drawer —
        // measured, deliberate. Kiosk anchor convention:
        // traySpot = stand at the counter, trayTop = the object on the
        // tray, cabinetSpot = drawer approach, cabinetTop = drawer interior.
        return [
          { k: "go", to: a.traySpot },
          { k: "face", at: a.trayTop, hold: 0.7 },
          { k: "take" },
          { k: "inspect", s: 1.8 },
          { k: "go", to: a.cabinetSpot },
          { k: "face", at: a.cabinetTop, hold: 0.5 },
          { k: "place" },
          { k: "stepback", d: 0.4 },
        ];
      case "returning":
        // hand the refused object back: face the other party, extend both
        // hands in a calm push-back, hold a beat, then rest. No shake, no
        // flash, no drama — a refusal is an ordinary outcome.
        return [
          { k: "go", to: a.counterStand(bx) },
          { k: "face", at: a.counterLook(bx), hold: 1.6 },
        ];
      case "awaiting":
      case "still":
        return [{ k: "go", to: a.home }, { k: "hold", s: 0.2 }];
      case "idle":
      default:
        return [{ k: "go", to: a.home }];
    }
  }

  update(
    dt: number, t: number, h: RigHandles,
    env: { reducedMotion: boolean; frozen: boolean; anchors: ActAnchors; pose: "full" | "loco" }
  ): void {
    if (env.frozen || dt <= 0) return;
    // performance tempo: scales every timed element equally (walk, gait,
    // damps, blinks). Presentation speed only — state timing is untouched.
    dt = Math.min(dt, 0.05) * this.timeScale;
    const a = env.anchors;
    if (this.plan.length === 0) this.plan = this.planFor(this.behavior, a);

    this.locomoting = false;
    const step = this.plan[this.stepIdx];
    if (step) {
      this.stepT += dt;
      const done = this.execStep(step, dt, a, env.reducedMotion);
      if (done) { this.stepIdx++; this.stepT = 0; }
    }
    // the folio hinge follows the inspect step: open while inspecting,
    // closed everywhere else. Presentation only — the beat itself is in
    // the staged plan, which only the backend's stage selects.
    const inspecting = !env.reducedMotion && !!step && step.k === "inspect";
    this.folioOpen = env.reducedMotion
      ? 0
      : THREE.MathUtils.damp(this.folioOpen, inspecting ? 1 : 0, 6, dt);

    if (env.pose === "full") {
      if (this.stepIdx >= this.plan.length) {
        this.sustainT += dt;
        this.sustain(dt, t, h, a, env.reducedMotion);
      } else {
        // entry in progress: keep whatever pose the step is shaping, add a
        // slight forward lean while walking
        const p = { ...this.pose };
        if (step.k === "go" && this.speed > 0.2) p.torsoX = 0.07;
        if (this.obj === "held" && step.k !== "take" && step.k !== "place") {
          // carrying: stable cradle pose, damped smoothly, no oscillation
          // (the gait swing is suppressed in applyPose while carrying).
          // The take and place steps shape their own deliberate arm
          // gestures and are left alone.
          p.armLx = -0.68; p.armRx = -0.68; p.armLz = 0.25; p.armRz = -0.25;
        } else if (this.obj !== "held" && step.k === "stepback") {
          // just set the object down: hands ease back toward rest.
          p.armLx = -0.12; p.armRx = -0.12; p.armLz = 0; p.armRz = 0;
        }
        this.applyPose(dt, t, h, p, env.reducedMotion);
      }
    } else {
      // locomotion-only: the figure keeps its own pose code (Wren/Juniper's
      // established personalities). The rig only walks it — position,
      // heading, gait — and breathes/blinks.
      if (this.stepIdx >= this.plan.length) this.sustainLoco(dt, t, h, a, env.reducedMotion);
      else this.applyLoco(dt, h);
    }

    // the released object's flight is world-space; it keeps flying even
    // while the figure settles.
    if (this.obj === "flying") {
      this.objT += dt / 1.25;
      if (this.objT >= 1) { this.obj = "hidden"; this.objT = 0; }
    }

    this.idleLife(dt, t, h, env.reducedMotion);
    this.applyRoot(h);
  }

  /** Idle wander / override walks without touching the figure's own pose. */
  private sustainLoco(dt: number, t: number, h: RigHandles, a: ActAnchors, rm: boolean): void {
    if (a.wander.length > 0 && this.overrideTarget == null && !rm) {
      if (t > this.nextWander) {
        this.nextWander = t + 3 + this.rng() * 4;
        this.wanderIdx = Math.floor(this.rng() * a.wander.length);
      }
      const wp = a.wander[this.wanderIdx];
      if (wp && this.pos.distanceTo(wp) > 0.3) this.walkToward(wp, dt, 1.1);
      else this.speed = damp(this.speed, 0, 6, dt);
    } else if (this.overrideTarget && !rm) {
      this.walkToward(this.overrideTarget, dt, 2.2);
    } else {
      this.speed = damp(this.speed, 0, 6, dt);
    }
    this.applyLoco(dt, h);
  }

  /** Gait visuals only: legs swing, torso bobs and rolls with the stride.
   *  Rotation.x of the torso stays the figure's own business. */
  private applyLoco(dt: number, h: RigHandles): void {
    const g = this.gaitAmount;
    const ph = this.gaitPhase;
    if (h.torso) {
      const bob = this.gait === "stride" ? Math.abs(Math.sin(ph)) * 0.055 * g : Math.abs(Math.sin(ph)) * 0.04 * g;
      h.torso.position.y = this.torsoBaseY + bob;
      h.torso.position.x = this.torsoBaseX + Math.sin(ph) * (this.gait === "stride" ? 0.035 : 0.05) * g;
      h.torso.rotation.z = Math.sin(ph) * (this.gait === "stride" ? 0.045 : 0.075) * g;
    }
    if (h.legL && this.gait === "stride") {
      h.legL.rotation.x = damp(h.legL.rotation.x, Math.sin(this.gaitPhase) * 0.55 * this.gaitAmount, 18, dt);
    }
    if (h.legR && this.gait === "stride") {
      h.legR.rotation.x = damp(h.legR.rotation.x, -Math.sin(this.gaitPhase) * 0.55 * this.gaitAmount, 18, dt);
    }
  }

  private execStep(step: Step, dt: number, a: ActAnchors, rm: boolean): boolean {
    switch (step.k) {
      case "go": {
        if (rm) { this.pos.copy(step.to); this.speed = 0; return true; }
        return this.walkToward(step.to, dt);
      }
      case "face": {
        const arrived = this.turnToward(step.at, dt, rm);
        return arrived && this.stepT >= (step.hold ?? 0);
      }
      case "hold": return this.stepT >= step.s;
      case "take": {
        // bend, take the object — the bend sells the pickup. Pose targets
        // only; applyPose damps toward them (never fight the arm drivers).
        this.pose.torsoX = 0.5;
        this.pose.armRx = -0.7;
        if (this.stepT > (rm ? 0 : 0.55)) { this.obj = "held"; return true; }
        return false;
      }
      case "place": {
        this.pose.torsoX = 0.42;
        this.pose.armLx = -0.95;
        this.pose.armRx = -0.95;
        if (this.stepT > (rm ? 0 : 0.6)) { this.obj = "placed"; return true; }
        return false;
      }
      case "inspect": {
        // stand still, feet planted; hold the carried folio at reading
        // height in both hands. The folio hinge opens while this step runs
        // (see folioOpen in update); the figure's head follows. Not a
        // verification — just a read of what is carried.
        if (rm) { this.obj = "held"; return true; }
        this.locomoting = false;
        this.speed = 0;
        this.pose.torsoX = 0.22;
        this.pose.armLx = -0.55;
        this.pose.armRx = -0.55;
        return this.stepT >= step.s;
      }
      case "release": {
        // extend both arms toward the cabinet; the object arcs over
        this.pose.armLx = -1.25;
        this.pose.armRx = -1.25;
        this.pose.torsoX = 0.18;
        if (this.stepT > (rm ? 0 : 0.5) && this.obj !== "flying") {
          this.objFrom.copy(this.pos).add(_v1.set(0, 1.1, 0));
          // launch from the hands toward the cabinet
          const dir = _v1.set(Math.sin(this.heading), 0, Math.cos(this.heading));
          this.objFrom.addScaledVector(dir, 0.45);
          this.objTo.copy(a.cabinetTop);
          this.obj = "flying";
          this.objT = 0;
        }
        if (this.obj === "flying" && this.objT >= 1) return true;
        if (rm) { this.obj = "hidden"; return true; }
        return false;
      }
      case "stepback": {
        // latch the destination once when the step starts: "0.45 behind
        // me" recomputed every frame is a moving target the walkToward
        // arrival check (dist < 0.14) can never reach — the figure would
        // circle the tray forever instead of settling into its sustain.
        if (this.stepLatchIdx !== this.stepIdx) {
          this.stepLatchIdx = this.stepIdx;
          const dir = _v1.set(Math.sin(this.heading), 0, Math.cos(this.heading));
          this.stepLatch.copy(this.pos).addScaledVector(dir, -step.d);
        }
        if (rm) { this.pos.copy(this.stepLatch); return true; }
        return this.walkToward(this.stepLatch, dt, 0.6);
      }
      default: return true;
    }
  }

  /** Walk toward a point with weight: turn first when the angle is wide,
   *  accelerate/decelerate, gait in the legs, bob and roll in the torso. */
  private walkToward(target: THREE.Vector3, dt: number, maxSpeed = 1.7): boolean {
    _v1.copy(target).sub(this.pos); _v1.y = 0;
    const dist = _v1.length();
    const want = Math.atan2(_v1.x, _v1.z);
    const diff = wrapAngle(want - this.heading);
    const turning = Math.abs(diff) > 0.85;
    const targetSpeed = dist < 0.14 ? 0 : turning ? 0.5 : maxSpeed;
    this.speed = damp(this.speed, targetSpeed, 5, dt);
    // the turn itself has weight: pivot with a small dip, don't snap
    const turnRate = 3.4 * Math.min(1, 0.35 + this.speed * 0.4);
    this.heading += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    // never overshoot the target in one frame (low-fps + tempo scaling can
    // move further than the arrival radius, causing endless oscillation)
    const move = Math.min(this.speed * dt, dist);
    this.pos.x += Math.sin(this.heading) * move;
    this.pos.z += Math.cos(this.heading) * move;
    this.gaitPhase += dt * (2.4 + this.speed * 3.6);
    this.locomoting = this.speed > 0.12;
    this.gaitAmount = damp(this.gaitAmount, this.locomoting ? 1 : 0, 6, dt);
    return dist < 0.14 && this.speed < 0.18;
  }

  private turnToward(at: THREE.Vector3, dt: number, rm: boolean): boolean {
    _v1.copy(at).sub(this.pos);
    const want = Math.atan2(_v1.x, _v1.z);
    const diff = wrapAngle(want - this.heading);
    if (rm) { this.heading = want; return true; }
    const turnRate = 3.2;
    this.heading += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    this.gaitPhase += dt * 2.2; // a small pivot shuffle, not a glide
    this.gaitAmount = damp(this.gaitAmount, 0.35, 6, dt);
    this.locomoting = Math.abs(diff) > 0.08;
    return Math.abs(wrapAngle(want - this.heading)) < 0.06;
  }

  /** Where the figure wants to be standing when the behavior sustains. */
  private sustain(dt: number, t: number, h: RigHandles, a: ActAnchors, rm: boolean): void {
    const bx = this.ctx.boothX ?? 0;
    const p: Pose = { ...NEUTRAL };
    switch (this.behavior) {
      case "discovering":
        // lean in, examine: head scans the board slowly
        p.torsoX = 0.24; p.headX = 0.3;
        p.headY = Math.sin(t * 0.55 + 1) * 0.5;
        p.armLx = -0.15; p.armRx = -0.15;
        this.gazeAt(a.boardLook, 0.6);
        break;
      case "proposing":
        // present the offer across the counter, both hands
        p.torsoX = 0.1; p.headX = 0.12;
        p.armLx = -1.12; p.armRx = -1.12; p.armLz = 0.28; p.armRz = -0.28;
        this.gazeAt(a.counterLook(bx), 0.8);
        // one small confirming nod on arrival
        if (this.sustainT < 0.9) p.headX += Math.sin((this.sustainT / 0.9) * Math.PI) * 0.18;
        break;
      case "working": {
        // lean over the papers; the right hand visibly writes, the left
        // steadies the sheet; every few seconds the left hand tidies
        p.torsoX = 0.4; p.headX = 0.44;
        p.armLx = -0.72; p.armLz = 0.15;
        const writing = Math.sin(t * 7.3) * 0.13 + Math.sin(t * 13.7) * 0.05;
        p.armRx = -0.88 + writing;
        p.armRz = -0.12 + Math.sin(t * 7.3) * 0.04;
        const tidyCycle = (t % 7) / 7;
        if (tidyCycle > 0.86) {
          const k = Math.sin(((tidyCycle - 0.86) / 0.14) * Math.PI);
          p.armLx = -0.72 - k * 0.25; p.armLz = 0.15 + k * 0.3; // sweep the sheet straight
        }
        this.gazeAt(a.benchLook, 0.9);
        break;
      }
      case "submitting":
        // entry plan ends placed + stepped back: sustain as awaiting_review
        this.behaviorSustainAwaiting(p, t, a);
        break;
      case "awaiting_review":
        this.behaviorSustainAwaiting(p, t, a);
        break;
      case "accepted":
        // released; calm at the cabinet, then the binding walks it home
        p.headX = 0.08;
        p.armLx = -0.2; p.armRx = -0.2;
        this.gazeAt(a.cabinetTop, 0.5);
        break;
      case "delivering":
        // delivered to the tray; calm, hands open, gaze on the tray
        p.headX = 0.1;
        p.armLx = -0.15; p.armRx = -0.15;
        this.gazeAt(a.trayTop, 0.5);
        break;
      case "refused":
        // holding the returned object close; walks home via the plan
        p.armLx = -0.55; p.armRx = -0.55; p.armLz = 0.35; p.armRz = -0.35;
        p.headX = 0.12; p.torsoX = 0.05;
        break;
      case "attending":
        // the counterpart examines what was proposed across their counter
        p.torsoX = 0.22; p.headX = 0.3;
        p.headY = Math.sin(t * 0.4) * 0.3;
        this.gazeAt(a.counterLook(bx), 0.7);
        break;
      case "receiving":
        // filed: calm at the drawer, hands rest, eyes on the filed object
        p.torsoX = 0.12; p.headX = 0.3;
        p.armLx = -0.25; p.armRx = -0.25;
        this.gazeAt(a.cabinetTop, 0.7);
        break;
      case "returning": {
        // the gentle push-back: both hands extend toward the other party,
        // hold a beat, then ease back to rest
        p.torsoX = 0.08; p.headX = 0.1;
        const push = this.sustainT < 1.6 ? 1 : Math.max(0, 1 - (this.sustainT - 1.6) * 2);
        p.armLx = -0.95 * push - 0.1; p.armRx = -0.95 * push - 0.1;
        p.armLz = 0.15; p.armRz = -0.15;
        this.gazeAt(a.counterLook(bx), 0.8);
        break;
      }
      case "awaiting":
        p.headX = 0.06; // stopped, waiting quietly for the owner's decision
        break;
      case "still":
        break; // hold exactly; no drift
      case "idle":
      default: {
        // wander between waypoints when the figure has them (Wren)
        if (a.wander.length > 0 && this.overrideTarget == null && !rm) {
          if (t > this.nextWander) {
            this.nextWander = t + 3 + this.rng() * 4;
            this.wanderIdx = Math.floor(this.rng() * a.wander.length);
          }
          const wp = a.wander[this.wanderIdx];
          if (wp && this.pos.distanceTo(wp) > 0.3) this.walkToward(wp, dt, 1.1);
          else this.speed = damp(this.speed, 0, 6, dt);
        } else if (this.overrideTarget && !rm) {
          // a directed walk that overrides idle (Wren's curiosity dart)
          this.walkToward(this.overrideTarget, dt, 2.2);
        } else if (rm) {
          this.speed = 0;
          if (this.overrideTarget) this.pos.copy(this.overrideTarget);
          else if (a.wander.length === 0) this.pos.copy(a.home);
        }
        break;
      }
    }
    this.applyPose(dt, t, h, p, rm);
  }

  private behaviorSustainAwaiting(p: Pose, t: number, a: ActAnchors): void {
    // wait at the tray: still, breathing, eyes on the object, an
    // occasional glance around — waiting is not a verdict
    p.torsoX = 0.03; p.headX = 0.22;
    p.armLx = -0.1; p.armRx = -0.1;
    this.gazeAt(a.trayTop, 0.85);
    if ((t % 9) > 7.5) p.headY = Math.sin(t * 1.3) * 0.7; // glance around, then back
  }

  /** Point the head at a world target (clamped, damped). */
  private gazeAt(at: THREE.Vector3, weight: number): void {
    _v1.copy(at).sub(this.pos);
    const yaw = wrapAngle(Math.atan2(_v1.x, _v1.z) - this.heading);
    const dist = Math.hypot(_v1.x, _v1.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(_v1.y - 1.1, Math.max(dist, 0.4)), -0.6, 0.7);
    this.pose.headY = damp(this.pose.headY, THREE.MathUtils.clamp(yaw, -0.85, 0.85) * weight, 5, 0.016);
    this.pose.headX = damp(this.pose.headX, THREE.MathUtils.clamp(pitch, -0.5, 0.6) * weight, 5, 0.016);
  }

  /** Decorative idle life: breathing, blinking, weight shifts, glances.
   *  Never implies productive work. Skipped under reduced motion. */
  private idleLife(dt: number, t: number, h: RigHandles, rm: boolean): void {
    if (rm || !h.torso) return;
    if (t > this.nextBlink) { this.nextBlink = t + 2.2 + this.rng() * 3.4; this.blinkT = 0; }
    this.blinkT += dt;
    if (h.eyes) {
      const shut = this.blinkT < 0.13 ? 0.12 : 1;
      h.eyes.scale.y = damp(h.eyes.scale.y, shut, 30, dt);
    }
    // breathing rides on top of whatever the pose set
    h.torso.position.y += Math.sin(t * 1.35 + this.gaitPhase * 0.1) * 0.012;
    const s = h.torso.scale;
    s.y = damp(s.y, 1 + Math.sin(t * 1.35) * 0.008, 4, dt);
  }

  private applyPose(dt: number, t: number, h: RigHandles, p: Pose, rm: boolean): void {
    const L = rm ? 60 : 7; // reduced motion: snap
    const q = this.pose;
    q.torsoX = damp(q.torsoX, p.torsoX, L, dt);
    q.headX = damp(q.headX, p.headX, L, dt);
    q.headY = damp(q.headY, p.headY, L, dt);
    q.armLx = damp(q.armLx, p.armLx, L, dt);
    q.armRx = damp(q.armRx, p.armRx, L, dt);
    q.armLz = damp(q.armLz, p.armLz, L, dt);
    q.armRz = damp(q.armRz, p.armRz, L, dt);

    if (h.torso) {
      const g = this.gaitAmount;
      const ph = this.gaitPhase;
      const bobY = this.gait === "stride" ? Math.abs(Math.sin(ph)) * 0.055 * g : Math.abs(Math.sin(ph)) * 0.04 * g;
      h.torso.position.y = this.torsoBaseY + bobY;
      h.torso.position.x = this.torsoBaseX + (this.gait === "stride" ? Math.sin(ph) * 0.035 * g : Math.sin(ph) * 0.05 * g);
      h.torso.rotation.x = q.torsoX + (this.speed > 0.15 ? 0.06 : 0);
      h.torso.rotation.z = this.gait === "stride" ? Math.sin(ph) * 0.045 * g : Math.sin(ph) * 0.075 * g;
    }
    if (h.head) {
      h.head.rotation.x = damp(h.head.rotation.x, q.headX, L, dt);
      // gaze targets set headY directly via gazeAt; idle glances add on
      const glance = this.behavior === "idle" || this.behavior === "awaiting" || this.behavior === "awaiting_review"
        ? Math.sin(t * 0.5) * 0.12 : 0;
      h.head.rotation.y = damp(h.head.rotation.y, q.headY + glance, L, dt);
    }
    if (h.armL) {
      // carrying the object: suppress the gait swing — the arms hold the
      // cradle pose set by the step/sustain targets, with no pumping.
      const swing = this.gait === "stride" && this.obj !== "held" ? -Math.sin(this.gaitPhase) * 0.38 * this.gaitAmount : 0;
      h.armL.rotation.x = damp(h.armL.rotation.x, q.armLx + swing, L, dt);
      h.armL.rotation.z = damp(h.armL.rotation.z, q.armLz, L, dt);
    }
    if (h.armR) {
      // carrying the object: suppress the gait swing — see armL.
      const swing = this.gait === "stride" && this.obj !== "held" ? Math.sin(this.gaitPhase) * 0.38 * this.gaitAmount : 0;
      h.armR.rotation.x = damp(h.armR.rotation.x, q.armRx + swing, L, dt);
      h.armR.rotation.z = damp(h.armR.rotation.z, q.armRz, L, dt);
    }
    if (h.legL && this.gait === "stride") {
      h.legL.rotation.x = damp(h.legL.rotation.x, Math.sin(this.gaitPhase) * 0.55 * this.gaitAmount, 18, dt);
    }
    if (h.legR && this.gait === "stride") {
      h.legR.rotation.x = damp(h.legR.rotation.x, -Math.sin(this.gaitPhase) * 0.55 * this.gaitAmount, 18, dt);
    }
  }

  private applyRoot(h: RigHandles): void {
    if (h.root) {
      h.root.position.copy(this.pos);
      h.root.rotation.y = this.heading;
    }
  }

  /** Call once when handles mount so the rig's base offsets match the mesh. */
  captureBase(h: RigHandles): void {
    if (h.torso) { this.torsoBaseY = h.torso.position.y; this.torsoBaseX = h.torso.position.x; }
  }

  /** Set the torso base height directly (when the React prop hasn't applied yet). */
  setTorsoBase(y: number, x: number): void {
    this.torsoBaseY = y;
    this.torsoBaseX = x;
  }

  /** Teleport home (mount / reduced-motion resets). */
  snapHome(a: ActAnchors): void {
    this.pos.copy(a.home);
    this.heading = 0;
    this.speed = 0;
  }
}
