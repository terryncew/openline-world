/**
 * Workshop sound identity — 100% synthesized locally with WebAudio.
 * No audio files, no network, no third-party assets.
 *
 * Every cue is deterministic: fixed frequencies, fixed envelopes, and a
 * seeded noise buffer. Nothing here is random in a way that matters.
 * Cues are only ever triggered from real backend events (SSE), never
 * speculatively — the sound never announces an outcome before it lands.
 */
export const SOUND_ATTRIBUTION =
  "All sounds synthesized locally with WebAudio. No third-party audio assets.";

/* Deterministic PRNG for the noise buffer (mulberry32, fixed seed). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type OscType = OscillatorType;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem("workshop-sound") === "off";
    } catch {
      this.muted = false;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem("workshop-sound", m ? "off" : "on");
    } catch {
      /* storage unavailable; mute still applies this session */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  /** Create/resume the context. Safe to call from any user gesture. */
  unlock(): boolean {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx.state === "running";
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    // seeded noise buffer, reused by every cue that needs texture
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    const rand = mulberry32(0x0be1);
    for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }

  private ready(): boolean {
    return !!this.ctx && !!this.master && !this.muted && this.ctx.state === "running";
  }

  private tone(opts: {
    freq: number;
    freqEnd?: number;
    type?: OscType;
    at?: number;
    dur?: number;
    gain?: number;
    curve?: "exp" | "lin";
  }) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.at ?? 0);
    const dur = opts.dur ?? 0.25;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 1), t0 + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    if (opts.curve === "lin") g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(opts: {
    at?: number;
    dur?: number;
    gain?: number;
    filterFreq?: number;
    filterEnd?: number;
    type?: BiquadFilterType;
    q?: number;
  }) {
    if (!this.ready() || !this.noiseBuf) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.at ?? 0);
    const dur = opts.dur ?? 0.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = opts.type ?? "bandpass";
    filt.frequency.setValueAtTime(opts.filterFreq ?? 1200, t0);
    if (opts.filterEnd) filt.frequency.exponentialRampToValueAtTime(opts.filterEnd, t0 + dur);
    filt.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.12;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* ---------------- cues ---------------- */

  /** UI tap. */
  ui() {
    this.tone({ freq: 660, type: "triangle", dur: 0.06, gain: 0.08 });
  }

  /** Soft wooden knock — the token takes a step toward the gate. */
  knock() {
    this.tone({ freq: 190, freqEnd: 95, type: "sine", dur: 0.11, gain: 0.22 });
    this.noise({ dur: 0.05, gain: 0.05, filterFreq: 900, type: "lowpass" });
  }

  /** Warm pluck — the receiver ALLOWED the action. */
  allow() {
    this.tone({ freq: 523.25, type: "triangle", dur: 0.5, gain: 0.16 });
    this.tone({ freq: 784, type: "triangle", dur: 0.55, gain: 0.1, at: 0.03 });
    this.tone({ freq: 1046.5, type: "sine", dur: 0.6, gain: 0.05, at: 0.06 });
  }

  /** Muted low thud — the receiver STOPPED the action. Gentle, not alarming. */
  refuse() {
    this.tone({ freq: 150, freqEnd: 70, type: "sine", dur: 0.22, gain: 0.24 });
    this.noise({ dur: 0.12, gain: 0.07, filterFreq: 420, type: "lowpass" });
    this.tone({ freq: 233, freqEnd: 196, type: "sine", dur: 0.3, gain: 0.07, at: 0.05 });
  }

  /** Paper swish — a signed receipt is filed. */
  paper() {
    this.noise({ dur: 0.28, gain: 0.1, filterFreq: 1400, filterEnd: 3600, q: 0.6 });
    this.noise({ dur: 0.2, gain: 0.05, filterFreq: 5200, at: 0.06 });
  }

  /** Deep stamp — the owner changed a mandate (revoke / onboard). */
  stamp() {
    this.tone({ freq: 120, freqEnd: 60, type: "sine", dur: 0.18, gain: 0.26 });
    this.noise({ dur: 0.09, gain: 0.1, filterFreq: 700, type: "lowpass" });
    this.tone({ freq: 392, type: "triangle", dur: 0.2, gain: 0.06, at: 0.1 });
  }

  /** Gentle rise — a helper arrives with a new mandate. */
  arrive() {
    this.tone({ freq: 392, type: "sine", dur: 0.3, gain: 0.1 });
    this.tone({ freq: 523.25, type: "sine", dur: 0.4, gain: 0.1, at: 0.14 });
  }

  /** Soft fall — a helper departs after revocation. */
  depart() {
    this.tone({ freq: 440, type: "sine", dur: 0.3, gain: 0.09 });
    this.tone({ freq: 329.63, type: "sine", dur: 0.42, gain: 0.09, at: 0.14 });
  }
}

export const sound = new SoundEngine();
