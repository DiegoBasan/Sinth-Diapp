// ---------------------------------------------------------------------------
// presets.js — patch por defecto, fábrica de presets y generador aleatorio.
// ---------------------------------------------------------------------------

export const DEFAULT_PATCH = {
  name: 'Init',
  author: '',
  volume: 0.8,
  mono: false,
  legato: true,
  glide: 0,
  bendRange: 2,
  osc1: { wave: 'sawtooth', octave: 0, semi: 0, fine: 0, level: 0.8, unison: 1, spread: 0.2 },
  osc2: { wave: 'sawtooth', octave: 0, semi: 0, fine: 7, level: 0.5, unison: 1, spread: 0.2 },
  sub: { wave: 'sine', level: 0.2 },
  noise: { level: 0 },
  filter: { type: 'lowpass', cutoff: 2400, q: 4, envAmt: 0.35, attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.4, keyTrack: 0.3 },
  amp: { attack: 0.01, decay: 0.4, sustain: 0.7, release: 0.4, velocity: 0.6 },
  lfo: { wave: 'sine', rate: 5, sync: 'off', pitch: 0, filter: 0, amp: 0, modDepth: 0.5 },
  fx: {
    dist: { on: false, drive: 0.3, tone: 6000, mix: 0.5 },
    chorus: { on: true, rate: 0.8, depth: 0.5, mix: 0.35 },
    delay: { on: true, time: 0.35, sync: '1/8', feedback: 0.35, tone: 4000, mix: 0.25, pingpong: true },
    reverb: { on: true, size: 2.4, decay: 0.6, damp: 5000, predelay: 0.02, mix: 0.3 },
  },
};

const P = (name, patch) => {
  const merge = (base, over) => {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(over || {})) {
      out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) ? merge(base[k] || {}, over[k]) : over[k];
    }
    return out;
  };
  return merge(merge(DEFAULT_PATCH, patch), { name });
};

export const FACTORY_PRESETS = [
  P('Init', {}),

  P('Súper Saw Ancho', {
    osc1: { wave: 'sawtooth', level: 0.7, unison: 5, spread: 0.7, fine: 0 },
    osc2: { wave: 'sawtooth', level: 0.5, unison: 5, spread: 0.9, octave: -1, fine: -6 },
    sub: { level: 0.15 },
    filter: { cutoff: 3800, q: 2, envAmt: 0.25, attack: 0.02, decay: 1.2, sustain: 0.6 },
    amp: { attack: 0.03, decay: 1, sustain: 0.85, release: 0.9 },
    fx: { chorus: { on: true, mix: 0.5, rate: 0.4, depth: 0.7 }, delay: { on: true, sync: '3/16', feedback: 0.4, mix: 0.28 }, reverb: { on: true, size: 3.2, mix: 0.4 } },
  }),

  P('Bajo Sub Profundo', {
    mono: true, glide: 0.04, legato: true,
    osc1: { wave: 'sawtooth', level: 0.75, octave: -1 },
    osc2: { wave: 'square', level: 0.35, octave: -1, fine: 8 },
    sub: { level: 0.6 },
    filter: { cutoff: 320, q: 6, envAmt: 0.55, attack: 0.005, decay: 0.22, sustain: 0.15, keyTrack: 0.4 },
    amp: { attack: 0.004, decay: 0.4, sustain: 0.8, release: 0.15, velocity: 0.7 },
    fx: { dist: { on: true, drive: 0.35, tone: 3500, mix: 0.4 }, chorus: { on: false }, delay: { on: false }, reverb: { on: true, size: 1.2, mix: 0.12 } },
  }),

  P('Pad Etéreo', {
    osc1: { wave: 'glass', level: 0.6, unison: 3, spread: 0.6 },
    osc2: { wave: 'triangle', level: 0.5, octave: 1, fine: -5, unison: 2, spread: 0.5 },
    sub: { level: 0.25 },
    noise: { level: 0.04 },
    filter: { cutoff: 1400, q: 3, envAmt: 0.4, attack: 1.2, decay: 3, sustain: 0.7, release: 2 },
    amp: { attack: 1.1, decay: 2, sustain: 0.9, release: 3, velocity: 0.4 },
    lfo: { rate: 0.25, filter: 0.25, pitch: 0.04 },
    fx: { chorus: { on: true, mix: 0.6, rate: 0.25, depth: 0.8 }, delay: { on: true, sync: '1/2', feedback: 0.45, mix: 0.3 }, reverb: { on: true, size: 5, decay: 0.8, mix: 0.55, predelay: 0.05 } },
  }),

  P('Pluck Cristal', {
    osc1: { wave: 'glass', level: 0.8 },
    osc2: { wave: 'sine', level: 0.4, octave: 1 },
    sub: { level: 0.1 },
    filter: { cutoff: 1800, q: 7, envAmt: 0.7, attack: 0.002, decay: 0.28, sustain: 0.05, release: 0.2, keyTrack: 0.5 },
    amp: { attack: 0.002, decay: 0.45, sustain: 0.05, release: 0.5, velocity: 0.8 },
    fx: { chorus: { on: true, mix: 0.3 }, delay: { on: true, sync: '1/8', feedback: 0.42, mix: 0.34, pingpong: true }, reverb: { on: true, size: 2.6, mix: 0.35 } },
  }),

  P('Lead Ácido', {
    mono: true, glide: 0.06, legato: true,
    osc1: { wave: 'sawtooth', level: 0.9 },
    osc2: { wave: 'pulse25', level: 0.3, fine: 5 },
    sub: { level: 0.2 },
    filter: { cutoff: 500, q: 14, envAmt: 0.65, attack: 0.003, decay: 0.3, sustain: 0.1, release: 0.2, keyTrack: 0.5 },
    amp: { attack: 0.005, decay: 0.4, sustain: 0.8, release: 0.2 },
    lfo: { rate: 5.5, filter: 0.1, modDepth: 0.3 },
    fx: { dist: { on: true, drive: 0.45, tone: 5000, mix: 0.5 }, chorus: { on: false }, delay: { on: true, sync: '3/16', feedback: 0.5, mix: 0.3, pingpong: true }, reverb: { on: true, size: 1.8, mix: 0.2 } },
  }),

  P('Órgano Vintage', {
    osc1: { wave: 'organ', level: 0.8 },
    osc2: { wave: 'sine', level: 0.45, octave: 1, fine: 3 },
    sub: { level: 0.3 },
    filter: { cutoff: 6000, q: 1, envAmt: 0.1, attack: 0.005, decay: 0.4, sustain: 0.8 },
    amp: { attack: 0.006, decay: 0.2, sustain: 1, release: 0.12, velocity: 0.25 },
    lfo: { rate: 6.5, pitch: 0.05, amp: 0.12, modDepth: 0.6 },
    fx: { dist: { on: true, drive: 0.2, tone: 6500, mix: 0.3 }, chorus: { on: true, rate: 1.6, depth: 0.6, mix: 0.45 }, delay: { on: false }, reverb: { on: true, size: 2, mix: 0.25 } },
  }),

  P('Campanas de Cristal', {
    osc1: { wave: 'sine', level: 0.7 },
    osc2: { wave: 'glass', level: 0.5, semi: 7, octave: 1 },
    sub: { level: 0.12 },
    filter: { cutoff: 5200, q: 2, envAmt: 0.5, attack: 0.002, decay: 1.4, sustain: 0.1, release: 1.2 },
    amp: { attack: 0.003, decay: 2.2, sustain: 0.12, release: 2.4, velocity: 0.75 },
    fx: { chorus: { on: true, mix: 0.4 }, delay: { on: true, sync: '1/4', feedback: 0.4, mix: 0.35, pingpong: true }, reverb: { on: true, size: 4.2, decay: 0.75, mix: 0.5 } },
  }),

  P('Brass Sintético', {
    osc1: { wave: 'sawtooth', level: 0.75, unison: 3, spread: 0.35 },
    osc2: { wave: 'sawtooth', level: 0.6, fine: -8 },
    sub: { level: 0.25 },
    filter: { cutoff: 900, q: 3, envAmt: 0.55, attack: 0.12, decay: 0.9, sustain: 0.55, release: 0.4, keyTrack: 0.35 },
    amp: { attack: 0.06, decay: 0.7, sustain: 0.85, release: 0.35, velocity: 0.65 },
    fx: { dist: { on: true, drive: 0.18, mix: 0.3 }, chorus: { on: true, mix: 0.3 }, delay: { on: false }, reverb: { on: true, size: 2.2, mix: 0.28 } },
  }),

  P('Wobble Sucio', {
    mono: true, glide: 0.02,
    osc1: { wave: 'sawtooth', level: 0.8, unison: 3, spread: 0.5, octave: -1 },
    osc2: { wave: 'pulse12', level: 0.5, octave: -1, fine: 12 },
    sub: { level: 0.5 },
    filter: { cutoff: 420, q: 12, envAmt: 0.3, attack: 0.01, decay: 0.4, sustain: 0.4 },
    lfo: { wave: 'sine', rate: 4, sync: '1/8', filter: 0.7, modDepth: 1 },
    amp: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.2 },
    fx: { dist: { on: true, drive: 0.6, tone: 4200, mix: 0.6 }, chorus: { on: false }, delay: { on: true, sync: '1/16', feedback: 0.3, mix: 0.2 }, reverb: { on: true, size: 1.6, mix: 0.15 } },
  }),

  P('Cuerdas Cálidas', {
    osc1: { wave: 'sawtooth', level: 0.6, unison: 4, spread: 0.55 },
    osc2: { wave: 'sawtooth', level: 0.45, octave: -1, unison: 3, spread: 0.45, fine: 6 },
    sub: { level: 0.18 },
    filter: { cutoff: 2000, q: 1.5, envAmt: 0.3, attack: 0.35, decay: 1.6, sustain: 0.6, release: 1 },
    amp: { attack: 0.35, decay: 1.2, sustain: 0.85, release: 1.4, velocity: 0.45 },
    lfo: { rate: 4.5, pitch: 0.03, modDepth: 0.5 },
    fx: { chorus: { on: true, mix: 0.55, rate: 0.5, depth: 0.7 }, delay: { on: false }, reverb: { on: true, size: 3.6, mix: 0.42 } },
  }),

  P('Chip 8 bits', {
    osc1: { wave: 'pulse12', level: 0.8 },
    osc2: { wave: 'square', level: 0.4, octave: 1 },
    sub: { level: 0 },
    filter: { cutoff: 8000, q: 1, envAmt: 0.2, attack: 0.001, decay: 0.2, sustain: 0.6, release: 0.05 },
    amp: { attack: 0.001, decay: 0.15, sustain: 0.7, release: 0.05, velocity: 0.3 },
    lfo: { rate: 9, pitch: 0.12, modDepth: 0.8 },
    fx: { dist: { on: false }, chorus: { on: false }, delay: { on: true, sync: '1/16', feedback: 0.28, mix: 0.22 }, reverb: { on: true, size: 1, mix: 0.12 } },
  }),

  P('Susurro Espacial', {
    osc1: { wave: 'sine', level: 0.35, unison: 2, spread: 0.4 },
    osc2: { wave: 'triangle', level: 0.3, octave: 2, fine: 4 },
    sub: { level: 0.2 },
    noise: { level: 0.22 },
    filter: { type: 'bandpass', cutoff: 900, q: 5, envAmt: 0.45, attack: 1.6, decay: 2.5, sustain: 0.6, release: 2.5 },
    amp: { attack: 1.4, decay: 2, sustain: 0.8, release: 3.5, velocity: 0.3 },
    lfo: { rate: 0.15, filter: 0.5, amp: 0.15 },
    fx: { chorus: { on: true, mix: 0.5, rate: 0.2 }, delay: { on: true, sync: '1/1', feedback: 0.55, mix: 0.35, pingpong: true }, reverb: { on: true, size: 6, decay: 0.85, mix: 0.6, predelay: 0.08 } },
  }),

  P('Piano Eléctrico', {
    osc1: { wave: 'sine', level: 0.8 },
    osc2: { wave: 'glass', level: 0.35, octave: 1 },
    sub: { level: 0.15 },
    filter: { cutoff: 2600, q: 1.5, envAmt: 0.6, attack: 0.002, decay: 0.6, sustain: 0.15, release: 0.5, keyTrack: 0.45 },
    amp: { attack: 0.003, decay: 1.1, sustain: 0.25, release: 0.6, velocity: 0.85 },
    fx: { chorus: { on: true, rate: 1.1, depth: 0.5, mix: 0.4 }, delay: { on: false }, reverb: { on: true, size: 2, mix: 0.25 } },
  }),

  P('Arpegio Neón', {
    osc1: { wave: 'pulse25', level: 0.7, unison: 2, spread: 0.4 },
    osc2: { wave: 'sawtooth', level: 0.45, octave: 1, fine: -7 },
    sub: { level: 0.2 },
    filter: { cutoff: 1500, q: 8, envAmt: 0.6, attack: 0.002, decay: 0.22, sustain: 0.12, release: 0.2, keyTrack: 0.4 },
    amp: { attack: 0.002, decay: 0.3, sustain: 0.2, release: 0.25, velocity: 0.7 },
    lfo: { rate: 2, sync: '1/4', filter: 0.15 },
    fx: { chorus: { on: true, mix: 0.35 }, delay: { on: true, sync: '1/8', feedback: 0.5, mix: 0.35, pingpong: true }, reverb: { on: true, size: 2.8, mix: 0.35 } },
  }),

  P('Drone Oscuro', {
    osc1: { wave: 'sawtooth', level: 0.6, octave: -2, unison: 3, spread: 0.6 },
    osc2: { wave: 'pulse12', level: 0.4, octave: -1, fine: 9 },
    sub: { level: 0.55 },
    noise: { level: 0.06 },
    filter: { cutoff: 420, q: 5, envAmt: 0.2, attack: 2, decay: 4, sustain: 0.8, release: 3 },
    amp: { attack: 1.8, decay: 3, sustain: 0.9, release: 4, velocity: 0.2 },
    lfo: { rate: 0.08, filter: 0.35, pitch: 0.05 },
    fx: { dist: { on: true, drive: 0.3, tone: 2200, mix: 0.4 }, chorus: { on: true, mix: 0.4, rate: 0.15 }, delay: { on: true, sync: '1/2', feedback: 0.5, mix: 0.25 }, reverb: { on: true, size: 6, decay: 0.9, mix: 0.6 } },
  }),
];

// ---------------------------------------------------------------------------
// Generador aleatorio con "carácter" opcional.
// ---------------------------------------------------------------------------
const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

const ADJ = ['Neón', 'Cristal', 'Oscuro', 'Sedoso', 'Ácido', 'Cósmico', 'Roto', 'Cálido', 'Helado', 'Turbio', 'Eléctrico', 'Lunar', 'Oxidado', 'Fantasma', 'Dorado', 'Salvaje'];
const NOUN = ['Pad', 'Lead', 'Bajo', 'Pluck', 'Campana', 'Drone', 'Cuerda', 'Metal', 'Vapor', 'Pulso', 'Eco', 'Sueño'];

export const RANDOM_CHARACTERS = {
  any: 'Cualquiera', bass: 'Bajo', lead: 'Lead', pad: 'Pad', pluck: 'Pluck', keys: 'Teclado',
};

export function randomPatch(character = 'any') {
  const kind = character === 'any' ? pick(['bass', 'lead', 'pad', 'pluck', 'keys']) : character;
  const p = JSON.parse(JSON.stringify(DEFAULT_PATCH));
  p.name = `${pick(NOUN)} ${pick(ADJ)}`;
  const waves = ['sawtooth', 'square', 'triangle', 'sine', 'pulse25', 'pulse12', 'organ', 'glass'];

  p.osc1.wave = pick(waves);
  p.osc2.wave = pick(waves);
  p.osc1.level = R(0.55, 0.9);
  p.osc2.level = chance(0.8) ? R(0.2, 0.7) : 0;
  p.osc2.octave = pick([-1, 0, 0, 1]);
  p.osc2.semi = chance(0.25) ? pick([-5, -3, 3, 4, 5, 7]) : 0;
  p.osc1.fine = RI(-4, 4);
  p.osc2.fine = RI(-14, 14);
  p.osc1.unison = pick([1, 1, 2, 3, 5]);
  p.osc2.unison = pick([1, 1, 2, 3]);
  p.osc1.spread = R(0.15, 0.8);
  p.osc2.spread = R(0.15, 0.8);
  p.sub.level = R(0, 0.45);
  p.noise.level = chance(0.3) ? R(0.02, 0.18) : 0;
  p.filter.type = chance(0.85) ? 'lowpass' : pick(['highpass', 'bandpass']);
  p.filter.q = R(1, 9);
  p.filter.keyTrack = R(0.1, 0.55);
  p.lfo.wave = pick(['sine', 'triangle', 'square', 'sawtooth']);
  p.lfo.rate = R(0.1, 8);
  p.lfo.sync = chance(0.35) ? pick(['1/4', '1/8', '1/16', '3/16']) : 'off';
  p.lfo.pitch = chance(0.3) ? R(0, 0.15) : 0;
  p.lfo.filter = chance(0.5) ? R(0.05, 0.5) : 0;
  p.lfo.amp = chance(0.25) ? R(0.05, 0.25) : 0;
  p.lfo.modDepth = R(0.3, 1);

  switch (kind) {
    case 'bass':
      p.mono = true; p.glide = chance(0.5) ? R(0.01, 0.08) : 0;
      p.osc1.octave = -1; p.osc2.octave = -1; p.sub.level = R(0.35, 0.7);
      p.filter.cutoff = R(180, 700); p.filter.envAmt = R(0.35, 0.7);
      p.filter.attack = 0.005; p.filter.decay = R(0.12, 0.45); p.filter.sustain = R(0.05, 0.3);
      p.amp = { attack: R(0.003, 0.02), decay: R(0.2, 0.6), sustain: R(0.6, 0.9), release: R(0.1, 0.3), velocity: R(0.5, 0.8) };
      break;
    case 'lead':
      p.mono = chance(0.6); p.glide = p.mono && chance(0.6) ? R(0.02, 0.1) : 0;
      p.filter.cutoff = R(700, 3500); p.filter.envAmt = R(0.3, 0.7);
      p.filter.attack = R(0.002, 0.05); p.filter.decay = R(0.2, 0.8); p.filter.sustain = R(0.2, 0.6);
      p.amp = { attack: R(0.003, 0.06), decay: R(0.2, 0.7), sustain: R(0.6, 0.9), release: R(0.15, 0.5), velocity: R(0.4, 0.8) };
      break;
    case 'pad':
      p.filter.cutoff = R(600, 2600); p.filter.envAmt = R(0.15, 0.5);
      p.filter.attack = R(0.5, 2); p.filter.decay = R(1, 3); p.filter.sustain = R(0.5, 0.85); p.filter.release = R(1, 3);
      p.amp = { attack: R(0.5, 1.8), decay: R(1, 2.5), sustain: R(0.7, 0.95), release: R(1.5, 4), velocity: R(0.2, 0.5) };
      break;
    case 'pluck':
      p.filter.cutoff = R(900, 3200); p.filter.envAmt = R(0.5, 0.85);
      p.filter.attack = 0.002; p.filter.decay = R(0.1, 0.35); p.filter.sustain = R(0.02, 0.15); p.filter.release = R(0.1, 0.4);
      p.amp = { attack: R(0.002, 0.01), decay: R(0.15, 0.6), sustain: R(0.02, 0.2), release: R(0.2, 0.7), velocity: R(0.6, 0.9) };
      break;
    default:
      p.filter.cutoff = R(1200, 5000); p.filter.envAmt = R(0.2, 0.6);
      p.filter.attack = R(0.002, 0.03); p.filter.decay = R(0.3, 1); p.filter.sustain = R(0.15, 0.5);
      p.amp = { attack: R(0.003, 0.03), decay: R(0.5, 1.5), sustain: R(0.2, 0.6), release: R(0.3, 0.9), velocity: R(0.5, 0.9) };
      break;
  }

  p.fx.dist = { on: chance(kind === 'bass' || kind === 'lead' ? 0.5 : 0.25), drive: R(0.15, 0.6), tone: R(2500, 8000), mix: R(0.25, 0.6) };
  p.fx.chorus = { on: chance(0.7), rate: R(0.15, 2), depth: R(0.3, 0.9), mix: R(0.2, 0.6) };
  p.fx.delay = { on: chance(kind === 'bass' ? 0.25 : 0.75), time: R(0.1, 0.6), sync: pick(['1/8', '1/4', '3/16', '1/16', 'off']), feedback: R(0.2, 0.55), tone: R(2000, 7000), mix: R(0.15, 0.38), pingpong: chance(0.6) };
  p.fx.reverb = { on: chance(0.85), size: kind === 'pad' ? R(3, 6) : R(1, 3.5), decay: R(0.4, 0.85), damp: R(2500, 8000), predelay: R(0, 0.06), mix: kind === 'bass' ? R(0.05, 0.2) : R(0.15, 0.5) };
  return p;
}
