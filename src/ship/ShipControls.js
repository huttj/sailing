/**
 * ShipControls — keyboard input for directional movement and dive.
 *
 * Arrow keys / WASD directly add velocity in cardinal directions.
 * Spacebar triggers dive on nearest idea.
 * Accepts a speedScale factor so apparent on-screen speed stays constant
 * across zoom levels.
 */
export class ShipControls {
  constructor() {
    this._keys = new Set();
    this._spacePressed = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    const key = e.key.toLowerCase();

    if (
      key === 'arrowup' ||
      key === 'arrowdown' ||
      key === 'arrowleft' ||
      key === 'arrowright' ||
      key === ' '
    ) {
      e.preventDefault();
    }

    // Spacebar fires once per press
    if (key === ' ' && !this._keys.has(' ')) {
      this._spacePressed = true;
    }

    this._keys.add(key);
  }

  _onKeyUp(e) {
    this._keys.delete(e.key.toLowerCase());
  }

  /**
   * Read the current key state and apply velocity directly to the ship.
   * @param {import('./Ship.js').Ship} ship
   * @param {number} [speedScale=1] — multiply accel by this (1/zoom for constant apparent speed)
   */
  update(ship, speedScale = 1) {
    const accel = 0.35 * speedScale;

    if (this._keys.has('arrowup') || this._keys.has('w')) {
      ship.vy -= accel;
    }
    if (this._keys.has('arrowdown') || this._keys.has('s')) {
      ship.vy += accel;
    }
    if (this._keys.has('arrowleft') || this._keys.has('a')) {
      ship.vx -= accel;
    }
    if (this._keys.has('arrowright') || this._keys.has('d')) {
      ship.vx += accel;
    }
  }

  /**
   * Consume spacebar press (returns true once per press).
   * @returns {boolean}
   */
  consumeSpace() {
    const v = this._spacePressed;
    this._spacePressed = false;
    return v;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._keys.clear();
  }
}
