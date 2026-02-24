/* ══════════════════════════════════════════════════════════════════
   App — bootstrap · config · Today Mix · session restore
   ══════════════════════════════════════════════════════════════════ */
const App = {
  config: {},
  _saveTimer: null,

  async init() {
    this.config = await window.vibeAPI.getConfig();
    await Library.init();
    if (!this.config.onboardingDone) { UI._obShow(); return; }
    await this._boot();
  },

  async afterOnboarding(prefs) {
    Object.assign(this.config, prefs, { onboardingDone: true });
    await window.vibeAPI.saveConfig(this.config);
    await this._boot();
  },

  async _boot() {
    AudioEngine.init();
    Player.init();
    Visualizer.init();
    Equalizer.init();
    UI.init();
    this._applyConfig();
    this._bindGlobal();
    UI.showView('home');
    UI.renderSidebarPls();
    Visualizer.setMode(this.config.visualizerMode || 'bars');
    this._scheduleTodayMix();
    // Background incremental scan — runs silently after boot
    if (this.config.folders?.length) this._backgroundScan();
  },

  async _backgroundScan() {
    try {
      const r = await Library.scanFolders(this.config.folders);
      if (r.added + r.changed + r.removed > 0) UI.renderHome?.();
    } catch (e) {
      if (window.vibeAPI?.log) window.vibeAPI.log('WRN', '[scan]', e?.message || e);
    }
  },

  _applyConfig() {
    const c = this.config;
    AudioEngine.setVolume(c.volume ?? 0.8);
    AudioEngine.setBalance(c.balance ?? 0);
    AudioEngine.setSpeed(c.speed ?? 1);
    AudioEngine.config.fadeIn        = c.fadeIn !== false;
    AudioEngine.config.fadeOut       = c.fadeOut !== false;
    AudioEngine.config.gapless       = c.gapless || false;
    AudioEngine.config.gaplessOffset = c.gaplessOffset ?? 8;
    Player.shuffle = c.shuffle || false;
    Player.repeat  = c.repeat  || 'off';
    document.getElementById('btn-shuffle')?.classList.toggle('active', Player.shuffle);
    Player._updateRepeatBtn?.();
    Equalizer.applyFromConfig(c);
    UI.applySettings(c);
    if (c.accentColor) Utils.applyAccent(c.accentColor);

    // Session restore — rebuild full queue, seek to last position, don't auto-play
    if (c.lastTrackId) {
      const savedQueue = (c.lastQueueIds || [])
        .map(id => Library._byId.get(id)).filter(Boolean);
      const queue = savedQueue.length
        ? savedQueue
        : [Library._byId.get(c.lastTrackId)].filter(Boolean);

      if (queue.length) {
        let idx = c.lastQueueIndex ?? 0;
        if (queue[idx]?.id !== c.lastTrackId) {
          idx = queue.findIndex(t => t.id === c.lastTrackId);
          if (idx === -1) idx = 0;
        }
        Player.queue         = queue;
        Player.originalQueue = [...queue];
        Player.currentIndex  = idx;
        Player.currentTrack  = queue[idx];

        AudioEngine.load(queue[idx]).then(() => {
          if (c.lastPosition > 0) AudioEngine.seekTo(c.lastPosition);
          Player._updateUI();
          UI.renderQueue();
        });
      }
    }
  },

  // ── Today Mix ─────────────────────────────────────────────────────────────
  _scheduleTodayMix() {
    const today = new Date().toDateString();
    if (this.config.lastMixDate !== today || !this.config.todayMixIds?.length)
      this._refreshMix(today);
    const ms = new Date(new Date().setHours(24, 0, 0, 0)) - Date.now();
    setTimeout(() => { this._refreshMix(new Date().toDateString()); this._scheduleTodayMix(); }, ms);
  },

  _refreshMix(dateStr) {
    const mix = Library.getTodayMix(20);
    this.config.todayMixIds = mix.map(t => t.id);
    this.config.lastMixDate = dateStr;
    this._saveNow();
  },

  getTodayMixTracks() {
    if (!this.config.todayMixIds?.length) return Library.getTodayMix(20);
    const tracks = this.config.todayMixIds.map(id => Library._byId.get(id)).filter(Boolean);
    return tracks.length ? tracks : Library.getTodayMix(20);
  },

  // ── Global bindings ───────────────────────────────────────────────────────
  _bindGlobal() {
    window.vibeAPI.onTrayAction(a => {
      if (a === 'playpause') Player.toggle();
      else if (a === 'next') Player.next(true);
      else if (a === 'prev') Player.prev();
    });
    window.vibeAPI.onGlobalShortcut(a => {
      if (a === 'playpause') Player.toggle();
      else if (a === 'next') Player.next(true);
      else if (a === 'prev') Player.prev();
      else if (a === 'stop') Player.stop();
    });

    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const adjVol = d => {
        const v = Math.max(0, Math.min(1, AudioEngine.config.volume + d));
        AudioEngine.setVolume(v);
        const s = document.getElementById('vol-slider');
        if (s) { s.value = v; UI._syncVolSlider(v); }
      };
      switch (e.code) {
        case 'Space':      e.preventDefault(); Player.toggle(); break;
        case 'ArrowRight': e.ctrlKey ? Player.next(true) : AudioEngine.seekTo(AudioEngine.currentTime + 5); break;
        case 'ArrowLeft':  e.ctrlKey ? Player.prev() : AudioEngine.seekTo(AudioEngine.currentTime - 5); break;
        case 'ArrowUp':    e.preventDefault(); adjVol(+0.05); break;
        case 'ArrowDown':  e.preventDefault(); adjVol(-0.05); break;
        case 'KeyM':       UI._toggleMute(); break;
        case 'KeyS':       if (e.ctrlKey) { e.preventDefault(); Player.toggleShuffle(); } break;
        case 'KeyR':       if (e.ctrlKey) { e.preventDefault(); Player.cycleRepeat(); } break;
      }
    });

    window.addEventListener('beforeunload', () => this._snapshot());
    setInterval(() => this._snapshot(), 15000);
  },

  _snapshot() {
    this.config.lastTrackId    = Player.currentTrack?.id || null;
    this.config.lastPosition   = AudioEngine.currentTime || 0;
    this.config.lastQueueIds   = Player.queue.map(t => t.id);
    this.config.lastQueueIndex = Player.currentIndex;
    this.config.shuffle        = Player.shuffle;
    this.config.repeat         = Player.repeat;
    this.config.volume         = AudioEngine.config.volume;
    this.config.eq             = { enabled: Equalizer.enabled, bands: [...Equalizer.bands] };
    window.vibeAPI.saveConfig(this.config);
  },

  // updateConfig — debounced for high-frequency slider events (volume, EQ bands, speed)
  // _saveNow — immediate, used for important state changes
  updateConfig(k, v) {
    this.config[k] = v;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveNow(), 600);
  },

  _saveNow() {
    clearTimeout(this._saveTimer);
    this.config.lastQueueIds   = Player.queue.map(t => t.id);
    this.config.lastQueueIndex = Player.currentIndex;
    this.config.lastTrackId    = Player.currentTrack?.id || null;
    this.config.shuffle        = Player.shuffle;
    this.config.repeat         = Player.repeat;
    this.config.volume         = AudioEngine.config.volume;
    this.config.eq             = { enabled: Equalizer.enabled, bands: [...Equalizer.bands] };
    window.vibeAPI.saveConfig(this.config);
  },

  // save() — alias for compatibility, immediate
  save() { this._saveNow(); },
};

document.addEventListener('DOMContentLoaded', () => App.init());
