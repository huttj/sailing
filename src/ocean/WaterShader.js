import { Graphics, Container } from 'pixi.js';

/**
 * WaterShader creates animated wave layers using Graphics objects.
 *
 * Each band is a closed polygon with a wavy top edge and a flat bottom.
 * Bands overlap generously so there are no gaps. Three layers at different
 * scales create depth:
 *   1. Large slow swells (broad, gentle)
 *   2. Medium waves (moderate)
 *   3. Small fast ripples (tight, quick)
 *
 * Uses Pixi v8 Graphics API.
 */

const WORLD_EXTENT = 7000;
const SPARKLE_COUNT = 80;

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Layer configs — spacing < bandHeight so bands always overlap
const LAYER_CONFIGS = [
  // Large slow swells
  { amplitude: 25, frequency: 0.0006, speed: 0.15, bandHeight: 400, spacing: 380 },
  // Medium waves
  { amplitude: 16, frequency: 0.0014, speed: -0.25, bandHeight: 300, spacing: 280 },
  // Small fast ripples
  { amplitude: 10, frequency: 0.0030, speed: 0.45, bandHeight: 220, spacing: 240 },
];

const DEFAULT_COLORS = [0x0a3d5c, 0x0e5a7e, 0x1a7a8a];
const DEFAULT_ALPHAS = [0.08, 0.065, 0.055];

function generateBands(layerIndex, config) {
  const rng = mulberry32(layerIndex * 7919 + 42);
  const bands = [];
  let y = -WORLD_EXTENT - config.bandHeight + rng() * config.spacing;

  while (y < WORLD_EXTENT + config.bandHeight) {
    bands.push({
      y,
      amplitude: config.amplitude * (0.7 + rng() * 0.6),
      bandHeight: config.bandHeight * (0.8 + rng() * 0.4),
      freqMod: 0.85 + rng() * 0.3,
      phaseTop: rng() * Math.PI * 2,
      phaseBottom: rng() * Math.PI * 2,
    });
    y += config.spacing * (0.7 + rng() * 0.6);
  }

  return bands;
}

export class WaterShader {
  constructor(theme) {
    this._theme = theme;
    this.container = new Container();
    this.waveLayers = [];
    this.sparkles = [];
    this._buildLayers();
    this._buildSparkles();
  }

  _buildLayers() {
    for (let i = 0; i < LAYER_CONFIGS.length; i++) {
      const cfg = LAYER_CONFIGS[i];
      const g = new Graphics();
      const bands = generateBands(i, cfg);
      this.waveLayers.push({ graphics: g, config: cfg, bands });
      this.container.addChild(g);
    }
  }

  _buildSparkles() {
    const rng = mulberry32(12345);
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const g = new Graphics();
      const sparkle = {
        graphics: g,
        worldX: (rng() * 2 - 1) * WORLD_EXTENT,
        worldY: (rng() * 2 - 1) * WORLD_EXTENT,
        phase: rng() * Math.PI * 2,
        pulseSpeed: 1.5 + rng() * 2,
        size: 4 + rng() * 4,
      };
      this.sparkles.push(sparkle);
      this.container.addChild(g);
    }
  }

  update(time, viewport, zoom) {
    const { left, right, top, bottom } = viewport;
    const step = 24 / zoom;
    const palette = this._theme ? this._theme.palette : null;
    const waveColors = palette ? palette.waves : null;
    const sparkleColor = palette ? palette.sparkleColor : 0xffffff;

    for (let li = 0; li < this.waveLayers.length; li++) {
      const { graphics: g, config: cfg, bands } = this.waveLayers[li];
      g.clear();

      const wc = waveColors ? waveColors[li] : null;
      const color = wc ? wc.color : DEFAULT_COLORS[li];
      const alpha = wc ? wc.alpha : DEFAULT_ALPHAS[li];

      for (const band of bands) {
        const flatBottom = band.y + band.bandHeight + band.amplitude;

        // Cull: skip if entirely outside viewport (with amplitude margin)
        if (flatBottom < top || band.y - band.amplitude > bottom) continue;

        const freq = cfg.frequency * band.freqMod;

        // ── Top edge: wavy left-to-right ──
        const xStart = left - step;
        const xEnd = right + step;

        g.moveTo(xStart, band.y);
        for (let x = xStart; x <= xEnd; x += step) {
          const waveTop =
            Math.sin(x * freq + time * cfg.speed + band.phaseTop) * band.amplitude +
            Math.sin(x * freq * 1.7 + time * cfg.speed * 0.6 + band.phaseTop * 1.3) *
              band.amplitude * 0.4;
          g.lineTo(x, band.y + waveTop);
        }

        // ── Bottom edge: flat straight line ──
        g.lineTo(xEnd, flatBottom);
        g.lineTo(xStart, flatBottom);
        g.closePath();
      }

      g.fill({ color, alpha });
    }

    // Sparkles: cull to viewport
    const margin = 20 / zoom;
    for (const sp of this.sparkles) {
      sp.graphics.clear();

      if (
        sp.worldX < left - margin || sp.worldX > right + margin ||
        sp.worldY < top - margin || sp.worldY > bottom + margin
      ) {
        continue;
      }

      const a = Math.max(0, Math.sin(time * sp.pulseSpeed + sp.phase)) * 0.7;
      if (a > 0.05) {
        sp.graphics.circle(sp.worldX, sp.worldY, sp.size * a);
        sp.graphics.fill({ color: sparkleColor, alpha: a });
      }
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
