/* ═══════════════════════════════════════════════════════
   Library — tracks, playlists, play stats, Today Mix
   ═══════════════════════════════════════════════════════ */
const Library = {
  tracks: [],
  playlists: [],
  recentIds: [],
  likedIds: new Set(),
  playCount: {},
  lastPlayedAt: {},

  async init() {
    const d = await window.vibeAPI.getLibrary();
    this.tracks       = d.tracks       || [];
    this.playlists    = d.playlists    || [];
    this.recentIds    = d.recentIds    || [];
    this.likedIds     = new Set(d.likedIds || []);
    this.playCount    = d.playCount    || {};
    this.lastPlayedAt = d.lastPlayedAt || {};
  },

  _saveTimer: null,
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      window.vibeAPI.saveLibrary({
        tracks:       this.tracks,
        playlists:    this.playlists,
        recentIds:    this.recentIds,
        likedIds:     [...this.likedIds],
        playCount:    this.playCount,
        lastPlayedAt: this.lastPlayedAt,
      });
    }, 800);
  },

  // ── Add / scan ─────────────────────────────────────────────────────────────
  async addFiles(paths) {
    const added = [];
    for (const p of paths) {
      if (this.tracks.find(t => t.path === p)) continue;
      try {
        const meta = await window.vibeAPI.readMetadata(p);
        meta.id      = Utils.uid();
        meta.addedAt = Date.now();
        // If duration is 0 or missing, probe with Audio element
        if (!meta.duration || meta.duration === 0) {
          meta.duration = await this._probeDuration(`file://${p}`);
        }
        // If title still unknown, use filename
        if (!meta.title || meta.title === 'Unknown' || meta.title === path) {
          meta.title = p.split(/[\/]/).pop().replace(/\.[^.]+$/, '');
        }
        this.tracks.push(meta);
        added.push(meta);
      } catch(e) { console.warn('[Library] meta fail', p); }
    }
    if (added.length) this.save();
    return added;
  },

  _probeDuration(url) {
    return new Promise(resolve => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { resolve(a.duration || 0); a.src = ''; };
      a.onerror = () => { resolve(0); };
      a.src = url;
      // Timeout fallback
      setTimeout(() => resolve(0), 5000);
    });
  },

  async scanFolder(folder) {
    const files = await window.vibeAPI.scanFolder(folder);
    return this.addFiles(files);
  },

  removeTrack(id) {
    this.tracks    = this.tracks.filter(t => t.id !== id);
    this.playlists.forEach(pl => { pl.tracks = pl.tracks.filter(i => i !== id); });
    this.recentIds = this.recentIds.filter(i => i !== id);
    delete this.playCount[id];
    delete this.lastPlayedAt[id];
    this.save();
  },

  search(q) {
    if (!q) return this.tracks;
    const s = q.toLowerCase();
    return this.tracks.filter(t =>
      (t.title  || '').toLowerCase().includes(s) ||
      (t.artist || '').toLowerCase().includes(s) ||
      (t.album  || '').toLowerCase().includes(s) ||
      (t.genre  || '').toLowerCase().includes(s)
    );
  },

  // ── Play tracking ──────────────────────────────────────────────────────────
  recordPlay(id) {
    this.playCount[id]    = (this.playCount[id] || 0) + 1;
    this.lastPlayedAt[id] = Date.now();
    this.recentIds = [id, ...this.recentIds.filter(i => i !== id)].slice(0, 80);
    this.save();
  },

  toggleLike(id) {
    this.likedIds.has(id) ? this.likedIds.delete(id) : this.likedIds.add(id);
    this.save();
    return this.likedIds.has(id);
  },

  // ── Queries ────────────────────────────────────────────────────────────────
  getRecentlyPlayed(n = 12) {
    return this.recentIds.slice(0, n)
      .map(id => this.tracks.find(t => t.id === id)).filter(Boolean);
  },

  getRecentlyAdded(n = 12) {
    return [...this.tracks]
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      .slice(0, n);
  },

  getMostPlayed(n = 12) {
    return [...this.tracks]
      .filter(t => (this.playCount[t.id] || 0) > 0)
      .sort((a, b) => (this.playCount[b.id] || 0) - (this.playCount[a.id] || 0))
      .slice(0, n);
  },

  getLiked() {
    return this.tracks.filter(t => this.likedIds.has(t.id));
  },

  // ── Today Mix ─────────────────────────────────────────────────────────────
  // Smart daily playlist: recency + frequency + liked + time-of-day mood + genre variety
  getTodayMix(count = 10) {
    if (!this.tracks.length) return [];
    if (this.tracks.length <= count) return this._shuffled([...this.tracks]);

    const now  = Date.now();
    const hour = new Date().getHours();

    // Mood genre preferences by time of day
    const moodGenres = hour < 10
      ? ['acoustic', 'folk', 'jazz', 'classical', 'ambient', 'indie']
      : hour < 18
        ? ['pop', 'rock', 'hip hop', 'electronic', 'r&b', 'dance', 'funk']
        : ['r&b', 'soul', 'jazz', 'lo-fi', 'indie', 'alternative', 'chill'];

    const scored = this.tracks.map(t => {
      let score = Math.random() * 28;   // controlled randomness

      const days = (now - (this.lastPlayedAt[t.id] || 0)) / 86400000;
      if      (days < 0.1) score -= 55; // played very recently — suppress
      else if (days < 1)   score += 35; // played today (not last hour)
      else if (days < 7)   score += 18; // this week
      else if (days < 30)  score += 6;  // this month
      else                 score -= 4;  // stale

      // Popularity
      score += Math.min((this.playCount[t.id] || 0) * 3, 28);

      // Liked
      if (this.likedIds.has(t.id)) score += 22;

      // Mood match
      const g = (t.genre || '').toLowerCase();
      if (moodGenres.some(m => g.includes(m))) score += 18;

      return { track: t, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Genre variety: max 3 per genre from top-30 pool
    const pool = scored.slice(0, Math.min(30, scored.length));
    const mix = [];
    const usedGenres = {};

    for (const { track: t } of pool) {
      if (mix.length >= count) break;
      const g = (t.genre || 'unknown').toLowerCase();
      if ((usedGenres[g] || 0) >= 3) continue;
      usedGenres[g] = (usedGenres[g] || 0) + 1;
      mix.push(t);
    }
    // Fill gaps
    for (const { track: t } of pool) {
      if (mix.length >= count) break;
      if (!mix.includes(t)) mix.push(t);
    }

    return this._shuffled(mix);
  },

  _shuffled(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  // ── Grouping ───────────────────────────────────────────────────────────────
  getByArtist() {
    const map = {};
    this.tracks.forEach(t => {
      const k = t.artist || 'Unknown Artist';
      if (!map[k]) map[k] = { name: k, tracks: [], artwork: null };
      map[k].tracks.push(t);
      if (!map[k].artwork && t.artwork) map[k].artwork = t.artwork;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  },

  getByAlbum() {
    const map = {};
    this.tracks.forEach(t => {
      const k = `${t.album || '?'}__${t.artist || '?'}`;
      if (!map[k]) map[k] = { name: t.album || 'Unknown Album', artist: t.artist || 'Unknown Artist', tracks: [], artwork: null };
      map[k].tracks.push(t);
      if (!map[k].artwork && t.artwork) map[k].artwork = t.artwork;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  },

  getByGenre() {
    const map = {};
    this.tracks.forEach(t => {
      const k = t.genre || 'Unknown';
      if (!map[k]) map[k] = { name: k, tracks: [], artwork: null };
      map[k].tracks.push(t);
      if (!map[k].artwork && t.artwork) map[k].artwork = t.artwork;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  },

  // ── Playlists ──────────────────────────────────────────────────────────────
  createPlaylist(name) {
    const pl = { id: Utils.uid(), name, tracks: [], created: Date.now() };
    this.playlists.push(pl);
    this.save();
    return pl;
  },

  addToPlaylist(plId, trackId) {
    const pl = this.playlists.find(p => p.id === plId);
    if (pl && !pl.tracks.includes(trackId)) { pl.tracks.push(trackId); this.save(); }
  },

  removeFromPlaylist(plId, trackId) {
    const pl = this.playlists.find(p => p.id === plId);
    if (pl) { pl.tracks = pl.tracks.filter(i => i !== trackId); this.save(); }
  },

  deletePlaylist(id) {
    this.playlists = this.playlists.filter(p => p.id !== id);
    this.save();
  },

  getPlaylistTracks(id) {
    const pl = this.playlists.find(p => p.id === id);
    return pl ? pl.tracks.map(id => this.tracks.find(t => t.id === id)).filter(Boolean) : [];
  },

  async exportPlaylist(id) {
    const pl = this.playlists.find(p => p.id === id);
    if (!pl) return;
    await window.vibeAPI.exportPlaylist({ name: pl.name, tracks: this.getPlaylistTracks(id) });
    Utils.toast('Playlist exported');
  },

  async importPlaylist() {
    const paths = await window.vibeAPI.importPlaylist();
    if (!paths?.length) return null;
    const pl    = this.createPlaylist('Imported Playlist');
    const added = await this.addFiles(paths);
    added.forEach(t => pl.tracks.push(t.id));
    this.save();
    return pl;
  },

  // ── BPM-aware queue sort ──────────────────────────────────────────
  // Groups tracks by estimated energy/tempo (bitrate as proxy for BPM
  // since actual BPM isn't in standard metadata). Sorts so adjacent
  // tracks have the closest bitrate — smooth crossfades between similar
  // energy songs, no jarring tempo clashes.
  sortForCrossfade(tracks) {
    if (!tracks || tracks.length < 2) return tracks;

    // Estimate BPM from bitrate: higher bitrate ≈ denser audio ≈ higher energy.
    // Group into energy buckets: low(0-128kbps), mid(128-256), high(256+)
    const energy = t => {
      const br = t.bitrate || 128;
      if (br < 96)  return 0;
      if (br < 160) return 1;
      if (br < 256) return 2;
      return 3;
    };

    // Sort by energy level so transitions stay in the same "zone"
    // Within same energy, sort by bitrate for smooth gradient
    return [...tracks].sort((a, b) => {
      const ea = energy(a), eb = energy(b);
      if (ea !== eb) return ea - eb;
      return (a.bitrate || 128) - (b.bitrate || 128);
    });
  },

};