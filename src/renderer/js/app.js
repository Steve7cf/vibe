/**
 * Vibe Music Player — App Entry Point
 * Orchestrates all modules and initializes the application
 */

import { StateManager } from './state.js';
import { AudioEngine } from './audio.js';
import { LibraryManager } from './library.js';
import { PlaylistManager } from './playlists.js';
import { UIController } from './ui.js';
import { PlayerController } from './player.js';
import { EqualizerController } from './equalizer.js';
import { VisualizerController } from './visualizer.js';
import { SettingsController } from './settings.js';
import { DragDropHandler } from './dragdrop.js';
import { ContextMenu } from './contextmenu.js';
import { Toast } from './toast.js';
import { QueueManager } from './queue.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  console.log('🎵 Vibe starting up...');

  // Load persisted config + session
  const [config, session, library, playlists] = await Promise.all([
    window.vibeAPI.invoke('config:load'),
    window.vibeAPI.invoke('session:load'),
    window.vibeAPI.invoke('library:load'),
    window.vibeAPI.invoke('playlists:load'),
  ]);

  // Apply accent color from config
  if (config.theme?.accentColor) {
    document.documentElement.style.setProperty('--accent', config.theme.accentColor);
    // Recompute derived colors
    setDerivedColors(config.theme.accentColor);
  }

  // Initialize state manager (global store)
  const state = new StateManager({ config, session, library, playlists });
  window.__vibeState = state; // debug access

  // Initialize audio engine
  const audio = new AudioEngine(state);
  await audio.init();

  // Initialize sub-systems
  const queue = new QueueManager(state, audio);
  const library_mgr = new LibraryManager(state, audio, queue);
  const playlists_mgr = new PlaylistManager(state, audio, queue);
  const equalizer = new EqualizerController(state, audio);
  const visualizer = new VisualizerController(audio);
  const toast = new Toast();
  const contextMenu = new ContextMenu(state, audio, queue, library_mgr, playlists_mgr, toast);
  const player = new PlayerController(state, audio, queue, visualizer, toast);
  const ui = new UIController(state, library_mgr, playlists_mgr, queue, player, toast, contextMenu);
  const settings = new SettingsController(state, audio, equalizer, library_mgr, toast);
  const dragdrop = new DragDropHandler(state, library_mgr, queue, toast);

  // Set up IPC listeners from main process
  setupIPCListeners(player, queue, toast);

  // Restore session (last played track, queue, volume, etc.)
  if (config.system.restoreSession) {
    player.restoreSession(session);
  }

  // Initial render
  ui.render();

  // Auto-scan library folders if configured
  if (config.library.scanOnStart && config.library.folders.length > 0) {
    library_mgr.scanFolders(config.library.folders);
  }

  // Show app (remove loading if any)
  document.body.classList.add('app-ready');
  console.log('✅ Vibe ready!');
}

function setDerivedColors(hex) {
  // Compute dim/glow from hex
  document.documentElement.style.setProperty(
    '--accent-glow',
    hex + '40' // 25% opacity
  );
}

function setupIPCListeners(player, queue, toast) {
  // Tray / global shortcut commands
  window.vibeAPI.on('tray:playPause', () => player.togglePlay());
  window.vibeAPI.on('tray:next', () => player.next());
  window.vibeAPI.on('tray:prev', () => player.previous());
  window.vibeAPI.on('tray:stop', () => player.stop());

  window.vibeAPI.on('shortcut:playPause', () => player.togglePlay());
  window.vibeAPI.on('shortcut:next', () => player.next());
  window.vibeAPI.on('shortcut:prev', () => player.previous());
  window.vibeAPI.on('shortcut:stop', () => player.stop());
}

// ─── Start ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(err => {
    console.error('Fatal startup error:', err);
  });
});
