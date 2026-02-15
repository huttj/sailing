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

    // Arrow-key hold tracking for undive
    this._arrowHeldSince = 0;          // timestamp when first arrow pressed
    this._arrowUndiveFired = false;     // true once undive triggers (prevents re-fire)
    this._arrowReleasedSinceUndive = true; // must release all arrows before next undive

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _isArrowKey(key) {
    return key === 'arrowup' || key === 'arrowdown' ||
           key === 'arrowleft' || key === 'arrowright' ||
           key === 'w' || key === 'a' || key === 's' || key === 'd';
  }

  _anyArrowHeld() {
    return this._keys.has('arrowup') || this._keys.has('arrowdown') ||
           this._keys.has('arrowleft') || this._keys.has('arrowright') ||
           this._keys.has('w') || this._keys.has('a') ||
           this._keys.has('s') || this._keys.has('d');
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

  /**
   * Reset the arrow-key undive timer. Call when entering dive mode
   * so a previously-held arrow doesn't immediately trigger undive.
   */
  resetArrowUndive() {
    this._arrowHeldSince = this._anyArrowHeld() ? performance.now() : 0;
    this._arrowUndiveFired = false;
    this._arrowReleasedSinceUndive = !this._anyArrowHeld();
  }

  /**
   * Check if arrow keys have been held long enough to trigger undive.
   * Returns true once per hold (must release all arrows before next trigger).
   * @param {number} holdMs — required hold duration in ms
   * @returns {boolean}
   */
  consumeArrowUndive(holdMs = 1500) {
    if (this._arrowUndiveFired) return false;

    if (this._anyArrowHeld()) {
      if (!this._arrowHeldSince) {
        // Only start the timer if arrows were released since last undive
        if (this._arrowReleasedSinceUndive) {
          this._arrowHeldSince = performance.now();
        } else {
          return false;
        }
      }
      if (performance.now() - this._arrowHeldSince >= holdMs) {
        this._arrowUndiveFired = true;
        this._arrowReleasedSinceUndive = false;
        return true;
      }
    } else {
      // All arrows released — reset for next hold
      this._arrowHeldSince = 0;
      this._arrowReleasedSinceUndive = true;
    }
    return false;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._keys.clear();
  }
}
