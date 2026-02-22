const {
  app, BrowserWindow, ipcMain, dialog,
  Tray, Menu, nativeImage, globalShortcut,
  Notification, shell
} = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Platform tweaks ───────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-features', 'GtkFileChooserNative');
if (process.platform === 'linux') {
  process.env.GDK_BACKEND = process.env.GDK_BACKEND || 'x11';
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
}

// ── BUG FIX 1: Single-instance lock ──────────────────────────────────────────
// If a second process is launched, show the existing window and exit immediately.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let tray        = null;
let isQuitting  = false;  // true only when user explicitly chooses Quit
let dialogBusy  = false;  // BUG FIX 3: one dialog at a time

const isDev        = process.argv.includes('--dev');
const CONFIG_PATH  = path.join(app.getPath('userData'), 'config.json');
const LIBRARY_PATH = path.join(app.getPath('userData'), 'library.json');

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadConfig() {
  try { if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch(_){}
  return {
    volume:0.8,shuffle:false,repeat:'off',crossfade:3,fadeIn:true,fadeOut:true,
    eq:{enabled:false,bands:[0,0,0,0,0,0,0,0,0,0]},speed:1,pitch:0,balance:0,
    replayGain:false,folders:[],lastTrackId:null,lastPosition:0,
    accentColor:'#1db954',globalHotkeys:true,notifications:true,
    autoplay:false,visualizerMode:'bars',useAlbumColors:false
  };
}
function saveConfig(cfg) { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg,null,2)); } catch(_){} }
function loadLibrary() {
  try { if (fs.existsSync(LIBRARY_PATH)) return JSON.parse(fs.readFileSync(LIBRARY_PATH,'utf8')); } catch(_){}
  return {tracks:[],playlists:[],recentIds:[],likedIds:[],playCount:{},lastPlayedAt:{}};
}
function saveLibrary(lib) { try { fs.writeFileSync(LIBRARY_PATH, JSON.stringify(lib,null,2)); } catch(_){} }

// ── Window ────────────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:1280, height:800, minWidth:760, minHeight:520,
    frame:false, backgroundColor:'#121212', show:false,
    webPreferences:{
      nodeIntegration:false, contextIsolation:true,
      preload:path.join(__dirname,'preload.js'),
      webSecurity:false
    }
  });
  mainWindow.loadFile(path.join(__dirname,'../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (isDev) mainWindow.webContents.openDevTools();

  // ── BUG FIX 2: Close button actually quits ────────────────────────────────
  // We no longer call mainWindow.hide() — X = quit, full stop.
  // If you want a tray-only mode, use the tray "Hide to tray" option instead.
  mainWindow.on('close', () => {
    isQuitting = true;   // allow the close to proceed
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Vibe Music Player');
  updateTrayMenu();
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function updateTrayMenu(track) {
  const label = track ? `♪  ${(track.title||'Unknown').slice(0,40)}` : 'Vibe Music Player';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label, enabled:false },
    { type:'separator' },
    { label:'Play / Pause', click: () => mainWindow?.webContents.send('tray-action','playpause') },
    { label:'Next',         click: () => mainWindow?.webContents.send('tray-action','next') },
    { label:'Previous',     click: () => mainWindow?.webContents.send('tray-action','prev') },
    { type:'separator' },
    { label:'Show Window',  click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type:'separator' },
    { label:'Quit Vibe',    click: () => { isQuitting=true; app.quit(); } }
  ]));
}

function registerShortcuts() {
  const fwd = cmd => mainWindow?.webContents.send('global-shortcut', cmd);
  try {
    globalShortcut.register('MediaPlayPause',     () => fwd('playpause'));
    globalShortcut.register('MediaNextTrack',     () => fwd('next'));
    globalShortcut.register('MediaPreviousTrack', () => fwd('prev'));
    globalShortcut.register('MediaStop',          () => fwd('stop'));
  } catch(_) {}
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => { createMainWindow(); createTray(); registerShortcuts(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());

// ── IPC: config / library ─────────────────────────────────────────────────────
ipcMain.handle('get-config',   ()      => loadConfig());
ipcMain.handle('save-config',  (_,cfg) => { saveConfig(cfg); return true; });
ipcMain.handle('get-library',  ()      => loadLibrary());
ipcMain.handle('save-library', (_,lib) => { saveLibrary(lib); return true; });

// ── BUG FIX 3: dialog guard ──────────────────────────────────────────────────
// dialogBusy prevents the renderer from firing the IPC handler 20 times
// while the OS file picker is already open.
async function safeDialog(fn) {
  if (dialogBusy) return null;           // already showing a dialog — ignore
  dialogBusy = true;
  try   { return await fn(); }
  finally { dialogBusy = false; }
}

ipcMain.handle('open-files', () => safeDialog(async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title:'Add Audio Files', properties:['openFile','multiSelections'],
    filters:[{name:'Audio',extensions:['mp3','wav','flac','ogg','m4a','aac','wma','opus']}]
  });
  return r.canceled ? [] : r.filePaths;
}));

ipcMain.handle('open-folder', () => safeDialog(async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title:'Select Music Folder', properties:['openDirectory','multiSelections']
  });
  return r.canceled ? [] : r.filePaths;
}));

ipcMain.handle('export-playlist', (_,data) => safeDialog(async () => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath:`${data.name}.m3u`,
    filters:[{name:'Playlist',extensions:['m3u','m3u8']}]
  });
  if (r.canceled) return false;
  const content = '#EXTM3U\n' + data.tracks
    .map(t=>`#EXTINF:${Math.round(t.duration)},${t.artist} - ${t.title}\n${t.path}`)
    .join('\n');
  fs.writeFileSync(r.filePath, content, 'utf8');
  return true;
}));

ipcMain.handle('import-playlist', () => safeDialog(async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title:'Import Playlist',
    filters:[{name:'Playlist',extensions:['m3u','m3u8']}],
    properties:['openFile']
  });
  if (r.canceled || !r.filePaths.length) return [];
  return fs.readFileSync(r.filePaths[0],'utf8').split('\n')
    .map(l=>l.trim()).filter(l=>l && !l.startsWith('#') && fs.existsSync(l));
}));

// ── IPC: folder scan ──────────────────────────────────────────────────────────
ipcMain.handle('scan-folder', (_, folderPath) => {
  const AUDIO = new Set(['.mp3','.wav','.flac','.ogg','.m4a','.aac','.wma','.opus']);
  const files = [];
  function walk(dir) {
    try {
      for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
        const full = path.join(dir,e.name);
        if (e.isDirectory()) walk(full);
        else if (AUDIO.has(path.extname(e.name).toLowerCase())) files.push(full);
      }
    } catch(_) {}
  }
  walk(folderPath);
  return files;
});

// ── IPC: metadata ─────────────────────────────────────────────────────────────
ipcMain.handle('read-metadata', async (_,filePath) => {
  const filename = path.basename(filePath, path.extname(filePath));
  const fb = {
    title: filename, artist:'', album:'', genre:'',
    year:null, track:0, duration:0, bitrate:0, sampleRate:0, artwork:null, path:filePath
  };
  try {
    // Try music-metadata (installed) or node-id3 as fallback
    let mm;
    try { mm = require('music-metadata'); } catch(_) {}

    if (mm) {
      const meta = await mm.parseFile(filePath, { skipCovers:false, duration:true, includeChapters:false });
      const c    = meta.common;
      let artwork = null;
      if (c.picture?.length) {
        const pic = c.picture[0];
        const fmt = pic.format || 'image/jpeg';
        artwork = `data:${fmt};base64,${Buffer.from(pic.data).toString('base64')}`;
      }
      return {
        title:     (c.title    || filename).trim(),
        artist:    (c.artist   || c.albumartist || '').trim(),
        album:     (c.album    || '').trim(),
        genre:     c.genre?.length ? c.genre[0] : '',
        year:      c.year || null,
        track:     c.track?.no || 0,
        duration:  meta.format.duration || 0,
        bitrate:   Math.round((meta.format.bitrate || 0) / 1000),
        sampleRate:meta.format.sampleRate || 0,
        artwork, path:filePath
      };
    }

    // Fallback: node-id3 for MP3 files
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp3') {
      try {
        const ID3 = require('node-id3');
        const tags = ID3.read(filePath);
        let artwork = null;
        if (tags.image?.imageBuffer) {
          const fmt = tags.image.mime || 'image/jpeg';
          artwork = `data:${fmt};base64,${tags.image.imageBuffer.toString('base64')}`;
        }
        return {
          title:     (tags.title  || filename).trim(),
          artist:    (tags.artist || '').trim(),
          album:     (tags.album  || '').trim(),
          genre:     tags.genre   || '',
          year:      tags.year    || null,
          track:     parseInt(tags.trackNumber) || 0,
          duration:  0,   // will be probed in renderer via Audio element
          bitrate:   0,
          sampleRate:0,
          artwork, path:filePath
        };
      } catch(_) {}
    }
    return fb;
  } catch(e) {
    console.warn('[meta]', filePath, e.message);
    return fb;
  }
});

// ── IPC: window controls ──────────────────────────────────────────────────────
ipcMain.on('window-control', (_,action) => {
  if (!mainWindow) return;
  if      (action==='minimize') mainWindow.minimize();
  else if (action==='maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action==='close')  { isQuitting=true; app.quit(); }   // X = really quit
});

// ── IPC: misc ─────────────────────────────────────────────────────────────────
ipcMain.on('notify-track', (_,track) => {
  updateTrayMenu(track);
  try { new Notification({title:'Vibe',body:`${track.artist} — ${track.title}`,silent:true}).show(); } catch(_){}
});
ipcMain.handle('get-audio-devices', async () => [{id:'default',label:'Default Output Device'}]);
ipcMain.on('open-external', (_,url) => shell.openExternal(url));
