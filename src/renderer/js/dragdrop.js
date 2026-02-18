/**
 * Vibe — Drag & Drop Handler
 * Handle dropping audio files onto the window
 */

export class DragDropHandler {
  constructor(state, library, queue, toast) {
    this.state = state;
    this.library = library;
    this.queue = queue;
    this.toast = toast;

    this._overlay = document.getElementById('drop-overlay');
    this._dragCount = 0;

    document.addEventListener('dragenter', (e) => this.onDragEnter(e));
    document.addEventListener('dragleave', (e) => this.onDragLeave(e));
    document.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.addEventListener('drop', (e) => this.onDrop(e));
  }

  onDragEnter(e) {
    e.preventDefault();
    this._dragCount++;
    if (this._dragCount === 1) this._overlay?.classList.remove('hidden');
  }

  onDragLeave(e) {
    this._dragCount--;
    if (this._dragCount === 0) this._overlay?.classList.add('hidden');
  }

  async onDrop(e) {
    e.preventDefault();
    this._dragCount = 0;
    this._overlay?.classList.add('hidden');

    const SUPPORTED = ['.mp3','.wav','.flac','.ogg','.m4a','.aac','.opus','.wma'];
    const files = [...e.dataTransfer.files].filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return SUPPORTED.includes(ext);
    });

    if (!files.length) {
      this.toast.show('No supported audio files found', 'error');
      return;
    }

    this.library.showLoading(`Loading ${files.length} file(s)...`);
    const lib = this.state.get('library');
    const existingPaths = new Set(lib.map(t => t.path));
    const newTracks = [];

    for (const file of files) {
      const path = file.path;
      if (!existingPaths.has(path)) {
        const meta = await window.vibeAPI.invoke('library:getMetadata', path);
        newTracks.push(meta);
      }
    }

    if (newTracks.length) {
      const updated = [...lib, ...newTracks];
      this.state.set('library', updated);
      await this.state.persistLibrary();
      window.dispatchEvent(new CustomEvent('library:updated'));
      this.toast.show(`Added ${newTracks.length} track(s)`, 'success');
    }

    this.library.hideLoading();
  }
}
