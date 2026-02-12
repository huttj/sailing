/**
 * DiveMode — state manager for dive behavior.
 *
 * When active, gently pulls the ship toward the target idea position
 * and switches targets when the ship drifts close to a different dot.
 */

const MAGNET_STRENGTH = 0.02;
const SWITCH_DISTANCE = 80;

export class DiveMode {
  constructor() {
    this.active = false;
    this.targetIdea = null;
    this._onSwitch = null;
  }

  /**
   * Enter dive mode, targeting a specific idea.
   */
  enter(idea) {
    this.active = true;
    this.targetIdea = idea;
  }

  /**
   * Exit dive mode.
   */
  exit() {
    this.active = false;
    this.targetIdea = null;
  }

  /**
   * Register a callback for when the target switches to a new idea.
   */
  onSwitch(callback) {
    this._onSwitch = callback;
  }

  /**
   * Gently pull the ship toward the target idea position.
   */
  updateShipMagnet(ship) {
    if (!this.active || !this.targetIdea) return;

    const dx = this.targetIdea.x - ship.x;
    const dy = this.targetIdea.y - ship.y;

    ship.vx += dx * MAGNET_STRENGTH;
    ship.vy += dy * MAGNET_STRENGTH;
  }

  /**
   * Check if the nearest idea is different from the current target
   * and close enough to switch.
   */
  checkProximitySwitch(nearby) {
    if (!this.active || !this.targetIdea || nearby.length === 0) return;

    const nearest = nearby[0];
    if (nearest.idea.id !== this.targetIdea.id && nearest.distance < SWITCH_DISTANCE) {
      this.targetIdea = nearest.idea;
      if (this._onSwitch) {
        this._onSwitch(nearest.idea);
      }
    }
  }
}
