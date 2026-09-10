// ---------------------------------------------------------------------------
// engine.js — motor de síntesis (Web Audio): voces polifónicas/mono,
// filtro con envolvente, LFO, cadena de efectos y batería sintetizada.
// ---------------------------------------------------------------------------
import { midiToFreq } from './theory.js';

export const WAVES = ['sawtooth', 'square', 'triangle', 'sine', 'pulse25', 'pulse12', 'organ', 'glass'];
export const WAVE_LABELS = { sawtooth: 'Sierra', square: 'Cuadrada', triangle: 'Triángulo', sine: 'Seno', pulse25: 'Pulso 25%', pulse12: 'Pulso 12%', organ: 'Órgano', glass: 'Cristal' };
export const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch'];
export const FILTER_LABELS = { lowpass: 'Paso bajo', highpass: 'Paso alto', bandpass: 'Paso banda', notch: 'Notch' };
export const LFO_WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
export const SYNC_DIVS = { off: 0, '1/1': 4, '1/2': 2, '1/4': 1, '1/4T': 2 / 3, '1/8': 0.5, '1/8T': 1 / 3, '3/16': 0.75, '1/16': 0.25, '1/32': 0.125 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = (ctx) => ctx.currentTime;

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function holdParam(param, time) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    const v = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(v, time);
  }
}

function buildWaves(ctx) {
  const N = 64;
  const waves = {};
  const pulse = (d) => {
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    return ctx.createPeriodicWave(real, imag);
  };
  const harm = (amps) => {
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    Object.entries(amps).forEach(([n, a]) => { imag[+n] = a; });
    return ctx.createPeriodicWave(real, imag);
  };
  waves.pulse25 = pulse(0.25);
  waves.pulse12 = pulse(0.125);
  waves.organ = harm({ 1: 1, 2: 0.7, 3: 0.5, 4: 0.4, 6: 0.25, 8: 0.2 });
  waves.glass = harm({ 1: 1, 3: 0.15, 5: 0.3, 7: 0.1, 9: 0.2, 11: 0.05, 13: 0.1 });
  return waves;
}

// ---------------------------------------------------------------------------
class Voice {
  constructor(engine, note, velocity, time, glideFrom) {
    const ctx = engine.ctx;
    const p = engine.params;
    this.engine = engine;
    this.note = note;
    this.velocity = velocity;
    this.startTime = time;
    this.released = false;
    this.sustained = false;
    this.disposed = false;
    this.oscs = [];
    this.stoppables = [];
    this.oscGains = {};

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(engine.voiceBus);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = p.filter.type;
    this.filter.Q.value = p.filter.q;
    this.filter.connect(this.out);
    this.mix = ctx.createGain();
    this.mix.connect(this.filter);
    engine.lfoFilter.connect(this.filter.detune);
    engine.lfoAmp.connect(this.out.gain);

    for (const key of ['osc1', 'osc2']) {
      const o = p[key];
      if (o.level <= 0) continue;
      const g = ctx.createGain();
      g.gain.value = o.level / Math.sqrt(o.unison);
      g.connect(this.mix);
      this.oscGains[key] = g;
      const target = midiToFreq(note + o.octave * 12);
      const from = glideFrom != null ? midiToFreq(glideFrom + o.octave * 12) : target;
      for (let u = 0; u < o.unison; u++) {
        const osc = ctx.createOscillator();
        engine.setWave(osc, o.wave);
        const spreadPos = o.unison > 1 ? (u / (o.unison - 1)) * 2 - 1 : 0;
        const base = o.semi * 100 + o.fine + spreadPos * o.spread * 50;
        osc.detune.value = base + engine.bendCents;
        osc.frequency.setValueAtTime(from, time);
        if (from !== target) osc.frequency.exponentialRampToValueAtTime(target, time + Math.max(0.005, p.glide));
        engine.lfoPitch.connect(osc.detune);
        let dest = g;
        if (o.unison > 1) {
          const pan = ctx.createStereoPanner();
          pan.pan.value = spreadPos * 0.8;
          pan.connect(g);
          dest = pan;
        }
        osc.connect(dest);
        osc.start(time);
        this.oscs.push({ node: osc, base, key, spreadPos, octave: o.octave });
        this.stoppables.push(osc);
      }
    }
    if (p.sub.level > 0) {
      const osc = ctx.createOscillator();
      osc.type = p.sub.wave || 'sine';
      const target = midiToFreq(note - 12);
      const from = glideFrom != null ? midiToFreq(glideFrom - 12) : target;
      osc.frequency.setValueAtTime(from, time);
      if (from !== target) osc.frequency.exponentialRampToValueAtTime(target, time + Math.max(0.005, p.glide));
      osc.detune.value = engine.bendCents;
      engine.lfoPitch.connect(osc.detune);
      const g = ctx.createGain();
      g.gain.value = p.sub.level;
      osc.connect(g).connect(this.mix);
      osc.start(time);
      this.oscs.push({ node: osc, base: 0, key: 'sub', spreadPos: 0, octave: -1 });
      this.oscGains.sub = g;
      this.stoppables.push(osc);
    }
    if (p.noise.level > 0) {
      const src = ctx.createBufferSource();
      src.buffer = engine.noiseBuffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = p.noise.level * 0.5;
      src.connect(g).connect(this.mix);
      src.start(time);
      this.oscGains.noise = g;
      this.stoppables.push(src);
    }
    this.scheduleEnvelopes(time, false);
  }

  computeFilterBase() {
    const p = this.engine.params;
    return clamp(p.filter.cutoff * Math.pow(2, (p.filter.keyTrack * (this.note - 60)) / 12), 20, 20000);
  }

  scheduleEnvelopes(time, retrigger) {
    const p = this.engine.params;
    const vel = this.velocity / 127;
    const velAmt = p.amp.velocity;
    this.peak = (1 - velAmt) + velAmt * vel * vel;
    const g = this.out.gain;
    const a = Math.max(0.002, p.amp.attack);
    const d = Math.max(0.005, p.amp.decay);
    if (retrigger) holdParam(g, time); else { g.cancelScheduledValues(time); g.setValueAtTime(0, time); }
    g.linearRampToValueAtTime(this.peak, time + a);
    g.setTargetAtTime(this.peak * p.amp.sustain, time + a, d / 3);

    this.fBase = this.computeFilterBase();
    const envAmt = p.filter.envAmt * (0.6 + 0.4 * vel);
    this.fPeak = clamp(this.fBase * Math.pow(2, envAmt * 5), 20, 20000);
    this.fSus = this.fBase + (this.fPeak - this.fBase) * p.filter.sustain;
    const f = this.filter.frequency;
    const fa = Math.max(0.002, p.filter.attack);
    const fd = Math.max(0.005, p.filter.decay);
    if (retrigger) holdParam(f, time); else { f.cancelScheduledValues(time); f.setValueAtTime(this.fBase, time); }
    f.exponentialRampToValueAtTime(this.fPeak, time + fa);
    f.setTargetAtTime(this.fSus, time + fa, fd / 3);
  }

  glideTo(note, time, retrigger) {
    const p = this.engine.params;
    const gl = Math.max(0.005, p.glide);
    for (const o of this.oscs) {
      const target = midiToFreq(note + o.octave * 12);
      o.node.frequency.cancelScheduledValues(time);
      o.node.frequency.setValueAtTime(Math.max(1, o.node.frequency.value), time);
      o.node.frequency.exponentialRampToValueAtTime(target, time + gl);
    }
    this.note = note;
    if (retrigger) this.scheduleEnvelopes(time, true);
    else {
      this.fBase = this.computeFilterBase();
      this.fSus = this.fBase + (this.fPeak - this.fBase) * p.filter.sustain;
      this.filter.frequency.setTargetAtTime(this.fSus, time, gl / 3);
    }
  }

  setBend(cents, time) {
    for (const o of this.oscs) o.node.detune.setTargetAtTime(o.base + cents, time, 0.005);
  }

  updateFilter(time) {
    const p = this.engine.params;
    this.filter.type = p.filter.type;
    this.filter.Q.setTargetAtTime(p.filter.q, time, 0.02);
    if (this.released) return;
    this.fBase = this.computeFilterBase();
    this.fPeak = clamp(this.fBase * Math.pow(2, p.filter.envAmt * 5), 20, 20000);
    this.fSus = this.fBase + (this.fPeak - this.fBase) * p.filter.sustain;
    holdParam(this.filter.frequency, time);
    this.filter.frequency.setTargetAtTime(this.fSus, time, 0.03);
  }

  updateOsc(key, time) {
    const p = this.engine.params;
    const o = p[key];
    if (this.oscGains[key]) {
      const lvl = key === 'noise' ? o.level * 0.5 : key === 'sub' ? o.level : o.level / Math.sqrt(o.unison);
      this.oscGains[key].gain.setTargetAtTime(lvl, time, 0.02);
    }
    for (const osc of this.oscs) {
      if (osc.key !== key || key === 'sub') continue;
      this.engine.setWave(osc.node, o.wave);
      osc.base = o.semi * 100 + o.fine + osc.spreadPos * o.spread * 50;
      osc.node.detune.setTargetAtTime(osc.base + this.engine.bendCents, time, 0.01);
    }
  }

  release(time) {
    if (this.released) return;
    this.released = true;
    this.sustained = false;
    const p = this.engine.params;
    holdParam(this.out.gain, time);
    this.out.gain.setTargetAtTime(0, time, Math.max(0.005, p.amp.release / 4));
    holdParam(this.filter.frequency, time);
    this.filter.frequency.setTargetAtTime(this.fBase, time, Math.max(0.005, p.filter.release / 4));
    const stopAt = time + p.amp.release + 0.25;
    this.stopAt = stopAt;
    for (const n of this.stoppables) { try { n.stop(stopAt); } catch (e) { /* ya parado */ } }
    const ms = Math.max(0, (stopAt - now(this.engine.ctx)) * 1000 + 60);
    setTimeout(() => this.dispose(), ms);
  }

  kill(time) {
    if (this.disposed) return;
    this.released = true;
    holdParam(this.out.gain, time);
    this.out.gain.setTargetAtTime(0, time, 0.01);
    const stopAt = time + 0.06;
    for (const n of this.stoppables) { try { n.stop(stopAt); } catch (e) { /* */ } }
    setTimeout(() => this.dispose(), Math.max(0, (stopAt - now(this.engine.ctx)) * 1000 + 40));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const e = this.engine;
    try { e.lfoFilter.disconnect(this.filter.detune); } catch (err) { /* */ }
    try { e.lfoAmp.disconnect(this.out.gain); } catch (err) { /* */ }
    for (const o of this.oscs) { try { e.lfoPitch.disconnect(o.node.detune); } catch (err) { /* */ } }
    for (const n of this.stoppables) { try { n.disconnect(); } catch (err) { /* */ } }
    try { this.mix.disconnect(); this.filter.disconnect(); this.out.disconnect(); } catch (err) { /* */ }
    const i = e.voices.indexOf(this);
    if (i >= 0) e.voices.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
class FxChain {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // Distorsión
    const dist = this.dist = { in: G(), dry: G(1), wet: G(0), out: G(), pre: G(1), shaper: ctx.createWaveShaper(), tone: ctx.createBiquadFilter(), post: G(0.6) };
    dist.shaper.oversample = '2x';
    dist.tone.type = 'lowpass';
    dist.in.connect(dist.dry).connect(dist.out);
    dist.in.connect(dist.pre).connect(dist.shaper).connect(dist.tone).connect(dist.post).connect(dist.wet).connect(dist.out);

    // Chorus
    const ch = this.chorus = { in: G(), dry: G(1), wet: G(0), out: G(), d1: ctx.createDelay(0.1), d2: ctx.createDelay(0.1), lfo1: ctx.createOscillator(), lfo2: ctx.createOscillator(), dep1: G(0.002), dep2: G(0.002), p1: ctx.createStereoPanner(), p2: ctx.createStereoPanner() };
    ch.d1.delayTime.value = 0.02;
    ch.d2.delayTime.value = 0.029;
    ch.p1.pan.value = -0.6;
    ch.p2.pan.value = 0.6;
    ch.lfo1.frequency.value = 1.5;
    ch.lfo2.frequency.value = 1.5 * 1.13;
    ch.lfo1.connect(ch.dep1).connect(ch.d1.delayTime);
    ch.lfo2.connect(ch.dep2).connect(ch.d2.delayTime);
    ch.lfo1.start();
    ch.lfo2.start();
    ch.in.connect(ch.dry).connect(ch.out);
    ch.in.connect(ch.d1).connect(ch.p1).connect(ch.wet);
    ch.in.connect(ch.d2).connect(ch.p2).connect(ch.wet);
    ch.wet.connect(ch.out);

    // Delay estéreo / ping-pong
    const dl = this.delay = { in: G(), dry: G(1), wet: G(0), out: G(), inL: G(1), inR: G(1), dL: ctx.createDelay(4), dR: ctx.createDelay(4), fL: ctx.createBiquadFilter(), fR: ctx.createBiquadFilter(), fbLL: G(0), fbRR: G(0), fbLR: G(0), fbRL: G(0), merger: ctx.createChannelMerger(2) };
    dl.fL.type = 'lowpass';
    dl.fR.type = 'lowpass';
    dl.in.connect(dl.dry).connect(dl.out);
    dl.in.connect(dl.inL).connect(dl.dL).connect(dl.fL);
    dl.in.connect(dl.inR).connect(dl.dR).connect(dl.fR);
    dl.fL.connect(dl.merger, 0, 0);
    dl.fR.connect(dl.merger, 0, 1);
    dl.fL.connect(dl.fbLL).connect(dl.dL);
    dl.fL.connect(dl.fbLR).connect(dl.dR);
    dl.fR.connect(dl.fbRR).connect(dl.dR);
    dl.fR.connect(dl.fbRL).connect(dl.dL);
    dl.merger.connect(dl.wet).connect(dl.out);

    // Reverb por convolución
    const rv = this.reverb = { in: G(), dry: G(1), wet: G(0), out: G(), pre: ctx.createDelay(0.5), conv: ctx.createConvolver(), damp: ctx.createBiquadFilter() };
    rv.damp.type = 'lowpass';
    rv.in.connect(rv.dry).connect(rv.out);
    rv.in.connect(rv.pre).connect(rv.conv).connect(rv.damp).connect(rv.wet).connect(rv.out);
    this.reverbSend = rv.pre; // para la batería
    this.irKey = '';

    this.input.connect(dist.in);
    dist.out.connect(ch.in);
    ch.out.connect(dl.in);
    dl.out.connect(rv.in);
    rv.out.connect(this.output);
  }

  makeCurve(drive) {
    const n = 2048;
    const curve = new Float32Array(n);
    const k = 1 + drive * drive * 120;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  buildImpulse(size, decay) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * size));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const k = 1 + (1 - decay) * 9;
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, k) * (i < 200 ? i / 200 : 1);
      }
      // reflexiones tempranas
      for (let r = 0; r < 8; r++) {
        const idx = Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.04));
        if (idx < len) data[idx] += (Math.random() * 0.6 + 0.3) * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    this.reverb.conv.buffer = buf;
  }

  update(fx, bpm, t) {
    const ctx = this.ctx;
    const st = (param, v, tc = 0.02) => param.setTargetAtTime(v, t, tc);
    const d = fx.dist;
    const dOn = d.on ? 1 : 0;
    this.dist.shaper.curve = this.makeCurve(d.drive);
    st(this.dist.pre.gain, 1 + d.drive * 3);
    st(this.dist.tone.frequency, d.tone);
    st(this.dist.wet.gain, dOn * d.mix);
    st(this.dist.dry.gain, dOn ? 1 - d.mix : 1);

    const c = fx.chorus;
    const cOn = c.on ? 1 : 0;
    st(this.chorus.lfo1.frequency, c.rate);
    st(this.chorus.lfo2.frequency, c.rate * 1.13);
    st(this.chorus.dep1.gain, c.depth * 0.006);
    st(this.chorus.dep2.gain, c.depth * 0.006);
    st(this.chorus.wet.gain, cOn * c.mix);
    st(this.chorus.dry.gain, cOn ? 1 - c.mix * 0.5 : 1);

    const dl = fx.delay;
    const dlOn = dl.on ? 1 : 0;
    let time = dl.time;
    if (dl.sync && dl.sync !== 'off' && SYNC_DIVS[dl.sync]) time = (60 / bpm) * SYNC_DIVS[dl.sync];
    time = clamp(time, 0.005, 4);
    st(this.delay.dL.delayTime, time, 0.05);
    st(this.delay.dR.delayTime, dl.pingpong ? time : time * 1.0, 0.05);
    st(this.delay.fL.frequency, dl.tone);
    st(this.delay.fR.frequency, dl.tone);
    const fb = clamp(dl.feedback, 0, 0.95);
    if (dl.pingpong) {
      st(this.delay.inR.gain, 0); st(this.delay.fbLL.gain, 0); st(this.delay.fbRR.gain, 0);
      st(this.delay.fbLR.gain, 1); st(this.delay.fbRL.gain, fb);
    } else {
      st(this.delay.inR.gain, 1); st(this.delay.fbLL.gain, fb); st(this.delay.fbRR.gain, fb);
      st(this.delay.fbLR.gain, 0); st(this.delay.fbRL.gain, 0);
    }
    st(this.delay.wet.gain, dlOn * dl.mix);
    st(this.delay.dry.gain, dlOn ? 1 - dl.mix * 0.3 : 1);

    const r = fx.reverb;
    const rOn = r.on ? 1 : 0;
    st(this.reverb.pre.delayTime, r.predelay, 0.05);
    st(this.reverb.damp.frequency, r.damp);
    st(this.reverb.wet.gain, rOn * r.mix * 1.4);
    st(this.reverb.dry.gain, rOn ? 1 - r.mix * 0.5 : 1);
    const key = `${r.size.toFixed(2)}:${r.decay.toFixed(2)}`;
    if (key !== this.irKey) {
      this.irKey = key;
      clearTimeout(this.irTimer);
      this.irTimer = setTimeout(() => this.buildImpulse(r.size, r.decay), 120);
    }
  }
}

// ---------------------------------------------------------------------------
export const DRUM_NAMES = ['Bombo', 'Caja', 'Palmas', 'Hi-hat', 'Hi-hat abierto', 'Tom grave', 'Tom agudo', 'Cencerro'];

class Drums {
  constructor(ctx, noiseBuffer, reverbSend) {
    this.ctx = ctx;
    this.noise = noiseBuffer;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.8;
    this.send = ctx.createGain();
    this.send.gain.value = 0.25;
    this.bus.connect(this.send).connect(reverbSend);
  }
  env(g, t, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }
  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t);
    s.stop(t + dur + 0.05);
    return s;
  }
  osc(type, f0, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  trigger(index, velocity = 100, time) {
    const ctx = this.ctx;
    const t = time != null ? time : ctx.currentTime;
    const v = clamp(velocity / 127, 0.05, 1);
    const g = ctx.createGain();
    g.connect(this.bus);
    switch (index) {
      case 0: { // bombo
        const o = this.osc('sine', 160, t, 0.5);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
        this.env(g, t, v * 1.2, 0.45);
        o.connect(g);
        const c = ctx.createGain();
        this.env(c, t, v * 0.5, 0.02);
        const n = this.noiseSrc(t, 0.03);
        n.connect(c).connect(this.bus);
        break;
      }
      case 1: { // caja
        const n = this.noiseSrc(t, 0.25);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
        n.connect(bp).connect(g);
        this.env(g, t, v * 0.9, 0.2);
        const o = this.osc('triangle', 190, t, 0.12);
        const og = ctx.createGain();
        o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        this.env(og, t, v * 0.7, 0.1);
        o.connect(og).connect(this.bus);
        break;
      }
      case 2: { // palmas
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.2;
        bp.connect(g);
        g.gain.value = v * 0.9;
        for (let i = 0; i < 4; i++) {
          const tt = t + i * 0.011;
          const cg = ctx.createGain();
          this.env(cg, tt, 1, i === 3 ? 0.22 : 0.012);
          this.noiseSrc(tt, 0.25).connect(cg).connect(bp);
        }
        break;
      }
      case 3: case 4: { // hi-hat cerrado / abierto
        const n = this.noiseSrc(t, 0.5);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 7000;
        n.connect(hp).connect(g);
        this.env(g, t, v * 0.5, index === 3 ? 0.05 : 0.4);
        break;
      }
      case 5: case 6: { // toms
        const f = index === 5 ? 130 : 210;
        const o = this.osc('sine', f, t, 0.4);
        o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.25);
        this.env(g, t, v, 0.35);
        o.connect(g);
        break;
      }
      case 7: { // cencerro
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 2;
        bp.connect(g);
        this.osc('square', 560, t, 0.3).connect(bp);
        this.osc('square', 845, t, 0.3).connect(bp);
        this.env(g, t, v * 0.5, 0.28);
        break;
      }
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------
export class SynthEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.params = null;
    this.voices = [];
    this.held = new Set();
    this.sustain = false;
    this.bendCents = 0;
    this.modWheel = 0;
    this.maxVoices = 16;
    this.monoStack = [];
    this.lastNote = null;
    this.bpm = 120;
  }

  init(params) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.waves = buildWaves(ctx);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuffer = nb;

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 5;
    this.lfoPitch = ctx.createGain(); this.lfoPitch.gain.value = 0;
    this.lfoFilter = ctx.createGain(); this.lfoFilter.gain.value = 0;
    this.lfoAmp = ctx.createGain(); this.lfoAmp.gain.value = 0;
    this.lfo.connect(this.lfoPitch);
    this.lfo.connect(this.lfoFilter);
    this.lfo.connect(this.lfoAmp);
    this.lfo.start();

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.5;
    this.fx = new FxChain(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.voiceBus.connect(this.fx.input);
    this.fx.output.connect(this.master);
    this.drums = new Drums(ctx, nb, this.fx.reverbSend);
    this.drums.bus.connect(this.master);
    this.master.connect(this.limiter).connect(this.analyser).connect(ctx.destination);

    this.loadPreset(params);
    return this;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume();
    return Promise.resolve();
  }

  setWave(osc, name) {
    if (['sine', 'square', 'sawtooth', 'triangle'].includes(name)) osc.type = name;
    else if (this.waves[name]) osc.setPeriodicWave(this.waves[name]);
    else osc.type = 'sawtooth';
  }

  loadPreset(preset) {
    this.params = JSON.parse(JSON.stringify(preset));
    const t = now(this.ctx);
    this.master.gain.setTargetAtTime(this.params.volume, t, 0.02);
    this.fx.update(this.params.fx, this.bpm, t);
    this.updateLfo();
    for (const v of this.voices) { v.updateFilter(t); }
    this.dispatchEvent(new CustomEvent('preset', { detail: this.params }));
  }

  getParam(path) { return getPath(this.params, path); }

  setParam(path, value, silent = false) {
    setPath(this.params, path, value);
    const t = now(this.ctx);
    const [a, b] = path.split('.');
    if (a === 'fx') this.fx.update(this.params.fx, this.bpm, t);
    else if (a === 'filter') { for (const v of this.voices) v.updateFilter(t); }
    else if (a === 'lfo') this.updateLfo();
    else if (a === 'volume') this.master.gain.setTargetAtTime(value, t, 0.02);
    else if (['osc1', 'osc2', 'sub', 'noise'].includes(a) && ['level', 'wave', 'semi', 'fine', 'spread'].includes(b)) {
      for (const v of this.voices) v.updateOsc(a, t);
    } else if (a === 'bendRange') this.setBend(this.bendValue || 0);
    if (!silent) this.dispatchEvent(new CustomEvent('param', { detail: { path, value } }));
  }

  setBpm(bpm) {
    this.bpm = bpm;
    this.fx.update(this.params.fx, bpm, now(this.ctx));
    this.updateLfo();
  }

  updateLfo() {
    const l = this.params.lfo;
    const t = now(this.ctx);
    this.lfo.type = l.wave;
    let rate = l.rate;
    if (l.sync && l.sync !== 'off' && SYNC_DIVS[l.sync]) rate = 1 / ((60 / this.bpm) * SYNC_DIVS[l.sync]);
    this.lfo.frequency.setTargetAtTime(rate, t, 0.02);
    this.lfoPitch.gain.setTargetAtTime((l.pitch + this.modWheel * l.modDepth) * 100, t, 0.02);
    this.lfoFilter.gain.setTargetAtTime(l.filter * 4800, t, 0.02);
    this.lfoAmp.gain.setTargetAtTime(l.amp * 0.5, t, 0.02);
  }

  setMod(v) {
    this.modWheel = clamp(v, 0, 1);
    this.updateLfo();
  }

  setBend(v) {
    this.bendValue = clamp(v, -1, 1);
    this.bendCents = this.bendValue * this.params.bendRange * 100;
    const t = now(this.ctx);
    for (const voice of this.voices) voice.setBend(this.bendCents, t);
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      const t = now(this.ctx);
      for (const v of this.voices) if (v.sustained && !this.held.has(v.note)) v.release(t);
    }
  }

  noteOn(note, velocity = 100, time = null) {
    if (!this.ctx) return;
    const t = time != null ? time : now(this.ctx);
    const p = this.params;
    this.held.add(note);
    if (p.mono) {
      this.monoStack = this.monoStack.filter((n) => n !== note);
      this.monoStack.push(note);
      const cur = this.voices.find((v) => !v.released);
      if (cur) cur.glideTo(note, t, !p.legato);
      else this.spawn(note, velocity, t, p.glide > 0 ? this.lastNote : null);
    } else {
      const existing = this.voices.filter((v) => v.note === note && !v.released);
      for (const v of existing) v.release(t);
      this.spawn(note, velocity, t, p.glide > 0 ? this.lastNote : null);
    }
    this.lastNote = note;
    this.dispatchEvent(new CustomEvent('noteon', { detail: { note, velocity, time: t } }));
  }

  spawn(note, velocity, t, glideFrom) {
    while (this.voices.length >= this.maxVoices) {
      const victim = this.voices.find((v) => v.released) || this.voices[0];
      victim.kill(t);
      const i = this.voices.indexOf(victim);
      if (i >= 0) this.voices.splice(i, 1);
    }
    const v = new Voice(this, note, velocity, t, glideFrom);
    this.voices.push(v);
    return v;
  }

  noteOff(note, time = null) {
    if (!this.ctx) return;
    const t = time != null ? time : now(this.ctx);
    this.held.delete(note);
    const p = this.params;
    if (p.mono) {
      this.monoStack = this.monoStack.filter((n) => n !== note);
      const cur = this.voices.find((v) => !v.released);
      if (cur && cur.note === note) {
        if (this.monoStack.length) cur.glideTo(this.monoStack[this.monoStack.length - 1], t, !p.legato);
        else if (this.sustain) cur.sustained = true;
        else cur.release(t);
      }
    } else {
      for (const v of this.voices) {
        if (v.note === note && !v.released) {
          if (this.sustain) v.sustained = true; else v.release(t);
        }
      }
    }
    this.dispatchEvent(new CustomEvent('noteoff', { detail: { note, time: t } }));
  }

  allNotesOff() {
    const t = now(this.ctx);
    for (const v of [...this.voices]) v.kill(t);
    this.held.clear();
    this.monoStack = [];
    this.dispatchEvent(new CustomEvent('allnotesoff'));
  }

  get activeVoices() { return this.voices.length; }
}
