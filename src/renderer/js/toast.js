/**
 * Vibe — Toast Notifications
 */

export class Toast {
  constructor() {
    this._container = document.getElementById('toast-container');
    window.addEventListener('toast', (e) => this.show(e.detail.msg, e.detail.type));
  }

  show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;

    this._container?.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }
}
