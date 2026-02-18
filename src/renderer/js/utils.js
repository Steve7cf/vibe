const Utils = {
  formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  sanitize(str) {
    if (!str) return '';
    return String(str).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  },

  showToast(msg, duration = 2800) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  showModal(title, body, onOk, okLabel = 'OK') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-ok').textContent = okLabel;
    document.getElementById('modal-overlay').classList.remove('hidden');
    const close = () => document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-ok').onclick = () => { onOk && onOk(); close(); };
    document.getElementById('modal-cancel').onclick = close;
    document.getElementById('modal-overlay').onclick = (e) => { if (e.target.id === 'modal-overlay') close(); };
    setTimeout(() => document.getElementById('modal-body').querySelector('input')?.focus(), 60);
  },

  extensionToFormat(p) {
    return (p || '').split('.').pop().toUpperCase() || '?';
  },

  // Extract dominant color from an image data URL using canvas
  extractColors(dataUrl) {
    return new Promise((resolve) => {
      if (!dataUrl) { resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 64);
        const data = ctx.getImageData(0, 0, 64, 64).data;
        // Sample pixels, bucket colors
        const buckets = {};
        for (let i = 0; i < data.length; i += 16) {
          const r = Math.round(data[i] / 32) * 32;
          const g = Math.round(data[i+1] / 32) * 32;
          const b = Math.round(data[i+2] / 32) * 32;
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 20 || brightness > 235) continue; // skip near-black/white
          const key = `${r},${g},${b}`;
          buckets[key] = (buckets[key] || 0) + 1;
        }
        const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) { resolve(null); return; }
        const [r, g, b] = sorted[0][0].split(',').map(Number);
        // Make it more vivid
        const max = Math.max(r, g, b);
        const factor = max > 0 ? Math.min(255 / max, 2.5) : 1;
        const vr = Math.min(255, Math.round(r * factor));
        const vg = Math.min(255, Math.round(g * factor));
        const vb = Math.min(255, Math.round(b * factor));
        resolve({ r: vr, g: vg, b: vb, hex: `#${vr.toString(16).padStart(2,'0')}${vg.toString(16).padStart(2,'0')}${vb.toString(16).padStart(2,'0')}` });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  },

  applyThemeColor(hex) {
    if (!hex) return;
    document.documentElement.style.setProperty('--accent', hex);
  },

  restoreThemeColor() {
    const cfg = App?.config;
    const color = cfg?.accentColor || '#1db954';
    document.documentElement.style.setProperty('--accent', color);
  }
};
