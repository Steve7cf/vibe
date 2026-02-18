const Player = {
  currentTrack: null,
  currentIndex: -1,
  queue: [],
  originalQueue: [],
  shuffle: false,
  repeat: 'off',
  isPlaying: false,
  sleepTimer: null,
  isDraggingSeek: false,
  _nextQueue: [],   // "play next" items inserted at front

  init() {
    AudioEngine
      .on('ended', () => this._onEnded())
      .on('timeupdate', () => this._onTimeUpdate())
      .on('loadedmetadata', () => this._onMetadata())
      .on('error', () => this._onError());
  },

  setQueue(tracks, startIndex = 0) {
    this._nextQueue = [];
    this.queue = [...tracks];
    this.originalQueue = [...tracks];
    this.currentIndex = startIndex;
    if (this.shuffle) this._shuffleQueue(startIndex);
    this.playAt(this.currentIndex);
  },

  async playAt(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.currentIndex = index;
    this.currentTrack = this.queue[index];
    await AudioEngine.load(this.currentTrack);
    await AudioEngine.play();
    this.isPlaying = true;
    Library.recordPlay(this.currentTrack.id);
    this._updateUI();
    if (App.config.notifications) window.vibeAPI.notifyTrack(this.currentTrack);
    if (App.config.useAlbumColors && this.currentTrack.artwork) {
      Utils.extractColors(this.currentTrack.artwork).then(color => {
        if (color) Utils.applyThemeColor(color.hex);
        else Utils.restoreThemeColor();
      });
    }
    UI.renderHome();
    UI.highlightActiveTrack();
  },

  async play() {
    if (!this.currentTrack && this.queue.length) { await this.playAt(0); return; }
    await AudioEngine.play();
    this.isPlaying = true;
    this._updateUI();
  },

  pause() { AudioEngine.pause(); this.isPlaying = false; this._updateUI(); },

  toggle() { if (this.isPlaying) this.pause(); else this.play(); },

  stop() { AudioEngine.stop(); this.isPlaying = false; this._updateUI(); },

  async next() {
    if (this.repeat === 'one') { await this.playAt(this.currentIndex); return; }
    const next = this.currentIndex + 1;
    if (next >= this.queue.length) {
      if (this.repeat === 'all') await this.playAt(0);
      else { this.stop(); }
    } else {
      await this.playAt(next);
    }
  },

  async prev() {
    if (AudioEngine.currentTime > 3) { AudioEngine.seekTo(0); return; }
    const prev = this.currentIndex - 1;
    if (prev < 0) {
      if (this.repeat === 'all') await this.playAt(this.queue.length - 1);
      else AudioEngine.seekTo(0);
    } else {
      await this.playAt(prev);
    }
  },

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    if (this.shuffle) {
      this._shuffleQueue(this.currentIndex);
    } else {
      const cur = this.currentTrack;
      this.queue = [...this.originalQueue];
      this.currentIndex = cur ? this.queue.findIndex(t => t.id === cur.id) : 0;
    }
    document.getElementById('btn-shuffle')?.classList.toggle('active', this.shuffle);
    UI.renderQueue();
    App.saveSettings();
  },

  cycleRepeat() {
    const modes = ['off','all','one'];
    this.repeat = modes[(modes.indexOf(this.repeat) + 1) % modes.length];
    this._updateRepeatBtn();
    App.saveSettings();
  },

  _shuffleQueue(keepIndex) {
    const cur = this.queue[keepIndex];
    let rest = this.queue.filter((_, i) => i !== keepIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = cur ? [cur, ...rest] : rest;
    this.currentIndex = 0;
  },

  addToQueue(track) {
    this.queue.push(track);
    this.originalQueue.push(track);
    if (!this.currentTrack && this.queue.length === 1) this.playAt(0);
    UI.renderQueue();
    Utils.showToast(`Added "${track.title}" to queue`);
  },

  playNext(track) {
    // Insert right after current position
    const insertAt = this.currentIndex + 1;
    this.queue.splice(insertAt, 0, track);
    this.originalQueue.push(track);
    UI.renderQueue();
    Utils.showToast(`"${track.title}" will play next`);
  },

  addTracksToQueue(tracks, playFirst = false) {
    const wasEmpty = this.queue.length === 0;
    tracks.forEach(t => { this.queue.push(t); this.originalQueue.push(t); });
    if (wasEmpty && tracks.length > 0) this.playAt(0);
    else if (playFirst && tracks.length > 0) {
      const idx = this.queue.length - tracks.length;
      this.playAt(idx);
    }
    UI.renderQueue();
  },

  removeFromQueue(index) {
    if (index === this.currentIndex) return;
    if (index < this.currentIndex) this.currentIndex--;
    this.queue.splice(index, 1);
    UI.renderQueue();
  },

  clearQueue() {
    this.stop();
    this.queue = []; this.originalQueue = [];
    this.currentIndex = -1; this.currentTrack = null;
    UI.renderQueue();
    this._updateUI();
  },

  setSleepTimer(minutes) {
    clearTimeout(this.sleepTimer);
    if (minutes > 0) {
      this.sleepTimer = setTimeout(() => { this.pause(); Utils.showToast('Sleep timer: stopped'); }, minutes * 60000);
      Utils.showToast(`Sleep timer: ${minutes} min`);
    }
  },

  shuffleAll() {
    if (!Library.tracks.length) { Utils.showToast('No tracks in library'); return; }
    const shuffled = [...Library.tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.shuffle = true;
    document.getElementById('btn-shuffle')?.classList.add('active');
    this.queue = shuffled; this.originalQueue = [...shuffled];
    this.currentIndex = 0;
    this.playAt(0);
    UI.renderQueue();
    Utils.showToast(`Shuffling ${shuffled.length} tracks`);
  },

  _onEnded() { this.next(); },

  _onTimeUpdate() {
    if (this.isDraggingSeek) return;
    const cur = AudioEngine.currentTime;
    const dur = AudioEngine.duration || 0;
    const pct = dur > 0 ? cur / dur : 0;
    const fill = document.getElementById('seek-fill');
    const thumb = document.getElementById('seek-thumb');
    if (fill) fill.style.width = `${pct * 100}%`;
    if (thumb) thumb.style.right = `calc(100% - ${pct * 100}%)`;
    const tc = document.getElementById('time-current');
    if (tc) tc.textContent = Utils.formatTime(cur);
  },

  _onMetadata() {
    const tt = document.getElementById('time-total');
    if (tt) tt.textContent = Utils.formatTime(AudioEngine.duration);
  },

  _onError() {
    console.warn('Audio error on:', this.currentTrack?.path);
    Utils.showToast('Cannot play track — skipping');
    setTimeout(() => this.next(), 800);
  },

  _updateRepeatBtn() {
    const btn = document.getElementById('btn-repeat');
    if (!btn) return;
    btn.classList.toggle('active', this.repeat !== 'off');
    btn.title = this.repeat === 'one' ? 'Repeat One' : this.repeat === 'all' ? 'Repeat All' : 'Repeat Off';
    const icon = this.repeat === 'one'
      ? `<svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><span class="repeat-one-badge">1</span>`
      : `<svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    btn.innerHTML = icon;
  },

  _updateUI() {
    const playing = this.isPlaying;
    document.getElementById('play-icon')?.classList.toggle('hidden', playing);
    document.getElementById('pause-icon')?.classList.toggle('hidden', !playing);

    if (this.currentTrack) {
      const t = this.currentTrack;
      const title = t.title || 'Unknown Title';
      const artist = t.artist || 'Unknown Artist';

      document.getElementById('player-title').textContent = title;
      document.getElementById('player-artist').textContent = artist;

      const art = document.getElementById('player-art');
      if (art) {
        art.innerHTML = t.artwork
          ? `<img src="${t.artwork}" alt="art">`
          : `<div class="art-placeholder-inner"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      }

      document.getElementById('side-title').textContent = title;
      document.getElementById('side-artist').textContent = artist;
      document.getElementById('side-album').textContent = t.album || '';

      const sideArt = document.getElementById('side-art-img');
      if (sideArt) {
        sideArt.innerHTML = t.artwork ? `<img src="${t.artwork}" alt="art">` : '';
      }
      const placeholder = document.querySelector('.artwork-placeholder');
      if (placeholder) placeholder.style.display = t.artwork ? 'none' : 'flex';

      const likeBtn = document.getElementById('btn-like');
      if (likeBtn) {
        const liked = Library.likedIds.has(t.id);
        likeBtn.classList.toggle('liked', liked);
        likeBtn.textContent = liked ? '♥' : '♡';
      }

      document.title = `${title} — Vibe`;
      if (playing) Visualizer.start(); else Visualizer.stop();
    } else {
      document.getElementById('player-title').textContent = '—';
      document.getElementById('player-artist').textContent = '';
      document.title = 'Vibe';
      Visualizer.stop();
    }
    UI.highlightActiveTrack();
  }
};
