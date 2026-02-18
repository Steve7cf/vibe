/**
 * Vibe — Equalizer Controller
 */

export class EqualizerController {
  constructor(state, audio) {
    this.state = state;
    this.audio = audio;

    document.getElementById('btn-equalizer')?.addEventListener('click', () => this.show());
    document.querySelector('#equalizer-modal .modal-close')?.addEventListener('click', () => this.hide());
    document.querySelector('#equalizer-modal .modal-backdrop')?.addEventListener('click', () => this.hide());

    this.render();
    this.bindControls();
  }

  render() {
    const bandsEl = document.getElementById('eq-bands');
    if (!bandsEl) return;

    bandsEl.innerHTML = '';
    const labels = ['32Hz','64Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz'];

    labels.forEach((label, i) => {
      const val = this.audio.EQ_VALUES[i] || 0;
      const band = document.createElement('div');
      band.className = 'eq-band';
      band.innerHTML = `
        <div class="eq-band-value" id="eq-val-${i}">${val > 0 ? '+' : ''}${val} dB</div>
        <input type="range" class="eq-band-slider" id="eq-band-${i}"
          min="-12" max="12" step="0.5" value="${val}" />
        <div class="eq-band-label">${label}</div>
      `;
      bandsEl.appendChild(band);

      const slider = band.querySelector(`#eq-band-${i}`);
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.audio.setEQBand(i, v);
        document.getElementById(`eq-val-${i}`).textContent = `${v > 0 ? '+' : ''}${v} dB`;
      });
    });

    // Presets
    this.renderPresets();
  }

  renderPresets() {
    const container = document.getElementById('eq-preset-list');
    if (!container) return;
    container.innerHTML = '';

    const presetNames = Object.keys(this.audio.EQ_PRESETS);
    const currentPreset = this.state.getConfig('audio.equalizerPreset') || 'flat';

    presetNames.forEach(name => {
      const btn = document.createElement('button');
      btn.className = `eq-preset-btn${name === currentPreset ? ' active' : ''}`;
      btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      btn.addEventListener('click', () => {
        this.audio.applyPreset(name);
        this.syncSliders();
        container.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      container.appendChild(btn);
    });
  }

  syncSliders() {
    this.audio.EQ_VALUES.forEach((val, i) => {
      const slider = document.getElementById(`eq-band-${i}`);
      const label = document.getElementById(`eq-val-${i}`);
      if (slider) slider.value = val;
      if (label) label.textContent = `${val > 0 ? '+' : ''}${val} dB`;
    });
  }

  bindControls() {
    // Bass boost
    const bassSlider = document.getElementById('eq-bass-boost');
    const bassVal = document.getElementById('eq-bass-boost-val');
    bassSlider?.addEventListener('input', () => {
      const v = parseFloat(bassSlider.value);
      this.audio.setBassBoost(v);
      if (bassVal) bassVal.textContent = `${v} dB`;
    });

    // Balance
    const balSlider = document.getElementById('eq-balance');
    const balVal = document.getElementById('eq-balance-val');
    balSlider?.addEventListener('input', () => {
      const v = parseInt(balSlider.value);
      this.audio.setBalance(v);
      if (balVal) balVal.textContent = v === 0 ? 'Center' : v < 0 ? `L${Math.abs(v)}` : `R${v}`;
    });

    // Surround
    document.getElementById('eq-surround')?.addEventListener('change', (e) => {
      this.audio.setSurround(e.target.checked);
    });
  }

  show() {
    this.syncSliders();
    document.getElementById('equalizer-modal')?.classList.remove('hidden');
  }

  hide() {
    document.getElementById('equalizer-modal')?.classList.add('hidden');
  }
}
