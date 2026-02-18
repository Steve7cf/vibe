/**
 * Vibe Music Player - Preload Script
 * Exposes a secure API bridge between main and renderer processes
 */

const { contextBridge, ipcRenderer } = require('electron');

// Allowed IPC channels for security
const SEND_CHANNELS = [
  'window:minimize', 'window:maximize', 'window:close', 'window:toggleMiniPlayer',
  'system:notification', 'tray:updateTrack', 'shortcuts:update',
  'tray:playPause', 'tray:next', 'tray:prev',
];

const RECEIVE_CHANNELS = [
  'tray:playPause', 'tray:next', 'tray:prev', 'tray:stop',
  'shortcut:playPause', 'shortcut:next', 'shortcut:prev', 'shortcut:stop',
  'mini:stateUpdate',
];

const INVOKE_CHANNELS = [
  'config:load', 'config:save', 'config:reset',
  'library:load', 'library:save', 'library:scan', 'library:scanMultiple',
  'library:getMetadata',
  'playlists:load', 'playlists:save',
  'session:load', 'session:save',
  'dialog:openFiles', 'dialog:openFolder', 'dialog:exportPlaylist', 'dialog:importPlaylist',
  'playlist:export', 'playlist:import',
  'system:getAudioDevices', 'system:revealFile', 'system:openExternal',
  'app:version', 'app:userData',
  'cache:clear',
  'file:exists', 'file:readAsBase64',
];

contextBridge.exposeInMainWorld('vibeAPI', {
  // Send one-way message to main
  send: (channel, ...args) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  // Listen for messages from main
  on: (channel, callback) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      const listener = (_, ...args) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },

  // Two-way invoke/handle
  invoke: (channel, ...args) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} not allowed`));
  },

  // Platform info
  platform: process.platform,
});
