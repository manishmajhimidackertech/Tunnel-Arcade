// All sound is synthesised with WebAudio, so there are no audio files to download or cache.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A minor synthwave loop: Am - F - C - G.
const BARS = [
  { bass: 45, arp: [69, 72, 76, 72] },
  { bass: 41, arp: [65, 69, 72, 69] },
  { bass: 48, arp: [67, 72, 76, 72] },
  { bass: 43, arp: [67, 71, 74, 71] },
];
const BASS_STEPS = [0, 12, 0, 0, 12, 0, 0, 12];
const STEP_TIME = 60 / 132 / 4; // sixteenth notes at 132 BPM

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.engine = null;
    this.musicTimer = null;
  }

  // Must be called from a user gesture (autoplay policies).
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const c = this.ctx;
      this.master = c.createGain();
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp).connect(c.destination);
      this.sfxBus = c.createGain();
      this.musicBus = c.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.settings.sound ? 0.9 : 0, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.music ? 0.45 : 0, t, 0.02);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  tone(freq, dur, { type = 'square', vol = 0.15, at = 0, slideTo = null, bus = this.sfxBus } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  click() {
    this.tone(880, 0.06, { vol: 0.08 });
  }

  countdown(go) {
    if (go) {
      this.tone(880, 0.45, { vol: 0.16 });
      this.tone(1320, 0.45, { vol: 0.08, type: 'triangle' });
    } else {
      this.tone(440, 0.18, { vol: 0.14 });
    }
  }

  whoosh(strength = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = this.noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28 * strength, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.4);
  }

  // Slow-motion start (down) and end (up): a pitch sweep that lasts as long as the pace
  // change itself, with a shimmer on top.
  timeShift(down) {
    const [from, to] = down ? [880, 160] : [160, 880];
    const dur = down ? 0.9 : 1.5;
    this.tone(from, dur, { type: 'sine', vol: 0.3, slideTo: to });
    this.tone(from * 1.5, dur * 0.75, { type: 'triangle', vol: 0.08, slideTo: to * 1.5 });
    if (down) {
      this.tone(1568, 0.25, { type: 'square', vol: 0.05 });
      this.tone(2093, 0.3, { type: 'square', vol: 0.04, at: 0.08 });
    }
  }

  explosion() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = this.noiseSource();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    src.connect(lp).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 1.7);
    this.tone(110, 0.9, { type: 'sine', vol: 0.7, slideTo: 28 });
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, c.currentTime, 0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const oscs = [0, 7].map((detune) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      o.detune.value = detune;
      o.connect(lp);
      o.start();
      return o;
    });
    const hum = c.createGain();
    hum.gain.value = 0.05;
    lp.connect(hum).connect(out);
    const air = this.noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const airGain = c.createGain();
    airGain.gain.value = 0.02;
    air.connect(bp).connect(airGain).connect(out);
    air.start();
    out.connect(this.sfxBus);
    this.engine = { out, lp, oscs, air, airGain, bp };
  }

  // level: 0 (start speed) .. 1 (top speed); rate < 1 during slow motion drops the pitch
  setEngine(level, rate = 1) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    for (const o of e.oscs) o.frequency.setTargetAtTime((52 + level * 46) * (0.55 + 0.45 * rate), t, 0.1);
    e.lp.frequency.setTargetAtTime(320 + level * 900, t, 0.1);
    e.airGain.gain.setTargetAtTime(0.02 + level * 0.06, t, 0.1);
    e.bp.frequency.setTargetAtTime(700 + level * 1400, t, 0.1);
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.08);
    for (const o of e.oscs) o.stop(t + 0.5);
    e.air.stop(t + 0.5);
    this.engine = null;
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  scheduleMusic() {
    if (this.ctx.state !== 'running') {
      this.nextStepTime = this.ctx.currentTime + 0.05;
      return;
    }
    while (this.nextStepTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % (BARS.length * 16);
      this.nextStepTime += STEP_TIME;
    }
  }

  playStep(step, t) {
    const c = this.ctx;
    const bar = BARS[Math.floor(step / 16)];
    const s = step % 16;
    const bus = this.musicBus;
    const at = t - c.currentTime;

    if (s % 2 === 0) {
      const osc = c.createOscillator();
      const lp = c.createBiquadFilter();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = midi(bar.bass + BASS_STEPS[s / 2]);
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + STEP_TIME * 1.8);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP_TIME * 1.9);
      osc.connect(lp).connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + STEP_TIME * 2);
    }
    if (s % 4 === 0) this.tone(150, 0.16, { type: 'sine', vol: 0.5, at, slideTo: 42, bus });
    if (s % 4 === 2) {
      const src = this.noiseSource();
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp).connect(g).connect(bus);
      src.start(t, Math.random());
      src.stop(t + 0.06);
    }
    this.tone(midi(bar.arp[s % 4] + (s >= 8 ? 12 : 0)), STEP_TIME * 0.9, { type: 'square', vol: 0.035, at, bus });
  }
}
