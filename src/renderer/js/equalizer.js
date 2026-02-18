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
    vocal:      [-1,-1,0,2,4,4,3,1,0,-1]
  },

  bands: [0,0,0,0,0,0,0,0,0,0],
  enabled: false,
  labels: ['32','64','125','250','500','1k','2k','4k','8k','16k'],

  init() {
    this._buildBandUI();
    this._bindEvents();
  },

  _buildBandUI() {
    const container = document.getElementById('eq-bands');
    container.innerHTML = '';
    this.labels.forEach((label, i) => {
      const band = document.createElement('div');
      band.className = 'eq-band';
      band.innerHTML = `
        <span id="eq-val-${i}">${this.bands[i]} dB</span>
        <input type="range" id="eq-band-${i}" min="-12" max="12" value="${this.bands[i]}" step="0.5" orient="vertical">
        <label>${label} Hz</label>
      `;
      container.appendChild(band);
      const slider = band.querySelector('input');
      slider.addEventListener('input', () => {
        this.bands[i] = parseFloat(slider.value);
        document.getElementById(`eq-val-${i}`).textContent = `${this.bands[i] > 0 ? '+' : ''}${this.bands[i]} dB`;
        if (this.enabled) AudioEngine.setEQBand(i, this.bands[i]);
        App.saveSettings();
      });
    });
  },

  _bindEvents() {
    const enabledCheck = document.getElementById('eq-enabled');
    enabledCheck.addEventListener('change', () => {
      this.enabled = enabledCheck.checked;
      AudioEngine.setEQEnabled(this.enabled, this.bands);
      App.saveSettings();
    });

    document.getElementById('eq-preset').addEventListener('change', (e) => {
      this.loadPreset(e.target.value);
    });

    document.getElementById('bass-boost').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('bass-boost-val').textContent = `${val} dB`;
      AudioEngine.setBassBoost(val);
    });

    document.getElementById('surround').addEventListener('input', (e) => {
      document.getElementById('surround-val').textContent = e.target.value;
    });

    document.getElementById('replay-gain').addEventListener('change', (e) => {
      AudioEngine.config.replayGain = e.target.checked;
      App.saveSettings();
    });
  },

  loadPreset(name) {
    const preset = this.presets[name];
    if (!preset) return;
    this.bands = [...preset];
    this.bands.forEach((v, i) => {
      const slider = document.getElementById(`eq-band-${i}`);
      if (slider) slider.value = v;
      const val = document.getElementById(`eq-val-${i}`);
      if (val) val.textContent = `${v > 0 ? '+' : ''}${v} dB`;
      if (this.enabled) AudioEngine.setEQBand(i, v);
    });
    App.saveSettings();
  },

  applyFromConfig(cfg) {
    if (!cfg.eq) return;
    this.enabled = cfg.eq.enabled || false;
    this.bands = cfg.eq.bands || [0,0,0,0,0,0,0,0,0,0];
    const check = document.getElementById('eq-enabled');
    if (check) check.checked = this.enabled;
    this._buildBandUI();
    AudioEngine.setEQEnabled(this.enabled, this.bands);
  }
};
