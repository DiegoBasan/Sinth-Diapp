// ---------------------------------------------------------------------------
// app.js — MVAVE Synth Lab. Une MIDI, motor de audio, teoría y la interfaz.
// ---------------------------------------------------------------------------
import * as T from './theory.js';
import { SynthEngine, WAVES, WAVE_LABELS, FILTER_TYPES, FILTER_LABELS, LFO_WAVES, SYNC_DIVS, DRUM_NAMES } from './engine.js';
import { MidiManager } from './midi.js';
import { DEFAULT_PATCH, FACTORY_PRESETS, randomPatch, RANDOM_CHARACTERS } from './presets.js';
import { KNOB_TARGETS, TARGET_BY_ID, DEFAULT_MAPPING, PAD_MODES, TRANSPORT_ACTIONS, scaleValue, unscaleValue, formatValue } from './controller.js';
import { Clock, ARP_MODES, ARP_DIV_LIST, DRUM_PATTERNS, DRUM_STEPS, emptyPattern } from './arp.js';
import { Piano } from './piano.js';
import { Visualizer } from './visualizer.js';
import { SampleInstrument } from './sampler.js';
import { INSTRUMENTS, INSTRUMENT_BY_ID, DEFAULT_INSTRUMENT, maxStretch, QUALITY, layersFor } from './instruments.js';
import { h, $, $$, Knob, CircleOfFifths, toast, openModal } from './ui.js';

const STORE = 'mvave-synth-lab-v1';

const state = {
  engine: null, clock: null, midi: null, piano: null, viz: null, circle: null,
  mapping: JSON.parse(JSON.stringify(DEFAULT_MAPPING)),
  padMode: 'drums',
  padTransport: TRANSPORT_ACTIONS.map((a) => a.id),
  knobs: [],          // instancias Knob de la sección "Perillas del SMK-25"
  paramKnobs: new Map(), // path -> [Knob]
  learn: null,        // {type:'knob'|'pad', index}
  held: new Set(),    // notas que están sonando por el intérprete
  physical: new Set(), // teclas físicas pulsadas ahora mismo
  noteMap: new Map(),  // tecla recibida -> nota que sonó (soporta cambios de octava)
  sounding: new Set(),
  hold: false,        // sostener acorde (latch de teclado)
  chord: null,
  key: null,
  keyLock: null,
  hist: new Array(12).fill(0),
  progression: [],
  usedChords: new Set(),
  octave: 0,
  transpose: 0,
  suggestions: [],
  previewTimer: null,
  scaleLock: null,
  scaleRoot: 0,
  scaleId: 'major',
  userPresets: [],
  recorder: null,
  recChunks: [],
  padVelocity: 100,
  computerKeys: true,
  detectTimer: null,
  sampler: null,
  mode: 'synth',         // 'synth' | 'piano'
  pianoKnobs: [],
  instrumentId: DEFAULT_INSTRUMENT,
  quality: null,
  samplerWired: false,
  badSamples: [],
  savedFx: null,
};

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
function boot() {
  loadStorage();
  buildTopbar();
  buildLayout();
  showSplash();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { if (state.engine) panic(); });
}

function showSplash() {
  const splash = h('div', { class: 'splash' },
    h('div', { class: 'splash-inner' },
      h('h2', { text: 'MVAVE Synth Lab' }),
      h('p', { html: 'Sintetizador, detector de acordes y laboratorio de armonía para el <b>M-VAVE SMK-25</b>. Conecta el teclado por USB antes de empezar; también funciona con el teclado de la computadora o el ratón.' }),
      h('button', { class: 'btn primary', text: '▶  Encender el sintetizador', onclick: async (e) => { e.currentTarget.disabled = true; await start(); splash.remove(); } }),
      h('ul', {}, [
        'Chrome, Edge u Opera son necesarios para Web MIDI.',
        'Las 8 perillas y los 8 pads del SMK-25 se mapean solos.',
        'Toca un acorde y verás su nombre, su grado y qué puede seguir.',
      ].map((t) => h('li', { text: t })))));
  document.body.appendChild(splash);
}

async function start() {
  const engine = state.engine = new SynthEngine().init(DEFAULT_PATCH);
  await engine.resume();
  const clock = state.clock = new Clock(engine);
  clock.setBpm(110);
  clock.drum.pattern = clonePattern(DRUM_PATTERNS['House']);
  $('#drumPattern').value = 'House';
  renderSequencer();
  clock.addEventListener('step', (e) => highlightStep(e.detail.step));
  clock.addEventListener('arpstep', (e) => flashPiano(e.detail.notes, 'arp', e.detail.off - e.detail.time));
  clock.addEventListener('loopnote', (e) => {
    const d = e.detail;
    if (d.type === 'on') flashPiano([d.note], 'loop', 0.4);
  });
  clock.addEventListener('loop', () => refreshTransport());
  clock.addEventListener('state', () => refreshTransport());

  state.sampler = new SampleInstrument(engine.ctx, state.instrumentId);
  if (state.quality) state.sampler.quality = state.quality; else state.quality = state.sampler.quality;
  wireSampler();
  $('#pianoQuality').value = state.quality;
  engine.attachSampler(state.sampler);
  buildPianoKnobs();
  $('#instrumentSel').value = state.instrumentId;
  describeInstrument(INSTRUMENT_BY_ID[state.instrumentId]);
  $('#panelPiano').classList.add('collapsed');

  state.viz = new Visualizer($('#viz'), engine.analyser);
  state.viz.start();

  const midi = state.midi = new MidiManager();
  midi.addEventListener('status', (e) => setMidiStatus(e.detail));
  midi.addEventListener('devices', (e) => fillDevices(e.detail.inputs));
  midi.addEventListener('note', (e) => onMidiNote(e.detail));
  midi.addEventListener('cc', (e) => onMidiCC(e.detail));
  midi.addEventListener('bend', (e) => { engine.setBend(e.detail.value); $('#bendVal').textContent = (e.detail.value * engine.params.bendRange).toFixed(1); });
  midi.addEventListener('aftertouch', (e) => engine.setMod(Math.max(engine.modWheel, e.detail.value)));
  midi.addEventListener('raw', (e) => pushMidiLog(e.detail.text));
  // El permiso MIDI puede tardar o quedarse esperando al usuario: no bloquea el arranque.
  setMidiStatus({ state: 'pending', message: 'Pidiendo permiso MIDI…' });
  midi.init().catch((e) => setMidiStatus({ state: 'denied', message: 'MIDI no disponible: ' + e.message }));

  syncAllControls();
  applyPreset(FACTORY_PRESETS[1], false);
  refreshKnobPanel();
  refreshPads();
  refreshTransport();
  updateScaleDisplay();
  analyze();
}

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------
function buildTopbar() {
  const bar = $('#topbar');
  bar.append(
    h('div', { class: 'brand' },
      h('div', { class: 'brand-mark', text: 'M' }),
      h('div', {}, h('h1', { text: 'MVAVE Synth Lab' }), h('small', { text: 'SMK-25 · Web MIDI' }))),
    h('div', { class: 'seg instrument-seg', id: 'instrumentSeg' },
      h('button', { class: 'on', dataset: { inst: 'synth' }, title: 'Sintetizador (tecla I)', text: '🎛 Sinte', onclick: () => setSoundMode('synth') }),
      h('button', { dataset: { inst: 'piano' }, title: 'Piano clásico muestreado (tecla I)', text: '🎹 Piano', onclick: () => setSoundMode('piano') })),
    h('div', { class: 'status-dot', id: 'midiDot' }),
    h('span', { class: 'status-text', id: 'midiStatus', text: 'Sin iniciar' }),
    h('select', { id: 'midiDevice', title: 'Dispositivo MIDI de entrada', onchange: (e) => state.midi && state.midi.select(e.target.value) },
      h('option', { value: '', text: 'Sin dispositivo' })),
    h('div', { class: 'spacer' }),
    h('select', { id: 'presetSel', title: 'Preset', onchange: (e) => onPresetPick(e.target.value) }),
    h('button', { class: 'btn', title: 'Genera un sonido nuevo al azar (R)', onclick: () => doRandom(), html: '🎲 Aleatorio' }),
    h('button', { class: 'btn', title: 'Guardar el sonido actual', onclick: savePreset, html: '💾' }),
    h('button', { class: 'btn', title: 'Exportar / importar presets', onclick: openPresetIO, html: '⇅' }),
    h('button', { class: 'btn rec', id: 'recBtn', title: 'Grabar el audio a un archivo', onclick: toggleRecord, html: '⏺ Grabar' }),
    h('button', { class: 'btn', title: 'Tema claro / oscuro', onclick: toggleTheme, html: '◐' }),
    h('button', { class: 'btn', title: 'Ayuda (?)', onclick: showHelp, html: '?' }),
    h('button', { class: 'btn warn', title: 'Silenciar todo (Esc)', onclick: panic, html: '⏹ Pánico' }));
  fillPresetSelect();
}

function setMidiStatus({ state: st, message }) {
  $('#midiStatus').textContent = message;
  const dot = $('#midiDot');
  dot.className = 'status-dot' + (st === 'connected' ? ' ok' : st === 'disconnected' ? ' warn' : '');
}

function fillDevices(inputs) {
  const sel = $('#midiDevice');
  const cur = state.midi && state.midi.input ? state.midi.input.id : '';
  sel.innerHTML = '';
  sel.append(h('option', { value: '', text: inputs.length ? 'Sin dispositivo' : 'No hay dispositivos' }));
  for (const i of inputs) sel.append(h('option', { value: i.id, text: i.name }));
  sel.value = cur;
}

// ---------------------------------------------------------------------------
// Estructura principal
// ---------------------------------------------------------------------------
function buildLayout() {
  const left = $('#colLeft'), right = $('#colRight');

  left.append(
    panel('Acorde detectado', 'Toca varias notas a la vez', [
      h('div', { class: 'chord-hero' },
        h('div', { class: 'chord-name empty', id: 'chordName', text: 'Esperando notas…' }),
        h('div', { class: 'chord-desc', id: 'chordDesc' }),
        h('div', { class: 'chord-meta', id: 'chordMeta' }),
        h('div', { class: 'chord-notes', id: 'chordNotes' })),
    ], { id: 'panelChord' }),

    panel('Qué puede seguir', 'Clic para escuchar · doble clic para añadir a la progresión', [
      h('div', { class: 'suggestions', id: 'suggestions' }),
    ], { id: 'panelSug' }),

    panel('Progresión', '', [
      h('div', { class: 'progression', id: 'progression' }),
      h('div', { class: 'piano-toolbar', style: { padding: '10px 0 0' } },
        h('button', { class: 'btn sm', text: '▶ Reproducir', onclick: playProgression }),
        h('button', { class: 'btn sm', text: '↺ Deshacer', onclick: () => { state.progression.pop(); renderProgression(); } }),
        h('button', { class: 'btn sm', text: '✕ Limpiar', onclick: () => { state.progression = []; state.usedChords.clear(); renderProgression(); } }),
        h('button', { class: 'btn sm', text: '⧉ Copiar', onclick: copyProgression }),
        h('button', { class: 'btn sm', text: '✨ Generar', onclick: generateProgression })),
    ], { id: 'panelProg' }),

    panel('Instrumentos muestreados', 'Diez teclados reales, del gran cola a la caja de música', [
      h('div', { class: 'ctl' },
        h('span', { class: 'lbl', text: 'Instrumento' }),
        h('select', { id: 'instrumentSel', onchange: (e) => pickInstrument(e.target.value) },
          INSTRUMENTS.map((i) => h('option', { value: i.id, text: `${i.name} · ${i.size}` }))),
        h('button', { class: 'btn sm', title: 'Probar un acorde con este instrumento', text: '▶', onclick: auditionInstrument })),
      h('div', { class: 'inst-note', id: 'instrumentNote' }),
      h('div', { class: 'piano-status', id: 'pianoStatus' },
        h('div', { class: 'load-bar' }, h('div', { class: 'load-fill', id: 'pianoLoadFill' })),
        h('div', { class: 'load-text', id: 'pianoLoadText', text: 'Las muestras se descargan al entrar en modo piano.' })),
      h('div', { class: 'knob-row', id: 'pianoKnobs', style: { marginTop: '10px' } }),
      h('div', { class: 'ctl', style: { flexWrap: 'wrap' } },
        h('span', { class: 'lbl', text: 'Calidad' }),
        h('select', { id: 'pianoQuality', onchange: (e) => setQuality(e.target.value) },
          Object.values(QUALITY).map((q) => h('option', { value: q.id, text: `${q.name} · ${q.note}` }))),
        h('span', { class: 'chip', id: 'pianoMem', title: 'Memoria que ocupan las muestras ya descodificadas' })),
      h('div', { class: 'ctl', style: { marginTop: '8px', flexWrap: 'wrap' } },
        h('span', { class: 'lbl', text: 'Sala' }),
        seg('pianoRoom', [['dry', 'Estudio'], ['hall', 'Concierto'], ['church', 'Iglesia']], 'hall', setPianoRoom),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', id: 'pianoSoft', onchange: (e) => state.sampler && state.sampler.setSoftPedal(e.target.checked) }), 'Sordina (una corda)'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', id: 'pianoFx', checked: true, onchange: (e) => state.engine.routeSampler(e.target.checked) }), 'Pasar por los efectos')),
      h('p', { class: 'panel-note', id: 'instrumentCredit' }),
    ], { id: 'panelPiano' }),

    panel('Motor de síntesis', 'Arrastra las perillas · Shift = fino · doble clic = valor por defecto', [
      h('div', { class: 'modules', id: 'modules' }),
    ], { id: 'panelSynth' }),

    panel('Caja de ritmos', '16 pasos · clic para activar, clic derecho para acentuar', [
      h('div', { class: 'piano-toolbar', style: { padding: '0 0 10px' } },
        h('select', { id: 'drumPattern', onchange: (e) => loadDrumPattern(e.target.value) },
          Object.keys(DRUM_PATTERNS).map((k) => h('option', { value: k, text: k }))),
        h('button', { class: 'btn sm', id: 'drumOn', text: '▶ Ritmo', onclick: toggleDrums }),
        h('button', { class: 'btn sm', text: '✕ Vaciar', onclick: () => { state.clock.drum.pattern = emptyPattern(); renderSequencer(); } }),
        h('button', { class: 'btn sm', text: '🎲 Variar', onclick: mutatePattern }),
        labeled('Swing', h('input', { type: 'range', min: 0, max: 0.7, step: 0.01, value: 0, oninput: (e) => { state.clock.drum.swing = +e.target.value; } }))),
      h('div', { id: 'sequencer' }),
    ], { id: 'panelSeq' }));

  right.append(
    panel('Salida', '', [h('canvas', { class: 'viz', id: 'viz' }),
      h('div', { class: 'piano-toolbar', style: { padding: '8px 0 0' } },
        seg('vizMode', [['both', 'Ambos'], ['scope', 'Onda'], ['spectrum', 'Espectro']], 'both', (v) => { state.viz.mode = v; }),
        h('span', { class: 'chip', id: 'voiceCount', text: '0 voces' }))], { id: 'panelViz' }),

    panel('Pads', 'Los 8 pads del SMK-25', [
      h('div', { class: 'ctl', style: { marginBottom: '8px' } },
        h('span', { class: 'lbl', text: 'Modo' }),
        h('select', { id: 'padMode', onchange: (e) => { state.padMode = e.target.value; refreshPads(); } },
          Object.entries(PAD_MODES).map(([k, v]) => h('option', { value: k, text: v })))),
      h('div', { class: 'pads', id: 'pads' }),
      h('div', { class: 'hint', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--txt-faint)' }, text: 'Shift + clic en un pad para aprender su nota MIDI.' }),
    ], { id: 'panelPads' }),

    panel('Perillas del SMK-25', 'Shift + clic para aprender un CC', [
      h('div', { class: 'knob-row', id: 'ccKnobs' }),
      h('div', { id: 'knobTargets', style: { marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' } }),
    ], { id: 'panelKnobs' }),

    panel('Arpegio, loop y tempo', '', [
      h('div', { class: 'piano-toolbar', style: { padding: '0 0 8px' } },
        h('button', { class: 'btn sm', id: 'arpBtn', text: '⇅ Arpegio', onclick: toggleArp }),
        h('button', { class: 'btn sm', id: 'latchBtn', text: '⏻ Retener', onclick: toggleLatch }),
        h('button', { class: 'btn sm', id: 'metroBtn', text: '⏱ Metrónomo', onclick: toggleMetronome })),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Modo' }),
        h('select', { id: 'arpMode', onchange: (e) => { state.clock.arp.mode = e.target.value; state.clock.rebuildArpOrder(); } },
          Object.entries(ARP_MODES).map(([k, v]) => h('option', { value: k, text: v })))),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'División' }),
        h('select', { id: 'arpDiv', onchange: (e) => { state.clock.arp.div = e.target.value; } },
          ARP_DIV_LIST.map((k) => h('option', { value: k, text: k }))),
        h('span', { class: 'lbl', text: 'Octavas' }),
        h('select', { id: 'arpOct', onchange: (e) => { state.clock.arp.octaves = +e.target.value; state.clock.rebuildArpOrder(); } },
          [1, 2, 3, 4].map((n) => h('option', { value: n, text: n })))),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Duración' }),
        h('input', { type: 'range', min: 0.05, max: 1, step: 0.01, value: 0.6, oninput: (e) => { state.clock.arp.gate = +e.target.value; } }),
        h('span', { class: 'lbl', text: 'Swing' }),
        h('input', { type: 'range', min: 0, max: 0.7, step: 0.01, value: 0, oninput: (e) => { state.clock.arp.swing = +e.target.value; } })),
      h('div', { class: 'ctl', style: { marginTop: '4px' } },
        h('span', { class: 'lbl', text: 'Tempo' }),
        h('input', { type: 'range', id: 'bpmRange', min: 40, max: 220, step: 1, value: 110, oninput: (e) => setBpm(+e.target.value) }),
        h('span', { class: 'chip', id: 'bpmVal', text: '110 BPM' }),
        h('button', { class: 'btn sm', text: 'Tap', onclick: tapTempo })),
      h('div', { class: 'piano-toolbar', style: { padding: '8px 0 0' } },
        h('button', { class: 'btn sm rec', id: 'loopRec', text: '⏺ Loop', onclick: () => state.clock.armLoop() }),
        h('button', { class: 'btn sm', id: 'loopPlay', text: '▶', onclick: () => state.clock.toggleLoopPlay() }),
        h('button', { class: 'btn sm', text: '✕', onclick: () => state.clock.clearLoop() }),
        h('select', { id: 'loopBars', onchange: (e) => { state.clock.loop.bars = +e.target.value; } },
          [1, 2, 4, 8].map((n) => h('option', { value: n, text: `${n} compás${n > 1 ? 'es' : ''}`, selected: n === 2 }))),
        h('select', { id: 'loopQ', onchange: (e) => { state.clock.loop.quantize = e.target.value; } },
          [['off', 'Sin cuantizar'], ['1/16', '1/16'], ['1/8', '1/8'], ['1/4', '1/4']].map(([v, t]) => h('option', { value: v, text: t, selected: v === '1/16' })))),
    ], { id: 'panelArp' }),

    panel('Tonalidad y escala', 'Clic en el círculo para fijar la tonalidad', [
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Detectada' }), h('b', { id: 'keyName', text: '—' }),
        h('span', { class: 'chip', id: 'keyConf', text: '' })),
      h('div', { class: 'ctl' },
        h('span', { class: 'lbl', text: 'Escala' }),
        h('select', { id: 'scaleRoot', onchange: (e) => { state.scaleRoot = +e.target.value; updateScaleDisplay(); } },
          Array.from({ length: 12 }, (_, i) => h('option', { value: i, text: T.pcName(i) }))),
        h('select', { id: 'scaleId', onchange: (e) => { state.scaleId = e.target.value; updateScaleDisplay(); } },
          Object.entries(T.SCALES).map(([k, v]) => h('option', { value: k, text: v.name })))),
      h('div', { class: 'ctl' },
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', id: 'scaleLock', onchange: (e) => { state.scaleLock = e.target.checked; updateScaleDisplay(); } }), 'Forzar notas a la escala'),
        h('button', { class: 'btn sm', text: 'Seguir tonalidad', onclick: followKey })),
      h('div', { class: 'circle-wrap', id: 'circle' }),
      h('div', { class: 'piano-toolbar', style: { padding: '4px 0 0' } },
        h('button', { class: 'btn sm', text: 'Liberar tonalidad', onclick: () => { state.keyLock = null; analyze(); toast('Detección automática de tonalidad'); } }),
        h('button', { class: 'btn sm', text: 'Reiniciar análisis', onclick: () => { state.hist.fill(0); analyze(); } })),
    ], { id: 'panelKey' }),

    panel('Monitor MIDI', 'Últimos mensajes recibidos', [
      h('div', { class: 'midi-log', id: 'midiLog' }),
      h('div', { class: 'piano-toolbar', style: { padding: '8px 0 0' } },
        h('span', { class: 'chip', id: 'bendChip', html: 'Bend: <span id="bendVal">0.0</span> st' }),
        h('span', { class: 'chip', id: 'modChip', text: 'Mod: 0%' })),
    ], { id: 'panelMidi', collapsed: true }));

  buildModules();
  buildPianoDock();
  buildSequencer();
  state.circle = new CircleOfFifths($('#circle'), (pc, mode) => {
    state.keyLock = { tonic: pc, mode, score: 1, confidence: 1 };
    state.scaleRoot = pc;
    state.scaleId = mode === 'major' ? 'major' : 'minor';
    $('#scaleRoot').value = pc;
    $('#scaleId').value = state.scaleId;
    updateScaleDisplay();
    analyze();
    toast('Tonalidad fijada: ' + T.keyName(state.keyLock));
  });
}

function panel(title, hint, children, opts = {}) {
  const body = h('div', { class: 'body' }, children);
  const p = h('div', { class: 'panel' + (opts.collapsed ? ' collapsed' : ''), id: opts.id },
    h('header', { onclick: (e) => { if (e.target.closest('button,select,input')) return; p.classList.toggle('collapsed'); } },
      h('h3', { text: title }), h('span', { class: 'hint', text: hint })),
    body);
  return p;
}
function labeled(text, node) { return h('label', { class: 'ctl' }, h('span', { class: 'lbl', text }), node); }
function seg(id, options, value, onPick) {
  const el = h('div', { class: 'seg', id });
  for (const [v, label] of options) {
    el.append(h('button', {
      class: v === value ? 'on' : '', text: label, dataset: { value: v },
      onclick: (ev) => { $$('button', el).forEach((b) => b.classList.remove('on')); ev.currentTarget.classList.add('on'); onPick(v); },
    }));
  }
  return el;
}

// ---------------------------------------------------------------------------
// Módulos de síntesis
// ---------------------------------------------------------------------------
function makeKnob(path, label, opts = {}) {
  const spec = TARGET_BY_ID[path];
  const k = new Knob({
    label: label || (spec ? spec.label : path),
    value: 0,
    bipolar: !!opts.bipolar,
    format: (v01) => formatValue(path, scaleValue(path, v01)),
    onChange: (v01) => {
      const v = scaleValue(path, v01);
      state.engine.setParam(path, path === 'bendRange' ? Math.round(v) : v);
      syncKnob(path, k);
    },
  });
  k.path = path;
  if (!state.paramKnobs.has(path)) state.paramKnobs.set(path, []);
  state.paramKnobs.get(path).push(k);
  return k;
}
function syncKnob(path, except) {
  const list = state.paramKnobs.get(path);
  if (!list) return;
  const v = T_get(path);
  for (const k of list) if (k !== except) k.set(unscaleValue(path, v));
}
function T_get(path) {
  if (path === '@bpm') return state.clock.bpm;
  return path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), state.engine.params);
}

function selectFor(path, options, transform = (v) => v) {
  const s = h('select', { onchange: (e) => state.engine.setParam(path, transform(e.target.value)) },
    options.map(([v, t]) => h('option', { value: v, text: t })));
  s.dataset.path = path;
  return s;
}
function toggleFor(path, label) {
  const inp = h('input', { type: 'checkbox', onchange: (e) => state.engine.setParam(path, e.target.checked) });
  inp.dataset.path = path;
  return h('label', { class: 'toggle' }, inp, label);
}

function buildModules() {
  const host = $('#modules');
  const waveOpts = WAVES.map((w) => [w, WAVE_LABELS[w]]);
  const octOpts = [[-2, '-2'], [-1, '-1'], [0, '0'], [1, '+1'], [2, '+2']];
  const semiOpts = Array.from({ length: 25 }, (_, i) => [i - 12, String(i - 12)]);

  const oscModule = (key, title) => module(title, [
    h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Onda' }), selectFor(`${key}.wave`, waveOpts)),
    h('div', { class: 'ctl' },
      h('span', { class: 'lbl', text: 'Octava' }), selectFor(`${key}.octave`, octOpts, Number),
      h('span', { class: 'lbl', text: 'Semi' }), selectFor(`${key}.semi`, semiOpts, Number)),
    h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Unísono' }),
      selectFor(`${key}.unison`, [1, 2, 3, 4, 5, 6, 7].map((n) => [n, `${n} voz${n > 1 ? 'es' : ''}`]), Number)),
    knobRow([makeKnob(`${key}.level`, 'Nivel'), makeKnob(`${key}.fine`, 'Fino', { bipolar: true }), makeKnob(`${key}.spread`, 'Detune')]),
  ]);

  host.append(
    oscModule('osc1', 'Oscilador 1'),
    oscModule('osc2', 'Oscilador 2'),
    module('Sub y ruido', [
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Sub' }), selectFor('sub.wave', [['sine', 'Seno'], ['triangle', 'Triángulo'], ['square', 'Cuadrada']])),
      knobRow([makeKnob('sub.level', 'Sub'), makeKnob('noise.level', 'Ruido'), makeKnob('volume', 'Volumen')]),
      h('div', { class: 'ctl' }, toggleFor('mono', 'Monofónico'), toggleFor('legato', 'Legato')),
      knobRow([makeKnob('glide', 'Portamento'), makeKnob('bendRange', 'Rango bend'), makeKnob('amp.velocity', 'Pulsación')]),
    ]),
    module('Filtro', [
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Tipo' }), selectFor('filter.type', FILTER_TYPES.map((t) => [t, FILTER_LABELS[t]]))),
      knobRow([makeKnob('filter.cutoff', 'Frecuencia'), makeKnob('filter.q', 'Resonancia'), makeKnob('filter.envAmt', 'Envolvente'), makeKnob('filter.keyTrack', 'Seguimiento')]),
      knobRow([makeKnob('filter.attack', 'Ataque'), makeKnob('filter.decay', 'Caída'), makeKnob('filter.sustain', 'Sostenido'), makeKnob('filter.release', 'Relajación')]),
    ]),
    module('Amplitud', [
      knobRow([makeKnob('amp.attack', 'Ataque'), makeKnob('amp.decay', 'Caída'), makeKnob('amp.sustain', 'Sostenido'), makeKnob('amp.release', 'Relajación')]),
    ]),
    module('LFO', [
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Onda' }), selectFor('lfo.wave', LFO_WAVES.map((w) => [w, WAVE_LABELS[w] || w])),
        h('span', { class: 'lbl', text: 'Sync' }), selectFor('lfo.sync', Object.keys(SYNC_DIVS).map((k) => [k, k === 'off' ? 'Libre' : k]))),
      knobRow([makeKnob('lfo.rate', 'Velocidad'), makeKnob('lfo.pitch', '→ Afinación'), makeKnob('lfo.filter', '→ Filtro'), makeKnob('lfo.amp', '→ Volumen'), makeKnob('lfo.modDepth', 'Rueda mod')]),
    ]),
    module('Distorsión', [
      h('div', { class: 'ctl' }, toggleFor('fx.dist.on', 'Activada')),
      knobRow([makeKnob('fx.dist.drive', 'Cantidad'), makeKnob('fx.dist.tone', 'Tono'), makeKnob('fx.dist.mix', 'Mezcla')]),
    ]),
    module('Chorus', [
      h('div', { class: 'ctl' }, toggleFor('fx.chorus.on', 'Activado')),
      knobRow([makeKnob('fx.chorus.rate', 'Velocidad'), makeKnob('fx.chorus.depth', 'Profundidad'), makeKnob('fx.chorus.mix', 'Mezcla')]),
    ]),
    module('Eco (delay)', [
      h('div', { class: 'ctl' }, toggleFor('fx.delay.on', 'Activado'), toggleFor('fx.delay.pingpong', 'Ping-pong')),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl', text: 'Sync' }), selectFor('fx.delay.sync', Object.keys(SYNC_DIVS).map((k) => [k, k === 'off' ? 'Libre' : k]))),
      knobRow([makeKnob('fx.delay.time', 'Tiempo'), makeKnob('fx.delay.feedback', 'Repeticiones'), makeKnob('fx.delay.tone', 'Tono'), makeKnob('fx.delay.mix', 'Mezcla')]),
    ]),
    module('Reverberación', [
      h('div', { class: 'ctl' }, toggleFor('fx.reverb.on', 'Activada')),
      knobRow([makeKnob('fx.reverb.size', 'Tamaño'), makeKnob('fx.reverb.decay', 'Cola'), makeKnob('fx.reverb.damp', 'Amortiguación'), makeKnob('fx.reverb.predelay', 'Pre-delay'), makeKnob('fx.reverb.mix', 'Mezcla')]),
    ]));
}
function module(title, children) {
  return h('div', { class: 'module' }, h('header', {}, h('h4', { text: title })), h('div', { class: 'rows' }, children));
}
function knobRow(knobs) { return h('div', { class: 'knob-row' }, knobs.map((k) => k.el)); }

function syncAllControls() {
  for (const [path, list] of state.paramKnobs) {
    const v = T_get(path);
    if (v == null) continue;
    for (const k of list) { k.set(unscaleValue(path, v)); k.defaultValue = k.value; }
  }
  for (const el of $$('[data-path]')) {
    const v = T_get(el.dataset.path);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
}

// ---------------------------------------------------------------------------
// Piano
// ---------------------------------------------------------------------------
function buildPianoDock() {
  const dock = $('#pianoDock');
  const wrap = h('div', { class: 'piano-wrap', id: 'pianoHost' });
  dock.append(h('div', { class: 'panel' },
    h('div', { class: 'piano-toolbar', style: { padding: '10px 12px 6px' } },
      h('button', { class: 'btn sm', text: '◀ Oct', onclick: () => setOctave(state.octave - 1) }),
      h('span', { class: 'chip', id: 'octChip', text: 'Oct 0' }),
      h('button', { class: 'btn sm', text: 'Oct ▶', onclick: () => setOctave(state.octave + 1) }),
      h('button', { class: 'btn sm', id: 'holdBtn', text: '⏻ Sostener', onclick: toggleHold }),
      h('span', { class: 'chip', id: 'rangeChip' }),
      h('button', { class: 'btn sm', text: '−', title: 'Menos teclas', onclick: () => zoomPiano(-1) }),
      h('button', { class: 'btn sm', text: '+', title: 'Más teclas', onclick: () => zoomPiano(1) }),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { state.piano.showLabels = e.target.checked; state.piano.render(); } }), 'Nombres'),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { state.computerKeys = e.target.checked; } }), 'Teclado de PC'),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: false, id: 'solfegeTgl', onchange: (e) => { T.naming.solfege = e.target.checked; state.piano.build(); analyze(); } }), 'Do-Re-Mi')),
    wrap));
  const w = window.innerWidth;
  const range = w < 700 ? [48, 72] : w < 1100 ? [36, 72] : [36, 84];
  const piano = state.piano = new Piano(wrap, { low: range[0], high: range[1] });
  piano.addEventListener('noteon', (e) => playNote(e.detail.note, e.detail.velocity, 'mouse'));
  piano.addEventListener('noteoff', (e) => stopNote(e.detail.note));
  $('#rangeChip').textContent = `${T.noteName(piano.low)}–${T.noteName(piano.high)}`;
}

function setOctave(o) {
  state.octave = Math.max(-3, Math.min(3, o));
  $('#octChip').textContent = `Oct ${state.octave >= 0 ? '+' : ''}${state.octave}`;
}
function zoomPiano(dir) {
  const p = state.piano;
  const span = p.high - p.low;
  const next = Math.max(12, Math.min(84, span + dir * 12));
  const center = (p.low + p.high) / 2;
  let low = Math.round((center - next / 2) / 12) * 12;
  low = Math.max(12, Math.min(108 - next, low));
  p.setRange(low, low + next);
  $('#rangeChip').textContent = `${T.noteName(p.low)}–${T.noteName(p.high)}`;
}

// ---------------------------------------------------------------------------
// Piano clásico por muestras
// ---------------------------------------------------------------------------
const PIANO_OPTS = [
  { key: 'gain', label: 'Volumen', min: 0, max: 1.6, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'tone', label: 'Brillo', min: 900, max: 18000, curve: 'exp', fmt: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz` },
  { key: 'dynamics', label: 'Dinámica', min: 0.5, max: 2.2, fmt: (v) => v.toFixed(2) },
  { key: 'releaseNoise', label: 'Ruido de teclas', min: 0, max: 3, fmt: (v) => v <= 0.001 ? 'apagado' : `${Math.round(v * 100)}%` },
  { key: 'stretch', label: 'Afinación estirada', min: 0, max: 1.5, fmt: (v) => `${Math.round(v * 100)}%` },
];

function buildPianoKnobs() {
  const host = $('#pianoKnobs');
  host.innerHTML = '';
  state.pianoKnobs = [];
  for (const o of PIANO_OPTS) {
    const toVal = (x) => o.curve === 'exp' ? o.min * Math.pow(o.max / o.min, x) : o.min + (o.max - o.min) * x;
    const to01 = (v) => o.curve === 'exp' ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min);
    const k = new Knob({
      label: o.label,
      value: to01(state.sampler.opts[o.key]),
      format: (x) => o.fmt(toVal(x)),
      onChange: (x) => state.sampler.setOption(o.key, toVal(x)),
    });
    k.defaultValue = k.value;
    state.pianoKnobs.push(k);
    host.append(k.el);
  }
}

const PIANO_ROOMS = {
  dry: { size: 1.1, decay: 0.35, damp: 7000, predelay: 0.008, mix: 0.14 },
  hall: { size: 3.2, decay: 0.68, damp: 5200, predelay: 0.03, mix: 0.3 },
  church: { size: 6, decay: 0.9, damp: 3600, predelay: 0.06, mix: 0.46 },
};

function setPianoRoom(id) {
  const r = PIANO_ROOMS[id] || PIANO_ROOMS.hall;
  const e = state.engine;
  e.setParam('fx.reverb.on', true);
  for (const [k, v] of Object.entries(r)) e.setParam(`fx.reverb.${k}`, v);
  e.setParam('fx.dist.on', false);
  e.setParam('fx.chorus.on', false);
  e.setParam('fx.delay.on', false);
  syncAllControls();
}

function setSoundMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  for (const b of $$('#instrumentSeg button')) b.classList.toggle('on', b.dataset.inst === mode);
  document.body.dataset.instrument = mode;
  $('#panelPiano').classList.toggle('collapsed', mode !== 'piano');
  $('#panelSynth').classList.toggle('dimmed', mode === 'piano');
  state.engine.setMode(mode);
  state.held.clear();
  state.physical.clear();
  state.noteMap.clear();
  state.piano.setActive([]);
  scheduleAnalyze();

  if (mode === 'piano') {
    // Guarda los efectos del sintetizador para devolverlos al volver.
    state.savedFx = JSON.parse(JSON.stringify(state.engine.params.fx));
    loadInstrument();
    const room = $('#pianoRoom button.on');
    setPianoRoom(room ? room.dataset.value : 'hall');
    toast('Piano clásico');
  } else {
    if (state.savedFx) {
      for (const [group, vals] of Object.entries(state.savedFx)) {
        for (const [k, v] of Object.entries(vals)) state.engine.setParam(`fx.${group}.${k}`, v);
      }
      syncAllControls();
    }
    toast('Sintetizador');
  }
}

// Los avisos del sampler se enganchan una sola vez, no en cada carga.
function wireSampler() {
  if (state.samplerWired) return;
  state.samplerWired = true;
  const sampler = state.sampler;
  const fill = () => $('#pianoLoadFill');
  const text = () => $('#pianoLoadText');
  sampler.addEventListener('progress', (e) => {
    const { done, total, ratio } = e.detail;
    fill().style.width = `${Math.round(ratio * 100)}%`;
    text().textContent = `Descargando ${e.detail.instrument.name}… ${done} de ${total}`;
    updateMemChip();
  });
  sampler.addEventListener('sampleerror', (e) => state.badSamples.push(e.detail.url));
  sampler.addEventListener('playable', (e) => {
    buildPianoKnobs();
    if (e.detail.cached) return;
    const inst = e.detail.instrument;
    text().textContent = inst.kind === 'layered'
      ? 'Ya puedes tocar. Las demás dinámicas siguen cargando…'
      : 'Ya puedes tocar.';
    toast(`${inst.name} listo`);
  });
  sampler.addEventListener('loaded', (e) => {
    const d = e.detail;
    $('#pianoStatus').classList.remove('loading');
    fill().style.width = '100%';
    buildPianoKnobs();
    updateMemChip();
    const bad = state.badSamples.length;
    const n = state.sampler.loadedLayers.length;
    const layers = n > 1 ? `${n} dinámicas` : 'una dinámica';
    text().textContent = bad
      ? `${d.samples} muestras cargadas · ${bad} fallaron y se sustituyen por la nota más cercana`
      : `${d.instrument.name}: ${d.samples} muestras${d.releases ? ` y ${d.releases} ruidos de tecla` : ''} · ${layers}`;
  });
}

function describeInstrument(inst) {
  const salto = maxStretch(inst);
  const capas = inst.layers ? layersFor(inst, state.sampler ? state.sampler.quality : 'mid').length : 1;
  const partes = [
    inst.notes.length === 88 ? 'las 88 teclas muestreadas una por una' : `${inst.notes.length} notas por capa`,
    capas > 1 ? `${capas} capas de dinámica` : 'una sola capa de dinámica',
    salto === 0 ? 'sin desplazar la afinación' : `como mucho ${salto} semitono de desplazamiento`,
  ];
  const ficha = partes.join(' · ');
  $('#instrumentNote').textContent = `${inst.note} ${ficha.charAt(0).toUpperCase()}${ficha.slice(1)}.`.trim();
  $('#instrumentCredit').innerHTML = `Muestras: ${inst.credit}. Licencia ${inst.license}.`;
  $('#pianoQuality').disabled = !inst.layers;
  updateMemChip();
}

function updateMemChip() {
  const chip = $('#pianoMem');
  if (!chip || !state.sampler) return;
  const mb = state.sampler.memoryMB;
  chip.textContent = mb ? `${mb} MB en memoria` : '';
}

function setQuality(id) {
  state.quality = id;
  $('#pianoQuality').value = id;
  saveStorage();
  const inst = INSTRUMENT_BY_ID[state.instrumentId];
  const needsReload = state.sampler.setQuality(id);
  describeInstrument(inst);
  if (!needsReload) {
    toast(`Calidad ${QUALITY[id].name.toLowerCase()} para los sets con varias dinámicas`);
  } else if (state.mode === 'piano') {
    loadInstrument();
  } else {
    $('#pianoLoadText').textContent = `Calidad ${QUALITY[id].name.toLowerCase()}: se aplicará al entrar en modo piano.`;
  }
}

function pickInstrument(id) {
  const inst = INSTRUMENT_BY_ID[id];
  if (!inst) return;
  state.instrumentId = id;
  $('#instrumentSel').value = id;
  saveStorage();
  describeInstrument(inst);
  if (state.mode !== 'piano') { setSoundMode('piano'); return; }
  loadInstrument();
}

function loadInstrument() {
  const sampler = state.sampler;
  const inst = INSTRUMENT_BY_ID[state.instrumentId];
  if (!sampler.needsLoad(inst.id)) { updateMemChip(); return; }
  state.badSamples = [];
  $('#pianoStatus').classList.add('loading');
  $('#pianoLoadFill').style.width = '0%';
  $('#pianoLoadText').textContent = `Descargando ${inst.name}…`;
  sampler.load(inst.id);
}

// Toca un acorde de muestra para comparar instrumentos sin soltar el ratón.
function auditionInstrument() {
  if (state.mode !== 'piano') { setSoundMode('piano'); return; }
  const notes = [48, 55, 64, 67, 72];
  if (!state.sampler.ready) { toast('Todavía se están descargando las muestras'); return; }
  notes.forEach((n, i) => setTimeout(() => {
    state.sampler.noteOn(n, 88);
    state.piano.noteOn(n, 'arp');
    setTimeout(() => { state.sampler.noteOff(n); if (!state.held.has(n)) state.piano.noteOff(n); }, 1600 - i * 90);
  }, i * 70));
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------
function effectiveNote(note) {
  let n = note + state.octave * 12 + state.transpose;
  if (state.scaleLock) n = T.snapToScale(n, T.scalePcs(state.scaleRoot, state.scaleId));
  return Math.max(0, Math.min(127, n));
}

function playNote(rawNote, velocity = 100, source = 'midi') {
  const engine = state.engine;
  if (!engine) return;
  const note = effectiveNote(rawNote);
  // Se recuerda qué nota real disparó cada tecla: si cambia la octava
  // mientras suena, al soltar se apaga la nota correcta y no se queda colgada.
  state.noteMap.set(rawNote, note);
  state.physical.add(rawNote);
  if (state.held.has(note)) return;
  state.held.add(note);
  state.hist[T.mod12(note)] += 1;
  if (state.clock.arp.on) {
    state.clock.setArpNotes([...state.held]);
    if (!state.clock.running) state.clock.start();
  } else {
    engine.noteOn(note, velocity);
    state.clock.recordEvent('on', note, velocity);
  }
  state.piano.noteOn(note, source === 'mouse' ? 'midi' : source);
  scheduleAnalyze();
}

function stopNote(rawNote) {
  const note = state.noteMap.get(rawNote);
  state.physical.delete(rawNote);
  if (note == null || !state.held.has(note)) return;
  state.noteMap.delete(rawNote);
  if (state.hold) return; // el acorde sigue sonando y visible hasta soltar «Sostener»
  state.held.delete(note);
  if (state.clock.arp.on) {
    if (!(state.clock.arp.latch && state.held.size === 0)) state.clock.setArpNotes([...state.held]);
  } else {
    state.engine.noteOff(note);
    state.clock.recordEvent('off', note);
  }
  state.piano.noteOff(note);
  scheduleAnalyze();
}

function flashPiano(notes, cls, dur) {
  for (const n of notes) {
    state.piano.noteOn(n, cls);
    setTimeout(() => { if (!state.held.has(n)) state.piano.noteOff(n); }, Math.max(90, dur * 1000));
  }
}

function panic() {
  if (!state.engine) return;
  state.engine.allNotesOff();
  state.held.clear();
  state.physical.clear();
  state.noteMap.clear();
  state.padHeld = {};
  state.hold = false;
  $('#holdBtn').classList.remove('active');
  state.clock.setArpNotes([]);
  state.clock.stop();
  state.piano.setActive([]);
  refreshTransport();
  analyze();
}

function toggleHold() {
  state.hold = !state.hold;
  $('#holdBtn').classList.toggle('active', state.hold);
  if (state.hold) return;
  // Al soltar «Sostener» solo sobreviven las teclas que siguen pulsadas.
  const keep = new Set([...state.physical].map((r) => state.noteMap.get(r)).filter((n) => n != null));
  for (const n of [...state.held]) {
    if (keep.has(n)) continue;
    state.held.delete(n);
    state.engine.noteOff(n);
    state.clock.recordEvent('off', n);
    state.piano.noteOff(n);
  }
  if (state.clock.arp.on) state.clock.setArpNotes([...state.held]);
  scheduleAnalyze();
}

// ---------------------------------------------------------------------------
// Análisis armónico
// ---------------------------------------------------------------------------
function scheduleAnalyze() {
  clearTimeout(state.detectTimer);
  state.detectTimer = setTimeout(analyze, 45);
}

function analyze() {
  const notes = [...state.held].sort((a, b) => a - b);
  const chord = notes.length ? T.detectChord(notes) : null;
  const prevLabel = state.chord ? state.chord.label : null;
  const isNew = !!chord && chord.kind === 'chord' && chord.label !== prevLabel;
  if (isNew) reinforceKey(chord);
  const key = state.keyLock || T.detectKey(state.hist);
  state.key = key;
  state.chord = chord;

  renderChord(chord, key);
  renderSuggestions(chord, key);
  renderKeyPanel(key, chord);
  updatePianoRoles(chord);

  if (isNew) pushProgression(chord, key);
  $('#voiceCount').textContent = `${state.engine ? state.engine.activeVoices : 0} voces`;
}

// La fundamental y el bajo de un acorde dicen mucho más de la tonalidad que
// una nota suelta, así que pesan más en el histograma.
function reinforceKey(chord) {
  state.hist[T.mod12(chord.root)] += 2.5;
  state.hist[T.mod12(chord.bass)] += 1;
  for (const pc of chord.pcs) state.hist[T.mod12(pc)] += 0.5;
  const total = state.hist.reduce((a, b) => a + b, 0);
  if (total > 260) for (let i = 0; i < 12; i++) state.hist[i] *= 0.7; // olvida lo viejo
}

function renderChord(chord, key) {
  const nameEl = $('#chordName'), descEl = $('#chordDesc'), metaEl = $('#chordMeta'), notesEl = $('#chordNotes');
  metaEl.innerHTML = ''; notesEl.innerHTML = '';
  if (!chord) {
    nameEl.textContent = 'Esperando notas…';
    nameEl.className = 'chord-name empty';
    descEl.textContent = 'Toca dos o más notas para ver el análisis.';
    return;
  }
  nameEl.textContent = chord.label;
  nameEl.className = 'chord-name';
  descEl.textContent = chord.description || '';

  if (chord.kind === 'chord' && key) {
    const rn = T.romanNumeral(chord, key);
    if (rn) metaEl.append(h('span', { class: 'chip roman', text: rn, title: `Grado en ${T.keyName(key)}` }));
  }
  const cs = chord.kind === 'chord' ? T.chordScale(chord, key) : null;
  if (cs) metaEl.append(h('span', { class: 'chip', text: '⤳ ' + cs.name, title: 'Escala sugerida para improvisar' }));
  if (chord.notes) metaEl.append(h('span', { class: 'chip', text: `${chord.notes.length} notas` }));
  if (chord.kind === 'chord' && chord.exact === false) metaEl.append(h('span', { class: 'chip', text: 'voicing incompleto' }));

  const flat = key ? T.keyUsesFlats(key.tonic, key.mode) : undefined;
  for (const n of chord.notes || []) {
    const role = chord.root != null ? Piano.roleFor(n - chord.root) : '';
    notesEl.append(h('span', { class: 'note-pill' },
      h('b', { text: T.pcName(n, flat) }), h('small', { text: `${Math.floor(n / 12) - 1}${role ? ' · ' + role : ''}` })));
  }
}

function updatePianoRoles(chord) {
  const roles = new Map();
  if (chord && chord.root != null && chord.notes) {
    for (const n of chord.notes) roles.set(n, Piano.roleFor(n - chord.root));
  }
  state.piano.setRoles(roles);
}

function renderSuggestions(chord, key) {
  const host = $('#suggestions');
  host.innerHTML = '';
  const list = T.suggestNext(chord, key, chord ? chord.notes : []);
  state.suggestions = list;
  if (!list.length) {
    host.append(h('div', { class: 'why', style: { color: 'var(--txt-faint)', fontSize: '12px' }, text: 'Toca un acorde y aquí aparecerán los movimientos más naturales.' }));
    return;
  }
  list.forEach((s, i) => {
    const btn = h('button', {
      class: 'sug', dataset: { tag: s.tag },
      onclick: () => previewChord(s),
      ondblclick: () => { addToProgression(s); },
      onmouseenter: () => showGhost(s),
      onmouseleave: () => showGhost(null),
    },
      h('span', { class: 'lab', text: s.label }),
      h('span', { class: 'why', text: s.reason }),
      h('span', { class: 'rn', text: s.roman || '' }));
    btn.title = `${s.label} — ${s.reason}\nClic: escuchar · doble clic: añadir a la progresión${i < 9 ? ` · tecla ${i + 1}` : ''}`;
    host.append(btn);
  });
}

function showGhost(s) {
  const m = new Map();
  if (s) for (const n of s.notes) m.set(n, 'sug');
  state.piano.setGhosts(m);
}

function previewChord(s, dur = 1.1) {
  const engine = state.engine;
  if (!engine) return;
  clearTimeout(state.previewTimer);
  for (const n of s.notes) engine.noteOn(n, 96);
  flashPiano(s.notes, 'arp', dur);
  state.previewTimer = setTimeout(() => { for (const n of s.notes) engine.noteOff(n); }, dur * 1000);
}

// ---------------------------------------------------------------------------
// Progresión
// ---------------------------------------------------------------------------
function pushProgression(chord, key) {
  const last = state.progression[state.progression.length - 1];
  if (last && last.label === chord.label) return;
  state.progression.push({ label: chord.label, roman: key ? T.romanNumeral(chord, key) : '', notes: [...chord.notes], root: chord.root, sym: chord.sym });
  if (state.progression.length > 32) state.progression.shift();
  state.usedChords.add(`${chord.root}:${T.chordFamily(chord.sym) === 'min' ? 'minor' : 'major'}`);
  renderProgression();
}
function addToProgression(s) {
  state.progression.push({ label: s.label, roman: s.roman, notes: [...s.notes], root: s.root, sym: s.sym });
  state.usedChords.add(`${s.root}:${T.chordFamily(s.sym) === 'min' ? 'minor' : 'major'}`);
  renderProgression();
  toast('Añadido: ' + s.label);
}
function renderProgression() {
  const host = $('#progression');
  host.innerHTML = '';
  if (!state.progression.length) {
    host.append(h('span', { style: { color: 'var(--txt-faint)', fontSize: '12px' }, text: 'Los acordes que toques se van apuntando aquí.' }));
    return;
  }
  state.progression.forEach((p, i) => {
    host.append(h('button', {
      class: 'prog-item' + (i === state.progression.length - 1 ? ' new' : ''),
      onclick: () => previewChord(p, 0.9),
      title: 'Clic para escuchar',
    }, p.label, h('small', { text: p.roman || '' })));
  });
  if (state.circle) state.circle.update({ key: state.key, used: state.usedChords, centerText: state.key ? T.keyName(state.key) : '' });
}
async function playProgression() {
  if (!state.progression.length) return;
  const beat = (60 / state.clock.bpm) * 2;
  for (const p of state.progression) {
    previewChord(p, beat * 0.95);
    await new Promise((r) => setTimeout(r, beat * 1000));
  }
}
function copyProgression() {
  const text = state.progression.map((p) => `${p.label}${p.roman ? ` (${p.roman})` : ''}`).join('  →  ');
  navigator.clipboard?.writeText(text).then(() => toast('Progresión copiada')).catch(() => toast('No se pudo copiar'));
}
function generateProgression() {
  const key = state.key || { tonic: 0, mode: 'major' };
  const chords = T.diatonicChords(key, Math.random() < 0.4);
  const shapes = [[0, 4, 5, 3], [0, 5, 3, 4], [1, 4, 0, 0], [5, 3, 0, 4], [0, 3, 4, 4], [1, 4, 2, 5], [0, 2, 3, 4]];
  const shape = shapes[Math.floor(Math.random() * shapes.length)];
  state.progression = [];
  state.usedChords.clear();
  let ref = [60, 64, 67];
  for (const deg of shape) {
    const c = chords[deg];
    const notes = T.voiceChord(c.root, c.intervals, ref);
    ref = notes;
    state.progression.push({ label: c.label, roman: c.roman, notes, root: c.root, sym: c.sym });
    state.usedChords.add(`${c.root}:${T.chordFamily(c.sym) === 'min' ? 'minor' : 'major'}`);
  }
  renderProgression();
  playProgression();
}

// ---------------------------------------------------------------------------
// Tonalidad y escala
// ---------------------------------------------------------------------------
function renderKeyPanel(key, chord) {
  $('#keyName').textContent = key ? T.keyName(key) + (state.keyLock ? ' (fijada)' : '') : '—';
  $('#keyConf').textContent = key && !state.keyLock ? `${Math.round(key.confidence * 100)}%` : '';
  if (state.circle) {
    const cur = chord && chord.root != null ? { pc: chord.root, mode: T.chordFamily(chord.sym) === 'min' || T.chordFamily(chord.sym) === 'dim' ? 'minor' : 'major' } : null;
    state.circle.update({ key, current: cur, used: state.usedChords, centerText: key ? T.keyName(key) : '' });
  }
}
function updateScaleDisplay() {
  const pcs = T.scalePcs(state.scaleRoot, state.scaleId);
  state.piano.setScale(pcs, state.scaleRoot);
  if (state.clock) state.clock.scaleLock = state.scaleLock ? pcs : null;
}
function followKey() {
  if (!state.key) return;
  state.scaleRoot = state.key.tonic;
  state.scaleId = state.key.mode === 'major' ? 'major' : 'minor';
  $('#scaleRoot').value = state.scaleRoot;
  $('#scaleId').value = state.scaleId;
  updateScaleDisplay();
  toast('Escala: ' + T.pcName(state.scaleRoot) + ' ' + T.SCALES[state.scaleId].name);
}

// ---------------------------------------------------------------------------
// MIDI entrante
// ---------------------------------------------------------------------------
function onMidiNote({ note, velocity, on, channel }) {
  const padIdx = state.mapping.pads.indexOf(note);
  if (state.learn && state.learn.type === 'pad' && on) {
    const idx = state.learn.index;
    state.mapping.pads[idx] = note;
    state.learn = null;
    saveStorage();
    refreshPads();
    toast(`Pad ${idx + 1} aprendido: nota ${note}`);
    return;
  }
  if (padIdx >= 0 && (state.mapping.padChannel == null || channel === state.mapping.padChannel)) {
    if (on) hitPad(padIdx, velocity); 
    else releasePad(padIdx);
    return;
  }
  if (on) playNote(note, velocity, 'midi'); else stopNote(note);
}

function onMidiCC({ cc, value }) {
  if (state.learn && state.learn.type === 'knob') {
    state.mapping.knobs[state.learn.index].cc = cc;
    state.learn = null;
    saveStorage();
    refreshKnobPanel();
    toast(`Perilla aprendida: CC ${cc}`);
    return;
  }
  if (cc === state.mapping.modWheelCC) {
    state.engine.setMod(value / 127);
    $('#modChip').textContent = `Mod: ${Math.round((value / 127) * 100)}%`;
    return;
  }
  if (cc === state.mapping.sustainCC) { state.engine.setSustain(value >= 64); return; }
  if (cc === 123 || cc === 120) { panic(); return; }
  const idx = state.mapping.knobs.findIndex((k) => k.cc === cc);
  if (idx < 0) return;
  applyKnob(idx, value / 127);
}

function applyKnob(idx, v01) {
  const map = state.mapping.knobs[idx];
  const target = map.target;
  const knob = state.knobs[idx];
  if (knob) { knob.set(v01); knob.flash(); }
  if (target === '@none') return;
  const value = scaleValue(target, v01);
  if (target === '@bpm') { setBpm(Math.round(value)); return; }
  if (target === '@arpRate') {
    const i = Math.min(ARP_DIV_LIST.length - 1, Math.floor(v01 * ARP_DIV_LIST.length));
    state.clock.arp.div = ARP_DIV_LIST[i];
    $('#arpDiv').value = ARP_DIV_LIST[i];
    return;
  }
  if (target === '@arpGate') { state.clock.arp.gate = value; return; }
  state.engine.setParam(target, target === 'bendRange' ? Math.round(value) : value);
  syncKnob(target);
  const el = $$('[data-path]').find((e) => e.dataset.path === target);
  if (el) { if (el.type === 'checkbox') el.checked = !!value; else el.value = value; }
}

function pushMidiLog(text) {
  const log = $('#midiLog');
  log.prepend(h('div', { text }));
  while (log.childNodes.length > 60) log.lastChild.remove();
}

// ---------------------------------------------------------------------------
// Perillas asignables
// ---------------------------------------------------------------------------
function refreshKnobPanel() {
  const host = $('#ccKnobs'), targets = $('#knobTargets');
  host.innerHTML = ''; targets.innerHTML = '';
  state.knobs = [];
  state.mapping.knobs.forEach((map, i) => {
    const k = new Knob({
      label: `CC ${map.cc}`,
      value: map.target === '@none' ? 0 : unscaleValue(map.target, T_get(map.target) ?? 0) || 0,
      format: (v) => formatValue(map.target, scaleValue(map.target, v)),
      onChange: (v) => applyKnob(i, v),
      onLearn: () => startLearn('knob', i),
    });
    state.knobs.push(k);
    host.append(k.el);
    targets.append(h('div', { class: 'ctl' },
      h('span', { class: 'lbl', text: `CC ${map.cc}` }),
      h('select', {
        onchange: (e) => { map.target = e.target.value; saveStorage(); refreshKnobPanel(); },
      }, KNOB_TARGETS.map((t) => h('option', { value: t.id, text: t.label, selected: t.id === map.target }))),
      h('button', { class: 'btn sm', text: '⟳', title: 'Aprender CC: mueve una perilla del SMK-25', onclick: () => startLearn('knob', i) })));
  });
}

function startLearn(type, index) {
  state.learn = { type, index };
  if (type === 'knob') { state.knobs.forEach((k, i) => k.setLearning(i === index)); toast('Mueve una perilla del SMK-25…'); }
  else { refreshPads(); toast('Golpea un pad del SMK-25…'); }
  setTimeout(() => {
    if (state.learn && state.learn.type === type && state.learn.index === index) {
      state.learn = null;
      state.knobs.forEach((k) => k.setLearning(false));
      refreshPads();
      toast('Aprendizaje cancelado');
    }
  }, 8000);
}

// ---------------------------------------------------------------------------
// Pads
// ---------------------------------------------------------------------------
function padContent(i) {
  const key = state.key || { tonic: 0, mode: 'major' };
  switch (state.padMode) {
    case 'drums': return { title: DRUM_NAMES[i], sub: `nota ${state.mapping.pads[i]}` };
    case 'chords': {
      const c = T.diatonicChords(key, i === 7)[i % 7];
      return { title: c.label, sub: c.roman };
    }
    case 'suggest': {
      const s = state.suggestions[i];
      return s ? { title: s.label, sub: s.roman || s.tag } : { title: '—', sub: '' };
    }
    case 'presets': {
      const p = allPresets()[i];
      return { title: p ? p.name : '—', sub: 'preset' };
    }
    case 'transport': {
      const a = TRANSPORT_ACTIONS[i];
      return { title: a.label, sub: '' };
    }
    default: return { title: '', sub: '' };
  }
}

function refreshPads() {
  const host = $('#pads');
  host.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const c = padContent(i);
    const el = h('button', {
      class: 'pad' + (state.learn && state.learn.type === 'pad' && state.learn.index === i ? ' learning' : ''),
      onpointerdown: (e) => { if (e.shiftKey) { startLearn('pad', i); return; } hitPad(i, 105); },
      onpointerup: () => releasePad(i),
      onpointerleave: () => releasePad(i),
    }, h('b', { text: c.title }), h('small', { text: c.sub }));
    host.append(el);
  }
}

function hitPad(i, velocity) {
  const el = $('#pads').children[i];
  if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 140); }
  const key = state.key || { tonic: 0, mode: 'major' };
  switch (state.padMode) {
    case 'drums':
      state.engine.drums.trigger(i, velocity);
      break;
    case 'chords': {
      const c = T.diatonicChords(key, i === 7)[i % 7];
      const notes = T.voiceChord(c.root, c.intervals, state.padNotes || [60, 64, 67]);
      state.padNotes = notes;
      padChordOn(i, notes, velocity);
      break;
    }
    case 'suggest': {
      const s = state.suggestions[i];
      if (s) padChordOn(i, s.notes, velocity);
      break;
    }
    case 'presets': {
      const p = allPresets()[i];
      if (p) applyPreset(p);
      break;
    }
    case 'transport':
      doTransport(TRANSPORT_ACTIONS[i].id);
      break;
    default: break;
  }
}

function padChordOn(i, notes, velocity) {
  state.padHeld = state.padHeld || {};
  releasePad(i);
  state.padHeld[i] = notes;
  for (const n of notes) { state.engine.noteOn(n, velocity); state.piano.noteOn(n, 'arp'); }
  if (state.clock.arp.on) state.clock.setArpNotes(notes);
  const chord = T.detectChord(notes);
  renderChord(chord, state.key);
  updatePianoRoles(chord);
}

function releasePad(i) {
  if (!state.padHeld || !state.padHeld[i]) return;
  for (const n of state.padHeld[i]) { state.engine.noteOff(n); if (!state.held.has(n)) state.piano.noteOff(n); }
  delete state.padHeld[i];
}

function doTransport(id) {
  switch (id) {
    case 'arp': toggleArp(); break;
    case 'latch': toggleLatch(); break;
    case 'rec': state.clock.armLoop(); break;
    case 'play': state.clock.toggleLoopPlay(); break;
    case 'clear': state.clock.clearLoop(); break;
    case 'metronome': toggleMetronome(); break;
    case 'octDown': setOctave(state.octave - 1); break;
    case 'octUp': setOctave(state.octave + 1); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------
function toggleArp() {
  const arp = state.clock.arp;
  arp.on = !arp.on;
  if (arp.on) {
    state.engine.allNotesOff();
    state.clock.setArpNotes([...state.held]);
    state.clock.start();
  } else {
    state.clock.releaseArp(state.engine.ctx.currentTime);
    state.engine.allNotesOff();
    for (const n of state.held) state.engine.noteOn(n, 100);
  }
  refreshTransport();
}
function toggleLatch() {
  state.clock.arp.latch = !state.clock.arp.latch;
  refreshTransport();
}
function toggleMetronome() {
  state.clock.metronome = !state.clock.metronome;
  if (state.clock.metronome && !state.clock.running) state.clock.start();
  refreshTransport();
}
function toggleDrums() {
  state.clock.drum.on = !state.clock.drum.on;
  if (state.clock.drum.on && !state.clock.running) state.clock.start();
  refreshTransport();
}
function refreshTransport() {
  const c = state.clock;
  if (!c) return;
  $('#arpBtn').classList.toggle('active', c.arp.on);
  $('#latchBtn').classList.toggle('active', c.arp.latch);
  $('#metroBtn').classList.toggle('active', c.metronome);
  $('#drumOn').classList.toggle('active', c.drum.on);
  $('#loopRec').classList.toggle('active', c.loop.state === 'rec');
  $('#loopPlay').classList.toggle('active', c.loop.state === 'play');
  $('#loopPlay').textContent = c.loop.state === 'play' ? '⏸' : '▶';
}
function setBpm(bpm) {
  state.clock.setBpm(bpm);
  $('#bpmVal').textContent = `${bpm} BPM`;
  $('#bpmRange').value = bpm;
}
let taps = [];
function tapTempo() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  if (taps.length >= 2) {
    const spans = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
    setBpm(Math.round(60000 / avg));
  }
}

// ---------------------------------------------------------------------------
// Secuenciador
// ---------------------------------------------------------------------------
function buildSequencer() { renderSequencer(); }
function renderSequencer() {
  const host = $('#sequencer');
  host.innerHTML = '';
  const pattern = state.clock ? state.clock.drum.pattern : emptyPattern();
  const grid = h('div', { class: 'seq' });
  DRUM_NAMES.forEach((name, row) => {
    grid.append(h('button', { class: 'seq-name', text: name, onclick: () => state.engine && state.engine.drums.trigger(row, 100) }));
    const rowEl = h('div', { class: 'seq-row', dataset: { row } });
    for (let s = 0; s < DRUM_STEPS; s++) {
      const v = pattern[row][s];
      rowEl.append(h('button', {
        class: `seq-cell${s % 4 === 0 ? ' beat' : ''}${v ? (v > 100 ? ' accent' : ' on') : ''}`,
        dataset: { row, step: s },
        onclick: () => toggleCell(row, s, false),
        oncontextmenu: (e) => { e.preventDefault(); toggleCell(row, s, true); },
      }));
    }
    grid.append(rowEl);
  });
  host.append(grid);
}
function toggleCell(row, step, accent) {
  const p = state.clock.drum.pattern;
  const cur = p[row][step];
  p[row][step] = accent ? (cur === 118 ? 0 : 118) : (cur ? 0 : 88);
  if (p[row][step]) state.engine.drums.trigger(row, p[row][step]);
  renderSequencer();
}
function highlightStep(step) {
  const cells = $$('#sequencer .seq-cell');
  for (const c of cells) c.classList.toggle('cur', +c.dataset.step === step);
}
function loadDrumPattern(name) {
  state.clock.drum.pattern = clonePattern(DRUM_PATTERNS[name] || emptyPattern());
  renderSequencer();
}
function clonePattern(p) { return p.map((r) => [...r]); }
function mutatePattern() {
  const p = state.clock.drum.pattern;
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(Math.random() * 5);
    const step = Math.floor(Math.random() * DRUM_STEPS);
    p[row][step] = p[row][step] ? 0 : (Math.random() < 0.3 ? 115 : 85);
  }
  renderSequencer();
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
function allPresets() { return [...FACTORY_PRESETS, ...state.userPresets]; }
function fillPresetSelect() {
  const sel = $('#presetSel');
  sel.innerHTML = '';
  const fab = h('optgroup', { label: 'De fábrica' });
  FACTORY_PRESETS.forEach((p) => fab.append(h('option', { value: p.name, text: p.name })));
  sel.append(fab);
  if (state.userPresets.length) {
    const mine = h('optgroup', { label: 'Míos' });
    state.userPresets.forEach((p) => mine.append(h('option', { value: p.name, text: p.name })));
    sel.append(mine);
  }
}
function onPresetPick(name) {
  const p = allPresets().find((x) => x.name === name);
  if (p) applyPreset(p);
}
function applyPreset(preset, notify = true) {
  state.engine.loadPreset(preset);
  syncAllControls();
  if (notify) toast('Preset: ' + preset.name);
  selectPresetName(preset.name);
}
// Un sonido aleatorio o modificado no está en la lista: se muestra igualmente.
function selectPresetName(name) {
  const sel = $('#presetSel');
  if (![...sel.options].some((o) => o.value === name)) {
    let grp = $('#presetCurrent');
    if (!grp) { grp = h('optgroup', { label: 'Sonido actual', id: 'presetCurrent' }); sel.prepend(grp); }
    grp.innerHTML = '';
    grp.append(h('option', { value: name, text: name }));
  }
  sel.value = name;
}
function doRandom() {
  const p = randomPatch();
  applyPreset(p, false);
  toast('Sonido nuevo: ' + p.name);
}
function savePreset() {
  const name = prompt('Nombre del preset:', state.engine.params.name || 'Mi sonido');
  if (!name) return;
  const patch = JSON.parse(JSON.stringify(state.engine.params));
  patch.name = name;
  const i = state.userPresets.findIndex((p) => p.name === name);
  if (i >= 0) state.userPresets[i] = patch; else state.userPresets.push(patch);
  saveStorage();
  fillPresetSelect();
  selectPresetName(name);
  toast('Guardado: ' + name);
}
function openPresetIO() {
  const ta = h('textarea', { style: { width: '100%', minHeight: '220px', background: 'var(--panel-2)', color: 'var(--txt)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px', fontFamily: 'var(--mono)', fontSize: '11px' } });
  ta.value = JSON.stringify(state.userPresets, null, 2);
  const content = h('div', {},
    h('p', { text: 'Copia este texto para respaldar tus sonidos, o pega otro y pulsa Importar.' }),
    ta,
    h('div', { class: 'piano-toolbar', style: { padding: '10px 0 0' } },
      h('button', {
        class: 'btn', text: 'Importar', onclick: () => {
          try {
            const arr = JSON.parse(ta.value);
            if (!Array.isArray(arr)) throw new Error('Se esperaba una lista');
            state.userPresets = arr;
            saveStorage(); fillPresetSelect(); toast(`${arr.length} presets importados`);
          } catch (e) { toast('JSON inválido: ' + e.message, 3200); }
        },
      }),
      h('button', {
        class: 'btn', text: 'Descargar .json', onclick: () => {
          const blob = new Blob([ta.value], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'mvave-presets.json' });
          a.click();
        },
      }),
      h('button', { class: 'btn warn', text: 'Borrar los míos', onclick: () => { state.userPresets = []; saveStorage(); fillPresetSelect(); ta.value = '[]'; } })));
  openModal('Presets', content);
}

function saveStorage() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      mapping: state.mapping, presets: state.userPresets,
      theme: document.documentElement.dataset.theme || '',
      instrumentId: state.instrumentId, quality: state.quality,
    }));
  } catch (e) { /* almacenamiento no disponible */ }
}
function loadStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (raw.mapping) state.mapping = { ...state.mapping, ...raw.mapping };
    if (Array.isArray(raw.presets)) state.userPresets = raw.presets;
    if (raw.theme) document.documentElement.dataset.theme = raw.theme;
    if (raw.instrumentId && INSTRUMENT_BY_ID[raw.instrumentId]) state.instrumentId = raw.instrumentId;
    if (raw.quality && QUALITY[raw.quality]) state.quality = raw.quality;
  } catch (e) { /* ignorar */ }
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = cur === 'light' ? '' : 'light';
  saveStorage();
}

// ---------------------------------------------------------------------------
// Grabación de audio
// ---------------------------------------------------------------------------
function toggleRecord() {
  const btn = $('#recBtn');
  if (state.recorder && state.recorder.state === 'recording') {
    state.recorder.stop();
    return;
  }
  const dest = state.engine.ctx.createMediaStreamDestination();
  state.engine.limiter.connect(dest);
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) { toast('Este navegador no permite grabar audio'); return; }
  const rec = state.recorder = new MediaRecorder(dest.stream, { mimeType: mime });
  state.recChunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) state.recChunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(state.recChunks, { type: mime });
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
    const a = h('a', { href: URL.createObjectURL(blob), download: `mvave-jam-${Date.now()}.${ext}` });
    a.click();
    try { state.engine.limiter.disconnect(dest); } catch (e) { /* */ }
    btn.classList.remove('active');
    btn.innerHTML = '⏺ Grabar';
    toast('Grabación descargada');
  };
  rec.start();
  btn.classList.add('active');
  btn.innerHTML = '⏹ Detener';
  toast('Grabando…');
}

// ---------------------------------------------------------------------------
// Teclado de la computadora
// ---------------------------------------------------------------------------
const KEY_MAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
const pressed = new Set();

function onKeyDown(e) {
  if (e.target.matches('input, textarea, select')) return;
  if (e.repeat) return;
  if (e.code === 'Escape') { panic(); return; }
  if (e.code === 'Slash' && e.shiftKey) { showHelp(); return; }
  if (e.code === 'Space') { e.preventDefault(); state.clock && (state.clock.running ? state.clock.stop() : state.clock.start()); refreshTransport(); return; }
  if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) { doRandom(); return; }
  if (e.code === 'KeyZ') { setOctave(state.octave - 1); return; }
  if (e.code === 'KeyX') { setOctave(state.octave + 1); return; }
  if (e.code === 'KeyC') { toggleHold(); return; }
  if (e.code === 'KeyV') { toggleArp(); return; }
  if (e.code === 'KeyI') { setSoundMode(state.mode === 'piano' ? 'synth' : 'piano'); return; }
  if (/^Digit[1-9]$/.test(e.code)) {
    const i = +e.code.slice(5) - 1;
    const s = state.suggestions[i];
    if (s) { previewChord(s); showGhost(s); setTimeout(() => showGhost(null), 900); }
    return;
  }
  if (!state.computerKeys) return;
  const off = KEY_MAP[e.code];
  if (off == null || pressed.has(e.code)) return;
  pressed.add(e.code);
  playNote(60 + off, 100, 'midi');
}
function onKeyUp(e) {
  const off = KEY_MAP[e.code];
  if (off == null) return;
  pressed.delete(e.code);
  stopNote(60 + off);
}

// ---------------------------------------------------------------------------
// Ayuda
// ---------------------------------------------------------------------------
function showHelp() {
  const knobRows = state.mapping.knobs.map((k, i) => `<tr><td>Perilla ${i + 1}</td><td>CC ${k.cc}</td><td>${(TARGET_BY_ID[k.target] || {}).label || k.target}</td></tr>`).join('');
  const content = h('div', {
    html: `
    <h4>Conectar el M-VAVE SMK-25</h4>
    <ul>
      <li>Conéctalo por USB (o por Bluetooth con el receptor MS1) <b>antes</b> de abrir la página.</li>
      <li>Usa Chrome, Edge u Opera: Firefox y Safari todavía no traen Web MIDI.</li>
      <li>Acepta el permiso de dispositivos MIDI y elige el teclado en la lista de arriba.</li>
      <li>Si no aparece, cierra cualquier DAW que lo tenga tomado y recarga.</li>
    </ul>
    <h4>Mapa actual de las 8 perillas</h4>
    <table><tr><th>Perilla</th><th>Mensaje</th><th>Destino</th></tr>${knobRows}</table>
    <p>Si tu SMK-25 manda otros números de CC, pulsa <kbd>⟳</kbd> junto a la perilla (o Shift + clic sobre ella) y muévela: queda aprendida y se guarda en el navegador.</p>
    <h4>Los 8 pads</h4>
    <ul>
      <li><b>Batería</b>: bombo, caja, palmas, hi-hats, toms y cencerro sintetizados.</li>
      <li><b>Acordes de la tonalidad</b>: los siete grados de la tonalidad detectada, con buena conducción de voces.</li>
      <li><b>Sugerencias</b>: dispara directamente los acordes propuestos en el panel de la izquierda.</li>
      <li><b>Cambiar preset</b> y <b>Transporte</b> (arpegio, retener, loop, metrónomo, octavas).</li>
    </ul>
    <p>Shift + clic sobre un pad de la pantalla para aprender la nota que envía tu pad físico.</p>
    <h4>Piano clásico y otros teclados</h4>
    <ul>
      <li>El botón <b>🎹 Piano</b> de arriba (o la tecla <kbd>I</kbd>) cambia el generador de sonido: en vez del sintetizador suena un instrumento muestreado.</li>
      <li>Hay diez instrumentos en el desplegable: el gran cola Yamaha C5, una cola brillante, una cola amplificada, piano de bar, dos eléctricos, clavecín, clavinet, celesta y caja de música. Cada uno se descarga la primera vez que lo eliges y los últimos que hayas usado quedan listos al instante.</li>
      <li><b>Ruido de teclas</b> es el clic mecánico real de la tecla al soltarla. Va muy bajo a propósito, pero si te molesta ponla en cero y desaparece.</li>
      <li><b>Calidad</b> decide cuántas capas de dinámica se descargan del gran cola: cuatro suenan mejor pero ocupan unos 560 MB de memoria, y una sola baja a 150 MB. Se ajusta sola según tu equipo y puedes cambiarla cuando quieras.</li>
      <li><b>Dinámica</b> ajusta cuánto responde a la fuerza, <b>Brillo</b> abre o cierra el tono y <b>Afinación estirada</b> imita la afinación de un piano de cola, con los graves algo bajos y los agudos algo altos.</li>
      <li><b>Sala</b> elige el ambiente, y si dejas activado «pasar por los efectos» puedes añadirle el eco, el chorus o la distorsión del sintetizador.</li>
      <li>Todo lo demás sigue funcionando igual: análisis de acordes, sugerencias, arpegio, loop, pads y caja de ritmos.</li>
    </ul>
    <h4>Análisis armónico</h4>
    <ul>
      <li>El nombre del acorde aparece con su inversión, su grado en la tonalidad y la escala recomendada.</li>
      <li>Las sugerencias explican <i>por qué</i> funcionan: cadencias, dominantes secundarias, acordes prestados, sustituciones tritonales.</li>
      <li>Pasa el ratón por una sugerencia y verás sus notas dibujadas en el piano; haz clic para escucharla, doble clic para añadirla a la progresión.</li>
      <li>La tonalidad se estima con los perfiles de Krumhansl–Kessler sobre lo que vas tocando; puedes fijarla en el círculo de quintas.</li>
    </ul>
    <h4>Atajos de teclado</h4>
    <table>
      <tr><td><kbd>A</kbd>…<kbd>'</kbd></td><td>Tocar notas (fila de piano)</td></tr>
      <tr><td><kbd>Z</kbd> / <kbd>X</kbd></td><td>Bajar / subir una octava</td></tr>
      <tr><td><kbd>C</kbd></td><td>Sostener el acorde</td></tr>
      <tr><td><kbd>V</kbd></td><td>Arpegio on/off</td></tr>
      <tr><td><kbd>I</kbd></td><td>Cambiar entre sintetizador y piano</td></tr>
      <tr><td><kbd>1</kbd>…<kbd>9</kbd></td><td>Escuchar la sugerencia n.º…</td></tr>
      <tr><td><kbd>R</kbd></td><td>Sonido aleatorio</td></tr>
      <tr><td><kbd>Espacio</kbd></td><td>Reloj on/off</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Pánico: silenciar todo</td></tr>
    </table>
    <h4>Otros detalles</h4>
    <ul>
      <li>Las perillas de la pantalla se arrastran arriba/abajo; con Shift van finas y con doble clic vuelven a su valor inicial.</li>
      <li>El botón <b>Grabar</b> descarga un archivo de audio con todo lo que suena.</li>
      <li>Tus presets y el mapeo se guardan en este navegador; puedes exportarlos con el botón ⇅.</li>
    </ul>`,
  });
  openModal('Guía rápida', content);
}

// Punto de entrada de depuración: permite inspeccionar y automatizar desde la consola.
window.mvave = state;

boot();
