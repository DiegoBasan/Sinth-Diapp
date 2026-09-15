// ---------------------------------------------------------------------------
// instruments.js — catálogo de instrumentos muestreados.
//
// Hay dos formas de set:
//   · 'layered'   — pocas notas pero varias capas de dinámica (Salamander).
//   · 'chromatic' — las 88 notas con una sola capa (soundfonts FluidR3 GM).
// ---------------------------------------------------------------------------

const SHARPS = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Nombres de archivo de las 88 teclas con bemoles, como los publica FluidR3.
function allKeys(flat = true) {
  const out = [];
  for (let m = 21; m <= 108; m++) {
    const table = flat ? FLATS : SHARPS;
    out.push(table[m % 12] + (Math.floor(m / 12) - 1));
  }
  return out;
}

const SALAMANDER_NOTES = ['A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3',
  'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7', 'Ds7', 'Fs7', 'A7', 'C8'];

const GM_CREDIT = 'Soundfont FluidR3 GM, empaquetado por Benjamin Gleitzman (MIT)';

export const FAMILIES = {
  teclado: 'Teclados',
  cuerda: 'Cuerdas',
};

// Un instrumento del soundfont: 88 notas, una capa, sin ruido de teclado.
// `sustain` marca los que no se apagan solos: sus muestras duran tres segundos
// y siguen a pleno volumen al final, así que se reproducen en bucle.
const gm = (id, name, folder, size, tone, opts = {}) => ({
  id, name, dir: `audio/${opts.root || 'gm'}/${folder}/`, kind: 'chromatic', family: opts.family || 'teclado',
  notes: allKeys(true), layers: null, releases: 0, lowest: 21, highest: 108,
  size, credit: GM_CREDIT, license: 'MIT',
  // Los sets del soundfont están grabados mucho más bajos que el gran cola.
  // `trim` los iguala para que cambiar de instrumento no sea un susto.
  trim: opts.trim || 1,
  sustain: !!opts.sustain,
  release: opts.release != null ? opts.release : null,
  defaults: {
    tone, stretch: 0, releaseNoise: 0, dynamics: opts.dynamics || 1, gain: opts.gain || 1,
    attack: opts.attack || 0,
  },
  note: opts.note || '',
});

// Atajo para la familia de cuerdas, que vive en su propia carpeta.
const str = (id, name, folder, size, tone, opts = {}) =>
  gm(id, name, folder, size, tone, { ...opts, root: 'strings', family: 'cuerda' });

export const INSTRUMENTS = [
  {
    id: 'salamander',
    name: 'Gran cola Yamaha C5',
    dir: 'audio/piano/',
    kind: 'layered',
    family: 'teclado',
    notes: SALAMANDER_NOTES,
    layers: [
      { id: 3, vel: 20, name: 'pianissimo' },
      { id: 7, vel: 52, name: 'mezzopiano' },
      { id: 11, vel: 84, name: 'mezzoforte' },
      { id: 15, vel: 116, name: 'fortissimo' },
    ],
    releases: 88,
    lowest: 21,
    highest: 108,
    size: '23 MB',
    credit: 'Salamander Grand Piano v3 de Alexander Holm (CC-BY 3.0), en los MP3 de @tonejs/piano',
    license: 'CC-BY 3.0',
    sustain: false,
    release: null,
    trim: 1,
    defaults: { tone: 12000, stretch: 0.5, releaseNoise: 1, dynamics: 1, gain: 1, attack: 0 },
    note: 'Cuatro capas de dinámica y el ruido real de cada tecla. Es el de mejor calidad y el más pesado.',
  },
  gm('bright', 'Cola brillante', 'bright_acoustic_piano', '2,2 MB', 14000, { trim: 5.1, note: 'Más presencia en los agudos, va bien con banda.' }),
  gm('grand-e', 'Cola amplificado', 'electric_grand_piano', '1,7 MB', 12000, { trim: 3.8, note: 'El sonido de un cola con pastillas, tipo Yamaha CP.' }),
  gm('honkytonk', 'Piano de bar', 'honkytonk_piano', '2,1 MB', 11000, { trim: 4.8, note: 'Desafinado a propósito, para ragtime y country.' }),
  gm('rhodes', 'Piano eléctrico Rhodes', 'electric_piano_1', '1,8 MB', 13000, { trim: 3.3, note: 'Campanas suaves. El clásico del soul y la bossa.' }),
  gm('fm-piano', 'Piano eléctrico FM', 'electric_piano_2', '2,0 MB', 15000, { trim: 4.3, note: 'El eléctrico digital de los ochenta, brillante y cristalino.' }),
  gm('harpsichord', 'Clavecín', 'harpsichord', '1,9 MB', 16000, { trim: 3.6, note: 'Cuerdas pulsadas: no responde a la fuerza, como el instrumento real.' }),
  gm('clavinet', 'Clavinet', 'clavinet', '1,9 MB', 14000, { trim: 2.6, note: 'Percutido y funky, para líneas rítmicas.' }),
  gm('celesta', 'Celesta', 'celesta', '1,4 MB', 16000, { trim: 3.5, note: 'Láminas metálicas: dulce y cristalina en los agudos.' }),
  gm('musicbox', 'Caja de música', 'music_box', '1,5 MB', 16000, { trim: 3.2, note: 'Pequeña y de cuerda, con mucho carácter.' }),

  // --- Cuerdas ---
  str('strings', 'Cuerdas de orquesta', 'string_ensemble_1', '2,3 MB', 11000,
    { trim: 3.7, sustain: true, release: 0.5, attack: 0.05, note: 'La sección entera, con ataque suave. Aguanta todo lo que la mantengas pulsada.' }),
  str('strings-warm', 'Cuerdas cálidas', 'string_ensemble_2', '2,3 MB', 9000,
    { trim: 2.7, sustain: true, release: 0.7, attack: 0.16, note: 'Más lenta y envolvente, para acordes largos y fondos.' }),
  str('strings-synth', 'Cuerdas sintéticas', 'synth_strings_1', '2,4 MB', 12000,
    { trim: 2.7, sustain: true, release: 0.6, attack: 0.1, note: 'El pad de cuerdas de sintetizador, más plano y sin aire de sala.' }),
  str('tremolo', 'Cuerdas en trémolo', 'tremolo_strings', '2,3 MB', 12000,
    { trim: 3.3, sustain: true, release: 0.35, attack: 0.03, note: 'Arcos temblando: tensión de banda sonora.' }),
  str('pizzicato', 'Pizzicato', 'pizzicato_strings', '1,7 MB', 14000,
    { trim: 2.4, release: 0.25, note: 'Cuerdas pellizcadas con el dedo. Corto y seco, va muy bien con la caja de ritmos.' }),
  str('violin', 'Violín', 'violin', '2,4 MB', 13000,
    { trim: 3.2, sustain: true, release: 0.4, attack: 0.06, note: 'Un solo violín, con su vibrato.' }),
  str('viola', 'Viola', 'viola', '2,3 MB', 12000,
    { trim: 3.0, sustain: true, release: 0.4, attack: 0.06, note: 'Entre el violín y el chelo, con un color más oscuro.' }),
  str('cello', 'Violonchelo', 'cello', '2,5 MB', 11000,
    { trim: 2.8, sustain: true, release: 0.45, attack: 0.07, note: 'Voz grave y cantada. Perfecto para melodías con la mano izquierda.' }),
  str('contrabass', 'Contrabajo', 'contrabass', '1,9 MB', 9000,
    { trim: 3.4, sustain: true, release: 0.5, attack: 0.08, note: 'El fondo de la sección: sostiene los graves sin embarrar.' }),
  str('harp', 'Arpa', 'orchestral_harp', '1,6 MB', 15000,
    { trim: 4.1, release: 0.6, note: 'Cuerdas pulsadas que resuenan solas. Ideal con el arpegio activado.' }),
];

export const INSTRUMENT_BY_ID = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));
export const DEFAULT_INSTRUMENT = 'salamander';

// ---------------------------------------------------------------------------
// Calidad: cuántas capas de dinámica se descargan de un set con varias.
// Cada capa del Salamander pesa 5,5 MB al descargar y unos 140 MB ya
// descodificada en memoria, así que en equipos modestos conviene recortar.
// ---------------------------------------------------------------------------
export const QUALITY = {
  high: { id: 'high', name: 'Alta', layers: 4, note: '4 dinámicas · 23 MB · ~560 MB de memoria' },
  mid: { id: 'mid', name: 'Media', layers: 2, note: '2 dinámicas · 12 MB · ~290 MB de memoria' },
  low: { id: 'low', name: 'Ligera', layers: 1, note: '1 dinámica · 7 MB · ~150 MB de memoria' },
};

export function suggestQuality() {
  const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1400;
  if (w < 900 || (mem != null && mem < 4)) return 'low';
  if (mem == null) return 'mid';        // el navegador no lo dice: tirar por lo prudente
  return mem >= 8 && w >= 1200 ? 'high' : 'mid';
}

// Elige las capas mejor repartidas para el número que se pueda permitir.
export function layersFor(inst, quality) {
  if (!inst.layers) return null;
  const want = Math.min(inst.layers.length, (QUALITY[quality] || QUALITY.mid).layers);
  if (want >= inst.layers.length) return inst.layers;
  const len = inst.layers.length;
  if (want === 1) return [inst.layers[Math.floor(len / 2)]];
  // Se descarta primero la capa más floja: con pocas capas es mejor cubrir el
  // rango que de verdad se toca que reservar una muestra para el pianissimo.
  const out = [];
  for (let i = 0; i < want; i++) {
    out.push(inst.layers[Math.round(1 + (i * (len - 2)) / (want - 1))]);
  }
  return out;
}

const PC = { C: 0, Cs: 1, Db: 1, D: 2, Ds: 3, Eb: 3, E: 4, F: 5, Fs: 6, Gb: 6, G: 7, Gs: 8, Ab: 8, A: 9, As: 10, Bb: 10, B: 11 };

export function sampleNameToMidi(name) {
  const m = /^([A-G][sb]?)(-?\d)$/.exec(name);
  if (!m || PC[m[1]] == null) return null;
  return PC[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}

// Distancia máxima, en semitonos, entre una tecla y su muestra más cercana.
export function maxStretch(inst) {
  const ms = inst.notes.map(sampleNameToMidi).filter((n) => n != null);
  let max = 0;
  for (let m = inst.lowest; m <= inst.highest; m++) {
    max = Math.max(max, Math.min(...ms.map((x) => Math.abs(x - m))));
  }
  return max;
}
