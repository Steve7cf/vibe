const AudioEngine = {
  ctx: null,
  source: null,
  gainNode: null,
  analyser: null,
  pannerNode: null,
  eqNodes: [],
  bassBoostNode: null,
  audio: null,
  mediaSource: null,
  isConnected: false,

  config: {
    volume: 0.8,
    balance: 0,
    speed: 1,
    crossfade: 3,
    fadeIn: true,
    fadeOut: true,
    replayGain: false
  },

  init() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.mediaSource = this.ctx.createMediaElementSource(this.audio);
    this.gainNode = this.ctx.createGain();
    this.pannerNode = this.ctx.createStereoPanner();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this._buildEQ();
    this._connect();
    this.gainNode.gain.value = this.config.volume;
    return this;
  },

  _buildEQ() {
    const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.eqNodes = freqs.map(freq => {
      const f = this.ctx.createBiquadFilter();
      f.type = freq <= 64 ? 'lowshelf' : freq >= 8000 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = 0;
      return f;
    });
    this.bassBoostNode = this.ctx.createBiquadFilter();
    this.bassBoostNode.type = 'lowshelf';
    this.bassBoostNode.frequency.value = 200;
    this.bassBoostNode.gain.value = 0;
  },

  _connect() {
    let chain = this.mediaSource;
    for (const node of this.eqNodes) { chain.connect(node); chain = node; }
    chain.connect(this.bassBoostNode);
    this.bassBoostNode.connect(this.pannerNode);
    this.pannerNode.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.isConnected = true;
  },

  async load(track) {
    if (!track || !track.path) return;
    const wasPlaying = !this.audio.paused;
    if (this.config.fadeOut && wasPlaying) {
      await this._fadeVolume(0, Math.min(this.config.crossfade, 1.5));
    }
    this.audio.src = `file://${track.path}`;
    this.audio.load();
    if (this.config.fadeIn) {
      this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    } else {
      this.gainNode.gain.setValueAtTime(this.config.volume, this.ctx.currentTime);
    }
  },

  async play() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    try {
      await this.audio.play();
      if (this.config.fadeIn) {
        await this._fadeVolume(this.config.volume, this.config.crossfade);
      }
    } catch(e) { console.warn('Play error:', e); }
  },

  pause() {
    this.audio.pause();
  },

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  },

  seek(pct) {
    if (this.audio.duration) {
      this.audio.currentTime = pct * this.audio.duration;
    }
  },

  seekTo(seconds) {
    if (this.audio.duration) this.audio.currentTime = Math.min(seconds, this.audio.duration);
  },

  setVolume(v) {
    this.config.volume = v;
    this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gainNode.gain.setValueAtTime(v, this.ctx.currentTime);
  },

  setBalance(b) {
    this.config.balance = b;
    this.pannerNode.pan.value = Math.max(-1, Math.min(1, b));
  },

  setSpeed(s) {
    this.config.speed = s;
    this.audio.playbackRate = s;
  },

  setEQBand(index, gain) {
    if (this.eqNodes[index]) this.eqNodes[index].gain.value = gain;
  },

  setEQEnabled(enabled, gains) {
    if (enabled && gains) {
      gains.forEach((g, i) => this.setEQBand(i, g));
    } else {
      this.eqNodes.forEach(n => n.gain.value = 0);
    }
  },

  setBassBoost(db) {
    this.bassBoostNode.gain.value = db;
  },

  _fadeVolume(target, duration) {
    return new Promise(resolve => {
      const t = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(t);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, t);
      this.gainNode.gain.linearRampToValueAtTime(target, t + duration);
      setTimeout(resolve, duration * 1000 + 50);
    });
  },

  getAnalyserData(type = 'frequency') {
    if (type === 'frequency') {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return data;
    } else {
      const data = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(data);
      return data;
    }
  },

  get currentTime() { return this.audio.currentTime; },
  get duration() { return this.audio.duration; },
  get paused() { return this.audio.paused; },
  get ended() { return this.audio.ended; },

  on(event, cb) { this.audio.addEventListener(event, cb); return this; },
  off(event, cb) { this.audio.removeEventListener(event, cb); return this; }
};
