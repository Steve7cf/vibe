/**
 * Vibe Music Player - Main Process
 * Handles window creation, IPC, system tray, and file system operations
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage,
        globalShortcut, Notification, shell, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Constants ───────────────────────────────────────────────────────────────
const SUPPORTED_FORMATS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma'];
const USER_DATA_PATH = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const LIBRARY_PATH = path.join(USER_DATA_PATH, 'library.json');
const PLAYLISTS_PATH = path.join(USER_DATA_PATH, 'playlists.json');
const SESSION_PATH = path.join(USER_DATA_PATH, 'session.json');

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow = null;
let miniPlayerWindow = null;
let tray = null;
let isQuitting = false;

// ─── Default Configuration ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  theme: { accentColor: '#1db954', darkMode: true },
  audio: {
    crossfadeDuration: 3,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    defaultVolume: 0.8,
    playbackSpeed: 1.0,
    equalizerPreset: 'flat',
    replayGain: false,
    balance: 0,
    bassBoost: 0,
    surroundEnabled: false,
  },
  playback: {
    shuffle: false,
    repeat: 'off', // off | one | all
    autoPlay: false,
    gapless: true,
    autoDJ: false,
    crossfadeEnabled: true,
  },
  library: { folders: [], scanOnStart: true },
  ui: {
    miniPlayerMode: false,
    showVisualizerDefault: 'bars',
    sidebarWidth: 220,
    showLyrics: false,
    sleepTimer: 0,
  },
  system: {
    minimizeToTray: false,
    startMinimized: false,
    globalHotkeys: true,
    showNotifications: true,
    startOnLogin: false,
    restoreSession: true,
  },
  shortcuts: {
    playPause: 'MediaPlayPause',
    next: 'MediaNextTrack',
    prev: 'MediaPreviousTrack',
    volumeUp: 'MediaStop',
    mute: null,
  },
};

// ─── Config Helpers ───────────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return deepMerge(DEFAULT_CONFIG, data);
    }
  } catch (e) { console.error('Config load error:', e); }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) { console.error('Config save error:', e); }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadJSON(filePath, defaultVal = {}) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { console.error(`Load error ${filePath}:`, e); }
  return defaultVal;
}

function saveJSON(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) { console.error(`Save error ${filePath}:`, e); return false; }
}

// ─── Window Creation ──────────────────────────────────────────────────────────
function createMainWindow() {
  const config = loadConfig();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Vibe',
    backgroundColor: '#121212',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local audio files
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!config.system.startMinimized) mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    // Re-read config fresh in case user changed it during session
    const currentConfig = loadConfig();
    if (!isQuitting && currentConfig.system.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
    // If minimizeToTray is false (default), let the window close normally → app quits
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function createMiniPlayer() {
  if (miniPlayerWindow) { miniPlayerWindow.focus(); return; }

  miniPlayerWindow = new BrowserWindow({
    width: 380,
    height: 120,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  miniPlayerWindow.loadFile(path.join(__dirname, '../renderer/miniplayer.html'));
  miniPlayerWindow.on('closed', () => { miniPlayerWindow = null; });
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  // Create a simple 16x16 tray icon using canvas-like approach
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  let trayIcon;
  
  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      trayIcon = nativeImage.createEmpty();
    }
  } catch { trayIcon = nativeImage.createEmpty(); }

  tray = new Tray(trayIcon);
  tray.setToolTip('Vibe Music Player');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

function updateTrayMenu(trackInfo = null) {
  if (!tray) return;
  const label = trackInfo ? `${trackInfo.title} — ${trackInfo.artist}` : 'Vibe Music Player';
  const menu = Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    { label: 'Play/Pause', click: () => mainWindow?.webContents.send('tray:playPause') },
    { label: 'Next', click: () => mainWindow?.webContents.send('tray:next') },
    { label: 'Previous', click: () => mainWindow?.webContents.send('tray:prev') },
    { type: 'separator' },
    { label: 'Show Vibe', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Mini Player', click: () => createMiniPlayer() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ─── Global Shortcuts ─────────────────────────────────────────────────────────
function registerGlobalShortcuts(config) {
  globalShortcut.unregisterAll();
  if (!config.system.globalHotkeys) return;

  const shortcuts = {
    'MediaPlayPause': () => mainWindow?.webContents.send('shortcut:playPause'),
    'MediaNextTrack': () => mainWindow?.webContents.send('shortcut:next'),
    'MediaPreviousTrack': () => mainWindow?.webContents.send('shortcut:prev'),
    'MediaStop': () => mainWindow?.webContents.send('shortcut:stop'),
  };

  for (const [key, fn] of Object.entries(shortcuts)) {
    try { globalShortcut.register(key, fn); } catch (e) { /* ignore */ }
  }
}

// ─── File System Helpers ──────────────────────────────────────────────────────
async function scanFolder(folderPath) {
  const tracks = [];
  
  async function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_FORMATS.includes(ext)) {
          const track = await extractMetadata(fullPath);
          tracks.push(track);
        }
      }
    }
  }

  await walk(folderPath);
  return tracks;
}

async function extractMetadata(filePath) {
  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath, ext);

  const track = {
    id: Buffer.from(filePath).toString('base64').slice(0, 32) + Date.now().toString(36),
    path: filePath,
    filename: path.basename(filePath),
    title: name,
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    genre: 'Unknown',
    year: null,
    duration: 0,
    trackNumber: null,
    artwork: null,
    size: stats.size,
    dateAdded: Date.now(),
    format: ext.slice(1).toUpperCase(),
  };

  try {
    const mm = require('music-metadata');
    const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: false });
    const { common, format } = metadata;

    if (common.title) track.title = common.title;
    if (common.artist) track.artist = common.artist;
    if (common.album) track.album = common.album;
    if (common.genre?.length) track.genre = common.genre[0];
    if (common.year) track.year = common.year;
    if (format.duration) track.duration = Math.round(format.duration);
    if (common.track?.no) track.trackNumber = common.track.no;

    // Extract artwork as base64 data URL
    if (common.picture?.length) {
      const pic = common.picture[0];
      const b64 = pic.data.toString('base64');
      track.artwork = `data:${pic.format};base64,${b64}`;
    }
  } catch (e) {
    // metadata parsing failed, use filename defaults
  }

  return track;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Guard: prevent multiple dialogs opening simultaneously
  let _dialogOpen = false;

  const withDialogGuard = (fn) => async (...args) => {
    if (_dialogOpen) return null;
    _dialogOpen = true;
    try { return await fn(...args); }
    finally { _dialogOpen = false; }
  };
  // ── Window controls ──
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('window:toggleMiniPlayer', () => {
    if (miniPlayerWindow) { miniPlayerWindow.close(); mainWindow?.show(); }
    else { createMiniPlayer(); mainWindow?.hide(); }
  });

  // ── Config ──
  ipcMain.handle('config:load', () => loadConfig());
  ipcMain.handle('config:save', (_, config) => { saveConfig(config); return true; });
  ipcMain.handle('config:reset', () => { saveConfig(DEFAULT_CONFIG); return DEFAULT_CONFIG; });

  // ── Library ──
  ipcMain.handle('library:load', () => loadJSON(LIBRARY_PATH, []));
  ipcMain.handle('library:save', (_, library) => saveJSON(LIBRARY_PATH, library));

  ipcMain.handle('library:scan', async (_, folderPath) => {
    return await scanFolder(folderPath);
  });

  ipcMain.handle('library:scanMultiple', async (_, folders) => {
    const allTracks = [];
    for (const folder of folders) {
      const tracks = await scanFolder(folder);
      allTracks.push(...tracks);
    }
    return allTracks;
  });

  ipcMain.handle('library:getMetadata', async (_, filePath) => {
    return await extractMetadata(filePath);
  });

  // ── Playlists ──
  ipcMain.handle('playlists:load', () => loadJSON(PLAYLISTS_PATH, []));
  ipcMain.handle('playlists:save', (_, playlists) => saveJSON(PLAYLISTS_PATH, playlists));

  // ── Session ──
  ipcMain.handle('session:load', () => loadJSON(SESSION_PATH, {}));
  ipcMain.handle('session:save', (_, session) => saveJSON(SESSION_PATH, session));

  // ── File Dialogs ──
  ipcMain.handle('dialog:openFiles', withDialogGuard(async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add Music Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio Files', extensions: ['mp3','wav','flac','ogg','m4a','aac','opus','wma'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  }));

  ipcMain.handle('dialog:openFolder', withDialogGuard(async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Music Folder',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  }));

  ipcMain.handle('dialog:exportPlaylist', withDialogGuard(async (_, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Playlist',
      defaultPath: defaultName + '.m3u',
      filters: [{ name: 'M3U Playlist', extensions: ['m3u'] }],
    });
    return result.canceled ? null : result.filePath;
  }));

  ipcMain.handle('dialog:importPlaylist', withDialogGuard(async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Playlist',
      properties: ['openFile'],
      filters: [{ name: 'Playlists', extensions: ['m3u', 'm3u8'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  }));

  // ── Playlist Import/Export ──
  ipcMain.handle('playlist:export', async (_, { filePath, tracks }) => {
    try {
      let m3u = '#EXTM3U\n';
      for (const t of tracks) {
        m3u += `#EXTINF:${t.duration},${t.artist} - ${t.title}\n${t.path}\n`;
      }
      fs.writeFileSync(filePath, m3u, 'utf8');
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('playlist:import', async (_, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      const paths = [];
      for (const line of lines) {
        if (!line.startsWith('#')) {
          const absPath = path.isAbsolute(line) ? line : path.join(path.dirname(filePath), line);
          if (fs.existsSync(absPath)) paths.push(absPath);
        }
      }
      const tracks = await Promise.all(paths.map(p => extractMetadata(p)));
      return { success: true, tracks };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── System ──
  ipcMain.handle('system:getAudioDevices', async () => {
    // Renderer will enumerate devices via Web Audio API
    return [];
  });

  ipcMain.on('system:notification', (_, { title, body, icon }) => {
    const config = loadConfig();
    if (!config.system.showNotifications) return;
    if (Notification.isSupported()) {
      new Notification({ title: title || 'Vibe', body: body || '', icon }).show();
    }
  });

  ipcMain.on('tray:updateTrack', (_, trackInfo) => {
    updateTrayMenu(trackInfo);
  });

  ipcMain.handle('system:revealFile', (_, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('system:openExternal', (_, url) => {
    shell.openExternal(url);
  });

  // ── Shortcuts registration ──
  ipcMain.on('shortcuts:update', (_, config) => {
    registerGlobalShortcuts(config);
  });

  // ── App info ──
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:userData', () => USER_DATA_PATH);

  // ── Cache management ──
  ipcMain.handle('cache:clear', async () => {
    await mainWindow?.webContents.session.clearCache();
    return true;
  });

  // ── File reading for artwork ──
  ipcMain.handle('file:exists', (_, filePath) => fs.existsSync(filePath));
  ipcMain.handle('file:readAsBase64', (_, filePath) => {
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1);
      return `data:image/${ext};base64,${data.toString('base64')}`;
    } catch { return null; }
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const config = loadConfig();

  nativeTheme.themeSource = 'dark';

  createMainWindow();
  createTray();
  setupIPC();
  registerGlobalShortcuts(config);

  // macOS re-open
  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
