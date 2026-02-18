/**
 * Vibe — State Manager
 * Central reactive store for application state
 */

export class StateManager {
  constructor({ config, session, library, playlists }) {
    this._state = {
      config,
      library: library || [],
      playlists: playlists || [],
      queue: [],
      history: [],
      currentIndex: -1,
      currentTrack: null,
      isPlaying: false,
      isPaused: false,
      volume: config.audio.defaultVolume ?? 0.8,
      isMuted: false,
      shuffle: config.playback.shuffle ?? false,
      repeat: config.playback.repeat ?? 'off',
      currentTime: 0,
      duration: 0,
      likedTracks: new Set(session.likedTracks || []),
      recentlyPlayed: session.recentlyPlayed || [],
      searchQuery: '',
      activeView: 'home',
      activeSortField: 'title',
      activeSortDir: 'asc',
      activePlaylistId: null,
      activeAlbum: null,
      activeArtist: null,
      crossfadeEnabled: config.playback.crossfadeEnabled ?? true,
      autoDJ: config.playback.autoDJ ?? false,
      sleepTimer: null,
      scanProgress: null,
    };
    this._listeners = new Map();
  }

  get(key) { return this._state[key]; }
  getAll() { return { ...this._state }; }

  set(key, value) {
    const prev = this._state[key];
    this._state[key] = value;
    this._emit(key, value, prev);
    return this;
  }

  patch(updates) {
    for (const [k, v] of Object.entries(updates)) {
      this._state[k] = v;
      this._emit(k, v);
    }
    return this;
  }

  on(key, fn) {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key).add(fn);
    return () => this._listeners.get(key).delete(fn);
  }

  _emit(key, val, prev) {
    this._listeners.get(key)?.forEach(fn => fn(val, prev));
    this._listeners.get('*')?.forEach(fn => fn(key, val, prev));
  }

  // Convenience helpers
  getConfig(path) {
    const parts = path.split('.');
    let cur = this._state.config;
    for (const p of parts) { cur = cur?.[p]; }
    return cur;
  }

  updateConfig(path, value) {
    const parts = path.split('.');
    const config = { ...this._state.config };
    let cur = config;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = { ...cur[parts[i]] };
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    this._state.config = config;
    this._emit('config', config);
    this.persistConfig();
  }

  async persistConfig() {
    await window.vibeAPI.invoke('config:save', this._state.config);
  }

  async persistLibrary() {
    await window.vibeAPI.invoke('library:save', this._state.library);
  }

  async persistPlaylists() {
    await window.vibeAPI.invoke('playlists:save', this._state.playlists);
  }

  async persistSession() {
    const session = {
      currentTrackPath: this._state.currentTrack?.path,
      currentTime: this._state.currentTime,
      volume: this._state.volume,
      shuffle: this._state.shuffle,
      repeat: this._state.repeat,
      queue: this._state.queue.map(t => t.path),
      currentIndex: this._state.currentIndex,
      likedTracks: [...this._state.likedTracks],
      recentlyPlayed: this._state.recentlyPlayed.slice(0, 50),
    };
    await window.vibeAPI.invoke('session:save', session);
  }
}
