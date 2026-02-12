/**
 * PointCloud — manages rendering of all idea dots on the Pixi.js stage.
 *
 * Each idea becomes a small Graphics circle, color-coded by topic using a
 * golden-ratio hue spread. All dots are always visible — no proximity fading.
 * Labels appear on nearest dots.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ---- helpers ----

function hslToHex(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q2;
    r = hue2rgb(p, q2, h + 1 / 3);
    g = hue2rgb(p, q2, h);
    b = hue2rgb(p, q2, h - 1 / 3);
  }
  const toHex = (v) => Math.round(v * 255);
  return (toHex(r) << 16) | (toHex(g) << 8) | toHex(b);
}

const GOLDEN_RATIO = 0.618033988749895;
const LABEL_POOL_SIZE = 40;

const LABEL_STYLE = new TextStyle({
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  fill: 0xe0e8f0,
  wordWrap: true,
  wordWrapWidth: 180,
  lineHeight: 16,
});

export class PointCloud {
  constructor(container, ideas) {
    this.ideas = ideas;

    // Build a topic-index map for stable colour assignment
    this.topicIndexMap = new Map();
    let nextIndex = 0;
    for (const idea of ideas) {
      if (!this.topicIndexMap.has(idea.topic)) {
        this.topicIndexMap.set(idea.topic, nextIndex++);
      }
    }

    // One Graphics circle per idea
    this.dots = [];
    this.dotLayer = new Container();
    this.labelLayer = new Container();
    container.addChild(this.dotLayer);
    container.addChild(this.labelLayer);

    for (const idea of ideas) {
      const topicIdx = this.topicIndexMap.get(idea.topic);
      const hue = (topicIdx * GOLDEN_RATIO) % 1;
      const color = hslToHex(hue, 0.65, 0.55);

      const dot = new Graphics();
      dot.circle(0, 0, 5);
      dot.fill({ color });

      dot.x = idea.x;
      dot.y = idea.y;

      dot._ideaId = idea.id;
      dot._baseColor = color;

      this.dotLayer.addChild(dot);
      this.dots.push(dot);
    }

    // Reusable label pool
    this.labelPool = [];
    for (let i = 0; i < LABEL_POOL_SIZE; i++) {
      const label = new Text({ text: '', style: LABEL_STYLE });
      label.visible = false;
      label.anchor.set(0, 0.5);
      this.labelLayer.addChild(label);
      this.labelPool.push(label);
    }
  }

  colorForTopic(topic) {
    const idx = this.topicIndexMap.get(topic) ?? 0;
    const hue = (idx * GOLDEN_RATIO) % 1;
    return hslToHex(hue, 0.65, 0.55);
  }

  /**
   * Called each frame to manage label assignment with overlap prevention.
   * Dots are always visible — only labels are proximity-based.
   */
  update(shipX, shipY, camera) {
    const vp = camera.getViewport();
    const pad = 200;

    // Collect visible ideas sorted by distance to ship
    const visibleByDist = [];

    for (let i = 0; i < this.dots.length; i++) {
      const idea = this.ideas[i];
      const wx = idea.x;
      const wy = idea.y;

      // Viewport culling only — dots are always full alpha when in view
      if (wx < vp.left - pad || wx > vp.right + pad ||
          wy < vp.top - pad || wy > vp.bottom + pad) {
        continue;
      }

      const dx = wx - shipX;
      const dy = wy - shipY;
      const distSq = dx * dx + dy * dy;
      visibleByDist.push({ index: i, distSq, wx, wy });
    }

    visibleByDist.sort((a, b) => a.distSq - b.distSq);

    // First pass: assign text and tentative positions
    const candidates = [];
    const labelCount = Math.min(visibleByDist.length, this.labelPool.length);

    for (let i = 0; i < labelCount; i++) {
      const label = this.labelPool[i];
      const entry = visibleByDist[i];
      const idea = this.ideas[entry.index];
      const dist = Math.sqrt(entry.distSq);

      // Always show the summary — it's the buoy text on the surface.
      // Quotes are for the sidebar when you dive in.
      let labelText = '';
      if (dist < 500) {
        labelText = idea.summary || '';
      }

      if (labelText) {
        label.text = labelText;
        label.x = entry.wx + 12;
        label.y = entry.wy;
        label.alpha = Math.max(0.3, 1 - dist / 800);

        const w = label.width;
        const h = label.height;
        candidates.push({
          label,
          left: label.x,
          right: label.x + w,
          top: label.y - h * 0.5,
          bottom: label.y + h * 0.5,
        });
      } else {
        label.visible = false;
      }
    }

    // Second pass: overlap prevention
    const placed = [];
    for (const c of candidates) {
      let overlaps = false;
      for (const p of placed) {
        if (
          c.left < p.right + 4 &&
          c.right > p.left - 4 &&
          c.top < p.bottom + 2 &&
          c.bottom > p.top - 2
        ) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) {
        c.label.visible = false;
      } else {
        c.label.visible = true;
        placed.push(c);
      }
    }

    // Hide remaining unused labels
    for (let i = labelCount; i < this.labelPool.length; i++) {
      this.labelPool[i].visible = false;
    }
  }
}
