/**
 * Vibe — Visualizer Controller
 * Canvas-based audio visualizer with multiple modes
 */

export class VisualizerController {
  constructor(audio) {
    this.audio = audio;
    this.canvas = document.getElementById('visualizer-canvas');
    this.ctx = this.canvas?.getContext('2d');
    this.mode = 'bars'; // bars | wave | circle
    this.animId = null;
    this.isRunning = false;
  }

  start() {
    if (!this.canvas || !this.ctx) return;
    if (this.isRunning) return;
    this.isRunning = true;
    this.draw();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
  }

  cycleMode() {
    const modes = ['bars', 'wave', 'circle', 'off'];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    if (this.mode === 'off') this.stop();
    else this.start();
  }

  draw() {
    if (!this.isRunning) return;
    this.animId = requestAnimationFrame(() => this.draw());

    const data = this.audio.getAnalyserData();
    if (!data) return;

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    switch (this.mode) {
      case 'bars': this.drawBars(data, width, height); break;
      case 'wave': this.drawWave(width, height); break;
      case 'circle': this.drawCircle(data, width, height); break;
    }
  }

  drawBars(data, w, h) {
    const barCount = 48;
    const barWidth = (w / barCount) - 1;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1db954';

    for (let i = 0; i < barCount; i++) {
      const dataIdx = Math.floor(i * data.length / barCount);
      const val = data[dataIdx] / 255;
      const barH = val * h;

      const gradient = this.ctx.createLinearGradient(0, h, 0, h - barH);
      gradient.addColorStop(0, accent + 'aa');
      gradient.addColorStop(1, accent + 'ff');

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(i * (barWidth + 1), h - barH, barWidth, barH);
    }
  }

  drawWave(w, h) {
    const data = this.audio.getWaveformData();
    if (!data) return;

    this.ctx.beginPath();
    this.ctx.strokeStyle = '#1db954';
    this.ctx.lineWidth = 2;

    const sliceW = w / data.length;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128 - 1;
      const y = (v * h / 2) + h / 2;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
      x += sliceW;
    }

    this.ctx.stroke();
  }

  drawCircle(data, w, h) {
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.3;
    const accent = '#1db954';

    this.ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const angle = (i / data.length) * Math.PI * 2;
      const r = radius + (data[i] / 255) * (radius * 0.8);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }

    this.ctx.closePath();
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }
}
