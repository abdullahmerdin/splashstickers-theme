/* ===========================================
   CollisionEngine v4 — Continuous, rotation-aware constrained transforms

   Guarantees:
   - Fast pointer movement cannot tunnel through another design.
   - Dragged groups move atomically and keep their internal spacing.
   - Drag, resize, rotation, numeric sizing and drop validation share one engine.
   - Rotated designs use their complete visual AABB.
   - Every accepted position stays inside the canvas and respects the configured gap.
   =========================================== */

class CollisionEngine {
  constructor(core) {
    this.core = core;
    this.GAP = 2;
    this.EPSILON = 0.01;
    this.MAX_SPIRAL_RADIUS_FINE = 40;
    this.MAX_SPIRAL_COARSE_STEPS = 40;
  }

  /**
   * AABB overlap test. Optional gap is the required edge-to-edge distance.
   */
  rectsOverlap(a, b, gap) {
    gap = Math.max(0, Number(gap) || 0);
    return (a.x + this.EPSILON) < (b.x + b.w + gap - this.EPSILON) &&
           (b.x + this.EPSILON) < (a.x + a.w + gap - this.EPSILON) &&
           (a.y + this.EPSILON) < (b.y + b.h + gap - this.EPSILON) &&
           (b.y + this.EPSILON) < (a.y + a.h + gap - this.EPSILON);
  }

  _overlapDepths(a, b) {
    var overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return { x: overlapX, y: overlapY };
  }

  _configuredGap() {
    var stateGap = this.core && this.core.state ? Number(this.core.state.gapSize) : 0;
    if (stateGap > 0 && this.core.utils && typeof this.core.utils.mmToPx === 'function') {
      return Math.max(this.GAP, this.core.utils.mmToPx(stateGap));
    }
    return this.GAP;
  }

  /**
   * Compute the visual collision box, including CSS rotation.
   */
  getCollisionRect(item) {
    return Math.abs(Number(item.rotation) || 0) > this.EPSILON
      ? this.getRotatedAABB(item)
      : { x: item.x, y: item.y, w: item.w, h: item.h };
  }

  itemsOverlap(a, b, gap) {
    return this.rectsOverlap(
      this.getCollisionRect(a),
      this.getCollisionRect(b),
      gap == null ? this._configuredGap() : gap
    );
  }

  _excludedSet(ids) {
    var set = {};
    (ids || []).forEach(function (id) { set[id] = true; });
    return set;
  }

  isInsideCanvas(item) {
    var rect = this.getCollisionRect(item);
    return rect.x >= -this.EPSILON &&
           rect.y >= -this.EPSILON &&
           rect.x + rect.w <= this.core.CANVAS_W + this.EPSILON &&
           rect.y + rect.h <= this.core.CANVAS_H + this.EPSILON;
  }

  /**
   * Check a complete item transform against bounds and all stationary items.
   */
  canPlace(item, allItems, excludeIds) {
    if (!(item.w > 0) || !(item.h > 0) || !this.isInsideCanvas(item)) return false;
    var excluded = this._excludedSet(excludeIds);
    var gap = this._configuredGap();

    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id || excluded[other.id]) continue;
      if (this.itemsOverlap(item, other, gap)) return false;
    }
    return true;
  }

  /**
   * Clamp x/y by the rotated visual bounds, not the unrotated CSS box.
   */
  clampPosition(item, x, y) {
    var candidate = Object.assign({}, item, { x: x, y: y });
    var rect = this.getCollisionRect(candidate);

    if (rect.x < 0) candidate.x -= rect.x;
    if (rect.y < 0) candidate.y -= rect.y;

    rect = this.getCollisionRect(candidate);
    if (rect.x + rect.w > this.core.CANVAS_W) {
      candidate.x -= rect.x + rect.w - this.core.CANVAS_W;
    }
    if (rect.y + rect.h > this.core.CANVAS_H) {
      candidate.y -= rect.y + rect.h - this.core.CANVAS_H;
    }

    return candidate;
  }

  _shortestAngle(target, source) {
    return ((target - source + 540) % 360) - 180;
  }

  _interpolate(from, to, t) {
    return Object.assign({}, to, {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      w: from.w + (to.w - from.w) * t,
      h: from.h + (to.h - from.h) * t,
      rotation: (Number(from.rotation) || 0) +
        this._shortestAngle(Number(to.rotation) || 0, Number(from.rotation) || 0) * t
    });
  }

  _transformSteps(from, to) {
    var distance = Math.hypot(to.x - from.x, to.y - from.y);
    var sizeDelta = Math.max(Math.abs(to.w - from.w), Math.abs(to.h - from.h));
    var rotationDelta = Math.abs(
      this._shortestAngle(Number(to.rotation) || 0, Number(from.rotation) || 0)
    );
    var linearStep = Math.max(1, Math.min(from.w, from.h, to.w, to.h) / 5);
    return Math.max(
      1,
      Math.ceil(distance / linearStep),
      Math.ceil(sizeDelta / linearStep),
      Math.ceil(rotationDelta / 3)
    );
  }

  /**
   * Sweep a move/resize/rotation from the last valid transform to the requested one.
   * Returns the furthest continuously valid transform.
   */
  constrainTransform(from, requested, allItems, excludeIds) {
    var target = this.clampPosition(requested, requested.x, requested.y);
    var steps = this._transformSteps(from, target);
    var last = Object.assign({}, from);
    var lastT = 0;

    for (var step = 1; step <= steps; step++) {
      var t = step / steps;
      var candidate = this._interpolate(from, target, t);
      if (!this.canPlace(candidate, allItems, excludeIds)) {
        var low = lastT;
        var high = t;

        for (var iteration = 0; iteration < 14; iteration++) {
          var middle = (low + high) / 2;
          var boundary = this._interpolate(from, target, middle);
          if (this.canPlace(boundary, allItems, excludeIds)) {
            low = middle;
            last = boundary;
          } else {
            high = middle;
          }
        }
        return last;
      }
      last = candidate;
      lastT = t;
    }

    return target;
  }

  _groupBounds(items) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(function (item) {
      var rect = this.getCollisionRect(item);
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.w);
      maxY = Math.max(maxY, rect.y + rect.h);
    }, this);
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  _groupCanMove(items, dx, dy, allItems, draggedIds) {
    for (var i = 0; i < items.length; i++) {
      var candidate = Object.assign({}, items[i], {
        x: items[i].x + dx,
        y: items[i].y + dy
      });
      if (!this.canPlace(candidate, allItems, draggedIds)) return false;
    }
    return true;
  }

  /**
   * Constrain a selected group as one rigid body.
   */
  constrainGroupDelta(dx, dy, draggedItems, allItems, draggedIds) {
    if (!draggedItems.length) return { dx: 0, dy: 0 };

    var bounds = this._groupBounds(draggedItems);
    var targetX = Math.max(-bounds.minX, Math.min(this.core.CANVAS_W - bounds.maxX, dx));
    var targetY = Math.max(-bounds.minY, Math.min(this.core.CANVAS_H - bounds.maxY, dy));
    var distance = Math.hypot(targetX, targetY);
    var minSize = Math.min.apply(null, draggedItems.map(function (item) {
      return Math.min(item.w, item.h);
    }));
    var steps = Math.max(1, Math.ceil(distance / Math.max(1, minSize / 5)));
    var lastT = 0;

    for (var step = 1; step <= steps; step++) {
      var t = step / steps;
      if (!this._groupCanMove(draggedItems, targetX * t, targetY * t, allItems, draggedIds)) {
        var low = lastT;
        var high = t;
        for (var iteration = 0; iteration < 14; iteration++) {
          var middle = (low + high) / 2;
          if (this._groupCanMove(
            draggedItems,
            targetX * middle,
            targetY * middle,
            allItems,
            draggedIds
          )) {
            low = middle;
          } else {
            high = middle;
          }
        }
        return { dx: targetX * low, dy: targetY * low };
      }
      lastT = t;
    }

    return { dx: targetX, dy: targetY };
  }

  /**
   * Backwards-compatible single-item movement API.
   */
  constrainPosition(candidateX, candidateY, draggedItem, allItems, draggedIds) {
    var delta = this.constrainGroupDelta(
      candidateX - draggedItem.x,
      candidateY - draggedItem.y,
      [draggedItem],
      allItems,
      draggedIds || [draggedItem.id]
    );
    return { x: draggedItem.x + delta.dx, y: draggedItem.y + delta.dy };
  }

  findAllOverlaps(item, allItems) {
    var results = [];
    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;
      if (this.itemsOverlap(item, other)) {
        results.push({
          other: other,
          depths: this._overlapDepths(
            this.getCollisionRect(item),
            this.getCollisionRect(other)
          )
        });
      }
    }
    return results;
  }

  findNearestClearSpot(item, allItems) {
    if (this.canPlace(item, allItems, [item.id])) {
      return { x: item.x, y: item.y };
    }

    var fineStep = Math.max(1, this.GAP);
    for (var radius = fineStep; radius <= this.MAX_SPIRAL_RADIUS_FINE; radius += fineStep) {
      var fine = this._ringPositions(item.x, item.y, radius, radius);
      var found = this._firstClear(item, fine, allItems);
      if (found) return found;
    }

    var stepX = Math.max(this.GAP, Math.round(item.w * 0.4));
    var stepY = Math.max(this.GAP, Math.round(item.h * 0.4));
    for (var step = 1; step <= this.MAX_SPIRAL_COARSE_STEPS; step++) {
      var coarse = this._ringPositions(item.x, item.y, stepX * step, stepY * step);
      var result = this._firstClear(item, coarse, allItems);
      if (result) return result;
    }

    return null;
  }

  _ringPositions(x, y, offsetX, offsetY) {
    return [
      { x: x + offsetX, y: y },
      { x: x - offsetX, y: y },
      { x: x, y: y + offsetY },
      { x: x, y: y - offsetY },
      { x: x + offsetX, y: y + offsetY },
      { x: x + offsetX, y: y - offsetY },
      { x: x - offsetX, y: y + offsetY },
      { x: x - offsetX, y: y - offsetY }
    ];
  }

  _firstClear(item, positions, allItems) {
    for (var i = 0; i < positions.length; i++) {
      var candidate = this.clampPosition(item, positions[i].x, positions[i].y);
      if (this.canPlace(candidate, allItems, [item.id])) {
        return { x: candidate.x, y: candidate.y };
      }
    }
    return null;
  }

  hasAnyOverlap(items, excludeIds) {
    var excluded = this._excludedSet(excludeIds);
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        if (excluded[items[i].id] && excluded[items[j].id]) continue;
        if (this.itemsOverlap(items[i], items[j])) return true;
      }
    }
    return false;
  }

  findOverlap(item, allItems) {
    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;
      if (this.itemsOverlap(item, other)) {
        return {
          overlappingItem: other,
          depths: this._overlapDepths(
            this.getCollisionRect(item),
            this.getCollisionRect(other)
          )
        };
      }
    }
    return null;
  }

  resolveAllOverlaps(items) {
    var anyFailed = false;
    for (var iteration = 0; iteration < 4; iteration++) {
      var resolvedAny = false;
      for (var i = 0; i < items.length; i++) {
        if (!this.findOverlap(items[i], items)) continue;
        var next = this.findNearestClearSpot(items[i], items);
        if (next) {
          items[i].x = next.x;
          items[i].y = next.y;
          resolvedAny = true;
        } else {
          anyFailed = true;
        }
      }
      if (!resolvedAny) break;
    }
    return !anyFailed && !this.hasAnyOverlap(items);
  }

  getRotatedAABB(item) {
    var cx = item.x + item.w / 2;
    var cy = item.y + item.h / 2;
    var rad = (Number(item.rotation) || 0) * Math.PI / 180;
    var cosA = Math.abs(Math.cos(rad));
    var sinA = Math.abs(Math.sin(rad));
    var rotW = item.w * cosA + item.h * sinA;
    var rotH = item.w * sinA + item.h * cosA;
    return { x: cx - rotW / 2, y: cy - rotH / 2, w: rotW, h: rotH };
  }
}
