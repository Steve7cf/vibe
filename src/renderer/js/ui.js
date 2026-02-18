/**
 * Vibe - UI Controller
 */
import { formatTime, artworkOrPlaceholder, escapeHtml as esc } from "./utils.js";

export class UIController {
  constructor(state, library, playlists, queue, player, toast, contextMenu) {
    this.state = state; this.library = library; this.playlists = playlists;
    this.queue = queue; this.player = player; this.toast = toast; this.contextMenu = contextMenu;
    this.bindNavigation(); this.bindSearch(); this.bindWindowListeners();
    window.addEventListener("library:updated", () => this.refreshCurrentView());
    window.addEventListener("playlists:updated", () => { this.renderSidebarPlaylists(); if (this.state.get("activeView") === "playlists") this.renderPlaylists(); });
    window.addEventListener("player:play", (e) => { player.playTrack(e.detail.track); });
    this.state.on("activeView", (view) => this.switchView(view));
    this.state.on("currentTrack", () => { if (this.state.get("activeView") === "queue") this.renderQueueView(); });
    this.state.on("isPlaying", () => this.refreshNowPlayingIndicators());
  }

  render() { this.renderSidebarPlaylists(); this.switchView(this.state.get("activeView") || "home"); }

  bindNavigation() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.state.set("activeView", btn.dataset.view);
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  switchView(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + view)?.classList.add("active");
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    const m = { home: () => this.renderHomeView(), library: () => this.renderLibraryView(), playlists: () => this.renderPlaylists(), albums: () => this.renderAlbumsView(), artists: () => this.renderArtistsView(), queue: () => this.renderQueueView(), settings: () => this.renderSettingsView() };
    m[view]?.();
  }

  refreshCurrentView() { this.switchView(this.state.get("activeView") || "home"); }

  bindSearch() {
    const input = document.getElementById("search-input");
    const clearBtn = document.getElementById("search-clear");
    let timer;
    input?.addEventListener("input", () => {
      this.state.set("searchQuery", input.value);
      clearBtn?.classList.toggle("hidden", !input.value);
      clearTimeout(timer); timer = setTimeout(() => this.refreshCurrentView(), 250);
    });
    clearBtn?.addEventListener("click", () => { input.value = ""; this.state.set("searchQuery", ""); clearBtn.classList.add("hidden"); this.refreshCurrentView(); });
  }

  renderHomeView() {
    const recent = this.state.get("recentlyPlayed");
    const container = document.getElementById("recent-tracks-list");
    if (!container) return;
    if (!recent.length) { container.innerHTML = "<div class="empty-state"><p>No recent tracks. Add music to get started!</p></div>"; return; }
    container.innerHTML = "";
    recent.slice(0, 20).forEach((track, i) => container.appendChild(this.createTrackRow(track, i, recent)));
  }

  renderLibraryView() {
    const sortField = this.state.get("activeSortField") || "title";
    const sortDir = this.state.get("activeSortDir") || "asc";
    const query = this.state.get("searchQuery");
    const container = document.getElementById("library-list");
    if (!container) return;
    const tracks = query ? this.library.search(query) : this.library.getSorted(sortField, sortDir);
    if (!tracks.length) { container.innerHTML = "<div class="empty-state"><p>" + (query ? "No results" : "No music yet. Add files!") + "</p></div>"; return; }
    container.innerHTML = "";
    const header = document.createElement("div");
    header.className = "track-list-header";
    header.innerHTML = "<span>#</span><span>Title / Artist</span><span>Album</span><span>Genre</span><span>Duration</span><span></span>";
    container.appendChild(header);
    tracks.forEach((track, i) => container.appendChild(this.createTrackRow(track, i, tracks)));
    this.bindSortButtons();
  }

  bindSortButtons() {
    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.onclick = () => {
        const field = btn.dataset.sort, cur = this.state.get("activeSortField"), dir = this.state.get("activeSortDir");
        this.state.set("activeSortField", field);
        this.state.set("activeSortDir", field === cur && dir === "asc" ? "desc" : "asc");
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.renderLibraryView();
      };
    });
  }

  renderAlbumsView() {
    const active = this.state.get("activeAlbum");
    if (active) { this.renderAlbumDetail(active); return; }
    const grid = document.getElementById("albums-grid"), detail = document.getElementById("album-detail");
    if (!grid) return;
    grid.classList.remove("hidden"); detail?.classList.add("hidden"); grid.className = "grid-view";
    const query = this.state.get("searchQuery");
    let albums = this.library.getByAlbum();
    if (query) albums = albums.filter(a => a.album.toLowerCase().includes(query.toLowerCase()) || a.artist.toLowerCase().includes(query.toLowerCase()));
    grid.innerHTML = "";
    albums.forEach(album => grid.appendChild(this.createGridCard({
      name: album.album, sub: album.artist, artwork: album.artwork,
      onClick: () => { this.state.set("activeAlbum", album); this.renderAlbumDetail(album); },
      onPlay: () => { this.queue.setQueue(album.tracks, 0); window.dispatchEvent(new CustomEvent("player:play", { detail: { track: album.tracks[0] } })); }
    })));
  }

  renderAlbumDetail(album) {
    const grid = document.getElementById("albums-grid"), detail = document.getElementById("album-detail");
    grid?.classList.add("hidden"); detail?.classList.remove("hidden");
    document.getElementById("album-detail-name").textContent = album.album;
    document.getElementById("album-detail-artist").textContent = album.artist;
    const dur = album.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    document.getElementById("album-detail-meta").textContent = album.tracks.length + " songs · " + formatTime(dur);
    document.getElementById("album-detail-artwork").innerHTML = artworkOrPlaceholder(album.artwork, 60);
    this.ensureBackBtn(detail, "← Albums", () => { this.state.set("activeAlbum", null); detail.classList.add("hidden"); grid?.classList.remove("hidden"); });
    document.getElementById("btn-play-album").onclick = () => { this.queue.setQueue(album.tracks, 0); window.dispatchEvent(new CustomEvent("player:play", { detail: { track: album.tracks[0] } })); };
    document.getElementById("btn-shuffle-album").onclick = () => { const sh = [...album.tracks].sort(() => Math.random() - 0.5); this.queue.setQueue(sh, 0); window.dispatchEvent(new CustomEvent("player:play", { detail: { track: sh[0] } })); };
    const el = document.getElementById("album-tracks"); el.innerHTML = "";
    album.tracks.forEach((t, i) => el.appendChild(this.createTrackRow(t, i, album.tracks)));
  }

  renderArtistsView() {
    const active = this.state.get("activeArtist");
    if (active) { this.renderArtistDetail(active); return; }
    const grid = document.getElementById("artists-grid"), detail = document.getElementById("artist-detail");
    grid?.classList.remove("hidden"); detail?.classList.add("hidden");
    if (!grid) return; grid.className = "grid-view"; grid.innerHTML = "";
    const query = this.state.get("searchQuery");
    let entries = [...this.library.getByArtist().entries()];
    if (query) entries = entries.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()));
    entries.forEach(([name, tracks]) => {
      const artwork = tracks.find(t => t.artwork)?.artwork;
      grid.appendChild(this.createGridCard({ name, sub: tracks.length + " songs", artwork, circular: true,
        onClick: () => { this.state.set("activeArtist", { name, tracks }); this.renderArtistDetail({ name, tracks }); },
        onPlay: () => { this.queue.setQueue(tracks, 0); window.dispatchEvent(new CustomEvent("player:play", { detail: { track: tracks[0] } })); }
      }));
    });
  }

  renderArtistDetail(artist) {
    const grid = document.getElementById("artists-grid"), detail = document.getElementById("artist-detail");
    grid?.classList.add("hidden"); detail?.classList.remove("hidden");
    const avatarEl = document.getElementById("artist-detail-avatar");
    const art = artist.tracks.find(t => t.artwork)?.artwork;
    if (art) avatarEl.innerHTML = "<img src="" + art + "" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>";
    else avatarEl.textContent = (artist.name || "?")[0].toUpperCase();
    document.getElementById("artist-detail-name").textContent = artist.name;
    document.getElementById("artist-detail-meta").textContent = artist.tracks.length + " songs";
    const albumMap = new Map();
    for (const t of artist.tracks) { if (!albumMap.has(t.album)) albumMap.set(t.album, { name: t.album, artwork: t.artwork, tracks: [] }); albumMap.get(t.album).tracks.push(t); }
    const albumsGrid = document.getElementById("artist-albums-grid"); albumsGrid.innerHTML = "";
    [...albumMap.values()].forEach(album => albumsGrid.appendChild(this.createGridCard({ name: album.name, sub: album.tracks.length + " tracks", artwork: album.artwork, onPlay: () => { this.queue.setQueue(album.tracks, 0); window.dispatchEvent(new CustomEvent("player:play", { detail: { track: album.tracks[0] } })); } })));
    const tracksEl = document.getElementById("artist-tracks"); tracksEl.innerHTML = "";
    artist.tracks.forEach((t, i) => tracksEl.appendChild(this.createTrackRow(t, i, artist.tracks)));
    this.ensureBackBtn(detail, "← Artists", () => { this.state.set("activeArtist", null); detail.classList.add("hidden"); grid?.classList.remove("hidden"); });
  }

  renderPlaylists() {
    this.renderSidebarPlaylists();
    const playlists = this.state.get("playlists");
    const grid = document.getElementById("playlists-grid"), detail = document.getElementById("playlist-detail");
    const activeId = this.state.get("activePlaylistId");
    if (activeId) { const pl = this.playlists.getById(activeId); if (pl) { this.renderPlaylistDetail(pl); return; } }
    detail?.classList.add("hidden");
    if (!grid) return; grid.classList.remove("hidden"); grid.innerHTML = "";
    if (!playlists.length) { grid.innerHTML = "<div class="empty-state"><p>No playlists yet. Create one!</p></div>"; return; }
    playlists.forEach(pl => {
      const art = pl.tracks.find(t => t.artwork)?.artwork;
      grid.appendChild(this.createGridCard({ name: pl.name, sub: pl.tracks.length + " songs", artwork: art,
        onClick: () => { this.state.set("activePlaylistId", pl.id); this.renderPlaylistDetail(pl); },
        onPlay: () => { if (!pl.tracks.length) return; this.queue.setQueue(pl.tracks, 0); window.dispatchEvent(new CustomEvent("player:play", { detail: { track: pl.tracks[0] } })); }
      }));
    });
  }

  renderPlaylistDetail(pl) {
    const grid = document.getElementById("playlists-grid"), detail = document.getElementById("playlist-detail");
    grid?.classList.add("hidden"); detail?.classList.remove("hidden");
    document.getElementById("playlist-detail-name").textContent = pl.name;
    const dur = pl.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    document.getElementById("playlist-detail-meta").textContent = pl.tracks.length + " songs · " + formatTime(dur);
    const art = pl.tracks.find(t => t.artwork)?.artwork;
    document.getElementById("playlist-detail-artwork").innerHTML = artworkOrPlaceholder(art, 60);
    this.ensureBackBtn(detail, "← Playlists", () => { this.state.set("activePlaylistId", null); detail.classList.add("hidden"); grid?.classList.remove("hidden"); });
    const tracksEl = document.getElementById("playlist-tracks"); tracksEl.innerHTML = "";
    pl.tracks.forEach((t, i) => tracksEl.appendChild(this.createTrackRow(t, i, pl.tracks)));
  }

  renderSidebarPlaylists() {
    const container = document.getElementById("sidebar-playlist-list");
    if (!container) return; container.innerHTML = "";
    this.state.get("playlists").slice(0, 15).forEach(pl => {
      const item = document.createElement("div"); item.className = "sidebar-playlist-item";
      item.innerHTML = "<svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" fill="currentColor"/></svg>" + esc(pl.name);
      item.addEventListener("click", () => { this.state.set("activeView", "playlists"); this.state.set("activePlaylistId", pl.id); this.switchView("playlists"); });
      container.appendChild(item);
    });
  }

  renderQueueView() {
    const queue = this.state.get("queue"), currentIdx = this.state.get("currentIndex"), currentTrack = this.state.get("currentTrack");
    const currentEl = document.getElementById("queue-current-track");
    if (currentEl) { currentEl.innerHTML = ""; if (currentTrack) currentEl.appendChild(this.createTrackRow(currentTrack, 0, [currentTrack])); }
    const queueEl = document.getElementById("queue-list");
    if (!queueEl) return; queueEl.innerHTML = "";
    const upcoming = queue.slice(currentIdx + 1);
    if (!upcoming.length) { queueEl.innerHTML = "<div class="empty-state"><p>Queue is empty</p></div>"; return; }
    upcoming.forEach((track, i) => queueEl.appendChild(this.createTrackRow(track, i, upcoming)));
    const clearBtn = document.getElementById("btn-clear-queue");
    if (clearBtn) clearBtn.onclick = () => { this.queue.clearQueue(); this.renderQueueView(); };
  }

  renderSettingsView() { window.dispatchEvent(new CustomEvent("settings:render")); }

  createTrackRow(track, index, trackList) {
    const currentTrack = this.state.get("currentTrack"), isPlaying = this.state.get("isPlaying");
    const isCurrent = currentTrack?.path === track.path;
    const row = document.createElement("div");
    row.className = "track-row" + (isCurrent ? " active playing" : "");
    row.dataset.trackPath = track.path; row.dataset.index = index;
    row.style.animationDelay = Math.min(index * 15, 300) + "ms";
    const numContent = isCurrent && isPlaying ? "<div class="now-playing-indicator"><div class="now-playing-bar"></div><div class="now-playing-bar"></div><div class="now-playing-bar"></div></div>" : "<span>" + (index + 1) + "</span>";
    row.innerHTML = "<div class="track-num">" + numContent + "</div>"
      + "<div class="track-info"><div class="track-title">" + esc(track.title) + "</div><div class="track-artist">" + esc(track.artist) + "</div></div>"
      + "<div class="track-album">" + esc(track.album) + "</div>"
      + "<div class="track-genre">" + esc(track.genre || "") + "</div>"
      + "<div class="track-duration">" + formatTime(track.duration) + "</div>"
      + "<div class="track-actions"><button class="icon-btn btn-more"><svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/></svg></button></div>";
    row.addEventListener("dblclick", () => { this.queue.setPlayTrack(track, trackList); window.dispatchEvent(new CustomEvent("player:play", { detail: { track } })); });
    row.addEventListener("contextmenu", (e) => { e.preventDefault(); this.contextMenu.show(e, track, trackList); });
    row.querySelector(".btn-more").addEventListener("click", (e) => { e.stopPropagation(); this.contextMenu.show(e, track, trackList); });
    return row;
  }

  refreshNowPlayingIndicators() {
    const current = this.state.get("currentTrack"), isPlaying = this.state.get("isPlaying");
    document.querySelectorAll(".track-row").forEach(row => {
      const isCurrent = current && row.dataset.trackPath === current.path;
      row.classList.toggle("active", isCurrent); row.classList.toggle("playing", isCurrent);
      const numEl = row.querySelector(".track-num");
      if (!numEl) return;
      if (isCurrent && isPlaying) numEl.innerHTML = "<div class="now-playing-indicator"><div class="now-playing-bar"></div><div class="now-playing-bar"></div><div class="now-playing-bar"></div></div>";
      else numEl.innerHTML = "<span>" + (parseInt(row.dataset.index || "0") + 1) + "</span>";
    });
  }

  createGridCard({ name, sub, artwork, onClick, onPlay, circular }) {
    const card = document.createElement("div"); card.className = "grid-card";
    const br = circular ? "border-radius:50%;" : "";
    card.innerHTML = "<div class="grid-card-art" style="" + br + "">" + artworkOrPlaceholder(artwork, 40) + "<button class="grid-card-play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button></div><div class="grid-card-info"><div class="grid-card-name">" + esc(name) + "</div><div class="grid-card-sub">" + esc(sub) + "</div></div>";
    if (onClick) card.addEventListener("click", onClick);
    card.querySelector(".grid-card-play-btn").addEventListener("click", (e) => { e.stopPropagation(); onPlay?.(); });
    return card;
  }

  ensureBackBtn(parent, label, onClick) {
    let btn = parent.querySelector(".back-btn");
    if (!btn) { btn = document.createElement("button"); btn.className = "action-btn secondary back-btn"; btn.style.marginBottom = "16px"; parent.insertAdjacentElement("afterbegin", btn); }
    btn.textContent = label; btn.onclick = onClick;
  }

  bindWindowListeners() {
    document.getElementById("btn-lyrics")?.addEventListener("click", () => document.getElementById("lyrics-panel")?.classList.toggle("hidden"));
    document.getElementById("btn-close-lyrics")?.addEventListener("click", () => document.getElementById("lyrics-panel")?.classList.add("hidden"));
    document.getElementById("btn-hero-reveal")?.addEventListener("click", () => { const t = this.state.get("currentTrack"); if (t) window.vibeAPI.invoke("system:revealFile", t.path); });
    document.getElementById("btn-hero-add-queue")?.addEventListener("click", () => { const t = this.state.get("currentTrack"); if (t) { this.queue.addToQueue([t]); this.toast.show("Added to queue"); } });
    document.querySelectorAll(".sleep-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const mins = parseInt(btn.dataset.minutes);
        window.dispatchEvent(new CustomEvent("player:setSleepTimer", { detail: { minutes: mins } }));
        document.getElementById("sleep-timer-modal")?.classList.add("hidden");
        this.toast.show("Sleep timer set for " + mins + " minutes", "success");
      });
    });
    document.getElementById("btn-cancel-sleep")?.addEventListener("click", () => { window.dispatchEvent(new CustomEvent("player:setSleepTimer", { detail: { minutes: 0 } })); this.toast.show("Sleep timer cancelled"); });
    document.querySelectorAll("#sleep-timer-modal .modal-close, #sleep-timer-modal .modal-backdrop").forEach(el => { el.addEventListener("click", () => document.getElementById("sleep-timer-modal")?.classList.add("hidden")); });
  }
}
