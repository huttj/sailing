import { Container, Graphics } from 'pixi.js';
import { WaterShader } from './WaterShader.js';

/**
 * OceanRenderer draws a deep-blue background rectangle overlaid with
 * animated wave layers. Positioned in screen-space (not world-space).
 * Uses Pixi v8 Graphics API.
 */
export class OceanRenderer {
  constructor(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.container = new Container();

    // Deep ocean base colour
    this.base = new Graphics();
    this._drawBase();
    this.container.addChild(this.base);

    // Animated wave overlay
    this.waterShader = new WaterShader(screenWidth, screenHeight);
    this.container.addChild(this.waterShader.container);
  }

  _drawBase() {
    this.base.clear();
    this.base.rect(0, 0, this.screenWidth, this.screenHeight);
    this.base.fill({ color: 0x071a2e });
  }

  update(time, cameraX = 0, cameraY = 0) {
    this.waterShader.update(time, cameraX, cameraY);
  }

  resize(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this._drawBase();
    this.waterShader.resize(screenWidth, screenHeight);
  }

  destroy() {
    this.waterShader.destroy();
    this.container.destroy({ children: true });
  }
}
