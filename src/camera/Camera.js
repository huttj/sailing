/**
 * Smooth-follow camera with auto-zoom via setTargetZoom.
 *
 * The camera tracks a target with lerp. Zoom is driven by a target
 * that the camera smoothly lerps toward each frame.
 */
export class Camera {
  constructor(screenWidth, screenHeight) {
    this.x = 0;
    this.y = 0;

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.lerpFactor = 0.08;
    this._target = null;

    this.zoom = 0.3;
    this.minZoom = 0.03;
    this.maxZoom = 10.0;

    this._targetZoom = 0.3;
    this._zoomLerp = 0.015;
  }

  follow(target) {
    this._target = target;
  }

  /**
   * Set a target zoom level — the camera will smoothly lerp toward it.
   */
  setTargetZoom(target) {
    this._targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, target));
  }

  update(_dt) {
    if (!this._target) return;

    this.x += (this._target.x - this.x) * this.lerpFactor;
    this.y += (this._target.y - this.y) * this.lerpFactor;

    // Smoothly lerp zoom toward target
    this.zoom += (this._targetZoom - this.zoom) * this._zoomLerp;
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.screenWidth * 0.5,
      y: (wy - this.y) * this.zoom + this.screenHeight * 0.5,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.screenWidth * 0.5) / this.zoom + this.x,
      y: (sy - this.screenHeight * 0.5) / this.zoom + this.y,
    };
  }

  /**
   * Return the visible world-space rectangle, accounting for zoom.
   */
  getViewport() {
    const halfW = (this.screenWidth * 0.5) / this.zoom;
    const halfH = (this.screenHeight * 0.5) / this.zoom;
    return {
      left: this.x - halfW,
      right: this.x + halfW,
      top: this.y - halfH,
      bottom: this.y + halfH,
    };
  }

  resize(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }
}
