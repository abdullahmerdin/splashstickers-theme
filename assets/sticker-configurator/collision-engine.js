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
  constrainPosition(candidateX, candidateY, draggedItem, allItems, draggedIds, startX, startY) {
    var itemW = draggedItem.w, itemH = draggedItem.h;
    var core = this.core;

    // Build dragged set for O(1) lookup
    var draggedSet = {};
    if (draggedIds) {
      for (var di = 0; di < draggedIds.length; di++) {
        draggedSet[draggedIds[di]] = true;
      }
    }

    // Helper: does candidate (cx,cy) overlap with ANY stationary item?
    function overlapsAny(cx, cy) {
      for (var i = 0; i < allItems.length; i++) {
        var o = allItems[i];
        if (o.id === draggedItem.id || draggedSet[o.id]) continue;
        if ((cx + 0.01) < (o.x + o.w - 0.01) &&
            (o.x + 0.01) < (cx + itemW - 0.01) &&
            (cy + 0.01) < (o.y + o.h - 0.01) &&
            (o.y + 0.01) < (cy + itemH - 0.01)) return true;
      }
      return false;
    }

    // 1. If candidate is already clear, return it
    if (!overlapsAny(candidateX, candidateY)) {
      return { x: candidateX, y: candidateY };
    }

    // 2. Binary search from start (non-overlapping) to candidate (overlapping)
    //    to find the LAST non-overlapping position (the exact boundary)
    var loX = startX != null ? startX : candidateX;
    var loY = startY != null ? startY : candidateY;
    var hiX = candidateX, hiY = candidateY;

    for (var iter = 0; iter < 12; iter++) {
      var midX = (loX + hiX) / 2;
      var midY = (loY + hiY) / 2;
      if (overlapsAny(midX, midY)) {
        hiX = midX; hiY = midY;
      } else {
        loX = midX; loY = midY;
      }
    }

    // Clamp to canvas
    loX = Math.max(0, Math.min(core.CANVAS_W - itemW, loX));
    loY = Math.max(0, Math.min(core.CANVAS_H - itemH, loY));

    return { x: loX, y: loY };
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
    var w = item.w, h = item.h;

    // Check if current position is already clear
    if (this.findAllOverlaps(item, allItems).length === 0) {
      return { x: item.x, y: item.y };
    }

    // Same 4-edge escape algorithm as constrainPosition
    var bestX = item.x, bestY = item.y;
    var bestDist = Infinity;

    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;

      // Skip items that DON'T overlap at current position
      // (only need to escape from actual blockers)
      if (!this.rectsOverlap(item, other)) continue;

      // 4 single-axis escapes + 4 corner escapes
      var escapes = [
        { x: other.x + other.w + GAP, y: item.y },
        { x: other.x - w - GAP, y: item.y },
        { x: item.x, y: other.y + other.h + GAP },
        { x: item.x, y: other.y - h - GAP },
        { x: other.x + other.w + GAP, y: other.y + other.h + GAP },
        { x: other.x + other.w + GAP, y: other.y - h - GAP },
        { x: other.x - w - GAP, y: other.y + other.h + GAP },
        { x: other.x - w - GAP, y: other.y - h - GAP }
      ];

      for (var e = 0; e < escapes.length; e++) {
        var ex = escapes[e].x, ey = escapes[e].y;
        // Clamp to canvas
        ex = Math.max(0, Math.min(core.CANVAS_W - w, ex));
        ey = Math.max(0, Math.min(core.CANVAS_H - h, ey));
        // Verify no overlap at this escape
        if (this.findAllOverlaps(
          { id: item.id, x: ex, y: ey, w: w, h: h },
          allItems
        ).length > 0) continue;
        var dist = Math.abs(ex - item.x) + Math.abs(ey - item.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestX = ex;
          bestY = ey;
        }
      }
    }

    if (bestDist === Infinity) {
      return null; // no clear spot found
    }
    return { x: bestX, y: bestY };
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
