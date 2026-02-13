/**
 * PointCloud — manages rendering of all idea dots on the Pixi.js stage.
 *
 * Each idea is a colored dot that becomes a kind icon (?, ↔, ✦, ↩)
 * as you get closer. Color-coded by topic using a golden-ratio hue spread.
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

const KIND_ICONS = {
  question: '?',
  tension: '\u2194',
  image: '\u2726',
  turn: '\u21A9',
};

const ICON_THRESHOLD = 300;      // world units — switch to icon below this
const ICON_BAND = 30;            // transition band width (snap, not gradual)
const ICON_LERP = 0.15;          // animation speed per frame

export const VISITED_FAR = 100;

export class PointCloud {
  constructor(container, ideas, voyageLog, theme) {
    this.ideas = ideas;
    this._voyageLog = voyageLog || null;
    this._theme = theme || null;

    // Build a topic-index map for stable colour assignment
    this.topicIndexMap = new Map();
    let nextIndex = 0;
    for (const idea of ideas) {
      if (!this.topicIndexMap.has(idea.topic)) {
        this.topicIndexMap.set(idea.topic, nextIndex++);
      }
    }

    // Layers: dots behind icons behind labels
    this.dots = [];
    this.icons = [];
    this.dotLayer = new Container();
    this.iconLayer = new Container();
    this.labelLayer = new Container();
    container.addChild(this.dotLayer);
    container.addChild(this.iconLayer);
    container.addChild(this.labelLayer);

    this._buildVisuals(container);
  }

  _getSaturation() {
    return this._theme ? this._theme.palette.dotSaturation : 0.65;
  }

  _getLightness() {
    return this._theme ? this._theme.palette.dotLightness : 0.55;
  }

  _getLabelFill() {
    return this._theme ? this._theme.palette.labelFill : 0xe0e8f0;
  }

  _buildVisuals() {
    const sat = this._getSaturation();
    const lit = this._getLightness();
    const labelFill = this._getLabelFill();

    const labelStyle = new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 13,
      fill: labelFill,
      wordWrap: true,
      wordWrapWidth: 180,
      lineHeight: 16,
    });

    for (const idea of this.ideas) {
      const topicIdx = this.topicIndexMap.get(idea.topic);
      const hue = (topicIdx * GOLDEN_RATIO) % 1;
      const color = hslToHex(hue, sat, lit);

      // Dot (always visible)
      const dot = new Graphics();
      dot.circle(0, 0, 5);
      dot.fill({ color });
      dot.x = idea.x;
      dot.y = idea.y;
      dot._ideaId = idea.id;
      dot._baseColor = color;
      this.dotLayer.addChild(dot);
      this.dots.push(dot);

      // Kind icon (snaps in when close, high-res for zoom)
      const iconChar = KIND_ICONS[idea.kind] || '·';
      const iconStyle = new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 16,
        fill: color,
        fontWeight: 'bold',
      });
      const icon = new Text({ text: iconChar, style: iconStyle, resolution: 8 });
      icon.anchor.set(0.5, 0.5);
      icon.x = idea.x;
      icon.y = idea.y;
      icon.visible = false;
      icon.alpha = 0;
      icon._iconState = 0; // 0 = dot, 1 = icon (animated)
      this.iconLayer.addChild(icon);
      this.icons.push(icon);
    }

    // Reusable label pool
    this.labelPool = [];
    for (let i = 0; i < LABEL_POOL_SIZE; i++) {
      const label = new Text({ text: '', style: labelStyle, resolution: 4 });
      label.visible = false;
      label.anchor.set(0, 0.5);
      this.labelLayer.addChild(label);
      this.labelPool.push(label);
    }
  }

  /** Rebuild all visuals with current theme colors. */
  rebuildForTheme() {
    const sat = this._getSaturation();
    const lit = this._getLightness();
    const labelFill = this._getLabelFill();

    for (let i = 0; i < this.ideas.length; i++) {
      const idea = this.ideas[i];
      const topicIdx = this.topicIndexMap.get(idea.topic);
      const hue = (topicIdx * GOLDEN_RATIO) % 1;
      const color = hslToHex(hue, sat, lit);

      // Redraw dot
      const dot = this.dots[i];
      dot.clear();
      dot.circle(0, 0, 5);
      dot.fill({ color });
      dot._baseColor = color;

      // Update icon color
      const icon = this.icons[i];
      icon.style.fill = color;
    }

    // Update label colors
    for (const label of this.labelPool) {
      label.style.fill = labelFill;
    }
  }

  colorForTopic(topic) {
    const idx = this.topicIndexMap.get(topic) ?? 0;
    const hue = (idx * GOLDEN_RATIO) % 1;
    return hslToHex(hue, this._getSaturation(), this._getLightness());
  }

  /**
   * Called each frame to manage icons and labels.
   * Dots are always visible — icons and labels are proximity-based.
   */
  update(shipX, shipY, camera) {
    const vp = camera.getViewport();
    const zoom = camera.zoom;
    const pad = 200;

    // Scale dots up when zoomed out so they stay visible
    // At zoom 1.0 → scale 1, at zoom 0.14 → scale ~3.5
    const dotScale = Math.min(5, Math.max(1, 0.5 / zoom));
    this.dotLayer.children.forEach(dot => {
      dot.scale.set(dotScale);
    });

    // Collect visible ideas sorted by distance to ship
    const visibleByDist = [];
    const visitedDim = [];

    for (let i = 0; i < this.dots.length; i++) {
      const idea = this.ideas[i];
      const wx = idea.x;
      const wy = idea.y;

      // Viewport culling
      const inView = wx >= vp.left - pad && wx <= vp.right + pad &&
                     wy >= vp.top - pad && wy <= vp.bottom + pad;

      if (!inView) {
        this.icons[i].visible = false;
        continue;
      }

      const dx = wx - shipX;
      const dy = wy - shipY;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      // Threshold snap: dot ↔ icon with quick animated transition
      const wantIcon = dist < ICON_THRESHOLD;
      const target = wantIcon ? 1 : 0;
      const state = this.icons[i]._iconState;
      const next = state + (target - state) * ICON_LERP;
      this.icons[i]._iconState = Math.abs(next - target) < 0.01 ? target : next;

      const s = this.icons[i]._iconState;
      if (s > 0.01) {
        this.icons[i].visible = true;
        this.icons[i].alpha = s;
      } else {
        this.icons[i].visible = false;
      }
      if (s < 0.99) {
        this.dots[i].visible = true;
        this.dots[i].alpha = 1 - s;
      } else {
        this.dots[i].visible = false;
      }

      // Fade visited nodes unless right next to them
      let dimFactor = 1.0;
      if (this._voyageLog && this._voyageLog.getVisited(idea.id)) {
        const VISITED_NEAR = 50;
        const DIM_ALPHA = 0.01;
        if (dist > VISITED_FAR) {
          dimFactor = DIM_ALPHA;
        } else if (dist > VISITED_NEAR) {
          dimFactor = 1.0 - ((dist - VISITED_NEAR) / (VISITED_FAR - VISITED_NEAR)) * (1.0 - DIM_ALPHA);
        }
        if (this.dots[i].visible) this.dots[i].alpha *= dimFactor;
        if (this.icons[i].visible) this.icons[i].alpha *= dimFactor;
      }
      visitedDim[i] = dimFactor;

      visibleByDist.push({ index: i, distSq, dist, wx, wy });
    }

    visibleByDist.sort((a, b) => a.distSq - b.distSq);

    // First pass: assign labels to nearest dots
    const candidates = [];
    const labelCount = Math.min(visibleByDist.length, this.labelPool.length);

    for (let i = 0; i < labelCount; i++) {
      const label = this.labelPool[i];
      const entry = visibleByDist[i];
      const idea = this.ideas[entry.index];

      let labelText = '';
      if (entry.dist < 500) {
        labelText = idea.label || '';
      }

      if (labelText) {
        label.text = labelText;
        label.x = entry.wx + 12;
        label.y = entry.wy;
        label.alpha = Math.max(0.3, 1 - entry.dist / 800) * (visitedDim[entry.index] ?? 1.0);

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
