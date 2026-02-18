/**
 * Vibe — Playlist Manager
 */

import { generateId } from './utils.js';

export class PlaylistManager {
  constructor(state, audio, queue) {
    this.state = state;
    this.audio = audio;
    this.queue = queue;

    document.getElementById('btn-create-playlist')?.addEventListener('click', () => this.showCreateModal());
    document.getElementById('btn-new-playlist')?.addEventListener('click', () => this.showCreateModal());
    document.getElementById('btn-import-playlist')?.addEventListener('click', () => this.importPlaylist());
    document.getElementById('btn-confirm-create-playlist')?.addEventListener('click', () => this.confirmCreate());
    document.getElementById('btn-export-playlist')?.addEventListener('click', () => this.exportCurrent());
    document.getElementById('btn-delete-playlist')?.addEventListener('click', () => this.deleteCurrent());
    document.getElementById('btn-play-playlist')?.addEventListener('click', () => this.playCurrent());
    document.getElementById('btn-shuffle-playlist')?.addEventListener('click', () => this.shuffleCurrent());

    // Modal close
    document.querySelectorAll('#create-playlist-modal .modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.hideCreateModal());
    });
    document.querySelector('#create-playlist-modal .modal-backdrop')?.addEventListener('click', () => this.hideCreateModal());

    document.getElementById('new-playlist-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.confirmCreate();
    });
  }

  create(name) {
    const playlist = {
      id: generateId(),
      name: name || 'New Playlist',
      tracks: [],
      created: Date.now(),
      modified: Date.now(),
    };
    const playlists = [...this.state.get('playlists'), playlist];
    this.state.set('playlists', playlists);
    this.state.persistPlaylists();
    window.dispatchEvent(new CustomEvent('playlists:updated'));
    return playlist;
  }

  addTracksToPlaylist(playlistId, tracks) {
    const playlists = this.state.get('playlists').map(p => {
      if (p.id !== playlistId) return p;
      const existingPaths = new Set(p.tracks.map(t => t.path));
      const newTracks = tracks.filter(t => !existingPaths.has(t.path));
      return { ...p, tracks: [...p.tracks, ...newTracks], modified: Date.now() };
    });
    this.state.set('playlists', playlists);
    this.state.persistPlaylists();
    window.dispatchEvent(new CustomEvent('playlists:updated'));
  }

  removeTrackFromPlaylist(playlistId, trackPath) {
    const playlists = this.state.get('playlists').map(p => {
      if (p.id !== playlistId) return p;
      return { ...p, tracks: p.tracks.filter(t => t.path !== trackPath), modified: Date.now() };
    });
    this.state.set('playlists', playlists);
    this.state.persistPlaylists();
    window.dispatchEvent(new CustomEvent('playlists:updated'));
  }

  delete(playlistId) {
    const playlists = this.state.get('playlists').filter(p => p.id !== playlistId);
    this.state.set('playlists', playlists);
    this.state.set('activePlaylistId', null);
    this.state.persistPlaylists();
    window.dispatchEvent(new CustomEvent('playlists:updated'));
  }

  getById(id) {
    return this.state.get('playlists').find(p => p.id === id);
  }

  async exportPlaylist(playlist) {
    const savePath = await window.vibeAPI.invoke('dialog:exportPlaylist', playlist.name);
    if (!savePath) return;
    const result = await window.vibeAPI.invoke('playlist:export', { filePath: savePath, tracks: playlist.tracks });
    if (result.success) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Playlist exported!', type: 'success' } }));
    }
  }

  async importPlaylist() {
    const filePath = await window.vibeAPI.invoke('dialog:importPlaylist');
    if (!filePath) return;
    const result = await window.vibeAPI.invoke('playlist:import', filePath);
    if (result.success) {
      const name = filePath.split('/').pop().replace(/\.m3u8?$/i, '');
      const playlist = this.create(name);
      this.addTracksToPlaylist(playlist.id, result.tracks);
    }
  }

  showCreateModal() {
    const modal = document.getElementById('create-playlist-modal');
    modal?.classList.remove('hidden');
    document.getElementById('new-playlist-name')?.focus();
  }

  hideCreateModal() {
    const modal = document.getElementById('create-playlist-modal');
    modal?.classList.add('hidden');
    const input = document.getElementById('new-playlist-name');
    if (input) input.value = '';
  }

  confirmCreate() {
    const input = document.getElementById('new-playlist-name');
    const name = input?.value.trim() || 'New Playlist';
    this.create(name);
    this.hideCreateModal();
  }

  playCurrent() {
    const id = this.state.get('activePlaylistId');
    const pl = this.getById(id);
    if (!pl?.tracks.length) return;
    this.queue.setQueue(pl.tracks, 0);
    window.dispatchEvent(new CustomEvent('player:play', { detail: { track: pl.tracks[0] } }));
  }

  shuffleCurrent() {
    const id = this.state.get('activePlaylistId');
    const pl = this.getById(id);
    if (!pl?.tracks.length) return;
    const shuffled = [...pl.tracks].sort(() => Math.random() - 0.5);
    this.queue.setQueue(shuffled, 0);
    this.state.set('shuffle', true);
    window.dispatchEvent(new CustomEvent('player:play', { detail: { track: shuffled[0] } }));
  }

  deleteCurrent() {
    const id = this.state.get('activePlaylistId');
    if (!id) return;
    if (confirm('Delete this playlist?')) {
      this.delete(id);
      document.getElementById('playlist-detail')?.classList.add('hidden');
      document.getElementById('playlists-grid')?.classList.remove('hidden');
    }
  }

  exportCurrent() {
    const id = this.state.get('activePlaylistId');
    const pl = this.getById(id);
    if (pl) this.exportPlaylist(pl);
  }
}
