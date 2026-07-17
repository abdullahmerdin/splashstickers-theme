/* ===========================================
   CollisionEngine — Push-apart overlap resolution
   Fixes:
   1. Dynamic push distance based on overlap depth + 2px gap
   2. Push on both axes (bigger overlap axis first, then smaller)
   3. Only dragged items push — stationary items stay put (no domino)
   4. Post-push validation: re-check overlap after each iteration
   5. Drop validation: reliable rect comparison with tolerance
   6. Minimum 2px gap between items (GAP constant)
   7. ALL items clamped to canvas bounds after push
   =========================================== */

class CollisionEngine {
  constructor(core) {
    this.core = core;
    this.GAP = 2; // Minimum gap between items in px
    this.MAX_ITERATIONS = 8;
    this.EPSILON = 0.01; // Floating point tolerance
  }

  rectsOverlap(a, b) {
    return (a.x + this.EPSILON) < (b.x + b.w - this.EPSILON) &&
           (b.x + this.EPSILON) < (a.x + a.w - this.EPSILON) &&
           (a.y + this.EPSILON) < (b.y + b.h - this.EPSILON) &&
           (b.y + this.EPSILON) < (a.y + a.h - this.EPSILON);
  }

  /** Calculate overlap depths per axis (positive = overlapping) */
  _overlapDepths(a, b) {
    var overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return { x: overlapX, y: overlapY };
  }

  /** Clamp a single item to canvas bounds and update DOM position */
  _clampToCanvas(item) {
    var core = this.core;
    item.x = Math.max(0, Math.min(core.CANVAS_W - item.w, item.x));
    item.y = Math.max(0, Math.min(core.CANVAS_H - item.h, item.y));
    item.el.style.left = item.x + 'px';
    item.el.style.top = item.y + 'px';
  }

  /**
   * Push ONLY dragged item away from stationary item.
   * Both axes resolved: bigger overlap first, then smaller overlap.
   * @param {Object} dragged - The item being dragged
   * @param {Object} stationary - The stationary item
   * @returns {boolean} true if a push was applied
   */
  _pushDraggedAway(dragged, stationary) {
    var depths = this._overlapDepths(dragged, stationary);
    if (depths.x <= 0 || depths.y <= 0) return false;

    var dx = (dragged.x + dragged.w / 2) - (stationary.x + stationary.w / 2);
    var dy = (dragged.y + dragged.h / 2) - (stationary.y + stationary.h / 2);

    // Bigger overlap axis first, then the smaller one
    var axes = depths.x >= depths.y ? ['x', 'y'] : ['y', 'x'];

    for (var ai = 0; ai < axes.length; ai++) {
      var axis = axes[ai];
      var overlap = depths[axis];
      if (overlap <= 0) continue;

      // Direction: centre-to-centre delta on this axis
      var dir = (axis === 'x' ? dx : dy);
      var pushDir = dir >= 0 ? 1 : -1;
      // If centers are perfectly aligned, push right/down
      if (dir === 0) pushDir = (axis === 'x' ? 1 : -1);

      var pushDist = overlap + this.GAP;
      dragged[axis] += pushDir * pushDist;
    }

    this._clampToCanvas(dragged);
    return true;
  }

  /**
   * Symmetrical push for two dragged items (both are being moved by user).
   * Each gets half the push distance on each axis.
   */
  _pushBothApart(a, b) {
    var depths = this._overlapDepths(a, b);
    if (depths.x <= 0 || depths.y <= 0) return false;

    var dx = (a.x + a.w / 2) - (b.x + b.w / 2);
    var dy = (a.y + a.h / 2) - (b.y + b.h / 2);
    var axes = depths.x >= depths.y ? ['x', 'y'] : ['y', 'x'];

    for (var ai = 0; ai < axes.length; ai++) {
      var axis = axes[ai];
      var overlap = depths[axis];
      if (overlap <= 0) continue;

      var dir = (axis === 'x' ? dx : dy);
      var pushDir = dir >= 0 ? 1 : -1;
      if (dir === 0) pushDir = (axis === 'x' ? 1 : -1);

      var halfDist = (overlap + this.GAP) / 2;
      a[axis] += pushDir * halfDist;
      b[axis] -= pushDir * halfDist;
    }

    this._clampToCanvas(a);
    this._clampToCanvas(b);
    return true;
  }

  /**
   * Resolve all overlaps in the item list.
   * - Only dragged items push stationary items (no domino effect)
   * - If both items are dragged, both are pushed symmetrically
   * - Items not dragged are never moved by collision resolution
   * @param {Array} items - All items on canvas
   * @param {Array} draggedIds - IDs of currently dragged items
   * @returns {boolean} true if all overlaps were resolved
   */
  resolveOverlaps(items, draggedIds) {
    var draggedSet = {};
    if (draggedIds) {
      for (var di = 0; di < draggedIds.length; di++) {
        draggedSet[draggedIds[di]] = true;
      }
    }

    for (var iter = 0; iter < this.MAX_ITERATIONS; iter++) {
      var anyOverlap = false;

      for (var ai = 0; ai < items.length; ai++) {
        for (var bi = ai + 1; bi < items.length; bi++) {
          var a = items[ai], b = items[bi];
          if (!this.rectsOverlap(a, b)) continue;
          anyOverlap = true;

          var aDragged = !!draggedSet[a.id];
          var bDragged = !!draggedSet[b.id];

          if (aDragged && bDragged) {
            this._pushBothApart(a, b);
          } else if (aDragged) {
            this._pushDraggedAway(a, b);
          } else if (bDragged) {
            this._pushDraggedAway(b, a);
          }
          // Neither dragged: skip — stationary items don't domino
        }
      }

      if (!anyOverlap) break;
    }

    // Final clamp for dragged items
    for (var ci = 0; ci < items.length; ci++) {
      if (draggedSet[items[ci].id]) {
        this._clampToCanvas(items[ci]);
      }
    }

    return !this.hasAnyOverlap(items, draggedIds);
  }

  /**
   * Check whether any item overlaps with another.
   * Items whose IDs are in excludeIds are excluded from the check.
   * @param {Array} items - All items on canvas
   * @param {Array} [excludeIds] - IDs to exclude from overlap check
   * @returns {boolean} true if any overlap exists among non-excluded items
   */
  hasAnyOverlap(items, excludeIds) {
    var excludeSet = {};
    if (excludeIds) {
      for (var ei = 0; ei < excludeIds.length; ei++) {
        excludeSet[excludeIds[ei]] = true;
      }
    }

    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var a = items[i], b = items[j];
        // Only skip pairs where BOTH items are dragged (expected overlap during multi-drag)
        if (excludeSet[a.id] && excludeSet[b.id]) continue;
        if (this.rectsOverlap(a, b)) return true;
      }
    }
    return false;
  }

  /**
   * Check if a specific item overlaps with any other item.
   * @param {Object} item - The item to check
   * @param {Array} allItems - All items to check against
   * @returns {Object|null} { overlappingItem, depths } or null if no overlap
   */
  findOverlap(item, allItems) {
    for (var i = 0; i < allItems.length; i++) {
      var o = allItems[i];
      if (o.id === item.id) continue;
      if (this.rectsOverlap(item, o)) {
        return { overlappingItem: o, depths: this._overlapDepths(item, o) };
      }
    }
    return null;
  }

  /**
   * Find the nearest non-overlapping position for an item by spiraling outward.
   * Tries expanding in all 4 directions, increasing distance each step.
   * @param {Object} item - The item to reposition (with x, y, w, h)
   * @param {Array} allItems - All items to check against
   * @returns {{x: number, y: number}|null} Nearest clear position, or null
   */
  findNearestClearSpot(item, allItems) {
    var core = this.core;

    // Is the current position already clear?
    if (!this.findOverlap(item, allItems)) {
      return { x: item.x, y: item.y };
    }

    // Spiral outward — priority order: right, down, left, up
    var dirs = [
      { dx: 1,  dy: 0  },  // right
      { dx: 0,  dy: 1  },  // down
      { dx: -1, dy: 0  },  // left
      { dx: 0,  dy: -1 }   // up
    ];
    var MAX_PX = Math.max(core.CANVAS_W, core.CANVAS_H);

    for (var dist = 1; dist < MAX_PX; dist += 2) {
      for (var di = 0; di < dirs.length; di++) {
        var cx = item.x + dirs[di].dx * dist;
        var cy = item.y + dirs[di].dy * dist;

        // Clamp to canvas
        cx = Math.max(0, Math.min(core.CANVAS_W - item.w, cx));
        cy = Math.max(0, Math.min(core.CANVAS_H - item.h, cy));

        // Check if any other item overlaps with this candidate
        var overlaps = false;
        for (var oi = 0; oi < allItems.length; oi++) {
          var o = allItems[oi];
          if (o.id === item.id) continue;
          // Temp-check: does candidate rect overlap with o?
          if (cx < o.x + o.w && cx + item.w > o.x &&
              cy < o.y + o.h && cy + item.h > o.y) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          return { x: cx, y: cy };
        }
      }
    }

    return null; // No clear spot found (extremely full canvas)
  }
}
