/* ═══════════════════════════════════════════════════════════════════
   AudioEngine — dual-element crossfade
   
   Two Audio elements (A/B) with separate GainNodes, both permanently
   wired into the Web Audio graph. Crossfade = simultaneous gain ramps.
   We NEVER clear .src mid-playback — that detaches the MediaElementSource.
   ═══════════════════════════════════════════════════════════════════ */
const AudioEngine = {
  ctx:           null,
  analyser:      null,
  pannerNode:    null,
  eqNodes:       [],
  bassBoostNode: null,
  _listeners:    {},
  _freqBuf:      null,
  _timeBuf:      null,

  _elA: null, _gainA: null, _srcA: null,
  _elB: null, _gainB: null, _srcB: null,
  _cur: 'A',          // which slot is "active" / current
  _crossfading: false,

  config: {
    volume: 0.8, balance: 0, speed: 1,
    crossfade: 3,
    gapless: false,
    gaplessOffset: 8,
  },

  // ── Getters: current vs next slot ─────────────────────────────────
  get _curEl()   { return this._cur === 'A' ? this._elA  : this._elB;  },
  get _curGain() { return this._cur === 'A' ? this._gainA : this._gainB; },
  get _nxtEl()   { return this._cur === 'A' ? this._elB  : this._elA;  },
  get _nxtGain() { return this._cur === 'A' ? this._gainB : this._gainA; },

  // ── Init ──────────────────────────────────────────────────────────
  init() {
    if (this._elA) return;
    this._elA = new Audio(); this._elA.preload = 'auto';
    this._elB = new Audio(); this._elB.preload = 'auto';
    this._fwdEvents();
  },

  _fwdEvents() {
    ['ended','timeupdate','loadedmetadata','error','canplay'].forEach(ev => {
      const handler = e => {
        // Only pass through events from the active slot
        if ((e.target === this._elA ? 'A' : 'B') !== this._cur) return;
        (this._listeners[ev] || []).forEach(cb => cb(e));
      };
      this._elA.addEventListener(ev, handler);
      this._elB.addEventListener(ev, handler);
    });
  },

  on(ev, cb) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(cb);
    return this;
  },

  // ── Build Web Audio graph ─────────────────────────────────────────
  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'playback', sampleRate: 44100,
    });

    this.pannerNode = this.ctx.createStereoPanner();
    this.analyser   = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this._buildEQ();

    // EQ chain → bass → analyser → destination
    let chain = this.pannerNode;
    for (const n of this.eqNodes) { chain.connect(n); chain = n; }
    chain.connect(this.bassBoostNode);
    this.bassBoostNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Slot A: source → gainA → panner
    this._srcA  = this.ctx.createMediaElementSource(this._elA);
    this._gainA = this.ctx.createGain();
    this._gainA.gain.value = this.config.volume;
    this._srcA.connect(this._gainA);
    this._gainA.connect(this.pannerNode);

    // Slot B: source → gainB → panner
    this._srcB  = this.ctx.createMediaElementSource(this._elB);
    this._gainB = this.ctx.createGain();
    this._gainB.gain.value = 0;   // silent until active
    this._srcB.connect(this._gainB);
    this._gainB.connect(this.pannerNode);

    this.pannerNode.pan.value  = this.config.balance;
    this._elA.playbackRate = this.config.speed;
    this._elB.playbackRate = this.config.speed;
  },

  _buildEQ() {
    const defs = [
      [32,'lowshelf'],[64,'peaking'],[125,'peaking'],[250,'peaking'],[500,'peaking'],
      [1000,'peaking'],[2000,'peaking'],[4000,'peaking'],[8000,'highshelf'],[16000,'highshelf'],
    ];
    this.eqNodes = defs.map(([f,t]) => {
      const n = this.ctx.createBiquadFilter();
      n.type = t; n.frequency.value = f; n.Q.value = 1.4; n.gain.value = 0;
      return n;
    });
    this.bassBoostNode = this.ctx.createBiquadFilter();
    this.bassBoostNode.type = 'lowshelf';
    this.bassBoostNode.frequency.value = 200;
    this.bassBoostNode.gain.value = 0;
  },

  // ── Load track into current slot (normal play / manual skip) ─────
  async load(track) {
    if (!track?.path) return;
    this._ensureCtx();
    this._crossfading = false;

    // Stop & silence the background slot (don't clear src — just pause + zero gain)
    this._nxtEl.pause();
    const t = this.ctx.currentTime;
    this._nxtGain.gain.cancelScheduledValues(t);
    this._nxtGain.gain.setValueAtTime(0, t);

    // Load new track into current slot
    this._curEl.src = `file://${track.path}`;
    this._curEl.playbackRate = this.config.speed;
    this._curEl.load();

    // Current gain: full volume
    this._curGain.gain.cancelScheduledValues(t);
    this._curGain.gain.setValueAtTime(this.config.volume, t);
  },

  async play() {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    try { await this._curEl.play(); } catch(e) { console.warn('[play]', e); }
  },

  // ── Pre-load next track into background slot ─────────────────────
  stageNext(track) {
    if (!track?.path) return;
    this._ensureCtx();
    if (this._crossfading) return;          // never disturb an active crossfade
    const url = `file://${track.path}`;
    // Already staged and buffered? Skip.
    if (this._nxtEl.src === url && this._nxtEl.readyState >= 3) return;
    this._nxtEl.src = url;
    this._nxtEl.playbackRate = this.config.speed;
    this._nxtEl.load();
    // Make sure background slot is silent
    const t = this.ctx.currentTime;
    this._nxtGain.gain.cancelScheduledValues(t);
    this._nxtGain.gain.setValueAtTime(0, t);
  },

  // ── Crossfade: both slots play simultaneously, gains cross ────────
  startCrossfade(durationSec) {
    if (this._crossfading || !this.ctx) return;
    if (!this._nxtEl.src) return;
    this._crossfading = true;

    const vol = this.config.volume;
    const dur = Math.max(1, durationSec);

    const doFade = () => {
      if (!this._crossfading) return;   // was cancelled (e.g. user skipped)
      const t = this.ctx.currentTime;

      // Start background slot from beginning
      this._nxtEl.currentTime = 0;
      this._nxtEl.playbackRate = this.config.speed;
      this._nxtEl.play().catch(e => console.warn('[xfade]', e));

      // Current OUT: existing gain → 0
      this._curGain.gain.cancelScheduledValues(t);
      this._curGain.gain.setValueAtTime(this._curGain.gain.value, t);
      this._curGain.gain.linearRampToValueAtTime(0, t + dur);

      // Next IN: 0 → vol
      this._nxtGain.gain.cancelScheduledValues(t);
      this._nxtGain.gain.setValueAtTime(0, t);
      this._nxtGain.gain.linearRampToValueAtTime(vol, t + dur);

      // Complete after ramp finishes — add generous buffer for JS timer drift
      setTimeout(() => this._completeCrossfade(vol), dur * 1000 + 300);
    };

    if (this._nxtEl.readyState >= 3) {
      doFade();
    } else {
      this._nxtEl.addEventListener('canplay', doFade, { once: true });
      setTimeout(() => { if (this._crossfading) doFade(); }, 2000);
    }
  },

  _completeCrossfade(vol) {
    if (!this._crossfading) return;   // was cancelled already
    const t   = this.ctx.currentTime;
    const vol_ = vol ?? this.config.volume;

    // Snapshot gain references BEFORE flipping
    const outGain = this._curGain;   // was fading out → should be at 0
    const inGain  = this._nxtGain;   // was fading in  → should be at vol

    // Force exact values — eliminate any scheduler drift
    outGain.gain.cancelScheduledValues(t);
    outGain.gain.setValueAtTime(0, t);

    inGain.gain.cancelScheduledValues(t);
    inGain.gain.setValueAtTime(vol_, t);

    // Pause the outgoing element (don't clear src — safe for MediaElementSource)
    this._curEl.pause();

    // Flip: background becomes current
    this._cur = this._cur === 'A' ? 'B' : 'A';

    // Double-check: new current gain must be at full volume after flip
    // (curGain getter now returns what was inGain)
    this._curGain.gain.cancelScheduledValues(t);
    this._curGain.gain.setValueAtTime(vol_, t);

    this._crossfading = false;
    (this._listeners['crossfade-done'] || []).forEach(cb => cb());
  },

  // ── Standard controls ─────────────────────────────────────────────
  pause() {
    this._curEl?.pause();
    if (this._crossfading) {
      this._nxtEl?.pause();
      this._crossfading = false;
    }
  },

  stop() {
    this._crossfading = false;
    this._curEl?.pause();
    this._nxtEl?.pause();
    if (this._curEl)  this._curEl.currentTime  = 0;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this._curGain?.gain.cancelScheduledValues(t);
      this._curGain?.gain.setValueAtTime(this.config.volume, t);
      this._nxtGain?.gain.cancelScheduledValues(t);
      this._nxtGain?.gain.setValueAtTime(0, t);
    }
  },

  seek(pct) {
    this._crossfading = false;
    if (this._curEl?.duration) this._curEl.currentTime = pct * this._curEl.duration;
  },

  seekTo(s) {
    this._crossfading = false;
    if (this._curEl?.duration)
      this._curEl.currentTime = Math.max(0, Math.min(s, this._curEl.duration));
  },

  setVolume(v) {
    this.config.volume = v;
    if (!this.ctx || this._crossfading) return;
    const t = this.ctx.currentTime;
    this._curGain?.gain.cancelScheduledValues(t);
    this._curGain?.gain.setValueAtTime(v, t);
  },

  setBalance(b) {
    this.config.balance = b;
    if (this.pannerNode) this.pannerNode.pan.value = Math.max(-1, Math.min(1, b));
  },

  setSpeed(s) {
    this.config.speed = s;
    if (this._elA) this._elA.playbackRate = s;
    if (this._elB) this._elB.playbackRate = s;
  },

  setEQBand(i, g)     { if (this.eqNodes[i]) this.eqNodes[i].gain.value = g; },
  setEQEnabled(on, g) {
    if (on && g) g.forEach((v, i) => this.setEQBand(i, v));
    else this.eqNodes.forEach(n => n && (n.gain.value = 0));
  },
  setBassBoost(db) { if (this.bassBoostNode) this.bassBoostNode.gain.value = db; },

  preloadNext(track) { if (this.ctx) this.stageNext(track); },

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

  get currentTime() { return this._curEl?.currentTime || 0; },
  get duration()    { return this._curEl?.duration    || 0; },
  get paused()      { return this._curEl?.paused      ?? true; },
};
