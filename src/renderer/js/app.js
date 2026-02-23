/* ══════════════════════════════════════════════════════════════════
   App v2 — bootstrap · config · Today Mix · session restore
   ══════════════════════════════════════════════════════════════════ */
const App = {
  config: {},

  async init() {
    this.config = await window.vibeAPI.getConfig();
    await Library.init();
    if (!this.config.onboardingDone) { UI._obShow(); return; }
    await this._boot();
  },

  async afterOnboarding(prefs) {
    Object.assign(this.config, prefs, { onboardingDone:true });
    await window.vibeAPI.saveConfig(this.config);
    await this._boot();
  },

  async _boot() {
    AudioEngine.init();
    Player.init();
    Visualizer.init();
    Equalizer.init();
    UI.init();
    this._applyConfig();
    this._bindGlobal();
    UI.showView('home');
    UI.renderSidebarPls();
    Visualizer.setMode(this.config.visualizerMode||'bars');
    this._scheduleTodayMix();
    // Run incremental scan in background if folders are configured
    if (this.config.folders?.length) this._backgroundScan();
  },

  // Background incremental scan — runs silently after boot, updates library
  async _backgroundScan() {
    try {
      const result = await Library.scanFolders(this.config.folders);
      if (result.added+result.changed+result.removed > 0) {
        UI.renderHome?.(); // refresh home view if tracks changed
        console.log(`[Scan] +${result.added} ~${result.changed} -${result.removed}`);
      }
    } catch(e) { console.warn('[Scan] background scan error', e); }
  },

  _applyConfig() {
    const c=this.config;
    AudioEngine.setVolume(c.volume??0.8);
    AudioEngine.setBalance(c.balance??0);
    AudioEngine.setSpeed(c.speed??1);
    AudioEngine.config.crossfade    = c.crossfade??3;
    AudioEngine.config.fadeIn       = c.fadeIn!==false;
    AudioEngine.config.fadeOut      = c.fadeOut!==false;
    AudioEngine.config.gapless      = c.gapless||false;
    AudioEngine.config.gaplessOffset= c.gaplessOffset??8;
    Player.shuffle = c.shuffle||false;
    Player.repeat  = c.repeat||'off';
    document.getElementById('btn-shuffle')?.classList.toggle('active',Player.shuffle);
    Player._updateRepeatBtn?.();
    Equalizer.applyFromConfig(c);
    UI.applySettings(c);
    if (c.accentColor) Utils.applyAccent(c.accentColor);

    // Session restore — load last track position without auto-playing
    if (c.lastTrackId) {
      const t=Library.tracks.find(t=>t.id===c.lastTrackId);
      if (t) {
        Player.currentTrack  = t;
        Player.queue         = [t]; // minimal queue — user resumes manually
        Player.originalQueue = [t];
        Player.currentIndex  = 0;
        AudioEngine.load(t).then(()=>{
          if (c.lastPosition>0) AudioEngine.seekTo(c.lastPosition);
          Player._updateUI();
        });
      }
    }
  },

  // ── Today Mix ─────────────────────────────────────────────────────────────
  _scheduleTodayMix() {
    const today=new Date().toDateString();
    if (this.config.lastMixDate!==today||!this.config.todayMixIds?.length) this._refreshMix(today);
    const ms=new Date(new Date().setHours(24,0,0,0))-Date.now();
    setTimeout(()=>{ this._refreshMix(new Date().toDateString()); this._scheduleTodayMix(); }, ms);
  },

  _refreshMix(dateStr) {
    const mix=Library.getTodayMix(20);
    this.config.todayMixIds=mix.map(t=>t.id);
    this.config.lastMixDate=dateStr;
    this.save();
  },

  getTodayMixTracks() {
    if (!this.config.todayMixIds?.length) return Library.getTodayMix(20);
    const tracks=this.config.todayMixIds.map(id=>Library._byId.get(id)).filter(Boolean);
    return tracks.length ? tracks : Library.getTodayMix(20);
  },

  // ── Global bindings ───────────────────────────────────────────────────────
  _bindGlobal() {
    window.vibeAPI.onTrayAction(a=>{ if(a==='playpause')Player.toggle(); else if(a==='next')Player.next(true); else if(a==='prev')Player.prev(); });
    window.vibeAPI.onGlobalShortcut(a=>{ if(a==='playpause')Player.toggle(); else if(a==='next')Player.next(true); else if(a==='prev')Player.prev(); else if(a==='stop')Player.stop(); });

    document.addEventListener('keydown', e=>{
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      const adjVol = d=>{
        const v=Math.max(0,Math.min(1,AudioEngine.config.volume+d));
        AudioEngine.setVolume(v);
        const s=document.getElementById('vol-slider');
        if(s){ s.value=v; UI._syncVolSlider(v); }
      };
      switch(e.code){
        case 'Space':      e.preventDefault(); Player.toggle(); break;
        case 'ArrowRight': e.ctrlKey?Player.next(true):AudioEngine.seekTo(AudioEngine.currentTime+5); break;
        case 'ArrowLeft':  e.ctrlKey?Player.prev():AudioEngine.seekTo(AudioEngine.currentTime-5); break;
        case 'ArrowUp':    e.preventDefault(); adjVol(+0.05); break;
        case 'ArrowDown':  e.preventDefault(); adjVol(-0.05); break;
        case 'KeyM':       UI._toggleMute(); break;
        case 'KeyS':       if(e.ctrlKey){e.preventDefault();Player.toggleShuffle();} break;
        case 'KeyR':       if(e.ctrlKey){e.preventDefault();Player.cycleRepeat();}   break;
      }
    });

    window.addEventListener('beforeunload',()=>this._snapshot());
    setInterval(()=>this._snapshot(), 15000);
  },

  _snapshot() {
    this.config.lastTrackId  = Player.currentTrack?.id||null;
    this.config.lastPosition = AudioEngine.currentTime||0;
    this.config.shuffle      = Player.shuffle;
    this.config.repeat       = Player.repeat;
    this.config.volume       = AudioEngine.config.volume;
    this.config.eq           = {enabled:Equalizer.enabled,bands:[...Equalizer.bands]};
    window.vibeAPI.saveConfig(this.config);
  },

  updateConfig(k,v) { this.config[k]=v; this.save(); },

  save() {
    this.config.shuffle=Player.shuffle;
    this.config.repeat =Player.repeat;
    this.config.volume =AudioEngine.config.volume;
    this.config.eq     ={enabled:Equalizer.enabled,bands:[...Equalizer.bands]};
    window.vibeAPI.saveConfig(this.config);
  },
};

document.addEventListener('DOMContentLoaded',()=>App.init());
