// ---------------------------------------------------------------------------
// ui.js — utilidades del DOM, perilla giratoria, círculo de quintas y avisos.
// ---------------------------------------------------------------------------
import { mod12, pcName, keyUsesFlats } from './theory.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(4)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
const KNOB_A0 = -135, KNOB_A1 = 135;
const SVGNS = 'http://www.w3.org/2000/svg';

export class Knob extends EventTarget {
  constructor({ label, value = 0, format = (v) => v.toFixed(2), onChange, onLearn, bipolar = false }) {
    super();
    this.value = value;
    this.format = format;
    this.onChange = onChange;
    this.bipolar = bipolar;
    this.el = h('div', { class: 'knob', title: label });
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 50 50');
    const arc = (cls) => { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('class', cls); return p; };
    this.track = arc('track');
    this.track.setAttribute('d', describeArc(25, 25, 18, KNOB_A0, KNOB_A1));
    this.fill = arc('fill');
    const cap = document.createElementNS(SVGNS, 'circle');
    cap.setAttribute('class', 'cap'); cap.setAttribute('cx', 25); cap.setAttribute('cy', 25); cap.setAttribute('r', 12);
    this.ptr = document.createElementNS(SVGNS, 'line');
    this.ptr.setAttribute('class', 'pointer');
    svg.append(this.track, this.fill, cap, this.ptr);
    this.svg = svg;
    this.valEl = h('div', { class: 'val' });
    this.nameEl = h('div', { class: 'name', text: label });
    this.el.append(svg, this.valEl, this.nameEl);
    this.attach(onLearn);
    this.set(value);
  }

  attach(onLearn) {
    let startY = 0, startV = 0, dragging = false;
    const el = this.svg;
    el.addEventListener('pointerdown', (e) => {
      if (e.shiftKey && onLearn) { onLearn(); return; }
      dragging = true; startY = e.clientY; startV = this.value;
      el.setPointerCapture(e.pointerId);
      this.el.classList.add('touched');
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const scale = e.shiftKey ? 500 : 180;
      this.set(startV - (e.clientY - startY) / scale, true);
    });
    const end = () => { dragging = false; this.el.classList.remove('touched'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => { if (this.defaultValue != null) this.set(this.defaultValue, true); });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.set(this.value - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.02), true);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => { if (onLearn) { e.preventDefault(); onLearn(); } });
  }

  set(v01, emit = false) {
    this.value = Math.max(0, Math.min(1, v01));
    const a = KNOB_A0 + (KNOB_A1 - KNOB_A0) * this.value;
    const from = this.bipolar ? 0 : KNOB_A0;
    this.fill.setAttribute('d', describeArc(25, 25, 18, Math.min(from, a), Math.max(from, a)));
    const rad = ((a - 90) * Math.PI) / 180;
    this.ptr.setAttribute('x1', 25 + Math.cos(rad) * 4);
    this.ptr.setAttribute('y1', 25 + Math.sin(rad) * 4);
    this.ptr.setAttribute('x2', 25 + Math.cos(rad) * 11);
    this.ptr.setAttribute('y2', 25 + Math.sin(rad) * 11);
    this.valEl.textContent = this.format(this.value);
    if (emit && this.onChange) this.onChange(this.value);
  }

  flash() {
    this.el.classList.add('mod');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.el.classList.remove('mod'), 320);
  }
  setLearning(on) { this.el.classList.toggle('learning', !!on); }
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArc(cx, cy, r, a0, a1) {
  if (Math.abs(a1 - a0) < 0.01) a1 = a0 + 0.01;
  const s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

// ---------------------------------------------------------------------------
// Círculo de quintas: 12 mayores fuera, 12 menores dentro.
// ---------------------------------------------------------------------------
export const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export class CircleOfFifths {
  constructor(container, onPick) {
    this.el = container;
    this.onPick = onPick;
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'circle-svg');
    this.svg.setAttribute('viewBox', '0 0 240 240');
    this.el.appendChild(this.svg);
    this.segs = [];
    this.build();
  }
  build() {
    const svg = this.svg;
    const cx = 120, cy = 120;
    const rings = [{ r0: 78, r1: 116, mode: 'major' }, { r0: 40, r1: 76, mode: 'minor' }];
    for (const ring of rings) {
      for (let i = 0; i < 12; i++) {
        const pc = ring.mode === 'major' ? FIFTHS[i] : mod12(FIFTHS[i] - 3);
        const a0 = i * 30 - 15, a1 = a0 + 30;
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('class', 'seg-c');
        p.setAttribute('d', sector(cx, cy, ring.r0, ring.r1, a0, a1));
        p.addEventListener('click', () => this.onPick && this.onPick(pc, ring.mode));
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('class', 'lbl-c');
        const mid = polar(cx, cy, (ring.r0 + ring.r1) / 2, i * 30);
        t.setAttribute('x', mid.x); t.setAttribute('y', mid.y);
        const flat = keyUsesFlats(pc, ring.mode);
        t.textContent = pcName(pc, flat) + (ring.mode === 'minor' ? 'm' : '');
        svg.append(p, t);
        this.segs.push({ pc, mode: ring.mode, path: p, text: t });
      }
    }
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 38);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'var(--line)');
    svg.append(c);
    this.center = document.createElementNS(SVGNS, 'text');
    this.center.setAttribute('class', 'lbl-c');
    this.center.setAttribute('x', cx); this.center.setAttribute('y', cy);
    this.center.setAttribute('style', 'font-size:13px');
    svg.append(this.center);
  }
  update({ key, current, used, centerText }) {
    const inKey = new Set();
    if (key) {
      const offs = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
      const quals = key.mode === 'major' ? ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'] : ['minor', 'dim', 'major', 'minor', 'minor', 'major', 'major'];
      offs.forEach((o, i) => inKey.add(`${mod12(key.tonic + o)}:${quals[i] === 'dim' ? 'minor' : quals[i]}`));
    }
    for (const s of this.segs) {
      const id = `${s.pc}:${s.mode}`;
      s.path.classList.toggle('in-key', inKey.has(id));
      s.path.classList.toggle('tonic', !!key && key.tonic === s.pc && key.mode === s.mode);
      s.path.classList.toggle('current', !!current && current.pc === s.pc && current.mode === s.mode);
      s.path.classList.toggle('used', !!used && used.has(id));
    }
    this.center.textContent = centerText || '';
  }
}

function sector(cx, cy, r0, r1, a0, a1) {
  const p0 = polar(cx, cy, r1, a0), p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1), p3 = polar(cx, cy, r0, a0);
  return `M ${p0.x} ${p0.y} A ${r1} ${r1} 0 0 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r0} ${r0} 0 0 0 ${p3.x} ${p3.y} Z`;
}

// ---------------------------------------------------------------------------
let toastHost = null;
export function toast(msg, ms = 2200) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts' });
    document.body.appendChild(toastHost);
  }
  const t = h('div', { class: 'toast', text: msg });
  toastHost.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
}

export function openModal(title, contentNode) {
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  back.append(h('div', { class: 'modal' },
    h('header', {}, h('h2', { text: title }), h('button', { class: 'btn sm', onclick: close, text: '✕' })),
    h('div', { class: 'content' }, contentNode)));
  document.body.appendChild(back);
  return close;
}
