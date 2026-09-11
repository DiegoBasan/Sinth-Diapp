// ---------------------------------------------------------------------------
// sampler.js — reproductor de instrumentos muestreados.
//
// Sirve tanto para sets con varias capas de dinámica y ruido de teclado
// (Salamander) como para sets cromáticos de una sola capa (FluidR3 GM).
// ---------------------------------------------------------------------------
import { INSTRUMENT_BY_ID, DEFAULT_INSTRUMENT, sampleNameToMidi, layersFor, suggestQuality } from './instruments.js';

export { sampleNameToMidi };

// Nivel del clic de la tecla contra el teclado. Es un ruido mecánico que en un
// piano real apenas se percibe, así que va muy por debajo de la nota.
const KEY_CLICK_BASE = 0.02;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// Las muestras de piano acaban en una cola larguísima por debajo del umbral de
// audición. Recortarla a -60 dBFS, con un desvanecido corto, no cambia nada de
// lo que se oye y ahorra cientos de megas de memoria descodificada.
const SILENCE = 0.001;   // ≈ -60 dBFS
const FADE_SEC = 0.18;

function trimTail(ctx, buf) {
  const chans = buf.numberOfChannels;
  let last = 0;
  for (let c = 0; c < chans; c++) {
    const d = buf.getChannelData(c);
    for (let i = d.length - 1; i > last; i--) {
      if (Math.abs(d[i]) > SILENCE) { last = i; break; }
    }
  }
  const fadeN = Math.max(1, Math.floor(FADE_SEC * buf.sampleRate));
  const len = Math.min(buf.length, last + fadeN);
  if (len < 256 || len > buf.length * 0.92) return buf; // no compensa copiar
  const out = ctx.createBuffer(chans, len, buf.sampleRate);
  for (let c = 0; c < chans; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, len));
    const from = Math.max(0, len - fadeN);
    for (let i = from; i < len; i++) dst[i] *= (len - i) / fadeN;
  }
  return out;
}

function bufferBytes(map) {
  let n = 0;
  for (const b of map.values()) n += b.length * b.numberOfChannels * 4;
  return n;
}
const CACHE_BUDGET = 190 * 1024 * 1024; // memoria descodificada que se guarda

// ---------------------------------------------------------------------------
class SampleVoice {
  constructor(sampler, note, velocity, time) {
    const ctx = sampler.ctx;
    const pick = sampler.pickSample(note, velocity);
    this.sampler = sampler;
    this.note = note;
    this.velocity = velocity;
    this.released = false;
    this.sustained = false;
    this.disposed = false;
    this.startTime = time;

    this.gain = ctx.createGain();
    this.gain.gain.value = pick.gain * sampler.opts.gain;
    this.gain.connect(sampler.noteBus);

    this.src = ctx.createBufferSource();
    this.src.buffer = pick.buffer;
    this.src.playbackRate.value = pick.rate;
    // Afinación estirada: los pianos reales tensan los agudos y aflojan los graves.
    this.src.detune.value = sampler.stretchCents(note) + (sampler.bendCents || 0);
    this.src.connect(this.gain);
    this.src.start(time);
    this.src.onended = () => this.dispose();
    this.endsAt = time + (pick.buffer.duration / pick.rate);
  }

  // Al soltar, los apagadores frenan la cuerda: cuanto más grave, más tarda.
  release(time) {
    if (this.released) return;
    this.released = true;
    this.sustained = false;
    const tc = this.sampler.damperTime(this.note);
    const g = this.gain.gain;
    const now = Math.max(time, this.sampler.ctx.currentTime);
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
    else { const v = g.value; g.cancelScheduledValues(now); g.setValueAtTime(v, now); }
    g.setTargetAtTime(0, now, tc);
    const stopAt = now + tc * 7 + 0.05;
    try { this.src.stop(Math.min(stopAt, this.endsAt + 0.1)); } catch (e) { /* ya terminó */ }
    setTimeout(() => this.dispose(), Math.max(0, (stopAt - this.sampler.ctx.currentTime) * 1000 + 60));
  }

  kill(time) {
    if (this.disposed) return;
    this.released = true;
    const g = this.gain.gain;
    const now = Math.max(time, this.sampler.ctx.currentTime);
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
    g.setTargetAtTime(0, now, 0.012);
    try { this.src.stop(now + 0.1); } catch (e) { /* */ }
    setTimeout(() => this.dispose(), 160);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { this.src.disconnect(); this.gain.disconnect(); } catch (e) { /* */ }
    const list = this.sampler.voices;
    const i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
export class SampleInstrument extends EventTarget {
  constructor(ctx, instrumentId = DEFAULT_INSTRUMENT) {
    super();
    this.ctx = ctx;
    this.buffers = new Map();   // "C4v11" o "C4" -> AudioBuffer
    this.releases = new Map();  // midi -> AudioBuffer del clic de tecla
    this.cache = new Map();     // id -> { buffers, releases }  (los 3 últimos)
    this.voices = [];
    this.held = new Map();
    this.sustain = false;
    this.softPedal = false;
    this.ready = false;
    this.loading = false;
    this.progress = 0;
    this.maxVoices = 32;
    this.bendCents = 0;
    this.loadToken = 0;
    this.quality = suggestQuality();
    this.activeLayers = null;
    this.dirty = false;   // la calidad cambió: hay que rehacer la carga
    this.opts = { gain: 1, tone: 12000, releaseNoise: 1, stretch: 0.5, dynamics: 1 };

    this.out = ctx.createGain();
    this.noteBus = ctx.createGain();
    this.noteBus.gain.value = 0.9;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = this.opts.tone;
    this.tone.Q.value = 0.2;
    this.noiseBus = ctx.createGain();
    this.noiseBus.gain.value = this.opts.releaseNoise;
    this.noteBus.connect(this.tone).connect(this.out);
    this.noiseBus.connect(this.out);

    this.instrument = INSTRUMENT_BY_ID[instrumentId] || INSTRUMENT_BY_ID[DEFAULT_INSTRUMENT];
  }

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------
  applyDefaults() {
    for (const [k, v] of Object.entries(this.instrument.defaults || {})) this.setOption(k, v);
  }

  async load(instrumentId = null) {
    const inst = instrumentId ? (INSTRUMENT_BY_ID[instrumentId] || this.instrument) : this.instrument;
    if (!inst || !this.needsLoad(inst.id)) return;
    this.dirty = false;

    const token = ++this.loadToken;
    this.allNotesOff();
    this.instrument = inst;
    this.ready = false;
    this.applyDefaults();

    // Un instrumento visto hace poco vuelve al instante, ya descodificado.
    const cached = this.cache.get(inst.id);
    if (cached) {
      this.cache.delete(inst.id);
      this.cache.set(inst.id, cached); // vuelve al final de la cola de descarte
      this.buffers = cached.buffers;
      this.releases = cached.releases;
      this.ready = true;
      this.progress = 1;
      this.dispatchEvent(new CustomEvent('playable', { detail: { instrument: inst, cached: true } }));
      this.dispatchEvent(new CustomEvent('loaded', { detail: { instrument: inst, samples: this.buffers.size, releases: this.releases.size, cached: true } }));
      return;
    }

    this.loading = true;
    this.buffers = new Map();
    this.releases = new Map();

    const jobs = [];
    if (inst.kind === 'layered') {
      this.activeLayers = layersFor(inst, this.quality);
      // Primero una capa intermedia, para poder tocar cuanto antes.
      const order = [...this.activeLayers].sort((a, b) => Math.abs(a.vel - 84) - Math.abs(b.vel - 84));
      for (const layer of order) for (const note of inst.notes) jobs.push({ url: `${inst.dir}${note}v${layer.id}.mp3`, key: `${note}v${layer.id}` });
    } else {
      for (const note of inst.notes) jobs.push({ url: `${inst.dir}${note}.mp3`, key: note });
    }
    const playableAt = jobs.length ? (inst.kind === 'layered' ? inst.notes.length : jobs.length) : 0;
    if (inst.kind !== 'layered') this.activeLayers = null;
    for (let k = 1; k <= inst.releases; k++) jobs.push({ url: `${inst.dir}rel${k}.mp3`, rel: inst.lowest + k - 1 });

    let done = 0;
    const total = jobs.length;
    const fetchOne = async (job) => {
      try {
        const res = await fetch(job.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (token !== this.loadToken) return;
        const buf = trimTail(this.ctx, raw);
        if (job.rel != null) this.releases.set(job.rel, buf);
        else this.buffers.set(job.key, buf);
      } catch (e) {
        this.dispatchEvent(new CustomEvent('sampleerror', { detail: { url: job.url, message: e.message } }));
      }
      if (token !== this.loadToken) return;
      done++;
      this.progress = total ? done / total : 1;
      if (done >= playableAt && !this.ready) {
        this.ready = true;
        this.dispatchEvent(new CustomEvent('playable', { detail: { instrument: inst } }));
      }
      this.dispatchEvent(new CustomEvent('progress', { detail: { done, total, ratio: this.progress, instrument: inst } }));
    };

    // De ocho en ocho: rápido sin saturar la conexión.
    for (let i = 0; i < jobs.length; i += 8) {
      if (token !== this.loadToken) return; // se cambió de instrumento a mitad
      await Promise.all(jobs.slice(i, i + 8).map(fetchOne));
    }
    if (token !== this.loadToken) return;
    this.loading = false;
    this.ready = this.buffers.size > 0;
    this.remember(inst.id);
    this.dispatchEvent(new CustomEvent('loaded', { detail: { instrument: inst, samples: this.buffers.size, releases: this.releases.size } }));
  }

  // Guarda instrumentos ya descodificados para que volver a ellos sea
  // instantáneo, pero solo mientras quepan en el presupuesto de memoria: los
  // sets pesados se vuelven a pedir (el navegador los tiene en su caché HTTP).
  remember(id) {
    const bytes = bufferBytes(this.buffers) + bufferBytes(this.releases);
    this.cache.delete(id);
    if (bytes > CACHE_BUDGET) return;
    this.cache.set(id, { buffers: this.buffers, releases: this.releases, bytes });
    let total = 0;
    for (const e of this.cache.values()) total += e.bytes;
    while (total > CACHE_BUDGET && this.cache.size > 1) {
      const oldest = this.cache.keys().next().value;
      total -= this.cache.get(oldest).bytes;
      this.cache.delete(oldest);
    }
  }

  get memoryMB() {
    let n = bufferBytes(this.buffers) + bufferBytes(this.releases);
    for (const e of this.cache.values()) if (e.buffers !== this.buffers) n += e.bytes;
    return Math.round(n / 1048576);
  }

  get loadedLayers() {
    const inst = this.instrument;
    if (inst.kind !== 'layered') return [];
    return (this.activeLayers || inst.layers).filter((l) => inst.notes.some((n) => this.buffers.has(`${n}v${l.id}`)));
  }

  // ¿Hace falta descargar algo para tener listo este instrumento?
  needsLoad(id) {
    const inst = INSTRUMENT_BY_ID[id] || this.instrument;
    if (!inst) return false;
    return !(inst === this.instrument && !this.dirty && (this.ready || this.loading));
  }

  // Cambiar de calidad marca el set actual para recargarse, pero no descarga
  // nada por su cuenta: lo pide quien corresponda cuando toque.
  setQuality(quality) {
    if (quality === this.quality) return false;
    this.quality = quality;
    if (!this.instrument || this.instrument.kind !== 'layered') return false;
    this.cache.delete(this.instrument.id);
    this.dirty = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // Elección de muestra
  // -------------------------------------------------------------------------
  pickSample(note, velocity) {
    const inst = this.instrument;
    const midi = clamp(Math.round(note), inst.lowest, inst.highest);
    const v = clamp(velocity, 1, 127);
    const curved = Math.pow(v / 127, this.opts.dynamics) * 127;
    const soft = this.softPedal ? 0.62 : 1;

    let layer = null;
    let suffix = '';
    if (inst.kind === 'layered') {
      const layers = this.loadedLayers.length ? this.loadedLayers : (this.activeLayers || inst.layers);
      layer = layers[0];
      for (const l of layers) if (Math.abs(l.vel - curved) < Math.abs(layer.vel - curved)) layer = l;
      suffix = `v${layer.id}`;
    }

    let best = null;
    for (const name of inst.notes) {
      const key = name + suffix;
      if (!this.buffers.has(key)) continue;
      const d = Math.abs(sampleNameToMidi(name) - midi);
      if (!best || d < best.d) best = { d, key, midi: sampleNameToMidi(name) };
      if (d === 0) break;
    }
    if (!best) { // esa capa aún no ha llegado: sirve cualquier muestra cargada
      for (const key of this.buffers.keys()) {
        const nm = key.replace(/v\d+$/, '');
        const d = Math.abs(sampleNameToMidi(nm) - midi);
        if (!best || d < best.d) best = { d, key, midi: sampleNameToMidi(nm) };
      }
    }
    if (!best) return null;

    let gain;
    if (layer) {
      // Con capas, la muestra ya trae el timbre correcto: solo se afina el nivel.
      const ratio = (curved + 6) / (layer.vel + 6);
      gain = clamp(Math.pow(ratio, 0.85), 0.35, 1.9) * 0.85;
    } else if (inst.id === 'harpsichord') {
      gain = 0.9; // el clavecín real no responde a la fuerza de la pulsación
    } else {
      // Con una sola capa, toda la dinámica tiene que salir del volumen.
      gain = clamp(0.08 + Math.pow(curved / 127, 1.5) * 1.05, 0.08, 1.2);
    }

    return {
      buffer: this.buffers.get(best.key),
      rate: Math.pow(2, (midi - best.midi) / 12),
      gain: gain * soft,
      layer,
    };
  }

  // Curva de afinación estirada (Railsback), suavizada.
  stretchCents(midi) {
    if (!this.opts.stretch) return 0;
    const d = (midi - 60) / 12;
    return this.opts.stretch * Math.sign(d) * Math.pow(Math.abs(d), 2.2) * 3.2;
  }

  // Los apagadores graves tardan más en frenar la cuerda que los agudos.
  damperTime(midi) {
    return clamp(0.42 * Math.pow(2, -(midi - 36) / 38), 0.035, 0.55);
  }

  // -------------------------------------------------------------------------
  // Ejecución
  // -------------------------------------------------------------------------
  noteOn(note, velocity = 90, time = null) {
    if (!this.buffers.size) return null;
    const t = time != null ? time : this.ctx.currentTime;
    const midi = clamp(Math.round(note), this.instrument.lowest, this.instrument.highest);
    const prev = this.held.get(midi);
    if (prev) prev.kill(t); // re-pulsación de la misma tecla
    while (this.voices.length >= this.maxVoices) {
      const victim = this.voices.find((v) => v.released) || this.voices[0];
      victim.kill(t);
      const i = this.voices.indexOf(victim);
      if (i >= 0) this.voices.splice(i, 1);
    }
    const voice = new SampleVoice(this, midi, velocity, t);
    this.voices.push(voice);
    this.held.set(midi, voice);
    return voice;
  }

  noteOff(note, time = null) {
    const t = time != null ? time : this.ctx.currentTime;
    const midi = clamp(Math.round(note), this.instrument.lowest, this.instrument.highest);
    const voice = this.held.get(midi);
    if (!voice) return;
    this.held.delete(midi);
    if (this.sustain) { voice.sustained = true; return; }
    voice.release(t);
    this.playKeyClick(midi, voice.velocity, t);
  }

  // Clic mecánico de la tecla al volver a su sitio. Muy por debajo de la nota:
  // se nota como cuerpo, no como un golpe.
  playKeyClick(midi, velocity, time) {
    const buf = this.releases.get(midi);
    if (!buf || this.opts.releaseNoise <= 0) return;
    const g = this.ctx.createGain();
    g.gain.value = KEY_CLICK_BASE * (0.35 + (velocity / 127) * 0.65) * rand(0.6, 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g).connect(this.noiseBus);
    src.start(time);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* */ } };
  }

  setSustain(on, time = null) {
    const t = time != null ? time : this.ctx.currentTime;
    this.sustain = !!on;
    if (on) return;
    for (const v of [...this.voices]) {
      if (v.sustained && !this.held.has(v.note)) {
        v.release(t);
        this.playKeyClick(v.note, v.velocity, t);
      }
    }
  }

  setSoftPedal(on) { this.softPedal = !!on; }

  // El pitch bend también dobla las cuerdas del instrumento muestreado.
  setBend(cents, time = null) {
    const t = time != null ? time : this.ctx.currentTime;
    this.bendCents = cents;
    for (const v of this.voices) {
      if (v.disposed) continue;
      v.src.detune.setTargetAtTime(this.stretchCents(v.note) + cents, t, 0.01);
    }
  }

  allNotesOff(time = null) {
    const t = time != null ? time : this.ctx.currentTime;
    for (const v of [...this.voices]) v.kill(t);
    this.voices.length = 0;
    this.held.clear();
    this.sustain = false;
  }

  setOption(key, value) {
    this.opts[key] = value;
    const t = this.ctx.currentTime;
    if (key === 'tone') this.tone.frequency.setTargetAtTime(value, t, 0.02);
    if (key === 'releaseNoise') this.noiseBus.gain.setTargetAtTime(value, t, 0.02);
  }

  get activeVoices() { return this.voices.length; }
}

// Nombre anterior, por compatibilidad.
export { SampleInstrument as PianoSampler };
