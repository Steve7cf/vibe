const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibeAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getLibrary: () => ipcRenderer.invoke('get-library'),
  saveLibrary: (lib) => ipcRenderer.invoke('save-library', lib),
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  scanFolder: (p) => ipcRenderer.invoke('scan-folder', p),
  readMetadata: (p) => ipcRenderer.invoke('read-metadata', p),
  exportPlaylist: (data) => ipcRenderer.invoke('export-playlist', data),
  importPlaylist: () => ipcRenderer.invoke('import-playlist'),
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  windowControl: (action) => ipcRenderer.send('window-control', action),
  notifyTrack: (track) => ipcRenderer.send('notify-track', track),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onTrayAction: (cb) => ipcRenderer.on('tray-action', (e, a) => cb(a)),
  onGlobalShortcut: (cb) => ipcRenderer.on('global-shortcut', (e, a) => cb(a))
});
