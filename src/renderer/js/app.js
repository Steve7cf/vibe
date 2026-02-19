/* ══════════════════════════════════════════════════════════════════
   App — bootstrap, onboarding glue, Today Mix scheduler, session
   ══════════════════════════════════════════════════════════════════ */
const App = {
  config: {},

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
  },

  _applyConfig() {
    const c = this.config;
    AudioEngine.setVolume(c.volume ?? 0.8);
    AudioEngine.setBalance(c.balance ?? 0);
    AudioEngine.setSpeed(c.speed ?? 1);
    AudioEngine.config.crossfade = c.crossfade ?? 3;
    AudioEngine.config.fadeIn    = c.fadeIn  !== false;
    AudioEngine.config.fadeOut   = c.fadeOut !== false;
    Player.shuffle = c.shuffle || false;
    Player.repeat  = c.repeat  || 'off';
    document.getElementById('btn-shuffle')?.classList.toggle('active', Player.shuffle);
    Player._updateRepeatBtn?.();
    Equalizer.applyFromConfig(c);
    UI.applySettings(c);
    if (c.accentColor) Utils.applyAccent(c.accentColor);

    if (c.lastTrackId) {
      const t = Library.tracks.find(t => t.id === c.lastTrackId);
      if (t) {
        Player.currentTrack  = t;
        Player.queue         = [...Library.tracks];
        Player.originalQueue = [...Library.tracks];
        Player.currentIndex  = Player.queue.findIndex(x => x.id === t.id);
        AudioEngine.load(t).then(() => {
          if (c.lastPosition > 0) AudioEngine.seekTo(c.lastPosition);
          Player._updateUI();
        });
      }
    }
  },

  // ── Today Mix daily refresh ─────────────────────────────────────────────────
  _scheduleTodayMix() {
    const today = new Date().toDateString();
    if (this.config.lastMixDate !== today || !this.config.todayMixIds?.length) {
      this._refreshMix(today);
    }
    const msToMidnight = new Date(new Date().setHours(24,0,0,0)) - Date.now();
    setTimeout(() => { this._refreshMix(new Date().toDateString()); this._scheduleTodayMix(); }, msToMidnight);
  },

  _refreshMix(dateStr) {
    const mix = Library.getTodayMix(10);
    this.config.todayMixIds = mix.map(t => t.id);
    this.config.lastMixDate = dateStr;
    this.save();
  },

  getTodayMixTracks() {
    if (!this.config.todayMixIds?.length) return Library.getTodayMix(10);
    const tracks = this.config.todayMixIds
      .map(id => Library.tracks.find(t => t.id === id)).filter(Boolean);
    return tracks.length ? tracks : Library.getTodayMix(10);
  },

  // ── Global keyboard / tray ──────────────────────────────────────────────────
  _bindGlobal() {
    window.vibeAPI.onTrayAction(a => {
      if (a==='playpause') Player.toggle();
      else if (a==='next') Player.next();
      else if (a==='prev') Player.prev();
    });
    window.vibeAPI.onGlobalShortcut(a => {
      if (a==='playpause') Player.toggle();
      else if (a==='next') Player.next();
      else if (a==='prev') Player.prev();
      else if (a==='stop') Player.stop();
    });

    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      const adjVol = d => {
        const v = Math.max(0, Math.min(1, AudioEngine.config.volume + d));
        AudioEngine.setVolume(v);
        const s = document.getElementById('vol-slider');
        if (s) { s.value = v; UI._syncVolSlider(v); }
      };
      switch (e.code) {
        case 'Space':      e.preventDefault(); Player.toggle(); break;
        case 'ArrowRight': e.ctrlKey ? Player.next() : AudioEngine.seekTo(AudioEngine.currentTime + 5); break;
        case 'ArrowLeft':  e.ctrlKey ? Player.prev() : AudioEngine.seekTo(AudioEngine.currentTime - 5); break;
        case 'ArrowUp':    e.preventDefault(); adjVol(+0.05); break;
        case 'ArrowDown':  e.preventDefault(); adjVol(-0.05); break;
        case 'KeyM':       UI._toggleMute(); break;
        case 'KeyS':       if (e.ctrlKey) { e.preventDefault(); Player.toggleShuffle(); } break;
        case 'KeyR':       if (e.ctrlKey) { e.preventDefault(); Player.cycleRepeat();   } break;
      }
    });

    window.addEventListener('beforeunload', () => this._snapshot());
    setInterval(() => this._snapshot(), 15000);
  },

  _snapshot() {
    this.config.lastTrackId  = Player.currentTrack?.id || null;
    this.config.lastPosition = AudioEngine.currentTime || 0;
    this.config.shuffle      = Player.shuffle;
    this.config.repeat       = Player.repeat;
    this.config.volume       = AudioEngine.config.volume;
    this.config.eq           = { enabled: Equalizer.enabled, bands: [...Equalizer.bands] };
    window.vibeAPI.saveConfig(this.config);
  },

  updateConfig(k, v) { this.config[k] = v; this.save(); },

  save() {
    this.config.shuffle = Player.shuffle;
    this.config.repeat  = Player.repeat;
    this.config.volume  = AudioEngine.config.volume;
    this.config.eq      = { enabled: Equalizer.enabled, bands: [...Equalizer.bands] };
    window.vibeAPI.saveConfig(this.config);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
