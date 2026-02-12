/**
 * LODManager — queries the quadtree for nearby ideas and returns them
 * sorted by distance.
 *
 * All dots render at uniform size and full opacity — no LOD tiers.
 * This module just provides the sorted nearby list for dive/sidebar use.
 */

export class LODManager {
  /**
   * @param {Array}          ideas      — full ideas array
   * @param {PointCloud}     pointCloud — PointCloud instance
   * @param {PointQuadtree}  quadtree   — spatial index
   */
  constructor(ideas, pointCloud, quadtree) {
    this.ideas = ideas;
    this.pointCloud = pointCloud;
    this.quadtree = quadtree;

    // Build a map from idea.id -> index into ideas array / dots array
    this.ideaIdToIndex = new Map();
    for (let i = 0; i < ideas.length; i++) {
      this.ideaIdToIndex.set(ideas[i].id, i);
    }
  }

  /**
   * Update LOD. Should be called every frame; internally skips unless
   * frameCount is divisible by 3.
   *
   * @param {number} shipX
   * @param {number} shipY
   * @param {number} frameCount
   * @returns {Array|null} — sorted nearby ideas (with distance) or null when skipped
   */
  update(shipX, shipY, frameCount) {
    if (frameCount % 3 !== 0) {
      return null;
    }

    // Query a generous radius
    const queryRadius = 1200;
    const results = this.quadtree.queryRadius(shipX, shipY, queryRadius);

    const nearby = [];

    for (const pt of results) {
      const idea = pt.data;
      const idx = this.ideaIdToIndex.get(idea.id);
      if (idx === undefined) continue;

      const dx = idea.x - shipX;
      const dy = idea.y - shipY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      nearby.push({ idea, distance: dist });
    }

    // Sort by distance ascending
    nearby.sort((a, b) => a.distance - b.distance);

    return nearby;
  }
}
