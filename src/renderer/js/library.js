/* ═══════════════════════════════════════════════════════════════════
   Library — incremental scan · batch metadata · FTS search
   prediction engine · skip/listen tracking · O(1) lookups
   ═══════════════════════════════════════════════════════════════════ */
const Library = {
  tracks:         [],
  playlists:      [],
  recentIds:      [],
  likedIds:       new Set(),
  playCount:      {},
  lastPlayedAt:   {},
  skipCount:      {},
  listenDuration: {},
  fileStats:      {},

  _byId:   new Map(),
  _byPath: new Map(),
  _ftsIdx: null,

  // ── Init ─────────────────────────────────────────────────────────────────
  async init() {
    const d = await window.vibeAPI.getLibrary();
    this.tracks         = d.tracks         || [];
    this.playlists      = d.playlists      || [];
    this.recentIds      = d.recentIds      || [];
    this.likedIds       = new Set(d.likedIds || []);
    this.playCount      = d.playCount      || {};
    this.lastPlayedAt   = d.lastPlayedAt   || {};
    this.skipCount      = d.skipCount      || {};
    this.listenDuration = d.listenDuration || {};
    this.fileStats      = d.fileStats      || {};
    this._reindex();
  },

  _reindex() {
    this._byId.clear(); this._byPath.clear(); this._ftsIdx = null;
    for (const t of this.tracks) { this._byId.set(t.id, t); this._byPath.set(t.path, t); }
  },

  // ── Persistence — debounced, atomic ──────────────────────────────────────
  _saveTimer: null,
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => window.vibeAPI.saveLibrary({
      tracks: this.tracks, playlists: this.playlists, recentIds: this.recentIds,
      likedIds: [...this.likedIds], playCount: this.playCount,
      lastPlayedAt: this.lastPlayedAt, skipCount: this.skipCount,
      listenDuration: this.listenDuration, fileStats: this.fileStats,
    }), 800);
  },

  // ── Incremental folder scan ───────────────────────────────────────────────
  async scanFolders(folders) {
    const { added, changed, removed, fileStats } =
      await window.vibeAPI.scanIncremental({ folders, fileStats: this.fileStats });
    this.fileStats = fileStats;

    if (removed.length) {
      const gone = new Set(removed);
      this.tracks = this.tracks.filter(t => !gone.has(t.path));
    }

    if (changed.length) {
      const metas = await window.vibeAPI.readMetaBatch(changed);
      for (const m of metas) {
        const existing = this._byPath.get(m.path);
        if (existing) Object.assign(existing, m);
      }
    }

    const newFiles = added.filter(p => !this._byPath.has(p));
    if (newFiles.length) {
      const BATCH = 50;
      for (let i = 0; i < newFiles.length; i += BATCH) {
        const slice = newFiles.slice(i, i + BATCH);
        const metas = await window.vibeAPI.readMetaBatch(slice);
        for (let j = 0; j < slice.length; j++) {
          const m = metas[j]; if (!m) continue;
          if (!m.duration) m.duration = await this._probeDur(`file://${m.path}`);
          m.id = Utils.uid(); m.addedAt = Date.now();
          this.tracks.push(m);
          this._byId.set(m.id, m); this._byPath.set(m.path, m);
        }
      }
      this._ftsIdx = null;
    }

    const delta = newFiles.length + changed.length + removed.length;
    if (delta > 0) { this._reindex(); this.save(); }
    return { added: newFiles.length, changed: changed.length, removed: removed.length };
  },

  async addFiles(paths) {
    const fresh = paths.filter(p => !this._byPath.has(p));
    if (!fresh.length) return [];
    const metas = await window.vibeAPI.readMetaBatch(fresh);
    const added = [];
    for (let i = 0; i < fresh.length; i++) {
      const m = metas[i]; if (!m) continue;
      if (!m.duration) m.duration = await this._probeDur(`file://${m.path}`);
      m.id = Utils.uid(); m.addedAt = Date.now();
      this.tracks.push(m);
      this._byId.set(m.id, m); this._byPath.set(m.path, m);
      added.push(m);
    }
    if (added.length) { this._ftsIdx = null; this.save(); }
    return added;
  },

  async scanFolder(folder) { return this.scanFolders([folder]); },

  _probeDur(url) {
    return new Promise(res => {
      const a = new Audio(); a.preload = 'metadata';
      a.onloadedmetadata = () => { res(a.duration || 0); a.src = ''; };
      a.onerror = () => res(0); a.src = url;
      setTimeout(() => res(0), 4000);
    });
  },

  removeTrack(id) {
    const track = this._byId.get(id);
    if (track) {
      // Also remove from fileStats so incremental scan doesn't re-add it
      delete this.fileStats[track.path];
    }
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.playlists.forEach(pl => { pl.tracks = pl.tracks.filter(i => i !== id); });
    this.recentIds = this.recentIds.filter(i => i !== id);
    delete this.playCount[id];
    delete this.lastPlayedAt[id];
    delete this.skipCount[id];
    delete this.listenDuration[id];
    this._reindex(); this._ftsIdx = null; this.save();
  },

  findDuplicates() {
    const seen = new Map(), dups = [];
    for (const t of this.tracks) {
      const key = `${(t.title || '').toLowerCase()}|||${(t.artist || '').toLowerCase()}`;
      if (seen.has(key)) dups.push([seen.get(key), t]);
      else seen.set(key, t);
    }
    return dups;
  },

  // ── FTS Search — inverted index, O(tokens) build, O(terms * prefix_matches) search ──
  _buildFTS() {
    const idx = new Map();
    for (const t of this.tracks) {
      const tokens = [t.title, t.artist, t.album, t.genre].filter(Boolean)
        .join(' ').toLowerCase().split(/[\s\-_,.]+/).filter(s => s.length > 1);
      for (const tok of tokens) {
        if (!idx.has(tok)) idx.set(tok, new Set());
        idx.get(tok).add(t.id);
      }
    }
    this._ftsIdx = idx;
  },

  search(q) {
    if (!q?.trim()) return this.tracks;
    if (!this._ftsIdx) this._buildFTS();
    const terms = q.toLowerCase().trim().split(/\s+/).filter(s => s.length > 1);
    if (!terms.length) return this.tracks;

    // For each term: collect all token keys that start with this term (prefix scan),
    // union their id sets. Then intersect across terms. Avoids full O(n²) cross-product.
    let ids = null;
    for (const term of terms) {
      const hit = new Set();
      for (const [tok, idSet] of this._ftsIdx) {
        if (tok.startsWith(term)) { for (const id of idSet) hit.add(id); }
      }
      ids = ids === null ? hit : new Set([...ids].filter(id => hit.has(id)));
      if (ids.size === 0) break; // short-circuit — no results possible
    }
    return ids ? this.tracks.filter(t => ids.has(t.id)) : [];
  },

  // ── Play & skip tracking ──────────────────────────────────────────────────
  // recentIds capped at 200 (double the display limit) — enough for smart queries
  // without unbounded growth in library.json
  recordPlay(id) {
    if (!id) return;
    this.playCount[id]    = (this.playCount[id]    || 0) + 1;
    this.lastPlayedAt[id] = Date.now();
    this.recentIds = [id, ...this.recentIds.filter(i => i !== id)].slice(0, 200);
    this.save();
  },

  recordSkip(id, listenedSecs = 0) {
    if (!id) return;
    this.skipCount[id] = (this.skipCount[id] || 0) + 1;
    if (listenedSecs > 5) this.listenDuration[id] = (this.listenDuration[id] || 0) + listenedSecs;
    this.save();
  },

  recordListenEnd(id, secs) {
    if (!id || secs < 5) return;
    this.listenDuration[id] = (this.listenDuration[id] || 0) + secs;
    this.save();
  },

  toggleLike(id) {
    this.likedIds.has(id) ? this.likedIds.delete(id) : this.likedIds.add(id);
    this.save(); return this.likedIds.has(id);
  },

  // ── Queries ───────────────────────────────────────────────────────────────
  // getRecentlyAdded: sorted copy — O(n log n) but only called on demand, not in hot path
  getRecentlyPlayed() { return this.recentIds.map(id => this._byId.get(id)).filter(Boolean); },
  getRecentlyAdded()  { return [...this.tracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); },
  getMostPlayed()     {
    return [...this.tracks]
      .filter(t => (this.playCount[t.id] || 0) > 0)
      .sort((a, b) => (this.playCount[b.id] || 0) - (this.playCount[a.id] || 0));
  },
  getLiked() { return this.tracks.filter(t => this.likedIds.has(t.id)); },

  // ── On-Device Prediction Engine ──────────────────────────────────────────
  _score(t, hour, now) {
    const id     = t.id;
    const plays  = this.playCount[id]      || 0;
    const skips  = this.skipCount[id]      || 0;
    const listen = this.listenDuration[id] || 0;
    const dur    = t.duration              || 180;
    let s = 0;

    s += Math.log1p(plays) * 8;
    if (plays > 0) s -= (skips / Math.max(1, plays)) * 22;
    else if (skips > 0) s -= skips * 6;
    if (plays > 0) s += Math.min((listen / plays) / dur, 1) * 14;
    if (this.likedIds.has(id)) s += 20;

    const days = (now - (this.lastPlayedAt[id] || 0)) / 86400000;
    if      (days < 0.08) s -= 60;
    else if (days < 1)    s += 14;
    else if (days < 4)    s += 9;
    else if (days < 14)   s += 4;
    else if (days > 180)  s -= 5;

    const e  = this._energy(t);
    const te = hour<6?0.3:hour<9?0.9:hour<12?1.5:hour<14?1.8:hour<17?1.3:hour<20?1.6:0.7;
    s += (2 - Math.abs(e - te)) * 6;
    return s;
  },

  predictNext(currentId, excludeIds = new Set()) {
    const now = Date.now(), hour = new Date().getHours();
    const cur  = currentId ? this._byId.get(currentId) : null;
    const pool = this.tracks.filter(t => t.id !== currentId && !excludeIds.has(t.id));
    if (!pool.length) return null;

    const scored = pool.map(t => {
      let s = this._score(t, hour, now);
      if (cur?.artist && t.artist === cur.artist) s -= 8;
      s += Math.random() * 12;
      return { t, s };
    }).sort((a, b) => b.s - a.s);

    const top   = scored.slice(0, 10);
    const total = top.reduce((acc, x) => acc + Math.max(0.1, x.s + 100), 0);
    let r = Math.random() * total;
    for (const { t, s } of top) { r -= Math.max(0.1, s + 100); if (r <= 0) return t; }
    return top[0]?.t || null;
  },

  _energy(t) {
    let e = 1.0;
    const br = t.bitrate || 128;
    if      (br >= 320) e += 0.5;
    else if (br >= 256) e += 0.35;
    else if (br >= 192) e += 0.15;
    else if (br <= 96)  e -= 0.3;
    const dur = t.duration || 210;
    if      (dur < 120)  e += 0.3;
    else if (dur < 200)  e += 0.2;
    else if (dur >= 360) e -= 0.4;
    else if (dur >= 300) e -= 0.15;
    if ((t.sampleRate || 44100) >= 48000) e += 0.1;
    const g = (t.genre || '').toLowerCase();
    if (/edm|electronic|dance|techno|house|metal|punk|hip.hop|rap|funk|disco|trance|dubstep/.test(g)) e += 0.5;
    if (/ambient|classical|acoustic|sleep|chill|lo.fi|jazz|blues|folk|ballad|relaxing|piano/.test(g))  e -= 0.5;
    const tl = (t.title || '').toLowerCase();
    if (/remix|club|rave|banger|workout|pump|hype|anthem|drop/.test(tl)) e += 0.25;
    if (/acoustic|unplugged|slow|ballad|sleep|soft|gentle/.test(tl))     e -= 0.25;
    return Math.max(0, Math.min(2, e));
  },

  // ── Today Mix ─────────────────────────────────────────────────────────────
  getTodayMix(count = 20) {
    if (!this.tracks.length) return [];
    if (this.tracks.length <= count) return this._arcSort([...this.tracks]);
    const now = Date.now(), hour = new Date().getHours();
    const V = hour < 6  ? { e: 0.2, arc: 'flat', g: ['ambient','lo-fi','chill','sleep','jazz','classical'] }
            : hour < 9  ? { e: 1.0, arc: 'up',   g: ['acoustic','folk','indie','pop','jazz'] }
            : hour < 12 ? { e: 1.5, arc: 'up',   g: ['pop','rock','indie','funk','hip hop','electronic'] }
            : hour < 14 ? { e: 1.8, arc: 'flat', g: ['pop','rock','hip hop','electronic','dance','funk'] }
            : hour < 17 ? { e: 1.3, arc: 'wave', g: ['pop','indie','r&b','soul','hip hop'] }
            : hour < 20 ? { e: 1.7, arc: 'wave', g: ['rock','hip hop','electronic','dance','funk'] }
            :              { e: 0.7, arc: 'down', g: ['r&b','soul','jazz','lo-fi','indie','chill','blues'] };

    const scored = this.tracks.map(t => {
      let s = Math.random() * 15;
      const days = (now - (this.lastPlayedAt[t.id] || 0)) / 86400000;
      if      (days < 0.08) s -= 80;
      else if (days < 1)    s += 25;
      else if (days < 4)    s += 18;
      else if (days < 14)   s += 10;
      else if (days > 90)   s -= 8;
      s += Math.min((this.playCount[t.id] || 0) * 5, 35);
      if (this.likedIds.has(t.id)) s += 30;
      const sk = this.skipCount[t.id] || 0, pl = Math.max(1, this.playCount[t.id] || 1);
      s -= (sk / pl) * 15;
      const g = (t.genre || '').toLowerCase();
      if (V.g.some(m => g.includes(m))) s += 22;
      const en = this._energy(t);
      s += (2 - Math.abs(en - V.e)) * 12;
      return { t, s, en };
    }).sort((a, b) => b.s - a.s);

    const pool = scored.slice(0, Math.min(60, scored.length));
    const mix = [], ua = {}, ug = {};
    for (const { t, en } of pool) {
      if (mix.length >= count) break;
      const a = (t.artist || '?').toLowerCase().slice(0, 20);
      const g = (t.genre  || '?').toLowerCase().slice(0, 12);
      if ((ua[a] || 0) >= 2 || (ug[g] || 0) >= 3) continue;
      ua[a] = (ua[a] || 0) + 1; ug[g] = (ug[g] || 0) + 1;
      mix.push({ t, en });
    }
    for (const item of pool) {
      if (mix.length >= count) break;
      if (!mix.find(m => m.t === item.t)) mix.push(item);
    }
    return this._sort(mix.map(m => m.t), mix.map(m => m.en), V.arc);
  },

  _sort(tracks, energies, arc) {
    const p = tracks.map((t, i) => ({ t, e: energies[i] }));
    if (arc === 'up')   { p.sort((a, b) => a.e - b.e); return p.map(x => x.t); }
    if (arc === 'down') { p.sort((a, b) => b.e - a.e); return p.map(x => x.t); }
    if (arc === 'wave') {
      p.sort((a, b) => a.e - b.e);
      const m = Math.ceil(p.length / 2);
      return [...p.slice(0, m), ...p.slice(m).reverse()].map(x => x.t);
    }
    p.sort((a, b) => a.e - b.e);
    const r = []; let lo = 0, hi = p.length - 1, t = 0;
    while (lo <= hi) { r.push(t++ % 2 === 0 ? p[lo++] : p[hi--]); }
    return r.map(x => x.t);
  },

  _arcSort(tracks) {
    const h = new Date().getHours(), arc = h < 9 ? 'up' : h >= 20 ? 'down' : 'flat';
    return this._sort(tracks, tracks.map(t => this._energy(t)), arc);
  },

  // ── Grouping ──────────────────────────────────────────────────────────────
  _group(key, label) {
    const map = {};
    for (const t of this.tracks) {
      const k = key(t) || label || 'Unknown';
      if (!map[k]) map[k] = { name: k, tracks: [], artwork: null };
      map[k].tracks.push(t);
      if (!map[k].artwork && t.artwork) map[k].artwork = t.artwork;
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  },
  getByArtist() { return this._group(t => t.artist, 'Unknown Artist'); },
  getByAlbum() {
    const map = {};
    for (const t of this.tracks) {
      const k = `${t.album || '?'}__${t.artist || '?'}`;
      if (!map[k]) map[k] = { name: t.album || 'Unknown Album', artist: t.artist || 'Unknown Artist', tracks: [], artwork: null };
      map[k].tracks.push(t);
      if (!map[k].artwork && t.artwork) map[k].artwork = t.artwork;
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  },
  getByGenre() { return this._group(t => t.genre, 'Unknown'); },

  // ── Playlists ──────────────────────────────────────────────────────────────
  createPlaylist(name) {
    const p = { id: Utils.uid(), name, tracks: [], created: Date.now() };
    this.playlists.push(p); this.save(); return p;
  },
  addToPlaylist(plId, tid) {
    const p = this.playlists.find(x => x.id === plId);
    if (p && !p.tracks.includes(tid)) { p.tracks.push(tid); this.save(); }
  },
  removeFromPlaylist(plId, tid) {
    const p = this.playlists.find(x => x.id === plId);
    if (p) { p.tracks = p.tracks.filter(i => i !== tid); this.save(); }
  },
  deletePlaylist(id) { this.playlists = this.playlists.filter(p => p.id !== id); this.save(); },
  getPlaylistTracks(id) {
    const p = this.playlists.find(x => x.id === id);
    return p ? p.tracks.map(id => this._byId.get(id)).filter(Boolean) : [];
  },
  async exportPlaylist(id) {
    const p = this.playlists.find(x => x.id === id); if (!p) return;
    await window.vibeAPI.exportPlaylist({ name: p.name, tracks: this.getPlaylistTracks(id) });
    Utils.toast('Playlist exported');
  },
  async importPlaylist() {
    const paths = await window.vibeAPI.importPlaylist();
    if (!paths?.length) return null;
    const p = this.createPlaylist('Imported');
    const a = await this.addFiles(paths);
    a.forEach(t => p.tracks.push(t.id));
    this.save(); return p;
  },
};
