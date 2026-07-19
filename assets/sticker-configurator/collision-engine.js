/* ===========================================
   CollisionEngine v2 — Constrained Drag Wall-Collision

   Principles:
   - Query methods (pure): rectsOverlap, _overlapDepths, findOverlap, findAllOverlaps, hasAnyOverlap
   - Resolution methods (return position, do NOT mutate items): constrainPosition, findNearestClearSpot, resolveAllOverlaps
   - _clampToCanvas: clamp only, no DOM update (callers own DOM)
   - GAP = 2px minimum gap between items
   =========================================== */

class CollisionEngine {
  constructor(core) {
    this.core = core;
    this.GAP = 2;
    this.EPSILON = 0.01;
  }

  /**
   * Standard AABB overlap test with epsilon tolerance.
   * @param {Object} a - Item with {x, y, w, h}
   * @param {Object} b - Item with {x, y, w, h}
   * @returns {boolean}
   */
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

  /** Clamp a single item to canvas bounds — does NOT update DOM */
  _clampToCanvas(item) {
    var core = this.core;
    item.x = Math.max(0, Math.min(core.CANVAS_W - item.w, item.x));
    item.y = Math.max(0, Math.min(core.CANVAS_H - item.h, item.y));
  }

  /**
   * Wall-collision: constrain a candidate position so the dragged item
   * stays outside all stationary item rects + GAP.
   *
   * For each overlapping stationary item, push on the axis requiring LESS
   * displacement (closer to mouse). Accumulate pushes across all stationary
   * items. Max 2 iterations for cascading overlaps.
   *
   * @param {number} candidateX - Mouse candidate X
   * @param {number} candidateY - Mouse candidate Y
   * @param {Object} draggedItem - The item being dragged
   * @param {Array} allItems - All items on canvas
   * @param {Array} draggedIds - IDs of all items currently being dragged
   * @returns {{x: number, y: number}} Closest non-overlapping position
   */
  constrainPosition(candidateX, candidateY, draggedItem, allItems, draggedIds) {
    var cx = candidateX, cy = candidateY;
    var itemW = draggedItem.w, itemH = draggedItem.h;
    var GAP = this.GAP;
    var core = this.core;

    // Build dragged set for O(1) lookup
    var draggedSet = {};
    if (draggedIds) {
      for (var di = 0; di < draggedIds.length; di++) {
        draggedSet[draggedIds[di]] = true;
      }
    }

    // Helper: AABB overlap test at a specific candidate position
    function overlapsAt(cx, cy, w, h, other) {
      var self = { x: cx, y: cy, w: w, h: h };
      return (self.x + 0.01) < (other.x + other.w - 0.01) &&
             (other.x + 0.01) < (self.x + self.w - 0.01) &&
             (self.y + 0.01) < (other.y + other.h - 0.01) &&
             (other.y + 0.01) < (self.y + self.h - 0.01);
    }

    for (var iter = 0; iter < 2; iter++) {
      var totalPushX = 0, totalPushY = 0;

      for (var si = 0; si < allItems.length; si++) {
        var other = allItems[si];
        // Skip self and other dragged items (multi-drag pass-through)
        if (other.id === draggedItem.id || draggedSet[other.id]) continue;
        if (!overlapsAt(cx, cy, itemW, itemH, other)) continue;

        // AABB overlap depths at candidate position
        var overlapX = Math.min(cx + itemW, other.x + other.w) - Math.max(cx, other.x);
        var overlapY = Math.min(cy + itemH, other.y + other.h) - Math.max(cy, other.y);
        if (overlapX <= 0 || overlapY <= 0) continue;

        // Push direction: centre-to-centre delta on each axis
        var dCenterX = (cx + itemW / 2) - (other.x + other.w / 2);
        var dCenterY = (cy + itemH / 2) - (other.y + other.h / 2);
        var pushDirX = dCenterX >= 0 ? 1 : -1;
        var pushDirY = dCenterY >= 0 ? 1 : -1;
        // If centres exactly aligned, push right/down
        if (dCenterX === 0) pushDirX = 1;
        if (dCenterY === 0) pushDirY = 1;

        var pushDistX = overlapX + GAP;
        var pushDistY = overlapY + GAP;

        // Choose axis with SMALLER displacement (closer to mouse)
        if (pushDistX <= pushDistY) {
          totalPushX += pushDirX * pushDistX;
        } else {
          totalPushY += pushDirY * pushDistY;
        }
      }

      if (totalPushX === 0 && totalPushY === 0) break;
      cx += totalPushX;
      cy += totalPushY;
    }

    // Final clamp to canvas bounds
    cx = Math.max(0, Math.min(core.CANVAS_W - itemW, cx));
    cy = Math.max(0, Math.min(core.CANVAS_H - itemH, cy));

    return { x: cx, y: cy };
  }

  /**
   * Find ALL items that overlap with the given item.
   * @param {Object} item - The item to check
   * @param {Array} allItems - All items to check against
   * @returns {Array<{other: Object, depths: {x: number, y: number}}>}
   */
  findAllOverlaps(item, allItems) {
    var results = [];
    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;
      if (this.rectsOverlap(item, other)) {
        results.push({
          other: other,
          depths: this._overlapDepths(item, other)
        });
      }
    }
    return results;
  }

  /**
   * Linear nudge v2: find nearest clear position for an overlapping item.
   *
   * Unlike constrainPosition (which per-item chooses the SMALLER axis to stay
   * close to the mouse), findNearestClearSpot v2 sums overlapDepth + GAP on
   * BOTH axes per overlapping item. This gives a stronger push to escape a
   * multi-item cluster. Max 2 iterations.
   *
   * @param {Object} item - The overlapping item (with x, y, w, h)
   * @param {Array} allItems - All items to check against
   * @returns {{x: number, y: number}|null} Nearest clear position, or null if stuck
   */
  findNearestClearSpot(item, allItems) {
    var core = this.core;
    var GAP = this.GAP;

    // 1. Check if current position is already clear
    if (this.findAllOverlaps(item, allItems).length === 0) {
      return { x: item.x, y: item.y };
    }

    var nx = item.x, ny = item.y;
    var nw = item.w, nh = item.h;

    for (var iter = 0; iter < 2; iter++) {
      var overlaps = this.findAllOverlaps(
        { id: item.id, x: nx, y: ny, w: nw, h: nh },
        allItems
      );
      if (overlaps.length === 0) {
        return { x: nx, y: ny };
      }

      var pushX = 0, pushY = 0;

      for (var oi = 0; oi < overlaps.length; oi++) {
        var ov = overlaps[oi];
        var other = ov.other;
        var depths = ov.depths;

        // Centre-to-centre direction on each axis
        var dCenterX = (nx + nw / 2) - (other.x + other.w / 2);
        var dCenterY = (ny + nh / 2) - (other.y + other.h / 2);
        var dirX = dCenterX >= 0 ? 1 : -1;
        var dirY = dCenterY >= 0 ? 1 : -1;
        if (dCenterX === 0) dirX = 1;
        if (dCenterY === 0) dirY = 1;

        pushX += dirX * (depths.x + GAP);
        pushY += dirY * (depths.y + GAP);
      }

      nx = nx + pushX;
      ny = ny + pushY;

      // Clamp to canvas
      nx = Math.max(0, Math.min(core.CANVAS_W - nw, nx));
      ny = Math.max(0, Math.min(core.CANVAS_H - nh, ny));
    }

    // Final validation — one last check
    var finalOverlaps = this.findAllOverlaps(
      { id: item.id, x: nx, y: ny, w: nw, h: nh },
      allItems
    );
    if (finalOverlaps.length === 0) {
      return { x: nx, y: ny };
    }

    return null;
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
        // Only skip pairs where BOTH items are dragged
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
   * Resolve ALL overlapping items by nudging each to a clear position.
   * For structural operations (align, arrange, distribute).
   * Does NOT update DOM — caller must re-render after this call.
   *
   * @param {Array} items - All items on canvas (mutated in place)
   * @returns {boolean} true if all overlaps were resolved
   */
  resolveAllOverlaps(items) {
    var anyFailed = false;

    for (var iter = 0; iter < 3; iter++) {
      var resolvedAny = false;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var overlaps = this.findAllOverlaps(item, items);
        if (overlaps.length === 0) continue;

        var next = this.findNearestClearSpot(item, items);
        if (next) {
          item.x = next.x;
          item.y = next.y;
          resolvedAny = true;
        } else {
          anyFailed = true;
        }
      }

      if (!resolvedAny) break;
    }

    return !anyFailed && !this.hasAnyOverlap(items);
  }
}
