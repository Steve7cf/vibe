const { app, BrowserWindow, ipcMain, dialog, Tray, Menu,
        nativeImage, globalShortcut, Notification, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── Platform ──────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-features', 'GtkFileChooserNative');
if (process.platform === 'linux') {
  process.env.GDK_BACKEND = process.env.GDK_BACKEND || 'x11';
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
}

// ── Single instance ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
});

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA      = app.getPath('userData');
const CFG_PATH  = path.join(DATA, 'config.json');
const LIB_PATH  = path.join(DATA, 'library.json');
const ART_DIR   = path.join(DATA, 'art-cache');
const LOG_PATH  = path.join(DATA, 'vibe.log');
if (!fs.existsSync(ART_DIR)) fs.mkdirSync(ART_DIR, { recursive: true });

// ── Logger ────────────────────────────────────────────────────────────────────
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
const log = (lvl, ...a) => {
  const line = `[${new Date().toISOString()}][${lvl}] ${a.join(' ')}\n`;
  logStream.write(line);
  if (lvl === 'ERR') console.error(...a);
};

// ── Atomic JSON helpers ───────────────────────────────────────────────────────
const readJSON = (p, fb) => {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { log('WRN','readJSON',p,e.message); }
  return fb;
};
const writeJSON = (p, d) => {
  try { const t = p+'.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, p); }
  catch(e) { log('ERR','writeJSON',p,e.message); }
};

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEF_CFG = { volume:0.8,shuffle:false,repeat:'off',crossfade:3,fadeIn:true,fadeOut:true,
  gapless:false,gaplessOffset:8,eq:{enabled:false,bands:[0,0,0,0,0,0,0,0,0,0]},
  speed:1,balance:0,replayGain:false,folders:[],lastTrackId:null,lastPosition:0,
  accentColor:'#1db954',globalHotkeys:true,notifications:true,autoplay:false,
  visualizerMode:'bars',useAlbumColors:false,fontSize:'14px',density:'normal',lightTheme:false };
const DEF_LIB = { tracks:[],playlists:[],recentIds:[],likedIds:[],
  playCount:{},lastPlayedAt:{},skipCount:{},listenDuration:{},fileStats:{} };

const loadCfg  = () => ({ ...DEF_CFG, ...readJSON(CFG_PATH, {}) });
const saveCfg  = c  => writeJSON(CFG_PATH, c);
const loadLib  = () => ({ ...DEF_LIB, ...readJSON(LIB_PATH, {}) });
const saveLib  = l  => writeJSON(LIB_PATH, l);

// ── Artwork disk cache ────────────────────────────────────────────────────────
// Writes base64 artwork to a file keyed by content hash.
// Returns a file:// URL so renderer never stores raw base64 in library.json.
function cacheArt(dataUri) {
  if (!dataUri) return null;
  try {
    const hash = crypto.createHash('md5').update(dataUri.slice(0,600)).digest('hex');
    const ext  = dataUri.startsWith('data:image/png') ? 'png' : 'jpg';
    const file = path.join(ART_DIR, `${hash}.${ext}`);
    if (!fs.existsSync(file)) {
      const b64 = dataUri.split(',')[1];
      if (b64) fs.writeFileSync(file, Buffer.from(b64,'base64'));
    }
    return `file://${file}`;
  } catch(e) { log('WRN','cacheArt',e.message); return dataUri; }
}

// ── File scanning ─────────────────────────────────────────────────────────────
const AUDIO = new Set(['.mp3','.wav','.flac','.ogg','.m4a','.aac','.wma','.opus']);
function walk(dir, out=[]) {
  try {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const full = path.join(dir,e.name);
      if (e.isDirectory()) walk(full,out);
      else if (AUDIO.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  } catch(_) {}
  return out;
}

// Incremental scan — only returns what changed vs known fileStats
ipcMain.handle('scan-incremental', (_,{folders,fileStats={}}) => {
  log('INF','Incremental scan',folders.length,'folders');
  const found=new Set(), added=[], removed=[], changed=[];
  for (const folder of folders) {
    for (const file of walk(folder)) {
      found.add(file);
      try {
        const st   = fs.statSync(file);
        const prev = fileStats[file];
        if (!prev)                                              added.push(file);
        else if (prev.mtime!==st.mtimeMs||prev.size!==st.size) changed.push(file);
        fileStats[file] = { mtime:st.mtimeMs, size:st.size };
      } catch(_) { added.push(file); }
    }
  }
  for (const p of Object.keys(fileStats)) {
    if (!found.has(p)) { removed.push(p); delete fileStats[p]; }
  }
  log('INF',`Scan done +${added.length} ~${changed.length} -${removed.length}`);
  return { added, changed, removed, fileStats };
});

ipcMain.handle('scan-folder', (_,dir) => walk(dir));

// ── Metadata ──────────────────────────────────────────────────────────────────
async function readMeta(filePath) {
  const name = path.basename(filePath, path.extname(filePath));
  const fb   = { title:name,artist:'',album:'',genre:'',year:null,track:0,
                 duration:0,bitrate:0,sampleRate:0,artwork:null,path:filePath };
  try {
    let mm; try { mm = require('music-metadata'); } catch(_){}
    if (!mm) return fb;
    const meta = await mm.parseFile(filePath,{skipCovers:false,duration:true,includeChapters:false});
    const c = meta.common;
    let artwork = null;
    if (c.picture?.length) {
      const pic = c.picture[0];
      const raw = `data:${pic.format||'image/jpeg'};base64,${Buffer.from(pic.data).toString('base64')}`;
      artwork = cacheArt(raw); // write to disk → return file:// url
    }
    return {
      title:     (c.title  ||name).trim(),
      artist:    (c.artist ||c.albumartist||'').trim(),
      album:     (c.album  ||'').trim(),
      genre:     c.genre?.length ? c.genre[0] : '',
      year:      c.year||null, track:c.track?.no||0,
      duration:  meta.format.duration||0,
      bitrate:   Math.round((meta.format.bitrate||0)/1000),
      sampleRate:meta.format.sampleRate||0,
      artwork, path:filePath,
    };
  } catch(e) { log('WRN','readMeta',filePath,e.message); return fb; }
}

// Batch with capped concurrency — 8 parallel reads, ~4-5x faster than serial
ipcMain.handle('read-meta-batch', async (_,paths) => {
  const LIMIT=8, results=new Array(paths.length); let idx=0;
  const worker = async () => { while(idx<paths.length){const i=idx++;results[i]=await readMeta(paths[i]);} };
  await Promise.all(Array.from({length:LIMIT},worker));
  return results;
});

ipcMain.handle('read-metadata', async(_,p)=>readMeta(p));

// Prune orphaned art cache files
ipcMain.handle('prune-art-cache', (_,refs=[]) => {
  try {
    const keep = new Set(refs.map(u=>path.basename(u)));
    let n=0;
    for (const f of fs.readdirSync(ART_DIR)) {
      if (!keep.has(f)) { fs.unlinkSync(path.join(ART_DIR,f)); n++; }
    }
    log('INF',`Art cache: pruned ${n}`); return n;
  } catch(_){ return 0; }
});

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow=null, tray=null, isQuitting=false, dialogBusy=false;
const isDev   = process.argv.includes('--dev');
const doReset = process.argv.includes('--reset');

// --reset wipes config + library so dev launches always start fresh
// Usage: npm run dev -- --reset
if (doReset) {
  [CFG_PATH, LIB_PATH, CFG_PATH+'.tmp', LIB_PATH+'.tmp'].forEach(p => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(_) {}
  });
  log('INF', 'Config reset complete (--reset flag)');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280,height:800,minWidth:760,minHeight:520,
    frame:false,backgroundColor:'#0a0a0a',show:false,
    webPreferences:{
      nodeIntegration:false,contextIsolation:true,
      preload:path.join(__dirname,'preload.js'),
      webSecurity:false,
      backgroundThrottling:false, // keep audio timers alive when minimised
    },
  });
  mainWindow.loadFile(path.join(__dirname,'../renderer/index.html'));
  mainWindow.once('ready-to-show',()=>{ mainWindow.show(); log('INF','Window ready'); });
  if (isDev) mainWindow.webContents.openDevTools();
  mainWindow.on('close',()=>{ isQuitting=true; });
  mainWindow.on('closed',()=>{ mainWindow=null; });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Vibe'); updateTrayMenu();
  tray.on('double-click',()=>{ mainWindow?.show(); mainWindow?.focus(); });
}

function updateTrayMenu(track) {
  const lbl = track ? `♪  ${(track.title||'Unknown').slice(0,40)}` : 'Vibe';
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:lbl,enabled:false},{type:'separator'},
    {label:'Play / Pause',click:()=>mainWindow?.webContents.send('tray-action','playpause')},
    {label:'Next',        click:()=>mainWindow?.webContents.send('tray-action','next')},
    {label:'Previous',    click:()=>mainWindow?.webContents.send('tray-action','prev')},
    {type:'separator'},
    {label:'Show',        click:()=>{ mainWindow?.show(); mainWindow?.focus(); }},
    {type:'separator'},
    {label:'Quit',        click:()=>{ isQuitting=true; app.quit(); }},
  ]));
}

function registerShortcuts() {
  const fwd = cmd => mainWindow?.webContents.send('global-shortcut',cmd);
  try {
    globalShortcut.register('MediaPlayPause',    ()=>fwd('playpause'));
    globalShortcut.register('MediaNextTrack',    ()=>fwd('next'));
    globalShortcut.register('MediaPreviousTrack',()=>fwd('prev'));
    globalShortcut.register('MediaStop',         ()=>fwd('stop'));
  } catch(_){ log('WRN','Media keys unavailable'); }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(()=>{ createWindow(); createTray(); registerShortcuts(); });
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });
app.on('before-quit',()=>{ isQuitting=true; });
app.on('will-quit',()=>{ globalShortcut.unregisterAll(); logStream.end(); });

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-config',  ()   =>loadCfg());
ipcMain.handle('save-config', (_,c)=>{ saveCfg(c); return true; });
ipcMain.handle('get-library', ()   =>loadLib());
ipcMain.handle('save-library',(_,l)=>{ saveLib(l); return true; });

const safeDialog = async fn => {
  if (dialogBusy) return null;
  dialogBusy=true; try { return await fn(); } finally { dialogBusy=false; }
};

ipcMain.handle('open-files',()=>safeDialog(async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Add Audio Files',properties:['openFile','multiSelections'],
    filters:[{name:'Audio',extensions:['mp3','wav','flac','ogg','m4a','aac','wma','opus']}]});
  return r.canceled?[]:r.filePaths;
}));

ipcMain.handle('open-folder',()=>safeDialog(async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Select Music Folder',properties:['openDirectory','multiSelections']});
  return r.canceled?[]:r.filePaths;
}));

ipcMain.handle('export-playlist',(_,data)=>safeDialog(async()=>{
  const r=await dialog.showSaveDialog(mainWindow,{defaultPath:`${data.name}.m3u`,
    filters:[{name:'Playlist',extensions:['m3u','m3u8']}]});
  if(r.canceled) return false;
  fs.writeFileSync(r.filePath,'#EXTM3U\n'+data.tracks
    .map(t=>`#EXTINF:${Math.round(t.duration)},${t.artist} - ${t.title}\n${t.path}`).join('\n'),'utf8');
  return true;
}));

ipcMain.handle('import-playlist',()=>safeDialog(async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Import Playlist',
    filters:[{name:'Playlist',extensions:['m3u','m3u8']}],properties:['openFile']});
  if(r.canceled||!r.filePaths.length) return [];
  return fs.readFileSync(r.filePaths[0],'utf8').split('\n').map(l=>l.trim())
    .filter(l=>l&&!l.startsWith('#')&&fs.existsSync(l));
}));

ipcMain.on('window-control',(_,a)=>{
  if(!mainWindow) return;
  if(a==='minimize') mainWindow.minimize();
  else if(a==='maximize') mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize();
  else if(a==='close'){ isQuitting=true; app.quit(); }
});

ipcMain.on('notify-track',(_,track)=>{
  updateTrayMenu(track);
  try { new Notification({title:'Vibe',body:`${track.artist} — ${track.title}`,silent:true}).show(); } catch(_){}
});

ipcMain.handle('get-audio-devices',async()=>[{id:'default',label:'Default Output Device'}]);
ipcMain.on('open-external',(_,url)=>shell.openExternal(url));

ipcMain.handle('delete-file',async(_,p)=>{
  try { await shell.trashItem(p); log('INF','Trashed',p); return {ok:true}; }
  catch(e) { try { fs.unlinkSync(p); return {ok:true}; } catch(e2){ return {ok:false,error:e2.message}; } }
});

ipcMain.handle('log',(_,lvl,...a)=>log(lvl,'[R]',...a));
