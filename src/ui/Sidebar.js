/**
 * Sidebar — hidden by default, slides in on dive.
 *
 * Two sections:
 *   Top: Node card (kind icon, label, synthesis, quote, connections)
 *   Bottom: Scrollable full article with highlighted quote
 *
 * Resizable via drag handle on left edge.
 */

const KIND_ICONS = {
  question: '?',
  tension: '\u2194',
  image: '\u2726',
  turn: '\u21A9',
};

const KIND_LABELS = {
  question: 'Question',
  tension: 'Tension',
  image: 'Image',
  turn: 'Turn',
};

// Per-icon vertical offset (px) to fix baseline alignment
const KIND_VALIGN = {
  question: 0,
  tension: -2,
  image: -1,
  turn: -2,
};

function iconSpan(kind, cls = 'chip-icon') {
  const icon = KIND_ICONS[kind] || '';
  const v = KIND_VALIGN[kind] || 0;
  return `<span class="${cls}" style="vertical-align:${v}px">${icon}</span>`;
}

export class Sidebar {
  constructor(element, voyageLog) {
    this.element = element;
    this._navigateCallback = null;
    this._highlightMinimapCallback = null;
    this._currentIdea = null;
    this._currentPost = null;
    this._allIdeas = [];
    this._voyageLog = voyageLog;
    this._moreExpanded = false;

    this.closeBtn = document.getElementById('sidebar-close');
    this.resizeHandle = document.getElementById('sidebar-resize-handle');
    this.titleEl = document.getElementById('sidebar-title');
    this.voyageActionsEl = document.getElementById('sidebar-voyage-actions');
    this.nodeCardEl = document.getElementById('sidebar-node-card');
    this.bodyEl = document.getElementById('sidebar-body');

    this._siblingIdeas = [];
    this._onClose = null;

    // Delegated click handler for highlighted marks
    if (this.bodyEl) {
      this.bodyEl.addEventListener('click', (e) => {
        const mark = e.target.closest('mark[data-idea-id]');
        if (mark) {
          const target = this._allIdeas.find(i => i.id === mark.dataset.ideaId);
          if (target && this._navigateCallback) this._navigateCallback(target);
        }
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        if (this._onClose) this._onClose();
      });
    }

    // Drag-to-resize from left edge
    if (this.resizeHandle) {
      let dragging = false;
      let startX = 0;
      let startWidth = 0;

      const onMouseDown = (e) => {
        dragging = true;
        startX = e.clientX;
        startWidth = this.element.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        if (!dragging) return;
        const delta = startX - e.clientX;
        const newWidth = Math.max(320, Math.min(window.innerWidth * 0.85, startWidth + delta));
        this.element.style.width = newWidth + 'px';
      };

      const onMouseUp = () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      this.resizeHandle.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  }

  /** Store full ideas array so we can resolve connections */
  setIdeas(allIdeas) {
    this._allIdeas = allIdeas;
  }

  /**
   * Show the sidebar with node card + full article.
   */
  show(idea, post, siblingIdeas) {
    this._currentIdea = idea;
    this._currentPost = post;

    // Track visit
    if (this._voyageLog) this._voyageLog.recordVisit(idea);

    // Title
    if (this.titleEl) {
      this.titleEl.textContent = post ? post.title : '';
    }

    // Node card
    this._renderNodeCard(idea, siblingIdeas);

    // Article body
    this._siblingIdeas = siblingIdeas || [];
    if (this.bodyEl && post) {
      this.bodyEl.innerHTML = post.html || '';
      this.bodyEl.scrollTop = 0;
      requestAnimationFrame(() => {
        this._highlightAllQuotes(this._siblingIdeas, idea.id, 'instant');
      });
    }

    this.element.classList.remove('sidebar-hidden');
  }

  /**
   * Update when switching to a new idea (same or different article).
   */
  updateHighlight(idea) {
    this._currentIdea = idea;

    // Track visit on proximity switch
    if (this._voyageLog) this._voyageLog.recordVisit(idea);

    // Update node card
    const post = this._currentPost;
    const siblings = this._allIdeas.filter(i => i.post_id === idea.post_id);
    this._renderNodeCard(idea, siblings);

    // Toggle highlight classes on existing marks
    if (this.bodyEl) {
      const marks = this.bodyEl.querySelectorAll('mark[data-idea-id]');
      let scrollTarget = null;
      for (const mark of marks) {
        if (mark.dataset.ideaId === idea.id) {
          mark.className = 'current-quote';
          if (!scrollTarget) scrollTarget = mark;
        } else {
          mark.className = 'sibling-quote';
        }
      }
      if (scrollTarget) {
        setTimeout(() => scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
      }
    }
  }

  hide() {
    this.element.classList.add('sidebar-hidden');
    if (this.voyageActionsEl) this.voyageActionsEl.innerHTML = '';
    this._currentIdea = null;
    this._currentPost = null;
  }

  get isVisible() {
    return !this.element.classList.contains('sidebar-hidden');
  }

  onNavigate(callback) {
    this._navigateCallback = callback;
  }

  onHighlightMinimap(callback) {
    this._highlightMinimapCallback = callback;
  }

  onCloseRequest(callback) {
    this._onClose = callback;
  }

  // ── Node Card ────────────────────────────────────────────────────────

  _renderNodeCard(idea, siblingIdeas) {
    if (!this.nodeCardEl) return;

    const kindLabel = KIND_LABELS[idea.kind] || '';

    // Build connections HTML
    let connectionsHtml = '';
    if (idea.connections) {
      const links = [];
      if (idea.connections.nearby) {
        const nearby = this._allIdeas.find(i => i.id === idea.connections.nearby);
        if (nearby) {
          links.push({ idea: nearby, type: 'nearby' });
        }
      }
      if (idea.connections.far) {
        const far = this._allIdeas.find(i => i.id === idea.connections.far);
        if (far) {
          links.push({ idea: far, type: 'far' });
        }
      }

      if (links.length > 0) {
        connectionsHtml = '<div class="node-connections">';
        for (const link of links) {
          const typeLabel = link.type === 'nearby' ? 'Nearby' : 'Across the map';
          connectionsHtml += `<button class="node-connection" data-idea-id="${link.idea.id}">
            <span class="connection-type">${typeLabel}</span>
            <span class="connection-label">${iconSpan(link.idea.kind)}${link.idea.label}</span>
          </button>`;
        }
        connectionsHtml += '</div>';
      }
    }

    // Build sibling chips
    let chipsHtml = '';
    if (siblingIdeas && siblingIdeas.length > 1) {
      chipsHtml = '<div class="node-siblings"><div class="node-siblings-label">From this article</div>';
      for (const sib of siblingIdeas) {
        const active = sib.id === idea.id ? ' idea-chip-active' : '';
        chipsHtml += `<button class="idea-chip${active}" data-idea-id="${sib.id}">${iconSpan(sib.kind)}${sib.label}</button>`;
      }
      chipsHtml += '</div>';
    }

    // Voyage: star + visit in header, comments in card
    let voyageCommentsHtml = '';
    if (this._voyageLog) {
      const starred = this._voyageLog.isStarred(idea.id);
      const visit = this._voyageLog.getVisited(idea.id);
      const comments = this._voyageLog.getComments(idea.id);

      const starIcon = starred ? '\u2605' : '\u2606';
      const starClass = starred ? ' voyage-star-active' : '';
      const visitBadge = visit && visit.count > 1
        ? `<span class="voyage-visited-badge">Visited ${visit.count}x</span>`
        : '';

      // Render star + visit into the header
      if (this.voyageActionsEl) {
        this.voyageActionsEl.innerHTML = `
          ${visitBadge}
          <button class="voyage-star-btn${starClass}" data-idea-id="${idea.id}">${starIcon}</button>
        `;
        const starBtn = this.voyageActionsEl.querySelector('.voyage-star-btn');
        if (starBtn) {
          starBtn.addEventListener('click', () => {
            const nowStarred = this._voyageLog.toggleStar(idea.id);
            starBtn.textContent = nowStarred ? '\u2605' : '\u2606';
            starBtn.classList.toggle('voyage-star-active', nowStarred);
          });
        }
      }

      let commentsList = '';
      if (comments.length > 0) {
        commentsList = '<div class="voyage-comments-list">';
        for (const c of comments) {
          commentsList += `<div class="voyage-comment">${this._escapeHtml(c.text)}</div>`;
        }
        commentsList += '</div>';
      }

      voyageCommentsHtml = commentsList;
    }

    // Note scratch pad
    const currentNote = this._voyageLog ? this._voyageLog.getNote(idea.id) : '';
    const noteHtml = `
      <div class="node-note">
        <div class="node-note-label">Note</div>
        <textarea class="node-note-textarea" placeholder="Write a note...">${this._escapeHtml(currentNote)}</textarea>
      </div>
    `;

    const hasNote = this._voyageLog && this._voyageLog.hasNote(idea.id);
    const noteIndicator = hasNote ? ' <span class="node-more-note-indicator">(note)</span>' : '';
    const hiddenClass = this._moreExpanded ? '' : ' node-more-hidden';
    const openClass = this._moreExpanded ? ' node-more-toggle-open' : '';
    const moreSection = `
      <button class="node-more-toggle${openClass}">Connections &amp; related${noteIndicator}</button>
      <div class="node-more-content${hiddenClass}">
        ${noteHtml}
        ${connectionsHtml}
        ${chipsHtml}
      </div>
    `;

    this.nodeCardEl.innerHTML = `
      <div class="node-kind">${iconSpan(idea.kind, 'kind-icon')} ${kindLabel}</div>
      <div class="node-label">${idea.label}</div>
      <div class="node-synthesis">${idea.synthesis || ''}</div>
      ${voyageCommentsHtml}
      ${moreSection}
    `;

    // Wire up "show more" toggle
    const moreToggle = this.nodeCardEl.querySelector('.node-more-toggle');
    const moreContent = this.nodeCardEl.querySelector('.node-more-content');
    if (moreToggle && moreContent) {
      moreToggle.addEventListener('click', () => {
        const hidden = moreContent.classList.toggle('node-more-hidden');
        moreToggle.classList.toggle('node-more-toggle-open', !hidden);
        this._moreExpanded = !hidden;
      });
    }

    // Wire up connection clicks
    for (const btn of this.nodeCardEl.querySelectorAll('.node-connection')) {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.ideaId;
        const target = this._allIdeas.find(i => i.id === targetId);
        if (target && this._navigateCallback) {
          this._navigateCallback(target);
        }
      });
      btn.addEventListener('mouseenter', () => {
        const targetId = btn.dataset.ideaId;
        const target = this._allIdeas.find(i => i.id === targetId);
        if (target && this._highlightMinimapCallback) {
          this._highlightMinimapCallback(target);
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (this._highlightMinimapCallback) this._highlightMinimapCallback(null);
      });
    }

    // Wire up sibling chip clicks
    for (const chip of this.nodeCardEl.querySelectorAll('.idea-chip')) {
      chip.addEventListener('click', () => {
        const targetId = chip.dataset.ideaId;
        const target = this._allIdeas.find(i => i.id === targetId);
        if (target && this._navigateCallback) {
          this._navigateCallback(target);
        }
      });
      chip.addEventListener('mouseenter', () => {
        const targetId = chip.dataset.ideaId;
        const target = this._allIdeas.find(i => i.id === targetId);
        if (target && this._highlightMinimapCallback) {
          this._highlightMinimapCallback(target);
        }
      });
      chip.addEventListener('mouseleave', () => {
        if (this._highlightMinimapCallback) this._highlightMinimapCallback(null);
      });
    }

    // Wire note textarea auto-save
    const noteTextarea = this.nodeCardEl.querySelector('.node-note-textarea');
    if (noteTextarea && this._voyageLog) {
      let saveTimeout = null;
      noteTextarea.addEventListener('input', () => {
        // Auto-expand
        noteTextarea.style.height = 'auto';
        noteTextarea.style.height = noteTextarea.scrollHeight + 'px';
        // Debounced save
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this._voyageLog.setNote(idea.id, noteTextarea.value);
        }, 400);
      });
      noteTextarea.addEventListener('keydown', (e) => e.stopPropagation());
      noteTextarea.addEventListener('keyup', (e) => e.stopPropagation());
      // Set initial height
      requestAnimationFrame(() => {
        noteTextarea.style.height = 'auto';
        noteTextarea.style.height = noteTextarea.scrollHeight + 'px';
      });
    }

    // Wire voyage comment add
    const commentAdd = this.nodeCardEl.querySelector('.voyage-comment-add');
    const commentArea = this.nodeCardEl.querySelector('.voyage-comment-textarea');
    if (commentAdd && commentArea && this._voyageLog) {
      const submitComment = () => {
        const text = commentArea.value;
        if (text && text.trim()) {
          this._voyageLog.addComment(idea.id, text);
          commentArea.value = '';
          // Re-render to show new comment
          this._renderNodeCard(idea, siblingIdeas);
        }
      };
      commentAdd.addEventListener('click', submitComment);
      // Capture keys so they don't control the ship
      commentArea.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitComment();
        }
      });
      commentArea.addEventListener('keyup', (e) => e.stopPropagation());
      // Auto-expand textarea
      commentArea.addEventListener('input', () => {
        commentArea.style.height = 'auto';
        commentArea.style.height = commentArea.scrollHeight + 'px';
      });
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Quote Highlighting ───────────────────────────────────────────────

  _clearHighlights() {
    if (!this.bodyEl) return;
    const marks = this.bodyEl.querySelectorAll('mark.current-quote, mark.sibling-quote');
    for (const mark of marks) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  }

  _normalizeForSearch(str) {
    return str
      .toLowerCase()
      .replace(/[\u2018\u2019\u201C\u201D]/g, c =>
        c === '\u2018' || c === '\u2019' ? "'" : '"')
      .replace(/\u2014/g, '--')
      .replace(/\u2013/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Find a quote's {start, end} in the flat text string.
   * Tries: exact → normalized → first-50-words → keyword regex.
   */
  _findQuoteRange(quote, fullText) {
    if (!quote) return null;

    let idx = -1;
    let matchLen = quote.length;

    // Exact case-insensitive
    idx = fullText.toLowerCase().indexOf(quote.toLowerCase());

    // Normalized match
    if (idx === -1) {
      const normFull = this._normalizeForSearch(fullText);
      const normQuote = this._normalizeForSearch(quote);
      const normIdx = normFull.indexOf(normQuote);
      if (normIdx !== -1) {
        idx = this._mapNormIndexToOriginal(fullText, normIdx);
        matchLen = this._findMatchEndInOriginal(fullText, idx, normQuote.length);
      }
    }

    // First 50 chars fallback
    if (idx === -1 && quote.length > 50) {
      const normFull = this._normalizeForSearch(fullText);
      const normShort = this._normalizeForSearch(quote.slice(0, 50));
      const normIdx = normFull.indexOf(normShort);
      if (normIdx !== -1) {
        idx = this._mapNormIndexToOriginal(fullText, normIdx);
        matchLen = this._findMatchEndInOriginal(fullText, idx, normShort.length);
      }
    }

    // Keyword regex fallback
    if (idx === -1) {
      const words = quote.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length >= 3) {
        const escaped = words.slice(0, 3).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        try {
          const re = new RegExp(escaped.join('.*?'), 'i');
          const m = fullText.match(re);
          if (m) { idx = m.index; matchLen = m[0].length; }
        } catch (_) { /* ignore */ }
      }
    }

    if (idx === -1) return null;
    return { start: idx, end: idx + matchLen };
  }

  /**
   * Highlight all sibling quotes in the article body.
   * Current idea gets `current-quote`, others get `sibling-quote`.
   */
  _highlightAllQuotes(siblingIdeas, currentIdeaId, scrollBehavior = 'smooth') {
    if (!this.bodyEl) return;

    // Collect text nodes and build flat string
    const walker = document.createTreeWalker(this.bodyEl, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let fullText = '';
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push({ node, start: fullText.length });
      fullText += node.textContent;
    }

    // Find ranges for all siblings
    const ranges = [];
    for (const idea of siblingIdeas) {
      const range = this._findQuoteRange(idea.quote, fullText);
      if (range) {
        ranges.push({ ...range, ideaId: idea.id, isCurrent: idea.id === currentIdeaId });
      }
    }

    // Remove overlapping ranges — prefer current idea
    ranges.sort((a, b) => a.start - b.start);
    const filtered = [];
    for (const r of ranges) {
      const overlaps = filtered.some(f =>
        r.start < f.end && r.end > f.start
      );
      if (overlaps) {
        // Only keep if this one is current and the overlapping one isn't
        const overlapIdx = filtered.findIndex(f =>
          r.start < f.end && r.end > f.start
        );
        if (r.isCurrent && overlapIdx !== -1 && !filtered[overlapIdx].isCurrent) {
          filtered[overlapIdx] = r;
        }
        continue;
      }
      filtered.push(r);
    }

    // Sort last-to-first so DOM mutations don't invalidate earlier offsets
    filtered.sort((a, b) => b.start - a.start);

    let scrollTarget = null;

    for (const range of filtered) {
      const className = range.isCurrent ? 'current-quote' : 'sibling-quote';

      for (let i = textNodes.length - 1; i >= 0; i--) {
        const tn = textNodes[i];
        const tnEnd = tn.start + tn.node.textContent.length;
        if (tnEnd <= range.start || tn.start >= range.end) continue;

        const overlapStart = Math.max(0, range.start - tn.start);
        const overlapEnd = Math.min(tn.node.textContent.length, range.end - tn.start);
        const textContent = tn.node.textContent;

        const frag = document.createDocumentFragment();
        if (overlapStart > 0) frag.appendChild(document.createTextNode(textContent.slice(0, overlapStart)));

        const mark = document.createElement('mark');
        mark.className = className;
        mark.dataset.ideaId = range.ideaId;
        mark.textContent = textContent.slice(overlapStart, overlapEnd);
        frag.appendChild(mark);

        if (overlapEnd < textContent.length) frag.appendChild(document.createTextNode(textContent.slice(overlapEnd)));
        tn.node.parentNode.replaceChild(frag, tn.node);

        if (range.isCurrent && !scrollTarget) {
          scrollTarget = mark;
        }
      }
    }

    if (scrollTarget) {
      setTimeout(() => scrollTarget.scrollIntoView({ behavior: scrollBehavior, block: 'center' }), 150);
    }
  }

  _mapNormIndexToOriginal(original, normIdx) {
    let origIdx = 0, normCount = 0;
    while (origIdx < original.length && normCount < normIdx) {
      if (/\s/.test(original[origIdx])) {
        origIdx++;
        if (normCount < normIdx && origIdx < original.length && !/\s/.test(original[origIdx])) normCount++;
      } else { origIdx++; normCount++; }
    }
    return origIdx;
  }

  _findMatchEndInOriginal(original, origStart, normLen) {
    let origIdx = origStart, normCount = 0;
    while (origIdx < original.length && normCount < normLen) {
      if (/\s/.test(original[origIdx])) {
        origIdx++;
        if (normCount < normLen && origIdx < original.length && !/\s/.test(original[origIdx])) normCount++;
      } else { origIdx++; normCount++; }
    }
    return origIdx - origStart;
  }
}
