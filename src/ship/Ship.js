import { Container, Graphics } from 'pixi.js';

/**
 * Ship — simple directional movement with momentum and uniform drag.
 *
 * Arrow keys add velocity directly in cardinal directions.
 * Diagonal movement works naturally when multiple keys are held.
 */
export class Ship {
  constructor(theme) {
    this.x = 0;
    this.y = 0;

    this.vx = 0;
    this.vy = 0;
    this.speed = 0;

    this.drag = 0.96;
    this.maxSpeed = 8;
    this._theme = theme || null;
  }

  update(_dt) {
    // Apply drag
    this.vx *= this.drag;
    this.vy *= this.drag;

    // Speed cap
    this.speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.speed > this.maxSpeed) {
      const scale = this.maxSpeed / this.speed;
      this.vx *= scale;
      this.vy *= scale;
      this.speed = this.maxSpeed;
    }

    // Position integration
    this.x += this.vx;
    this.y += this.vy;
  }

  /**
   * Lazily create and return the Pixi display container for this ship.
   * Simple circle marker with a subtle glow ring.
   */
  getGraphics() {
    if (this._gfx) return this._gfx;

    const p = this._theme ? this._theme.palette : null;
    const glowColor = p ? p.shipGlow : 0x6cb4f0;
    const bodyColor = p ? p.shipBody : 0xfaf3e0;
    const strokeColor = p ? p.shipStroke : 0x6cb4f0;
    const centerColor = p ? p.shipCenter : 0x6cb4f0;

    const container = new Container();

    // Outer glow ring
    const glow = new Graphics();
    glow.circle(0, 0, 14);
    glow.fill({ color: glowColor, alpha: 0.15 });
    container.addChild(glow);

    // Main circle
    const body = new Graphics();
    body.circle(0, 0, 8);
    body.fill({ color: bodyColor });
    body.circle(0, 0, 8);
    body.stroke({ width: 1.5, color: strokeColor, alpha: 0.6 });
    container.addChild(body);

    // Center dot
    const center = new Graphics();
    center.circle(0, 0, 2.5);
    center.fill({ color: centerColor });
    container.addChild(center);

    this._gfx = container;
    return container;
  }

  /** Rebuild graphics with current theme colors. */
  rebuildGraphics() {
    if (!this._gfx) return this.getGraphics();
    const parent = this._gfx.parent;
    const idx = parent ? parent.getChildIndex(this._gfx) : -1;
    this._gfx.destroy({ children: true });
    this._gfx = null;
    const newGfx = this.getGraphics();
    if (parent && idx >= 0) {
      parent.addChildAt(newGfx, idx);
      newGfx.x = this.x;
      newGfx.y = this.y;
    }
    return newGfx;
  }

  destroy() {
    if (this._gfx) {
      this._gfx.destroy({ children: true });
      this._gfx = null;
    }
  }
}
