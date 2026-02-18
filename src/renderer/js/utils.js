/**
 * Vibe — Utility Functions
 */

export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${pad(m % 60)}:${pad(s % 60)}`;
  return `${m}:${pad(s % 60)}`;
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString();
}

function pad(n) { return String(n).padStart(2, '0'); }

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function artworkOrPlaceholder(artworkUrl, iconSize = 32, extraStyle = '') {
  if (artworkUrl) {
    return `<img src="${artworkUrl}" alt="artwork" style="width:100%;height:100%;object-fit:cover;${extraStyle}" />`;
  }
  return `
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);${extraStyle}">
      <svg viewBox="0 0 24 24" style="width:${iconSize}px;height:${iconSize}px;">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill="currentColor"/>
      </svg>
    </div>`;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatTrackMeta(track) {
  const parts = [];
  if (track.artist) parts.push(track.artist);
  if (track.album) parts.push(track.album);
  if (track.year) parts.push(track.year);
  return parts.join(' • ');
}
