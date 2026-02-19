/* ═══════════════════════════════════════════════════════
   Utils — shared helpers
   ═══════════════════════════════════════════════════════ */
const Utils = {

  formatTime(sec) {
    if (!sec || !isFinite(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  },

  sanitize(str) {
    if (!str) return '';
    return String(str).replace(/[<>&"']/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
    );
  },

  uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  },

  debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  },

  throttle(fn, ms) {
    let last = 0;
    return (...a) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...a); }
    };
  },

  greeting(name) {
    const h = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    return `Good ${part}${name ? `, ${name}` : ''}`;
  },

  // ── Toast ──────────────────────────────────────────────────────────────────
  toast(msg, ms = 2800) {
    let box = document.getElementById('toast-box');
    const el = Object.assign(document.createElement('div'), {
      className: 'toast', textContent: msg
    });
    box.appendChild(el);
    setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 320); }, ms);
  },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modal(title, bodyHTML, onOk, okLabel = 'OK', hideCancelBtn = false) {
    document.getElementById('modal-title').textContent   = title;
    document.getElementById('modal-body').innerHTML      = bodyHTML;
    document.getElementById('modal-ok').textContent      = okLabel;
    const cancelBtn = document.getElementById('modal-cancel');
    if (cancelBtn) cancelBtn.style.display = hideCancelBtn ? 'none' : '';
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    const close = () => overlay.classList.add('hidden');
    document.getElementById('modal-ok').onclick     = () => { onOk?.(); close(); };
    if (cancelBtn) cancelBtn.onclick                = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    setTimeout(() => overlay.querySelector('input,select')?.focus(), 60);
  },

  // ── Album art color extraction ─────────────────────────────────────────────
  async extractColor(dataUrl) {
    if (!dataUrl) return null;
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = Object.assign(document.createElement('canvas'), { width: 40, height: 40 });
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 40, 40);
        const px = ctx.getImageData(0, 0, 40, 40).data;
        const buckets = {};
        for (let i = 0; i < px.length; i += 16) {
          const lum = (px[i] * 299 + px[i+1] * 587 + px[i+2] * 114) / 1000;
          if (lum < 28 || lum > 228) continue;
          const r = Math.round(px[i] / 36) * 36;
          const g = Math.round(px[i+1] / 36) * 36;
          const b = Math.round(px[i+2] / 36) * 36;
          const k = `${r},${g},${b}`;
          buckets[k] = (buckets[k] || 0) + 1;
        }
        const top = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
        if (!top) { resolve(null); return; }
        let [r, g, b] = top[0].split(',').map(Number);
        const mx = Math.max(r, g, b);
        if (mx > 0) { const f = Math.min(255 / mx, 2.0); r = Math.min(255, r*f|0); g = Math.min(255, g*f|0); b = Math.min(255, b*f|0); }
        resolve(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  },

  applyAccent(hex) {
    if (!hex) return;
    document.documentElement.style.setProperty('--accent', hex);
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const dim = `#${(r*.72|0).toString(16).padStart(2,'0')}${(g*.72|0).toString(16).padStart(2,'0')}${(b*.72|0).toString(16).padStart(2,'0')}`;
    document.documentElement.style.setProperty('--accent-dim', dim);
    document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  },
};
