/**
 * Vibe — Audio Engine
 * Web Audio API powered engine with EQ, crossfade, visualizer, effects
 */

export class AudioEngine {
  constructor(state) {
    this.state = state;
    this.ctx = null;
    this.mainGain = null;
    this.analyser = null;
    this.eqNodes = [];
    this.bassBoostNode = null;
    this.surroundNode = null;
    this.panNode = null;
    this.currentSource = null; // current HTMLAudioElement
    this.nextSource = null;    // preloaded next track
    this.crossfadeTimer = null;
    this.fadeTimer = null;

    // EQ band frequencies (10-band)
    this.EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.EQ_VALUES = new Array(10).fill(0);

    // EQ Presets
    this.EQ_PRESETS = {
      flat:      [0,0,0,0,0,0,0,0,0,0],
      pop:       [-1,4,6,3,0,-1,-1,0,3,4],
      rock:      [5,4,3,1,-1,-2,-1,1,4,5],
      jazz:      [3,2,1,3,4,4,3,1,1,2],
      classical: [5,4,4,3,2,0,-2,-3,-4,-3],
      electronic:[5,3,0,-2,-3,-1,3,4,5,4],
      hiphop:    [5,4,2,3,1,-1,0,1,3,4],
      bass:      [7,6,5,3,1,0,0,0,0,0],
      treble:    [0,0,0,0,0,2,4,5,6,7],
      vocal:     [-2,-1,0,3,5,5,4,2,1,0],
    };

    this._currentEl = null;
    this._nextEl = null;
    this._connected = false;
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Build signal chain: source → EQ → bass → pan → gain → analyser → dest
    this.mainGain = this.ctx.createGain();
    this.mainGain.gain.value = this.state.get('volume');

    this.panNode = this.ctx.createStereoPanner();
    this.panNode.pan.value = 0;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Build 10-band EQ
    this.eqNodes = this.EQ_FREQUENCIES.map((freq, i) => {
      const node = this.ctx.createBiquadFilter();
      node.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking';
      node.frequency.value = freq;
      node.gain.value = 0;
      node.Q.value = 1.0;
      return node;
    });

    // Bass boost (separate lowshelf)
    this.bassBoostNode = this.ctx.createBiquadFilter();
    this.bassBoostNode.type = 'lowshelf';
    this.bassBoostNode.frequency.value = 200;
    this.bassBoostNode.gain.value = 0;

    // Chain EQ nodes
    const chainNodes = [...this.eqNodes, this.bassBoostNode, this.panNode, this.mainGain, this.analyser];
    for (let i = 0; i < chainNodes.length - 1; i++) {
      chainNodes[i].connect(chainNodes[i + 1]);
    }
    this.analyser.connect(this.ctx.destination);

    // Apply saved config
    const cfg = this.state.get('config');
    this.setVolume(this.state.get('volume'));
    this.setBalance(cfg.audio.balance || 0);
    this.setBassBoost(cfg.audio.bassBoost || 0);

    // Apply saved EQ preset
    this.applyPreset(cfg.audio.equalizerPreset || 'flat');

    console.log('🔊 Audio engine initialized');
  }

  // ── Source Management ─────────────────────────────────────────────
  createAudioElement(track) {
    const el = new Audio();
    el.src = `file://${track.path}`;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    return el;
  }

  connectElement(el) {
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const source = this.ctx.createMediaElementSource(el);
      source.connect(this.eqNodes[0]);
      el._sourceNode = source;
      return source;
    } catch (e) {
      console.error('Audio connect error:', e);
      return null;
    }
  }

  async loadTrack(track, autoplay = true) {
    const config = this.state.get('config');
    const crossfadeEnabled = config.playback.crossfadeEnabled && config.audio.crossfadeDuration > 0;
    const crossfadeDuration = config.audio.crossfadeDuration * 1000;
    const fadeOutDuration = config.audio.fadeOutDuration * 1000;
    const fadeInDuration = config.audio.fadeInDuration * 1000;

    // Fade out old track
    if (this._currentEl && !this._currentEl.paused) {
      if (crossfadeEnabled) {
        await this.fadeElement(this._currentEl, 1, 0, Math.min(fadeOutDuration, crossfadeDuration));
      }
      this._currentEl.pause();
      this._currentEl.src = '';
      this._currentEl = null;
    }

    // Create new element
    const el = this.createAudioElement(track);
    this._currentEl = el;

    if (autoplay) {
      try {
        this.connectElement(el);
        el.volume = 0;
        await el.play();
        // Fade in
        await this.fadeElement(el, 0, 1, fadeInDuration);
      } catch (e) {
        console.error('Playback error:', e);
      }
    } else {
      this.connectElement(el);
    }

    // Set up event listeners
    this.setupElementEvents(el);
    return el;
  }

  setupElementEvents(el) {
    el.addEventListener('timeupdate', () => {
      this.state.patch({
        currentTime: el.currentTime,
        duration: el.duration || 0,
      });

      // Crossfade trigger: start crossfade when near end
      const cfg = this.state.get('config');
      if (cfg.playback.crossfadeEnabled && cfg.audio.crossfadeDuration > 0) {
        const remaining = (el.duration || 0) - el.currentTime;
        if (remaining > 0 && remaining <= cfg.audio.crossfadeDuration && !el._crossfadeStarted) {
          el._crossfadeStarted = true;
          this._emitEvent('crossfadeStart');
        }
      }
    });

    el.addEventListener('ended', () => { this._emitEvent('trackEnded'); });
    el.addEventListener('error', (e) => { this._emitEvent('trackError', e); });
    el.addEventListener('canplaythrough', () => { this._emitEvent('canPlay'); });
  }

  _handlers = {};
  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
    return () => {
      this._handlers[event] = this._handlers[event].filter(h => h !== fn);
    };
  }

  _emitEvent(event, data) {
    this._handlers[event]?.forEach(fn => fn(data));
  }

  // ── Playback Controls ─────────────────────────────────────────────
  async play() {
    if (this._currentEl) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      try { await this._currentEl.play(); } catch (e) { console.error(e); }
    }
  }

  pause() {
    this._currentEl?.pause();
  }

  stop() {
    if (this._currentEl) {
      this._currentEl.pause();
      this._currentEl.currentTime = 0;
    }
  }

  seek(time) {
    if (this._currentEl) {
      this._currentEl.currentTime = Math.max(0, Math.min(time, this._currentEl.duration || 0));
    }
  }

  seekByPercent(pct) {
    if (this._currentEl && this._currentEl.duration) {
      this.seek(pct * this._currentEl.duration);
    }
  }

  // ── Volume & Pan ──────────────────────────────────────────────────
  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, vol));
    if (this.mainGain) this.mainGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    this.state.set('volume', clamped);
  }

  setMute(muted) {
    if (this.mainGain) {
      this.mainGain.gain.setTargetAtTime(
        muted ? 0 : this.state.get('volume'),
        this.ctx.currentTime, 0.05
      );
    }
    this.state.set('isMuted', muted);
  }

  setBalance(val) {
    // val: -100 to 100
    if (this.panNode) this.panNode.pan.value = val / 100;
    this.state.updateConfig('audio.balance', val);
  }

  // ── EQ Controls ───────────────────────────────────────────────────
  setEQBand(index, gainDb) {
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.setTargetAtTime(gainDb, this.ctx.currentTime, 0.05);
      this.EQ_VALUES[index] = gainDb;
    }
  }

  applyPreset(presetName) {
    const preset = this.EQ_PRESETS[presetName] || this.EQ_PRESETS.flat;
    preset.forEach((gain, i) => this.setEQBand(i, gain));
    this.EQ_VALUES = [...preset];
    this.state.updateConfig('audio.equalizerPreset', presetName);
  }

  setBassBoost(db) {
    if (this.bassBoostNode) {
      this.bassBoostNode.gain.setTargetAtTime(db, this.ctx.currentTime, 0.05);
    }
    this.state.updateConfig('audio.bassBoost', db);
  }

  // ── Effects ───────────────────────────────────────────────────────
  setSurround(enabled) {
    // Simple surround simulation using a convolver would require impulse response
    // For now, apply a slight reverb-like effect with a delay node
    this.state.updateConfig('audio.surroundEnabled', enabled);
  }

  setPlaybackRate(rate) {
    if (this._currentEl) this._currentEl.playbackRate = rate;
    this.state.updateConfig('audio.playbackSpeed', rate);
  }

  // ── Fade Helpers ──────────────────────────────────────────────────
  fadeElement(el, fromVol, toVol, durationMs) {
    return new Promise(resolve => {
      if (durationMs <= 0) { el.volume = toVol; resolve(); return; }
      const steps = 20;
      const interval = durationMs / steps;
      const delta = (toVol - fromVol) / steps;
      let step = 0;
      el.volume = fromVol;
      const id = setInterval(() => {
        step++;
        el.volume = Math.max(0, Math.min(1, fromVol + delta * step));
        if (step >= steps) { clearInterval(id); el.volume = toVol; resolve(); }
      }, interval);
    });
  }

  // ── Analyser ─────────────────────────────────────────────────────
  getAnalyserData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getWaveformData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  // ── Properties ───────────────────────────────────────────────────
  get currentTime() { return this._currentEl?.currentTime || 0; }
  get duration() { return this._currentEl?.duration || 0; }
  get isPaused() { return this._currentEl?.paused ?? true; }
  get isPlaying() { return this._currentEl ? !this._currentEl.paused : false; }
}
