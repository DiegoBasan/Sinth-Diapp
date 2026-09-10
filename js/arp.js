// ---------------------------------------------------------------------------
// arp.js — reloj musical, arpegiador, secuenciador de batería y looper.
// Todo se agenda con lookahead sobre el reloj de Web Audio.
// ---------------------------------------------------------------------------
import { snapToScale } from './theory.js';

export const ARP_MODES = {
  up: 'Ascendente', down: 'Descendente', updown: 'Asc-desc', downup: 'Desc-asc',
  played: 'Orden tocado', random: 'Aleatorio', chord: 'Acorde entero', converge: 'Convergente',
};
export const ARP_DIVS = { '1/4': 1, '1/4T': 2 / 3, '1/8': 0.5, '1/8T': 1 / 3, '1/16': 0.25, '1/16T': 1 / 6, '1/32': 0.125 };
export const ARP_DIV_LIST = Object.keys(ARP_DIVS);
export const DRUM_STEPS = 16;

export class Clock extends EventTarget {
  constructor(engine) {
    super();
    this.engine = engine;
    this.bpm = 120;
    this.running = false;
    this.step16 = 0;
    this.nextTime = 0;
    this.lookahead = 0.1;
    this.interval = 25;
    this.timer = null;
    this.startTime = 0;
    // Arpegiador
    this.arp = { on: false, mode: 'up', div: '1/16', octaves: 1, gate: 0.6, latch: false, swing: 0, velocity: 100 };
    this.arpNotes = [];
    this.arpOrder = [];
    this.arpIndex = 0;
    this.arpNextTime = 0;
    this.arpActive = null;
    this.arpStepCount = 0;
    // Batería
    this.drum = { on: false, pattern: null, swing: 0, volume: 0.8 };
    this.drum.pattern = emptyPattern();
    // Looper
    this.loop = { state: 'idle', bars: 2, events: [], startTime: 0, playIndex: 0, quantize: '1/16', overdub: true };
    this.metronome = false;
    this.scaleLock = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const ctx = this.engine.ctx;
    this.startTime = ctx.currentTime + 0.06;
    this.nextTime = this.startTime;
    this.arpNextTime = this.startTime;
    this.step16 = 0;
    this.timer = setInterval(() => this.tick(), this.interval);
    this.dispatchEvent(new CustomEvent('state', { detail: { running: true } }));
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    this.releaseArp(this.engine.ctx.currentTime);
    this.dispatchEvent(new CustomEvent('state', { detail: { running: false } }));
  }

  get spb() { return 60 / this.bpm; }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(300, bpm));
    this.engine.setBpm(this.bpm);
    this.dispatchEvent(new CustomEvent('bpm', { detail: { bpm: this.bpm } }));
  }

  tick() {
    const ctx = this.engine.ctx;
    const horizon = ctx.currentTime + this.lookahead;
    const step = this.spb / 4;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 128) {
      this.scheduleStep(this.step16, this.nextTime);
      this.step16 = (this.step16 + 1) % DRUM_STEPS;
      this.nextTime += step;
    }
    this.scheduleArp(horizon);
    this.scheduleLoop(horizon);
  }

  scheduleStep(step, time) {
    const swingT = step % 2 === 1 ? time + this.drum.swing * (this.spb / 4) * 0.5 : time;
    if (this.drum.on && this.drum.pattern) {
      this.drum.pattern.forEach((row, i) => {
        const v = row[step];
        if (v > 0) this.engine.drums.trigger(i, v, swingT);
      });
    }
    if (this.metronome && step % 4 === 0) {
      this.engine.drums.trigger(step === 0 ? 7 : 3, step === 0 ? 90 : 55, time);
    }
    this.dispatchEvent(new CustomEvent('step', { detail: { step, time } }));
  }

  // --- Arpegiador --------------------------------------------------------
  setArpNotes(notes) {
    this.arpNotes = [...notes];
    this.rebuildArpOrder();
  }

  rebuildArpOrder() {
    const base = [...this.arpNotes];
    const sorted = [...base].sort((a, b) => a - b);
    const octs = Math.max(1, this.arp.octaves);
    const expand = (arr) => {
      const out = [];
      for (let o = 0; o < octs; o++) for (const n of arr) out.push(n + o * 12);
      return out;
    };
    let order;
    switch (this.arp.mode) {
      case 'down': order = expand(sorted).reverse(); break;
      case 'updown': { const up = expand(sorted); order = up.concat(up.slice(1, -1).reverse()); break; }
      case 'downup': { const dn = expand(sorted).reverse(); order = dn.concat(dn.slice(1, -1).reverse()); break; }
      case 'played': order = expand(base); break;
      case 'random': order = expand(sorted); break;
      case 'chord': order = [expand(sorted)]; break;
      case 'converge': {
        const up = expand(sorted); order = [];
        let i = 0, j = up.length - 1;
        while (i <= j) { order.push(up[i]); if (i !== j) order.push(up[j]); i++; j--; }
        break;
      }
      default: order = expand(sorted);
    }
    this.arpOrder = order.filter((n) => n != null);
    if (this.arpIndex >= this.arpOrder.length) this.arpIndex = 0;
  }

  releaseArp(t) {
    if (!this.arpActive) return;
    for (const n of this.arpActive) this.engine.noteOff(n, t);
    this.arpActive = null;
  }

  scheduleArp(horizon) {
    if (!this.arp.on || !this.arpOrder.length) {
      if (this.arpActive && this.engine.ctx.currentTime > this.arpStopAt) this.releaseArp(this.engine.ctx.currentTime);
      return;
    }
    const stepDur = this.spb * (ARP_DIVS[this.arp.div] || 0.25);
    if (this.arpNextTime < this.engine.ctx.currentTime) this.arpNextTime = this.engine.ctx.currentTime + 0.02;
    let guard = 0;
    while (this.arpNextTime < horizon && guard++ < 64) {
      const swung = this.arpStepCount % 2 === 1 ? this.arpNextTime + this.arp.swing * stepDur * 0.5 : this.arpNextTime;
      if (this.arp.mode === 'random') this.arpIndex = Math.floor(Math.random() * this.arpOrder.length);
      const item = this.arpOrder[this.arpIndex % this.arpOrder.length];
      let notes = Array.isArray(item) ? item : [item];
      if (this.scaleLock) notes = notes.map((n) => snapToScale(n, this.scaleLock));
      const off = swung + Math.max(0.02, stepDur * this.arp.gate);
      for (const n of notes) {
        this.engine.noteOn(n, this.arp.velocity, swung);
        this.engine.noteOff(n, off);
      }
      this.dispatchEvent(new CustomEvent('arpstep', { detail: { notes, time: swung, off } }));
      this.arpIndex = (this.arpIndex + 1) % this.arpOrder.length;
      this.arpStepCount++;
      this.arpNextTime += stepDur;
    }
  }

  // --- Looper ------------------------------------------------------------
  get loopLength() { return this.loop.bars * 4 * this.spb; }

  armLoop() {
    if (this.loop.state === 'rec') { this.stopRecording(); return; }
    if (!this.running) this.start();
    if (!this.loop.overdub) this.loop.events = [];
    this.loop.state = 'rec';
    this.loop.startTime = this.engine.ctx.currentTime;
    this.dispatchEvent(new CustomEvent('loop', { detail: { state: 'rec' } }));
  }

  stopRecording() {
    this.loop.state = this.loop.events.length ? 'play' : 'idle';
    this.loop.playStart = this.engine.ctx.currentTime;
    this.loop.playIndex = 0;
    this.dispatchEvent(new CustomEvent('loop', { detail: { state: this.loop.state } }));
  }

  toggleLoopPlay() {
    if (this.loop.state === 'play') this.loop.state = 'idle';
    else if (this.loop.events.length) {
      this.loop.state = 'play';
      this.loop.playStart = this.engine.ctx.currentTime;
      this.loop.playIndex = 0;
      if (!this.running) this.start();
    }
    this.dispatchEvent(new CustomEvent('loop', { detail: { state: this.loop.state } }));
  }

  clearLoop() {
    this.loop.events = [];
    this.loop.state = 'idle';
    this.dispatchEvent(new CustomEvent('loop', { detail: { state: 'idle' } }));
  }

  quantizeTime(t) {
    const div = ARP_DIVS[this.loop.quantize];
    if (!div) return t;
    const grid = this.spb * div;
    return Math.round(t / grid) * grid;
  }

  recordEvent(type, note, velocity) {
    if (this.loop.state !== 'rec') return;
    const len = this.loopLength;
    let t = this.engine.ctx.currentTime - this.loop.startTime;
    if (type === 'on') t = this.quantizeTime(t);
    if (t >= len) { this.stopRecording(); return; }
    this.loop.events.push({ t: ((t % len) + len) % len, type, note, velocity });
    this.loop.events.sort((a, b) => a.t - b.t);
  }

  scheduleLoop(horizon) {
    if (this.loop.state !== 'play' || !this.loop.events.length) return;
    const len = this.loopLength;
    while (this.loop.playStart + len < this.engine.ctx.currentTime) {
      this.loop.playStart += len;
      this.loop.playIndex = 0;
    }
    let guard = 0;
    while (guard++ < 256) {
      if (this.loop.playIndex >= this.loop.events.length) {
        if (this.loop.playStart + len >= horizon) break;
        this.loop.playStart += len;
        this.loop.playIndex = 0;
        continue;
      }
      const ev = this.loop.events[this.loop.playIndex];
      const when = this.loop.playStart + ev.t;
      if (when >= horizon) break;
      if (when >= this.engine.ctx.currentTime - 0.02) {
        if (ev.type === 'on') this.engine.noteOn(ev.note, ev.velocity, when);
        else this.engine.noteOff(ev.note, when);
        this.dispatchEvent(new CustomEvent('loopnote', { detail: { ...ev, when } }));
      }
      this.loop.playIndex++;
    }
  }
}

export function emptyPattern() {
  return Array.from({ length: 8 }, () => new Array(DRUM_STEPS).fill(0));
}

export const DRUM_PATTERNS = {
  'Vacío': emptyPattern(),
  'House': patternFrom({ 0: [0, 4, 8, 12], 1: [4, 12], 3: [2, 6, 10, 14], 4: [14] }),
  'Trap': patternFrom({ 0: [0, 6, 10], 1: [8], 3: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15] }),
  'Boom bap': patternFrom({ 0: [0, 10], 1: [4, 12], 3: [0, 2, 4, 6, 8, 10, 12, 14] }),
  'Rock': patternFrom({ 0: [0, 8], 1: [4, 12], 3: [0, 2, 4, 6, 8, 10, 12, 14] }),
  'Funk': patternFrom({ 0: [0, 3, 10], 1: [4, 12], 2: [12], 3: [0, 2, 4, 6, 8, 10, 12, 14], 4: [6] }),
  'Reggaetón': patternFrom({ 0: [0, 8], 1: [3, 6, 11, 14], 3: [0, 4, 8, 12] }),
  'Techno': patternFrom({ 0: [0, 4, 8, 12], 2: [4, 12], 3: [2, 6, 10, 14], 4: [6, 14] }),
  'Bossa': patternFrom({ 0: [0, 6, 10], 1: [3, 13], 3: [0, 2, 4, 6, 8, 10, 12, 14] }),
  'Drum & Bass': patternFrom({ 0: [0, 10], 1: [4, 12], 3: [0, 2, 4, 5, 6, 8, 10, 12, 14, 15] }),
};

function patternFrom(spec) {
  const p = emptyPattern();
  for (const [row, steps] of Object.entries(spec)) {
    for (const s of steps) p[+row][s] = s % 4 === 0 ? 110 : 85;
  }
  return p;
}
