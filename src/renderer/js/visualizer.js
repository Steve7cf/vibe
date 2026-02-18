const Visualizer = {
  canvas: null,
  ctx: null,
  mode: 'bars',
  animId: null,
  running: false,

  init() {
    this.canvas = document.getElementById('visualizer');
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  },

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  },

  start(mode) {
    if (mode) this.mode = mode;
    this.running = true;
    cancelAnimationFrame(this.animId);
    this._frame();
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animId);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  setMode(mode) {
    this.mode = mode;
    if (mode === 'off') { this.stop(); return; }
    if (!this.running) this.start(mode);
  },

  _frame() {
    if (!this.running) return;
    this.animId = requestAnimationFrame(() => this._frame());
    const data = AudioEngine.getAnalyserData('frequency');
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1db954';

    if (this.mode === 'bars') this._drawBars(data, w, h, accent);
    else if (this.mode === 'wave') this._drawWave(w, h, accent);
    else if (this.mode === 'circle') this._drawCircle(data, w, h, accent);
  },

  _drawBars(data, w, h, accent) {
    const bars = 48;
    const barW = w / bars - 1;
    const step = Math.floor(data.length / bars);
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j];
      const avg = sum / step;
      const bh = (avg / 255) * h * 0.9;
      const x = i * (barW + 1);
      const alpha = 0.4 + (avg / 255) * 0.6;
      this.ctx.fillStyle = accent;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillRect(x, h - bh, barW, bh);
    }
    this.ctx.globalAlpha = 1;
  },

  _drawWave(w, h, accent) {
    const data = AudioEngine.getAnalyserData('waveform');
    this.ctx.beginPath();
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 0.7;
    const slice = w / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
      x += slice;
    }
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  },

  _drawCircle(data, w, h, accent) {
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.25;
    const bars = 64;
    const step = Math.floor(data.length / bars);
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j];
      const avg = sum / step;
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const len = (avg / 255) * radius * 0.8;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + len);
      const y2 = cy + Math.sin(angle) * (radius + len);
      this.ctx.beginPath();
      this.ctx.strokeStyle = accent;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = 0.5 + (avg / 255) * 0.5;
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;
  }
};
