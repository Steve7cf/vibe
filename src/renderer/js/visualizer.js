/* ═══════════════════════════════════════════════════════
   Visualizer — 4 modes, throttled RAF, DPR-aware
   ═══════════════════════════════════════════════════════ */
const Visualizer = {
  canvas: null, ctx2d: null,
  mode: 'bars', animId: null, running: false,
  _accentCache: '', _accent: '#1db954',

  init() {
    this.canvas = document.getElementById('visualizer');
    if (!this.canvas) return;
    this.ctx2d = this.canvas.getContext('2d', { alpha: true });
    this._resize();
    new ResizeObserver(() => this._resize()).observe(this.canvas.parentElement);
  },

  _resize() {
    const p = this.canvas?.parentElement;
    if (!p) return;
    const { width: w, height: h } = p.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _getAccent() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (v !== this._accentCache) { this._accentCache = v; this._accent = v || '#1db954'; }
    return this._accent;
  },

  _parseAccent(hex) {
    return [
      parseInt(hex.slice(1,3)||'1d',16),
      parseInt(hex.slice(3,5)||'b9',16),
      parseInt(hex.slice(5,7)||'54',16),
    ];
  },

  start(mode) { if (mode) this.mode = mode; this.running = true; cancelAnimationFrame(this.animId); this._frame(); },
  stop()      { this.running = false; cancelAnimationFrame(this.animId); const r = this.canvas?.getBoundingClientRect(); if (r) this.ctx2d?.clearRect(0,0,r.width,r.height); },
  setMode(m)  { this.mode = m; if (m === 'off') { this.stop(); return; } if (Player?.isPlaying) this.start(m); },

  _frame() {
    if (!this.running) return;
    this.animId = requestAnimationFrame(() => this._frame());
    const r  = this.canvas.getBoundingClientRect();
    const w  = r.width, h = r.height;
    const c  = this.ctx2d;
    c.clearRect(0, 0, w, h);
    const acc = this._getAccent();
    const rgb = this._parseAccent(acc);
    const freq = AudioEngine.getFrequencyData();
    const wave = this.mode === 'wave' ? AudioEngine.getWaveformData() : null;
    if      (this.mode === 'bars')   this._bars(freq, w, h, rgb);
    else if (this.mode === 'wave')   this._wave(wave, w, h, acc);
    else if (this.mode === 'circle') this._circle(freq, w, h, rgb);
    else if (this.mode === 'mirror') this._mirror(freq, w, h, rgb);
  },

  _bars(data, w, h, [r,g,b]) {
    const n = 40, barW = (w / n) - 1.5;
    const step = Math.floor(data.length / n);
    for (let i = 0; i < n; i++) {
      let s = 0; for (let j = 0; j < step; j++) s += data[i*step+j];
      const avg = s / step, bh = (avg/255)*h*0.88;
      if (bh < 1) continue;
      const x = i * (barW + 1.5);
      const a = 0.32 + (avg/255)*0.68;
      const gr = this.ctx2d.createLinearGradient(0, h-bh, 0, h);
      gr.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0.08)`);
      this.ctx2d.fillStyle = gr;
      this.ctx2d.beginPath();
      this.ctx2d.roundRect(x, h-bh, barW, bh, [3,3,0,0]);
      this.ctx2d.fill();
    }
  },

  _wave(data, w, h, acc) {
    const c = this.ctx2d;
    c.beginPath();
    c.strokeStyle = acc;
    c.lineWidth   = 2.5;
    c.shadowColor = acc; c.shadowBlur = 8;
    const slice = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const y = ((data[i]/128) - 1) * (h*0.42) + h/2;
      i === 0 ? c.moveTo(0, y) : c.lineTo(i*slice, y);
    }
    c.globalAlpha = 0.78; c.stroke();
    c.globalAlpha = 1; c.shadowBlur = 0;
  },

  _circle(data, w, h, [r,g,b]) {
    const cx = w/2, cy = h/2, baseR = Math.min(w,h)*0.22;
    const n = 60, step = Math.floor(data.length / n);
    for (let i = 0; i < n; i++) {
      let s = 0; for (let j = 0; j < step; j++) s += data[i*step+j];
      const avg = s/step, len = (avg/255)*baseR;
      const angle = (i/n)*Math.PI*2 - Math.PI/2;
      const a = 0.35 + (avg/255)*0.65;
      this.ctx2d.beginPath();
      this.ctx2d.strokeStyle = `rgba(${r},${g},${b},${a})`;
      this.ctx2d.lineWidth = 2;
      this.ctx2d.moveTo(cx + Math.cos(angle)*baseR, cy + Math.sin(angle)*baseR);
      this.ctx2d.lineTo(cx + Math.cos(angle)*(baseR+len), cy + Math.sin(angle)*(baseR+len));
      this.ctx2d.stroke();
    }
    // centre glow
    const grd = this.ctx2d.createRadialGradient(cx,cy,0,cx,cy,baseR*0.5);
    grd.addColorStop(0, `rgba(${r},${g},${b},0.10)`);
    grd.addColorStop(1, 'transparent');
    this.ctx2d.fillStyle = grd;
    this.ctx2d.beginPath(); this.ctx2d.arc(cx,cy,baseR*0.5,0,Math.PI*2); this.ctx2d.fill();
  },

  _mirror(data, w, h, [r,g,b]) {
    const n = 50, barW = (w/n) - 1, mid = h/2;
    const step = Math.floor(data.length / n);
    for (let i = 0; i < n; i++) {
      let s = 0; for (let j = 0; j < step; j++) s += data[i*step+j];
      const avg = s/step, bh = (avg/255)*mid*0.88;
      if (bh < 1) continue;
      const x = i*(barW+1), a = 0.28 + (avg/255)*0.72;
      const gr = this.ctx2d.createLinearGradient(0,mid-bh,0,mid+bh);
      gr.addColorStop(0,   `rgba(${r},${g},${b},0.04)`);
      gr.addColorStop(0.5, `rgba(${r},${g},${b},${a})`);
      gr.addColorStop(1,   `rgba(${r},${g},${b},0.04)`);
      this.ctx2d.fillStyle = gr;
      this.ctx2d.beginPath(); this.ctx2d.roundRect(x,mid-bh,barW,bh*2,[2]); this.ctx2d.fill();
    }
  },
};
