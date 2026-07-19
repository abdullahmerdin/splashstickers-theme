/* ===========================================
   CollisionEngine v3 — Axis-Separated AABB Clamping + Spiral Search

   Principles:
   - Query methods (pure): rectsOverlap, _overlapDepths, findOverlap, findAllOverlaps, hasAnyOverlap
   - Resolution methods (return position, do NOT mutate items): constrainPosition, findNearestClearSpot, resolveAllOverlaps
   - Canvas clamping is inlined in constrainPosition and findNearestClearSpot
   - GAP = 2px minimum gap between items
   - MAX_CASCADE_ITERATIONS = 3 iterations for axis feedback loop
   - MAX_SPIRAL_RADIUS_FINE = 20px fine-search radius
   - MAX_SPIRAL_COARSE_STEPS = 20 coarse-search outer steps
   =========================================== */

class CollisionEngine {
  constructor(core) {
    this.core = core;
    this.GAP = 2;
    this.EPSILON = 0.01;
    this.MAX_CASCADE_ITERATIONS = 3;
    this.MAX_SPIRAL_RADIUS_FINE = 20;
    this.MAX_SPIRAL_COARSE_STEPS = 20;
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
  // (removed: _clampToCanvas was dead code — clamping is inlined in constrainPosition and findNearestClearSpot)

  /**
   * Axis-separated AABB clamping response.
   *
   * Replaces v2 binary search with per-axis resolution cascade:
   *   1. Resolve X with current Y position
   *   2. Resolve Y with resolved X position
   *   3. Repeat up to MAX_CASCADE_ITERATIONS until stable
   *
   * @param {number} candidateX - Mouse candidate X
   * @param {number} candidateY - Mouse candidate Y
   * @param {Object} draggedItem - The item being dragged
   * @param {Array} allItems - All items on canvas
   * @param {Array} draggedIds - IDs of all items currently being dragged
   * @param {number} [startX] - Unused in v3 (kept for backward compat)
   * @param {number} [startY] - Unused in v3 (kept for backward compat)
   * @returns {{x: number, y: number}} Closest non-overlapping position
   */
  constrainPosition(candidateX, candidateY, draggedItem, allItems, draggedIds, startX, startY) {
    // Cache hot references to avoid repeated property chain lookups
    var rectsOverlap = this.rectsOverlap;
    var GAP = this.GAP;
    var CANVAS_W = this.core.CANVAS_W;
    var CANVAS_H = this.core.CANVAS_H;

    // Build dragged set for O(1) lookup
    var draggedSet = {};
    if (draggedIds) {
      for (var di = 0; di < draggedIds.length; di++) {
        draggedSet[draggedIds[di]] = true;
      }
    }

    // Filter stationary items once (exclude self + co-dragged)
    var stationary = [];
    for (var si = 0; si < allItems.length; si++) {
      var s = allItems[si];
      if (s.id === draggedItem.id || draggedSet[s.id]) continue;
      stationary.push(s);
    }

    // Candidate already clear — return early
    var candidateRect = { x: candidateX, y: candidateY, w: draggedItem.w, h: draggedItem.h };
    var anyOverlap = false;
    for (var z = 0; z < stationary.length; z++) {
      if (rectsOverlap(candidateRect, stationary[z])) {
        anyOverlap = true;
        break;
      }
    }
    if (!anyOverlap) {
      return { x: candidateX, y: candidateY };
    }

    // Axis-separated clamping with cascade iteration
    var rx = candidateX, ry = candidateY;
    var prevX = null, prevY = null;
    var dw = draggedItem.w, dh = draggedItem.h;
    var dx0 = candidateX, dy0 = candidateY;
    var dix = draggedItem.x, diy = draggedItem.y;

    for (var iter = 0; iter < this.MAX_CASCADE_ITERATIONS; iter++) {
      if (rx === prevX && ry === prevY) break;
      prevX = rx; prevY = ry;

      // Resolve X with current Y
      for (var i = 0; i < stationary.length; i++) {
        var sX = stationary[i];
        if (rectsOverlap({ x: rx, y: ry, w: dw, h: dh }, sX)) {
          if (dx0 > dix) {
            // Moving right — clamp right edge to left edge of blocker
            rx = Math.min(rx, sX.x - dw - GAP);
          } else {
            // Moving left — clamp left edge to right edge of blocker
            rx = Math.max(rx, sX.x + sX.w + GAP);
          }
        }
      }

      // Resolve Y with resolved X
      for (var j = 0; j < stationary.length; j++) {
        var sY = stationary[j];
        if (rectsOverlap({ x: rx, y: ry, w: dw, h: dh }, sY)) {
          if (dy0 > diy) {
            // Moving down — clamp bottom edge to top edge of blocker
            ry = Math.min(ry, sY.y - dh - GAP);
          } else {
            // Moving up — clamp top edge to bottom edge of blocker
            ry = Math.max(ry, sY.y + sY.h + GAP);
          }
        }
      }
    }

    // Canvas boundary clamp
    rx = Math.max(0, Math.min(CANVAS_W - dw, rx));
    ry = Math.max(0, Math.min(CANVAS_H - dh, ry));

    return { x: rx, y: ry };
  }

  /**
   * Find ALL items that overlap with the given item.
   * @param {Object} item - The item to check
   * @param {Array} allItems - All items to check against
   * @returns {Array<{other: Object, depths: {x: number, y: number}}>}
   */
  findAllOverlaps(item, allItems) {
    var results = [];
    var rectsOverlap = this.rectsOverlap;
    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;
      if (rectsOverlap(item, other)) {
        results.push({
          other: other,
          depths: this._overlapDepths(item, other)
        });
      }
    }
    return results;
  }

  /**
   * Outward spiral search v3: find nearest clear position for an overlapping item.
   *
   * Phase 1 — Fine search: 2px increments up to MAX_SPIRAL_RADIUS_FINE (20px).
   *   Tests 8 directions per step (N, S, E, W, NE, NW, SE, SW).
   *
   * Phase 2 — Coarse search: 0.5×item-dimension steps up to MAX_SPIRAL_COARSE_STEPS (20).
   *   Same 8-direction pattern with larger offsets.
   *
   * @param {Object} item - The overlapping item (with x, y, w, h)
   * @param {Array} allItems - All items to check against
   * @returns {{x: number, y: number}|null} Nearest clear position, or null if stuck
   */
  findNearestClearSpot(item, allItems) {
    var core = this.core;
    var GAP = this.GAP;
    var w = item.w, h = item.h;
    var findAllOverlaps = this.findAllOverlaps;

    // Check if current position is already clear
    if (findAllOverlaps(item, allItems).length === 0) {
      return { x: item.x, y: item.y };
    }

    // Phase 1: Fine search (GAP increments, small radius)
    for (var step = GAP; step <= this.MAX_SPIRAL_RADIUS_FINE; step += GAP) {
      var positions = [
        { x: item.x + step, y: item.y },
        { x: item.x - step, y: item.y },
        { x: item.x, y: item.y + step },
        { x: item.x, y: item.y - step },
        { x: item.x + step, y: item.y + step },
        { x: item.x + step, y: item.y - step },
        { x: item.x - step, y: item.y + step },
        { x: item.x - step, y: item.y - step }
      ];
      for (var p = 0; p < positions.length; p++) {
        var pos = positions[p];
        var ex = Math.max(0, Math.min(core.CANVAS_W - w, pos.x));
        var ey = Math.max(0, Math.min(core.CANVAS_H - h, pos.y));
        if (findAllOverlaps(
          { id: item.id, x: ex, y: ey, w: w, h: h },
          allItems
        ).length === 0) {
          return { x: ex, y: ey };
        }
      }
    }

    // Phase 2: Coarse search (fractional item dimensions, full canvas)
    var stepX = Math.max(GAP, Math.round(item.w * 0.5));
    var stepY = Math.max(GAP, Math.round(item.h * 0.5));

    for (var s = 1; s <= this.MAX_SPIRAL_COARSE_STEPS; s++) {
      var offsetX = stepX * s;
      var offsetY = stepY * s;
      var positions = [
        { x: item.x + offsetX, y: item.y },
        { x: item.x - offsetX, y: item.y },
        { x: item.x, y: item.y + offsetY },
        { x: item.x, y: item.y - offsetY },
        { x: item.x + offsetX, y: item.y + offsetY },
        { x: item.x + offsetX, y: item.y - offsetY },
        { x: item.x - offsetX, y: item.y + offsetY },
        { x: item.x - offsetX, y: item.y - offsetY }
      ];
      for (var p = 0; p < positions.length; p++) {
        var pos = positions[p];
        var ex = Math.max(0, Math.min(core.CANVAS_W - w, pos.x));
        var ey = Math.max(0, Math.min(core.CANVAS_H - h, pos.y));
        if (findAllOverlaps(
          { id: item.id, x: ex, y: ey, w: w, h: h },
          allItems
        ).length === 0) {
          return { x: ex, y: ey };
        }
      }
    }

    return null; // no clear spot found in entire canvas
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
    var rectsOverlap = this.rectsOverlap;
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var a = items[i], b = items[j];
        // Only skip pairs where BOTH items are dragged
        if (excludeSet[a.id] && excludeSet[b.id]) continue;
        if (rectsOverlap(a, b)) return true;
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
    var rectsOverlap = this.rectsOverlap;
    for (var i = 0; i < allItems.length; i++) {
      var o = allItems[i];
      if (o.id === item.id) continue;
      if (rectsOverlap(item, o)) {
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

  /**
   * Compute axis-aligned bounding box of a rotated item.
   * Pure computation — does NOT mutate the item.
   *
   * @param {Object} item - Item with {x, y, w, h, rotation} (rotation in degrees)
   * @returns {{x: number, y: number, w: number, h: number}} The rotated AABB
   */
  getRotatedAABB(item) {
    var cx = item.x + item.w / 2;
    var cy = item.y + item.h / 2;
    var rad = item.rotation * Math.PI / 180;
    var cosA = Math.abs(Math.cos(rad));
    var sinA = Math.abs(Math.sin(rad));
    var rotW = item.w * cosA + item.h * sinA;
    var rotH = item.w * sinA + item.h * cosA;
    return { x: cx - rotW / 2, y: cy - rotH / 2, w: rotW, h: rotH };
  }
}
