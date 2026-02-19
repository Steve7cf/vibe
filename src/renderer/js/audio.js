/* ═══════════════════════════════════════════════════════
   AudioEngine — lazy context, efficient preloading
   ═══════════════════════════════════════════════════════ */
const AudioEngine = {
  ctx:          null,
  _audio:       null,
  _preload:     null,   // hidden Audio() for next-track buffering
  gainNode:     null,
  analyser:     null,
  pannerNode:   null,
  eqNodes:      [],
  bassBoostNode: null,
  _listeners:   {},
  _freqBuf:     null,
  _timeBuf:     null,

  config: {
    volume: 0.8, balance: 0, speed: 1,
    crossfade: 3, fadeIn: true, fadeOut: true,
  },

  init() {
    if (this._audio) return;   // idempotent
    this._audio   = new Audio();
    this._preload = new Audio();
    this._preload.preload = 'auto';
    this._preload.volume  = 0;
    this._audio.preload   = 'auto';
    this._fwdEvents();
  },

  _fwdEvents() {
    ['ended', 'timeupdate', 'loadedmetadata', 'error', 'canplay'].forEach(ev => {
      this._audio.addEventListener(ev, e => {
        (this._listeners[ev] || []).forEach(cb => cb(e));
      });
    });
  },

  on(ev, cb) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(cb);
    return this;
  },

  // Lazy AudioContext — only created on first user gesture (play)
  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'playback', sampleRate: 44100,
    });
    const src = this.ctx.createMediaElementSource(this._audio);
    this.gainNode   = this.ctx.createGain();
    this.pannerNode = this.ctx.createStereoPanner();
    this.analyser   = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this._buildEQ();

    let chain = src;
    for (const n of this.eqNodes) { chain.connect(n); chain = n; }
    chain.connect(this.bassBoostNode);
    this.bassBoostNode.connect(this.pannerNode);
    this.pannerNode.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.gainNode.gain.value   = this.config.volume;
    this.pannerNode.pan.value  = this.config.balance;
    this._audio.playbackRate   = this.config.speed;
  },

  _buildEQ() {
    const defs = [
      [32,'lowshelf'],[64,'peaking'],[125,'peaking'],[250,'peaking'],[500,'peaking'],
      [1000,'peaking'],[2000,'peaking'],[4000,'peaking'],[8000,'highshelf'],[16000,'highshelf'],
    ];
    this.eqNodes = defs.map(([f, t]) => {
      const n = this.ctx.createBiquadFilter();
      n.type = t; n.frequency.value = f; n.Q.value = 1.4; n.gain.value = 0;
      return n;
    });
    this.bassBoostNode = this.ctx.createBiquadFilter();
    this.bassBoostNode.type = 'lowshelf';
    this.bassBoostNode.frequency.value = 200;
    this.bassBoostNode.gain.value = 0;
  },

  async load(track) {
    if (!track?.path) return;
    this._ensureCtx();
    if (this.config.fadeOut && !this._audio.paused) {
      await this._fade(0, Math.min(this.config.crossfade * 0.5, 1.0));
    }
    this._audio.src = `file://${track.path}`;
    this._audio.load();
    if (this.gainNode) {
      this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(
        this.config.fadeIn ? 0 : this.config.volume,
        this.ctx.currentTime
      );
    }
  },

  preloadNext(track) {
    if (!track?.path || this._preload.src.endsWith(encodeURIComponent(track.path))) return;
    this._preload.src = `file://${track.path}`;
    this._preload.load();
  },

  async play() {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    try {
      await this._audio.play();
      if (this.config.fadeIn && this.gainNode) {
        await this._fade(this.config.volume, Math.max(0.3, this.config.crossfade * 0.55));
      }
    } catch(e) { console.warn('[AudioEngine] play:', e); }
  },

  pause() { this._audio.pause(); },
  stop()  { this._audio.pause(); this._audio.currentTime = 0; },
  seek(pct) { if (this._audio.duration) this._audio.currentTime = pct * this._audio.duration; },
  seekTo(s) { if (this._audio.duration) this._audio.currentTime = Math.max(0, Math.min(s, this._audio.duration)); },

  setVolume(v) {
    this.config.volume = v;
    if (!this.gainNode) return;
    this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gainNode.gain.setValueAtTime(v, this.ctx.currentTime);
  },
  setBalance(b) { this.config.balance = b; if (this.pannerNode) this.pannerNode.pan.value = Math.max(-1, Math.min(1, b)); },
  setSpeed(s)   { this.config.speed = s; if (this._audio) this._audio.playbackRate = s; },
  setEQBand(i, g)    { if (this.eqNodes[i]) this.eqNodes[i].gain.value = g; },
  setEQEnabled(on, g) { on && g ? g.forEach((v, i) => this.setEQBand(i, v)) : this.eqNodes.forEach(n => n && (n.gain.value = 0)); },
  setBassBoost(db)    { if (this.bassBoostNode) this.bassBoostNode.gain.value = db; },

  // Reuse typed arrays — avoid GC pressure
  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(128);
    if (!this._freqBuf) this._freqBuf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._freqBuf);
    return this._freqBuf;
  },
  getWaveformData() {
    if (!this.analyser) return new Uint8Array(128);
    if (!this._timeBuf) this._timeBuf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(this._timeBuf);
    return this._timeBuf;
  },

  _fade(target, dur) {
    return new Promise(resolve => {
      if (!this.gainNode) { resolve(); return; }
      const t = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(t);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, t);
      this.gainNode.gain.linearRampToValueAtTime(target, t + Math.max(0.01, dur));
      setTimeout(resolve, dur * 1000 + 60);
    });
  },

  get currentTime() { return this._audio?.currentTime || 0; },
  get duration()    { return this._audio?.duration    || 0; },
  get paused()      { return this._audio?.paused      ?? true; },
};
