// ---------------------------------------------------------------------------
// sampler.js — piano clásico por muestras (Salamander Grand Piano v3, CC-BY 3.0).
//
// Las muestras están cada tercera menor, así que ninguna nota queda a más de un
// semitono de su muestra y el desplazamiento de afinación es inaudible. Hay
// cuatro capas de dinámica y una muestra de soltado por cada una de las 88 teclas.
// ---------------------------------------------------------------------------

export const SAMPLE_NOTES = ['A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3',
  'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7', 'Ds7', 'Fs7', 'A7', 'C8'];

// Capa (de 16) y la velocidad MIDI que representa: (capa - 0.5) / 16.
export const LAYERS = [
  { id: 3, vel: 20, name: 'pianissimo' },
  { id: 7, vel: 52, name: 'mezzopiano' },
  { id: 11, vel: 84, name: 'mezzoforte' },
  { id: 15, vel: 116, name: 'fortissimo' },
];
const LOWEST_KEY = 21; // A0
const HIGHEST_KEY = 108; // C8
const PC = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };

export function sampleNameToMidi(name) {
  const m = /^([A-G]s?)(-?\d)$/.exec(name);
  if (!m) return null;
  return PC[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
class PianoVoice {
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
    this.src.detune.value = sampler.stretchCents(note);
    this.src.connect(this.gain);
    this.src.start(time);
    this.src.onended = () => this.dispose();
    this.endsAt = time + (pick.buffer.duration / pick.rate);
  }

  // Al soltar, los apagadores frenan la cuerda: cuanto más grave, más tarda.
  release(time, pedalHalf = 0) {
    if (this.released) return;
    this.released = true;
    this.sustained = false;
    const base = this.sampler.damperTime(this.note);
    const tc = base * (1 + pedalHalf * 5);
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
export class PianoSampler extends EventTarget {
  constructor(ctx, baseUrl = 'audio/piano/') {
    super();
    this.ctx = ctx;
    this.baseUrl = baseUrl;
    this.buffers = new Map();   // "C4v11" -> AudioBuffer
    this.releases = new Map();  // midi -> AudioBuffer
    this.voices = [];
    this.held = new Map();      // midi -> PianoVoice
    this.sustain = false;
    this.softPedal = false;
    this.ready = false;
    this.loading = false;
    this.progress = 0;
    this.maxVoices = 32;
    this.opts = {
      gain: 1,
      tone: 12000,      // filtro de brillo
      releaseNoise: 0.5, // ruido de apagador al soltar
      stretch: 0.5,      // afinación estirada
      dynamics: 1,       // curva de respuesta a la pulsación
    };

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
  }

  // -------------------------------------------------------------------------
  // Carga progresiva: primero una capa media para poder tocar cuanto antes,
  // después el resto en segundo plano.
  // -------------------------------------------------------------------------
  async load() {
    if (this.loading || this.ready) return;
    this.loading = true;
    const order = [LAYERS[2], LAYERS[1], LAYERS[3], LAYERS[0]];
    const jobs = [];
    for (const layer of order) for (const note of SAMPLE_NOTES) jobs.push({ kind: 'note', note, layer: layer.id });
    for (let k = 1; k <= 88; k++) jobs.push({ kind: 'rel', index: k });

    let done = 0;
    const total = jobs.length;
    const playableAt = SAMPLE_NOTES.length; // con la primera capa ya se puede tocar

    const fetchOne = async (job) => {
      const url = job.kind === 'note' ? `${this.baseUrl}${job.note}v${job.layer}.mp3` : `${this.baseUrl}rel${job.index}.mp3`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (job.kind === 'note') this.buffers.set(`${job.note}v${job.layer}`, buf);
        else this.releases.set(LOWEST_KEY + job.index - 1, buf);
      } catch (e) {
        this.dispatchEvent(new CustomEvent('sampleerror', { detail: { url, message: e.message } }));
      }
      done++;
      this.progress = done / total;
      if (done === playableAt && !this.ready) {
        this.ready = true;
        this.dispatchEvent(new CustomEvent('playable'));
      }
      this.dispatchEvent(new CustomEvent('progress', { detail: { done, total, ratio: this.progress } }));
    };

    // De seis en seis: rápido sin saturar la conexión.
    for (let i = 0; i < jobs.length; i += 6) {
      await Promise.all(jobs.slice(i, i + 6).map(fetchOne));
    }
    this.loading = false;
    this.ready = this.buffers.size > 0;
    this.dispatchEvent(new CustomEvent('loaded', { detail: { samples: this.buffers.size, releases: this.releases.size } }));
  }

  get loadedLayers() {
    return LAYERS.filter((l) => this.buffers.has(`C4v${l.id}`) || this.buffers.has(`A4v${l.id}`));
  }

  // Muestra más cercana en altura y en dinámica, entre las ya cargadas.
  pickSample(note, velocity) {
    const midi = clamp(Math.round(note), LOWEST_KEY, HIGHEST_KEY);
    const v = clamp(velocity, 1, 127);
    const curved = Math.pow(v / 127, this.opts.dynamics) * 127;

    const layers = this.loadedLayers.length ? this.loadedLayers : LAYERS;
    let layer = layers[0];
    for (const l of layers) if (Math.abs(l.vel - curved) < Math.abs(layer.vel - curved)) layer = l;

    let best = null;
    for (const name of SAMPLE_NOTES) {
      const key = `${name}v${layer.id}`;
      if (!this.buffers.has(key)) continue;
      const d = Math.abs(sampleNameToMidi(name) - midi);
      if (!best || d < best.d) best = { d, key, midi: sampleNameToMidi(name) };
    }
    if (!best) { // aún no ha llegado esa capa: usa cualquiera disponible
      for (const [key, buf] of this.buffers) {
        const name = key.split('v')[0];
        const d = Math.abs(sampleNameToMidi(name) - midi);
        if (!best || d < best.d) best = { d, key, midi: sampleNameToMidi(name), buffer: buf };
      }
    }
    if (!best) return null;

    // Compensa la diferencia entre la dinámica pedida y la de la capa elegida.
    const ratio = (curved + 6) / (layer.vel + 6);
    const trim = clamp(Math.pow(ratio, 0.85), 0.35, 1.9);
    const soft = this.softPedal ? 0.62 : 1;
    return {
      buffer: best.buffer || this.buffers.get(best.key),
      rate: Math.pow(2, (midi - best.midi) / 12),
      gain: trim * soft * 0.85,
      layer,
    };
  }

  // Curva de afinación estirada (Railsback), suavizada.
  stretchCents(midi) {
    const d = (midi - 60) / 12;
    return this.opts.stretch * Math.sign(d) * Math.pow(Math.abs(d), 2.2) * 3.2;
  }

  // Los apagadores graves tardan más en frenar la cuerda que los agudos.
  damperTime(midi) {
    return clamp(0.42 * Math.pow(2, -(midi - 36) / 38), 0.035, 0.55);
  }

  noteOn(note, velocity = 90, time = null) {
    if (!this.buffers.size) return null;
    const t = time != null ? time : this.ctx.currentTime;
    const midi = clamp(Math.round(note), LOWEST_KEY, HIGHEST_KEY);
    const prev = this.held.get(midi);
    if (prev) prev.kill(t); // re-pulsación de la misma tecla
    while (this.voices.length >= this.maxVoices) {
      const victim = this.voices.find((v) => v.released) || this.voices[0];
      victim.kill(t);
      const i = this.voices.indexOf(victim);
      if (i >= 0) this.voices.splice(i, 1);
    }
    const voice = new PianoVoice(this, midi, velocity, t);
    this.voices.push(voice);
    this.held.set(midi, voice);
    return voice;
  }

  noteOff(note, time = null) {
    const t = time != null ? time : this.ctx.currentTime;
    const midi = clamp(Math.round(note), LOWEST_KEY, HIGHEST_KEY);
    const voice = this.held.get(midi);
    if (!voice) return;
    this.held.delete(midi);
    if (this.sustain) { voice.sustained = true; this.voices.includes(voice) || this.voices.push(voice); return; }
    voice.release(t);
    this.playRelease(midi, voice.velocity, t);
  }

  // Ruido del macillo y el apagador al levantar la tecla.
  playRelease(midi, velocity, time) {
    const buf = this.releases.get(midi);
    if (!buf || this.opts.releaseNoise <= 0) return;
    const g = this.ctx.createGain();
    g.gain.value = clamp(0.25 + (velocity / 127) * 0.35, 0.1, 0.7);
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
        this.playRelease(v.note, v.velocity, t);
      }
    }
  }

  setSoftPedal(on) { this.softPedal = !!on; }

  // El pitch bend también dobla las cuerdas del piano por muestras.
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
