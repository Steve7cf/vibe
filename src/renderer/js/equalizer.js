/* ═══════════════════════════════════════════════════════
   Equalizer
   ═══════════════════════════════════════════════════════ */
const Equalizer = {
  presets: {
    flat:       [0,0,0,0,0,0,0,0,0,0],
    pop:        [2,1,0,1,3,3,2,1,1,2],
    rock:       [4,3,2,0,-1,-1,1,3,4,4],
    jazz:       [3,2,1,2,-1,-1,0,1,2,3],
    classical:  [4,3,2,2,0,-2,0,2,3,4],
    electronic: [5,4,2,0,-1,2,3,4,4,5],
    hiphop:     [5,4,2,3,1,-1,0,1,2,3],
    bass:       [6,5,4,2,1,0,0,0,0,0],
    treble:     [0,0,0,0,0,1,2,3,4,5],
    vocal:      [-1,-1,0,2,4,4,3,1,0,-1],
  },
  bands:  [0,0,0,0,0,0,0,0,0,0],
  enabled: false,
  labels: ['32','64','125','250','500','1k','2k','4k','8k','16k'],

  init() { this._buildBandUI(); this._bindEvents(); },

  _buildBandUI() {
    const c = document.getElementById('eq-bands');
    if (!c) return;
    c.innerHTML = '';
    this.labels.forEach((lbl, i) => {
      const d = document.createElement('div');
      d.className = 'eq-band';
      d.innerHTML = `<span id="eq-val-${i}">${this.bands[i]} dB</span>
        <input type="range" id="eq-band-${i}" min="-12" max="12" value="${this.bands[i]}" step="0.5" orient="vertical">
        <label>${lbl}</label>`;
      c.appendChild(d);
      d.querySelector('input').addEventListener('input', e => {
        this.bands[i] = parseFloat(e.target.value);
        document.getElementById(`eq-val-${i}`).textContent = `${this.bands[i]>0?'+':''}${this.bands[i]} dB`;
        if (this.enabled) AudioEngine.setEQBand(i, this.bands[i]);
        App.save();
      });
    });
  },

  _bindEvents() {
    document.getElementById('eq-on')?.addEventListener('change', e => {
      this.enabled = e.target.checked;
      AudioEngine.setEQEnabled(this.enabled, this.bands);
      App.save();
    });
    document.getElementById('eq-preset')?.addEventListener('change', e => this.loadPreset(e.target.value));
    document.getElementById('bass-boost')?.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      document.getElementById('bass-boost-val').textContent = `${v} dB`;
      AudioEngine.setBassBoost(v);
    });
    document.getElementById('replay-gain')?.addEventListener('change', e => {
      AudioEngine.config.replayGain = e.target.checked; App.save();
    });
  },

  loadPreset(name) {
    const preset = this.presets[name];
    if (!preset) return;
    this.bands = [...preset];
    this.bands.forEach((v, i) => {
      const s = document.getElementById(`eq-band-${i}`);
      const l = document.getElementById(`eq-val-${i}`);
      if (s) s.value = v;
      if (l) l.textContent = `${v>0?'+':''}${v} dB`;
      if (this.enabled) AudioEngine.setEQBand(i, v);
    });
    App.save();
  },

  applyFromConfig(cfg) {
    if (!cfg.eq) return;
    this.enabled = cfg.eq.enabled || false;
    this.bands   = cfg.eq.bands   || [0,0,0,0,0,0,0,0,0,0];
    const chk = document.getElementById('eq-on');
    if (chk) chk.checked = this.enabled;
    this._buildBandUI();
    AudioEngine.setEQEnabled(this.enabled, this.bands);
  },
};
