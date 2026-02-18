/**
 * Vibe — Context Menu
 * Right-click menu for tracks
 */

export class ContextMenu {
  constructor(state, audio, queue, library, playlists, toast) {
    this.state = state;
    this.audio = audio;
    this.queue = queue;
    this.library = library;
    this.playlists = playlists;
    this.toast = toast;

    this._menu = document.getElementById('context-menu');
    document.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
  }

  show(event, track, trackList) {
    event.preventDefault();
    const pl = this.state.get('playlists');

    const items = [
      { label: '▶ Play Now', icon: 'play', action: () => {
        this.queue.setPlayTrack(track, trackList);
        window.dispatchEvent(new CustomEvent('player:play', { detail: { track } }));
      }},
      { label: '⏭ Play Next', icon: 'next', action: () => {
        this.queue.addNext(track);
        this.toast.show('Added to play next');
      }},
      { label: '+ Add to Queue', action: () => {
        this.queue.addToQueue([track]);
        this.toast.show('Added to queue');
      }},
      { type: 'separator' },
      ...(pl.length ? [
        { label: 'Add to Playlist ›', submenu: pl.map(p => ({
          label: p.name,
          action: () => {
            this.playlists.addTracksToPlaylist(p.id, [track]);
            this.toast.show(`Added to "${p.name}"`, 'success');
          }
        }))}
      ] : []),
      { label: 'New Playlist from Track', action: () => {
        const name = `${track.artist} – ${track.title}`;
        const p = this.playlists.create(name);
        this.playlists.addTracksToPlaylist(p.id, [track]);
        this.toast.show(`Created playlist "${p.name}"`, 'success');
      }},
      { type: 'separator' },
      { label: '💾 Show in Folder', action: () => window.vibeAPI.invoke('system:revealFile', track.path) },
      { label: '🗑 Remove from Library', danger: true, action: () => {
        this.library.removeTrack(track.path);
        this.toast.show('Removed from library');
      }},
    ];

    this.render(items);
    this.position(event);
    this._menu.classList.remove('hidden');
  }

  render(items) {
    const list = document.getElementById('context-menu-list');
    if (!list) return;
    list.innerHTML = '';

    items.forEach(item => {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        list.appendChild(sep);
        return;
      }

      const el = document.createElement('div');
      el.className = `ctx-item${item.danger ? ' danger' : ''}`;
      el.textContent = item.label;

      if (item.submenu) {
        el.style.position = 'relative';
        el.textContent += '';
        const sub = document.createElement('div');
        sub.style.cssText = 'position:absolute;left:100%;top:0;background:var(--surface-2);border:1px solid var(--border-dim);border-radius:8px;min-width:160px;display:none;padding:6px 0;z-index:10000;box-shadow:var(--shadow-xl)';
        item.submenu.forEach(subItem => {
          const si = document.createElement('div');
          si.className = 'ctx-item';
          si.textContent = subItem.label;
          si.addEventListener('click', (e) => { e.stopPropagation(); subItem.action(); this.hide(); });
          sub.appendChild(si);
        });
        el.appendChild(sub);
        el.addEventListener('mouseenter', () => { sub.style.display = 'block'; });
        el.addEventListener('mouseleave', () => { sub.style.display = 'none'; });
      } else if (item.action) {
        el.addEventListener('click', (e) => { e.stopPropagation(); item.action(); this.hide(); });
      }

      list.appendChild(el);
    });
  }

  position(event) {
    const menu = this._menu;
    const { clientX: x, clientY: y } = event;
    const menuW = 200, menuH = 300;
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = (x + menuW > vw ? x - menuW : x) + 'px';
    menu.style.top = (y + menuH > vh ? y - menuH : y) + 'px';
  }

  hide() {
    this._menu?.classList.add('hidden');
  }
}
