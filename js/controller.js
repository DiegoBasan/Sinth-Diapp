// ---------------------------------------------------------------------------
// controller.js — mapeo del M-VAVE SMK-25 (8 perillas + 8 pads) con MIDI Learn.
// Los valores por defecto siguen el mapa de fábrica del SMK-25; cualquier
// control puede reasignarse aprendiendo el mensaje entrante.
// ---------------------------------------------------------------------------

// Destinos disponibles para las perillas.
export const KNOB_TARGETS = [
  { id: 'filter.cutoff', label: 'Filtro · Frecuencia', min: 60, max: 16000, curve: 'exp' },
  { id: 'filter.q', label: 'Filtro · Resonancia', min: 0.1, max: 22, curve: 'exp' },
  { id: 'filter.envAmt', label: 'Filtro · Envolvente', min: 0, max: 1 },
  { id: 'filter.attack', label: 'Filtro · Ataque', min: 0.001, max: 3, curve: 'exp' },
  { id: 'filter.decay', label: 'Filtro · Caída', min: 0.01, max: 6, curve: 'exp' },
  { id: 'filter.sustain', label: 'Filtro · Sostenido', min: 0, max: 1 },
  { id: 'filter.release', label: 'Filtro · Relajación', min: 0.01, max: 6, curve: 'exp' },
  { id: 'amp.attack', label: 'Amp · Ataque', min: 0.001, max: 4, curve: 'exp' },
  { id: 'amp.decay', label: 'Amp · Caída', min: 0.01, max: 6, curve: 'exp' },
  { id: 'amp.sustain', label: 'Amp · Sostenido', min: 0, max: 1 },
  { id: 'amp.release', label: 'Amp · Relajación', min: 0.01, max: 8, curve: 'exp' },
  { id: 'osc1.level', label: 'Osc 1 · Nivel', min: 0, max: 1 },
  { id: 'osc1.fine', label: 'Osc 1 · Afinación fina', min: -50, max: 50 },
  { id: 'osc1.spread', label: 'Osc 1 · Detune unísono', min: 0, max: 1 },
  { id: 'osc2.level', label: 'Osc 2 · Nivel', min: 0, max: 1 },
  { id: 'osc2.fine', label: 'Osc 2 · Afinación fina', min: -50, max: 50 },
  { id: 'osc2.spread', label: 'Osc 2 · Detune unísono', min: 0, max: 1 },
  { id: 'sub.level', label: 'Sub · Nivel', min: 0, max: 1 },
  { id: 'noise.level', label: 'Ruido · Nivel', min: 0, max: 1 },
  { id: 'lfo.rate', label: 'LFO · Velocidad', min: 0.05, max: 20, curve: 'exp' },
  { id: 'lfo.pitch', label: 'LFO → Afinación', min: 0, max: 1, curve: 'exp2' },
  { id: 'lfo.filter', label: 'LFO → Filtro', min: 0, max: 1 },
  { id: 'lfo.amp', label: 'LFO → Volumen', min: 0, max: 1 },
  { id: 'glide', label: 'Portamento', min: 0, max: 1, curve: 'exp2' },
  { id: 'fx.dist.drive', label: 'Distorsión · Cantidad', min: 0, max: 1 },
  { id: 'fx.dist.mix', label: 'Distorsión · Mezcla', min: 0, max: 1 },
  { id: 'fx.chorus.rate', label: 'Chorus · Velocidad', min: 0.05, max: 8, curve: 'exp' },
  { id: 'fx.chorus.depth', label: 'Chorus · Profundidad', min: 0, max: 1 },
  { id: 'fx.chorus.mix', label: 'Chorus · Mezcla', min: 0, max: 1 },
  { id: 'fx.delay.time', label: 'Eco · Tiempo', min: 0.01, max: 2, curve: 'exp' },
  { id: 'fx.delay.feedback', label: 'Eco · Repeticiones', min: 0, max: 0.95 },
  { id: 'fx.delay.tone', label: 'Eco · Tono', min: 300, max: 16000, curve: 'exp' },
  { id: 'fx.delay.mix', label: 'Eco · Mezcla', min: 0, max: 1 },
  { id: 'fx.reverb.size', label: 'Reverb · Tamaño', min: 0.2, max: 8 },
  { id: 'fx.reverb.decay', label: 'Reverb · Cola', min: 0.05, max: 0.98 },
  { id: 'fx.reverb.damp', label: 'Reverb · Amortiguación', min: 400, max: 16000, curve: 'exp' },
  { id: 'fx.reverb.mix', label: 'Reverb · Mezcla', min: 0, max: 1 },
  { id: 'fx.dist.tone', label: 'Distorsión · Tono', min: 300, max: 16000, curve: 'exp' },
  { id: 'fx.reverb.predelay', label: 'Reverb · Pre-delay', min: 0, max: 0.3 },
  { id: 'amp.velocity', label: 'Sensibilidad a la pulsación', min: 0, max: 1 },
  { id: 'filter.keyTrack', label: 'Filtro · Seguimiento de teclado', min: 0, max: 1 },
  { id: 'lfo.modDepth', label: 'Rueda de modulación → LFO', min: 0, max: 1 },
  { id: 'bendRange', label: 'Rango de pitch bend', min: 1, max: 12 },
  { id: 'volume', label: 'Volumen general', min: 0, max: 1 },
  { id: '@bpm', label: 'Tempo (BPM)', min: 40, max: 220 },
  { id: '@arpRate', label: 'Arpegio · División', min: 0, max: 1 },
  { id: '@arpGate', label: 'Arpegio · Duración', min: 0.05, max: 1 },
  { id: '@none', label: '— sin asignar —', min: 0, max: 1 },
];
export const TARGET_BY_ID = Object.fromEntries(KNOB_TARGETS.map((t) => [t.id, t]));

// Mapa de fábrica del SMK-25: perillas CC 21–28, pads notas 36–43.
export const DEFAULT_MAPPING = {
  knobs: [
    { cc: 21, target: 'filter.cutoff' },
    { cc: 22, target: 'filter.q' },
    { cc: 23, target: 'amp.attack' },
    { cc: 24, target: 'amp.release' },
    { cc: 25, target: 'fx.delay.mix' },
    { cc: 26, target: 'fx.reverb.mix' },
    { cc: 27, target: 'lfo.rate' },
    { cc: 28, target: 'volume' },
  ],
  pads: [36, 37, 38, 39, 40, 41, 42, 43],
  modWheelCC: 1,
  sustainCC: 64,
  padChannel: null, // null = cualquier canal
};

export const PAD_MODES = {
  drums: 'Batería',
  chords: 'Acordes de la tonalidad',
  suggest: 'Sugerencias de acordes',
  presets: 'Cambiar preset',
  transport: 'Transporte y control',
};

export const TRANSPORT_ACTIONS = [
  { id: 'arp', label: 'Arpegio on/off' },
  { id: 'latch', label: 'Retener (latch)' },
  { id: 'rec', label: 'Grabar loop' },
  { id: 'play', label: 'Reproducir loop' },
  { id: 'clear', label: 'Borrar loop' },
  { id: 'metronome', label: 'Metrónomo' },
  { id: 'octDown', label: 'Octava −' },
  { id: 'octUp', label: 'Octava +' },
];

export function scaleValue(target, v01) {
  const t = TARGET_BY_ID[target] || { min: 0, max: 1 };
  const { min, max, curve } = t;
  if (curve === 'exp' && min > 0) return min * Math.pow(max / min, v01);
  if (curve === 'exp2') return min + (max - min) * v01 * v01;
  return min + (max - min) * v01;
}

export function unscaleValue(target, v) {
  const t = TARGET_BY_ID[target] || { min: 0, max: 1 };
  const { min, max, curve } = t;
  if (curve === 'exp' && min > 0) return Math.log(v / min) / Math.log(max / min);
  if (curve === 'exp2') return Math.sqrt(Math.max(0, (v - min) / (max - min)));
  return (v - min) / (max - min);
}

export function formatValue(target, v) {
  const t = TARGET_BY_ID[target];
  if (!t) return String(v);
  if (t.id === 'filter.cutoff' || t.id === 'fx.delay.tone' || t.id === 'fx.reverb.damp') {
    return v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`;
  }
  if (t.id === '@bpm') return `${Math.round(v)} BPM`;
  if (t.id === 'bendRange') return `${Math.round(v)} st`;
  if (t.id === 'fx.reverb.predelay') return `${Math.round(v * 1000)} ms`;
  if (t.id === 'fx.reverb.size') return `${v.toFixed(1)} s`;
  if (t.id === 'lfo.rate' || t.id === 'fx.chorus.rate') return `${v.toFixed(2)} Hz`;
  if (t.max <= 1.001 && t.min >= 0) return `${Math.round(v * 100)}%`;
  if (['filter.attack', 'filter.decay', 'filter.release', 'amp.attack', 'amp.decay', 'amp.release', 'fx.delay.time', 'glide'].includes(t.id)) {
    return v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
  }
  if (t.id.endsWith('fine')) return `${v.toFixed(0)} ct`;
  return v.toFixed(2);
}
