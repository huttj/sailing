/**
 * Sidebar — hidden by default, slides in on dive to show full article
 * with highlighted quote. Includes idea nav chips for other ideas from
 * the same article. Expandable to full width.
 */

export class Sidebar {
  constructor(element) {
    this.element = element;
    this._navigateCallback = null;
    this._highlightMinimapCallback = null;
    this._currentIdea = null;
    this._currentPost = null;

    this.closeBtn = document.getElementById('sidebar-close');
    this.resizeHandle = document.getElementById('sidebar-resize-handle');
    this.titleEl = document.getElementById('sidebar-title');
    this.ideaNavEl = document.getElementById('sidebar-idea-nav');
    this.bodyEl = document.getElementById('sidebar-body');

    this._onClose = null;

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

  /**
   * Show the sidebar with a full article, highlighting the current quote.
   */
  show(idea, post, siblingIdeas) {
    this._currentIdea = idea;
    this._currentPost = post;

    // Title
    if (this.titleEl) {
      this.titleEl.textContent = post ? post.title : '';
    }

    // Article body
    if (this.bodyEl && post) {
      this.bodyEl.innerHTML = post.html || '';
      // Scroll to top first
      this.bodyEl.scrollTop = 0;
      // Highlight the quote after a tick so DOM is settled — instant scroll on open
      requestAnimationFrame(() => {
        this._highlightQuote(idea.quote, 'instant');
      });
    }

    // Idea nav chips
    if (this.ideaNavEl) {
      this.ideaNavEl.innerHTML = '';
      if (siblingIdeas && siblingIdeas.length > 0) {
        for (const sibling of siblingIdeas) {
          const chip = document.createElement('button');
          chip.className = 'idea-chip';
          if (sibling.id === idea.id) {
            chip.classList.add('idea-chip-active');
          }
          chip.textContent = sibling.summary || sibling.topic;
          chip._ideaId = sibling.id;
          chip.addEventListener('click', () => {
            if (this._navigateCallback) {
              this._navigateCallback(sibling);
            }
          });
          chip.addEventListener('mouseenter', () => {
            if (this._highlightMinimapCallback) {
              this._highlightMinimapCallback(sibling);
            }
          });
          chip.addEventListener('mouseleave', () => {
            if (this._highlightMinimapCallback) {
              this._highlightMinimapCallback(null);
            }
          });
          this.ideaNavEl.appendChild(chip);
        }
      }
    }

    // Slide in
    this.element.classList.remove('sidebar-hidden');
  }

  /**
   * Update the highlighted quote when switching to a new idea
   * (same article).
   */
  updateHighlight(idea) {
    this._currentIdea = idea;

    // Remove old highlights
    this._clearHighlights();

    // Highlight the new quote — smooth scroll when already open
    requestAnimationFrame(() => {
      this._highlightQuote(idea.quote, 'smooth');
    });

    // Update active chip
    if (this.ideaNavEl) {
      const chips = this.ideaNavEl.querySelectorAll('.idea-chip');
      for (const chip of chips) {
        chip.classList.toggle('idea-chip-active', chip._ideaId === idea.id);
      }
    }
  }

  /**
   * Hide the sidebar.
   */
  hide() {
    this.element.classList.add('sidebar-hidden');
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

  _clearHighlights() {
    if (!this.bodyEl) return;
    const marks = this.bodyEl.querySelectorAll('mark.current-quote');
    for (const mark of marks) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  }

  /**
   * Normalize text for fuzzy matching — collapse whitespace, strip
   * punctuation variations, lowercase.
   */
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
   * Highlight a quote in the rendered HTML using TreeWalker.
   * Uses fuzzy matching to handle whitespace/entity differences.
   */
  _highlightQuote(quote, scrollBehavior = 'smooth') {
    if (!quote || !this.bodyEl) return;

    const walker = document.createTreeWalker(
      this.bodyEl,
      NodeFilter.SHOW_TEXT,
      null,
    );

    // Build the full text content to find the quote position
    const textNodes = [];
    let fullText = '';
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push({ node, start: fullText.length });
      fullText += node.textContent;
    }

    // Try exact match first, then progressively fuzzier
    let idx = -1;
    let matchLen = quote.length;

    // Attempt 1: case-insensitive exact
    idx = fullText.toLowerCase().indexOf(quote.toLowerCase());

    // Attempt 2: normalized (collapse whitespace, fix smart quotes)
    if (idx === -1) {
      const normFull = this._normalizeForSearch(fullText);
      const normQuote = this._normalizeForSearch(quote);
      const normIdx = normFull.indexOf(normQuote);

      if (normIdx !== -1) {
        // Map normalized index back to original index
        idx = this._mapNormIndexToOriginal(fullText, normFull, normIdx);
        matchLen = this._findMatchEndInOriginal(fullText, idx, normQuote.length, normFull);
      }
    }

    // Attempt 3: first 50 chars of the quote (handles LLM truncation)
    if (idx === -1 && quote.length > 50) {
      const shortQuote = quote.slice(0, 50);
      const normFull = this._normalizeForSearch(fullText);
      const normShort = this._normalizeForSearch(shortQuote);
      const normIdx = normFull.indexOf(normShort);

      if (normIdx !== -1) {
        idx = this._mapNormIndexToOriginal(fullText, normFull, normIdx);
        // Extend match to the end of the sentence or ~quote length
        matchLen = this._findMatchEndInOriginal(fullText, idx, normShort.length, normFull);
      }
    }

    // Attempt 4: word-based subsequence (find longest matching word run)
    if (idx === -1) {
      const words = quote.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length >= 3) {
        // Search for first 3 significant words appearing in sequence
        const searchStr = words.slice(0, 3).join('.*?');
        try {
          const re = new RegExp(searchStr, 'i');
          const m = fullText.match(re);
          if (m) {
            idx = m.index;
            matchLen = m[0].length;
          }
        } catch (_) {
          // regex failed, skip
        }
      }
    }

    if (idx === -1) return;

    const quoteEnd = idx + matchLen;
    let scrolledToFirst = false;

    // Find which text nodes contain the quote range and wrap them
    for (let i = 0; i < textNodes.length; i++) {
      const tn = textNodes[i];
      const tnEnd = tn.start + tn.node.textContent.length;

      if (tnEnd <= idx || tn.start >= quoteEnd) continue;

      const overlapStart = Math.max(0, idx - tn.start);
      const overlapEnd = Math.min(tn.node.textContent.length, quoteEnd - tn.start);

      const textContent = tn.node.textContent;
      const before = textContent.slice(0, overlapStart);
      const match = textContent.slice(overlapStart, overlapEnd);
      const after = textContent.slice(overlapEnd);

      const parent = tn.node.parentNode;
      const frag = document.createDocumentFragment();

      if (before) frag.appendChild(document.createTextNode(before));

      const mark = document.createElement('mark');
      mark.className = 'current-quote';
      mark.textContent = match;
      frag.appendChild(mark);

      if (after) frag.appendChild(document.createTextNode(after));

      parent.replaceChild(frag, tn.node);

      // Scroll the first mark into view
      if (!scrolledToFirst) {
        scrolledToFirst = true;
        setTimeout(() => {
          mark.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
        }, 150);
      }
    }
  }

  /**
   * Map an index in normalized text back to the original text.
   */
  _mapNormIndexToOriginal(original, _normalized, normIdx) {
    let origIdx = 0;
    let normCount = 0;
    const origLower = original.toLowerCase();

    while (origIdx < original.length && normCount < normIdx) {
      // Skip extra whitespace in original that was collapsed
      if (/\s/.test(origLower[origIdx])) {
        origIdx++;
        if (normCount < normIdx && origIdx < original.length && !/\s/.test(origLower[origIdx])) {
          normCount++; // The collapsed space
        }
      } else {
        origIdx++;
        normCount++;
      }
    }
    return origIdx;
  }

  /**
   * Find how many chars in the original correspond to normLen chars
   * in the normalized version, starting from origStart.
   */
  _findMatchEndInOriginal(original, origStart, normLen, _normalized) {
    let origIdx = origStart;
    let normCount = 0;

    while (origIdx < original.length && normCount < normLen) {
      if (/\s/.test(original[origIdx])) {
        origIdx++;
        if (normCount < normLen && origIdx < original.length && !/\s/.test(original[origIdx])) {
          normCount++;
        }
      } else {
        origIdx++;
        normCount++;
      }
    }
    return origIdx - origStart;
  }
}
