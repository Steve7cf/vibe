const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, globalShortcut, Notification, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-features', 'GtkFileChooserNative');
if (process.platform === 'linux') {
  process.env.GDK_BACKEND = process.env.GDK_BACKEND || 'x11';
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
}

let mainWindow, tray;
const isDev = process.argv.includes('--dev');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const LIBRARY_PATH = path.join(app.getPath('userData'), 'library.json');

function loadConfig() {
  try { if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch(e) {}
  return {
    volume: 0.8, shuffle: false, repeat: 'off',
    crossfade: 3, fadeIn: true, fadeOut: true,
    eq: { enabled: false, bands: [0,0,0,0,0,0,0,0,0,0] },
    speed: 1, pitch: 0, balance: 0, replayGain: false,
    folders: [], lastTrackId: null, lastPosition: 0,
    accentColor: '#1db954', globalHotkeys: true, notifications: true,
    autoplay: false, visualizerMode: 'bars', useAlbumColors: false
  };
}
function saveConfig(cfg) { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch(e) {} }

function loadLibrary() {
  try { if (fs.existsSync(LIBRARY_PATH)) return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8')); } catch(e) {}
  return { tracks: [], playlists: [], recentIds: [], likedIds: [], playCount: {}, lastPlayedAt: {} };
}
function saveLibrary(lib) { try { fs.writeFileSync(LIBRARY_PATH, JSON.stringify(lib, null, 2)); } catch(e) {} }

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 760, minHeight: 520,
    frame: false, backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  if (isDev) mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Vibe');
  updateTrayMenu();
  tray.on('double-click', () => mainWindow?.show());
}

function updateTrayMenu(track) {
  const menu = Menu.buildFromTemplate([
    { label: track ? `♪ ${track.title || 'Unknown'}` : 'Vibe', enabled: false },
    { type: 'separator' },
    { label: 'Play/Pause', click: () => mainWindow?.webContents.send('tray-action', 'playpause') },
    { label: 'Next', click: () => mainWindow?.webContents.send('tray-action', 'next') },
    { label: 'Previous', click: () => mainWindow?.webContents.send('tray-action', 'prev') },
    { type: 'separator' },
    { label: 'Show', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function registerGlobalShortcuts() {
  try {
    globalShortcut.register('MediaPlayPause', () => mainWindow?.webContents.send('global-shortcut', 'playpause'));
    globalShortcut.register('MediaNextTrack', () => mainWindow?.webContents.send('global-shortcut', 'next'));
    globalShortcut.register('MediaPreviousTrack', () => mainWindow?.webContents.send('global-shortcut', 'prev'));
    globalShortcut.register('MediaStop', () => mainWindow?.webContents.send('global-shortcut', 'stop'));
  } catch(e) {}
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  registerGlobalShortcuts();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());

// IPC
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (e, cfg) => { saveConfig(cfg); return true; });
ipcMain.handle('get-library', () => loadLibrary());
ipcMain.handle('save-library', (e, lib) => { saveLibrary(lib); return true; });

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3','wav','flac','ogg','m4a','aac','wma','opus'] }]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'multiSelections'] });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('scan-folder', async (e, folderPath) => {
  const audioExts = new Set(['.mp3','.wav','.flac','.ogg','.m4a','.aac','.wma','.opus']);
  const files = [];
  function scan(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (audioExts.has(path.extname(entry.name).toLowerCase())) files.push(full);
      }
    } catch(e) {}
  }
  scan(folderPath);
  return files;
});

ipcMain.handle('read-metadata', async (e, filePath) => {
  const base = {
    title: path.basename(filePath, path.extname(filePath)),
    artist: 'Unknown Artist', album: 'Unknown Album',
    genre: '', year: null, track: 0, duration: 0,
    bitrate: 0, sampleRate: 0, artwork: null, path: filePath
  };
  try {
    const mm = require('music-metadata');
    const meta = await mm.parseFile(filePath, { skipCovers: false, duration: true });
    const c = meta.common;
    let artwork = null;
    if (c.picture && c.picture.length > 0) {
      const pic = c.picture[0];
      const fmt = pic.format || 'image/jpeg';
      artwork = `data:${fmt};base64,${Buffer.from(pic.data).toString('base64')}`;
    }
    return {
      title: (c.title || base.title).trim() || base.title,
      artist: (c.artist || c.albumartist || base.artist).trim(),
      album: (c.album || base.album).trim(),
      genre: c.genre && c.genre.length ? c.genre[0] : '',
      year: c.year || null,
      track: c.track?.no || 0,
      duration: meta.format.duration || 0,
      bitrate: Math.round((meta.format.bitrate || 0) / 1000),
      sampleRate: meta.format.sampleRate || 0,
      artwork,
      path: filePath
    };
  } catch(err) {
    return base;
  }
});

ipcMain.handle('export-playlist', async (e, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${data.name}.m3u`,
    filters: [{ name: 'Playlist', extensions: ['m3u','m3u8'] }]
  });
  if (!result.canceled) {
    const content = '#EXTM3U\n' + data.tracks.map(t =>
      `#EXTINF:${Math.round(t.duration)},${t.artist} - ${t.title}\n${t.path}`
    ).join('\n');
    fs.writeFileSync(result.filePath, content, 'utf8');
    return true;
  }
  return false;
});

ipcMain.handle('import-playlist', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Playlist', extensions: ['m3u','m3u8'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return [];
  const lines = fs.readFileSync(result.filePaths[0], 'utf8').split('\n');
  return lines.filter(l => l.trim() && !l.startsWith('#') && fs.existsSync(l.trim())).map(l => l.trim());
});

ipcMain.on('window-control', (e, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.hide();
});

ipcMain.on('notify-track', (e, track) => {
  updateTrayMenu(track);
  try { new Notification({ title: 'Vibe — Now Playing', body: `${track.artist} — ${track.title}`, silent: true }).show(); } catch(e) {}
});

ipcMain.handle('get-audio-devices', async () => [{ id: 'default', label: 'Default Output Device' }]);
ipcMain.on('open-external', (e, url) => shell.openExternal(url));
