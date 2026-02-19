/* ══════════════════════════════════════════════════════════════════
   Player — queue, gapless preload, album color theming
   ══════════════════════════════════════════════════════════════════ */
const Player = {
  currentTrack: null,
  currentIndex: -1,
  queue: [],
  originalQueue: [],
  shuffle: false,
  repeat: 'off',      // 'off' | 'all' | 'one'
  isPlaying: false,
  isDraggingSeek: false,
  _sleepTimer: null,
  _tickLast: 0,

  init() {
    AudioEngine
      .on('ended',          () => this._onEnded())
      .on('timeupdate',     () => this._onTick())
      .on('loadedmetadata', () => this._onMeta())
      .on('error',          () => this._onError());
  },

  // ── Queue ───────────────────────────────────────────────────────────────────
  setQueue(tracks, startAt = 0) {
    this.queue         = [...tracks];
    this.originalQueue = [...tracks];
    if (this.shuffle) { this._doShuffle(startAt); startAt = 0; }
    this._play(startAt);
  },

  async _play(idx) {
    if (idx < 0 || idx >= this.queue.length) return;
    this.currentIndex = idx;
    this.currentTrack = this.queue[idx];
    await AudioEngine.load(this.currentTrack);
    await AudioEngine.play();
    this.isPlaying = true;
    Library.recordPlay(this.currentTrack.id);
    const next = this.queue[idx + 1];
    if (next) AudioEngine.preloadNext(next);
    this._updateUI();
    this._applyAlbumColor();
    UI.highlightActive();
    UI.syncNowPlaying();
    if (App.config.notifications) window.vibeAPI.notifyTrack(this.currentTrack);
  },

  play()    { if (!this.currentTrack && this.queue.length) { this._play(0); return; } AudioEngine.play().then(() => { this.isPlaying = true; this._updateUI(); }); },
  pause()   { AudioEngine.pause(); this.isPlaying = false; this._updateUI(); },
  toggle()  { this.isPlaying ? this.pause() : this.play(); },
  stop()    { AudioEngine.stop(); this.isPlaying = false; this._updateUI(); },
  playAt(i) { this._play(i); },

  async next() {
    if (this.repeat === 'one') { await this._play(this.currentIndex); return; }
    const n = this.currentIndex + 1;
    n >= this.queue.length ? (this.repeat === 'all' ? this._play(0) : this.stop()) : this._play(n);
  },

  prev() {
    if (AudioEngine.currentTime > 3) { AudioEngine.seekTo(0); return; }
    const p = this.currentIndex - 1;
    p < 0 ? (this.repeat === 'all' ? this._play(this.queue.length - 1) : AudioEngine.seekTo(0)) : this._play(p);
  },

  addToQueue(track) {
    this.queue.push(track); this.originalQueue.push(track);
    if (!this.currentTrack) this._play(0);
    UI.renderQueue();
    Utils.toast(`Queued "${track.title || '?'}"`);
  },

  playNext(track) {
    this.queue.splice(this.currentIndex + 1, 0, track);
    this.originalQueue.push(track);
    UI.renderQueue();
    Utils.toast(`"${track.title || '?'}" plays next`);
  },

  addTracksToQueue(tracks, autoPlay) {
    const si = this.queue.length;
    tracks.forEach(t => { this.queue.push(t); this.originalQueue.push(t); });
    if (autoPlay && !this.currentTrack) this._play(si);
    UI.renderQueue();
  },

  removeFromQueue(i) {
    if (i === this.currentIndex) return;
    if (i < this.currentIndex) this.currentIndex--;
    this.queue.splice(i, 1);
    UI.renderQueue();
  },

  clearQueue() {
    this.stop();
    this.queue = []; this.originalQueue = [];
    this.currentIndex = -1; this.currentTrack = null;
    this._updateUI(); UI.renderQueue();
  },

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    if (this.shuffle) { this._doShuffle(this.currentIndex); }
    else {
      const cur = this.currentTrack;
      this.queue = [...this.originalQueue];
      this.currentIndex = cur ? this.queue.findIndex(t => t.id === cur.id) : 0;
    }
    document.getElementById('btn-shuffle')?.classList.toggle('active', this.shuffle);
    UI.renderQueue(); App.save();
  },

  cycleRepeat() {
    this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat];
    this._updateRepeatBtn(); App.save();
  },

  shuffleAll() {
    if (!Library.tracks.length) { Utils.toast('No tracks in library'); return; }
    this.shuffle = true;
    document.getElementById('btn-shuffle')?.classList.add('active');
    this.setQueue([...Library.tracks], Math.floor(Math.random() * Library.tracks.length));
    Utils.toast(`Shuffling ${Library.tracks.length} tracks`);
  },

  playTodayMix() {
    const mix = App.getTodayMixTracks();
    if (!mix.length) { Utils.toast('Add some music first'); return; }
    this.setQueue(mix, 0);
    Utils.toast('▶ Today Mix playing');
  },

  setSleepTimer(mins) {
    clearTimeout(this._sleepTimer);
    if (mins > 0) {
      this._sleepTimer = setTimeout(() => { this.pause(); Utils.toast('Sleep timer — paused ✓'); }, mins * 60000);
      Utils.toast(`Sleep in ${mins} min`);
    }
  },

  _doShuffle(keepIdx) {
    const cur  = this.queue[keepIdx];
    const rest = this.queue.filter((_, i) => i !== keepIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = cur ? [cur, ...rest] : rest;
    this.currentIndex = 0;
  },

  async _applyAlbumColor() {
    if (!App.config.useAlbumColors || !this.currentTrack?.artwork) {
      Utils.applyAccent(App.config.accentColor || '#1db954'); return;
    }
    const hex = await Utils.extractColor(this.currentTrack.artwork);
    Utils.applyAccent(hex || App.config.accentColor || '#1db954');
  },

  _onEnded() { this.next(); },
  _onError() { console.warn('[Player] error on', this.currentTrack?.path); setTimeout(() => this.next(), 900); },

  _onMeta() {
    const d = Utils.formatTime(AudioEngine.duration);
    const a = document.getElementById('time-tot'); if (a) a.textContent = d;
    const b = document.getElementById('np-dur');    if (b) b.textContent = d;
  },

  // Throttled tick — 250ms max update rate keeps CPU idle when nothing changes
  _onTick() {
    const now = Date.now();
    if (now - this._tickLast < 250) return;
    this._tickLast = now;
    if (this.isDraggingSeek) return;
    const cur = AudioEngine.currentTime, dur = AudioEngine.duration || 0;
    const pct = dur > 0 ? cur / dur : 0;
    const w   = `${pct * 100}%`;
    const sf = document.getElementById('seek-fill'); if (sf) sf.style.width = w;
    const tc = document.getElementById('time-cur'); if (tc) tc.textContent = Utils.formatTime(cur);
    if (!document.getElementById('now-playing').classList.contains('hidden')) {
      const nf = document.getElementById('np-seek-fill'); if (nf) nf.style.width = w;
      const nc = document.getElementById('np-cur'); if (nc) nc.textContent = Utils.formatTime(cur);
    }
    const next = this.queue[this.currentIndex + 1];
    if (next && dur > 0 && (dur - cur) < 20) AudioEngine.preloadNext(next);
  },

  _updateRepeatBtn() {
    const btn = document.getElementById('btn-repeat'); if (!btn) return;
    btn.classList.toggle('active', this.repeat !== 'off');
    btn.querySelector('.r1-badge')?.remove();
    if (this.repeat === 'one') {
      const b = Object.assign(document.createElement('span'), { className: 'r1-badge', textContent: '1' });
      btn.appendChild(b);
    }
  },

  _updateUI() {
    const t = this.currentTrack, on = this.isPlaying;
    document.getElementById('play-icon')?.classList.toggle('hidden', on);
    document.getElementById('pause-icon')?.classList.toggle('hidden', !on);
    document.getElementById('np-play-icon')?.classList.toggle('hidden', on);
    document.getElementById('np-pause-icon')?.classList.toggle('hidden', !on);

    if (!t) {
      document.getElementById('player-title').textContent  = '—';
      document.getElementById('player-artist').textContent = '';
      document.getElementById('player-art').innerHTML = `<div class="art-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      const si = document.getElementById('side-art-img'); if (si) si.innerHTML = '';
      const sp = document.getElementById('side-art-ph');  if (sp) sp.style.display = 'flex';
      document.getElementById('side-title').textContent  = 'No track playing';
      document.getElementById('side-artist').textContent = '';
      document.getElementById('side-album').textContent  = '';
      document.title = 'Vibe';
      Visualizer.stop(); return;
    }

    const st = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    st('player-title',  t.title  || '—');
    st('player-artist', t.artist || '');
    st('side-title',    t.title  || '—');
    st('side-artist',   t.artist || '');
    st('side-album',    t.album  || '');
    st('np-title',      t.title  || '—');
    st('np-artist',     t.artist || '');
    st('np-album',      t.album  || '');

    const artH = t.artwork
      ? `<img src="${t.artwork}" alt="">`
      : `<div class="art-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
    document.getElementById('player-art').innerHTML = artH;

    const na = document.getElementById('np-art');     if (na) na.innerHTML = t.artwork ? `<img src="${t.artwork}" alt="">` : '';
    const sa = document.getElementById('side-art-img'); if (sa) sa.innerHTML = t.artwork ? `<img src="${t.artwork}" alt="">` : '';
    const sp = document.getElementById('side-art-ph');  if (sp) sp.style.display = t.artwork ? 'none' : 'flex';
    const nb = document.getElementById('np-bg');       if (nb) nb.style.backgroundImage = t.artwork ? `url('${t.artwork}')` : 'none';

    const liked = Library.likedIds.has(t.id);
    ['btn-like', 'np-like'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.classList.toggle('liked', liked);
      el.textContent = liked ? '♥' : '♡';
    });

    document.title = `${t.title || '—'} — Vibe`;
    if (on) Visualizer.start(App.config.visualizerMode || 'bars'); else Visualizer.stop();
  },
};
