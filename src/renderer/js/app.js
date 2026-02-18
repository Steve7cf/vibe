const App = {
  config: {},

  async init() {
    this.config = await window.vibeAPI.getConfig();
    await Library.init();
    AudioEngine.init();
    Player.init();
    Visualizer.init();
    Equalizer.init();
    UI.init();
    this._applyConfig();
    this._bindGlobalEvents();
    UI.showView('home');
    UI.renderSidebarPlaylists();
    Visualizer.setMode(this.config.visualizerMode || 'bars');
  },

  _applyConfig() {
    AudioEngine.setVolume(this.config.volume ?? 0.8);
    AudioEngine.setBalance(this.config.balance ?? 0);
    AudioEngine.setSpeed(this.config.speed ?? 1);
    AudioEngine.config.crossfade = this.config.crossfade ?? 3;
    AudioEngine.config.fadeIn = this.config.fadeIn !== false;
    AudioEngine.config.fadeOut = this.config.fadeOut !== false;
    Player.shuffle = this.config.shuffle || false;
    Player.repeat = this.config.repeat || 'off';

    document.getElementById('btn-shuffle')?.classList.toggle('active', Player.shuffle);
    Player._updateRepeatBtn?.();
    Equalizer.applyFromConfig(this.config);
    UI.applySettings(this.config);

    // Restore last track
    if (this.config.lastTrackId) {
      const track = Library.tracks.find(t => t.id === this.config.lastTrackId);
      if (track) {
        Player.currentTrack = track;
        Player.queue = [...Library.tracks];
        Player.originalQueue = [...Library.tracks];
        Player.currentIndex = Player.queue.findIndex(t => t.id === track.id);
        AudioEngine.load(track).then(() => {
          if (this.config.lastPosition > 0) AudioEngine.seekTo(this.config.lastPosition);
          Player._updateUI();
        });
      }
    }
  },

  _bindGlobalEvents() {
    window.vibeAPI.onTrayAction(action => {
      if (action === 'playpause') Player.toggle();
      else if (action === 'next') Player.next();
      else if (action === 'prev') Player.prev();
    });
    window.vibeAPI.onGlobalShortcut(action => {
      if (action === 'playpause') Player.toggle();
      else if (action === 'next') Player.next();
      else if (action === 'prev') Player.prev();
      else if (action === 'stop') Player.stop();
    });

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      switch(e.code) {
        case 'Space': e.preventDefault(); Player.toggle(); break;
        case 'ArrowRight': if (e.ctrlKey || e.metaKey) Player.next(); else AudioEngine.seekTo(AudioEngine.currentTime + 5); break;
        case 'ArrowLeft': if (e.ctrlKey || e.metaKey) Player.prev(); else AudioEngine.seekTo(AudioEngine.currentTime - 5); break;
        case 'ArrowUp': e.preventDefault(); { const v = Math.min(1, AudioEngine.config.volume + 0.05); AudioEngine.setVolume(v); document.getElementById('volume-slider').value = v; UI._updateVolSlider(v); } break;
        case 'ArrowDown': e.preventDefault(); { const v = Math.max(0, AudioEngine.config.volume - 0.05); AudioEngine.setVolume(v); document.getElementById('volume-slider').value = v; UI._updateVolSlider(v); } break;
        case 'KeyM': UI._toggleMute(); break;
        case 'KeyS': if (e.ctrlKey || e.metaKey) { e.preventDefault(); Player.toggleShuffle(); } break;
        case 'KeyR': if (e.ctrlKey || e.metaKey) { e.preventDefault(); Player.cycleRepeat(); } break;
      }
    });

    window.addEventListener('beforeunload', () => this._saveSession());
    setInterval(() => this._saveSession(), 15000);
  },

  _saveSession() {
    this.config.lastTrackId = Player.currentTrack?.id || null;
    this.config.lastPosition = AudioEngine.currentTime || 0;
    this.saveSettings();
  },

  updateConfig(key, value) {
    this.config[key] = value;
    this.saveSettings();
  },

  saveSettings() {
    this.config.shuffle = Player.shuffle;
    this.config.repeat = Player.repeat;
    this.config.volume = AudioEngine.config.volume;
    this.config.eq = { enabled: Equalizer.enabled, bands: [...Equalizer.bands] };
    window.vibeAPI.saveConfig(this.config);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
