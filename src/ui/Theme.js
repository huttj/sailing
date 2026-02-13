/**
 * Theme — manages dark/light mode with two palettes.
 * Stores preference in localStorage. Exposes colors for JS canvas components
 * and fires a callback on change so Pixi-rendered elements can update.
 */

const STORAGE_KEY = 'sailing-theme';

const DARK = {
  name: 'dark',

  // App / ocean
  appBg: 0x0a1628,
  oceanBase: 0x071a2e,

  // Wave layers (color, alpha pairs)
  waves: [
    { color: 0x0a3d5c, alpha: 0.35 },
    { color: 0x0e5a7e, alpha: 0.28 },
    { color: 0x1a7a8a, alpha: 0.22 },
    { color: 0x2e9ba0, alpha: 0.18 },
    { color: 0x146878, alpha: 0.25 },
  ],
  sparkleColor: 0xffffff,

  // PointCloud
  dotSaturation: 0.65,
  dotLightness: 0.55,
  labelFill: 0xe0e8f0,

  // Minimap
  minimapBg: '#0a0e17',
  minimapDotAlpha: 0.7,
  minimapShipFill: '#ffffff',
  minimapShipStroke: 'rgba(100, 200, 255, 0.8)',
  minimapViewportStroke: 'rgba(255, 255, 255, 0.5)',
  minimapVisitedFill: 'rgba(255, 255, 255, 0.45)',

  // Ship
  shipGlow: 0x6cb4f0,
  shipBody: 0xfaf3e0,
  shipStroke: 0x6cb4f0,
  shipCenter: 0x6cb4f0,
};

const LIGHT = {
  name: 'light',

  // App / ocean
  appBg: 0xe8e0d4,
  oceanBase: 0xd5cdbf,

  // Wave layers — lighter, warmer blue-greens
  waves: [
    { color: 0x8bbad0, alpha: 0.30 },
    { color: 0x9ecadb, alpha: 0.24 },
    { color: 0xa8d4d8, alpha: 0.20 },
    { color: 0xb5dde0, alpha: 0.16 },
    { color: 0x8ec8d0, alpha: 0.22 },
  ],
  sparkleColor: 0xffffff,

  // PointCloud
  dotSaturation: 0.60,
  dotLightness: 0.40,
  labelFill: 0x2a2420,

  // Minimap
  minimapBg: '#d8d0c4',
  minimapDotAlpha: 0.8,
  minimapShipFill: '#2a2420',
  minimapShipStroke: 'rgba(60, 100, 140, 0.8)',
  minimapViewportStroke: 'rgba(40, 30, 20, 0.5)',
  minimapVisitedFill: 'rgba(40, 30, 20, 0.45)',

  // Ship
  shipGlow: 0x4a8ab0,
  shipBody: 0x2a2420,
  shipStroke: 0x4a8ab0,
  shipCenter: 0x4a8ab0,
};

export class Theme {
  constructor() {
    this._listeners = [];
    const stored = localStorage.getItem(STORAGE_KEY);
    this._mode = stored === 'light' ? 'light' : 'dark';
    this.palette = this._mode === 'light' ? LIGHT : DARK;
  }

  get mode() {
    return this._mode;
  }

  get isLight() {
    return this._mode === 'light';
  }

  toggle() {
    this._mode = this._mode === 'dark' ? 'light' : 'dark';
    this.palette = this._mode === 'light' ? LIGHT : DARK;
    localStorage.setItem(STORAGE_KEY, this._mode);
    document.body.classList.toggle('light-mode', this.isLight);
    for (const fn of this._listeners) fn(this.palette);
  }

  /** Register a callback for theme changes. */
  onChange(fn) {
    this._listeners.push(fn);
  }

  /** Apply initial body class (call once on startup). */
  applyInitial() {
    document.body.classList.toggle('light-mode', this.isLight);
  }
}
