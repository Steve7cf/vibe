const Library = {
  tracks: [],
  playlists: [],
  recentIds: [],
  likedIds: new Set(),
  playCount: {},       // trackId -> number
  lastPlayedAt: {},    // trackId -> timestamp

  async init() {
    const data = await window.vibeAPI.getLibrary();
    this.tracks = data.tracks || [];
    this.playlists = data.playlists || [];
    this.recentIds = data.recentIds || [];
    this.likedIds = new Set(data.likedIds || []);
    this.playCount = data.playCount || {};
    this.lastPlayedAt = data.lastPlayedAt || {};
  },

  async save() {
    await window.vibeAPI.saveLibrary({
      tracks: this.tracks,
      playlists: this.playlists,
      recentIds: this.recentIds,
      likedIds: [...this.likedIds],
      playCount: this.playCount,
      lastPlayedAt: this.lastPlayedAt
    });
  },

  async addFiles(paths) {
    const newTracks = [];
    for (const p of paths) {
      if (this.tracks.find(t => t.path === p)) continue;
      try {
        const meta = await window.vibeAPI.readMetadata(p);
        meta.id = Utils.generateId();
        meta.addedAt = Date.now();
        this.tracks.push(meta);
        newTracks.push(meta);
      } catch(e) { console.warn('metadata fail', p, e); }
    }
    if (newTracks.length) await this.save();
    return newTracks;
  },

  async scanFolder(folderPath) {
    const files = await window.vibeAPI.scanFolder(folderPath);
    return await this.addFiles(files);
  },

  removeTrack(id) {
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.playlists.forEach(pl => { pl.tracks = pl.tracks.filter(tid => tid !== id); });
    this.recentIds = this.recentIds.filter(rid => rid !== id);
    delete this.playCount[id];
    delete this.lastPlayedAt[id];
    this.save();
  },

  search(query) {
    if (!query) return this.tracks;
    const q = query.toLowerCase();
    return this.tracks.filter(t =>
      (t.title||'').toLowerCase().includes(q) ||
      (t.artist||'').toLowerCase().includes(q) ||
      (t.album||'').toLowerCase().includes(q) ||
      (t.genre||'').toLowerCase().includes(q)
    );
  },

  getByArtist() {
    const map = {};
    this.tracks.forEach(t => {
      const a = t.artist || 'Unknown Artist';
      if (!map[a]) map[a] = { name: a, tracks: [], artwork: t.artwork };
      map[a].tracks.push(t);
      if (!map[a].artwork && t.artwork) map[a].artwork = t.artwork;
    });
    return Object.values(map).sort((a,b) => a.name.localeCompare(b.name));
  },

  getByAlbum() {
    const map = {};
    this.tracks.forEach(t => {
      const key = `${t.album||'Unknown'}__${t.artist||'Unknown'}`;
      if (!map[key]) map[key] = { name: t.album||'Unknown Album', artist: t.artist||'Unknown Artist', tracks: [], artwork: t.artwork };
      map[key].tracks.push(t);
      if (!map[key].artwork && t.artwork) map[key].artwork = t.artwork;
    });
    return Object.values(map).sort((a,b) => a.name.localeCompare(b.name));
  },

  getByGenre() {
    const map = {};
    this.tracks.forEach(t => {
      const g = t.genre || 'Unknown';
      if (!map[g]) map[g] = { name: g, tracks: [], artwork: t.artwork };
      map[g].tracks.push(t);
      if (!map[g].artwork && t.artwork) map[g].artwork = t.artwork;
    });
    return Object.values(map).sort((a,b) => a.name.localeCompare(b.name));
  },

  // Recently added (by addedAt timestamp)
  getRecentlyAdded(limit = 20) {
    return [...this.tracks]
      .filter(t => t.addedAt)
      .sort((a, b) => (b.addedAt||0) - (a.addedAt||0))
      .slice(0, limit);
  },

  // Recently played (by lastPlayedAt)
  getRecentlyPlayed(limit = 20) {
    return this.recentIds
      .map(id => this.tracks.find(t => t.id === id))
      .filter(Boolean)
      .slice(0, limit);
  },

  // Most played by play count
  getMostPlayed(limit = 20) {
    return [...this.tracks]
      .filter(t => (this.playCount[t.id] || 0) > 0)
      .sort((a, b) => (this.playCount[b.id]||0) - (this.playCount[a.id]||0))
      .slice(0, limit);
  },

  recordPlay(trackId) {
    this.playCount[trackId] = (this.playCount[trackId] || 0) + 1;
    this.lastPlayedAt[trackId] = Date.now();
    this.recentIds = [trackId, ...this.recentIds.filter(id => id !== trackId)].slice(0, 50);
    this.save();
  },

  createPlaylist(name) {
    const pl = { id: Utils.generateId(), name, tracks: [], created: Date.now() };
    this.playlists.push(pl);
    this.save();
    return pl;
  },

  addToPlaylist(playlistId, trackId) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (pl && !pl.tracks.includes(trackId)) { pl.tracks.push(trackId); this.save(); }
  },

  removeFromPlaylist(playlistId, trackId) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (pl) { pl.tracks = pl.tracks.filter(id => id !== trackId); this.save(); }
  },

  deletePlaylist(id) { this.playlists = this.playlists.filter(p => p.id !== id); this.save(); },

  getPlaylistTracks(playlistId) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl) return [];
    return pl.tracks.map(id => this.tracks.find(t => t.id === id)).filter(Boolean);
  },

  toggleLike(trackId) {
    if (this.likedIds.has(trackId)) this.likedIds.delete(trackId);
    else this.likedIds.add(trackId);
    this.save();
    return this.likedIds.has(trackId);
  },

  async exportPlaylist(playlistId) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const tracks = this.getPlaylistTracks(playlistId);
    await window.vibeAPI.exportPlaylist({ name: pl.name, tracks });
    Utils.showToast('Playlist exported');
  },

  async importPlaylist() {
    const paths = await window.vibeAPI.importPlaylist();
    if (!paths.length) return null;
    const pl = this.createPlaylist('Imported Playlist');
    const added = await this.addFiles(paths);
    added.forEach(t => pl.tracks.push(t.id));
    await this.save();
    return pl;
  }
};
