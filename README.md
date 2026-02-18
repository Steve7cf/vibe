# 🎵 Vibe — Professional Desktop Music Player

A modern, feature-rich desktop music player built with Electron, inspired by Spotify's aesthetic.

---

## Prerequisites

- Node.js v18+ (https://nodejs.org)
- npm v8+
- Linux (tested on Ubuntu 22.04+)

---

## Quick Start

```bash
# 1. Navigate into the project
cd vibe

# 2. Install dependencies
npm install

# 3. Run in development mode
npm start

# Or with dev tools:
npm run dev
```

---

## Package for Distribution

```bash
# Build AppImage + .deb for Linux
npm run build

# Output is in /dist/
```

---

## Project Structure

```
vibe/
├── package.json
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process (IPC, tray, shortcuts)
│   │   └── preload.js       # Secure context bridge
│   └── renderer/
│       ├── index.html       # App shell
│       ├── css/
│       │   └── main.css     # All styles (dark theme, animations)
│       └── js/
│           ├── utils.js     # Helpers (formatTime, toast, modal)
│           ├── library.js   # Track/playlist management, metadata
│           ├── audio.js     # Web Audio API engine (EQ, effects)
│           ├── equalizer.js # EQ bands UI + presets
│           ├── visualizer.js# Canvas visualizer (bars/wave/circle)
│           ├── player.js    # Playback state (shuffle/repeat/queue)
│           ├── ui.js        # All view rendering & DOM events
│           └── app.js       # Bootstrap, config, global events
```

---

## Features

### Playback

- Play, Pause, Stop, Next, Previous
- Seek bar with time display
- Shuffle, Repeat (off / all / one)
- Volume control + mute
- Crossfade between tracks
- Fade in / fade out
- Playback speed control (0.5x – 2x)
- Balance (L/R panning)
- Replay gain toggle

### Audio Engine

- 10-band parametric equalizer
- EQ presets: Flat, Pop, Rock, Jazz, Classical, Electronic, Hip Hop, Bass Boost, Treble Boost, Vocal
- Bass boost filter
- Stereo panning (surround simulation)
- Web Audio API based processing chain

### Library

- Add files via dialog or drag-and-drop
- Scan entire folders recursively
- ID3/FLAC/OGG metadata reading (via music-metadata)
- Album artwork extraction and display
- Browse by: All Tracks, Artists, Albums, Genres
- Full-text search
- Recently played tracks

### Playlists & Queue

- Create, delete, rename playlists
- Export playlists to M3U
- Import M3U playlists
- Queue management (add, remove, reorder)
- Smart shuffle

### Interface

- Clean dark theme (Spotify-inspired, original design)
- Sidebar navigation
- Canvas visualizer (Bars / Wave / Circle)
- Responsive to window resize
- Context right-click menu
- Track info popup
- System tray integration
- Minimizes to tray (close button hides window)

### System Integration

- Global media hotkeys (MediaPlay, MediaNext, MediaPrev, MediaStop)
- System notifications on track change
- Last session restore (restores track + position on launch)
- Sleep timer (stops playback after N minutes)

### Keyboard Shortcuts

| Key    | Action         |
| ------ | -------------- |
| Space  | Play / Pause   |
| Ctrl+→ | Next Track     |
| Ctrl+← | Previous Track |
| →      | Seek +5s       |
| ←      | Seek -5s       |
| ↑      | Volume Up      |
| ↓      | Volume Down    |
| M      | Mute/Unmute    |
| Ctrl+S | Toggle Shuffle |
| Ctrl+R | Cycle Repeat   |

---

## Supported Formats

MP3, WAV, FLAC, OGG, M4A, AAC, WMA, OPUS

---

## Configuration

Config stored at: `~/.config/vibe/config.json`  
Library stored at: `~/.config/vibe/library.json`

---

## Future Improvements

1. **Gapless playback** — pre-buffer next track via dual AudioBufferSourceNode
2. **Lyrics** — integrate LRCLIB.net API for synced LRC lyrics
3. **Mini player window** — separate frameless BrowserWindow
4. **Pitch shifting** — use SoundTouchJS or a dedicated WASM processor
5. **Last.fm scrobbling** — track listening history
6. **MusicBrainz metadata lookup** — fetch missing artwork/metadata online
7. **Waveform display** — pre-render waveform from audio buffer
8. **Podcast support** — RSS feed parsing
9. **Theme editor** — full CSS variable theming UI
10. **Audio device selection** — Electron does not expose direct OS device routing without native modules; use `electron-audio-device` or OS-level routing

---

## Notes

- On first launch, the tray icon may show as a blank icon. Production builds should include a proper 32x32 PNG icon at `src/assets/icon.png`.
- The `music-metadata` package reads file metadata asynchronously and is the most reliable cross-format library for Node.js.
- For FLAC/OGG on some systems, ensure the system audio codecs support these formats (usually handled by Chromium's built-in decoder in Electron).

-open for contribution
check me out: stevebazaar99@gmail.com
