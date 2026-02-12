/**
 * Minimap — renders a 200x200 overview in the bottom-left corner using a
 * plain 2D canvas. All idea dots are pre-rendered to an off-screen canvas
 * as a static background, then composited each frame with the ship position
 * and viewport rectangle. Supports highlighting a specific idea with a
 * pulsing ring.
 */

const MAP_SIZE = 200;
const WORLD_MIN = -5000;
const WORLD_MAX = 5000;
const WORLD_RANGE = WORLD_MAX - WORLD_MIN;

const GOLDEN_RATIO = 0.618033988749895;

function hslToCSS(h, s, l) {
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
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

export class Minimap {
  constructor(canvas, ideas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ideas = ideas;
    this.bgCanvas = null;
    this._highlightIdea = null;
    this._pulseTime = 0;

    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;

    // Build a topic-index map for color assignment
    this.topicIndexMap = new Map();
    let nextIndex = 0;
    for (const idea of ideas) {
      if (!this.topicIndexMap.has(idea.topic)) {
        this.topicIndexMap.set(idea.topic, nextIndex++);
      }
    }
  }

  init() {
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = MAP_SIZE;
    this.bgCanvas.height = MAP_SIZE;
    const bgCtx = this.bgCanvas.getContext('2d');

    bgCtx.fillStyle = '#0a0e17';
    bgCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    for (const idea of this.ideas) {
      const mx = this._worldToMap(idea.x);
      const my = this._worldToMap(idea.y);

      const topicIdx = this.topicIndexMap.get(idea.topic) ?? 0;
      const hue = (topicIdx * GOLDEN_RATIO) % 1;
      const color = hslToCSS(hue, 0.65, 0.55);

      bgCtx.fillStyle = color;
      bgCtx.globalAlpha = 0.7;
      bgCtx.beginPath();
      bgCtx.arc(mx, my, 1.5, 0, Math.PI * 2);
      bgCtx.fill();
    }
    bgCtx.globalAlpha = 1;
  }

  /**
   * Highlight a specific idea with a pulsing ring.
   */
  highlightIdea(idea) {
    this._highlightIdea = idea;
    this._pulseTime = 0;
  }

  /**
   * Clear the highlight.
   */
  clearHighlight() {
    this._highlightIdea = null;
  }

  /**
   * Redraw the minimap each frame.
   */
  update(shipX, shipY, viewport) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    if (this.bgCanvas) {
      ctx.drawImage(this.bgCanvas, 0, 0);
    }

    // Draw viewport rectangle
    if (viewport) {
      const vx = this._worldToMap(viewport.left);
      const vy = this._worldToMap(viewport.top);
      const vw = ((viewport.right - viewport.left) / WORLD_RANGE) * MAP_SIZE;
      const vh = ((viewport.bottom - viewport.top) / WORLD_RANGE) * MAP_SIZE;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, vy, vw, vh);
    }

    // Draw highlight ring
    if (this._highlightIdea) {
      this._pulseTime += 0.05;
      const hx = this._worldToMap(this._highlightIdea.x);
      const hy = this._worldToMap(this._highlightIdea.y);
      const pulseRadius = 5 + Math.sin(this._pulseTime) * 2;
      const pulseAlpha = 0.6 + Math.sin(this._pulseTime) * 0.3;

      ctx.strokeStyle = `rgba(100, 200, 255, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ship dot
    const sx = this._worldToMap(shipX);
    const sy = this._worldToMap(shipY);

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  _worldToMap(value) {
    return ((value - WORLD_MIN) / WORLD_RANGE) * MAP_SIZE;
  }
}
