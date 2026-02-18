/**
 * Vibe — Library Manager
 * Handles scanning, organizing, and managing the music library
 */

import { formatTime } from './utils.js';

export class LibraryManager {
  constructor(state, audio, queue) {
    this.state = state;
    this.audio = audio;
    this.queue = queue;
    this._scanning = false;

    // Use onclick (not addEventListener) so re-instantiation never stacks listeners
    const addBtn = document.getElementById('btn-add-files');
    const scanBtn = document.getElementById('btn-scan-folder');
    if (addBtn) addBtn.onclick = () => this.addFiles();
    if (scanBtn) scanBtn.onclick = () => this.scanNewFolder();
  }

  // ── Scanning ──────────────────────────────────────────────────────
  async addFiles() {
    if (this._scanning) return;
    this._scanning = true;
    const paths = await window.vibeAPI.invoke('dialog:openFiles');
    this._scanning = false;
    if (!paths.length) return;

    this.showLoading('Loading files...');
    const newTracks = [];
    const library = this.state.get('library');
    const existingPaths = new Set(library.map(t => t.path));

    for (const p of paths) {
      if (existingPaths.has(p)) continue;
      const meta = await window.vibeAPI.invoke('library:getMetadata', p);
      newTracks.push(meta);
    }

    if (newTracks.length) {
      const updated = [...library, ...newTracks];
      this.state.set('library', updated);
      await this.state.persistLibrary();
      this.hideLoading();
      this.notifyChange();
      window.dispatchEvent(new CustomEvent('library:updated'));
    } else {
      this.hideLoading();
    }
  }

  async scanNewFolder() {
    if (this._scanning) return;
    this._scanning = true;
    const folder = await window.vibeAPI.invoke('dialog:openFolder');
    this._scanning = false;
    if (!folder) return;

    // Add to config
    const folders = [...(this.state.getConfig('library.folders') || [])];
    if (!folders.includes(folder)) {
      folders.push(folder);
      this.state.updateConfig('library.folders', folders);
    }

    await this.scanFolders([folder]);
  }

  async scanFolders(folders) {
    if (!folders.length) return;
    this.showLoading(`Scanning ${folders.length} folder(s)...`);

    try {
      const scanned = await window.vibeAPI.invoke('library:scanMultiple', folders);
      const library = this.state.get('library');
      const existingPaths = new Set(library.map(t => t.path));
      const newTracks = scanned.filter(t => !existingPaths.has(t.path));

      if (newTracks.length) {
        const updated = [...library, ...newTracks];
        this.state.set('library', updated);
        await this.state.persistLibrary();
        this.notifyChange();
        window.dispatchEvent(new CustomEvent('library:updated'));
      }
    } catch (e) {
      console.error('Scan error:', e);
    } finally {
      this.hideLoading();
    }
  }

  // ── Organization ──────────────────────────────────────────────────
  getByArtist() {
    const library = this.state.get('library');
    const map = new Map();
    for (const t of library) {
      if (!map.has(t.artist)) map.set(t.artist, []);
      map.get(t.artist).push(t);
    }
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  getByAlbum() {
    const library = this.state.get('library');
    const map = new Map();
    for (const t of library) {
      const key = `${t.artist}::${t.album}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          album: t.album,
          artist: t.artist,
          artwork: t.artwork,
          year: t.year,
          tracks: [],
        });
      }
      map.get(key).tracks.push(t);
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
  }

  getByGenre() {
    const library = this.state.get('library');
    const map = new Map();
    for (const t of library) {
      const g = t.genre || 'Unknown';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(t);
    }
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  getSorted(field = 'title', dir = 'asc') {
    const library = [...this.state.get('library')];
    library.sort((a, b) => {
      let va = a[field] || '';
      let vb = b[field] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return library;
  }

  search(query) {
    if (!query) return this.state.get('library');
    const q = query.toLowerCase();
    return this.state.get('library').filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.artist?.toLowerCase().includes(q) ||
      t.album?.toLowerCase().includes(q) ||
      t.genre?.toLowerCase().includes(q)
    );
  }

  removeTrack(trackPath) {
    const library = this.state.get('library').filter(t => t.path !== trackPath);
    this.state.set('library', library);
    this.state.persistLibrary();
    window.dispatchEvent(new CustomEvent('library:updated'));
  }

  // ── Helpers ───────────────────────────────────────────────────────
  showLoading(text = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    if (overlay) overlay.classList.remove('hidden');
    if (textEl) textEl.textContent = text;
  }

  hideLoading() {
    document.getElementById('loading-overlay')?.classList.add('hidden');
  }

  notifyChange() {
    const count = this.state.get('library').length;
    console.log(`Library: ${count} tracks`);
  }
}
