const UI = {
  currentView: 'home',
  currentLibTab: 'all',
  currentPlaylistId: null,
  searchQuery: '',
  contextTarget: null,
  _scanBusy: false,   // renderer-side guard: prevent rapid double-clicks opening dialogs

  init() {
    this._bindNav();
    this._bindControls();
    this._bindSearch();
    this._bindDropGlobal();
    this._bindContextMenu();
    this._bindSeek();
    this._bindVolume();
    this._bindWindowControls();
    this._bindFileButtons();   // ← called ONCE here, never again
    this._bindSpeedPopup();
    this._bindLibraryTabs();
    this._bindPlaylistActions();
    this._bindSettingsPanel();
    this._bindQueueActions();

    // Home view event delegation — handles dynamically-rendered home buttons
    document.getElementById('view-home').addEventListener('click', e => {
      const btn = e.target.closest('button, [data-action]');
      if (!btn) return;
      const action = btn.id || btn.dataset.action;

      if (action === 'btn-shuffle-all') { Player.shuffleAll(); return; }
      if (action === 'home-add-files')  { this._doAddFiles(); return; }
      if (action === 'home-scan-folder'){ this._doScanFolder(); return; }
      if (action === 'drop-zone-home')  { this._doAddFiles(); return; }

      const card = e.target.closest('.track-card');
      if (card && e.target.closest('.card-play-btn')) {
        e.stopPropagation();
        const idx = Library.tracks.findIndex(t => t.id === card.dataset.id);
        if (idx >= 0) Player.setQueue(Library.tracks, idx);
        return;
      }
      if (card && e.detail === 2) {
        const idx = Library.tracks.findIndex(t => t.id === card.dataset.id);
        if (idx >= 0) Player.setQueue(Library.tracks, idx);
        return;
      }

      const nextBtn  = e.target.closest('.add-next-btn');
      const queueBtn = e.target.closest('.add-queue-btn');
      if (nextBtn)  { const t = Library.tracks.find(t => t.id === nextBtn.dataset.id);  if (t) Player.playNext(t); return; }
      if (queueBtn) { const t = Library.tracks.find(t => t.id === queueBtn.dataset.id); if (t) Player.addToQueue(t); return; }
    });
  },

  // ── shared async helpers (renderer-side guard prevents double-open) ─────────
  async _doAddFiles() {
    if (this._scanBusy) return;
    this._scanBusy = true;
    try {
      const files = await window.vibeAPI.openFiles();
      if (files?.length) await this._addAndPlay(files);
    } finally { this._scanBusy = false; }
  },

  async _doScanFolder() {
    if (this._scanBusy) return;
    this._scanBusy = true;
    try {
      const folders = await window.vibeAPI.openFolder();
      if (!folders?.length) return;
      Utils.showToast('Scanning…');
      let total = 0;
      for (const f of folders) {
        const tracks = await Library.scanFolder(f);
        total += tracks.length;
        if (!App.config.folders) App.config.folders = [];
        if (!App.config.folders.includes(f)) App.config.folders.push(f);
      }
      App.saveSettings();
      this.renderHome();
      this.renderLibrary(this.currentLibTab);
      this.renderLibraryFolders();
      Utils.showToast(`Found ${total} track${total !== 1 ? 's' : ''}`);
    } finally { this._scanBusy = false; }
  },

  // ── navigation ──────────────────────────────────────────────────────────────
  _bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.addEventListener('click', () => this.showView(btn.dataset.view))
    );
    document.getElementById('create-playlist-btn')?.addEventListener('click', () => this._createPlaylistModal());
  },

  showView(name) {
    this.currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById(`view-${name}`)?.classList.add('active');
    if      (name === 'home')      this.renderHome();
    else if (name === 'library')   this.renderLibrary(this.currentLibTab, this.searchQuery);
    else if (name === 'queue')     this.renderQueue();
    else if (name === 'playlists') this.renderPlaylists();
  },

  // ── player controls ─────────────────────────────────────────────────────────
  _bindControls() {
    document.getElementById('btn-play').addEventListener('click',    () => Player.toggle());
    document.getElementById('btn-prev').addEventListener('click',    () => Player.prev());
    document.getElementById('btn-next').addEventListener('click',    () => Player.next());
    document.getElementById('btn-stop').addEventListener('click',    () => Player.stop());
    document.getElementById('btn-shuffle').addEventListener('click', () => Player.toggleShuffle());
    document.getElementById('btn-repeat').addEventListener('click',  () => Player.cycleRepeat());
    document.getElementById('btn-mute').addEventListener('click',    () => this._toggleMute());
    document.getElementById('btn-mini').addEventListener('click',    () => window.vibeAPI.windowControl('minimize'));
    document.getElementById('btn-like').addEventListener('click', () => {
      if (!Player.currentTrack) return;
      const liked = Library.toggleLike(Player.currentTrack.id);
      const btn = document.getElementById('btn-like');
      btn.classList.toggle('liked', liked);
      btn.textContent = liked ? '♥' : '♡';
    });
  },

  // ── search ──────────────────────────────────────────────────────────────────
  _bindSearch() {
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');
    if (!input) return;
    input.addEventListener('input', Utils.debounce(e => {
      this.searchQuery = e.target.value.trim();
      clear.classList.toggle('visible', !!this.searchQuery);
      if (this.searchQuery) { this.showView('library'); this.renderLibrary('all', this.searchQuery); }
    }, 220));
    clear.addEventListener('click', () => {
      input.value = ''; this.searchQuery = '';
      clear.classList.remove('visible');
      this.renderLibrary('all');
    });
  },

  // ── drag-and-drop ───────────────────────────────────────────────────────────
  _bindDropGlobal() {
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', async e => {
      e.preventDefault();
      const files = [...(e.dataTransfer.files||[])]
        .map(f => f.path)
        .filter(p => /\.(mp3|wav|flac|ogg|m4a|aac|wma|opus)$/i.test(p));
      if (files.length) await this._addAndPlay(files);
    });
  },

  async _addAndPlay(paths) {
    Utils.showToast(`Loading ${paths.length} track${paths.length > 1 ? 's' : ''}…`);
    const tracks = await Library.addFiles(paths);
    if (tracks.length) {
      Player.addTracksToQueue(tracks, true);
      this.renderHome();
      this.renderLibrary(this.currentLibTab);
      this.renderSidebarPlaylists();
    }
  },

  // ── context menu ────────────────────────────────────────────────────────────
  _bindContextMenu() {
    const menu = document.getElementById('context-menu');
    document.addEventListener('contextmenu', e => {
      const item = e.target.closest('[data-id]');
      if (!item) { menu.classList.add('hidden'); return; }
      e.preventDefault();
      this.contextTarget = { id: item.dataset.id };
      const x = Math.min(e.clientX, window.innerWidth - 220);
      const y = Math.min(e.clientY, window.innerHeight - 220);
      menu.style.left = x + 'px';
      menu.style.top  = y + 'px';
      menu.classList.remove('hidden');
    });
    document.addEventListener('click',   () => menu.classList.add('hidden'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.classList.add('hidden'); });

    const ctxTrack = () => this.contextTarget && Library.tracks.find(t => t.id === this.contextTarget.id);
    document.getElementById('ctx-play').addEventListener('click', () => {
      const t = ctxTrack(); if (!t) return;
      Player.setQueue(Library.tracks, Library.tracks.indexOf(t));
    });
    document.getElementById('ctx-play-next').addEventListener('click', () => { const t = ctxTrack(); if (t) Player.playNext(t); });
    document.getElementById('ctx-queue').addEventListener('click',     () => { const t = ctxTrack(); if (t) Player.addToQueue(t); });
    document.getElementById('ctx-playlist').addEventListener('click',  () => { if (this.contextTarget) this._showAddToPlaylistModal(this.contextTarget.id); });
    document.getElementById('ctx-info').addEventListener('click',      () => { const t = ctxTrack(); if (t) this._showTrackInfo(t); });
    document.getElementById('ctx-remove').addEventListener('click',    () => {
      if (!this.contextTarget) return;
      Library.removeTrack(this.contextTarget.id);
      this.renderHome(); this.renderLibrary(this.currentLibTab);
      Utils.showToast('Track removed');
    });
  },

  // ── seek bar ────────────────────────────────────────────────────────────────
  _bindSeek() {
    const bar = document.getElementById('seek-bar');
    if (!bar) return;
    let dragging = false;
    const getPct = e => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1,(e.clientX-r.left)/r.width)); };
    bar.addEventListener('mousedown', e => { dragging = true; Player.isDraggingSeek = true; AudioEngine.seek(getPct(e)); });
    document.addEventListener('mousemove', e => { if (!dragging) return; document.getElementById('seek-fill').style.width = `${getPct(e)*100}%`; });
    document.addEventListener('mouseup',   e => { if (!dragging) return; dragging = false; Player.isDraggingSeek = false; AudioEngine.seek(getPct(e)); });
  },

  // ── volume / mute ───────────────────────────────────────────────────────────
  _muteVol: 0.8, _muted: false,
  _toggleMute() {
    this._muted = !this._muted;
    const v = this._muted ? 0 : this._muteVol;
    if (!this._muted) this._muteVol = AudioEngine.config.volume || 0.8;
    AudioEngine.setVolume(v);
    const s = document.getElementById('volume-slider');
    if (s) { s.value = v; this._updateVolSlider(v); }
  },
  _updateVolSlider(val) {
    document.getElementById('volume-slider')?.style.setProperty('--vol', `${val*100}%`);
  },
  _bindVolume() {
    document.getElementById('volume-slider')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      AudioEngine.setVolume(v);
      this._muteVol = v;
      this._updateVolSlider(v);
    });
  },

  // ── window controls ─────────────────────────────────────────────────────────
  _bindWindowControls() {
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.vibeAPI.windowControl('minimize'));
    document.getElementById('btn-maximize')?.addEventListener('click', () => window.vibeAPI.windowControl('maximize'));
    document.getElementById('btn-close')?.addEventListener('click',   () => window.vibeAPI.windowControl('close'));
  },

  // ── file buttons — bound ONCE from init(), never from renderHome ─────────────
  _bindFileButtons() {
    document.getElementById('btn-add-files')?.addEventListener('click',   () => this._doAddFiles());
    document.getElementById('btn-scan-folder')?.addEventListener('click', () => this._doScanFolder());
    // Settings panel folder button
    document.getElementById('add-library-folder')?.addEventListener('click', () => this._doScanFolder());
  },

  // ── speed popup ─────────────────────────────────────────────────────────────
  _bindSpeedPopup() {
    const popup = document.getElementById('speed-popup');
    const btn   = document.getElementById('btn-speed-toggle');
    const slider= document.getElementById('popup-speed');
    const valEl = document.getElementById('popup-speed-val');
    btn?.addEventListener('click', e => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      popup.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      popup.style.right  = (window.innerWidth - r.right) + 'px';
      popup.classList.toggle('hidden');
    });
    slider?.addEventListener('input', () => {
      const s = parseFloat(slider.value);
      valEl.textContent = s.toFixed(2) + 'x';
      document.getElementById('speed-label').textContent = s.toFixed(2) + 'x';
      AudioEngine.setSpeed(s);
    });
    document.addEventListener('click', () => popup.classList.add('hidden'));
  },

  // ── library tabs ────────────────────────────────────────────────────────────
  _bindLibraryTabs() {
    document.querySelectorAll('.lib-tab').forEach(tab =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentLibTab = tab.dataset.tab;
        this.renderLibrary(this.currentLibTab, this.searchQuery);
      })
    );
  },

  _bindPlaylistActions() {
    document.getElementById('new-playlist-btn')?.addEventListener('click', () => this._createPlaylistModal());
    document.getElementById('import-playlist-btn')?.addEventListener('click', async () => {
      const pl = await Library.importPlaylist();
      if (pl) { this.renderPlaylists(); Utils.showToast('Playlist imported'); }
    });
    document.getElementById('playlist-back')?.addEventListener('click', () => {
      document.getElementById('playlist-detail').classList.add('hidden');
      document.getElementById('playlists-grid').classList.remove('hidden');
      this.currentPlaylistId = null;
    });
  },

  _bindQueueActions() {
    document.getElementById('clear-queue')?.addEventListener('click',   () => Utils.showModal('Clear Queue','Remove all tracks from queue?', () => Player.clearQueue()));
    document.getElementById('shuffle-queue')?.addEventListener('click', () => Player.toggleShuffle());
  },

  // ── settings ────────────────────────────────────────────────────────────────
  _bindSettingsPanel() {
    const bind = (id, key, xform, fx) => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const v = el.type === 'checkbox' ? el.checked : (xform ? xform(el.value) : el.value);
        if (fx) fx(v); App.updateConfig(key, v);
      });
    };
    bind('s-crossfade','crossfade',parseFloat, v => { document.getElementById('s-crossfade-val').textContent = v+'s'; AudioEngine.config.crossfade = v; });
    bind('s-fadein',   'fadeIn',   null,       v => { AudioEngine.config.fadeIn  = v; });
    bind('s-fadeout',  'fadeOut',  null,       v => { AudioEngine.config.fadeOut = v; });
    bind('s-speed',    'speed',    parseFloat, v => { document.getElementById('s-speed-val').textContent = parseFloat(v).toFixed(2)+'x'; AudioEngine.setSpeed(parseFloat(v)); });
    bind('s-balance',  'balance',  parseFloat, v => {
      const lbl = v < -0.05 ? `L ${Math.round(-v*100)}%` : v > 0.05 ? `R ${Math.round(v*100)}%` : 'Center';
      document.getElementById('s-balance-val').textContent = lbl;
      AudioEngine.setBalance(parseFloat(v));
    });
    bind('s-notifications', 'notifications');
    bind('s-hotkeys',       'globalHotkeys');
    bind('s-autoplay',      'autoplay');
    bind('s-visualizer',    'visualizerMode', null, v => Visualizer.setMode(v));
    document.getElementById('s-accent')?.addEventListener('input', e => {
      Utils.applyThemeColor(e.target.value); App.updateConfig('accentColor', e.target.value);
    });
    document.getElementById('s-use-album-colors')?.addEventListener('change', e => {
      App.updateConfig('useAlbumColors', e.target.checked);
      if (!e.target.checked) Utils.restoreThemeColor();
      else if (Player.currentTrack?.artwork) Utils.extractColors(Player.currentTrack.artwork).then(c => { if (c) Utils.applyThemeColor(c.hex); });
    });
    document.getElementById('set-sleep')?.addEventListener('click', () => {
      Player.setSleepTimer(parseInt(document.getElementById('s-sleep').value) || 0);
    });
    document.getElementById('clear-library')?.addEventListener('click', () => {
      Utils.showModal('Clear Library','Remove ALL tracks from the library?', async () => {
        Library.tracks = []; Library.recentIds = []; Library.playCount = {}; Library.lastPlayedAt = {};
        await Library.save(); Player.clearQueue();
        this.renderHome(); this.renderLibrary('all'); Utils.showToast('Library cleared');
      });
    });
  },

  // ════════════════════════════════════════════════════════════════════════════
  // HOME VIEW — buttons rendered here use event delegation (set up in init)
  // NOT _bindFileButtons(). This prevents listener accumulation.
  // ════════════════════════════════════════════════════════════════════════════
  renderHome() {
    const view = document.getElementById('view-home');
    if (!view) return;
    const all          = Library.tracks;
    const recentPlayed = Library.getRecentlyPlayed(12);
    const recentAdded  = Library.getRecentlyAdded(12);
    const mostPlayed   = Library.getMostPlayed(12);
    const has          = all.length > 0;

    let html = `<div class="home-header">
      <h2>Welcome to <span class="accent">Vibe</span></h2>
      <div class="home-header-actions">
        ${has ? `<button class="accent-btn" id="btn-shuffle-all">⇄ Shuffle All (${all.length})</button>` : ''}
        <button class="topbar-btn" id="home-add-files">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span class="btn-label">Add Files</span>
        </button>
        <button class="topbar-btn" id="home-scan-folder">
          <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="btn-label">Scan Folder</span>
        </button>
      </div>
    </div>`;

    if (!has) {
      html += `<div class="drop-zone" id="drop-zone-home">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>Drop audio files here or scan a folder</p>
        <small>MP3 · FLAC · WAV · OGG · M4A and more</small>
      </div>`;
    }

    if (recentPlayed.length) html += this._homeSection('Recently Played', recentPlayed);
    if (mostPlayed.length)   html += this._homeSection('Most Played',     mostPlayed,  true);
    if (recentAdded.length)  html += this._homeSection('Recently Added',  recentAdded);

    if (has) {
      html += `<div class="home-section">
        <div class="section-header">
          <div class="section-title">All Songs <span class="count-badge">${all.length}</span></div>
        </div>
        ${this._buildTrackListHTML(all, true)}
      </div>`;
    }

    view.innerHTML = html;
    // ⚠ No _bindFileButtons() call here. Event delegation handles home buttons.
    this._bindTrackListEvents(view);
    this.highlightActiveTrack();
  },

  _homeSection(title, tracks, showCount = false) {
    return `<div class="home-section">
      <div class="section-header"><div class="section-title">${title}</div></div>
      <div class="card-row">${tracks.map(t => this._trackCard(t, showCount)).join('')}</div>
    </div>`;
  },

  _trackCard(track, showCount = false) {
    const count = Library.playCount[track.id] || 0;
    const art   = track.artwork
      ? `<img src="${track.artwork}" alt="art" loading="lazy">`
      : `<div class="card-art-placeholder"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
    return `<div class="track-card ${Player.currentTrack?.id === track.id ? 'playing' : ''}" data-id="${track.id}">
      <div class="card-art">${art}
        <button class="card-play-btn" title="Play">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="card-info">
        <div class="card-title">${Utils.sanitize(track.title||'Unknown')}</div>
        <div class="card-artist">${Utils.sanitize(track.artist||'Unknown Artist')}</div>
        ${showCount && count > 0 ? `<div class="card-count">${count} play${count!==1?'s':''}</div>` : ''}
      </div>
    </div>`;
  },

  // ── library ──────────────────────────────────────────────────────────────────
  renderLibrary(tab = 'all', query = '') {
    const container = document.getElementById('library-content');
    if (!container) return;
    const tracks = query ? Library.search(query) : Library.tracks;
    if      (tab === 'all')     { container.innerHTML = this._buildTrackListHTML(tracks, true); this._bindTrackListEvents(container); }
    else if (tab === 'artists') this._renderArtistGrid(container);
    else if (tab === 'albums')  this._renderAlbumGrid(container);
    else if (tab === 'genres')  this._renderGenreGrid(container);
  },

  _renderArtistGrid(container) {
    const artists = Library.getByArtist();
    if (!artists.length) { container.innerHTML = this._emptyMsg('No artists'); return; }
    container.innerHTML = `<div class="artist-grid">${artists.map(a =>`
      <div class="artist-card" data-artist="${Utils.sanitize(a.name)}">
        <div class="artist-avatar">${a.artwork ? `<img src="${a.artwork}" loading="lazy">` : '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>'}</div>
        <div class="artist-name">${Utils.sanitize(a.name)}</div>
        <div class="artist-count">${a.tracks.length} track${a.tracks.length!==1?'s':''}</div>
      </div>`).join('')}</div>`;
    container.querySelectorAll('.artist-card').forEach(card => {
      card.addEventListener('click', () => {
        const tracks = Library.tracks.filter(t => (t.artist||'Unknown Artist') === card.dataset.artist);
        container.innerHTML = `<button class="back-btn" id="back-a">← Artists</button>${this._buildTrackListHTML(tracks,true)}`;
        this._bindTrackListEvents(container);
        document.getElementById('back-a').addEventListener('click', () => this._renderArtistGrid(container));
      });
    });
  },

  _renderAlbumGrid(container) {
    const albums = Library.getByAlbum();
    if (!albums.length) { container.innerHTML = this._emptyMsg('No albums'); return; }
    container.innerHTML = `<div class="album-grid">${albums.map(a =>`
      <div class="album-card" data-album="${Utils.sanitize(a.name)}" data-artist="${Utils.sanitize(a.artist)}">
        <div class="album-cover">${a.artwork ? `<img src="${a.artwork}" loading="lazy">` : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>'}</div>
        <div class="album-name">${Utils.sanitize(a.name)}</div>
        <div class="album-artist">${Utils.sanitize(a.artist)}</div>
      </div>`).join('')}</div>`;
    container.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', () => {
        const tracks = Library.tracks.filter(t => (t.album||'Unknown Album') === card.dataset.album && (t.artist||'Unknown Artist') === card.dataset.artist);
        container.innerHTML = `<button class="back-btn" id="back-al">← Albums</button>${this._buildTrackListHTML(tracks,true)}`;
        this._bindTrackListEvents(container);
        document.getElementById('back-al').addEventListener('click', () => this._renderAlbumGrid(container));
      });
    });
  },

  _renderGenreGrid(container) {
    const genres = Library.getByGenre();
    if (!genres.length) { container.innerHTML = this._emptyMsg('No genres'); return; }
    container.innerHTML = `<div class="genre-grid">${genres.map(g =>`
      <div class="genre-card" data-genre="${Utils.sanitize(g.name)}">
        <div class="genre-art">${g.artwork ? `<img src="${g.artwork}" loading="lazy">` : ''}</div>
        <div class="genre-name">${Utils.sanitize(g.name)}</div>
        <div class="genre-count">${g.tracks.length} tracks</div>
      </div>`).join('')}</div>`;
    container.querySelectorAll('.genre-card').forEach(card => {
      card.addEventListener('click', () => {
        const tracks = Library.tracks.filter(t => (t.genre||'Unknown') === card.dataset.genre);
        container.innerHTML = `<button class="back-btn" id="back-g">← Genres</button>${this._buildTrackListHTML(tracks,true)}`;
        this._bindTrackListEvents(container);
        document.getElementById('back-g').addEventListener('click', () => this._renderGenreGrid(container));
      });
    });
  },

  _emptyMsg: msg => `<div class="empty-state"><p>${msg}</p></div>`,

  // ── track list ───────────────────────────────────────────────────────────────
  _buildTrackListHTML(tracks, showHeader = true) {
    if (!tracks.length) return this._emptyMsg('No tracks');
    const header = showHeader ? `<div class="track-list-header">
      <span class="th-num">#</span><span class="th-art"></span>
      <span class="th-title">Title</span><span class="th-album">Album</span>
      <span class="th-dur">Duration</span><span class="th-act"></span>
    </div>` : '';
    const rows = tracks.map((t,i) => {
      const active = Player.currentTrack?.id === t.id;
      const art = t.artwork
        ? `<img src="${t.artwork}" alt="art" loading="lazy">`
        : `<div class="art-placeholder-inner"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      return `<div class="track-item ${active?'active':''}" data-id="${t.id}" data-index="${i}">
        <div class="track-num">${active&&Player.isPlaying ? '<div class="playing-bars"><span></span><span></span><span></span></div>' : i+1}</div>
        <div class="track-art-sm">${art}</div>
        <div class="track-main">
          <div class="track-name">${Utils.sanitize(t.title||'Unknown Title')}</div>
          <div class="track-by">${Utils.sanitize(t.artist||'Unknown Artist')}</div>
        </div>
        <div class="track-album">${Utils.sanitize(t.album||'—')}</div>
        <div class="track-duration">${Utils.formatTime(t.duration)}</div>
        <div class="track-actions">
          <button class="track-action-btn add-next-btn"  title="Play Next" data-id="${t.id}">▷</button>
          <button class="track-action-btn add-queue-btn" title="Add to Queue" data-id="${t.id}">+</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="track-list">${header}<div class="track-rows">${rows}</div></div>`;
  },

  _bindTrackListEvents(container) {
    container.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('dblclick', () => {
        const allItems = [...container.querySelectorAll('.track-item')];
        const tracks   = allItems.map(el => Library.tracks.find(t => t.id === el.dataset.id)).filter(Boolean);
        Player.setQueue(tracks, allItems.indexOf(item));
      });
      item.querySelector('.add-next-btn')?.addEventListener('click',  e => { e.stopPropagation(); const t = Library.tracks.find(t => t.id === item.dataset.id); if (t) Player.playNext(t); });
      item.querySelector('.add-queue-btn')?.addEventListener('click', e => { e.stopPropagation(); const t = Library.tracks.find(t => t.id === item.dataset.id); if (t) Player.addToQueue(t); });
    });
  },

  // ── queue ────────────────────────────────────────────────────────────────────
  renderQueue() {
    const container = document.getElementById('queue-list');
    if (!container) return;
    if (!Player.queue.length) { container.innerHTML = this._emptyMsg('Queue is empty'); return; }
    container.innerHTML = `<div class="track-rows">${Player.queue.map((t,i) => {
      const active = i === Player.currentIndex;
      const art = t.artwork ? `<img src="${t.artwork}" loading="lazy">` : `<div class="art-placeholder-inner"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      return `<div class="track-item queue-item ${active?'active':''}" data-id="${t.id}" data-index="${i}">
        <div class="track-num">${active&&Player.isPlaying ? '<div class="playing-bars"><span></span><span></span><span></span></div>' : i+1}</div>
        <div class="track-art-sm">${art}</div>
        <div class="track-main"><div class="track-name">${Utils.sanitize(t.title||'Unknown')}</div><div class="track-by">${Utils.sanitize(t.artist||'')}</div></div>
        <div class="track-album">${Utils.sanitize(t.album||'—')}</div>
        <div class="track-duration">${Utils.formatTime(t.duration)}</div>
        <div class="track-actions"><button class="track-action-btn remove-queue-btn" title="Remove" data-index="${i}">✕</button></div>
      </div>`;
    }).join('')}</div>`;
    container.querySelectorAll('.queue-item').forEach(item =>
      item.addEventListener('dblclick', () => Player.playAt(parseInt(item.dataset.index)))
    );
    container.querySelectorAll('.remove-queue-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); Player.removeFromQueue(parseInt(btn.dataset.index)); })
    );
  },

  // ── playlists ────────────────────────────────────────────────────────────────
  renderPlaylists() {
    const grid   = document.getElementById('playlists-grid');
    const detail = document.getElementById('playlist-detail');
    detail.classList.add('hidden'); grid.classList.remove('hidden');
    const pls = Library.playlists;
    if (!pls.length) { grid.innerHTML = this._emptyMsg('No playlists yet — create one!'); return; }
    grid.innerHTML = `<div class="playlists-grid">${pls.map(pl => {
      const art = Library.getPlaylistTracks(pl.id).find(t=>t.artwork)?.artwork;
      return `<div class="playlist-card" data-id="${pl.id}">
        <div class="playlist-cover">${art ? `<img src="${art}">` : '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'}</div>
        <div class="playlist-name">${Utils.sanitize(pl.name)}</div>
        <div class="playlist-count">${pl.tracks.length} tracks</div>
      </div>`;
    }).join('')}</div>`;
    grid.querySelectorAll('.playlist-card').forEach(card =>
      card.addEventListener('click', () => this._showPlaylistDetail(card.dataset.id))
    );
    this.renderSidebarPlaylists();
  },

  renderSidebarPlaylists() {
    const container = document.getElementById('playlist-list-sidebar');
    if (!container) return;
    container.innerHTML = Library.playlists.map(pl =>`
      <div class="sidebar-playlist-item ${this.currentPlaylistId===pl.id?'active':''}" data-id="${pl.id}">
        ${Utils.sanitize(pl.name)}
      </div>`).join('');
    container.querySelectorAll('.sidebar-playlist-item').forEach(item =>
      item.addEventListener('click', () => { this.showView('playlists'); this._showPlaylistDetail(item.dataset.id); })
    );
  },

  _showPlaylistDetail(id) {
    this.currentPlaylistId = id;
    const pl = Library.playlists.find(p=>p.id===id); if (!pl) return;
    document.getElementById('playlists-grid').classList.add('hidden');
    const detail = document.getElementById('playlist-detail');
    detail.classList.remove('hidden');
    const tracks = Library.getPlaylistTracks(id);
    document.getElementById('playlist-detail-content').innerHTML = `
      <div class="view-header">
        <h2>${Utils.sanitize(pl.name)}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="accent-btn" id="pl-play-all">▶ Play All</button>
          <button class="ghost-btn"  id="pl-export">Export M3U</button>
          <button class="ghost-btn danger" id="pl-delete">Delete</button>
        </div>
      </div>
      ${this._buildTrackListHTML(tracks, true)}`;
    const c = document.getElementById('playlist-detail-content');
    this._bindTrackListEvents(c);
    document.getElementById('pl-play-all')?.addEventListener('click', () => { if (tracks.length) Player.setQueue(tracks,0); });
    document.getElementById('pl-export')?.addEventListener('click',   () => Library.exportPlaylist(id));
    document.getElementById('pl-delete')?.addEventListener('click',   () =>
      Utils.showModal('Delete Playlist', `Delete "${Utils.sanitize(pl.name)}"?`, () => {
        Library.deletePlaylist(id);
        detail.classList.add('hidden');
        document.getElementById('playlists-grid').classList.remove('hidden');
        this.renderPlaylists();
      })
    );
  },

  renderLibraryFolders() {
    const container = document.getElementById('library-folders');
    if (!container) return;
    const folders = App.config.folders || [];
    container.innerHTML = folders.map(f =>`
      <div class="folder-item" data-folder="${Utils.sanitize(f)}">
        <span>${Utils.sanitize(f)}</span>
        <button class="folder-remove" title="Remove">✕</button>
      </div>`).join('');
    container.querySelectorAll('.folder-remove').forEach(btn =>
      btn.addEventListener('click', () => {
        App.config.folders = App.config.folders.filter(f => f !== btn.parentElement.dataset.folder);
        App.saveSettings(); this.renderLibraryFolders();
      })
    );
  },

  _createPlaylistModal() {
    Utils.showModal('New Playlist','<p>Name your playlist:</p><input type="text" id="pl-name-input" placeholder="My Playlist" maxlength="80">', () => {
      const name = document.getElementById('pl-name-input')?.value?.trim() || 'New Playlist';
      Library.createPlaylist(name); this.renderPlaylists(); Utils.showToast(`Created "${name}"`);
    });
  },

  _showAddToPlaylistModal(trackId) {
    if (!Library.playlists.length) { Utils.showToast('Create a playlist first'); return; }
    const opts = Library.playlists.map(pl =>`<option value="${pl.id}">${Utils.sanitize(pl.name)}</option>`).join('');
    Utils.showModal('Add to Playlist',`<p>Choose a playlist:</p><select id="modal-pl-select" style="width:100%;margin-top:12px;padding:10px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-primary);border-radius:8px;font-size:14px;">${opts}</select>`, () => {
      const selId = document.getElementById('modal-pl-select')?.value;
      if (selId) { Library.addToPlaylist(selId, trackId); Utils.showToast('Added to playlist'); }
    });
  },

  _showTrackInfo(track) {
    Utils.showModal('Track Info',`
      <div class="track-info-panel">
        <div class="track-info-row"><span class="label">Title</span><span class="value">${Utils.sanitize(track.title||'—')}</span></div>
        <div class="track-info-row"><span class="label">Artist</span><span class="value">${Utils.sanitize(track.artist||'—')}</span></div>
        <div class="track-info-row"><span class="label">Album</span><span class="value">${Utils.sanitize(track.album||'—')}</span></div>
        <div class="track-info-row"><span class="label">Genre</span><span class="value">${Utils.sanitize(track.genre||'—')}</span></div>
        <div class="track-info-row"><span class="label">Year</span><span class="value">${track.year||'—'}</span></div>
        <div class="track-info-row"><span class="label">Duration</span><span class="value">${Utils.formatTime(track.duration)}</span></div>
        <div class="track-info-row"><span class="label">Bitrate</span><span class="value">${track.bitrate ? track.bitrate+' kbps' : '—'}</span></div>
        <div class="track-info-row"><span class="label">Plays</span><span class="value">${Library.playCount[track.id]||0}</span></div>
        <div class="track-info-row" style="grid-column:1/-1"><span class="label">Path</span><span class="value" style="word-break:break-all;font-size:12px">${Utils.sanitize(track.path)}</span></div>
      </div>`, null, 'Close');
  },

  highlightActiveTrack() {
    document.querySelectorAll('.track-item').forEach(item =>
      item.classList.toggle('active', Player.currentTrack?.id === item.dataset.id)
    );
    document.querySelectorAll('.track-card').forEach(card =>
      card.classList.toggle('playing', Player.currentTrack?.id === card.dataset.id)
    );
  },

  applySettings(cfg) {
    if (cfg.accentColor) Utils.applyThemeColor(cfg.accentColor);
    const set    = (id,v) => { const el = document.getElementById(id); if (el) el.value   = v; };
    const setChk = (id,v) => { const el = document.getElementById(id); if (el) el.checked = v; };
    const setTxt = (id,v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('s-accent',     cfg.accentColor||'#1db954');
    set('s-crossfade',  cfg.crossfade ?? 3);  setTxt('s-crossfade-val', `${cfg.crossfade??3}s`);
    set('s-speed',      cfg.speed     ?? 1);  setTxt('s-speed-val',     `${(cfg.speed||1).toFixed(2)}x`);
    set('s-balance',    cfg.balance   ?? 0);
    set('s-visualizer', cfg.visualizerMode||'bars');
    set('volume-slider',cfg.volume    ?? 0.8);
    this._updateVolSlider(cfg.volume ?? 0.8);
    setChk('s-fadein',           cfg.fadeIn           !== false);
    setChk('s-fadeout',          cfg.fadeOut          !== false);
    setChk('s-notifications',    cfg.notifications    !== false);
    setChk('s-hotkeys',          cfg.globalHotkeys    !== false);
    setChk('s-autoplay',         !!cfg.autoplay);
    setChk('s-use-album-colors', !!cfg.useAlbumColors);
    this.renderLibraryFolders();
  }
};
