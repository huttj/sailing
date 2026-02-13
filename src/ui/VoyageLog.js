/**
 * VoyageLog — localStorage-backed tracking of visited nodes, stars, and comments.
 * Also renders the voyage panel UI (slide-out log with tabs and export).
 */

const STORAGE_KEY = 'voyage';

export class VoyageLog {
  constructor() {
    this._data = { visited: {}, starred: {}, comments: {} };
    this._load();
    this._navigateCallback = null;
    this._panel = null;
    this._activeTab = 'all';
    this._allIdeas = [];
  }

  // ── Data Methods ────────────────────────────────────────────────────

  recordVisit(idea) {
    const id = idea.id;
    const now = Date.now();
    if (this._data.visited[id]) {
      this._data.visited[id].lastVisited = now;
      this._data.visited[id].count++;
    } else {
      this._data.visited[id] = { firstVisited: now, lastVisited: now, count: 1 };
    }
    this._save();
    this._refreshPanel();
  }

  toggleStar(ideaId) {
    if (this._data.starred[ideaId]) {
      delete this._data.starred[ideaId];
    } else {
      this._data.starred[ideaId] = Date.now();
    }
    this._save();
    this._refreshPanel();
    return this.isStarred(ideaId);
  }

  isStarred(ideaId) {
    return !!this._data.starred[ideaId];
  }

  addComment(ideaId, text) {
    if (!text || !text.trim()) return;
    if (!this._data.comments[ideaId]) {
      this._data.comments[ideaId] = [];
    }
    this._data.comments[ideaId].push({ text: text.trim(), timestamp: Date.now() });
    this._save();
    this._refreshPanel();
  }

  getComments(ideaId) {
    return this._data.comments[ideaId] || [];
  }

  getVisited(ideaId) {
    return this._data.visited[ideaId] || null;
  }

  clearAll() {
    if (!confirm('Clear your entire voyage history? This cannot be undone.')) return;
    this._data = { visited: {}, starred: {}, comments: {} };
    this._save();
    this._refreshPanel();
  }

  getAllEntries() {
    const entries = [];
    for (const [id, visit] of Object.entries(this._data.visited)) {
      entries.push({
        id,
        visited: visit,
        starred: !!this._data.starred[id],
        comments: this._data.comments[id] || [],
      });
    }
    // Sort by most recently visited
    entries.sort((a, b) => b.visited.lastVisited - a.visited.lastVisited);
    return entries;
  }

  exportConstellation(allIdeas) {
    const ideaMap = new Map(allIdeas.map(i => [i.id, i]));
    const entries = this.getAllEntries();
    const starredEntries = entries.filter(e => e.starred);
    const commentedEntries = entries.filter(e => e.comments.length > 0);

    const lines = [];
    lines.push('# Voyage Constellation');
    lines.push('');
    lines.push(`Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push('');

    // Stats
    lines.push(`**${entries.length}** places visited | **${starredEntries.length}** starred | **${commentedEntries.length}** with notes`);
    lines.push('');

    // Starred
    if (starredEntries.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Starred');
      lines.push('');
      for (const e of starredEntries) {
        const idea = ideaMap.get(e.id);
        if (!idea) continue;
        lines.push(`- **${idea.label}** _(${idea.kind})_`);
        if (idea.synthesis) lines.push(`  > ${idea.synthesis}`);
        for (const c of e.comments) {
          lines.push(`  - _Note:_ ${c.text}`);
        }
        lines.push('');
      }
    }

    // Commented (non-starred)
    const commentedOnly = commentedEntries.filter(e => !e.starred);
    if (commentedOnly.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Notes');
      lines.push('');
      for (const e of commentedOnly) {
        const idea = ideaMap.get(e.id);
        if (!idea) continue;
        lines.push(`- **${idea.label}** _(${idea.kind})_`);
        for (const c of e.comments) {
          lines.push(`  - ${c.text}`);
        }
        lines.push('');
      }
    }

    // Full voyage path
    lines.push('---');
    lines.push('');
    lines.push('## Voyage Path');
    lines.push('');
    // Chronological order by first visit
    const chronological = [...entries].sort((a, b) => a.visited.firstVisited - b.visited.firstVisited);
    for (let i = 0; i < chronological.length; i++) {
      const e = chronological[i];
      const idea = ideaMap.get(e.id);
      if (!idea) continue;
      const star = e.starred ? ' \u2605' : '';
      const comments = e.comments.length > 0 ? ` (${e.comments.length} note${e.comments.length > 1 ? 's' : ''})` : '';
      lines.push(`${i + 1}. ${idea.label}${star}${comments}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  // ── Persistence ─────────────────────────────────────────────────────

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._data.visited = parsed.visited || {};
        this._data.starred = parsed.starred || {};
        this._data.comments = parsed.comments || {};
      }
    } catch (_) {
      // Start fresh if corrupt
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (_) {
      // localStorage might be full
    }
  }

  // ── Panel UI ────────────────────────────────────────────────────────

  setIdeas(allIdeas) {
    this._allIdeas = allIdeas;
  }

  onNavigate(callback) {
    this._navigateCallback = callback;
  }

  initPanel() {
    this._panel = document.getElementById('voyage-panel');
    const toggleBtn = document.getElementById('voyage-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.togglePanel());
    }
    this._updateToggleText();
  }

  togglePanel() {
    if (!this._panel) return;
    const isOpen = this._panel.classList.contains('voyage-panel-open');
    if (isOpen) {
      this._closePanel();
    } else {
      this._panel.classList.add('voyage-panel-open');
      this._setShifted(true);
      this._renderPanel();
    }
  }

  closePanel() {
    this._closePanel();
  }

  _closePanel() {
    if (this._panel) {
      this._panel.classList.remove('voyage-panel-open');
    }
    this._setShifted(false);
  }

  _setShifted(shifted) {
    const minimap = document.getElementById('minimap');
    const toggle = document.getElementById('voyage-toggle');
    if (minimap) minimap.classList.toggle('minimap-shifted', shifted);
    if (toggle) toggle.classList.toggle('voyage-toggle-shifted', shifted);
  }

  _refreshPanel() {
    this._updateToggleText();
    if (this._panel && this._panel.classList.contains('voyage-panel-open')) {
      this._renderPanel();
    }
  }

  _updateToggleText() {
    const toggleBtn = document.getElementById('voyage-toggle');
    if (!toggleBtn) return;
    const visited = Object.keys(this._data.visited).length;
    const total = this._allIdeas.length;
    toggleBtn.textContent = total > 0 ? `Voyage Log (${visited}/${total})` : 'Voyage Log';
  }

  _renderPanel() {
    if (!this._panel) return;
    const ideaMap = new Map(this._allIdeas.map(i => [i.id, i]));
    const allEntries = this.getAllEntries();

    let filtered;
    if (this._activeTab === 'starred') {
      filtered = allEntries.filter(e => e.starred);
    } else if (this._activeTab === 'commented') {
      filtered = allEntries.filter(e => e.comments.length > 0);
    } else {
      filtered = allEntries;
    }

    const tabClass = (t) => `voyage-tab${this._activeTab === t ? ' voyage-tab-active' : ''}`;

    let html = `
      <div class="voyage-panel-header">
        <span class="voyage-panel-title">Voyage Log</span>
        <button class="voyage-panel-close">&times;</button>
      </div>
      <div class="voyage-tabs">
        <button class="${tabClass('all')}" data-tab="all">All (${allEntries.length}/${this._allIdeas.length})</button>
        <button class="${tabClass('starred')}" data-tab="starred">Starred (${allEntries.filter(e => e.starred).length})</button>
        <button class="${tabClass('commented')}" data-tab="commented">Notes (${allEntries.filter(e => e.comments.length > 0).length})</button>
      </div>
      <div class="voyage-entries">
    `;

    if (filtered.length === 0) {
      html += '<div class="voyage-empty">No entries yet. Dive into ideas to start your voyage!</div>';
    } else {
      for (const entry of filtered) {
        const idea = ideaMap.get(entry.id);
        if (!idea) continue;
        const star = entry.starred ? '\u2605' : '';
        const commentCount = entry.comments.length;
        const timeAgo = this._timeAgo(entry.visited.lastVisited);

        html += `<button class="voyage-entry" data-idea-id="${entry.id}">
          <div class="voyage-entry-top">
            <span class="voyage-entry-kind">${this._kindIcon(idea.kind)}</span>
            <span class="voyage-entry-label">${idea.label}</span>
            ${star ? `<span class="voyage-entry-star">${star}</span>` : ''}
          </div>
          <div class="voyage-entry-meta">
            <span>Visited ${entry.visited.count}x</span>
            ${commentCount > 0 ? `<span>${commentCount} note${commentCount > 1 ? 's' : ''}</span>` : ''}
            <span>${timeAgo}</span>
          </div>
        </button>`;
      }
    }

    html += '</div>';
    html += `<div class="voyage-footer">
      <div class="voyage-footer-row">
        <button class="voyage-export">Export Constellation</button>
        <button class="voyage-clear">Clear</button>
      </div>
    </div>`;

    this._panel.innerHTML = html;

    // Wire tabs
    for (const tab of this._panel.querySelectorAll('.voyage-tab')) {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        this._renderPanel();
      });
    }

    // Wire close
    const closeBtn = this._panel.querySelector('.voyage-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePanel());
    }

    // Wire entries
    for (const btn of this._panel.querySelectorAll('.voyage-entry')) {
      btn.addEventListener('click', () => {
        const idea = ideaMap.get(btn.dataset.ideaId);
        if (idea && this._navigateCallback) {
          this._navigateCallback(idea);
          this.closePanel();
        }
      });
    }

    // Wire export
    const exportBtn = this._panel.querySelector('.voyage-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this._downloadExport());
    }

    // Wire clear
    const clearBtn = this._panel.querySelector('.voyage-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
    }
  }

  _downloadExport() {
    const md = this.exportConstellation(this._allIdeas);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voyage-constellation.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  _kindIcon(kind) {
    const icons = { question: '?', tension: '\u2194', image: '\u2726', turn: '\u21A9' };
    return icons[kind] || '\u00B7';
  }

  _timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
