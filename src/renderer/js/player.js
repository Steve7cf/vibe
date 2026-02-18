/**
 * Vibe — Player Controller
 * Handles playback logic, UI sync, and session management
 */

import { formatTime, formatTrackMeta } from './utils.js';

export class PlayerController {
  constructor(state, audio, queue, visualizer, toast) {
    this.state = state;
    this.audio = audio;
    this.queue = queue;
    this.visualizer = visualizer;
    this.toast = toast;
    this._sleepTimerId = null;

    this.bindUI();
    this.bindAudioEvents();
    this.bindStateWatchers();
  }

  // ── UI Binding ─────────────────────────────────────────────────────
  bindUI() {
    // Playback bar buttons
    document.getElementById('btn-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-next')?.addEventListener('click', () => this.next());
    document.getElementById('btn-prev')?.addEventListener('click', () => this.previous());
    document.getElementById('btn-shuffle')?.addEventListener('click', () => this.toggleShuffle());
    document.getElementById('btn-repeat')?.addEventListener('click', () => this.cycleRepeat());

    // Mute
    document.getElementById('btn-mute')?.addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-pb-like')?.addEventListener('click', () => this.toggleLike());

    // Speed
    document.getElementById('speed-select')?.addEventListener('change', (e) => {
      this.audio.setPlaybackRate(parseFloat(e.target.value));
    });

    // Seek bar
    this.initSeekBar();
    this.initVolumeSlider();

    // Window controls
    document.getElementById('btn-minimize')?.addEventListener('click', () =>
      window.vibeAPI.send('window:minimize'));
    document.getElementById('btn-maximize')?.addEventListener('click', () =>
      window.vibeAPI.send('window:maximize'));
    document.getElementById('btn-close')?.addEventListener('click', () =>
      window.vibeAPI.send('window:close'));

    // Mini player
    document.getElementById('btn-visualizer')?.addEventListener('click', () =>
      this.visualizer.cycleMode());

    // Track info click → scroll to current in library
    document.getElementById('pb-title')?.addEventListener('click', () => {
      const t = this.state.get('currentTrack');
      if (t) this.scrollToCurrentTrack();
    });
  }

  initSeekBar() {
    const wrapper = document.getElementById('pb-seekbar-wrapper');
    const fill = document.getElementById('pb-seekbar-fill');
    const thumb = document.getElementById('pb-seekbar-thumb');
    let isDragging = false;

    const setPercent = (e) => {
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      fill.style.width = `${pct * 100}%`;
      thumb.style.left = `${pct * 100}%`;
      return pct;
    };

    wrapper.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.classList.add('dragging');
      const pct = setPercent(e);
      this.audio.seekByPercent(pct);
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      setPercent(e);
    });

    document.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('dragging');
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.audio.seekByPercent(pct);
    });
  }

  initVolumeSlider() {
    const wrapper = document.getElementById('volume-slider-wrapper');
    const fill = document.getElementById('volume-fill');
    const thumb = document.getElementById('volume-thumb');
    const valLabel = document.getElementById('volume-value');
    let isDragging = false;

    const setPercent = (e) => {
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.audio.setVolume(pct);
      fill.style.width = `${pct * 100}%`;
      thumb.style.left = `${pct * 100}%`;
      valLabel.textContent = `${Math.round(pct * 100)}%`;
    };

    wrapper.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.classList.add('dragging');
      setPercent(e);
    });

    document.addEventListener('mousemove', (e) => { if (isDragging) setPercent(e); });
    document.addEventListener('mouseup', () => {
      if (isDragging) { isDragging = false; document.body.classList.remove('dragging'); }
    });

    // Mouse wheel on volume
    document.getElementById('pb-volume')?.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const newVol = Math.max(0, Math.min(1, this.state.get('volume') + delta));
      this.audio.setVolume(newVol);
      this.updateVolumeUI(newVol);
    }, { passive: false });
  }

  // ── Audio Events ──────────────────────────────────────────────────
  bindAudioEvents() {
    this.audio.on('trackEnded', () => this.onTrackEnded());
    this.audio.on('crossfadeStart', () => this.onCrossfadeStart());
    this.audio.on('trackError', (e) => {
      console.error('Audio error:', e);
      this.toast.show('Playback error — skipping track', 'error');
      this.next();
    });
    this.audio.on('canPlay', () => {
      this.state.set('isPlaying', true);
    });
  }

  // ── State Watchers ────────────────────────────────────────────────
  bindStateWatchers() {
    this.state.on('currentTrack', (track) => this.onTrackChange(track));
    this.state.on('isPlaying', (v) => this.updatePlayPauseUI(v));
    this.state.on('currentTime', (t) => this.updateSeekUI(t));
    this.state.on('volume', (v) => this.updateVolumeUI(v));
    this.state.on('shuffle', (v) => this.updateShuffleUI(v));
    this.state.on('repeat', (v) => this.updateRepeatUI(v));
    this.state.on('isMuted', (v) => this.updateMuteUI(v));
  }

  // ── Playback Commands ─────────────────────────────────────────────
  async playTrack(track, addToRecent = true) {
    this.state.set('currentTrack', track);
    this.state.set('isPlaying', true);
    this.state.set('isPaused', false);

    await this.audio.loadTrack(track, true);

    if (addToRecent) this.addToRecent(track);

    // Notify tray
    window.vibeAPI.send('tray:updateTrack', {
      title: track.title,
      artist: track.artist,
    });

    // System notification
    window.vibeAPI.send('system:notification', {
      title: track.title,
      body: `${track.artist} — ${track.album}`,
    });

    // Persist session
    this.state.persistSession();

    // Resume AudioContext if suspended
    if (this.audio.ctx.state === 'suspended') {
      await this.audio.ctx.resume();
    }
  }

  async togglePlay() {
    const track = this.state.get('currentTrack');
    if (!track) return;

    if (this.audio.isPlaying) {
      this.audio.pause();
      this.state.set('isPlaying', false);
      this.state.set('isPaused', true);
    } else {
      await this.audio.play();
      this.state.set('isPlaying', true);
      this.state.set('isPaused', false);
    }
  }

  stop() {
    this.audio.stop();
    this.state.set('isPlaying', false);
    this.state.set('isPaused', false);
  }

  async next() {
    const nextTrack = this.queue.getNext();
    if (nextTrack) {
      await this.playTrack(nextTrack);
    } else {
      this.stop();
    }
  }

  async previous() {
    // If more than 3 seconds into track, restart it
    if (this.audio.currentTime > 3) {
      this.audio.seek(0);
      return;
    }
    const prevTrack = this.queue.getPrev();
    if (prevTrack) await this.playTrack(prevTrack);
  }

  async onTrackEnded() {
    const repeat = this.state.get('repeat');
    if (repeat === 'one') {
      this.audio.seek(0);
      await this.audio.play();
    } else {
      await this.next();
    }
  }

  onCrossfadeStart() {
    // Preload next track during crossfade
    const next = this.queue.peekNext();
    if (next) {
      this.audio.loadTrack(next, false); // load but don't play
    }
  }

  toggleShuffle() {
    const newVal = !this.state.get('shuffle');
    this.state.set('shuffle', newVal);
    this.state.updateConfig('playback.shuffle', newVal);
    this.queue.rebuildIfNeeded();
  }

  cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    const cur = this.state.get('repeat');
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    this.state.set('repeat', next);
    this.state.updateConfig('playback.repeat', next);
  }

  toggleMute() {
    const muted = !this.state.get('isMuted');
    this.audio.setMute(muted);
  }

  toggleLike() {
    const track = this.state.get('currentTrack');
    if (!track) return;
    const liked = new Set(this.state.get('likedTracks'));
    if (liked.has(track.path)) liked.delete(track.path);
    else liked.add(track.path);
    this.state.set('likedTracks', liked);
    this.updateLikeUI(liked.has(track.path));
    this.state.persistSession();
  }

  // ── UI Updates ─────────────────────────────────────────────────────
  onTrackChange(track) {
    if (!track) return;
    document.getElementById('pb-title').textContent = track.title;
    document.getElementById('pb-artist').textContent = track.artist;
    document.getElementById('hero-track-title').textContent = track.title;
    document.getElementById('hero-track-artist').textContent = track.artist;
    document.getElementById('hero-track-album').textContent = track.album;

    // Badges
    const fmtBadge = document.getElementById('hero-format-badge');
    const yearBadge = document.getElementById('hero-year-badge');
    if (track.format) {
      fmtBadge.textContent = track.format;
      fmtBadge.className = 'meta-badge';
    }
    if (track.year) {
      yearBadge.textContent = track.year;
      yearBadge.className = 'meta-badge';
    }

    // Artwork
    this.updateArtwork(track.artwork);

    // Like button
    this.updateLikeUI(this.state.get('likedTracks').has(track.path));

    // Speed reset
    const speedSel = document.getElementById('speed-select');
    if (speedSel) speedSel.value = '1';

    this.visualizer.start();
  }

  updateArtwork(artworkUrl) {
    const setArt = (id, placeholderId) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (artworkUrl) {
        let img = el.querySelector('img');
        if (!img) { img = document.createElement('img'); el.appendChild(img); }
        img.src = artworkUrl;
        img.alt = 'Album art';
        const ph = document.getElementById(placeholderId);
        if (ph) ph.style.display = 'none';
      } else {
        const img = el.querySelector('img');
        if (img) img.src = '';
        const ph = document.getElementById(placeholderId);
        if (ph) ph.style.display = '';
      }
    };
    setArt('hero-artwork', 'hero-artwork-placeholder');
    setArt('pb-artwork', 'pb-artwork-placeholder');
  }

  updatePlayPauseUI(isPlaying) {
    const iconPlay = document.querySelector('#btn-play .icon-play');
    const iconPause = document.querySelector('#btn-play .icon-pause');
    if (!iconPlay || !iconPause) return;
    iconPlay.classList.toggle('hidden', isPlaying);
    iconPause.classList.toggle('hidden', !isPlaying);

    // Hero artwork animation
    const heroArt = document.getElementById('hero-artwork');
    if (heroArt) heroArt.classList.toggle('playing', isPlaying);
  }

  updateSeekUI(currentTime) {
    const duration = this.state.get('duration') || this.audio.duration;
    const pct = duration > 0 ? currentTime / duration : 0;
    const fill = document.getElementById('pb-seekbar-fill');
    const thumb = document.getElementById('pb-seekbar-thumb');
    const timeEl = document.getElementById('pb-time-current');
    const durEl = document.getElementById('pb-time-total');

    if (fill) fill.style.width = `${pct * 100}%`;
    if (thumb) thumb.style.left = `${pct * 100}%`;
    if (timeEl) timeEl.textContent = formatTime(currentTime);
    if (durEl) durEl.textContent = formatTime(duration);
  }

  updateVolumeUI(vol) {
    const pct = vol * 100;
    const fill = document.getElementById('volume-fill');
    const thumb = document.getElementById('volume-thumb');
    const label = document.getElementById('volume-value');
    if (fill) fill.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;
    if (label) label.textContent = `${Math.round(pct)}%`;
  }

  updateShuffleUI(active) {
    document.getElementById('btn-shuffle')?.classList.toggle('active', active);
  }

  updateRepeatUI(mode) {
    const btn = document.getElementById('btn-repeat');
    if (!btn) return;
    btn.classList.toggle('active', mode !== 'off');
    // Change icon for repeat-one
    const svg = btn.querySelector('svg');
    if (mode === 'one' && svg) {
      svg.innerHTML = '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2v-5h-1l-2 1v1h1.5v3H13z" fill="currentColor"/>';
    } else if (svg) {
      svg.innerHTML = '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" fill="currentColor"/>';
    }
  }

  updateMuteUI(muted) {
    document.getElementById('icon-vol-high')?.classList.toggle('hidden', muted);
    document.getElementById('icon-vol-mute')?.classList.toggle('hidden', !muted);
  }

  updateLikeUI(liked) {
    document.getElementById('btn-pb-like')?.classList.toggle('active', liked);
    document.getElementById('btn-hero-like')?.classList.toggle('active', liked);
  }

  // ── Session ───────────────────────────────────────────────────────
  restoreSession(session) {
    if (!session || !session.currentTrackPath) return;

    // Find track in library
    const library = this.state.get('library');
    const track = library.find(t => t.path === session.currentTrackPath);
    if (!track) return;

    this.state.set('currentTrack', track);
    this.state.set('volume', session.volume || 0.8);
    this.state.set('shuffle', session.shuffle || false);
    this.state.set('repeat', session.repeat || 'off');

    // Restore queue
    if (session.queue?.length) {
      const queueTracks = session.queue
        .map(p => library.find(t => t.path === p))
        .filter(Boolean);
      this.queue.setQueue(queueTracks, session.currentIndex || 0);
    }

    // Update UI
    this.onTrackChange(track);
    this.updateVolumeUI(this.state.get('volume'));
    this.audio.setVolume(this.state.get('volume'));
    this.updateShuffleUI(this.state.get('shuffle'));
    this.updateRepeatUI(this.state.get('repeat'));
    this.updateSeekUI(session.currentTime || 0);
  }

  addToRecent(track) {
    const recent = this.state.get('recentlyPlayed');
    const filtered = recent.filter(t => t.path !== track.path);
    filtered.unshift(track);
    this.state.set('recentlyPlayed', filtered.slice(0, 30));
  }

  scrollToCurrentTrack() {
    const current = this.state.get('currentTrack');
    if (!current) return;
    const el = document.querySelector(`[data-track-path="${CSS.escape(current.path)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Sleep Timer ───────────────────────────────────────────────────
  setSleepTimer(minutes) {
    if (this._sleepTimerId) clearTimeout(this._sleepTimerId);
    if (!minutes) { this.state.set('sleepTimer', null); return; }

    const ms = minutes * 60 * 1000;
    this._sleepTimerId = setTimeout(() => {
      this.stop();
      this.state.set('sleepTimer', null);
      this.toast.show(`Sleep timer: stopped after ${minutes} minutes`);
    }, ms);

    const endTime = Date.now() + ms;
    this.state.set('sleepTimer', endTime);
    this.toast.show(`Sleep timer set for ${minutes} minutes`, 'success');
  }
}
