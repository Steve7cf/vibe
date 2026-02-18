/**
 * Vibe — Queue Manager
 * Manages playback queue, shuffle, history
 */

export class QueueManager {
  constructor(state, audio) {
    this.state = state;
    this.audio = audio;
    this._shuffledIndices = [];
  }

  setQueue(tracks, startIndex = 0) {
    this.state.set('queue', tracks);
    this.state.set('currentIndex', startIndex);
    this._buildShuffle(tracks.length, startIndex);
  }

  addToQueue(tracks) {
    const queue = [...this.state.get('queue'), ...tracks];
    this.state.set('queue', queue);
    this._buildShuffle(queue.length, this.state.get('currentIndex'));
  }

  addNext(track) {
    const queue = [...this.state.get('queue')];
    const idx = this.state.get('currentIndex');
    queue.splice(idx + 1, 0, track);
    this.state.set('queue', queue);
  }

  removeFromQueue(index) {
    const queue = [...this.state.get('queue')];
    queue.splice(index, 1);
    const currentIndex = this.state.get('currentIndex');
    if (index < currentIndex) {
      this.state.set('currentIndex', currentIndex - 1);
    }
    this.state.set('queue', queue);
  }

  clearQueue() {
    this.state.set('queue', []);
    this.state.set('currentIndex', -1);
  }

  getNext() {
    const queue = this.state.get('queue');
    const repeat = this.state.get('repeat');
    const shuffle = this.state.get('shuffle');

    if (queue.length === 0) return null;

    if (repeat === 'one') {
      return this.state.get('currentTrack');
    }

    let nextIndex;
    if (shuffle) {
      nextIndex = this._nextShuffled();
    } else {
      nextIndex = this.state.get('currentIndex') + 1;
    }

    if (nextIndex >= queue.length) {
      if (repeat === 'all') nextIndex = 0;
      else return null;
    }

    if (nextIndex < 0) return null;
    this.state.set('currentIndex', nextIndex);
    return queue[nextIndex];
  }

  getPrev() {
    const queue = this.state.get('queue');
    if (queue.length === 0) return null;

    const shuffle = this.state.get('shuffle');
    let idx;
    if (shuffle) {
      idx = this._prevShuffled();
    } else {
      idx = Math.max(0, this.state.get('currentIndex') - 1);
    }

    this.state.set('currentIndex', idx);
    return queue[idx];
  }

  peekNext() {
    const queue = this.state.get('queue');
    const idx = this.state.get('currentIndex');
    const shuffle = this.state.get('shuffle');
    if (shuffle && this._shuffledIndices.length) {
      const pos = this._shuffledIndices.indexOf(idx);
      return queue[this._shuffledIndices[(pos + 1) % this._shuffledIndices.length]];
    }
    return queue[idx + 1] || null;
  }

  reorder(fromIdx, toIdx) {
    const queue = [...this.state.get('queue')];
    const [item] = queue.splice(fromIdx, 1);
    queue.splice(toIdx, 0, item);
    this.state.set('queue', queue);
  }

  setPlayTrack(track, library) {
    // Set full library as queue starting at track
    const idx = library.findIndex(t => t.path === track.path);
    this.setQueue(library, Math.max(0, idx));
    this.state.set('currentTrack', track);
  }

  rebuildIfNeeded() {
    const queue = this.state.get('queue');
    const idx = this.state.get('currentIndex');
    this._buildShuffle(queue.length, idx);
  }

  _buildShuffle(length, currentIdx) {
    const indices = Array.from({ length }, (_, i) => i);
    // Fisher-Yates shuffle excluding current
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    // Bring current to front
    const cidx = indices.indexOf(currentIdx);
    if (cidx > 0) {
      indices.splice(cidx, 1);
      indices.unshift(currentIdx);
    }
    this._shuffledIndices = indices;
    this._shufflePos = 0;
  }

  _nextShuffled() {
    if (this._shuffledIndices.length === 0) return 0;
    this._shufflePos = (this._shufflePos + 1) % this._shuffledIndices.length;
    return this._shuffledIndices[this._shufflePos];
  }

  _prevShuffled() {
    if (this._shuffledIndices.length === 0) return 0;
    this._shufflePos = (this._shufflePos - 1 + this._shuffledIndices.length) % this._shuffledIndices.length;
    return this._shuffledIndices[this._shufflePos];
  }
}
