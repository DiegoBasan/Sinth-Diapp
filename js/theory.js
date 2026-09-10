// ---------------------------------------------------------------------------
// theory.js — nombres de notas, detección de acordes, tonalidad, escalas y
// sugerencias de progresión. Sin dependencias; se puede probar en Node.
// ---------------------------------------------------------------------------

export const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLF_SHARP = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const SOLF_FLAT = ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const DEFAULT_FLAT = [0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0];

export const naming = { solfege: false, flats: null }; // flats: null = automático

export const mod12 = (n) => ((n % 12) + 12) % 12;

export function pcName(pc, useFlat) {
  pc = mod12(pc);
  const flat = useFlat != null ? useFlat : (naming.flats == null ? !!DEFAULT_FLAT[pc] : naming.flats);
  const table = naming.solfege ? (flat ? SOLF_FLAT : SOLF_SHARP) : (flat ? FLAT : SHARP);
  return table[pc];
}
export function noteName(midi, useFlat) {
  return pcName(midi, useFlat) + (Math.floor(midi / 12) - 1);
}
export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
export function isBlack(midi) { return [1, 3, 6, 8, 10].includes(mod12(midi)); }

export function keyUsesFlats(tonic, mode) {
  const majFlat = [5, 10, 3, 8, 1, 6];
  const minFlat = [2, 7, 0, 5, 10, 3];
  return (mode === 'minor' ? minFlat : majFlat).includes(mod12(tonic));
}

// ---------------------------------------------------------------------------
// Diccionario de acordes. iv = intervalos desde la fundamental; opt = notas
// que pueden omitirse en la voz (típicamente la quinta).
// ---------------------------------------------------------------------------
export const CHORDS = [
  { sym: '', name: 'mayor', iv: [0, 4, 7] },
  { sym: 'm', name: 'menor', iv: [0, 3, 7] },
  { sym: 'dim', name: 'disminuido', iv: [0, 3, 6] },
  { sym: 'aug', name: 'aumentado', iv: [0, 4, 8] },
  { sym: 'sus2', name: 'suspendido 2ª', iv: [0, 2, 7] },
  { sym: 'sus4', name: 'suspendido 4ª', iv: [0, 5, 7] },
  { sym: '5', name: 'quinta (power chord)', iv: [0, 7] },
  { sym: '6', name: 'sexta', iv: [0, 4, 7, 9], opt: [7] },
  { sym: 'm6', name: 'menor sexta', iv: [0, 3, 7, 9], opt: [7] },
  { sym: '7', name: 'séptima (dominante)', iv: [0, 4, 7, 10], opt: [7] },
  { sym: 'maj7', name: 'séptima mayor', iv: [0, 4, 7, 11], opt: [7] },
  { sym: 'm7', name: 'menor séptima', iv: [0, 3, 7, 10], opt: [7] },
  { sym: 'mMaj7', name: 'menor con séptima mayor', iv: [0, 3, 7, 11] },
  { sym: 'dim7', name: 'séptima disminuida', iv: [0, 3, 6, 9] },
  { sym: 'm7b5', name: 'semidisminuido', iv: [0, 3, 6, 10] },
  { sym: '7b5', name: 'séptima con quinta bemol', iv: [0, 4, 6, 10] },
  { sym: 'aug7', name: 'séptima aumentada', iv: [0, 4, 8, 10] },
  { sym: 'augMaj7', name: 'séptima mayor aumentada', iv: [0, 4, 8, 11] },
  { sym: '7sus4', name: 'séptima suspendida 4ª', iv: [0, 5, 7, 10], opt: [7] },
  { sym: '7sus2', name: 'séptima suspendida 2ª', iv: [0, 2, 7, 10] },
  { sym: 'add9', name: 'con novena añadida', iv: [0, 2, 4, 7] },
  { sym: 'madd9', name: 'menor con novena añadida', iv: [0, 2, 3, 7] },
  { sym: 'add11', name: 'con oncena añadida', iv: [0, 4, 5, 7] },
  { sym: '6/9', name: 'sexta con novena', iv: [0, 2, 4, 7, 9], opt: [7] },
  { sym: '9', name: 'novena (dominante)', iv: [0, 2, 4, 7, 10], opt: [7] },
  { sym: 'maj9', name: 'novena mayor', iv: [0, 2, 4, 7, 11], opt: [7] },
  { sym: 'm9', name: 'menor novena', iv: [0, 2, 3, 7, 10], opt: [7] },
  { sym: '7b9', name: 'séptima con novena bemol', iv: [0, 1, 4, 7, 10], opt: [7] },
  { sym: '7#9', name: 'séptima con novena aumentada', iv: [0, 3, 4, 7, 10], opt: [7] },
  { sym: '7#11', name: 'séptima con oncena aumentada', iv: [0, 4, 6, 7, 10], opt: [7] },
  { sym: 'maj7#11', name: 'séptima mayor con oncena aumentada', iv: [0, 4, 6, 7, 11], opt: [7] },
  { sym: '9sus4', name: 'novena suspendida 4ª', iv: [0, 2, 5, 7, 10], opt: [7] },
  { sym: 'm6/9', name: 'menor sexta con novena', iv: [0, 2, 3, 7, 9], opt: [7] },
  { sym: '11', name: 'oncena', iv: [0, 2, 4, 5, 7, 10], opt: [7, 4] },
  { sym: 'm11', name: 'menor oncena', iv: [0, 2, 3, 5, 7, 10], opt: [7, 2] },
  { sym: '13', name: 'trecena', iv: [0, 2, 4, 7, 9, 10], opt: [7, 2] },
  { sym: 'maj13', name: 'trecena mayor', iv: [0, 2, 4, 7, 9, 11], opt: [7, 2] },
  { sym: 'm13', name: 'menor trecena', iv: [0, 2, 3, 7, 9, 10], opt: [7, 2] },
];
const CHORD_BY_SYM = Object.fromEntries(CHORDS.map((c) => [c.sym, c]));
export function chordIntervals(sym) { return (CHORD_BY_SYM[sym] || CHORD_BY_SYM['']).iv; }

const INTERVAL_NAMES = ['unísono', 'segunda menor', 'segunda mayor', 'tercera menor', 'tercera mayor',
  'cuarta justa', 'tritono', 'quinta justa', 'sexta menor', 'sexta mayor', 'séptima menor', 'séptima mayor'];

export function chordFamily(sym) {
  if (['dim', 'dim7', 'm7b5'].includes(sym)) return 'dim';
  if (['aug', 'augMaj7'].includes(sym)) return 'aug';
  if (['7', '9', '13', '7b9', '7#9', '7#11', '7b5', 'aug7', '11'].includes(sym)) return 'dom';
  if (sym.startsWith('sus') || ['7sus4', '7sus2', '9sus4'].includes(sym)) return 'sus';
  if (sym === '5') return 'power';
  if (sym.startsWith('m') && !sym.startsWith('maj')) return 'min';
  return 'maj';
}

export function chordLabel(root, sym, bass) {
  let s = pcName(root) + sym;
  if (bass != null && mod12(bass) !== mod12(root)) s += '/' + pcName(bass);
  return s;
}

// ---------------------------------------------------------------------------
// Detección de acordes a partir de notas MIDI (cualquier voicing/inversión).
// ---------------------------------------------------------------------------
export function detectChord(midiNotes) {
  const notes = [...new Set(midiNotes)].sort((a, b) => a - b);
  if (!notes.length) return null;
  const bass = notes[0];
  const pcs = [...new Set(notes.map(mod12))];

  if (notes.length === 1) {
    return { kind: 'note', root: mod12(bass), bass, notes, pcs, sym: '', label: pcName(bass), name: 'nota suelta', description: `Nota ${noteName(bass)}` };
  }

  if (pcs.length === 2) {
    const a = mod12(bass);
    const b = pcs.find((p) => p !== a);
    const iv = mod12(b - a);
    if (iv === 7 || iv === 5) {
      const root = iv === 7 ? a : b;
      return { kind: 'chord', root, sym: '5', name: 'quinta (power chord)', bass, notes, pcs, intervals: [0, 7], inversion: iv === 7 ? 0 : 2, exact: true, label: chordLabel(root, '5', bass), description: `${pcName(root)} quinta (power chord)${iv === 5 ? ', quinta en el bajo' : ''}` };
    }
    return { kind: 'interval', root: a, other: b, interval: iv, name: INTERVAL_NAMES[iv], bass, notes, pcs, sym: '', label: `${pcName(a)}–${pcName(b)}`, description: `Intervalo de ${INTERVAL_NAMES[iv]}` };
  }

  let best = null;
  for (const root of pcs) {
    const rel = new Set(pcs.map((p) => mod12(p - root)));
    CHORDS.forEach((t, idx) => {
      const full = new Set(t.iv);
      const opt = new Set(t.opt || []);
      for (const i of t.iv) if (!opt.has(i) && !rel.has(i)) return;
      for (const i of rel) if (!full.has(i)) return;
      const missing = t.iv.filter((i) => !rel.has(i)).length;
      const score = 100 - missing * 10 - idx * 0.01 + (root === mod12(bass) ? 5 : 0);
      if (!best || score > best.score) best = { t, root, score, missing };
    });
  }

  if (!best) {
    return { kind: 'unknown', bass, notes, pcs, root: mod12(bass), sym: '', label: pcs.map((p) => pcName(p)).join(' '), name: 'agrupación sin nombre', description: 'Agrupación sin nombre estándar (cluster o acorde politonal)' };
  }

  const { t, root, missing } = best;
  const bassIv = mod12(bass - root);
  let inversion = 0;
  let invText = 'posición fundamental';
  if (bassIv === 0) inversion = 0;
  else if ([3, 4].includes(bassIv)) { inversion = 1; invText = '1ª inversión (tercera en el bajo)'; }
  else if ([6, 7, 8].includes(bassIv)) { inversion = 2; invText = '2ª inversión (quinta en el bajo)'; }
  else if ([9, 10, 11].includes(bassIv)) { inversion = 3; invText = '3ª inversión (séptima en el bajo)'; }
  else { inversion = -1; invText = `${pcName(bass)} en el bajo`; }

  let description = `${pcName(root)} ${t.name}`;
  if (inversion !== 0) description += ` · ${invText}`;
  if (missing) description += ' · sin quinta';

  return {
    kind: 'chord', root, sym: t.sym, name: t.name, bass, notes, pcs, intervals: t.iv,
    inversion, exact: missing === 0, label: chordLabel(root, t.sym, bass), description,
    family: chordFamily(t.sym),
  };
}

// ---------------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------------
export const SCALES = {
  major: { name: 'Mayor (jónica)', iv: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Menor natural (eólica)', iv: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: 'Menor armónica', iv: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor: { name: 'Menor melódica', iv: [0, 2, 3, 5, 7, 9, 11] },
  dorian: { name: 'Dórica', iv: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'Frigia', iv: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'Lidia', iv: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: 'Mixolidia', iv: [0, 2, 4, 5, 7, 9, 10] },
  locrian: { name: 'Locria', iv: [0, 1, 3, 5, 6, 8, 10] },
  majorPent: { name: 'Pentatónica mayor', iv: [0, 2, 4, 7, 9] },
  minorPent: { name: 'Pentatónica menor', iv: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', iv: [0, 3, 5, 6, 7, 10] },
  wholeTone: { name: 'Tonos enteros', iv: [0, 2, 4, 6, 8, 10] },
  diminished: { name: 'Disminuida (tono–semitono)', iv: [0, 2, 3, 5, 6, 8, 9, 11] },
  halfWhole: { name: 'Disminuida (semitono–tono)', iv: [0, 1, 3, 4, 6, 7, 9, 10] },
  altered: { name: 'Alterada', iv: [0, 1, 3, 4, 6, 8, 10] },
  lydianDom: { name: 'Lidia dominante', iv: [0, 2, 4, 6, 7, 9, 10] },
  phrygianDom: { name: 'Frigia dominante', iv: [0, 1, 4, 5, 7, 8, 10] },
  hungarianMinor: { name: 'Menor húngara', iv: [0, 2, 3, 6, 7, 8, 11] },
  chromatic: { name: 'Cromática', iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};
export function scalePcs(root, scaleId) {
  return (SCALES[scaleId] || SCALES.major).iv.map((i) => mod12(root + i));
}
export function snapToScale(midi, pcs) {
  if (!pcs || !pcs.length) return midi;
  for (let d = 0; d < 7; d++) {
    if (pcs.includes(mod12(midi - d))) return midi - d;
    if (pcs.includes(mod12(midi + d))) return midi + d;
  }
  return midi;
}

// ---------------------------------------------------------------------------
// Detección de tonalidad (perfiles Krumhansl–Kessler)
// ---------------------------------------------------------------------------
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function detectKey(hist) {
  const total = hist.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const results = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor']) {
      const prof = mode === 'major' ? KK_MAJOR : KK_MINOR;
      const rotated = hist.map((_, i) => prof[mod12(i - tonic)]);
      results.push({ tonic, mode, score: pearson(hist, rotated) });
    }
  }
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  return { ...best, confidence: Math.max(0, Math.min(1, (best.score - results[1].score) * 4 + best.score * 0.3)) };
}

export function keyName(key) {
  if (!key) return '—';
  const flat = keyUsesFlats(key.tonic, key.mode);
  return `${pcName(key.tonic, flat)} ${key.mode === 'major' ? 'mayor' : 'menor'}`;
}

// ---------------------------------------------------------------------------
// Armonía funcional: grados, numerales romanos, sugerencias
// ---------------------------------------------------------------------------
export const DIATONIC = {
  major: { offs: [0, 2, 4, 5, 7, 9, 11], tri: ['', 'm', 'm', '', '', 'm', 'dim'], sev: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'] },
  minor: { offs: [0, 2, 3, 5, 7, 8, 10], tri: ['m', 'dim', '', 'm', '', '', ''], sev: ['m7', 'm7b5', 'maj7', 'm7', '7', 'maj7', '7'] },
};
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MODE_NAMES = ['jónico', 'dórico', 'frigio', 'lidio', 'mixolidio', 'eólico', 'locrio'];
const MODE_SCALE = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];

export function diatonicChords(key, sevenths = false) {
  const d = DIATONIC[key.mode];
  return d.offs.map((off, i) => {
    const root = mod12(key.tonic + off);
    const sym = sevenths ? d.sev[i] : d.tri[i];
    return { root, sym, label: chordLabel(root, sym), roman: romanNumeral({ root, sym }, key), intervals: chordIntervals(sym) };
  });
}

function numeralBase(off, key) {
  const offs = DIATONIC[key.mode].offs;
  let idx = offs.indexOf(off);
  if (idx >= 0) return { acc: '', idx };
  idx = offs.indexOf(mod12(off + 1));
  if (idx >= 0) return { acc: '♭', idx };
  idx = offs.indexOf(mod12(off - 1));
  return { acc: '♯', idx: Math.max(0, idx) };
}

export function degreeIndex(root, key) {
  return DIATONIC[key.mode].offs.indexOf(mod12(root - key.tonic));
}

export function romanNumeral(chord, key) {
  if (!chord || !key || chord.root == null) return '';
  const sym = chord.sym || '';
  const fam = chordFamily(sym);
  const off = mod12(chord.root - key.tonic);
  const offs = DIATONIC[key.mode].offs;
  const tri = DIATONIC[key.mode].tri;
  const idx = offs.indexOf(off);

  // Dominantes secundarias
  const target = mod12(off + 5);
  const tIdx = offs.indexOf(target);
  const isSecondary = tIdx > 0 && ((fam === 'dom' && idx !== 4) || (fam === 'maj' && sym === '' && idx >= 0 && tri[idx] !== '') || (fam === 'maj' && sym === '' && idx < 0));
  if (isSecondary) {
    const tq = tri[tIdx];
    let tn = NUMERALS[tIdx];
    if (tq === 'm' || tq === 'dim') tn = tn.toLowerCase();
    if (tq === 'dim') tn += '°';
    return `V${fam === 'dom' ? '7' : ''}/${tn}`;
  }

  const { acc, idx: bIdx } = numeralBase(off, key);
  let num = NUMERALS[bIdx];
  if (fam === 'min' || fam === 'dim') num = num.toLowerCase();
  let suffix = '';
  switch (fam) {
    case 'dim': suffix = sym === 'm7b5' ? 'ø7' : sym === 'dim7' ? '°7' : '°'; break;
    case 'aug': suffix = sym === 'augMaj7' ? '+maj7' : '+'; break;
    case 'dom': suffix = sym === '' ? '' : sym; break;
    case 'min': suffix = sym === 'm' ? '' : sym.slice(1); break;
    case 'sus': suffix = sym; break;
    case 'power': suffix = '5'; break;
    default: suffix = sym;
  }
  return acc + num + suffix;
}

// Escala recomendada para improvisar sobre el acorde
export function chordScale(chord, key) {
  if (!chord || chord.root == null) return null;
  const sym = chord.sym || '';
  const fam = chordFamily(sym);
  if (key) {
    const idx = degreeIndex(chord.root, key);
    if (idx >= 0) {
      const tri = DIATONIC[key.mode].tri[idx];
      const matches = (tri === '' && (fam === 'maj' || fam === 'dom' || fam === 'sus' || fam === 'power')) || (tri === 'm' && (fam === 'min' || fam === 'sus' || fam === 'power')) || (tri === 'dim' && fam === 'dim');
      if (matches) {
        const modeIdx = key.mode === 'major' ? idx : (idx + 5) % 7;
        const scaleId = MODE_SCALE[modeIdx];
        return { name: `${pcName(chord.root)} ${MODE_NAMES[modeIdx]}`, scaleId, root: chord.root, pcs: scalePcs(chord.root, scaleId) };
      }
    }
  }
  let scaleId = 'major';
  switch (fam) {
    case 'maj': scaleId = sym.includes('#11') ? 'lydian' : 'major'; break;
    case 'min': scaleId = sym === 'mMaj7' ? 'melodicMinor' : 'dorian'; break;
    case 'dom': scaleId = sym.includes('#11') ? 'lydianDom' : (sym.includes('b9') || sym.includes('#9')) ? 'altered' : 'mixolydian'; break;
    case 'dim': scaleId = sym === 'm7b5' ? 'locrian' : 'diminished'; break;
    case 'aug': scaleId = 'wholeTone'; break;
    case 'sus': scaleId = 'mixolydian'; break;
    default: scaleId = 'majorPent';
  }
  return { name: `${pcName(chord.root)} ${SCALES[scaleId].name.toLowerCase()}`, scaleId, root: chord.root, pcs: scalePcs(chord.root, scaleId) };
}

// Tablas de sugerencias por grado: [grado | 'off', símbolo | null, razón, etiqueta]
const SUG = {
  major: [
    [[3, null, 'I → IV: movimiento plagal, base del pop y el gospel', 'diatónica'], [4, null, 'I → V: hacia la dominante, genera tensión', 'diatónica'], [5, null, 'I → vi: al relativo menor (I–V–vi–IV)', 'diatónica'], [1, null, 'I → ii: arranca un ii–V–I', 'jazz'], [2, null, 'I → iii: color más melancólico', 'diatónica'], ['off', 10, '', 'I → ♭VII: acorde prestado con sabor rock', 'prestada'], ['off', 2, '7', 'V7/V: dominante secundaria hacia V', 'jazz']],
    [[4, '7', 'ii → V7: el corazón del ii–V–I', 'jazz'], [4, null, 'ii → V: preparación de la dominante', 'diatónica'], [0, null, 'ii → I: resolución suave', 'diatónica'], [6, null, 'ii → vii°: sustituto de dominante', 'diatónica'], [3, null, 'ii → IV: misma función subdominante', 'diatónica'], ['off', 1, '7', '♭II7: sustituto tritonal de V', 'jazz']],
    [[5, null, 'iii → vi: descenso por quintas', 'diatónica'], [3, null, 'iii → IV: progresión por terceras', 'diatónica'], [1, null, 'iii → ii', 'diatónica'], [0, null, 'iii → I', 'diatónica'], ['off', 9, '7', 'V7/ii: dominante secundaria', 'jazz']],
    [[4, null, 'IV → V: cadencia clásica (IV–V–I)', 'cadencia'], [0, null, 'IV → I: cadencia plagal («amén»)', 'cadencia'], [1, null, 'IV → ii: mismo color subdominante', 'diatónica'], [5, null, 'IV → vi', 'diatónica'], ['off', 5, 'm', 'IV → iv: subdominante menor prestada, muy emotiva', 'prestada'], ['off', 7, '7', 'IV → V7: más tensión antes de resolver', 'cadencia']],
    [[0, null, 'V → I: cadencia auténtica, máxima resolución', 'cadencia'], [5, null, 'V → vi: cadencia rota (engaño)', 'cadencia'], [3, null, 'V → IV: giro rock/blues', 'diatónica'], [1, null, 'V → ii: se pospone la resolución', 'diatónica'], ['off', 1, '7', '♭II7: sustitución tritonal de V', 'jazz']],
    [[3, null, 'vi → IV: (vi–IV–I–V)', 'diatónica'], [1, null, 'vi → ii: círculo de quintas', 'diatónica'], [4, null, 'vi → V', 'diatónica'], [0, null, 'vi → I', 'diatónica'], [2, null, 'vi → iii', 'diatónica'], ['off', 2, '7', 'V7/V desde vi', 'jazz']],
    [[0, null, 'vii° → I: resolución de sensible', 'cadencia'], [2, null, 'vii° → iii', 'diatónica'], [4, '7', 'vii° → V7', 'diatónica']],
  ],
  minor: [
    [[3, null, 'i → iv', 'diatónica'], [4, '7', 'i → V7: dominante (menor armónica)', 'cadencia'], [5, null, 'i → VI: (i–VI–III–VII)', 'diatónica'], [6, null, 'i → VII', 'diatónica'], [2, null, 'i → III: al relativo mayor', 'diatónica'], [1, null, 'i → ii°: prepara la dominante', 'jazz'], ['off', 8, '7', 'VI7 → V: sabor andaluz', 'prestada']],
    [[4, '7', 'ii° → V7: ii–V–i menor', 'jazz'], [0, null, 'ii° → i', 'diatónica'], [5, null, 'ii° → VI', 'diatónica']],
    [[5, null, 'III → VI', 'diatónica'], [3, null, 'III → iv', 'diatónica'], [6, null, 'III → VII', 'diatónica'], [0, null, 'III → i', 'diatónica']],
    [[4, '7', 'iv → V7: cadencia menor', 'cadencia'], [0, null, 'iv → i: cadencia plagal menor', 'cadencia'], [6, null, 'iv → VII', 'diatónica'], [5, null, 'iv → VI', 'diatónica'], [1, null, 'iv → ii°', 'diatónica']],
    [[0, null, 'V → i: cadencia auténtica menor', 'cadencia'], [5, null, 'V → VI: cadencia rota', 'cadencia'], [3, null, 'V → iv', 'diatónica'], ['off', 1, '7', '♭II7: sustitución tritonal', 'jazz']],
    [[6, null, 'VI → VII: (VI–VII–i, sonido épico)', 'diatónica'], [3, null, 'VI → iv', 'diatónica'], [2, null, 'VI → III', 'diatónica'], [0, null, 'VI → i', 'diatónica'], [4, '7', 'VI → V7', 'cadencia']],
    [[2, null, 'VII → III', 'diatónica'], [0, null, 'VII → i: cadencia modal', 'cadencia'], [5, null, 'VII → VI', 'diatónica'], [3, null, 'VII → iv', 'diatónica']],
  ],
};

function makeSuggestion(root, sym, key, refNotes, reason, tag) {
  const intervals = chordIntervals(sym);
  return {
    root, sym, intervals, label: chordLabel(root, sym), reason, tag,
    roman: key ? romanNumeral({ root, sym }, key) : '',
    notes: voiceChord(root, intervals, refNotes),
  };
}

export function suggestNext(chord, key, refNotes = []) {
  if (!chord || chord.root == null || chord.kind === 'interval' || chord.kind === 'note' || chord.kind === 'unknown') {
    return key ? [makeSuggestion(key.tonic, key.mode === 'major' ? '' : 'm', key, refNotes, 'Empieza por la tónica', 'tonalidad')] : [];
  }
  if (!key) key = { tonic: chord.root, mode: chordFamily(chord.sym) === 'min' ? 'minor' : 'major' };

  const sym = chord.sym || '';
  const fam = chordFamily(sym);
  const d = DIATONIC[key.mode];
  const off = mod12(chord.root - key.tonic);
  const idx = d.offs.indexOf(off);
  const out = [];
  const seen = new Set();
  const push = (root, s, reason, tag) => {
    const k = `${mod12(root)}:${s}`;
    if (seen.has(k) || out.length >= 8) return;
    seen.add(k);
    out.push(makeSuggestion(mod12(root), s, key, refNotes, reason, tag));
  };
  const degChord = (i, symOverride) => ({ root: mod12(key.tonic + d.offs[i]), sym: symOverride != null ? symOverride : d.tri[i] });

  const tri = idx >= 0 ? d.tri[idx] : null;
  const matches = idx >= 0 && (
    (tri === '' && (fam === 'maj' || fam === 'sus' || fam === 'power' || (fam === 'dom' && idx === 4))) ||
    (tri === 'm' && (fam === 'min' || fam === 'sus' || fam === 'power')) ||
    (tri === 'dim' && fam === 'dim'));

  if (matches) {
    for (const item of SUG[key.mode][idx]) {
      if (item[0] === 'off') push(key.tonic + item[1], item[2], item[3], item[4]);
      else { const c = degChord(item[0], item[1]); push(c.root, c.sym, item[2], item[3]); }
    }
    return out;
  }

  // No diatónico ---------------------------------------------------------
  const secTarget = mod12(chord.root + 5);
  const secIdx = d.offs.indexOf(secTarget);
  if (fam === 'dom' || (fam === 'maj' && sym === '' && secIdx >= 0)) {
    const target = secTarget;
    const tIdx = secIdx;
    if (tIdx >= 0) {
      const c = degChord(tIdx);
      push(c.root, c.sym, `Dominante secundaria: resuelve a ${c.sym === 'm' ? 'su menor' : 'su mayor'} (V/${NUMERALS[tIdx]})`, 'cadencia');
      const c7 = degChord(tIdx, d.sev[tIdx]);
      push(c7.root, c7.sym, 'Misma resolución con séptima', 'jazz');
      push(c.root + 9, c.sym === 'm' ? '' : 'm', 'Resolución engañosa (al relativo)', 'cadencia');
    } else {
      push(target, '', 'Resolución de dominante por quinta descendente', 'cadencia');
      push(target, 'm', 'Resolución a menor', 'cadencia');
    }
    push(chord.root + 6, '7', 'Sustituto tritonal del mismo dominante', 'jazz');
    push(chord.root + 5, 'm7', 'ii–V: convierte en cadena de dominantes', 'jazz');
  } else if (fam === 'dim') {
    const up = mod12(chord.root + 1);
    const uIdx = d.offs.indexOf(up);
    if (uIdx >= 0) { const c = degChord(uIdx); push(c.root, c.sym, 'El disminuido resuelve medio tono arriba', 'cadencia'); }
    else { push(up, '', 'Resuelve medio tono arriba (mayor)', 'cadencia'); push(up, 'm', 'Resuelve medio tono arriba (menor)', 'cadencia'); }
    push(key.tonic + d.offs[4], '7', 'Como sustituto de dominante, sigue V7', 'jazz');
  } else if (fam === 'aug') {
    push(chord.root + 5, '', 'El aumentado empuja a la cuarta (V+ → I)', 'cadencia');
    push(chord.root + 5, 'm', 'O a la cuarta menor', 'cadencia');
    push(chord.root + 9, 'm', 'Resolución a la sexta menor', 'diatónica');
  }

  // Acordes prestados típicos en mayor
  if (key.mode === 'major') {
    const borrowed = { 10: [[0, 'I', 'cadencia ♭VII → I (rock/modal)'], [5, 'IV', '♭VII → IV']], 8: [[10, '♭VII', '♭VI → ♭VII → I (épico)'], [7, 'V', '♭VI → V (cadencia frigia)']], 3: [[8, '♭VI', '♭III → ♭VI'], [5, 'IV', '♭III → IV']], 1: [[7, 'V', 'Napolitana: ♭II → V'], [0, 'I', '♭II → I']], 5: [[0, 'I', 'iv → I: cadencia plagal menor']] };
    if (borrowed[off] && (fam === 'maj' || fam === 'min')) {
      for (const [o, , reason] of borrowed[off]) {
        const r = mod12(key.tonic + o);
        const bIdx = d.offs.indexOf(o);
        push(r, bIdx >= 0 ? d.tri[bIdx] : '', reason, 'prestada');
      }
    }
  }

  // Siempre: volver al centro tonal
  const tonicSym = key.mode === 'major' ? '' : 'm';
  push(key.tonic, tonicSym, 'Volver a la tónica', 'tonalidad');
  push(key.tonic + d.offs[4], '7', 'Reafirmar la tonalidad con V7', 'tonalidad');
  const relC = degChord(key.mode === 'major' ? 5 : 2);
  push(relC.root, relC.sym, 'Al relativo', 'diatónica');
  return out;
}

// ---------------------------------------------------------------------------
// Conducción de voces: elige la inversión más cercana a las notas actuales
// ---------------------------------------------------------------------------
export function voiceChord(root, intervals, refNotes = []) {
  const ref = refNotes && refNotes.length ? [...refNotes].sort((a, b) => a - b) : [60, 64, 67];
  const lo = ref[0];
  const pcs = intervals.map((i) => mod12(root + i));
  const cands = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (const shift of [-12, 0, 12]) {
      let bassNote = lo + mod12(order[0] - lo);
      if (bassNote - lo > 6) bassNote -= 12;
      bassNote += shift;
      const v = [bassNote];
      let cur = bassNote;
      for (let k = 1; k < order.length; k++) {
        let n = cur + mod12(order[k] - cur);
        if (n === cur) n += 12;
        v.push(n);
        cur = n;
      }
      if (v[0] < 24 || v[v.length - 1] > 100) continue;
      cands.push(v);
    }
  }
  let best = null;
  for (const v of cands) {
    let cost = 0;
    for (const r of ref) cost += Math.min(...v.map((n) => Math.abs(n - r)));
    for (const n of v) cost += 0.5 * Math.min(...ref.map((r) => Math.abs(n - r)));
    cost += Math.abs((v[0] + v[v.length - 1]) / 2 - (ref[0] + ref[ref.length - 1]) / 2) * 0.3;
    if (!best || cost < best.cost) best = { v, cost };
  }
  return best ? best.v : pcs.map((p, i) => 60 + p + (i && p < pcs[0] ? 12 : 0));
}
