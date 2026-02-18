/**
 * Vibe — Settings Controller
 * Renders and manages all settings panels
 */

export class SettingsController {
  constructor(state, audio, equalizer, library, toast) {
    this.state = state;
    this.audio = audio;
    this.equalizer = equalizer;
    this.library = library;
    this.toast = toast;
    window.addEventListener('settings:render', () => this.render());
  }

  render() {
    const container = document.getElementById('view-settings');
    if (!container) return;
    const config = this.state.get('config');

    container.innerHTML = `
      <div id="settings-layout">
        <div id="settings-sidebar">
          <button class="settings-nav-btn active" data-section="audio">🔊 Audio</button>
          <button class="settings-nav-btn" data-section="playback">▶️ Playback</button>
          <button class="settings-nav-btn" data-section="library">📁 Library</button>
          <button class="settings-nav-btn" data-section="appearance">🎨 Appearance</button>
          <button class="settings-nav-btn" data-section="system">⚙️ System</button>
          <button class="settings-nav-btn" data-section="about">ℹ️ About</button>
        </div>
        <div id="settings-content">

          <!-- AUDIO -->
          <div class="settings-section active" id="settings-audio">
            <h2>Audio</h2>
            <div class="settings-group">
              <h3>Volume & Effects</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Default Volume</strong><span>Volume level on startup</span></div>
                <div class="settings-row-control"><div class="settings-slider">
                  <input type="range" min="0" max="100" value="${Math.round((config.audio.defaultVolume||0.8)*100)}" id="s-default-vol"/>
                  <span id="s-default-vol-val">${Math.round((config.audio.defaultVolume||0.8)*100)}%</span>
                </div></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Bass Boost</strong><span>Amplify low frequencies</span></div>
                <div class="settings-row-control"><div class="settings-slider">
                  <input type="range" min="0" max="20" value="${config.audio.bassBoost||0}" id="s-bass-boost"/>
                  <span id="s-bass-boost-val">${config.audio.bassBoost||0} dB</span>
                </div></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Balance</strong><span>Left/Right stereo balance</span></div>
                <div class="settings-row-control"><div class="settings-slider">
                  <input type="range" min="-100" max="100" value="${config.audio.balance||0}" id="s-balance"/>
                  <span id="s-balance-val">${config.audio.balance===0?'Center':config.audio.balance<0?'L'+Math.abs(config.audio.balance||0):'R'+(config.audio.balance||0)}</span>
                </div></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Replay Gain</strong><span>Normalize loudness across tracks</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-replay-gain" ${config.audio.replayGain?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Surround Sound</strong><span>Simulated surround effect</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-surround" ${config.audio.surroundEnabled?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
            </div>
            <div class="settings-group">
              <h3>Crossfade</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Enable Crossfade</strong><span>Blend tracks together smoothly</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-crossfade-en" ${config.playback.crossfadeEnabled?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Crossfade Duration</strong><span>Overlap length in seconds</span></div>
                <div class="settings-row-control"><div class="settings-slider">
                  <input type="range" min="0" max="12" step="0.5" value="${config.audio.crossfadeDuration||3}" id="s-crossfade-dur"/>
                  <span id="s-crossfade-dur-val">${config.audio.crossfadeDuration||3}s</span>
                </div></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Fade In Duration</strong></div>
                <div class="settings-row-control"><div class="settings-slider">
                  <input type="range" min="0" max="5" step="0.1" value="${config.audio.fadeInDuration||1}" id="s-fade-in"/>
                  <span id="s-fade-in-val">${config.audio.fadeInDuration||1}s</span>
                </div></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Fade Out Duration</strong></div>
                <div class="settings-row-control"><div class="settings-slider">
                  <input type="range" min="0" max="5" step="0.1" value="${config.audio.fadeOutDuration||1}" id="s-fade-out"/>
                  <span id="s-fade-out-val">${config.audio.fadeOutDuration||1}s</span>
                </div></div>
              </div>
            </div>
          </div>

          <!-- PLAYBACK -->
          <div class="settings-section" id="settings-playback">
            <h2>Playback</h2>
            <div class="settings-group">
              <h3>Default Behavior</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Shuffle on Startup</strong></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-shuffle" ${config.playback.shuffle?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Auto-play on Startup</strong></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-autoplay" ${config.playback.autoPlay?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Gapless Playback</strong><span>Remove silence between tracks</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-gapless" ${config.playback.gapless?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Auto-DJ Mode</strong><span>Continuous random play from library</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-autodj" ${config.playback.autoDJ?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
            </div>
          </div>

          <!-- LIBRARY -->
          <div class="settings-section" id="settings-library">
            <h2>Library</h2>
            <div class="settings-group">
              <h3>Music Folders</h3>
              <div id="settings-folder-list" class="settings-folder-list"></div>
              <button class="action-btn secondary" id="s-add-folder" style="margin-top:8px">+ Add Folder</button>
              <button class="action-btn" id="s-scan-all" style="margin-top:8px;margin-left:8px">↺ Scan All</button>
            </div>
            <div class="settings-group">
              <h3>Options</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Scan on Startup</strong><span>Auto-scan folders when app opens</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-scan-startup" ${config.library.scanOnStart?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
            </div>
            <div class="settings-group">
              <h3>Cache</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Clear Cache</strong><span>Remove temporary cached data</span></div>
                <div class="settings-row-control"><button class="action-btn secondary" id="s-clear-cache">Clear Cache</button></div>
              </div>
            </div>
          </div>

          <!-- APPEARANCE -->
          <div class="settings-section" id="settings-appearance">
            <h2>Appearance</h2>
            <div class="settings-group">
              <h3>Accent Color</h3>
              <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Choose a highlight color for the interface</p>
              <div class="settings-color-picker" id="s-color-picker">
                ${['#1db954','#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c','#e91e63','#ff5722','#00bcd4','#cddc39'].map(c =>
                  `<div class="color-swatch${(config.theme.accentColor||'#1db954')===c?' active':''}" data-color="${c}" style="background:${c}" title="${c}"></div>`
                ).join('')}
              </div>
            </div>
          </div>

          <!-- SYSTEM -->
          <div class="settings-section" id="settings-system">
            <h2>System</h2>
            <div class="settings-group">
              <h3>Window & Tray</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Minimize to Tray</strong><span>Keep running in background when closed</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-min-tray" ${config.system.minimizeToTray?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Start Minimized</strong></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-start-min" ${config.system.startMinimized?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
            </div>
            <div class="settings-group">
              <h3>Features</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Global Media Hotkeys</strong><span>Control playback from keyboard</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-hotkeys" ${config.system.globalHotkeys?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Track Notifications</strong><span>Show system notification on track change</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-notifs" ${config.system.showNotifications?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Restore Last Session</strong><span>Resume where you left off</span></div>
                <div class="settings-row-control"><label class="toggle"><input type="checkbox" id="s-restore" ${config.system.restoreSession?'checked':''}/><span class="toggle-slider"></span></label></div>
              </div>
            </div>
            <div class="settings-group">
              <h3>Sleep Timer</h3>
              <div class="settings-row">
                <div class="settings-row-label"><strong>Set Sleep Timer</strong><span>Auto-stop playback after duration</span></div>
                <div class="settings-row-control">
                  <button class="action-btn secondary" id="s-sleep-timer">Set Timer</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ABOUT -->
          <div class="settings-section" id="settings-about">
            <h2>About Vibe</h2>
            <div style="text-align:center;padding:48px 0;">
              <div style="font-family:var(--font-display);font-size:64px;font-weight:800;color:var(--accent);letter-spacing:-2px;">Vibe</div>
              <div style="font-size:15px;color:var(--text-secondary);margin-top:8px;font-weight:500;">Modern Desktop Music Player</div>
              <div id="s-version" style="font-size:13px;color:var(--text-muted);margin-top:8px;"></div>
              <div style="margin-top:28px;font-size:13px;color:var(--text-muted);line-height:2;">
                Built with Electron &amp; Web Audio API<br/>
                Supports MP3 · WAV · FLAC · OGG · M4A · AAC · Opus<br/>
                10-Band Equalizer · Crossfade · Visualizer · Lyrics<br/>
                System Tray · Global Hotkeys · Smart Shuffle
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    this.bindSettingsNav();
    this.bindSettingsControls(config);
    this.renderFolderList(config.library.folders || []);
    window.vibeAPI.invoke('app:version').then(v => {
      const el = document.getElementById('s-version');
      if (el) el.textContent = `Version ${v}`;
    });
  }

  bindSettingsNav() {
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`settings-${btn.dataset.section}`)?.classList.add('active');
      });
    });
  }

  bindSettingsControls(config) {
    const bindRange = (id, labelId, configPath, transform, labelFn) => {
      const el = document.getElementById(id);
      const label = document.getElementById(labelId);
      if (!el) return;
      el.oninput = () => {
        const v = transform ? transform(el.value) : el.value;
        if (label) label.textContent = labelFn ? labelFn(v) : v;
        this.state.updateConfig(configPath, v);
      };
    };

    const bindToggle = (id, configPath) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onchange = () => this.state.updateConfig(configPath, el.checked);
    };

    bindRange('s-default-vol', 's-default-vol-val', 'audio.defaultVolume', v => parseInt(v)/100, v => Math.round(v*100)+'%');
    bindRange('s-bass-boost', 's-bass-boost-val', 'audio.bassBoost', parseFloat, v => v+' dB');
    bindRange('s-balance', 's-balance-val', 'audio.balance', parseInt, v => v===0?'Center':v<0?'L'+Math.abs(v):'R'+v);
    bindRange('s-crossfade-dur', 's-crossfade-dur-val', 'audio.crossfadeDuration', parseFloat, v => v+'s');
    bindRange('s-fade-in', 's-fade-in-val', 'audio.fadeInDuration', parseFloat, v => v+'s');
    bindRange('s-fade-out', 's-fade-out-val', 'audio.fadeOutDuration', parseFloat, v => v+'s');

    bindToggle('s-replay-gain', 'audio.replayGain');
    bindToggle('s-surround', 'audio.surroundEnabled');
    bindToggle('s-crossfade-en', 'playback.crossfadeEnabled');
    bindToggle('s-shuffle', 'playback.shuffle');
    bindToggle('s-autoplay', 'playback.autoPlay');
    bindToggle('s-gapless', 'playback.gapless');
    bindToggle('s-autodj', 'playback.autoDJ');
    bindToggle('s-scan-startup', 'library.scanOnStart');
    bindToggle('s-min-tray', 'system.minimizeToTray');
    bindToggle('s-start-min', 'system.startMinimized');
    bindToggle('s-hotkeys', 'system.globalHotkeys');
    bindToggle('s-notifs', 'system.showNotifications');
    bindToggle('s-restore', 'system.restoreSession');

    // Use onclick (not addEventListener) — settings HTML is rebuilt on each open,
    // so onclick safely replaces the previous handler instead of stacking.
    const addFolderBtn = document.getElementById('s-add-folder');
    if (addFolderBtn) addFolderBtn.onclick = async () => {
      if (addFolderBtn._busy) return;
      addFolderBtn._busy = true;
      const folder = await window.vibeAPI.invoke('dialog:openFolder');
      addFolderBtn._busy = false;
      if (!folder) return;
      const folders = [...(this.state.getConfig('library.folders') || [])];
      if (!folders.includes(folder)) {
        folders.push(folder);
        this.state.updateConfig('library.folders', folders);
        this.renderFolderList(folders);
        this.toast.show(`Folder added`, 'success');
      }
    };

    const scanAllBtn = document.getElementById('s-scan-all');
    if (scanAllBtn) scanAllBtn.onclick = () => {
      const folders = this.state.getConfig('library.folders') || [];
      if (folders.length) {
        this.library.scanFolders(folders);
        this.toast.show('Scanning folders...', 'success');
      } else {
        this.toast.show('No folders configured', 'error');
      }
    };

    const clearCacheBtn = document.getElementById('s-clear-cache');
    if (clearCacheBtn) clearCacheBtn.onclick = async () => {
      await window.vibeAPI.invoke('cache:clear');
      this.toast.show('Cache cleared', 'success');
    };

    const sleepBtn = document.getElementById('s-sleep-timer');
    if (sleepBtn) sleepBtn.onclick = () => {
      document.getElementById('sleep-timer-modal')?.classList.remove('hidden');
    };

    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.onclick = () => {
        const color = swatch.dataset.color;
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--accent-glow', color + '40');
        this.state.updateConfig('theme.accentColor', color);
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.toast.show('Accent color updated', 'success');
      };
    });
  }

  renderFolderList(folders) {
    const container = document.getElementById('settings-folder-list');
    if (!container) return;
    container.innerHTML = '';
    if (!folders.length) {
      container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">No folders added yet.</div>`;
      return;
    }
    folders.forEach(folder => {
      const row = document.createElement('div');
      row.className = 'settings-folder-row';
      row.innerHTML = `
        <span class="settings-folder-path">${folder}</span>
        <button class="settings-folder-remove" title="Remove folder">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
        </button>
      `;
      row.querySelector('.settings-folder-remove').addEventListener('click', () => {
        const updated = (this.state.getConfig('library.folders') || []).filter(f => f !== folder);
        this.state.updateConfig('library.folders', updated);
        this.renderFolderList(updated);
      });
      container.appendChild(row);
    });
  }
}
