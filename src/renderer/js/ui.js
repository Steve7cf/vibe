/* ══════════════════════════════════════════════════════════════════
   UI — complete rendering engine
   ══════════════════════════════════════════════════════════════════ */
const UI = {
  view:    'home',
  libTab:  'all',
  query:   '',
  ctxId:   null,
  ctxPlId: null,
  _scanBusy: false,
  _muteVol:  0.8,
  _muted:    false,

  // ── Init — called once after onboarding is done ──────────────────
  init() {
    this._bindNav();
    this._bindPlayerControls();
    this._bindSeek();
    this._bindVolume();
    this._bindSearch();
    this._bindWinControls();
    this._bindFileButtons();   // ONCE — never from renderHome
    this._bindSpeed();
    this._bindLibTabs();
    this._bindPlaylistActions();
    this._bindQueueActions();
    this._bindSettings();
    this._bindCtxMenu();
    this._bindDrop();
    this._bindNowPlayingControls();
    this._bindHomeDelegation();
    this._bindThemeAndPalette();
  },

  // ── Navigation ────────────────────────────────────────────────────
  _bindNav() {
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.addEventListener('click', () => this.showView(b.dataset.view))
    );
    document.getElementById('create-pl-btn')?.addEventListener('click', () => this._newPlModal());
  },

  showView(name) {
    this.view = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById(`view-${name}`)?.classList.add('active');
    if      (name === 'home')      this.renderHome();
    else if (name === 'library')   this.renderLibrary(this.libTab, this.query);
    else if (name === 'queue')     this.renderQueue();
    else if (name === 'playlists') this.renderPlaylists();
  },

  // ── Player controls ───────────────────────────────────────────────
  _bindPlayerControls() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    on('btn-play',     () => Player.toggle());
    on('btn-prev',     () => Player.prev());
    on('btn-next',     () => Player.next());
    on('btn-stop',     () => Player.stop());
    on('btn-shuffle',  () => Player.toggleShuffle());
    on('btn-repeat',   () => Player.cycleRepeat());
    on('btn-mute',     () => this._toggleMute());
    on('btn-like',     () => this._toggleLike());
    on('btn-open-np',  () => this._openNP());
  },

  _toggleLike() {
    if (!Player.currentTrack) return;
    const l = Library.toggleLike(Player.currentTrack.id);
    ['btn-like','np-like'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.classList.toggle('liked', l); el.textContent = l ? '♥' : '♡';
    });
  },

  // ── Seek ──────────────────────────────────────────────────────────
  _bindSeek() {
    const bar = document.getElementById('seek-bar');
    if (!bar) return;
    let drag = false;
    const pct = e => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
    bar.addEventListener('mousedown', e => { drag = true; Player.isDraggingSeek = true; AudioEngine.seek(pct(e)); });
    document.addEventListener('mousemove', e => { if (!drag) return; const sf = document.getElementById('seek-fill'); if (sf) sf.style.width = `${pct(e)*100}%`; });
    document.addEventListener('mouseup',   e => { if (!drag) return; drag = false; Player.isDraggingSeek = false; AudioEngine.seek(pct(e)); });

    const npBar = document.getElementById('np-seek-bar');
    if (npBar) npBar.addEventListener('click', e => {
      const r = npBar.getBoundingClientRect();
      AudioEngine.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
    });
  },

  // ── Volume ────────────────────────────────────────────────────────
  _syncVolSlider(v) { document.getElementById('vol-slider')?.style.setProperty('--vol', `${v*100}%`); },
  _toggleMute() {
    this._muted = !this._muted;
    if (!this._muted) this._muteVol = AudioEngine.config.volume || 0.8;
    const v = this._muted ? 0 : this._muteVol;
    AudioEngine.setVolume(v);
    const s = document.getElementById('vol-slider');
    if (s) { s.value = v; this._syncVolSlider(v); }
  },
  _bindVolume() {
    document.getElementById('vol-slider')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      AudioEngine.setVolume(v); this._muteVol = v; this._syncVolSlider(v);
      const nv = document.getElementById('np-vol'); if (nv) nv.value = v;
    });
    document.getElementById('np-vol')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      AudioEngine.setVolume(v); this._muteVol = v; this._syncVolSlider(v);
      const vs = document.getElementById('vol-slider'); if (vs) vs.value = v;
    });
  },

  // ── Search ────────────────────────────────────────────────────────
  _bindSearch() {
    const inp = document.getElementById('search-input');
    const clr = document.getElementById('search-clear');
    if (!inp) return;
    inp.addEventListener('input', Utils.debounce(e => {
      this.query = e.target.value.trim();
      clr.classList.toggle('visible', !!this.query);
      if (this.query) { this.showView('library'); this.renderLibrary('all', this.query); }
    }, 220));
    clr.addEventListener('click', () => { inp.value = ''; this.query = ''; clr.classList.remove('visible'); this.renderLibrary('all'); });
  },

  // ── Window controls ───────────────────────────────────────────────
  _bindWinControls() {
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.vibeAPI.windowControl('minimize'));
    document.getElementById('btn-maximize')?.addEventListener('click', () => window.vibeAPI.windowControl('maximize'));
    document.getElementById('btn-close')?.addEventListener('click',   () => window.vibeAPI.windowControl('close'));
  },

  // ── File buttons — bound ONCE ─────────────────────────────────────
  _bindFileButtons() {
    document.getElementById('btn-add-files')?.addEventListener('click',   () => this._doAddFiles());
    document.getElementById('btn-scan-folder')?.addEventListener('click', () => this._doScanFolder());
    document.getElementById('btn-add-folder')?.addEventListener('click',  () => this._doScanFolder());
  },

  async _doAddFiles() {
    if (this._scanBusy) return; this._scanBusy = true;
    try {
      const files = await window.vibeAPI.openFiles();
      if (files?.length) await this._ingestFiles(files);
    } finally { this._scanBusy = false; }
  },

  async _doScanFolder() {
    if (this._scanBusy) return; this._scanBusy = true;
    try {
      const dirs = await window.vibeAPI.openFolder();
      if (!dirs?.length) return;
      Utils.toast('Scanning…');
      let total = 0;
      for (const d of dirs) {
        const tracks = await Library.scanFolder(d);
        total += tracks.length;
        if (!App.config.folders) App.config.folders = [];
        if (!App.config.folders.includes(d)) App.config.folders.push(d);
      }
      App.save();
      this.renderHome(); this.renderLibrary(this.libTab); this._renderLibFolders();
      Utils.toast(`Found ${total} track${total !== 1 ? 's' : ''} ✓`);
    } finally { this._scanBusy = false; }
  },

  async _ingestFiles(paths) {
    Utils.toast(`Loading ${paths.length} track${paths.length > 1 ? 's' : ''}…`);
    const tracks = await Library.addFiles(paths);
    if (tracks.length) {
      Player.addTracksToQueue(tracks, true);
      this.renderHome(); this.renderLibrary(this.libTab); this.renderSidebarPls();
    }
  },

  // ── Home delegation — handles dynamic home buttons ────────────────
  _bindHomeDelegation() {
    document.getElementById('view-home').addEventListener('click', e => {
      if (e.target.closest('#btn-shuffle-all'))   { Player.shuffleAll();   return; }
      if (e.target.closest('#btn-today-mix'))      { Player.playTodayMix(); return; }
      if (e.target.closest('#home-add-files'))     { this._doAddFiles();    return; }
      if (e.target.closest('#home-scan-folder'))   { this._doScanFolder();  return; }

      const play  = e.target.closest('.card-play-btn');
      const card  = e.target.closest('.track-card');
      const nxt   = e.target.closest('.add-next-btn');
      const que   = e.target.closest('.add-queue-btn');

      if (play && card) { e.stopPropagation(); Player.setQueue(Library.tracks, Library.tracks.findIndex(t => t.id === card.dataset.id)); return; }
      if (card && e.detail === 2) { Player.setQueue(Library.tracks, Library.tracks.findIndex(t => t.id === card.dataset.id)); return; }
      if (nxt) { const t = Library.tracks.find(t => t.id === nxt.dataset.id); if (t) Player.playNext(t);   return; }
      if (que) { const t = Library.tracks.find(t => t.id === que.dataset.id); if (t) Player.addToQueue(t); return; }
    });
  },

  // ── Speed popup ───────────────────────────────────────────────────
  _bindSpeed() {
    const popup  = document.getElementById('speed-popup');
    const btn    = document.getElementById('btn-speed');
    const slider = document.getElementById('popup-speed');
    const valEl  = document.getElementById('popup-speed-val');
    btn?.addEventListener('click', e => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      popup.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      popup.style.right  = (window.innerWidth  - r.right)  + 'px';
      popup.classList.toggle('hidden');
    });
    slider?.addEventListener('input', () => {
      const s = parseFloat(slider.value);
      valEl.textContent = s.toFixed(2) + '×';
      document.getElementById('speed-label').textContent = s.toFixed(1) + '×';
      AudioEngine.setSpeed(s);
    });
    document.addEventListener('click', () => popup.classList.add('hidden'));
  },

  // ── Library tabs ──────────────────────────────────────────────────
  _bindLibTabs() {
    document.querySelectorAll('.lib-tab').forEach(tab =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.libTab = tab.dataset.tab;
        this.renderLibrary(this.libTab, this.query);
      })
    );
  },

  _bindPlaylistActions() {
    document.getElementById('btn-new-pl')?.addEventListener('click', () => this._newPlModal());
    document.getElementById('btn-import-pl')?.addEventListener('click', async () => {
      const pl = await Library.importPlaylist();
      if (pl) { this.renderPlaylists(); Utils.toast('Playlist imported'); }
    });
    document.getElementById('pl-back')?.addEventListener('click', () => {
      document.getElementById('pl-detail').classList.add('hidden');
      document.getElementById('pls-grid').classList.remove('hidden');
    });
  },

  _bindQueueActions() {
    document.getElementById('btn-clear-queue')?.addEventListener('click', () =>
      Utils.modal('Clear Queue','Remove all tracks from queue?', () => Player.clearQueue())
    );
    document.getElementById('btn-shuffle-queue')?.addEventListener('click', () => Player.toggleShuffle());
  },

  // ── Settings ──────────────────────────────────────────────────────
  _bindSettings() {
    const b = (id, key, xf, fx) => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const v = el.type === 'checkbox' ? el.checked : (xf ? xf(el.value) : el.value);
        if (fx) fx(v); App.updateConfig(key, v);
      });
    };
    b('s-crossfade','crossfade', parseFloat, v => { document.getElementById('s-crossfade-val').textContent = v+'s'; AudioEngine.config.crossfade = v; });
    b('s-fadein',  'fadeIn',    null, v => { AudioEngine.config.fadeIn  = v; });
    b('s-fadeout', 'fadeOut',   null, v => { AudioEngine.config.fadeOut = v; });
    b('s-speed',   'speed',     parseFloat, v => { document.getElementById('s-speed-val').textContent = parseFloat(v).toFixed(2)+'×'; AudioEngine.setSpeed(parseFloat(v)); });
    b('s-balance', 'balance',   parseFloat, v => {
      document.getElementById('s-balance-val').textContent = v < -.05 ? `L ${Math.round(-v*100)}%` : v > .05 ? `R ${Math.round(v*100)}%` : 'Center';
      AudioEngine.setBalance(parseFloat(v));
    });
    b('s-notifs',       'notifications');
    b('s-hotkeys',      'globalHotkeys');
    b('s-visualizer',   'visualizerMode', null, v => Visualizer.setMode(v));
    b('s-album-colors', 'useAlbumColors', null, v => {
      if (!v) Utils.applyAccent(App.config.accentColor || '#1db954');
      else if (Player.currentTrack?.artwork) Utils.extractColor(Player.currentTrack.artwork).then(c => { if(c) Utils.applyAccent(c); });
    });
    document.getElementById('s-accent')?.addEventListener('input', e => { Utils.applyAccent(e.target.value); App.updateConfig('accentColor', e.target.value); });

    // Gapless
    document.getElementById('s-gapless')?.addEventListener('change', e => {
      AudioEngine.config.gapless = e.target.checked;
      document.getElementById('s-gapless-sub')?.classList.toggle('dimmed', !e.target.checked);
      App.updateConfig('gapless', e.target.checked);
    });
    document.getElementById('s-gapless-offset')?.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      document.getElementById('s-gapless-offset-val').textContent = v + 's';
      const hint = document.getElementById('s-gapless-hint-val');
      if (hint) hint.textContent = v + 's';
      AudioEngine.config.gaplessOffset = v;
      App.updateConfig('gaplessOffset', v);
    });

    // Stop after current
    document.getElementById('s-stop-after')?.addEventListener('change', e => {
      Player.stopAfterCurrent = e.target.checked;
      App.updateConfig('stopAfterCurrent', e.target.checked);
    });

    // Font size
    document.getElementById('s-fontsize')?.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      document.getElementById('s-fontsize-val').textContent = v + 'px';
      document.documentElement.style.setProperty('--font-size-base', v + 'px');
      App.updateConfig('fontSize', v);
    });

    // Density
    document.getElementById('s-density')?.addEventListener('change', e => {
      this._applyDensity(e.target.value);
      App.updateConfig('density', e.target.value);
    });

    document.getElementById('btn-sleep')?.addEventListener('click', () => Player.setSleepTimer(parseInt(document.getElementById('s-sleep').value)||0));
    document.getElementById('btn-clear-lib')?.addEventListener('click', () =>
      Utils.modal('Clear Library','Remove ALL tracks?', async () => {
        Library.tracks=[]; Library.recentIds=[]; Library.playCount={}; Library.lastPlayedAt={};
        await Library.save(); Player.clearQueue();
        this.renderHome(); this.renderLibrary('all'); Utils.toast('Library cleared');
      })
    );
  },

  // ── Context menu ──────────────────────────────────────────────────
  _bindCtxMenu() {
    const menu = document.getElementById('ctx-menu');
    document.addEventListener('contextmenu', e => {
      const item = e.target.closest('[data-id]');
      if (!item) { menu.classList.add('hidden'); return; }
      e.preventDefault();
      this.ctxId = item.dataset.id;
      this.ctxPlId = item.dataset.plid || null;   // set by pl detail rows, null elsewhere
      menu.style.left = Math.min(e.clientX, window.innerWidth-200)+'px';
      menu.style.top  = Math.min(e.clientY, window.innerHeight-210)+'px';
      menu.classList.remove('hidden');
    });
    document.addEventListener('click', () => menu.classList.add('hidden'));
    document.addEventListener('keydown', e => { if(e.key==='Escape') menu.classList.add('hidden'); });
    const T = () => Library.tracks.find(t => t.id === this.ctxId);
    document.getElementById('ctx-play')?.addEventListener('click',   () => { const t=T(); if(t) Player.setQueue(Library.tracks, Library.tracks.indexOf(t)); });
    document.getElementById('ctx-next')?.addEventListener('click',   () => { const t=T(); if(t) Player.playNext(t); });
    document.getElementById('ctx-queue')?.addEventListener('click',  () => { const t=T(); if(t) Player.addToQueue(t); });
    document.getElementById('ctx-pl')?.addEventListener('click',     () => { if(this.ctxId) this._addToPlModal(this.ctxId); });
    document.getElementById('ctx-info')?.addEventListener('click',   () => { const t=T(); if(t) this._trackInfoModal(t); });
    document.getElementById('ctx-remove')?.addEventListener('click', () => {
      if (!this.ctxId) return;
      if (this.ctxPlId) {
        // Inside a playlist view — remove only from that playlist
        Library.removeFromPlaylist(this.ctxPlId, this.ctxId);
        // Splice from queue if present (but not if it's currently playing)
        const qIdx = Player.queue.findIndex(t => t.id === this.ctxId);
        if (qIdx !== -1 && qIdx !== Player.currentIndex) Player.removeFromQueue(qIdx);
        this._renderPlDetail(this.ctxPlId);
        Utils.toast('Removed from playlist');
      } else {
        // Library view — remove from library entirely
        Library.removeTrack(this.ctxId);
        // Remove from queue too
        const qIdx = Player.queue.findIndex(t => t.id === this.ctxId);
        if (qIdx !== -1 && qIdx !== Player.currentIndex) Player.removeFromQueue(qIdx);
        this.renderHome(); this.renderLibrary(this.libTab);
        Utils.toast('Track removed');
      }
      this.ctxPlId = null;
    });
  },

  // ── Drag-and-drop ─────────────────────────────────────────────────
  _bindDrop() {
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', async e => {
      e.preventDefault();
      const files = [...(e.dataTransfer.files||[])].map(f=>f.path)
        .filter(p=>/\.(mp3|wav|flac|ogg|m4a|aac|wma|opus)$/i.test(p));
      if (files.length) await this._ingestFiles(files);
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // HOME VIEW
  // ══════════════════════════════════════════════════════════════════
  renderHome() {
    const view = document.getElementById('view-home');
    if (!view) return;
    const all     = Library.tracks;
    const recent  = Library.getRecentlyPlayed(12);
    const popular = Library.getMostPlayed(12);
    const added   = Library.getRecentlyAdded(12);
    const has     = all.length > 0;

    const h    = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    const name = App.config.userName ? `, ${App.config.userName}` : '';

    let html = `
      <div class="home-greeting">
        <div class="home-greeting-text">Good ${part}${name} <span class="accent">♫</span></div>
        <div class="home-greeting-sub">${has ? `${all.length.toLocaleString()} tracks ready to play` : 'Add your music to get started'}</div>
      </div>
      <div class="home-actions">
        ${has ? `<button class="accent-btn" id="btn-shuffle-all">⇄ Shuffle All</button>` : ''}
        <button class="ghost-btn" id="home-add-files">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 5v14M5 12h14"/></svg>Add Files
        </button>
        <button class="ghost-btn" id="home-scan-folder">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Scan Folder
        </button>
      </div>`;

    // ── Today Mix card ─────────────────────────────────────────────
    if (has) {
      const mix  = App.getTodayMixTracks();
      const arts = mix.filter(t => t.artwork).slice(0, 4);
      const artEl = arts.length >= 2
        ? `<div class="today-mix-mosaic">${arts.map(t=>`<img src="${t.artwork}" alt="">`).join('')}</div>`
        : `<div class="today-mix-icon">🎵</div>`;
      html += `
        <div class="today-mix-card" id="btn-today-mix">
          ${artEl}
          <div class="today-mix-info">
            <div class="today-mix-label">Today's Mix</div>
            <div class="today-mix-title">Your Daily Blend</div>
            <div class="today-mix-sub">${mix.length} tracks picked for this ${part}</div>
          </div>
          <button class="today-mix-play-btn" title="Play Today Mix">
            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="#000"/></svg>
          </button>
        </div>`;
    }

    // ── Drop zone ──────────────────────────────────────────────────
    if (!has) {
      html += `
        <div class="drop-zone">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p>Drop audio files here or scan a folder</p>
          <small>MP3 · FLAC · WAV · OGG · M4A · and more</small>
        </div>`;
    }

    if (recent.length)  html += this._homeSection('Recently Played', recent);
    if (popular.length) html += this._homeSection('Most Played', popular, true);
    if (added.length)   html += this._homeSection('Recently Added', added);

    if (has) {
      html += `<div class="home-section">
        <div class="section-hd">
          <div class="section-title">All Songs</div>
          <span class="count-badge">${all.length}</span>
        </div>
        ${this._trackList(all)}
      </div>`;
    }

    view.innerHTML = html;
    this._bindTrackRows(view);
    this.highlightActive();

    // Wire play button (it sits inside the delegated #view-home area but needs stopPropagation)
    view.querySelector('.today-mix-play-btn')?.addEventListener('click', e => { e.stopPropagation(); Player.playTodayMix(); });
  },

  _homeSection(title, tracks, showPlays = false) {
    return `<div class="home-section">
      <div class="section-hd"><div class="section-title">${title}</div></div>
      <div class="card-row">${tracks.map(t => this._card(t, showPlays)).join('')}</div>
    </div>`;
  },

  _card(t, showPlays = false) {
    const cnt = Library.playCount[t.id] || 0;
    const art = t.artwork
      ? `<img src="${t.artwork}" alt="" loading="lazy">`
      : `<div class="card-art-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
    return `<div class="track-card ${Player.currentTrack?.id===t.id?'playing':''}" data-id="${t.id}">
      <div class="card-art">${art}
        <button class="card-play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="#000"/></svg></button>
      </div>
      <div class="card-info">
        <div class="card-title">${Utils.sanitize(t.title || (t.path ? t.path.split(/[\\/]/).pop().replace(/\.[^.]+$/,'') : '—'))}</div>
        <div class="card-artist">${Utils.sanitize(t.artist || '')}</div>
        ${showPlays && cnt > 0 ? `<div class="card-count">${cnt} play${cnt!==1?'s':''}</div>` : ''}
      </div>
    </div>`;
  },

  // ══════════════════════════════════════════════════════════════════
  // LIBRARY
  // ══════════════════════════════════════════════════════════════════
  renderLibrary(tab = 'all', q = '') {
    const c = document.getElementById('lib-content');
    if (!c) return;
    const tracks = q ? Library.search(q) : Library.tracks;
    if      (tab === 'all')     { c.innerHTML = this._trackList(tracks); this._bindTrackRows(c); }
    else if (tab === 'artists') this._renderGroupGrid(c, Library.getByArtist(), 'artist');
    else if (tab === 'albums')  this._renderGroupGrid(c, Library.getByAlbum(),  'album');
    else if (tab === 'genres')  this._renderGroupGrid(c, Library.getByGenre(),  'genre');
  },

  _renderGroupGrid(container, items, type) {
    if (!items.length) { container.innerHTML = this._empty('Nothing here yet'); return; }
    const cards = items.map(it => {
      const art = it.artwork ? `<img src="${it.artwork}" loading="lazy">` : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;
      const sub = type==='album' ? Utils.sanitize(it.artist||'') : `${it.tracks.length} tracks`;
      const ava = type==='artist' ? `<div class="artist-ava">${art}</div>` : `<div class="album-cov">${art}</div>`;
      const attr = type==='artist' ? `data-artist="${Utils.sanitize(it.name)}"` : type==='album' ? `data-album="${Utils.sanitize(it.name)}" data-artist="${Utils.sanitize(it.artist||'')}"` : `data-genre="${Utils.sanitize(it.name)}"`;
      return `<div class="${type}-card" ${attr}>${ava}<div class="card-name">${Utils.sanitize(it.name)}</div><div class="card-sub">${sub}</div></div>`;
    }).join('');
    container.innerHTML = `<div class="${type}s-grid">${cards}</div>`;
    container.querySelectorAll(`[data-${type}]`).forEach(card => {
      card.addEventListener('click', () => {
        let tracks;
        if (type==='artist') tracks = Library.tracks.filter(t=>(t.artist || '')===card.dataset.artist);
        else if (type==='album') tracks = Library.tracks.filter(t=>(t.album || '')===card.dataset.album&&(t.artist || '')===card.dataset.artist);
        else tracks = Library.tracks.filter(t=>(t.genre||'Unknown')===card.dataset.genre);
        container.innerHTML = `<button class="back-btn" id="bk-${type}">← ${type.charAt(0).toUpperCase()+type.slice(1)}s</button>${this._trackList(tracks)}`;
        this._bindTrackRows(container);
        document.getElementById(`bk-${type}`)?.addEventListener('click', () => this._renderGroupGrid(container, items, type));
      });
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // TRACK LIST
  // ══════════════════════════════════════════════════════════════════
  _trackList(tracks) {
    if (!tracks.length) return this._empty('No tracks');
    const hdr = `<div class="track-list-header">
      <span class="th-num">#</span><span></span>
      <span>Title</span><span class="th-album">Album</span>
      <span class="th-dur">Time</span><span></span>
    </div>`;
    const rows = tracks.map((t, i) => {
      const act = Player.currentTrack?.id === t.id;
      const art = t.artwork ? `<img src="${t.artwork}" loading="lazy" alt="">` : `<div class="art-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      const num = act && Player.isPlaying ? `<div class="bars"><span></span><span></span><span></span></div>` : i+1;
      return `<div class="track-item ${act?'active':''}" data-id="${t.id}" data-index="${i}">
        <div class="track-num">${num}</div>
        <div class="track-art-sm">${art}</div>
        <div class="track-main">
          <div class="track-name">${Utils.sanitize(t.title || (t.path ? t.path.split(/[\\/]/).pop().replace(/\.[^.]+$/,'') : '—'))}</div>
          <div class="track-by">${Utils.sanitize(t.artist || '')}</div>
        </div>
        <div class="track-album">${Utils.sanitize(t.album||'—')}</div>
        <div class="track-dur">${Utils.formatTime(t.duration)}</div>
        <div class="track-actions">
          <button class="track-action-btn add-next-btn"  data-id="${t.id}" title="Play Next">▷</button>
          <button class="track-action-btn add-queue-btn" data-id="${t.id}" title="Queue">+</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="track-list">${hdr}<div class="track-rows">${rows}</div></div>`;
  },

  _bindTrackRows(container) {
    container.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('dblclick', () => {
        const items  = [...container.querySelectorAll('.track-item')];
        const tracks = items.map(el => Library.tracks.find(t=>t.id===el.dataset.id)).filter(Boolean);
        Player.setQueue(tracks, items.indexOf(item));
      });
      item.querySelector('.add-next-btn')?.addEventListener('click',  e => { e.stopPropagation(); const t=Library.tracks.find(t=>t.id===item.dataset.id); if(t) Player.playNext(t); });
      item.querySelector('.add-queue-btn')?.addEventListener('click', e => { e.stopPropagation(); const t=Library.tracks.find(t=>t.id===item.dataset.id); if(t) Player.addToQueue(t); });
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // QUEUE
  // ══════════════════════════════════════════════════════════════════
  renderQueue() {
    const c = document.getElementById('queue-list'); if (!c) return;
    if (!Player.queue.length) { c.innerHTML = this._empty('Queue is empty'); return; }
    c.innerHTML = `<div class="track-rows">${Player.queue.map((t,i) => {
      const act = i === Player.currentIndex;
      const art = t.artwork ? `<img src="${t.artwork}" loading="lazy">` : `<div class="art-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      return `<div class="track-item ${act?'active':''}" data-id="${t.id}" data-index="${i}">
        <div class="track-num">${act&&Player.isPlaying?`<div class="bars"><span></span><span></span><span></span></div>`:i+1}</div>
        <div class="track-art-sm">${art}</div>
        <div class="track-main"><div class="track-name">${Utils.sanitize(t.title||'?')}</div><div class="track-by">${Utils.sanitize(t.artist||'')}</div></div>
        <div class="track-album">${Utils.sanitize(t.album||'—')}</div>
        <div class="track-dur">${Utils.formatTime(t.duration)}</div>
        <div class="track-actions"><button class="track-action-btn rm-queue-btn" data-index="${i}" title="Remove">✕</button></div>
      </div>`;
    }).join('')}</div>`;
    c.querySelectorAll('.track-item').forEach(el => el.addEventListener('dblclick', () => Player.playAt(parseInt(el.dataset.index))));
    c.querySelectorAll('.rm-queue-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); Player.removeFromQueue(parseInt(btn.dataset.index)); }));
  },

  // ══════════════════════════════════════════════════════════════════
  // PLAYLISTS
  // ══════════════════════════════════════════════════════════════════
  renderPlaylists() {
    const grid   = document.getElementById('pls-grid');
    const detail = document.getElementById('pl-detail');
    detail.classList.add('hidden'); grid.classList.remove('hidden');
    if (!Library.playlists.length) { grid.innerHTML = this._empty('No playlists yet'); return; }
    grid.innerHTML = `<div class="pls-grid">${Library.playlists.map(pl => {
      const art = Library.getPlaylistTracks(pl.id).find(t=>t.artwork)?.artwork;
      return `<div class="pl-card" data-id="${pl.id}">
        <div class="pl-cov">${art?`<img src="${art}">`:'<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'}</div>
        <div class="card-name">${Utils.sanitize(pl.name)}</div>
        <div class="card-sub">${pl.tracks.length} tracks</div>
      </div>`;
    }).join('')}</div>`;
    grid.querySelectorAll('.pl-card').forEach(card => card.addEventListener('click', () => this._showPlDetail(card.dataset.id)));
    this.renderSidebarPls();
  },

  renderSidebarPls() {
    const c = document.getElementById('sidebar-pls'); if (!c) return;
    c.innerHTML = Library.playlists.map(pl =>
      `<div class="sidebar-pl-item" data-id="${pl.id}">${Utils.sanitize(pl.name)}</div>`
    ).join('');
    c.querySelectorAll('.sidebar-pl-item').forEach(el =>
      el.addEventListener('click', () => { this.showView('playlists'); this._showPlDetail(el.dataset.id); })
    );
  },

  _showPlDetail(id) {
    const pl = Library.playlists.find(p=>p.id===id); if (!pl) return;
    document.getElementById('pls-grid').classList.add('hidden');
    const detail = document.getElementById('pl-detail');
    detail.classList.remove('hidden');
    this._renderPlDetail(id);
  },

  // Separate render method so we can call it after every mutation
  _renderPlDetail(id) {
    const pl = Library.playlists.find(p=>p.id===id); if (!pl) return;
    const detail = document.getElementById('pl-detail');
    const tracks = Library.getPlaylistTracks(id);

    document.getElementById('pl-detail-content').innerHTML = `
      <div class="view-header">
        <h2>${Utils.sanitize(pl.name)}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="accent-btn" id="pl-play">▶ Play All</button>
          <button class="ghost-btn"  id="pl-export">Export M3U</button>
          <button class="ghost-btn danger" id="pl-delete">Delete</button>
        </div>
      </div>
      <div class="track-rows">
        ${tracks.length ? tracks.map((t,i) => {
          const art = t.artwork ? `<img src="${t.artwork}" loading="lazy">` : `<div class="art-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
          const act = Player.currentTrack?.id === t.id;
          return `<div class="track-item${act?' active':''}" data-id="${t.id}" data-plid="${id}">
            <div class="track-num">${act&&Player.isPlaying?'<div class="bars"><span></span><span></span><span></span></div>':i+1}</div>
            <div class="track-art-sm">${art}</div>
            <div class="track-main">
              <div class="track-name">${Utils.sanitize(t.title||(t.path?t.path.split(/[/\\]/).pop().replace(/\.[^.]+$/,''):'—'))}</div>
              <div class="track-by">${Utils.sanitize(t.artist||'')}</div>
            </div>
            <div class="track-album">${Utils.sanitize(t.album||'—')}</div>
            <div class="track-dur">${Utils.formatTime(t.duration)}</div>
            <div class="track-actions">
              <button class="track-action-btn rm-pl-btn" data-trackid="${t.id}" title="Remove from playlist">✕</button>
            </div>
          </div>`;
        }).join('') : '<div class="empty-state">No tracks in this playlist</div>'}
      </div>`;

    // Play all
    document.getElementById('pl-play')?.addEventListener('click', () => {
      const fresh = Library.getPlaylistTracks(id);
      if (fresh.length) Player.setQueue(fresh, 0);
    });
    // Export
    document.getElementById('pl-export')?.addEventListener('click', () => Library.exportPlaylist(id));
    // Delete playlist
    document.getElementById('pl-delete')?.addEventListener('click', () =>
      Utils.modal('Delete Playlist', `Delete "${Utils.sanitize(pl.name)}"?`, () => {
        Library.deletePlaylist(id);
        detail.classList.add('hidden');
        document.getElementById('pls-grid').classList.remove('hidden');
        this.renderPlaylists();
      })
    );
    // Double-click a row → play from that track
    detail.querySelectorAll('.track-item').forEach((item, i) => {
      item.addEventListener('dblclick', () => {
        const fresh = Library.getPlaylistTracks(id);
        Player.setQueue(fresh, i);
      });
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.ctxId = item.dataset.id;
        this.ctxPlId = id;
        const menu = document.getElementById('ctx-menu');
        menu.style.left = Math.min(e.clientX, window.innerWidth-160)+'px';
        menu.style.top  = Math.min(e.clientY, window.innerHeight-200)+'px';
        menu.classList.remove('hidden');
      });
    });
    // Remove from playlist — live, no refresh needed
    detail.querySelectorAll('.rm-pl-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const trackId = btn.dataset.trackid;
        Library.removeFromPlaylist(id, trackId);
        // If this track is in the active queue, also splice it out
        const qIdx = Player.queue.findIndex(t => t.id === trackId);
        if (qIdx !== -1 && qIdx !== Player.currentIndex) {
          Player.removeFromQueue(qIdx);
        }
        // Re-render the detail view instantly — no refresh required
        this._renderPlDetail(id);
        Utils.toast('Removed from playlist');
      });
    });
  },

  _renderLibFolders() {
    const c = document.getElementById('lib-folders'); if (!c) return;
    c.innerHTML = (App.config.folders||[]).map(f =>
      `<div class="folder-item" data-folder="${Utils.sanitize(f)}">
        <span>${Utils.sanitize(f)}</span><button class="folder-rm" title="Remove">✕</button>
      </div>`
    ).join('');
    c.querySelectorAll('.folder-rm').forEach(btn => btn.addEventListener('click', () => {
      App.config.folders = App.config.folders.filter(f=>f!==btn.parentElement.dataset.folder);
      App.save(); this._renderLibFolders();
    }));
  },

  // ══════════════════════════════════════════════════════════════════
  // NOW PLAYING FULLSCREEN
  // ══════════════════════════════════════════════════════════════════
  _bindNowPlayingControls() {
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    on('np-close',   () => this._closeNP());
    on('btn-open-np',() => this._openNP());
    on('np-play',    () => Player.toggle());
    on('np-prev',    () => Player.prev());
    on('np-next',    () => Player.next());
    on('np-shuffle', () => Player.toggleShuffle());
    on('np-like',    () => this._toggleLike());
    document.addEventListener('keydown', e => {
      if (e.key==='Escape' && !document.getElementById('now-playing').classList.contains('hidden')) this._closeNP();
    });
  },

  _openNP()  { document.getElementById('now-playing').classList.remove('hidden'); this.syncNowPlaying(); },
  _closeNP() { document.getElementById('now-playing').classList.add('hidden'); },

  // Called by Player after every track change
  syncNowPlaying() {
    const screen = document.getElementById('now-playing');
    if (screen.classList.contains('hidden')) return;
    const t = Player.currentTrack; if (!t) return;

    // Blurred background
    const npBg = document.getElementById('np-bg');
    if (npBg) npBg.style.backgroundImage = t.artwork ? `url('${t.artwork}')` : 'none';

    // Art + pulse animation when playing
    const artEl = document.getElementById('np-art');
    if (artEl) {
      artEl.innerHTML = t.artwork ? `<img src="${t.artwork}" alt="">` : '';
      artEl.classList.toggle('np-art-playing', Player.isPlaying);
    }

    // Shuffle indicator
    document.getElementById('np-shuffle')?.classList.toggle('active', Player.shuffle);

    // Transparent strip — current + 5 upcoming tracks
    const strip = document.getElementById('np-track-strip');
    if (strip) {
      const slice = Player.queue.slice(Player.currentIndex, Player.currentIndex + 6);
      strip.innerHTML = slice.map((qt, i) =>
        `<div class="np-t-track ${i===0?'active':''}" data-index="${Player.currentIndex+i}" title="${Utils.sanitize(qt.title||'?')}">
          ${qt.artwork ? `<img src="${qt.artwork}" alt="">` : `<div class="np-t-track-ph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`}
        </div>`
      ).join('');
      strip.querySelectorAll('.np-t-track').forEach(el =>
        el.addEventListener('click', () => Player.playAt(parseInt(el.dataset.index)))
      );
    }

    // Up Next sidebar queue
    const queueEl = document.getElementById('np-queue');
    if (queueEl) {
      queueEl.innerHTML = Player.queue.map((qt, i) => {
        const act = i === Player.currentIndex;
        return `<div class="np-qi ${act?'active':''}" data-index="${i}">
          <div class="np-qi-art">${qt.artwork?`<img src="${qt.artwork}">`:''}</div>
          <div class="np-qi-info">
            <div class="np-qi-title">${Utils.sanitize(qt.title||'?')}</div>
            <div class="np-qi-artist">${Utils.sanitize(qt.artist||'')}</div>
          </div>
          <div class="np-qi-num">${i+1}</div>
        </div>`;
      }).join('');
      queueEl.querySelectorAll('.np-qi').forEach(el =>
        el.addEventListener('click', () => Player.playAt(parseInt(el.dataset.index)))
      );
      // Scroll active item into view
      queueEl.querySelector('.np-qi.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // HIGHLIGHT ACTIVE
  // ══════════════════════════════════════════════════════════════════
  highlightActive() {
    document.querySelectorAll('.track-item').forEach(el =>
      el.classList.toggle('active', Player.currentTrack?.id === el.dataset.id)
    );
    document.querySelectorAll('.track-card').forEach(el =>
      el.classList.toggle('playing', Player.currentTrack?.id === el.dataset.id)
    );
  },

  // ══════════════════════════════════════════════════════════════════
  // ONBOARDING — 3-step card flow
  // ══════════════════════════════════════════════════════════════════
  _ob: { step: 0, prefs: { userName:'', notifications:true, globalHotkeys:true, accentColor:'#1db954', scanFolders:[] } },

  _obShow() {
    const el = document.getElementById('onboarding');
    el.classList.remove('hidden');
    this._obRender(0);
    document.getElementById('ob-next').addEventListener('click', () => this._obNext());
    document.getElementById('ob-prev').addEventListener('click', () => this._obPrev());
  },

  _obDots(step) {
    [0,1,2].forEach(i => document.getElementById(`ob-d${i+1}`)?.classList.toggle('on', i===step));
  },

  _obRender(step) {
    this._ob.step = step;
    this._obDots(step);
    document.getElementById('ob-prev')?.classList.toggle('hidden', step === 0);
    document.getElementById('ob-next').textContent = step === 2 ? 'Get Started →' : 'Continue →';
    const body = document.getElementById('ob-body');

    if (step === 0) {
      body.innerHTML = `
        <div class="ob-icon">🎵</div>
        <h1 class="ob-h1">Welcome to <span style="color:var(--accent)">Vibe</span></h1>
        <p class="ob-sub">Your music, beautifully organized. Set up in under a minute.</p>
        <div class="ob-field">
          <label class="ob-lbl">What should we call you?</label>
          <input id="ob-name" class="ob-input" type="text" placeholder="Your name (optional)" maxlength="32" value="${Utils.sanitize(this._ob.prefs.userName)}">
        </div>
        <div class="ob-field">
          <label class="ob-lbl">Accent color</label>
          <div class="ob-swatches">
            ${['#1db954','#ff5f5f','#5bc8f5','#a78bfa','#fbbf24','#f472b6','#34d399','#fb923c'].map(c =>
              `<div class="ob-swatch ${this._ob.prefs.accentColor===c?'on':''}" data-color="${c}" style="background:${c}" title="${c}"></div>`
            ).join('')}
            <input type="color" id="ob-custom-color" class="ob-custom-color" value="${this._ob.prefs.accentColor}" title="Custom">
          </div>
        </div>`;
      setTimeout(() => {
        document.getElementById('ob-name')?.focus();
        document.querySelectorAll('.ob-swatch').forEach(sw => sw.addEventListener('click', () => {
          document.querySelectorAll('.ob-swatch').forEach(s=>s.classList.remove('on'));
          sw.classList.add('on');
          this._ob.prefs.accentColor = sw.dataset.color;
          Utils.applyAccent(sw.dataset.color);
        }));
        document.getElementById('ob-custom-color')?.addEventListener('input', e => {
          this._ob.prefs.accentColor = e.target.value;
          Utils.applyAccent(e.target.value);
          document.querySelectorAll('.ob-swatch').forEach(s=>s.classList.remove('on'));
        });
      }, 50);
    }

    else if (step === 1) {
      body.innerHTML = `
        <div class="ob-icon">🔔</div>
        <h1 class="ob-h1">Permissions</h1>
        <p class="ob-sub">Choose what Vibe can do on your system.</p>
        <div class="ob-perm">
          <div class="ob-perm-info"><div class="ob-perm-title">System Notifications</div><div class="ob-perm-desc">Show a notification when a new song starts</div></div>
          <label class="toggle-label"><input type="checkbox" id="ob-notif" ${this._ob.prefs.notifications?'checked':''}><span class="toggle"></span></label>
        </div>
        <div class="ob-perm">
          <div class="ob-perm-info"><div class="ob-perm-title">Global Media Keys</div><div class="ob-perm-desc">Control playback with keyboard media keys from any app</div></div>
          <label class="toggle-label"><input type="checkbox" id="ob-keys" ${this._ob.prefs.globalHotkeys?'checked':''}><span class="toggle"></span></label>
        </div>
        <div class="ob-perm">
          <div class="ob-perm-info"><div class="ob-perm-title">File Access</div><div class="ob-perm-desc">Read audio files from folders you choose — Vibe never modifies your files</div></div>
          <div class="ob-perm-ok">✓ Always allowed</div>
        </div>`;
      setTimeout(() => {
        document.getElementById('ob-notif')?.addEventListener('change', e => { this._ob.prefs.notifications = e.target.checked; });
        document.getElementById('ob-keys')?.addEventListener('change',  e => { this._ob.prefs.globalHotkeys  = e.target.checked; });
      }, 50);
    }

    else if (step === 2) { this._obFolderStep(); }
  },

  _obFolderStep() {
    document.getElementById('ob-body').innerHTML = `
      <div class="ob-icon">📁</div>
      <h1 class="ob-h1">Add Your Music</h1>
      <p class="ob-sub">Point Vibe to a folder and it will find all your audio files automatically.</p>
      <div class="ob-folders-list" id="ob-folders-list">
        ${this._ob.prefs.scanFolders.map(f =>
          `<div class="ob-folder-tag">${Utils.sanitize(f)}<button class="ob-folder-rm" data-path="${Utils.sanitize(f)}">✕</button></div>`
        ).join('')}
      </div>
      <button class="accent-btn" id="ob-add-dir" style="width:100%;justify-content:center;margin-top:14px">+ Choose Folder</button>
      <p class="ob-skip">You can add more music anytime from the home screen.</p>`;
    setTimeout(() => {
      document.getElementById('ob-add-dir')?.addEventListener('click', async () => {
        const dirs = await window.vibeAPI.openFolder();
        if (dirs?.length) { dirs.forEach(d => { if (!this._ob.prefs.scanFolders.includes(d)) this._ob.prefs.scanFolders.push(d); }); this._obFolderStep(); }
      });
      document.querySelectorAll('.ob-folder-rm').forEach(btn => btn.addEventListener('click', () => {
        this._ob.prefs.scanFolders = this._ob.prefs.scanFolders.filter(f=>f!==btn.dataset.path);
        this._obFolderStep();
      }));
    }, 50);
  },

  _obNext() {
    if (this._ob.step === 0) this._ob.prefs.userName = document.getElementById('ob-name')?.value?.trim() || '';
    if (this._ob.step < 2) { this._obRender(this._ob.step + 1); }
    else this._obFinish();
  },

  _obPrev() { if (this._ob.step > 0) this._obRender(this._ob.step - 1); },

  async _obFinish() {
    const el = document.getElementById('onboarding');
    el.classList.add('ob-out');
    setTimeout(() => el.classList.add('hidden'), 440);

    await App.afterOnboarding({
      userName:       this._ob.prefs.userName,
      notifications:  this._ob.prefs.notifications,
      globalHotkeys:  this._ob.prefs.globalHotkeys,
      accentColor:    this._ob.prefs.accentColor,
      folders:        this._ob.prefs.scanFolders,
    });

    // Scan chosen folders in background
    if (this._ob.prefs.scanFolders.length) {
      Utils.toast('Scanning music library…');
      let total = 0;
      for (const d of this._ob.prefs.scanFolders) { const t = await Library.scanFolder(d); total += t.length; }
      Utils.toast(`Found ${total} track${total!==1?'s':''} ✓`);
      this.renderHome(); this.renderLibrary('all');
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MODALS
  // ══════════════════════════════════════════════════════════════════
  _newPlModal() {
    Utils.modal('New Playlist','<p>Name your playlist:</p><input type="text" id="pl-name-in" placeholder="My Playlist" maxlength="80">', () => {
      const name = document.getElementById('pl-name-in')?.value?.trim() || 'New Playlist';
      Library.createPlaylist(name); this.renderPlaylists(); Utils.toast(`Created "${name}"`);
    });
  },

  _addToPlModal(trackId) {
    if (!Library.playlists.length) { Utils.toast('Create a playlist first'); return; }
    const opts = Library.playlists.map(pl=>`<option value="${pl.id}">${Utils.sanitize(pl.name)}</option>`).join('');
    Utils.modal('Add to Playlist',`<p>Choose a playlist:</p><select id="modal-pl-sel" style="width:100%;margin-top:8px;padding:10px;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--r1);font-size:14px">${opts}</select>`,() => {
      const id = document.getElementById('modal-pl-sel')?.value;
      if (id) { Library.addToPlaylist(id, trackId); Utils.toast('Added to playlist'); }
    });
  },

  _trackInfoModal(t) {
    Utils.modal('Track Info',`
      <div class="track-info-grid">
        <div class="ti-row"><span class="lbl">Title</span><span class="val">${Utils.sanitize(t.title||'—')}</span></div>
        <div class="ti-row"><span class="lbl">Artist</span><span class="val">${Utils.sanitize(t.artist||'—')}</span></div>
        <div class="ti-row"><span class="lbl">Album</span><span class="val">${Utils.sanitize(t.album||'—')}</span></div>
        <div class="ti-row"><span class="lbl">Genre</span><span class="val">${Utils.sanitize(t.genre||'—')}</span></div>
        <div class="ti-row"><span class="lbl">Duration</span><span class="val">${Utils.formatTime(t.duration)}</span></div>
        <div class="ti-row"><span class="lbl">Bitrate</span><span class="val">${t.bitrate?t.bitrate+' kbps':'—'}</span></div>
        <div class="ti-row"><span class="lbl">Plays</span><span class="val">${Library.playCount[t.id]||0}</span></div>
        <div class="ti-row" style="grid-column:1/-1"><span class="lbl">Path</span><span class="val" style="word-break:break-all;font-size:11.5px">${Utils.sanitize(t.path)}</span></div>
      </div>`, null, 'Close', true);
  },

  // ── Density presets ───────────────────────────────────────────────
  _applyDensity(density) {
    const root = document.documentElement;
    if (density === 'comfortable') {
      root.style.setProperty('--track-item-h', '68px');
      root.style.setProperty('--player-h',     '100px');
      root.style.setProperty('--nav-btn-py',   '13px');
      root.style.setProperty('--card-gap',     '16px');
      root.style.setProperty('--section-mb',   '40px');
      root.style.setProperty('--view-px',      '36px');
    } else if (density === 'compact') {
      root.style.setProperty('--track-item-h', '46px');
      root.style.setProperty('--player-h',     '76px');
      root.style.setProperty('--nav-btn-py',   '7px');
      root.style.setProperty('--card-gap',     '10px');
      root.style.setProperty('--section-mb',   '24px');
      root.style.setProperty('--view-px',      '20px');
    } else {
      root.style.setProperty('--track-item-h', '58px');
      root.style.setProperty('--player-h',     '90px');
      root.style.setProperty('--nav-btn-py',   '10px');
      root.style.setProperty('--card-gap',     '13px');
      root.style.setProperty('--section-mb',   '34px');
      root.style.setProperty('--view-px',      '30px');
    }
  },

  // ── Apply settings to the settings panel inputs ───────────────────
  applySettings(cfg) {
    const set    = (id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
    const setChk = (id,v)=>{const el=document.getElementById(id);if(el)el.checked=v;};
    const setTxt = (id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    set('s-accent',    cfg.accentColor||'#1db954');
    set('s-crossfade', cfg.crossfade??3);   setTxt('s-crossfade-val', `${cfg.crossfade??3}s`);
    set('s-speed',     cfg.speed??1);        setTxt('s-speed-val',     `${(cfg.speed||1).toFixed(2)}×`);
    set('s-balance',   cfg.balance??0);
    set('s-visualizer',cfg.visualizerMode||'bars');
    set('vol-slider',  cfg.volume??0.8);
    this._syncVolSlider(cfg.volume??0.8);
    setChk('s-fadein',       cfg.fadeIn!==false);
    setChk('s-fadeout',      cfg.fadeOut!==false);
    setChk('s-notifs',       cfg.notifications!==false);
    setChk('s-hotkeys',      cfg.globalHotkeys!==false);
    setChk('s-album-colors', !!cfg.useAlbumColors);
    this._renderLibFolders();

    // Gapless
    const gs = document.getElementById('s-gapless');
    if (gs) { gs.checked = !!cfg.gapless; AudioEngine.config.gapless = !!cfg.gapless; }
    const gss = document.getElementById('s-gapless-sub');
    if (gss) gss.classList.toggle('dimmed', !cfg.gapless);
    const offset = cfg.gaplessOffset || 20;
    const go = document.getElementById('s-gapless-offset');
    if (go) { go.value = offset; }
    const gov = document.getElementById('s-gapless-offset-val');
    if (gov) gov.textContent = offset + 's';
    const goh = document.getElementById('s-gapless-hint-val');
    if (goh) goh.textContent = offset + 's';
    AudioEngine.config.gaplessOffset = offset;

    // Font size
    const fs = cfg.fontSize || 14;
    const fsel = document.getElementById('s-fontsize');
    if (fsel) { fsel.value = fs; document.getElementById('s-fontsize-val').textContent = fs+'px'; }
    document.documentElement.style.setProperty('--font-size-base', fs+'px');

    // Density
    const den = cfg.density || 'normal';
    const dsel = document.getElementById('s-density');
    if (dsel) dsel.value = den;
    this._applyDensity(den);

    // Stop after current
    const sac = document.getElementById('s-stop-after');
    if (sac) sac.checked = !!cfg.stopAfterCurrent;
  },

  _empty: msg => `<div class="empty"><p>${msg}</p></div>`,

  // ── Theme toggle ──────────────────────────────────────────────────
  _bindThemeAndPalette() {
    const btn = document.getElementById('btn-theme');
    if (!btn) return;

    // Restore saved theme
    if (App.config.lightTheme) this._applyTheme(true);

    btn.addEventListener('click', () => {
      const light = !document.body.classList.contains('light-theme');
      this._applyTheme(light);
      App.updateConfig('lightTheme', light);
    });

    // Palette dots — clicking applies that color as accent
    document.querySelectorAll('.palette-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const col = dot.style.background;
        if (!col) return;
        Utils.applyAccent(col);
        App.updateConfig('accentColor', col);
        document.getElementById('s-accent').value = col;
        document.querySelectorAll('.palette-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
    });
  },

  _applyTheme(light) {
    document.body.classList.toggle('light-theme', light);
    const dark  = document.getElementById('theme-icon-dark');
    const lgt   = document.getElementById('theme-icon-light');
    if (dark) dark.classList.toggle('hidden', light);
    if (lgt)  lgt.classList.toggle('hidden', !light);
  },

  // Extract 5 dominant colors from album art and show in titlebar palette
  async _updatePalette(artworkDataUrl) {
    const palette = document.getElementById('topbar-palette');
    if (!palette) return;
    if (!artworkDataUrl) { palette.style.display = 'none'; return; }

    try {
      const colors = await this._extractPaletteColors(artworkDataUrl, 5);
      const dots = palette.querySelectorAll('.palette-dot');
      dots.forEach((dot, i) => {
        dot.style.background = colors[i] || 'transparent';
        dot.style.display = colors[i] ? '' : 'none';
      });
      palette.style.display = 'flex';
    } catch(e) {
      palette.style.display = 'none';
    }
  },

  // Sample pixels from image to extract dominant colors
  _extractPaletteColors(dataUrl, count = 5) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 80; canvas.height = 80;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 80, 80);
        const data = ctx.getImageData(0, 0, 80, 80).data;

        // Sample colors and cluster them
        const samples = [];
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i], g = data[i+1], b = data[i+2];
          // Skip near-black and near-white
          const lum = 0.299*r + 0.587*g + 0.114*b;
          if (lum < 20 || lum > 235) continue;
          samples.push([r, g, b]);
        }

        // Simple spread: pick evenly spaced samples sorted by hue
        samples.sort((a, b) => {
          const hA = this._rgb2hue(...a), hB = this._rgb2hue(...b);
          return hA - hB;
        });

        const step = Math.max(1, Math.floor(samples.length / count));
        const colors = [];
        for (let i = 0; i < count && i * step < samples.length; i++) {
          const [r, g, b] = samples[i * step];
          colors.push(`rgb(${r},${g},${b})`);
        }
        resolve(colors);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  },

  _rgb2hue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if      (max === r) h = ((g-b)/d + (g<b?6:0)) / 6;
      else if (max === g) h = ((b-r)/d + 2) / 6;
      else                h = ((r-g)/d + 4) / 6;
    }
    return h;
  },

};