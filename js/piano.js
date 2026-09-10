// ---------------------------------------------------------------------------
// piano.js — teclado virtual en SVG: notas en vivo, roles del acorde,
// escala resaltada, notas fantasma de la sugerencia y ratón/táctil.
// ---------------------------------------------------------------------------
import { isBlack, mod12, pcName, noteName } from './theory.js';

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const ROLE_LABELS = { 0: '1', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '11', 6: '♯11', 7: '5', 8: '♭13', 9: '13', 10: '♭7', 11: '7' };
const SVGNS = 'http://www.w3.org/2000/svg';

export class Piano extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.el = container;
    this.low = opts.low != null ? opts.low : 36;
    this.high = opts.high != null ? opts.high : 84;
    this.showLabels = opts.showLabels !== false;
    this.active = new Map();   // note -> {source}
    this.ghosts = new Map();   // note -> class
    this.roles = new Map();    // note -> texto de rol
    this.scalePcs = null;
    this.rootPc = null;
    this.keys = new Map();
    this.pointerNote = null;
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'piano-svg');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.el.appendChild(this.svg);
    this.build();
    this.attachPointer();
  }

  setRange(low, high) {
    this.low = low;
    this.high = high;
    this.build();
  }

  build() {
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this.keys.clear();
    const whites = [];
    for (let n = this.low; n <= this.high; n++) if (!isBlack(n)) whites.push(n);
    if (!whites.length) return;
    const W = 24, H = 130, BW = 15, BH = 82;
    const width = whites.length * W;
    svg.setAttribute('viewBox', `0 0 ${width} ${H}`);
    const whiteLayer = document.createElementNS(SVGNS, 'g');
    const blackLayer = document.createElementNS(SVGNS, 'g');
    const labelLayer = document.createElementNS(SVGNS, 'g');
    svg.append(whiteLayer, blackLayer, labelLayer);

    const xOf = (note) => {
      const idx = whites.indexOf(note);
      if (idx >= 0) return idx * W;
      const prevWhite = whites.filter((w) => w < note).length - 1;
      return prevWhite * W + W - BW / 2;
    };

    for (const n of whites) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'key white');
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', xOf(n) + 0.5);
      r.setAttribute('y', 0.5);
      r.setAttribute('width', W - 1);
      r.setAttribute('height', H - 1);
      r.setAttribute('rx', 3);
      g.appendChild(r);
      const rl = document.createElementNS(SVGNS, 'text');
      rl.setAttribute('class', 'role');
      rl.setAttribute('x', xOf(n) + W / 2);
      rl.setAttribute('y', H - 26);
      g.appendChild(rl);
      const lb = document.createElementNS(SVGNS, 'text');
      lb.setAttribute('class', 'label');
      lb.setAttribute('x', xOf(n) + W / 2);
      lb.setAttribute('y', H - 9);
      lb.textContent = mod12(n) === 0 ? noteName(n) : pcName(n);
      g.appendChild(lb);
      whiteLayer.appendChild(g);
      this.keys.set(n, { g, rect: r, label: lb, role: rl, black: false });
    }

    for (let n = this.low; n <= this.high; n++) {
      if (!isBlack(n)) continue;
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'key black');
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', xOf(n));
      r.setAttribute('y', 0);
      r.setAttribute('width', BW);
      r.setAttribute('height', BH);
      r.setAttribute('rx', 2.5);
      g.appendChild(r);
      const rl = document.createElementNS(SVGNS, 'text');
      rl.setAttribute('class', 'role');
      rl.setAttribute('x', xOf(n) + BW / 2);
      rl.setAttribute('y', BH - 8);
      g.appendChild(rl);
      blackLayer.appendChild(g);
      this.keys.set(n, { g, rect: r, label: null, role: rl, black: true });
    }
    this.render();
  }

  noteAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const g = el.closest && el.closest('.key');
    if (!g) return null;
    for (const [n, k] of this.keys) if (k.g === g) return n;
    return null;
  }

  attachPointer() {
    const down = (e) => {
      const n = this.noteAt(e.clientX, e.clientY);
      if (n == null) return;
      e.preventDefault();
      this.el.setPointerCapture?.(e.pointerId);
      this.pointerNote = n;
      this.emit('noteon', { note: n, velocity: velocityFromY(e, this.keys.get(n)) });
    };
    const move = (e) => {
      if (this.pointerNote == null) return;
      const n = this.noteAt(e.clientX, e.clientY);
      if (n == null || n === this.pointerNote) return;
      this.emit('noteoff', { note: this.pointerNote });
      this.pointerNote = n;
      this.emit('noteon', { note: n, velocity: velocityFromY(e, this.keys.get(n)) });
    };
    const up = () => {
      if (this.pointerNote == null) return;
      this.emit('noteoff', { note: this.pointerNote });
      this.pointerNote = null;
    };
    this.el.addEventListener('pointerdown', down);
    this.el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  setActive(notes, source = 'midi') {
    this.active = new Map(notes.map((n) => [n, source]));
    this.render();
  }
  noteOn(note, source = 'midi') { this.active.set(note, source); this.renderKey(note); }
  noteOff(note) { this.active.delete(note); this.renderKey(note); }
  setRoles(map) { this.roles = map || new Map(); this.render(); }
  setGhosts(map) { this.ghosts = map || new Map(); this.render(); }
  setScale(pcs, rootPc) { this.scalePcs = pcs; this.rootPc = rootPc; this.render(); }

  renderKey(n) {
    const k = this.keys.get(n);
    if (!k) return;
    const cls = ['key', k.black ? 'black' : 'white'];
    const src = this.active.get(n);
    if (src) cls.push('on', 'on-' + src);
    const ghost = this.ghosts.get(n);
    if (ghost && !src) cls.push('ghost', 'ghost-' + ghost);
    if (this.scalePcs && this.scalePcs.includes(mod12(n))) cls.push('in-scale');
    if (this.rootPc != null && mod12(n) === this.rootPc) cls.push('is-root');
    k.g.setAttribute('class', cls.join(' '));
    const role = this.roles.get(n);
    k.role.textContent = role || '';
    if (k.label) k.label.style.opacity = this.showLabels ? '' : '0';
  }

  render() { for (const n of this.keys.keys()) this.renderKey(n); }

  static roleFor(interval) { return ROLE_LABELS[mod12(interval)] || ''; }
}

function velocityFromY(e, key) {
  if (!key) return 100;
  const r = key.rect.getBoundingClientRect();
  const rel = r.height ? (e.clientY - r.top) / r.height : 0.7;
  return Math.max(30, Math.min(127, Math.round(45 + rel * 82)));
}

export { WHITE_PCS };
