import { Container, Graphics } from 'pixi.js';
import { WaterShader } from './WaterShader.js';

/**
 * OceanRenderer draws a deep-blue background rectangle overlaid with
 * animated wave layers. Positioned in world-space inside worldContainer.
 * Uses Pixi v8 Graphics API.
 */
export class OceanRenderer {
  constructor(theme) {
    this._theme = theme;

    this.container = new Container();

    // Deep ocean base colour — large world rect
    this.base = new Graphics();
    this._drawBase();
    this.container.addChild(this.base);

    // Animated wave overlay
    this.waterShader = new WaterShader(theme);
    this.container.addChild(this.waterShader.container);
  }

  _drawBase() {
    const color = this._theme ? this._theme.palette.oceanBase : 0x071a2e;
    this.base.clear();
    this.base.rect(-7000, -7000, 14000, 14000);
    this.base.fill({ color });
  }

  update(time, viewport, zoom) {
    this.waterShader.update(time, viewport, zoom);
  }

  /** Redraw base when theme changes. */
  onThemeChange() {
    this._drawBase();
  }

  destroy() {
    this.waterShader.destroy();
    this.container.destroy({ children: true });
  }
}
