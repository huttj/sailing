/**
 * PointQuadtree — simple 2D spatial index with rectangle and radius queries.
 *
 * Each inserted point must have { x, y, data }.
 * Bounds are { x, y, width, height } where (x, y) is the top-left corner.
 */

export class PointQuadtree {
  constructor(bounds, capacity = 10) {
    this.bounds = bounds; // { x, y, width, height }
    this.capacity = capacity;
    this.points = [];
    this.divided = false;
    this.ne = null;
    this.nw = null;
    this.se = null;
    this.sw = null;
  }

  /**
   * Insert a point { x, y, data } into the quadtree.
   * Returns true if the point was inserted, false if it falls outside bounds.
   */
  insert(point) {
    if (!this._containsPoint(point)) {
      return false;
    }

    if (this.points.length < this.capacity && !this.divided) {
      this.points.push(point);
      return true;
    }

    if (!this.divided) {
      this._subdivide();
    }

    if (this.ne.insert(point)) return true;
    if (this.nw.insert(point)) return true;
    if (this.se.insert(point)) return true;
    if (this.sw.insert(point)) return true;

    // Should not happen if _containsPoint passed, but guard anyway
    return false;
  }

  /**
   * Return all points within a circle centered at (cx, cy) with the given radius.
   */
  queryRadius(cx, cy, radius) {
    const found = [];
    this._queryRadiusInternal(cx, cy, radius, radius * radius, found);
    return found;
  }

  /**
   * Return all points within the rectangle (x, y, w, h).
   */
  queryRect(x, y, w, h) {
    const found = [];
    const range = { x, y, width: w, height: h };
    this._queryRectInternal(range, found);
    return found;
  }

  // ---- internal helpers ----

  _containsPoint(point) {
    const b = this.bounds;
    return (
      point.x >= b.x &&
      point.x < b.x + b.width &&
      point.y >= b.y &&
      point.y < b.y + b.height
    );
  }

  _intersectsRect(range) {
    const b = this.bounds;
    return !(
      range.x > b.x + b.width ||
      range.x + range.width < b.x ||
      range.y > b.y + b.height ||
      range.y + range.height < b.y
    );
  }

  _subdivide() {
    const { x, y, width, height } = this.bounds;
    const hw = width / 2;
    const hh = height / 2;

    this.nw = new PointQuadtree({ x: x, y: y, width: hw, height: hh }, this.capacity);
    this.ne = new PointQuadtree({ x: x + hw, y: y, width: hw, height: hh }, this.capacity);
    this.sw = new PointQuadtree({ x: x, y: y + hh, width: hw, height: hh }, this.capacity);
    this.se = new PointQuadtree({ x: x + hw, y: y + hh, width: hw, height: hh }, this.capacity);

    this.divided = true;

    // Re-insert existing points into children
    for (const p of this.points) {
      this.ne.insert(p) ||
        this.nw.insert(p) ||
        this.se.insert(p) ||
        this.sw.insert(p);
    }
    this.points = [];
  }

  _queryRadiusInternal(cx, cy, radius, radiusSq, found) {
    // Early exit: if the circle does not intersect this node's bounds, skip
    const b = this.bounds;
    const closestX = Math.max(b.x, Math.min(cx, b.x + b.width));
    const closestY = Math.max(b.y, Math.min(cy, b.y + b.height));
    const dx = cx - closestX;
    const dy = cy - closestY;
    if (dx * dx + dy * dy > radiusSq) {
      return;
    }

    for (const p of this.points) {
      const pdx = p.x - cx;
      const pdy = p.y - cy;
      if (pdx * pdx + pdy * pdy <= radiusSq) {
        found.push(p);
      }
    }

    if (this.divided) {
      this.ne._queryRadiusInternal(cx, cy, radius, radiusSq, found);
      this.nw._queryRadiusInternal(cx, cy, radius, radiusSq, found);
      this.se._queryRadiusInternal(cx, cy, radius, radiusSq, found);
      this.sw._queryRadiusInternal(cx, cy, radius, radiusSq, found);
    }
  }

  _queryRectInternal(range, found) {
    if (!this._intersectsRect(range)) {
      return;
    }

    for (const p of this.points) {
      if (
        p.x >= range.x &&
        p.x < range.x + range.width &&
        p.y >= range.y &&
        p.y < range.y + range.height
      ) {
        found.push(p);
      }
    }

    if (this.divided) {
      this.ne._queryRectInternal(range, found);
      this.nw._queryRectInternal(range, found);
      this.se._queryRectInternal(range, found);
      this.sw._queryRectInternal(range, found);
    }
  }
}
