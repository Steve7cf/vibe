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
  // BPM/vibe-aware daily blend:
  //   • Uses duration as tempo proxy (short ≈ fast/upbeat, long ≈ slow/mellow)
  //   • Uses sampleRate as fidelity/energy proxy (44.1k=standard, 48k+=high energy)
  //   • Selects tracks that match time-of-day vibe
  //   • Orders result as an energy arc (morning: gentle→energetic, evening: energetic→chill)
  // ─── BPM-proxy energy estimate ───────────────────────────────────
  // We don't have actual BPM from ID3 tags, but we can build a solid
  // proxy from the combination of: bitrate, duration, sample rate,
  // genre keywords, and title/filename keywords.
  _trackEnergy(t) {
    let e = 1.0;  // neutral baseline (0=dead slow, 2=peak energy)

    // ── Bitrate: compressed loud music (EDM, rock) has high bitrate ──
    const br = t.bitrate || 128;
    if      (br >= 320) e += 0.5;
    else if (br >= 256) e += 0.35;
    else if (br >= 192) e += 0.15;
    else if (br <= 96)  e -= 0.3;   // low bitrate = often ambient/podcast

    // ── Duration: dance tracks tend to be 3-4min, ambient 5-10min ──
    const dur = t.duration || 210;
    if      (dur < 120) e += 0.3;   // very short = upbeat single/clip
    else if (dur < 200) e += 0.2;   // typical pop/dance
    else if (dur < 270) e += 0.0;   // average
    else if (dur < 360) e -= 0.15;  // longer = slower
    else                e -= 0.4;   // 6+ min = ambient/classical/live

    // ── Sample rate: 48kHz+ often indicates modern mastered-for-loudness ──
    const sr = t.sampleRate || 44100;
    if (sr >= 48000) e += 0.1;

    // ── Genre keywords ──
    const g = (t.genre || '').toLowerCase();
    const highE = ['edm','electronic','dance','techno','house','drum','bass','metal','punk','hip hop','hip-hop','rap','funk','disco','hardstyle','trance','dubstep','rave','workout','gym','upbeat','energetic'];
    const lowE  = ['ambient','classical','acoustic','sleep','meditation','chill','lo-fi','lofi','lo fi','jazz','blues','folk','country','ballad','slow','relaxing','piano','orchestral','new age'];
    if (highE.some(k => g.includes(k))) e += 0.5;
    if (lowE.some(k => g.includes(k)))  e -= 0.5;

    // ── Title/filename keywords ──
    const title = (t.title || t.path || '').toLowerCase();
    const highT = ['remix','mix','club','rave','party','banger','workout','pump','hype','anthem','drop','bass','beat','bpm'];
    const lowT  = ['acoustic','unplugged','slow','ballad','piano','sleep','rain','night','quiet','soft','gentle','instrumental'];
    if (highT.some(k => title.includes(k))) e += 0.25;
    if (lowT.some(k => title.includes(k)))  e -= 0.25;

    return Math.max(0, Math.min(2, e));  // clamp 0–2
  },

  getTodayMix(count = 20) {
    if (!this.tracks.length) return [];
    if (this.tracks.length <= count) return this._vibeSort([...this.tracks]);

    const now  = Date.now();
    const hour = new Date().getHours();

    // ── Time-of-day vibe profile ──────────────────────────────────
    // targetEnergy: 0=chill, 1=medium, 2=energetic
    // arc: 'up'=build energy, 'down'=wind down, 'wave'=peaks & valleys
    const vibe =
      hour < 6  ? { energy: 0.2, arc: 'flat',  label: 'late night',
                    genres: ['ambient','lo-fi','lofi','chill','sleep','jazz','classical'] }
    : hour < 9  ? { energy: 1.0, arc: 'up',    label: 'morning',
                    genres: ['acoustic','folk','indie','pop','coffee','jazz','singer'] }
    : hour < 12 ? { energy: 1.5, arc: 'up',    label: 'morning boost',
                    genres: ['pop','rock','indie','funk','hip hop','electronic'] }
    : hour < 14 ? { energy: 1.8, arc: 'flat',  label: 'midday',
                    genres: ['pop','rock','hip hop','electronic','dance','funk','r&b'] }
    : hour < 17 ? { energy: 1.3, arc: 'wave',  label: 'afternoon',
                    genres: ['pop','indie','alternative','r&b','soul','hip hop'] }
    : hour < 20 ? { energy: 1.7, arc: 'wave',  label: 'evening',
                    genres: ['rock','hip hop','electronic','dance','pop','funk'] }
    :             { energy: 0.7, arc: 'down',  label: 'night',
                    genres: ['r&b','soul','jazz','lo-fi','indie','chill','blues','neo soul'] };

    // ── Score every track ─────────────────────────────────────────
    const scored = this.tracks.map(t => {
      let score = Math.random() * 15;  // small random jitter so mix varies daily

      // Recency — recent favourites but not just-played
      const days = (now - (this.lastPlayedAt[t.id] || 0)) / 86400000;
      if      (days < 0.08) score -= 80;  // played in last 2h — strong suppress
      else if (days < 1)    score += 25;  // played today but not recently
      else if (days < 4)    score += 18;  // last few days
      else if (days < 14)   score += 10;  // this fortnight
      else if (days > 90)   score -=  8;  // very neglected

      // Popularity boost
      score += Math.min((this.playCount[t.id] || 0) * 5, 35);

      // Liked = always in the mix
      if (this.likedIds.has(t.id)) score += 30;

      // Genre match
      const g = (t.genre || '').toLowerCase();
      const genreMatch = vibe.genres.some(m => g.includes(m));
      if (genreMatch) score += 22;

      // Energy match — core of the vibe algorithm
      const energy = this._trackEnergy(t);
      const diff   = Math.abs(energy - vibe.energy);
      score += (2 - diff) * 12;   // max +24 for perfect energy match

      return { track: t, score, energy };
    });

    scored.sort((a, b) => b.score - a.score);

    // ── Pick top tracks with artist + genre variety ───────────────
    const pool      = scored.slice(0, Math.min(60, scored.length));
    const mix       = [];
    const usedArtist = {};
    const usedGenre  = {};

    for (const { track: t, energy } of pool) {
      if (mix.length >= count) break;
      const artist = (t.artist || 'unknown').toLowerCase().slice(0, 20);
      const genre  = (t.genre  || 'unknown').toLowerCase().slice(0, 12);
      if ((usedArtist[artist] || 0) >= 2) continue;  // max 2 per artist
      if ((usedGenre[genre]   || 0) >= 3) continue;  // max 3 per genre
      usedArtist[artist] = (usedArtist[artist] || 0) + 1;
      usedGenre[genre]   = (usedGenre[genre]   || 0) + 1;
      mix.push({ track: t, energy });
    }
    // Fill remaining slots if variety was too strict
    for (const item of pool) {
      if (mix.length >= count) break;
      if (!mix.find(m => m.track === item.track)) mix.push(item);
    }

    // ── Order by energy arc ───────────────────────────────────────
    return this._arcSort(mix.map(m => m.track), mix.map(m => m.energy), vibe.arc);
  },

  // Sort tracks to flow as an energy arc
  _arcSort(tracks, energies, arc) {
    const pairs = tracks.map((t, i) => ({ track: t, energy: energies[i] }));
    if (arc === 'up')   { pairs.sort((a, b) => a.energy - b.energy); return pairs.map(p => p.track); }
    if (arc === 'down') { pairs.sort((a, b) => b.energy - a.energy); return pairs.map(p => p.track); }
    if (arc === 'wave') {
      // Build-peak-decay: low → high → low (mountain shape)
      pairs.sort((a, b) => a.energy - b.energy);
      const n = pairs.length;
      const result = new Array(n);
      let lo = 0, hi = n - 1;
      for (let i = 0; i < n; i++) {
        // Fill from outside in, alternating — creates a wave that peaks in the middle
        if (i % 2 === 0) result[i] = pairs[lo++];
        else             result[n - 1 - Math.floor(i / 2)] = pairs[hi--];
      }
      // Actually do proper mountain: sort low→high, then rearrange as valley-peak-valley
      pairs.sort((a, b) => a.energy - b.energy);
      const mid = Math.ceil(n / 2);
      return [...pairs.slice(0, mid), ...pairs.slice(mid).reverse()].map(p => p.track);
    }
    // flat: interleave high/low energy so variance is low throughout
    pairs.sort((a, b) => a.energy - b.energy);
    const result = [];
    let lo = 0, hi = pairs.length - 1;
    let turn = 0;
    while (lo <= hi) {
      result.push(turn % 2 === 0 ? pairs[lo++] : pairs[hi--]);
      turn++;
    }
    return result.map(p => p.track);
  },

  _vibeSort(tracks) {
    const hour = new Date().getHours();
    const arc  = hour < 9 ? 'up' : hour >= 20 ? 'down' : 'flat';
    const energies = tracks.map(t => this._trackEnergy(t));
    return this._arcSort(tracks, energies, arc);
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