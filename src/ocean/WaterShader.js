import { Graphics, Container } from 'pixi.js';

/**
 * WaterShader creates animated wave layers using Graphics objects.
 * Each layer is a set of semi-transparent wavy shapes that scroll
 * at different speeds to produce a layered ocean surface effect.
 * Uses Pixi v8 Graphics API.
 */

const WAVE_LAYERS = [
  { color: 0x0a3d5c, alpha: 0.35, amplitude: 12, frequency: 0.008, speed: 0.4, yBase: 0.25, thickness: 60 },
  { color: 0x0e5a7e, alpha: 0.28, amplitude: 8, frequency: 0.012, speed: -0.3, yBase: 0.45, thickness: 50 },
  { color: 0x1a7a8a, alpha: 0.22, amplitude: 6, frequency: 0.018, speed: 0.55, yBase: 0.6, thickness: 40 },
  { color: 0x2e9ba0, alpha: 0.18, amplitude: 10, frequency: 0.006, speed: -0.2, yBase: 0.15, thickness: 70 },
  { color: 0x146878, alpha: 0.25, amplitude: 5, frequency: 0.025, speed: 0.7, yBase: 0.75, thickness: 35 },
];

const SPARKLE_COUNT = 40;

export class WaterShader {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.container = new Container();
    this.waveLayers = [];
    this.sparkles = [];
    this._buildLayers();
    this._buildSparkles();
  }

  _buildLayers() {
    for (const cfg of WAVE_LAYERS) {
      const g = new Graphics();
      this.waveLayers.push({ graphics: g, config: cfg });
      this.container.addChild(g);
    }
  }

  _buildSparkles() {
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const g = new Graphics();
      const sparkle = {
        graphics: g,
        baseX: Math.random() * this.width * 2 - this.width * 0.5,
        baseY: Math.random() * this.height * 2 - this.height * 0.5,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 1.5 + Math.random() * 2,
        size: 1 + Math.random() * 2,
      };
      this.sparkles.push(sparkle);
      this.container.addChild(g);
    }
  }

  update(time, offsetX = 0, offsetY = 0) {
    const w = this.width;
    const h = this.height;
    const step = 6;

    for (const { graphics: g, config: cfg } of this.waveLayers) {
      g.clear();

      const yCenter = h * cfg.yBase;
      const parallax = cfg.speed * 0.3;

      // Build wave polyline path
      g.moveTo(-step, h + 10);

      for (let x = -step; x <= w + step; x += step) {
        const wx = x + offsetX * parallax;
        const wave =
          Math.sin(wx * cfg.frequency + time * cfg.speed) * cfg.amplitude +
          Math.sin(wx * cfg.frequency * 1.7 + time * cfg.speed * 0.6) *
            cfg.amplitude * 0.5;
        g.lineTo(x, yCenter + wave);
      }

      g.lineTo(w + step, h + 10);
      g.closePath();
      g.fill({ color: cfg.color, alpha: cfg.alpha });
    }

    // Sparkles
    for (const sp of this.sparkles) {
      const alpha =
        Math.max(0, Math.sin(time * sp.pulseSpeed + sp.phase)) * 0.7;

      const sx = ((sp.baseX - offsetX * 0.15) % w + w) % w;
      const sy = ((sp.baseY - offsetY * 0.15) % h + h) % h;

      sp.graphics.clear();
      if (alpha > 0.05) {
        sp.graphics.circle(sx, sy, sp.size * alpha);
        sp.graphics.fill({ color: 0xffffff, alpha });
      }
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
