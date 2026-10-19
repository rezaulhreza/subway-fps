// All sound is synthesised with Web Audio: guns, zombies, the train, the station hum and its reverb.
export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    // long, tiled-room reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.noise = this.noiseBuffer(2);
    this.brown = this.brownBuffer(4);
    this.ready = true;
    this.startAmbience();
    this.startTrainLoop();
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections then a smooth tail
        const early = i < rate * 0.08 && Math.random() < 0.004 ? 1 : 0;
        d[i] = ((Math.random() * 2 - 1) * 0.6 + early) * Math.pow(1 - t, decay) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
      }
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  brownBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  setListener(pos, forward, up) {
    if (!this.ready) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // Output node for a sound: optional 3D panner, dry and reverb sends.
  out(pos = null, wet = 0.4, gain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2.5;
      p.rolloffFactor = 1.1;
      p.maxDistance = 200;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p);
      node = p;
    }
    node.connect(this.dry);
    const s = ctx.createGain();
    s.gain.value = wet;
    node.connect(s).connect(this.reverb);
    return g;
  }

  noiseSrc(offset = Math.random()) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = 0;
    return { src: s, offset: offset * 1.5 };
  }

  burst(dest, { t = 0, dur = 0.1, type = 'lowpass', freq = 1000, q = 0.7, gain = 1, attack = 0.001, freqEnd = null, curve = 2 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const { src, offset } = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur * curve);
    src.connect(f).connect(g).connect(dest);
    src.start(now, offset);
    src.stop(now + dur * curve + 0.05);
  }

  tone(dest, { t = 0, dur = 0.2, type = 'sine', freq = 440, freqEnd = null, gain = 0.3, attack = 0.005 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(dest);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  shot(kind) {
    if (!this.ready) return;
    const d = this.out(null, kind === 'shotgun' ? 0.75 : 0.6, 1);
    const v = 0.9 + Math.random() * 0.2;
    if (kind === 'pistol') {
      this.burst(d, { dur: 0.05, type: 'highpass', freq: 1800 * v, gain: 0.9 });
      this.burst(d, { dur: 0.16, type: 'lowpass', freq: 2600 * v, freqEnd: 400, gain: 0.8 });
      this.tone(d, { dur: 0.14, freq: 160, freqEnd: 45, gain: 0.8 });
      this.burst(d, { t: 0.03, dur: 0.02, type: 'bandpass', freq: 3800, q: 4, gain: 0.25 }); // slide
    } else if (kind === 'rifle') {
      this.burst(d, { dur: 0.04, type: 'highpass', freq: 2400 * v, gain: 1.0 });
      this.burst(d, { dur: 0.12, type: 'lowpass', freq: 3800 * v, freqEnd: 600, gain: 0.85 });
      this.tone(d, { dur: 0.11, freq: 130, freqEnd: 40, gain: 0.9 });
      this.burst(d, { t: 0.02, dur: 0.015, type: 'bandpass', freq: 5000, q: 6, gain: 0.15 });
    } else {
      this.burst(d, { dur: 0.06, type: 'highpass', freq: 900 * v, gain: 1.0 });
      this.burst(d, { dur: 0.32, type: 'lowpass', freq: 1800 * v, freqEnd: 200, gain: 1.0 });
      this.tone(d, { dur: 0.26, freq: 95, freqEnd: 30, gain: 1.0 });
    }
  }

  dryFire() {
    if (!this.ready) return;
    const d = this.out(null, 0.1, 0.5);
    this.burst(d, { dur: 0.02, type: 'bandpass', freq: 3000, q: 3, gain: 0.6 });
  }

  mech(kind) {
    if (!this.ready) return;
    const d = this.out(null, 0.15, 0.6);
    const map = {
      magOut: [[0, 1400, 0.04, 0.5], [0.05, 600, 0.06, 0.3]],
      magIn: [[0, 900, 0.03, 0.7], [0.03, 2400, 0.02, 0.5]],
      slide: [[0, 2600, 0.03, 0.5], [0.1, 1800, 0.04, 0.6]],
      shell: [[0, 1800, 0.03, 0.5], [0.04, 700, 0.05, 0.4]],
      pump: [[0, 1100, 0.05, 0.7], [0.16, 1500, 0.05, 0.7]],
      swap: [[0, 900, 0.05, 0.3], [0.08, 2000, 0.03, 0.25]],
    };
    for (const [t, f, dur, g] of map[kind] || []) this.burst(d, { t, dur, type: 'bandpass', freq: f, q: 3, gain: g });
  }

  casing(pos) {
    if (!this.ready) return;
    const d = this.out(pos, 0.2, 0.18);
    const f = 4000 + Math.random() * 2500;
    this.tone(d, { dur: 0.08, freq: f, gain: 0.3 });
    this.tone(d, { t: 0.09, dur: 0.06, freq: f * 1.1, gain: 0.15 });
  }

  impact(pos, surface = 'hard') {
    if (!this.ready) return;
    const d = this.out(pos, 0.35, surface === 'flesh' ? 0.8 : 0.5);
    if (surface === 'flesh') {
      this.burst(d, { dur: 0.08, type: 'lowpass', freq: 700, gain: 0.8 });
      this.tone(d, { dur: 0.06, freq: 120, freqEnd: 60, gain: 0.5 });
    } else if (surface === 'metal') {
      this.tone(d, { dur: 0.25, freq: 1800 + Math.random() * 800, freqEnd: 1200, gain: 0.15, type: 'triangle' });
      this.burst(d, { dur: 0.03, type: 'highpass', freq: 3000, gain: 0.4 });
    } else {
      this.burst(d, { dur: 0.05, type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 1.5, gain: 0.5 });
      if (Math.random() < 0.25) this.tone(d, { t: 0.01, dur: 0.18, freq: 2600, freqEnd: 900, gain: 0.05, type: 'sawtooth' }); // ricochet whine
    }
  }

  headshot(pos) {
    if (!this.ready) return;
    const d = this.out(pos, 0.3, 0.9);
    this.burst(d, { dur: 0.12, type: 'lowpass', freq: 900, gain: 1 });
    this.burst(d, { t: 0.02, dur: 0.2, type: 'bandpass', freq: 400, q: 1, gain: 0.5 });
  }

  hitmark(kill) {
    if (!this.ready) return;
    const d = this.out(null, 0, 0.25);
    this.tone(d, { dur: 0.05, freq: kill ? 1500 : 2200, gain: 0.3, type: 'square' });
  }

  zombieGroan(pos, type) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const d = this.out(pos, 0.5, type === 'brute' ? 1.3 : 0.9);
    const base = type === 'brute' ? 55 : type === 'runner' ? 140 : 85 + Math.random() * 30;
    const dur = type === 'runner' ? 0.7 : 1.2 + Math.random() * 0.8;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500 + Math.random() * 300; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100 + Math.random() * 400; f2.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.15);
    g.gain.setTargetAtTime(0.35, now + 0.2, 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const mix = ctx.createGain();
    for (const det of [1, 1.013, 0.497]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * det * 1.15, now);
      o.frequency.linearRampToValueAtTime(base * det * (0.75 + Math.random() * 0.2), now + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4;
      const lg = ctx.createGain(); lg.gain.value = base * 0.06;
      lfo.connect(lg).connect(o.frequency);
      o.connect(mix);
      o.start(now); lfo.start(now);
      o.stop(now + dur + 0.1); lfo.stop(now + dur + 0.1);
    }
    mix.gain.value = 0.25;
    mix.connect(shaper);
    shaper.connect(f1).connect(g);
    shaper.connect(f2).connect(g);
    g.connect(d);
    this.burst(d, { dur: dur * 0.6, type: 'bandpass', freq: 1500, q: 0.8, gain: 0.12, attack: 0.1 });
  }

  zombieAttack(pos, type) {
    if (!this.ready) return;
    const d = this.out(pos, 0.4, 1);
    const f = type === 'brute' ? 90 : 240;
    this.tone(d, { dur: 0.35, freq: f * 1.6, freqEnd: f, gain: 0.25, type: 'sawtooth' });
    this.burst(d, { dur: 0.25, type: 'bandpass', freq: 1200, q: 1.2, gain: 0.4, attack: 0.03 });
  }

  zombieScream(pos) {
    if (!this.ready) return;
    const d = this.out(pos, 0.6, 0.9);
    this.tone(d, { dur: 0.9, freq: 520, freqEnd: 260, gain: 0.2, type: 'sawtooth', attack: 0.05 });
    this.tone(d, { dur: 0.9, freq: 780, freqEnd: 410, gain: 0.12, type: 'square', attack: 0.05 });
    this.burst(d, { dur: 0.8, type: 'bandpass', freq: 2200, q: 1, gain: 0.25, attack: 0.05 });
  }

  zombieDeath(pos) {
    if (!this.ready) return;
    const d = this.out(pos, 0.45, 0.8);
    this.tone(d, { dur: 0.6, freq: 160, freqEnd: 50, gain: 0.3, type: 'sawtooth' });
    this.burst(d, { t: 0.55, dur: 0.12, type: 'lowpass', freq: 300, gain: 0.8 }); // body hits floor
  }

  footstep(surface, loud = 1) {
    if (!this.ready) return;
    const d = this.out(null, 0.25, 0.22 * loud);
    if (surface === 'ballast') {
      this.burst(d, { dur: 0.09, type: 'bandpass', freq: 1800, q: 0.6, gain: 0.8 });
      this.burst(d, { t: 0.02, dur: 0.06, type: 'highpass', freq: 3500, gain: 0.4 });
    } else if (surface === 'metal') {
      this.burst(d, { dur: 0.05, type: 'lowpass', freq: 500, gain: 0.8 });
      this.tone(d, { dur: 0.12, freq: 210, gain: 0.08, type: 'triangle' });
    } else {
      this.burst(d, { dur: 0.05, type: 'lowpass', freq: 600 + Math.random() * 200, gain: 0.9 });
      this.burst(d, { t: 0.005, dur: 0.02, type: 'highpass', freq: 4000, gain: 0.25 });
    }
  }

  playerHurt() {
    if (!this.ready) return;
    const d = this.out(null, 0.2, 0.7);
    this.burst(d, { dur: 0.12, type: 'lowpass', freq: 500, gain: 1 });
    this.tone(d, { dur: 0.25, freq: 180, freqEnd: 120, gain: 0.25, type: 'sawtooth', attack: 0.02 });
  }

  heartbeat() {
    if (!this.ready) return;
    const d = this.out(null, 0, 0.6);
    this.tone(d, { dur: 0.12, freq: 60, freqEnd: 40, gain: 0.9 });
    this.tone(d, { t: 0.22, dur: 0.12, freq: 55, freqEnd: 38, gain: 0.6 });
  }

  pickup() {
    if (!this.ready) return;
    const d = this.out(null, 0.2, 0.4);
    this.tone(d, { dur: 0.08, freq: 880, gain: 0.3, type: 'triangle' });
    this.tone(d, { t: 0.07, dur: 0.12, freq: 1320, gain: 0.3, type: 'triangle' });
  }

  chime() {
    if (!this.ready) return;
    const d = this.out(null, 0.6, 0.5);
    this.tone(d, { dur: 0.9, freq: 784, gain: 0.35, attack: 0.01 });
    this.tone(d, { t: 0.45, dur: 1.2, freq: 622, gain: 0.35, attack: 0.01 });
  }

  doorSlide(pos) {
    if (!this.ready) return;
    const d = this.out(pos, 0.4, 0.8);
    this.burst(d, { dur: 0.25, type: 'bandpass', freq: 500, q: 1, gain: 0.6, attack: 0.02, curve: 3 });
    this.burst(d, { t: 0.05, dur: 0.6, type: 'highpass', freq: 3000, gain: 0.15, attack: 0.05 }); // pneumatics
    this.burst(d, { t: 0.95, dur: 0.06, type: 'lowpass', freq: 400, gain: 0.9 }); // thud
  }

  startAmbience() {
    const ctx = this.ctx;
    // fluorescent hum
    const hum = ctx.createGain();
    hum.gain.value = 0.018;
    for (const [f, g] of [[100, 1], [200, 0.5], [300, 0.25]]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(hum);
      o.start();
    }
    hum.connect(this.dry);
    this.humGain = hum;
    // air movement in the tunnels
    const air = ctx.createBufferSource();
    air.buffer = this.brown; air.loop = true;
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 260;
    const ag = ctx.createGain(); ag.gain.value = 0.22;
    air.connect(af).connect(ag).connect(this.dry);
    ag.connect(this.reverb);
    air.start();
    this.dripTimer = setInterval(() => this.drip(), 2600);
  }

  drip() {
    if (!this.ready || Math.random() < 0.4) return;
    const pos = { x: (Math.random() - 0.5) * 100, y: 0, z: -3 + Math.random() * 6 };
    const d = this.out(pos, 0.8, 0.35);
    const f = 900 + Math.random() * 900;
    this.tone(d, { dur: 0.09, freq: f, freqEnd: f * 2.2, gain: 0.25 });
  }

  startTrainLoop() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown; src.loop = true;
    const f = (this.trainFilter = ctx.createBiquadFilter());
    f.type = 'lowpass'; f.frequency.value = 120; f.Q.value = 1.5;
    const g = (this.trainGain = ctx.createGain());
    g.gain.value = 0;
    const p = (this.trainPanner = ctx.createPanner());
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 8; p.rolloffFactor = 0.9;
    src.connect(f).connect(g).connect(p);
    p.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = 0.6;
    p.connect(s).connect(this.reverb);
    src.start();
    // motor whine
    const o = (this.motor = ctx.createOscillator());
    o.type = 'sawtooth'; o.frequency.value = 80;
    const of = ctx.createBiquadFilter(); of.type = 'bandpass'; of.frequency.value = 900; of.Q.value = 6;
    const og = (this.motorGain = ctx.createGain()); og.gain.value = 0;
    o.connect(of).connect(og).connect(p);
    o.start();
    // brake squeal
    const sq = ctx.createOscillator(); sq.type = 'triangle'; sq.frequency.value = 2400;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lg = ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg).connect(sq.frequency);
    const sg = (this.squealGain = ctx.createGain()); sg.gain.value = 0;
    sq.connect(sg).connect(p);
    sq.start(); lfo.start();
    this.clackDist = 0;
  }

  // Called every frame with train state: speed in m/s, decel flag, position, whether the player rides.
  train(dt, { present, speed, braking, pos, inside }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = Math.abs(speed);
    const k = present ? Math.min(1, v / 20) : 0;
    this.trainGain.gain.setTargetAtTime(present ? 0.05 + k * (inside ? 1.1 : 1.6) : 0, t, 0.1);
    this.trainFilter.frequency.setTargetAtTime(90 + k * (inside ? 260 : 600), t, 0.1);
    this.motor.frequency.setTargetAtTime(60 + v * 22, t, 0.05);
    this.motorGain.gain.setTargetAtTime(present && v > 0.3 ? 0.03 + k * 0.05 : 0, t, 0.1);
    this.squealGain.gain.setTargetAtTime(present && braking && v > 0.5 && v < 12 ? 0.05 * (1 - v / 12) + 0.015 : 0, t, 0.08);
    const pp = inside ? { x: pos.x, y: pos.y - 1, z: pos.z } : pos;
    this.trainPanner.positionX.setTargetAtTime(pp.x, t, 0.05);
    this.trainPanner.positionY.setTargetAtTime(pp.y, t, 0.05);
    this.trainPanner.positionZ.setTargetAtTime(pp.z, t, 0.05);
    // wheel clacks at rail joints: two bogies per car
    if (present && v > 0.5) {
      this.clackDist += v * dt;
      if (this.clackDist > 18) {
        this.clackDist = 0;
        const d = this.out(pp, 0.4, Math.min(1, v / 10) * (inside ? 0.7 : 1));
        for (let i = 0; i < 4; i++) this.burst(d, { t: i * (i % 2 ? 2.2 / v : 12 / v), dur: 0.04, type: 'bandpass', freq: 700, q: 1.5, gain: 0.6 });
      }
    }
  }

  setInterior(inside) {
    if (!this.ready) return;
    this.wet.gain.setTargetAtTime(inside ? 0.25 : 0.55, this.ctx.currentTime, 0.4);
  }

  announce(text) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => x.lang === 'en-GB' && /female|Kate|Serena|Martha|Google UK English Female/i.test(x.name)) || voices.find((x) => x.lang === 'en-GB');
      if (v) u.voice = v;
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 0.8;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }
}
