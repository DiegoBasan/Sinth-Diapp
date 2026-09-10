// ---------------------------------------------------------------------------
// visualizer.js — osciloscopio + analizador de espectro sobre un canvas.
// ---------------------------------------------------------------------------
export class Visualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.analyser = analyser;
    this.mode = 'both';
    this.time = new Uint8Array(analyser.fftSize);
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    this.raf = null;
    this.peak = new Float32Array(analyser.frequencyBinCount);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.canvas.width = Math.floor(r.width * dpr);
    this.canvas.height = Math.floor(r.height * dpr);
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width;
    this.h = r.height;
  }

  start() {
    if (this.raf) return;
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = null; }

  draw() {
    const c = this.ctx2d;
    if (!this.w) { this.resize(); if (!this.w) return; }
    const w = this.w, h = this.h;
    c.clearRect(0, 0, w, h);
    const accent = getComputedStyle(this.canvas).getPropertyValue('--viz-accent').trim() || '#5eead4';
    const accent2 = getComputedStyle(this.canvas).getPropertyValue('--viz-accent-2').trim() || '#a78bfa';

    if (this.mode === 'spectrum' || this.mode === 'both') {
      this.analyser.getByteFrequencyData(this.freq);
      const bins = this.freq.length;
      const bars = 72;
      const grad = c.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, accent2 + '33');
      grad.addColorStop(1, accent2);
      c.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        const t0 = Math.pow(i / bars, 2.1), t1 = Math.pow((i + 1) / bars, 2.1);
        const a = Math.floor(t0 * bins), b = Math.max(a + 1, Math.floor(t1 * bins));
        let m = 0;
        for (let k = a; k < b && k < bins; k++) m = Math.max(m, this.freq[k]);
        const bh = (m / 255) * h * 0.92;
        const bw = w / bars;
        c.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
    }

    if (this.mode === 'scope' || this.mode === 'both') {
      this.analyser.getByteTimeDomainData(this.time);
      const n = this.time.length;
      // engancha en el cruce por cero para que la onda no "corra"
      let start = 0;
      for (let i = 1; i < n / 2; i++) {
        if (this.time[i - 1] < 128 && this.time[i] >= 128) { start = i; break; }
      }
      c.beginPath();
      c.lineWidth = 2;
      c.strokeStyle = accent;
      const span = Math.floor(n / 2);
      for (let i = 0; i < span; i++) {
        const v = (this.time[(start + i) % n] - 128) / 128;
        const x = (i / span) * w;
        const y = h / 2 - v * h * 0.42;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
}
