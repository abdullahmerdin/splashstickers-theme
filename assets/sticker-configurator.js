/* ===========================================
   Utils — Unit conversion, size helpers
   =========================================== */

class Utils {
  constructor(core) {
    this.core = core;
  }

  // CRITICAL: 1mm = CANVAS_W / 600px
  pxToMm(px) {
    return px / this.core.CANVAS_W * 600;
  }

  // CRITICAL: 1mm = CANVAS_W / 600px
  mmToPx(mm) {
    return mm / 600 * this.core.CANVAS_W;
  }

  updateSizeInfo(item) {
    if (!item || !item.el) return;
    var info = item.el.querySelector('.size-info');
    if (info) {
      info.textContent = Math.round(this.pxToMm(item.w)) + 'x' + Math.round(this.pxToMm(item.h)) + 'mm';
    }
  }

  updateSizeInputs() {
    var state = this.core.state;
    var sid = this.core.sid;
    if (state.selectedIds.length === 1) {
      var selItem = this.core.state.items.find(function (i) { return i.id === state.selectedIds[0]; });
      if (selItem) {
        var wInput = this.core.querySelector('#w-input-' + sid);
        var hInput = this.core.querySelector('#h-input-' + sid);
        if (wInput) wInput.value = Math.round(this.pxToMm(selItem.w));
        if (hInput) hInput.value = Math.round(this.pxToMm(selItem.h));
      }
    }
  }

  onSizeInput(axis) {
    var state = this.core.state;
    var sid = this.core.sid;
    var id = state.selectedIds[0];
    var item = state.items.find(function (i) { return i.id === id; });
    if (!item) return;
    var input = this.core.querySelector('#' + axis + '-input-' + sid);
    if (!input) return;
    var val = Math.max(20, this.mmToPx(parseInt(input.value) || 50));
    var target = Object.assign({}, item);
    if (axis === 'w') target.w = val;
    else target.h = val;

    var constrained = this.core.collisionEngine.constrainTransform(
      item,
      target,
      state.items,
      [item.id]
    );
    item.x = constrained.x;
    item.y = constrained.y;
    item.w = constrained.w;
    item.h = constrained.h;
    item.el.style.left = item.x + 'px';
    item.el.style.top = item.y + 'px';
    item.el.style.width = item.w + 'px';
    item.el.style.height = item.h + 'px';
    input.value = Math.round(this.pxToMm(axis === 'w' ? item.w : item.h));
    this.updateSizeInfo(item);
    this.core.priceManager.updatePrice();
  }

  rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }
}

/* ===========================================
   SnapEngine — Snap-to-grid functionality
   =========================================== */

class SnapEngine {
  constructor(core) {
    this.core = core;
  }

  snapVal(v, g) {
    if (!this.core.state.snapEnabled) return v;
    return Math.round(v / g) * g;
  }

  applySnap(items) {
    var g = this.core.state.gridSize || 20;
    items.forEach(function (it) {
      if (!it) return;
      it.x = this.snapVal(it.x, g);
      it.y = this.snapVal(it.y, g);
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    }, this);
  }
}

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

/* ===========================================
   CanvasRenderer — Grid, zoom/pan, renderToCanvas
   =========================================== */

class CanvasRenderer {
  constructor(core) {
    this.core = core;
  }

  drawGrid() {
    var core = this.core;
    var ctx = core.gridCanvas ? core.gridCanvas.getContext('2d') : null;
    if (!ctx) return;
    var dpr = core.state.dpr;
    var w = core.CANVAS_W;
    var h = core.CANVAS_H;

    core.gridCanvas.width = w * dpr;
    core.gridCanvas.height = h * dpr;
    core.gridCanvas.style.width = w + 'px';
    core.gridCanvas.style.height = h + 'px';

    // CRITICAL: DPR-aware setTransform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#E8E8E8';
    ctx.lineWidth = 0.5;

    var gridSize = core.state.gridSize || 20;
    var cols = Math.floor(w / gridSize);
    var rows = Math.floor(h / gridSize);

    ctx.beginPath();
    for (var i = 0; i <= rows; i++) {
      var y = i * gridSize;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    for (var j = 0; j <= cols; j++) {
      var x = j * gridSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
  }

  applyZoom() {
    if (this.core._zoomRaf) return;
    this.core._zoomRaf = true;
    var self = this;
    requestAnimationFrame(function () {
      self.core._zoomRaf = false;
      self._syncZoomTransform();
    });
  }

  _syncZoomTransform() {
    var core = this.core;
    if (!core.canvas) return;
    var zoom = this.clampZoom(core.state.zoom);
    core.state.zoom = zoom;

    if (core.canvasStage) {
      core.canvasStage.style.width = (core.CANVAS_W * zoom) + 'px';
      core.canvasStage.style.height = (core.CANVAS_H * zoom) + 'px';
    }

    core.canvas.style.width = core.CANVAS_W + 'px';
    core.canvas.style.height = core.CANVAS_H + 'px';
    core.canvas.style.transform = 'scale(' + zoom + ')';
    core.canvas.style.transformOrigin = '0 0';
    var zoomDisplay = core.querySelector('#zoom-display-' + core.sid);
    if (zoomDisplay) {
      zoomDisplay.textContent = Math.round(zoom * 100) + '%';
    }
  }

  clampZoom(value) {
    return Math.max(0.35, Math.min(4, Number(value) || 1));
  }

  clampPan() {
    var core = this.core;
    if (!core.wrap) return;
    var maxX = Math.max(0, core.wrap.scrollWidth - core.wrap.clientWidth);
    var maxY = Math.max(0, core.wrap.scrollHeight - core.wrap.clientHeight);
    core.wrap.scrollLeft = Math.max(0, Math.min(maxX, core.wrap.scrollLeft));
    core.wrap.scrollTop = Math.max(0, Math.min(maxY, core.wrap.scrollTop));
    core.state.panX = core.wrap.scrollLeft;
    core.state.panY = core.wrap.scrollTop;
  }

  zoomAt(value, clientX, clientY) {
    var core = this.core;
    if (!core.wrap) return;

    var oldZoom = core.state.zoom || 1;
    var newZoom = this.clampZoom(value);
    if (Math.abs(newZoom - oldZoom) < 0.001) return;

    var wrapRect = core.wrap.getBoundingClientRect();
    var anchorX = Number.isFinite(clientX) ? clientX - wrapRect.left : core.wrap.clientWidth / 2;
    var anchorY = Number.isFinite(clientY) ? clientY - wrapRect.top : core.wrap.clientHeight / 2;
    var oldStageLeft = core.canvasStage ? core.canvasStage.offsetLeft : 0;
    var oldStageTop = core.canvasStage ? core.canvasStage.offsetTop : 0;
    var worldX = (core.wrap.scrollLeft + anchorX - oldStageLeft) / oldZoom;
    var worldY = (core.wrap.scrollTop + anchorY - oldStageTop) / oldZoom;

    core.state.zoom = newZoom;
    this._syncZoomTransform();
    var newStageLeft = core.canvasStage ? core.canvasStage.offsetLeft : 0;
    var newStageTop = core.canvasStage ? core.canvasStage.offsetTop : 0;
    core.wrap.scrollLeft = newStageLeft + worldX * newZoom - anchorX;
    core.wrap.scrollTop = newStageTop + worldY * newZoom - anchorY;
    this.clampPan();
  }

  zoomToFit() {
    var core = this.core;
    if (!core.canvas || !core.wrap) return;
    var wrapW = core.wrap ? core.wrap.clientWidth : core.CANVAS_W;
    var wrapH = core.wrap ? (core.wrap.clientHeight || core.CANVAS_H) : core.CANVAS_H;
    var zoomX = Math.max(1, wrapW - 44) / core.CANVAS_W;
    var zoomY = Math.max(1, wrapH - 44) / core.CANVAS_H;
    core.state.zoom = this.clampZoom(Math.min(zoomX, zoomY, 1));
    this._syncZoomTransform();

    requestAnimationFrame(function () {
      core.wrap.scrollLeft = Math.max(0, (core.wrap.scrollWidth - core.wrap.clientWidth) / 2);
      core.wrap.scrollTop = Math.max(0, (core.wrap.scrollHeight - core.wrap.clientHeight) / 2);
      core.state.panX = core.wrap.scrollLeft;
      core.state.panY = core.wrap.scrollTop;
    });
  }

  getCanvasXY(e) {
    var core = this.core;
    if (!core.canvas) return { x: 0, y: 0 };
    var rect = core.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / core.state.zoom,
      y: (e.clientY - rect.top) / core.state.zoom
    };
  }

  renderToCanvas() {
    var core = this.core;
    var c = document.createElement('canvas');
    c.width = core.CANVAS_W;
    c.height = core.CANVAS_H;
    var ctx = c.getContext('2d');
    if (!ctx) return null;

    // Draw grid background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, core.CANVAS_W, core.CANVAS_H);

    // Draw items
    core.state.items.forEach(function (it) {
      ctx.save();
      ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
      ctx.scale(it.scaleX || 1, it.scaleY || 1);
      if (it.rotation) ctx.rotate(it.rotation * Math.PI / 180);
      ctx.translate(-it.w / 2, -it.h / 2);

      if (it.text && it.bgColor) {
        ctx.fillStyle = it.bgColor;
        ctx.fillRect(0, 0, it.w, it.h);
      }

      if (it.text) {
        ctx.fillStyle = it.color || '#2D3436';
        ctx.font = (it.fontWeight || '') + ' ' + (it.fontStyle || '') + ' ' + (it.fontSize || 16) + 'px sans-serif';
        ctx.textAlign = it.textAlign || 'center';
        ctx.textBaseline = 'middle';
        var tx = it.w / 2;
        if (it.textAlign === 'left') tx = 8;
        else if (it.textAlign === 'right') tx = it.w - 8;
        ctx.fillText(it.text, tx, it.h / 2);
      } else if (it.el && it.el.querySelector('img')) {
        var img = it.el.querySelector('img');
        ctx.drawImage(img, 0, 0, it.w, it.h);
      }

      ctx.restore();
    });

    return c;
  }
}

/* ===========================================
   ItemManager — Item CRUD, factory, slot finder
   =========================================== */

class ItemManager {
  constructor(core) {
    this.core = core;
  }

  addImageItem(src, silent) {
    var core = this.core;
    if (!core.canvas) return null;

    var id = core.state.nextId++;
    var el = this._createItemElement(id);

    var img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    img.alt = 'Sticker design';
    el.appendChild(img);

    core.canvas.appendChild(el);

    var item = this.addItemHelpers(el, id);
    item.src = src;

    // Calculate default size proportional to canvas
    var defaultW = Math.round(core.CANVAS_W * 0.15);
    var defaultH = Math.round(defaultW * 0.75);
    item.w = defaultW;
    item.h = defaultH;
    el.style.width = defaultW + 'px';
    el.style.height = defaultH + 'px';

    // Find slot
    var slot = this.findNextSlot(defaultW, defaultH);
    item.x = slot.x;
    item.y = slot.y;

    // V3: Collision check before DOM render
    var clearSpot = core.collisionEngine.findNearestClearSpot(item, core.state.items);
    if (clearSpot) {
      item.x = clearSpot.x;
      item.y = clearSpot.y;
    }

    el.style.left = item.x + 'px';
    el.style.top = item.y + 'px';

    if (!silent) {
      core.state.selectedIds = [id];
      core.historyManager.saveState();
      core.growCanvas();
      core.selectionManager.updateSelection();
      core.priceManager.updateCount();
      core.priceManager.updatePrice();
      core.dispatchUpdateEvent();
    }

    // Hide hint
    if (core.hintEl) core.hintEl.style.display = 'none';

    return item;
  }

  addTextItem(text, fontSize, silent, color, bgColor, fontWeight, fontStyle, textAlign) {
    var core = this.core;
    if (!core.canvas) return null;

    var id = core.state.nextId++;
    var el = this._createItemElement(id);

    var content = document.createElement('div');
    content.className = 'text-content';
    content.textContent = text;
    content.style.fontSize = (fontSize || 16) + 'px';
    content.style.color = color || '#2D3436';
    content.style.backgroundColor = bgColor || '';
    content.style.fontWeight = fontWeight || '';
    content.style.fontStyle = fontStyle || '';
    content.style.textAlign = textAlign || 'center';
    el.appendChild(content);

    // WCAG: role="img" and aria-label
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Text: ' + text);

    core.canvas.appendChild(el);

    var item = this.addItemHelpers(el, id);
    item.text = text;
    item.fontSize = fontSize || 16;
    item.color = color || '#2D3436';
    item.bgColor = bgColor || '';
    item.fontWeight = fontWeight || '';
    item.fontStyle = fontStyle || '';
    item.textAlign = textAlign || 'center';

    // Calculate size based on text
    var fs = fontSize || 16;
    item.w = Math.round(text.length * fs * 0.6 + 20);
    item.h = Math.round(fs * 1.8 + 16);
    item.w = Math.max(60, Math.min(core.CANVAS_W * 0.4, item.w));
    item.h = Math.max(40, Math.min(core.CANVAS_H * 0.15, item.h));
    el.style.width = item.w + 'px';
    el.style.height = item.h + 'px';

    // Find slot
    var slot = this.findNextSlot(item.w, item.h);
    item.x = slot.x;
    item.y = slot.y;

    // V3: Collision check before DOM render
    var clearSpot = core.collisionEngine.findNearestClearSpot(item, core.state.items);
    if (clearSpot) {
      item.x = clearSpot.x;
      item.y = clearSpot.y;
    }

    el.style.left = item.x + 'px';
    el.style.top = item.y + 'px';

    if (!silent) {
      core.state.selectedIds = [id];
      core.historyManager.saveState();
      core.growCanvas();
      core.selectionManager.updateSelection();
      core.priceManager.updateCount();
      core.priceManager.updatePrice();
      core.dispatchUpdateEvent();
    }

    // Hide hint
    if (core.hintEl) core.hintEl.style.display = 'none';

    return item;
  }

  _createItemElement(id) {
    var el = document.createElement('div');
    el.className = 'canvas-item';
    el.dataset.itemId = id;

    // Add resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(function (h) {
      var handle = document.createElement('div');
      handle.className = 'resize-handle ' + h;
      handle.dataset.handle = h;
      el.appendChild(handle);
    });

    // Rotation handle
    var rot = document.createElement('div');
    rot.className = 'rot-handle';
    el.appendChild(rot);

    // Size info
    var info = document.createElement('div');
    info.className = 'size-info';
    el.appendChild(info);

    // WCAG: role="img" and aria-label
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Sticker design item');

    return el;
  }

  addItemHelpers(el, id) {
    var item = {
      id: id,
      el: el,
      x: 0, y: 0, w: 50, h: 50,
      rotation: 0,
      scaleX: 1, scaleY: 1,
      text: null,
      fontSize: 16,
      color: '#2D3436',
      bgColor: '',
      fontWeight: '',
      fontStyle: '',
      textAlign: 'center',
      locked: false,
      src: null
    };
    this.core.state.items.push(item);
    return item;
  }

  finishItem(el, id, w, h) {
    var item = this.core.state.items.find(function (i) { return i.id === id; });
    if (!item) return;
    item.w = w;
    item.h = h;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    this.core.growCanvas();
  }

  findNextSlot(w, h) {
    var CANVAS_W = this.core.CANVAS_W;
    var items = this.core.state.items;
    var cols = Math.floor(CANVAS_W / (w + 20));
    if (cols < 1) cols = 1;
    var gap = 10;

    for (var row = 0; row < 50; row++) {
      for (var col = 0; col < cols; col++) {
        var x = col * (w + gap) + gap;
        var y = row * (h + gap) + gap;
        var fits = true;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (x < it.x + it.w + 5 && x + w + 5 > it.x &&
              y < it.y + it.h + 5 && y + h + 5 > it.y) {
            fits = false;
            break;
          }
        }
        if (fits) return { x: x, y: y };
      }
    }
    return { x: gap, y: this.core.CANVAS_H + gap };
  }

  deleteSelected() {
    var core = this.core;
    var ids = core.state.selectedIds;
    if (!ids.length) return;
    core.historyManager.saveState();
    ids.forEach(function (id) {
      var idx = -1;
      for (var i = 0; i < core.state.items.length; i++) {
        if (core.state.items[i].id === id) { idx = i; break; }
      }
      if (idx > -1) {
        core.state.items[idx].el.remove();
        core.state.items.splice(idx, 1);
      }
    });
    core.state.selectedIds = [];
    core.selectionManager.updateSelection();
    core.priceManager.updateCount();
    core.priceManager.updatePrice();
    core.growCanvas();
    core.dispatchUpdateEvent();

    // Show hint if canvas empty
    if (core.state.items.length === 0 && core.hintEl) {
      core.hintEl.style.display = '';
    }
  }

  duplicateSelected() {
    var core = this.core;
    var sel = core.selectionManager.getSelected();
    if (!sel.length) return;
    core.historyManager.saveState();
    sel.forEach(function (it) {
      if (it.text) {
        var dup = core.itemManager.addTextItem(
          it.text, it.fontSize, true,
          it.color, it.bgColor, it.fontWeight, it.fontStyle, it.textAlign
        );
        if (dup) {
          dup.x = it.x + 20;
          dup.y = it.y + 20;
          dup.w = it.w;
          dup.h = it.h;
          dup.rotation = it.rotation || 0;
          dup.scaleX = it.scaleX || 1;
          dup.scaleY = it.scaleY || 1;

          // V3: Collision check BEFORE DOM render (no flash)
          var clearSpot = core.collisionEngine.findNearestClearSpot(dup, core.state.items);
          if (clearSpot) {
            dup.x = clearSpot.x;
            dup.y = clearSpot.y;
          }

          dup.el.style.left = dup.x + 'px';
          dup.el.style.top = dup.y + 'px';
          dup.el.style.width = dup.w + 'px';
          dup.el.style.height = dup.h + 'px';
          core.applyTransform(dup);
        }
      } else if (it.src) {
        var img = new Image();
        img.onload = function () {
          var dup = core.itemManager.addImageItem(it.src, true);
          if (dup) {
            dup.x = it.x + 20;
            dup.y = it.y + 20;
            dup.w = it.w;
            dup.h = it.h;
            dup.rotation = it.rotation || 0;
            dup.scaleX = it.scaleX || 1;
            dup.scaleY = it.scaleY || 1;

            // V3: Collision check BEFORE DOM render (no flash)
            var clearSpot = core.collisionEngine.findNearestClearSpot(dup, core.state.items);
            if (clearSpot) {
              dup.x = clearSpot.x;
              dup.y = clearSpot.y;
            }

            dup.el.style.left = dup.x + 'px';
            dup.el.style.top = dup.y + 'px';
            dup.el.style.width = dup.w + 'px';
            dup.el.style.height = dup.h + 'px';
            if (dup.el.querySelector('img')) {
              dup.el.querySelector('img').style.width = dup.w + 'px';
              dup.el.querySelector('img').style.height = dup.h + 'px';
            }
            core.applyTransform(dup);

            core.historyManager.saveState();
            core.growCanvas();
          }
        };
        img.src = it.src;
      }
    });
    core.historyManager.saveState();
    core.growCanvas();
    core.dispatchUpdateEvent();
  }

  flipH() {
    var sel = this.core.selectionManager.getSelected();
    sel.forEach(function (it) {
      it.scaleX = (it.scaleX || 1) * -1;
      this.core.applyTransform(it);
    }, this);
    this.core.historyManager.saveState();
  }

  flipV() {
    var sel = this.core.selectionManager.getSelected();
    sel.forEach(function (it) {
      it.scaleY = (it.scaleY || 1) * -1;
      this.core.applyTransform(it);
    }, this);
    this.core.historyManager.saveState();
  }

  lockSelected() {
    var sel = this.core.selectionManager.getSelected();
    if (!sel.length) return;
    var allLocked = sel.every(function (it) { return it.locked; });
    sel.forEach(function (it) {
      it.locked = !allLocked;
      it.el.style.opacity = it.locked ? '0.6' : '1';
      it.el.style.cursor = it.locked ? 'default' : 'grab';
    });
    this.core.selectionManager.updateSelection();
  }
}

/* ===========================================
   SelectionManager — Multi-select, guides, toolbar state
   =========================================== */

class SelectionManager {
  constructor(core) {
    this.core = core;
  }

  toggleSelect(id, add) {
    var state = this.core.state;
    var idx = state.selectedIds.indexOf(id);
    if (add) {
      if (idx === -1) state.selectedIds.push(id);
    } else {
      if (idx > -1) state.selectedIds.splice(idx, 1);
    }
    this.updateSelection();
  }

  selectAllInRect(x1, y1, x2, y2) {
    var state = this.core.state;
    var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    state.selectedIds = [];
    state.items.forEach(function (it) {
      if (it.x < maxX && it.x + it.w > minX &&
          it.y < maxY && it.y + it.h > minY) {
        state.selectedIds.push(it.id);
      }
    });
    this.updateSelection();
  }

  updateSelection() {
    var core = this.core;
    var ids = core.state.selectedIds;
    core.state.items.forEach(function (it) {
      it.el.classList.toggle('selected', ids.indexOf(it.id) > -1);
    });

    // Update toolbar buttons
    var selCount = ids.length;
    var btnIds = [
      'del-btn', 'dup-btn', 'flip-h', 'flip-v',
      'align-left', 'align-h', 'align-right',
      'align-top', 'align-v', 'align-bot'
    ];
    btnIds.forEach(function (id) {
      var btn = core.cache[id];
      if (btn) btn.disabled = selCount === 0;
    });

    // Lock button
    var lockBtn = core.cache['lock-btn'];
    if (lockBtn) {
      lockBtn.disabled = selCount === 0;
      if (selCount === 1) {
        var item = core.state.items.find(function (i) { return i.id === ids[0]; });
        lockBtn.classList.toggle('active', item && item.locked);
      } else {
        lockBtn.classList.remove('active');
      }
    }

    // Size inputs visibility
    var sizeInputs = core.cache['size-inputs'];
    if (sizeInputs) {
      sizeInputs.style.visibility = selCount > 0 ? 'visible' : 'hidden';
    }

    // Update size inputs for single selection
    if (selCount === 1) {
      var selItem = core.state.items.find(function (i) { return i.id === ids[0]; });
      if (selItem) {
        var wInput = core.cache['w-input'];
        var hInput = core.cache['h-input'];
        if (wInput) wInput.value = Math.round(core.utils.pxToMm(selItem.w));
        if (hInput) hInput.value = Math.round(core.utils.pxToMm(selItem.h));
      }
    }

    // Size info on items
    core.state.items.forEach(function (it) {
      var info = it.el.querySelector('.size-info');
      if (info) {
        info.textContent = Math.round(core.utils.pxToMm(it.w)) + 'x' + Math.round(core.utils.pxToMm(it.h)) + 'mm';
      }
    });

    core.priceManager.updateCount();
    core.dispatchSelectionEvent();
  }

  getSelected() {
    var ids = this.core.state.selectedIds;
    return this.core.state.items.filter(function (it) { return ids.indexOf(it.id) > -1; });
  }

  updateGuides(item, items) {
    var core = this.core;
    if (!item || !core.guideH || !core.guideV) return;
    var threshold = 5;
    var guideHShown = false;
    var guideVShown = false;

    items.forEach(function (other) {
      if (other.id === item.id) return;

      // Horizontal guides (top/bottom/center)
      if (Math.abs(item.y - other.y) < threshold) {
        if (core.guideH) {
          core.guideH.style.top = other.y + 'px';
          core.guideH.style.display = 'block';
          core.guideH.style.backgroundColor = '#00CEC9';
        }
        item.y = other.y;
        guideHShown = true;
      } else if (Math.abs(item.y + item.h - other.y - other.h) < threshold) {
        if (core.guideH) {
          core.guideH.style.top = (other.y + other.h - item.h) + 'px';
          core.guideH.style.display = 'block';
          core.guideH.style.backgroundColor = '#00CEC9';
        }
        item.y = other.y + other.h - item.h;
        guideHShown = true;
      } else if (Math.abs(item.y + item.h / 2 - other.y - other.h / 2) < threshold) {
        if (core.guideH) {
          core.guideH.style.top = (other.y + other.h / 2 - item.h / 2) + 'px';
          core.guideH.style.display = 'block';
          core.guideH.style.backgroundColor = '#6C5CE7';
        }
        item.y = other.y + other.h / 2 - item.h / 2;
        guideHShown = true;
      }

      // Vertical guides (left/right/center)
      if (Math.abs(item.x - other.x) < threshold) {
        if (core.guideV) {
          core.guideV.style.left = other.x + 'px';
          core.guideV.style.display = 'block';
          core.guideV.style.backgroundColor = '#00CEC9';
        }
        item.x = other.x;
        guideVShown = true;
      } else if (Math.abs(item.x + item.w - other.x - other.w) < threshold) {
        if (core.guideV) {
          core.guideV.style.left = (other.x + other.w - item.w) + 'px';
          core.guideV.style.display = 'block';
          core.guideV.style.backgroundColor = '#00CEC9';
        }
        item.x = other.x + other.w - item.w;
        guideVShown = true;
      } else if (Math.abs(item.x + item.w / 2 - other.x - other.w / 2) < threshold) {
        if (core.guideV) {
          core.guideV.style.left = (other.x + other.w / 2 - item.w / 2) + 'px';
          core.guideV.style.display = 'block';
          core.guideV.style.backgroundColor = '#6C5CE7';
        }
        item.x = other.x + other.w / 2 - item.w / 2;
        guideVShown = true;
      }
    });

    if (!guideHShown && core.guideH) core.guideH.style.display = 'none';
    if (!guideVShown && core.guideV) core.guideV.style.display = 'none';
  }
}

/* ===========================================
   HistoryManager — Undo/redo with 50-step stack
   =========================================== */

class HistoryManager {
  constructor(core) {
    this.core = core;
  }

  saveState() {
    var state = this.core.state;
    var snapshot = state.items.map(function (it) {
      return {
        id: it.id,
        x: it.x, y: it.y, w: it.w, h: it.h,
        rotation: it.rotation || 0,
        scaleX: it.scaleX || 1,
        scaleY: it.scaleY || 1,
        text: it.text || null,
        fontSize: it.fontSize || 16,
        color: it.color || '#2D3436',
        bgColor: it.bgColor || '',
        fontWeight: it.fontWeight || '',
        fontStyle: it.fontStyle || '',
        textAlign: it.textAlign || 'center',
        locked: it.locked || false,
        src: it.src || null,
        isText: !!it.text
      };
    });

    if (state.historyIdx < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIdx + 1);
    }
    state.history.push(snapshot);
    if (state.history.length > 50) {
      state.history.shift();
    }
    state.historyIdx = state.history.length - 1;
    this.updateHistoryButtons();
  }

  undo() {
    var state = this.core.state;
    if (state.historyIdx <= 0) return;
    state.historyIdx--;
    this.restoreState(state.history[state.historyIdx]);
    this.core.dispatchUpdateEvent();
  }

  redo() {
    var state = this.core.state;
    if (state.historyIdx >= state.history.length - 1) return;
    state.historyIdx++;
    this.restoreState(state.history[state.historyIdx]);
    this.core.dispatchUpdateEvent();
  }

  restoreState(snapshot) {
    var core = this.core;
    // Remove existing items
    core.state.items.slice().forEach(function (it) { it.el.remove(); });
    core.state.items.length = 0;
    core.state.selectedIds = [];

    snapshot.forEach(function (data) {
      if (data.isText) {
        core.itemManager.addTextItem(
          data.text, data.fontSize || 16, true,
          data.color || '#2D3436', data.bgColor || '',
          data.fontWeight || '', data.fontStyle || '',
          data.textAlign || 'center'
        );
        var item = core.state.items[core.state.items.length - 1];
        if (item) {
          item.x = data.x; item.y = data.y;
          item.w = data.w; item.h = data.h;
          item.rotation = data.rotation || 0;
          item.scaleX = data.scaleX || 1;
          item.scaleY = data.scaleY || 1;
          item.locked = data.locked || false;
          item.el.style.left = item.x + 'px';
          item.el.style.top = item.y + 'px';
          item.el.style.width = item.w + 'px';
          item.el.style.height = item.h + 'px';
          if (item.locked) {
            item.el.style.opacity = '0.6';
            item.el.style.cursor = 'default';
          }
          core.applyTransform(item);
        }
      } else if (data.src) {
        var img = new Image();
        img.onload = function () {
          var item = core.itemManager.addImageItem(data.src, true);
          if (item) {
            item.x = data.x; item.y = data.y;
            item.w = data.w; item.h = data.h;
            item.rotation = data.rotation || 0;
            item.scaleX = data.scaleX || 1;
            item.scaleY = data.scaleY || 1;
            item.locked = data.locked || false;
            item.el.style.left = item.x + 'px';
            item.el.style.top = item.y + 'px';
            item.el.style.width = item.w + 'px';
            item.el.style.height = item.h + 'px';
            if (item.el.querySelector('img')) {
              item.el.querySelector('img').style.width = item.w + 'px';
              item.el.querySelector('img').style.height = item.h + 'px';
            }
            if (item.locked) {
              item.el.style.opacity = '0.6';
              item.el.style.cursor = 'default';
            }
            core.applyTransform(item);
          }
        };
        img.src = data.src;
      }
    });

    core.growCanvas();
    core.selectionManager.updateSelection();
    this.core.priceManager.updateCount();
    this.core.priceManager.updatePrice();
  }

  updateHistoryButtons() {
    var state = this.core.state;
    if (this.core.undoBtn) this.core.undoBtn.disabled = state.historyIdx <= 0;
    if (this.core.redoBtn) this.core.redoBtn.disabled = state.historyIdx >= state.history.length - 1;
  }
}

/* ===========================================
   AlignmentEngine — Align, distribute, auto-arrange
   =========================================== */

class AlignmentEngine {
  constructor(core) {
    this.core = core;
  }

  onAlignClick(dir) {
    var core = this.core;
    var sel = core.selectionManager.getSelected();
    if (sel.length < 1) return;
    core.historyManager.saveState();

    if (dir === 'left') {
      var minX = Math.min.apply(null, sel.map(function (it) { return it.x; }));
      sel.forEach(function (it) { it.x = minX; });
    } else if (dir === 'right') {
      var maxX = Math.max.apply(null, sel.map(function (it) { return it.x + it.w; }));
      sel.forEach(function (it) { it.x = maxX - it.w; });
    } else if (dir === 'h') {
      var cx = 0;
      sel.forEach(function (it) { cx += it.x + it.w / 2; });
      cx /= sel.length;
      sel.forEach(function (it) { it.x = cx - it.w / 2; });
    } else if (dir === 'top') {
      var minY = Math.min.apply(null, sel.map(function (it) { return it.y; }));
      sel.forEach(function (it) { it.y = minY; });
    } else if (dir === 'bot') {
      var maxY = Math.max.apply(null, sel.map(function (it) { return it.y + it.h; }));
      sel.forEach(function (it) { it.y = maxY - it.h; });
    } else if (dir === 'v') {
      var cy = 0;
      sel.forEach(function (it) { cy += it.y + it.h / 2; });
      cy /= sel.length;
      sel.forEach(function (it) { it.y = cy - it.h / 2; });
    }

    // Check for overlaps created by alignment
    var allOverlapsResolved = core.collisionEngine.resolveAllOverlaps(core.state.items);
    if (!allOverlapsResolved && core.debug) {
      console.warn('Alignment created unresolvable overlap');
    }
    // Re-render positions for items that were nudged
    core.state.items.forEach(function (it) {
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    });

    core.historyManager.saveState();
    core.growCanvas();
  }

  onAutoArrange() {
    var core = this.core;
    if (!core.state.items.length) return;
    core.historyManager.saveState();
    var items = core.state.items.slice();
    // Sort by area descending (largest first)
    items.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    var cols = Math.floor(core.CANVAS_W / (items[0].w + 10));
    if (cols < 1) cols = 1;
    var gapPx = core.state.gapSize / 600 * core.CANVAS_W;
    var x = gapPx;
    var y = gapPx;
    var rowH = 0;
    var col = 0;
    items.forEach(function (it) {
      if (col >= cols) {
        y += rowH + gapPx;
        x = gapPx;
        col = 0;
        rowH = 0;
      }
      it.x = x;
      it.y = y;
      x += it.w + gapPx;
      col++;
      if (it.h > rowH) rowH = it.h;
    });
    core.collisionEngine.resolveAllOverlaps(core.state.items);
    // Re-render positions for nudged items
    core.state.items.forEach(function (it) {
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    });
    core.historyManager.saveState();
    core.growCanvas();
    core.dispatchUpdateEvent();
  }

  distributeHorizontal() {
    var core = this.core;
    var sel = core.selectionManager.getSelected();
    if (sel.length < 3) return;
    core.historyManager.saveState();

    // Sort by x position
    sel.sort(function (a, b) { return a.x - b.x; });

    var first = sel[0];
    var last = sel[sel.length - 1];
    var totalWidth = 0;
    for (var i = 0; i < sel.length; i++) {
      totalWidth += sel[i].w;
    }
    var gap = (last.x + last.w - first.x - totalWidth) / (sel.length - 1);

    var curX = first.x;
    for (var j = 0; j < sel.length; j++) {
      sel[j].x = curX;
      curX += sel[j].w + gap;
    }

    core.collisionEngine.resolveAllOverlaps(core.state.items);
    // Re-render positions for nudged items
    core.state.items.forEach(function (it) {
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    });

    this.core.historyManager.saveState();
    this.core.growCanvas();
  }

  distributeVertical() {
    var core = this.core;
    var sel = core.selectionManager.getSelected();
    if (sel.length < 3) return;
    core.historyManager.saveState();

    // Sort by y position
    sel.sort(function (a, b) { return a.y - b.y; });

    var first = sel[0];
    var last = sel[sel.length - 1];
    var totalHeight = 0;
    for (var i = 0; i < sel.length; i++) {
      totalHeight += sel[i].h;
    }
    var gap = (last.y + last.h - first.y - totalHeight) / (sel.length - 1);

    var curY = first.y;
    for (var j = 0; j < sel.length; j++) {
      sel[j].y = curY;
      curY += sel[j].h + gap;
    }

    core.collisionEngine.resolveAllOverlaps(core.state.items);
    // Re-render positions for nudged items
    core.state.items.forEach(function (it) {
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    });

    this.core.historyManager.saveState();
    this.core.growCanvas();
  }
}

/* ===========================================
   MobileHandler — Auto-detect mobile, toggle mode
   =========================================== */

class MobileHandler {
  constructor(core) {
    this.core = core;
  }

  autoDetectMobile() {
    var core = this.core;
    core.state.mobileOverride = null;
    var isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1023px)').matches;
    this.setMobileMode(isMobile);
  }

  syncToViewport() {
    var core = this.core;
    if (core.state.mobileOverride !== null) return;
    var isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1023px)').matches;
    if (core.state.mobile === isMobile) return;
    this.setMobileMode(isMobile);
  }

  setMobileMode(enabled) {
    var core = this.core;
    core.state.mobile = Boolean(enabled);
    core.classList.toggle('mobile-mode', core.state.mobile);

    if (core.mobileBtn) {
      core.mobileBtn.setAttribute('aria-pressed', String(core.state.mobile));
      core.mobileBtn.title = core.state.mobile ? 'Switch to desktop controls' : 'Switch to mobile controls';
      core.mobileBtn.innerHTML = core.state.mobile
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
    }

    setTimeout(function () { core.canvasRenderer.zoomToFit(); }, 100);
  }

  onMobileToggle() {
    var core = this.core;
    core.state.mobileOverride = !core.state.mobile;
    this.setMobileMode(core.state.mobileOverride);
  }
}

/* ===========================================
   ModalManager — All custom modals, focus trapping
   =========================================== */

class ModalManager {
  constructor(core) {
    this.core = core;
  }

  showAddDesignModal() {
    var core = this.core;
    core.state.modalFile = null;
    var modalW = core.querySelector('#modal-w-' + core.sid);
    var modalH = core.querySelector('#modal-h-' + core.sid);
    var modalQty = core.querySelector('#modal-qty-' + core.sid);
    var modalAddBtn = core.querySelector('#modal-add-' + core.sid);
    var modalFname = core.querySelector('#modal-fname-' + core.sid);
    var modalZone = core.querySelector('#modal-zone-' + core.sid);
    if (modalW) modalW.value = 50;
    if (modalH) modalH.value = 50;
    if (modalQty) modalQty.value = 3;
    if (modalAddBtn) modalAddBtn.disabled = true;
    if (modalFname) { modalFname.style.display = 'none'; }
    if (modalZone) {
      var textEl = modalZone.querySelector('.cfg-modal-text');
      var iconEl = modalZone.querySelector('.cfg-modal-icon');
      if (textEl) textEl.textContent = 'Choose a file or drop it here';
      if (iconEl) {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
      }
    }
    this.openModal(core.modalEl);
    if (core.fileInput) core.fileInput.value = '';
    this.trapFocus(core.modalEl);
  }

  openModal(modal) {
    if (!modal) return;
    if (typeof modal.showModal === 'function') {
      if (!modal.open) modal.showModal();
    } else {
      modal.style.display = 'flex';
    }
  }

  closeModal(modal) {
    if (!modal) return;
    if (typeof modal.close === 'function') {
      if (modal.open) modal.close();
    } else {
      modal.style.display = 'none';
    }
  }

  showEditTextModal(item, callback) {
    var curText = item.text || '';
    var curSize = item.fontSize || 16;
    var curColor = item.color || '#2D3436';
    var curBg = item.bgColor || '#ffffff';
    var curWeight = item.fontWeight || '';
    var curStyle = item.fontStyle || '';
    var curAlign = item.textAlign || 'center';

    // SECURITY FIX (V08): Use document.createElement + textContent instead of innerHTML
    var modal = this.createModal('');

    var box = document.createElement('div');
    box.className = 'cfg-modal-box';

    var titleRow = document.createElement('div');
    titleRow.className = 'cfg-modal-title-row';

    var title = document.createElement('h3');
    title.className = 'cfg-modal-title';
    title.textContent = 'Edit Text';
    titleRow.appendChild(title);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cfg-modal-close';
    closeBtn.dataset.action = 'close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7';
    titleRow.appendChild(closeBtn);
    box.appendChild(titleRow);

    var textarea = document.createElement('textarea');
    textarea.className = 'cfg-et-text';
    textarea.dataset.field = 'text';
    textarea.value = curText;
    box.appendChild(textarea);

    var row1 = document.createElement('div');
    row1.className = 'cfg-et-row';

    // SIZE field
    var sizeField = this._createField('SIZE');
    var sizeInput = document.createElement('input');
    sizeInput.className = 'cfg-et-input';
    sizeInput.dataset.field = 'size';
    sizeInput.type = 'number';
    sizeInput.value = curSize;
    sizeInput.min = 8;
    sizeInput.max = 120;
    sizeField.appendChild(sizeInput);
    row1.appendChild(sizeField);

    // COLOR field
    var colorField = this._createField('COLOR');
    var colorInput = document.createElement('input');
    colorInput.className = 'cfg-et-input cfg-et-color';
    colorInput.dataset.field = 'color';
    colorInput.type = 'color';
    colorInput.value = curColor;
    colorField.appendChild(colorInput);
    row1.appendChild(colorField);

    // BG field
    var bgField = this._createField('BG');
    var bgInput = document.createElement('input');
    bgInput.className = 'cfg-et-input cfg-et-color';
    bgInput.dataset.field = 'bg';
    bgInput.type = 'color';
    bgInput.value = curBg;
    bgField.appendChild(bgInput);
    row1.appendChild(bgField);

    box.appendChild(row1);

    // Style toolbar
    var etToolbar = document.createElement('div');
    etToolbar.className = 'cfg-et-toolbar';

    var boldBtn = document.createElement('button');
    boldBtn.className = 'cfg-et-style-btn' + (curWeight === 'bold' ? ' active' : '');
    boldBtn.dataset.style = 'bold';
    boldBtn.setAttribute('aria-label', 'Bold');
    boldBtn.textContent = 'B';
    etToolbar.appendChild(boldBtn);

    var italicBtn = document.createElement('button');
    italicBtn.className = 'cfg-et-style-btn' + (curStyle === 'italic' ? ' active' : '');
    italicBtn.dataset.style = 'italic';
    italicBtn.setAttribute('aria-label', 'Italic');
    italicBtn.textContent = 'I';
    etToolbar.appendChild(italicBtn);

    var div = document.createElement('span');
    div.className = 'cfg-et-divider';
    etToolbar.appendChild(div);

    // Align buttons
    var aligns = ['left', 'center', 'right'];
    ['Align left', 'Align center', 'Align right'].forEach(function (label, i) {
      var alignBtn = document.createElement('button');
      alignBtn.className = 'cfg-et-align-btn' + (curAlign === aligns[i] ? ' active' : '');
      alignBtn.dataset.align = aligns[i];
      alignBtn.setAttribute('aria-label', label);
      // Simple text labels instead of inline SVG
      alignBtn.textContent = aligns[i] === 'left' ? '\u2261' : aligns[i] === 'center' ? '\u2261' : '\u2261';
      etToolbar.appendChild(alignBtn);
    });

    box.appendChild(etToolbar);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'cfg-modal-actions';

    var cancelBtn2 = document.createElement('button');
    cancelBtn2.className = 'cfg-btn-sec';
    cancelBtn2.dataset.action = 'cancel';
    cancelBtn2.textContent = 'Cancel';
    actions.appendChild(cancelBtn2);

    var saveBtn = document.createElement('button');
    saveBtn.className = 'cfg-btn-pry';
    saveBtn.dataset.action = 'save';
    saveBtn.textContent = 'Save';
    actions.appendChild(saveBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    // Event binding
    textarea.focus();
    textarea.select();

    boldBtn.addEventListener('click', function () {
      this.classList.toggle('active');
    });

    italicBtn.addEventListener('click', function () {
      this.classList.toggle('active');
    });

    // Close handlers
    closeBtn.addEventListener('click', function () { modal.remove(); });
    cancelBtn2.addEventListener('click', function () { modal.remove(); });

    saveBtn.addEventListener('click', function () {
      var data = {
        text: textarea.value.trim(),
        fontSize: parseInt(sizeInput.value) || 16,
        color: colorInput.value,
        bgColor: bgInput.value,
        fontWeight: boldBtn.classList.contains('active') ? 'bold' : '',
        fontStyle: italicBtn.classList.contains('active') ? 'italic' : '',
        textAlign: (function () {
          var ab = modal.querySelector('[data-align].active');
          return ab ? ab.dataset.align : 'center';
        })()
      };
      if (data.text) {
        callback(data);
        modal.remove();
      }
    });

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === 'Escape') modal.remove();
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    this.trapFocus(modal);
  }

  _createField(labelText) {
    var field = document.createElement('div');
    field.className = 'cfg-et-field';
    var label = document.createElement('label');
    label.className = 'cfg-et-label';
    label.textContent = labelText;
    field.appendChild(label);
    return field;
  }

  showConfirmModal(msg, callback) {
    var modal = this.createModal('');

    var box = document.createElement('div');
    box.className = 'cfg-modal-box cfg-confirm-box';

    var p = document.createElement('p');
    p.className = 'cfg-confirm-text';
    p.textContent = msg;
    box.appendChild(p);

    var actions = document.createElement('div');
    actions.className = 'cfg-modal-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'cfg-btn-sec';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(cancelBtn);

    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'cfg-btn-danger';
    confirmBtn.textContent = 'OK';
    actions.appendChild(confirmBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    cancelBtn.addEventListener('click', function () { modal.remove(); });
    confirmBtn.addEventListener('click', function () {
      callback();
      modal.remove();
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    this.trapFocus(modal);
  }

  showErrorModal(msg) {
    var modal = this.createModal('');

    var box = document.createElement('div');
    box.className = 'cfg-modal-box cfg-error-box';

    var p = document.createElement('p');
    p.className = 'cfg-error-text';
    p.textContent = msg;
    box.appendChild(p);

    var actions = document.createElement('div');
    actions.className = 'cfg-modal-actions';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cfg-btn-pry';
    closeBtn.textContent = 'OK';
    actions.appendChild(closeBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    closeBtn.addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    this.trapFocus(modal);
  }

  createModal(htmlStructure) {
    var modal = document.createElement('dialog');
    modal.className = 'cfg-modal';
    modal.dataset.dynamicModal = 'true';
    if (htmlStructure) {
      modal.innerHTML = htmlStructure;
    }
    document.body.appendChild(modal);
    this.openModal(modal);
    return modal;
  }

  trapFocus(container) {
    if (!container) return;
    var focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    first.focus();
    if (container.dataset.focusTrapBound === 'true') return;
    container.dataset.focusTrapBound = 'true';

    var handler = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (container === this.core.modalEl) {
          this.closeModal(container);
        } else {
          this.closeModal(container);
          container.remove();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handler.bind(this), { signal: this.core.abortController.signal });
  }
}

/* ===========================================
   ExportManager — PDF export via dynamic jsPDF import
   =========================================== */

class ExportManager {
  constructor(core) {
    this.core = core;
  }

  onExportPDF() {
    var core = this.core;
    core.dispatchExportEvent();

    // Dynamic script injection for jsPDF
    if (typeof window.jspdf === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.async = true;
      script.onload = function () { core.exportManager.renderPDF(); };
      script.onerror = function () {
        core.modalManager.showErrorModal('Could not load PDF library. Check internet connection.');
      };
      document.body.appendChild(script);
    } else {
      this.renderPDF();
    }
  }

  renderPDF() {
    var core = this.core;
    try {
      var { jsPDF } = window.jspdf;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [600, 400] });
      var canvas = core.canvasRenderer.renderToCanvas();
      if (canvas) {
        var imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 0, 0, 600, 400);
      }
      doc.save('sticker-sheet.pdf');
    } catch (err) {
      core.modalManager.showErrorModal('Could not generate PDF. Error: ' + err.message);
    }
  }
}

/* ===========================================
   KeyboardManager — Keyboard shortcut routing
   =========================================== */

class KeyboardManager {
  constructor(core) {
    this.core = core;
  }

  onKeyDown(e) {
    var core = this.core;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl/Cmd + Z — Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      core.historyManager.undo();
      return;
    }

    // Ctrl/Cmd + Shift + Z — Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      core.historyManager.redo();
      return;
    }

    // Ctrl/Cmd + Y — Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      core.historyManager.redo();
      return;
    }

    // Delete/Backspace — Delete selected
    if (e.key === 'Delete' || e.key === 'Backspace') {
      core.itemManager.deleteSelected();
      return;
    }

    // Ctrl/Cmd + C — Copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && core.state.selectedIds.length) {
      e.preventDefault();
      core.clipboardManager.copy();
      return;
    }

    // Ctrl/Cmd + V — Paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && core.state.clipboard) {
      e.preventDefault();
      core.clipboardManager.paste();
      return;
    }

    // Ctrl/Cmd + A — Select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      core.state.selectedIds = core.state.items.map(function (it) { return it.id; });
      core.selectionManager.updateSelection();
      core.dispatchSelectionEvent();
      return;
    }

    // T key — Text tool toggle
    if (e.key === 't' || e.key === 'T') {
      core.interactionManager.onTextToolToggle();
      return;
    }

    // Escape — Unselect / close modals
    if (e.key === 'Escape') {
      var visibleModal = core.querySelector('dialog.cfg-modal[open]');
      if (visibleModal) {
        e.preventDefault();
        core.modalManager.closeModal(visibleModal);
        return;
      }
      core.state.selectedIds = [];
      core.selectionManager.updateSelection();
      return;
    }
  }
}

/* ===========================================
   ClipboardManager — Copy/paste with compact references
   =========================================== */

class ClipboardManager {
  constructor(core) {
    this.core = core;
  }

  copy() {
    var sel = this.core.getSelected();
    this.core.state.clipboard = sel.map(function (it) {
      return {
        // Store reference strings, not raw data URLs
        srcRef: it.el && it.el.querySelector('img') ? it.el.querySelector('img').currentSrc || it.src : null,
        isText: !!it.text,
        text: it.text || '',
        fontSize: it.fontSize || 16,
        color: it.color || '#2D3436',
        bgColor: it.bgColor || '',
        fontWeight: it.fontWeight || '',
        fontStyle: it.fontStyle || '',
        textAlign: it.textAlign || 'center',
        w: it.w,
        h: it.h
      };
    });
  }

  paste() {
    var core = this.core;
    if (!core.state.clipboard) return;
    core.historyManager.saveState();
    var autoBtn = core.querySelector('#auto-btn-' + core.sid);
    var self = this;

    core.state.clipboard.forEach(function (cd) {
      if (cd.isText) {
        var item = core.itemManager.addTextItem(
          cd.text, cd.fontSize, true,
          cd.color, cd.bgColor, cd.fontWeight, cd.fontStyle, cd.textAlign
        );
        if (item) {
          item.x += 20;
          item.y += 20;
          item.el.style.left = item.x + 'px';
          item.el.style.top = item.y + 'px';
        }
      } else if (cd.srcRef) {
        var img = new Image();
        img.onload = function () {
          var item = core.itemManager.addImageItem(cd.srcRef, true);
          if (item) {
            item.w = cd.w;
            item.h = cd.h;
            item.el.style.width = cd.w + 'px';
            item.el.style.height = cd.h + 'px';
            if (item.el.querySelector('img')) {
              item.el.querySelector('img').style.width = cd.w + 'px';
              item.el.querySelector('img').style.height = cd.h + 'px';
            }
            item.el.style.left = item.x + 'px';
            item.el.style.top = item.y + 'px';
            core.historyManager.saveState();
            core.growCanvas();
            if (autoBtn) autoBtn.click();
          }
        };
        img.src = cd.srcRef;
      }
    });

    core.historyManager.saveState();
    core.growCanvas();
    if (autoBtn) autoBtn.click();
  }
}

/* ===========================================
   PriceManager — Price calculation, quantity, stats
   =========================================== */

class PriceManager {
  constructor(core) {
    this.core = core;
  }

  updatePrice() {
    var core = this.core;
    if (!core.priceEl) return;
    var qty = parseInt(core.qtyEl ? core.qtyEl.textContent : 1) || 1;
    core.priceEl.textContent = '$' + (core.state.basePrice * (core.state.items.length || 1) * qty).toFixed(2);
    core.dispatchPriceEvent();
  }

  updateCount() {
    var core = this.core;
    if (!core.countEl) return;
    var sel = core.state.selectedIds.length;
    core.countEl.textContent = core.state.items.length + ' items' +
      (sel ? ' (' + sel + ' selected)' : '');
  }

  updateStats() {
    var core = this.core;
    var el = core.querySelector('#stats-' + core.sid);
    if (!el) return;
    var area = 0;
    core.state.items.forEach(function (it) { area += it.w * it.h; });
    var areaCm = Math.round(area / core.CANVAS_W * 600 / core.CANVAS_W * 600 / 100);
    el.textContent = core.state.items.length + ' items \u00b7 ' + areaCm + ' cm\u00b2';
  }

  qtyDown() {
    var qtyEl = this.core.qtyEl;
    if (!qtyEl) return;
    var q = parseInt(qtyEl.textContent) || 1;
    if (q > 1) { qtyEl.textContent = q - 1; }
    this.updatePrice();
  }

  qtyUp() {
    var qtyEl = this.core.qtyEl;
    if (!qtyEl) return;
    qtyEl.textContent = (parseInt(qtyEl.textContent) || 1) + 1;
    this.updatePrice();
  }
}

/* ===========================================
   InteractionManager — Mouse/touch/keyboard input, drag state machine
   Integration: snapVal in onMouseUp/onTouchEnd, CollisionEngine extraction
   V3: Resize collision clamp, rotation AABB check, applyOverlapVisual helper
   =========================================== */

class InteractionManager {
  constructor(core) {
    this.core = core;
  }

  /**
   * Visual feedback helper for overlap state.
   * Sets opacity + outline on item.el when overlapping any stationary item.
   * Lives in InteractionManager (DOM concern), NOT CollisionEngine (pure math).
   * @param {Object} item - The item to check
   * @param {Array} allItems - All items on canvas
   * @param {Array} excludeIds - IDs to exclude (e.g., currently dragged items)
   */
  applyOverlapVisual(item, allItems, excludeIds) {
    var overlap = this.core.collisionEngine.findOverlap(item, allItems);
    if (overlap) {
      item.el.style.opacity = '0.4';
      item.el.style.outline = '2px solid #FF4444';
    } else {
      item.el.style.opacity = '';
      item.el.style.outline = '';
    }
  }

  onMouseDown(e) {
    var core = this.core;
    core.updateCanvasWH();

    // Pan is an explicit gesture on desktop: middle mouse, or Space + left drag.
    // The viewport owns the offset; the canvas itself is never translated.
    if (e.button === 1 || (e.button === 0 && core.state.spacePressed)) {
      e.preventDefault();
      core.state.dragState = {
        type: 'pan',
        ox: e.clientX,
        oy: e.clientY,
        scrollX: core.wrap ? core.wrap.scrollLeft : 0,
        scrollY: core.wrap ? core.wrap.scrollTop : 0
      };
      if (core.wrap) core.wrap.classList.add('is-panning');
      return;
    }

    var itemEl = e.target.closest('.canvas-item');
    if (itemEl) {
      var cid = parseInt(itemEl.dataset.itemId);

      // Resize handle
      if (e.target.classList.contains('resize-handle')) {
        if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        this.startResize(e, cid, e.target.dataset.handle);
        return;
      }

      // Rotation handle
      if (e.target.classList.contains('rot-handle')) {
        if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        this.startRotate(e, cid);
        return;
      }

      // Click on item
      if (e.button === 0) {
        if (e.shiftKey) {
          core.selectionManager.toggleSelect(cid, true);
        } else if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        if (core.state.textToolActive) return;
        this.startDrag(e, cid);
      }
    } else {
      // Click on canvas background
      if (!e.shiftKey) {
        core.state.selectedIds = [];
        core.selectionManager.updateSelection();
      }
      // Start selection box or pan
      if (e.button === 0 && !core.state.textToolActive) {
        core.state.dragState = {
          type: 'selbox',
          ox: e.clientX, oy: e.clientY,
          sx: e.clientX, sy: e.clientY
        };
      }
    }
  }

  onMouseMove(e) {
    var core = this.core;
    var im = this;
    if (!core.state.dragState) return;
    var ds = core.state.dragState;
    var itemsArr = core.state.items;

    if (ds.type === 'pan') {
      if (!core.wrap) return;
      core.wrap.scrollLeft = ds.scrollX - (e.clientX - ds.ox);
      core.wrap.scrollTop = ds.scrollY - (e.clientY - ds.oy);
      core.canvasRenderer.clampPan();
      return;
    }

    if (ds.type === 'move') {
      // Use previous position delta (not from start) so constrained position persists
      var prevX = ds._lastX != null ? ds._lastX : ds.ox;
      var prevY = ds._lastY != null ? ds._lastY : ds.oy;
      var dx = (e.clientX - prevX) / core.state.zoom;
      var dy = (e.clientY - prevY) / core.state.zoom;
      ds._lastX = e.clientX;
      ds._lastY = e.clientY;
      var draggedItems = [];
      ds.ids.forEach(function (id) {
        var item = core.state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        draggedItems.push(item);
      });

      // Wall-collision: constrain each dragged item against stationary items
      var ce = core.collisionEngine;
      var constrainedDelta = ce.constrainGroupDelta(
        dx,
        dy,
        draggedItems,
        itemsArr,
        ds.ids
      );
      draggedItems.forEach(function (item) {
        item.x += constrainedDelta.dx;
        item.y += constrainedDelta.dy;
        item.el.style.left = item.x + 'px';
        item.el.style.top = item.y + 'px';

        // Visual feedback for overlap (V3: use helper)
        im.applyOverlapVisual(item, itemsArr, ds.ids);
      });

      core.selectionManager.updateGuides(
        itemsArr.find(function (i) { return i.id === ds.ids[0]; }),
        itemsArr
      );
      return;
    }

    if (ds.type === 'resize') {
      this._applyResize(ds, e.clientX, e.clientY);
      return;

      var item = itemsArr.find(function (i) { return i.id === ds.id; });
      if (!item) return;
      var dx = (e.clientX - ds.ox) / core.state.zoom;
      var dy = (e.clientY - ds.oy) / core.state.zoom;
      var GAP = core.collisionEngine.GAP;

      // Compute candidate dimensions from raw delta
      var candidateX = ds.sx;
      var candidateY = ds.sy;
      var candidateW = ds.sw;
      var candidateH = ds.sh;

      if (ds.handle.indexOf('e') > -1) candidateW = Math.max(30, ds.sw + dx);
      if (ds.handle.indexOf('w') > -1) {
        var nw = Math.max(30, ds.sw - dx);
        candidateX = ds.sx + ds.sw - nw;
        candidateW = nw;
      }
      if (ds.handle.indexOf('s') > -1) candidateH = Math.max(30, ds.sh + dy);
      if (ds.handle.indexOf('n') > -1) {
        var nh = Math.max(30, ds.sh - dy);
        candidateY = ds.sy + ds.sh - nh;
        candidateH = nh;
      }

      // V3: Collision clamping against stationary items (per-handle direction)
      var candidate = { x: candidateX, y: candidateY, w: candidateW, h: candidateH };
      for (var ri = 0; ri < core.state.items.length; ri++) {
        var other = core.state.items[ri];
        if (other.id === ds.id) continue;
        if (core.collisionEngine.rectsOverlap(candidate, other)) {
          if (ds.handle.indexOf('e') > -1) {
            candidateW = Math.min(candidateW, other.x - candidate.x - GAP);
          }
          if (ds.handle.indexOf('w') > -1) {
            candidateX = Math.max(candidateX, other.x + other.w + GAP);
            candidateW = candidate.x + candidate.w - candidateX;
          }
          if (ds.handle.indexOf('s') > -1) {
            candidateH = Math.min(candidateH, other.y - candidate.y - GAP);
          }
          if (ds.handle.indexOf('n') > -1) {
            candidateY = Math.max(candidateY, other.y + other.h + GAP);
            candidateH = candidate.y + candidate.h - candidateY;
          }
        }
        // Update candidate rect after each blocker for correct subsequent clamping
        candidate.x = candidateX;
        candidate.y = candidateY;
        candidate.w = candidateW;
        candidate.h = candidateH;
      }

      // Re-check minimums after clamping — if less than 30, revert to previous size/position to avoid overlap
      if (candidateW < 30) {
        candidateX = item.x;
        candidateW = item.w;
      }
      if (candidateH < 30) {
        candidateY = item.y;
        candidateH = item.h;
      }
      candidateW = Math.max(30, candidateW);
      candidateH = Math.max(30, candidateH);

      // Canvas boundary clamp
      candidateX = Math.max(0, Math.min(core.CANVAS_W - candidateW, candidateX));
      candidateY = Math.max(0, candidateY);

      // Apply to item and DOM
      item.x = candidateX;
      item.y = candidateY;
      item.w = candidateW;
      item.h = candidateH;
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
      item.el.style.width = item.w + 'px';
      item.el.style.height = item.h + 'px';
      core.utils.updateSizeInfo(item);
      return;
    }

    if (ds.type === 'rotate') {
      this._applyRotation(ds, e.clientX, e.clientY);
      return;

      var item = core.state.items.find(function (i) { return i.id === ds.id; });
      if (!item) return;

      // V3: Square items — skip collision check (AABB is constant under rotation)
      if (Math.abs(item.w - item.h) < 0.01) {
        var cx = item.x + item.w / 2;
        var cy = item.y + item.h / 2;
        var angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        item.rotation = angle - ds.startAngle;
        core.applyTransform(item);
        return;
      }

      // V3: Non-square — compute rotated AABB and check overlap
      var cx = item.x + item.w / 2;
      var cy = item.y + item.h / 2;
      var newAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI - ds.startAngle;

      var oldRotation = item.rotation;
      item.rotation = newAngle;
      var newAABB = core.collisionEngine.getRotatedAABB(item);

      var overlaps = false;
      for (var ro = 0; ro < core.state.items.length; ro++) {
        var s = core.state.items[ro];
        if (s.id === ds.id) continue;
        if (core.collisionEngine.rectsOverlap(newAABB, s)) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) {
        item.el.style.opacity = '0.4';
        item.el.style.outline = '2px solid #FF4444';
        item.rotation = oldRotation; // revert to previous angle
      } else {
        item.rotation = newAngle;
        item.el.style.opacity = '';
        item.el.style.outline = '';
      }

      core.applyTransform(item);
      return;
    }

    if (ds.type === 'selbox') {
      var selBox = core.querySelector('.sel-box');
      if (!selBox) return;
      var rect = core.canvas.getBoundingClientRect();
      var x1 = (ds.sx - rect.left) / core.state.zoom;
      var y1 = (ds.sy - rect.top) / core.state.zoom;
      var x2 = (e.clientX - rect.left) / core.state.zoom;
      var y2 = (e.clientY - rect.top) / core.state.zoom;
      selBox.style.left = Math.min(x1, x2) + 'px';
      selBox.style.top = Math.min(y1, y2) + 'px';
      selBox.style.width = Math.abs(x2 - x1) + 'px';
      selBox.style.height = Math.abs(y2 - y1) + 'px';
      selBox.style.display = 'block';
    }
  }

  onMouseUp(e) {
    var core = this.core;
    if (!core.state.dragState) return;
    var ds = core.state.dragState;

    if (ds.type === 'pan' && core.wrap) {
      core.wrap.classList.remove('is-panning');
    }

    if (ds.type === 'selbox') {
      var selBox = core.querySelector('.sel-box');
      if (selBox) selBox.style.display = 'none';
      var rect = core.canvas.getBoundingClientRect();
      var x1 = (ds.sx - rect.left) / core.state.zoom;
      var y1 = (ds.sy - rect.top) / core.state.zoom;
      var x2 = (e.clientX - rect.left) / core.state.zoom;
      var y2 = (e.clientY - rect.top) / core.state.zoom;
      core.selectionManager.selectAllInRect(x1, y1, x2, y2);
    }

    if (ds.type === 'move') {
      if (core.guideH) core.guideH.style.display = 'none';
      if (core.guideV) core.guideV.style.display = 'none';

      // SNAP TO GRID (V03 fix): snap items on drag end
      if (core.state.snapEnabled) {
        var snapItems = [];
        ds.ids.forEach(function (id) {
          var dragged = core.state.items.find(function (i) { return i.id === id; });
          if (dragged) snapItems.push(dragged);
        });
        core.snapEngine.applySnap(snapItems);
      }

      // Drop validation: if overlap persists, find nearest clear spot
      ds.ids.forEach(function (id) {
        var dragged = core.state.items.find(function (i) { return i.id === id; });
        if (!dragged) return;
        var overlap = core.collisionEngine.findOverlap(dragged, core.state.items);
        if (overlap) {
          var next = core.collisionEngine.findNearestClearSpot(dragged, core.state.items);
          if (next) {
            dragged.x = next.x;
            dragged.y = next.y;
            dragged.el.style.left = next.x + 'px';
            dragged.el.style.top = next.y + 'px';
          } else {
            // Revert snap to pre-drag position to guarantee zero overlap
            var prev = ds.startPos[id];
            if (prev) {
              dragged.x = prev.x;
              dragged.y = prev.y;
              dragged.el.style.left = prev.x + 'px';
              dragged.el.style.top = prev.y + 'px';
            }
          }
        }
        dragged.el.style.outline = '';
      });
      core.historyManager.saveState();
      core.growCanvas();
      core.dispatchUpdateEvent();
    }

    if (ds.type === 'resize') {
      // Overlap check: nudge item to clear position before saving state
      var resizedItem = core.state.items.find(function (i) { return i.id === ds.id; });
      if (resizedItem) {
        var resOverlap = core.collisionEngine.findOverlap(resizedItem, core.state.items);
        if (resOverlap) {
          var resNext = core.collisionEngine.findNearestClearSpot(resizedItem, core.state.items);
          if (resNext) {
            resizedItem.x = resNext.x;
            resizedItem.y = resNext.y;
            resizedItem.el.style.left = resNext.x + 'px';
            resizedItem.el.style.top = resNext.y + 'px';
          }
        }
      }
      core.historyManager.saveState();
      core.growCanvas();
      core.dispatchUpdateEvent();
    }

    if (ds.type === 'rotate') {
      core.historyManager.saveState();
      core.growCanvas();
      core.dispatchUpdateEvent();
    }

    core.state.dragState = null;
  }

  onTouchStart(e) {
    var core = this.core;
    if (e.touches.length === 2) {
      var first = e.touches[0];
      var second = e.touches[1];
      core.state.lastTouchDist = Math.hypot(
        second.clientX - first.clientX,
        second.clientY - first.clientY
      );
      return;
    }
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    core.updateCanvasWH();

    var itemEl = e.target.closest('.canvas-item');
    if (itemEl) {
      var cid = parseInt(itemEl.dataset.itemId);

      if (e.target.classList.contains('resize-handle')) {
        if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        this.startResize({ clientX: t.clientX, clientY: t.clientY }, cid, e.target.dataset.handle);
        return;
      }
      if (e.target.classList.contains('rot-handle')) {
        if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        this.startRotate({ clientX: t.clientX, clientY: t.clientY }, cid);
        return;
      }
      if (core.state.selectedIds.indexOf(cid) === -1) {
        core.state.selectedIds = [cid];
        core.selectionManager.updateSelection();
      }
      e.preventDefault();
      this.startDrag({ clientX: t.clientX, clientY: t.clientY }, cid);
      return;
    }

    core.state.selectedIds = [];
    core.selectionManager.updateSelection();
    core.state.touchStarted = null;
  }

  onTouchMove(e) {
    var core = this.core;
    var im = this;
    if (e.touches.length === 2) {
      // Pinch zoom
      e.preventDefault();
      var t1 = e.touches[0], t2 = e.touches[1];
      var dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (core.state.lastTouchDist > 0) {
        var scale = dist / core.state.lastTouchDist;
        var centerX = (t1.clientX + t2.clientX) / 2;
        var centerY = (t1.clientY + t2.clientY) / 2;
        core.canvasRenderer.zoomAt(core.state.zoom * scale, centerX, centerY);
      }
      core.state.lastTouchDist = dist;
      return;
    }

    if (!core.state.dragState || e.touches.length !== 1) return;
    e.preventDefault();
    var t = e.touches[0];
    var ds = core.state.dragState;

    if (ds.type === 'move') {
      // Jitter threshold
      var mx = t.clientX - (ds._lastX || ds.ox);
      var my = t.clientY - (ds._lastY || ds.oy);
      if (Math.abs(mx) < 2 && Math.abs(my) < 2) {
        ds._lastX = t.clientX;
        ds._lastY = t.clientY;
        return;
      }
      ds._lastPrevX = ds._lastX || ds.ox;
      ds._lastPrevY = ds._lastY || ds.oy;
      ds._lastX = t.clientX;
      ds._lastY = t.clientY;

      var dx = (t.clientX - ds._lastPrevX) / core.state.zoom;
      var dy = (t.clientY - ds._lastPrevY) / core.state.zoom;
      var draggedItems = [];
      ds.ids.forEach(function (id) {
        var item = core.state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        draggedItems.push(item);
      });

      // Wall-collision: constrain each dragged item against stationary items
      var ce = core.collisionEngine;
      var itemsArr = core.state.items;
      var constrainedDelta = ce.constrainGroupDelta(
        dx,
        dy,
        draggedItems,
        itemsArr,
        ds.ids
      );
      draggedItems.forEach(function (item) {
        item.x += constrainedDelta.dx;
        item.y += constrainedDelta.dy;
        item.el.style.left = item.x + 'px';
        item.el.style.top = item.y + 'px';

        // Visual feedback for overlap (V3: use helper)
        im.applyOverlapVisual(item, itemsArr, ds.ids);
      });
    } else if (ds.type === 'resize') {
      this._applyResize(ds, t.clientX, t.clientY);
      return;

      var item = core.state.items.find(function (i) { return i.id === ds.id; });
      if (!item) return;
      var dx = (t.clientX - ds.ox) / core.state.zoom;
      var dy = (t.clientY - ds.oy) / core.state.zoom;
      var GAP = core.collisionEngine.GAP;

      // Compute candidate dimensions from raw delta
      var candidateX = ds.sx;
      var candidateY = ds.sy;
      var candidateW = ds.sw;
      var candidateH = ds.sh;

      if (ds.handle.indexOf('e') > -1) candidateW = Math.max(30, ds.sw + dx);
      if (ds.handle.indexOf('w') > -1) {
        var nw = Math.max(30, ds.sw - dx);
        candidateX = ds.sx + ds.sw - nw;
        candidateW = nw;
      }
      if (ds.handle.indexOf('s') > -1) candidateH = Math.max(30, ds.sh + dy);
      if (ds.handle.indexOf('n') > -1) {
        var nh = Math.max(30, ds.sh - dy);
        candidateY = ds.sy + ds.sh - nh;
        candidateH = nh;
      }

      // V3: Collision clamping against stationary items (per-handle direction)
      var candidate = { x: candidateX, y: candidateY, w: candidateW, h: candidateH };
      for (var ri = 0; ri < core.state.items.length; ri++) {
        var other = core.state.items[ri];
        if (other.id === ds.id) continue;
        if (core.collisionEngine.rectsOverlap(candidate, other)) {
          if (ds.handle.indexOf('e') > -1) {
            candidateW = Math.min(candidateW, other.x - candidate.x - GAP);
          }
          if (ds.handle.indexOf('w') > -1) {
            candidateX = Math.max(candidateX, other.x + other.w + GAP);
            candidateW = candidate.x + candidate.w - candidateX;
          }
          if (ds.handle.indexOf('s') > -1) {
            candidateH = Math.min(candidateH, other.y - candidate.y - GAP);
          }
          if (ds.handle.indexOf('n') > -1) {
            candidateY = Math.max(candidateY, other.y + other.h + GAP);
            candidateH = candidate.y + candidate.h - candidateY;
          }
        }
        // Update candidate rect after each blocker for correct subsequent clamping
        candidate.x = candidateX;
        candidate.y = candidateY;
        candidate.w = candidateW;
        candidate.h = candidateH;
      }

      // Re-check minimums after clamping — if less than 30, revert to previous size/position to avoid overlap
      if (candidateW < 30) {
        candidateX = item.x;
        candidateW = item.w;
      }
      if (candidateH < 30) {
        candidateY = item.y;
        candidateH = item.h;
      }
      candidateW = Math.max(30, candidateW);
      candidateH = Math.max(30, candidateH);

      // Canvas boundary clamp
      candidateX = Math.max(0, Math.min(core.CANVAS_W - candidateW, candidateX));
      candidateY = Math.max(0, candidateY);

      // Apply to item and DOM
      item.x = candidateX;
      item.y = candidateY;
      item.w = candidateW;
      item.h = candidateH;
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
      item.el.style.width = item.w + 'px';
      item.el.style.height = item.h + 'px';
      core.utils.updateSizeInfo(item);
    } else if (ds.type === 'rotate') {
      this._applyRotation(ds, t.clientX, t.clientY);
      return;

      var item = core.state.items.find(function (i) { return i.id === ds.id; });
      if (!item) return;

      // V3: Square items — skip collision check (AABB is constant under rotation)
      if (Math.abs(item.w - item.h) < 0.01) {
        var cx = item.x + item.w / 2;
        var cy = item.y + item.h / 2;
        var angle = Math.atan2(t.clientY - cy, t.clientX - cx) * 180 / Math.PI;
        item.rotation = angle - ds.startAngle;
        core.applyTransform(item);
        return;
      }

      // V3: Non-square — compute rotated AABB and check overlap
      var cx = item.x + item.w / 2;
      var cy = item.y + item.h / 2;
      var newAngle = Math.atan2(t.clientY - cy, t.clientX - cx) * 180 / Math.PI - ds.startAngle;

      var oldRotation = item.rotation;
      item.rotation = newAngle;
      var newAABB = core.collisionEngine.getRotatedAABB(item);

      var overlaps = false;
      for (var ro = 0; ro < core.state.items.length; ro++) {
        var s = core.state.items[ro];
        if (s.id === ds.id) continue;
        if (core.collisionEngine.rectsOverlap(newAABB, s)) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) {
        item.el.style.opacity = '0.4';
        item.el.style.outline = '2px solid #FF4444';
        item.rotation = oldRotation; // revert to previous angle
      } else {
        item.rotation = newAngle;
        item.el.style.opacity = '';
        item.el.style.outline = '';
      }

      core.applyTransform(item);
    }
  }

  onTouchEnd(e) {
    var core = this.core;
    if (core.state.dragState && core.state.dragState.type === 'move') {
      if (core.guideH) core.guideH.style.display = 'none';
      if (core.guideV) core.guideV.style.display = 'none';

      // SNAP TO GRID (V03 fix): snap items on touch end
      if (core.state.snapEnabled) {
        var snapItems = [];
        core.state.dragState.ids.forEach(function (id) {
          var dragged = core.state.items.find(function (i) { return i.id === id; });
          if (dragged) snapItems.push(dragged);
        });
        core.snapEngine.applySnap(snapItems);
      }

      // Drop validation: if overlap persists, find nearest clear spot
      core.state.dragState.ids.forEach(function (id) {
        var dragged = core.state.items.find(function (i) { return i.id === id; });
        if (!dragged) return;
        var overlap = core.collisionEngine.findOverlap(dragged, core.state.items);
        if (overlap) {
          var next = core.collisionEngine.findNearestClearSpot(dragged, core.state.items);
          if (next) {
            dragged.x = next.x;
            dragged.y = next.y;
            dragged.el.style.left = next.x + 'px';
            dragged.el.style.top = next.y + 'px';
          } else {
            // Revert snap to pre-drag position to guarantee zero overlap
            var prev = core.state.dragState.startPos[id];
            if (prev) {
              dragged.x = prev.x;
              dragged.y = prev.y;
              dragged.el.style.left = prev.x + 'px';
              dragged.el.style.top = prev.y + 'px';
            }
          }
        }
        dragged.el.style.outline = '';
      });
      core.historyManager.saveState();
      core.growCanvas();
    } else if (core.state.dragState && core.state.dragState.type === 'resize') {
      // Overlap check: nudge item to clear position before saving state
      var resizedItem = core.state.items.find(function (i) { return i.id === core.state.dragState.id; });
      if (resizedItem) {
        var resOverlap = core.collisionEngine.findOverlap(resizedItem, core.state.items);
        if (resOverlap) {
          var resNext = core.collisionEngine.findNearestClearSpot(resizedItem, core.state.items);
          if (resNext) {
            resizedItem.x = resNext.x;
            resizedItem.y = resNext.y;
            resizedItem.el.style.left = resNext.x + 'px';
            resizedItem.el.style.top = resNext.y + 'px';
          }
        }
      }
      core.historyManager.saveState();
      core.growCanvas();
    } else if (core.state.dragState && core.state.dragState.type === 'rotate') {
      core.historyManager.saveState();
      core.growCanvas();
    }
    core.state.dragState = null;
    core.state.touchStarted = null;
    core.state.lastTouchDist = 0;
  }

  _applyResize(ds, clientX, clientY) {
    var core = this.core;
    var item = core.state.items.find(function (candidate) { return candidate.id === ds.id; });
    if (!item) return;

    var dx = (clientX - ds.ox) / core.state.zoom;
    var dy = (clientY - ds.oy) / core.state.zoom;
    var target = {
      id: item.id,
      x: ds.sx,
      y: ds.sy,
      w: ds.sw,
      h: ds.sh,
      rotation: item.rotation
    };

    if (ds.handle.indexOf('e') > -1) target.w = Math.max(30, ds.sw + dx);
    if (ds.handle.indexOf('w') > -1) {
      target.w = Math.max(30, ds.sw - dx);
      target.x = ds.sx + ds.sw - target.w;
    }
    if (ds.handle.indexOf('s') > -1) target.h = Math.max(30, ds.sh + dy);
    if (ds.handle.indexOf('n') > -1) {
      target.h = Math.max(30, ds.sh - dy);
      target.y = ds.sy + ds.sh - target.h;
    }

    var constrained = core.collisionEngine.constrainTransform(
      item,
      target,
      core.state.items,
      [item.id]
    );
    item.x = constrained.x;
    item.y = constrained.y;
    item.w = constrained.w;
    item.h = constrained.h;
    item.el.style.left = item.x + 'px';
    item.el.style.top = item.y + 'px';
    item.el.style.width = item.w + 'px';
    item.el.style.height = item.h + 'px';
    core.utils.updateSizeInfo(item);
    this.applyOverlapVisual(item, core.state.items, [item.id]);
  }

  _applyRotation(ds, clientX, clientY) {
    var core = this.core;
    var item = core.state.items.find(function (candidate) { return candidate.id === ds.id; });
    if (!item) return;

    var cx = item.x + item.w / 2;
    var cy = item.y + item.h / 2;
    var requestedAngle = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI - ds.startAngle;
    var constrained = core.collisionEngine.constrainTransform(
      item,
      Object.assign({}, item, { rotation: requestedAngle }),
      core.state.items,
      [item.id]
    );

    item.x = constrained.x;
    item.y = constrained.y;
    item.rotation = constrained.rotation;
    core.applyTransform(item);
    this.applyOverlapVisual(item, core.state.items, [item.id]);
  }

  onWheel(e) {
    var core = this.core;
    // A regular wheel/trackpad gesture keeps scrolling the page/viewport.
    // Zoom is deliberate and mirrors browsers/design tools: Ctrl/Cmd + wheel.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    var factor = Math.exp(-e.deltaY * 0.002);
    core.canvasRenderer.zoomAt(core.state.zoom * factor, e.clientX, e.clientY);
  }

  startDrag(e, id) {
    var core = this.core;
    var item = core.state.items.find(function (i) { return i.id === id; });
    if (item && item.locked) return;
    var ids = core.state.selectedIds.indexOf(id) > -1
      ? core.state.selectedIds.slice()
      : [id];
    var startPos = {};
    ids.forEach(function (id) {
      var it = core.state.items.find(function (i) { return i.id === id; });
      if (it) startPos[id] = { x: it.x, y: it.y };
    });
    core.state.dragState = {
      type: 'move',
      ox: e.clientX, oy: e.clientY,
      ids: ids,
      startPos: startPos
    };
  }

  startResize(e, id, handle) {
    var core = this.core;
    var item = core.state.items.find(function (i) { return i.id === id; });
    if (item && item.locked) return;
    core.state.dragState = {
      type: 'resize',
      ox: e.clientX, oy: e.clientY,
      id: id,
      handle: handle,
      sx: item.x, sy: item.y,
      sw: item.w, sh: item.h
    };
  }

  startRotate(e, id) {
    var core = this.core;
    var item = core.state.items.find(function (i) { return i.id === id; });
    if (item && item.locked) return;
    var cx = item.x + item.w / 2;
    var cy = item.y + item.h / 2;
    var startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI - item.rotation;
    core.state.dragState = {
      type: 'rotate',
      ox: e.clientX, oy: e.clientY,
      id: id,
      startAngle: startAngle
    };
  }

  onTextToolToggle() {
    var core = this.core;
    core.state.textToolActive = !core.state.textToolActive;
    if (core.canvas) {
      core.canvas.style.cursor = core.state.textToolActive ? 'crosshair' : 'default';
    }

    if (core.state.textToolActive) {
      // Show edit text modal
      core.modalManager.showEditTextModal(
        { text: '', fontSize: 24, color: '#2D3436', bgColor: '', fontWeight: '', fontStyle: '', textAlign: 'center' },
        function (data) {
          if (data && data.text) {
            core.historyManager.saveState();
            core.itemManager.addTextItem(data.text, data.fontSize, false, data.color, data.bgColor, data.fontWeight, data.fontStyle, data.textAlign);
            core.state.textToolActive = false;
            if (core.canvas) core.canvas.style.cursor = 'default';
          }
        }
      );
    }
  }
}

class StickerConfigurator extends HTMLElement {
  constructor() {
    super();
    this.abortController = new AbortController();
    this.state = {};
  }

  /* ── Lifecycle ── */

  connectedCallback() {
    requestAnimationFrame(() => this.init());
  }

  disconnectedCallback() {
    this.abortController.abort();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.state = null;
    this.wrap = null;
    this.canvasStage = null;
    this.canvas = null;
    this.gridCanvas = null;
    this.hintEl = null;
    this.fileInput = null;
    this.modalEl = null;
    this.cache = null;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'section-id' && oldVal !== null && oldVal !== newVal) {
      this.init();
    }
  }

  static get observedAttributes() {
    return ['section-id'];
  }

  /* ── Initialization ── */

  init() {
    if (this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
    this.sid = this.dataset.sectionId;

    // DOM caching (V07 fix): cache all commonly-queried elements
    this.cache = {};
    this._cacheDomRefs();

    // Stable logical workspace. Visual fitting belongs to CanvasRenderer zoom.
    this.CANVAS_W = 600;
    this.CANVAS_H = 400;

    // Parse base price from data attribute
    var basePrice = parseFloat(this.dataset.basePrice) || 2.5;

    // Build state
    this.state = {
      items: [],
      selectedIds: [],
      nextId: 1,
      history: [],
      historyIdx: -1,
      zoom: 1,
      panX: 0,
      panY: 0,
      dragState: null,
      dpr: window.devicePixelRatio || 1,
      textToolActive: false,
      mobile: false,
      basePrice: basePrice,
      clipboard: null,
      touchStarted: null,
      lastTouchDist: 0,
      spacePressed: false,
      mobileOverride: null,
      snapEnabled: true,
      gridSize: 20,
      gapSize: 3,
      modalFile: null
    };

    // ── Compose submodules ──
    this.utils = new Utils(this);
    this.canvasRenderer = new CanvasRenderer(this);
    this.selectionManager = new SelectionManager(this);
    this.historyManager = new HistoryManager(this);
    this.priceManager = new PriceManager(this);
    this.clipboardManager = new ClipboardManager(this);
    this.snapEngine = new SnapEngine(this);
    this.collisionEngine = new CollisionEngine(this);
    this.itemManager = new ItemManager(this);
    this.interactionManager = new InteractionManager(this);
    this.mobileHandler = new MobileHandler(this);
    this.modalManager = new ModalManager(this);
    this.exportManager = new ExportManager(this);
    this.keyboardManager = new KeyboardManager(this);
    this.alignmentEngine = new AlignmentEngine(this);

    // Set logical canvas dimensions at init. The viewport height is owned by CSS.
    if (this.canvas) {
      this.canvas.style.width = this.CANVAS_W + 'px';
      this.canvas.style.height = this.CANVAS_H + 'px';
    }

    // Apply bg color from dataset
    var bgColor = this.dataset.bgColor || '#F8F9FA';
    if (this.gridCanvas) {
      this.gridCanvas.style.background = bgColor;
    }
    if (this.canvas) {
      this.canvas.style.background = bgColor;
    }

    this.canvasRenderer.drawGrid();
    this.canvasRenderer._syncZoomTransform();
    this.bindEvents();
    this.historyManager.saveState();
    this.mobileHandler.autoDetectMobile();
    this.priceManager.updatePrice();
    this.selectionManager.updateSelection();

    // Set initial cursor
    if (this.canvas) {
      this.canvas.style.cursor = this.state.textToolActive ? 'crosshair' : 'default';
    }
  }

  /* ── DOM caching ── */
  _cacheDomRefs() {
    var sid = this.dataset.sectionId;
    var ids = [
      'canvas-wrap', 'canvas-stage', 'canvas', 'grid-canvas', 'hint', 'file-input', 'modal',
      'undo-btn', 'redo-btn', 'item-count', 'price-display', 'qty-display',
      'mobile-btn', 'guide-h', 'guide-v',
      'del-btn', 'dup-btn', 'flip-h', 'flip-v',
      'align-left', 'align-h', 'align-right',
      'align-top', 'align-v', 'align-bot',
      'lock-btn', 'size-inputs', 'w-input', 'h-input',
      'auto-btn', 'export-btn', 'text-btn', 'zoom-fit',
      'qty-down', 'qty-up', 'clear-btn', 'bg-color',
      'snap-btm', 'grid-size', 'gap-size',
      'add-btn', 'submit',
      'modal-cancel', 'modal-zone', 'modal-add',
      'modal-w', 'modal-h', 'modal-qty', 'modal-fname',
      'stats'
    ];

    for (var i = 0; i < ids.length; i++) {
      var key = ids[i];
      this.cache[key] = this.querySelector('#' + key + '-' + sid);
    }

    // Convenience aliases
    this.wrap = this.cache['canvas-wrap'];
    this.canvasStage = this.cache['canvas-stage'];
    this.canvas = this.cache['canvas'];
    this.gridCanvas = this.cache['grid-canvas'];
    this.hintEl = this.cache['hint'];
    this.fileInput = this.cache['file-input'];
    this.modalEl = this.cache['modal'];
    this.undoBtn = this.cache['undo-btn'];
    this.redoBtn = this.cache['redo-btn'];
    this.countEl = this.cache['item-count'];
    this.priceEl = this.cache['price-display'];
    this.qtyEl = this.cache['qty-display'];
    this.mobileBtn = this.cache['mobile-btn'];
    this.guideH = this.cache['guide-h'];
    this.guideV = this.cache['guide-v'];
  }

  /* ── Event Binding Toolbar Delegation ── */
  bindEvents() {
    var signal = this.abortController.signal;
    var core = this;

    // Toolbar DELEGATION (V22 fix): use data-action on .toolbar container
    var toolbar = this.querySelector('.toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        var action = btn.dataset.action;
        core._handleToolbarAction(action);
      }, { signal });

      // Update toolbar buttons from Liquid template to use data-action
      this._updateToolbarForDelegation();
    }

    // Canvas mouse events
    if (this.canvas) {
      this.canvas.addEventListener('mousedown', function (e) { core.interactionManager.onMouseDown(e); }, { signal });
      this.canvas.addEventListener('mousemove', function (e) { core.interactionManager.onMouseMove(e); }, { signal });
      this.canvas.addEventListener('mouseup', function (e) { core.interactionManager.onMouseUp(e); }, { signal });
      this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { signal });

      this.canvas.addEventListener('touchstart', function (e) { core.interactionManager.onTouchStart(e); }, { signal, passive: false });
      this.canvas.addEventListener('touchmove', function (e) { core.interactionManager.onTouchMove(e); }, { signal, passive: false });
      this.canvas.addEventListener('touchend', function (e) { core.interactionManager.onTouchEnd(e); }, { signal, passive: true });

      this.canvas.addEventListener('drop', function (e) { core.handleCanvasDrop(e); }, { signal });
      this.canvas.addEventListener('dragover', function (e) { e.preventDefault(); }, { signal });
    }

    if (this.wrap) {
      this.wrap.addEventListener('wheel', function (e) { core.interactionManager.onWheel(e); }, { signal, passive: false });
      this.wrap.addEventListener('scroll', function () {
        core.state.panX = core.wrap.scrollLeft;
        core.state.panY = core.wrap.scrollTop;
      }, { signal, passive: true });
    }

    // Keyboard
    document.addEventListener('keydown', function (e) {
      var isField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
      if (e.code === 'Space' && !isField && core.matches(':hover')) {
        e.preventDefault();
        core.state.spacePressed = true;
        if (core.wrap) core.wrap.classList.add('is-pan-ready');
      }
      core.keyboardManager.onKeyDown(e);
    }, { signal });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Space') {
        core.state.spacePressed = false;
        if (core.wrap) core.wrap.classList.remove('is-pan-ready');
      }
    }, { signal });
    document.addEventListener('mouseup', function (e) {
      if (core.state && core.state.dragState) core.interactionManager.onMouseUp(e);
    }, { signal });
    window.addEventListener('resize', function () {
      if (core.mobileHandler) core.mobileHandler.syncToViewport();
    }, { signal, passive: true });

    // Add design button
    var addBtn = this.cache['add-btn'];
    if (addBtn) {
      addBtn.addEventListener('click', function () { core.modalManager.showAddDesignModal(); }, { signal });
    }

    // Modal events
    var modalCancel = this.cache['modal-cancel'];
    if (modalCancel) {
      modalCancel.addEventListener('click', function () { core.modalManager.closeModal(core.modalEl); }, { signal });
    }
    var modalZone = this.cache['modal-zone'];
    if (modalZone) {
      modalZone.addEventListener('click', function () { if (core.fileInput) core.fileInput.click(); }, { signal });
      modalZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (core.fileInput) core.fileInput.click();
        }
      }, { signal });
      modalZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        modalZone.classList.add('is-dragover');
      }, { signal });
      modalZone.addEventListener('dragleave', function () {
        modalZone.classList.remove('is-dragover');
      }, { signal });
      modalZone.addEventListener('drop', function (e) {
        e.preventDefault();
        modalZone.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files.length) {
          core.handleFileSelect(e.dataTransfer.files[0]);
        }
      }, { signal });
    }
    var modalAddBtn = this.cache['modal-add'];
    if (modalAddBtn) {
      modalAddBtn.addEventListener('click', function () { core.onModalAddClick(); }, { signal });
    }
    if (this.fileInput) {
      this.fileInput.addEventListener('change', function () { core.handleFileSelect(core.fileInput.files[0]); }, { signal });
    }

    // Quantity buttons
    var qtyDown = this.cache['qty-down'];
    if (qtyDown) {
      qtyDown.addEventListener('click', function () { core.priceManager.qtyDown(); }, { signal });
    }
    var qtyUp = this.cache['qty-up'];
    if (qtyUp) {
      qtyUp.addEventListener('click', function () { core.priceManager.qtyUp(); }, { signal });
    }

    // Size inputs
    var wInput = this.cache['w-input'];
    var hInput = this.cache['h-input'];
    if (wInput) {
      wInput.addEventListener('input', function () { core.utils.onSizeInput('w'); }, { signal });
      wInput.addEventListener('change', function () { core.historyManager.saveState(); core.growCanvas(); }, { signal });
    }
    if (hInput) {
      hInput.addEventListener('input', function () { core.utils.onSizeInput('h'); }, { signal });
      hInput.addEventListener('change', function () { core.historyManager.saveState(); core.growCanvas(); }, { signal });
    }

    // Background color input
    var bgColorInput = this.cache['bg-color'];
    if (bgColorInput) {
      bgColorInput.addEventListener('input', function () {
        if (core.gridCanvas) core.gridCanvas.style.background = bgColorInput.value;
        if (core.canvas) core.canvas.style.background = bgColorInput.value;
      }, { signal });
    }

    // Clear button
    var clearBtn = this.cache['clear-btn'];
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (core.state.items.length === 0) return;
        core.modalManager.showConfirmModal('Clear all designs?', function () {
          core.historyManager.saveState();
          core.state.items.slice().forEach(function (it) { it.el.remove(); });
          core.state.items.length = 0;
          core.state.selectedIds = [];
          core.selectionManager.updateSelection();
          core.priceManager.updateCount();
          core.priceManager.updatePrice();
          core.historyManager.saveState();
          if (core.hintEl) core.hintEl.style.display = '';
        });
      }, { signal });
    }

    // Snap checkbox (V04 fix): wire to this.state.snapEnabled
    var snapCheckbox = this.cache['snap-btm'];
    if (snapCheckbox) {
      snapCheckbox.addEventListener('change', function () {
        core.state.snapEnabled = snapCheckbox.checked;
      }, { signal });
    }

    // Grid size
    var gridSizeInput = this.cache['grid-size'];
    if (gridSizeInput) {
      gridSizeInput.addEventListener('change', function () {
        core.state.gridSize = parseInt(gridSizeInput.value) || 20;
        core.canvasRenderer.drawGrid();
      }, { signal });
    }

    // Gap size
    var gapSizeInput = this.cache['gap-size'];
    if (gapSizeInput) {
      gapSizeInput.addEventListener('change', function () {
        core.state.gapSize = parseInt(gapSizeInput.value) || 3;
      }, { signal });
    }

    // Submit button
    var submitBtn = this.cache['submit'];
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        core.dispatchAddToCartEvent();
      }, { signal });
    }
  }

  /* ── Update toolbar buttons for delegation ── */
  _updateToolbarForDelegation() {
    var actionMap = {
      'undo-btn': 'undo',
      'redo-btn': 'redo',
      'auto-btn': 'auto-arrange',
      'del-btn': 'delete',
      'dup-btn': 'duplicate',
      'flip-h': 'flip-h',
      'flip-v': 'flip-v',
      'align-left': 'align-left',
      'align-h': 'align-h',
      'align-right': 'align-right',
      'align-top': 'align-top',
      'align-v': 'align-v',
      'align-bot': 'align-bot',
      'text-btn': 'add-text',
      'zoom-fit': 'zoom-fit',
      'export-btn': 'export-pdf',
      'lock-btn': 'lock',
      'mobile-btn': 'mobile'
    };

    for (var id in actionMap) {
      if (!actionMap.hasOwnProperty(id)) continue;
      var btn = this.querySelector('#' + id + '-' + this.sid);
      if (btn) {
        btn.dataset.action = actionMap[id];
        if (!btn.getAttribute('title')) {
          btn.setAttribute('title', actionMap[id].replace(/-/g, ' '));
        }
      }
    }
  }

  /* ── Toolbar action router ── */
  _handleToolbarAction(action) {
    switch (action) {
      case 'undo': this.historyManager.undo(); break;
      case 'redo': this.historyManager.redo(); break;
      case 'auto-arrange': this.alignmentEngine.onAutoArrange(); break;
      case 'delete': this.itemManager.deleteSelected(); break;
      case 'duplicate': this.itemManager.duplicateSelected(); break;
      case 'flip-h': this.itemManager.flipH(); break;
      case 'flip-v': this.itemManager.flipV(); break;
      case 'align-left':
      case 'align-h':
      case 'align-right':
      case 'align-top':
      case 'align-v':
      case 'align-bot':
        this.alignmentEngine.onAlignClick(action.replace('align-', '')); break;
      case 'add-text': this.interactionManager.onTextToolToggle(); break;
      case 'zoom-fit': this.canvasRenderer.zoomToFit(); break;
      case 'export-pdf': this.exportManager.onExportPDF(); break;
      case 'lock': this.itemManager.lockSelected(); break;
      case 'mobile': this.mobileHandler.onMobileToggle(); break;
      default: break;
    }
  }

  /* ── CRITICAL: growCanvas() — wrap.style.height grows, never shrinks ── */

  growCanvas() {
    if (!this.state.items.length) return;
    var maxB = 0;
    this.state.items.forEach(function (it) {
      var b = it.y + it.h;
      if (b > maxB) maxB = b;
    });
    var newH = Math.max(this.CANVAS_H, maxB + 20);
    if (newH > this.CANVAS_H) {
      this.CANVAS_H = newH;
      this.canvasRenderer.drawGrid();
      this.canvasRenderer._syncZoomTransform();
    }
  }

  /* ── CRITICAL: updateCanvasWH() — STUB, must exist ── */

  updateCanvasWH() {
    // STUB — called in zoom/drag hot paths
  }

  /* ── Item operations (delegated forward) ── */

  getSelected() {
    return this.selectionManager.getSelected();
  }

  applyTransform(item) {
    if (!item || !item.el) return;
    var transforms = [];
    transforms.push('scale(' + (item.scaleX || 1) + ', ' + (item.scaleY || 1) + ')');
    if (item.rotation) {
      transforms.push('rotate(' + item.rotation + 'deg)');
    }
    item.el.style.transform = transforms.join(' ');
  }

  /* ── File handling ── */

  handleFileSelect(file) {
    if (!file || !file.type.match('image.*')) return;
    this.state.modalFile = file;
    var modalFname = this.cache['modal-fname'];
    var modalZone = this.cache['modal-zone'];
    var modalAddBtn = this.cache['modal-add'];
    if (modalFname) {
      modalFname.textContent = file.name;
      modalFname.style.display = 'block';
    }
    if (modalZone) {
      var textEl = modalZone.querySelector('.cfg-modal-text');
      var iconEl = modalZone.querySelector('.cfg-modal-icon');
      if (textEl) textEl.textContent = 'File selected';
      if (iconEl) {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      }
    }
    if (modalAddBtn) modalAddBtn.disabled = false;
    this.modalManager.openModal(this.modalEl);
  }

  handleCanvasDrop(e) {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      this.handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  onModalAddClick() {
    var file = this.state.modalFile;
    if (!file) return;
    var modalW = this.cache['modal-w'];
    var modalH = this.cache['modal-h'];
    var modalQty = this.cache['modal-qty'];
    var wMm = parseInt(modalW ? modalW.value : 50) || 50;
    var hMm = parseInt(modalH ? modalH.value : 50) || 50;
    var qty = parseInt(modalQty ? modalQty.value : 1) || 1;

    this.modalManager.closeModal(this.modalEl);

    var reader = new FileReader();
    var core = this;
    reader.onload = function (e) {
      for (var i = 0; i < qty; i++) {
        var item = core.itemManager.addImageItem(e.target.result, false);
        if (item) {
          item.w = wMm / 600 * core.CANVAS_W;
          item.h = hMm / 600 * core.CANVAS_W;
          item.el.style.width = item.w + 'px';
          item.el.style.height = item.h + 'px';
        }
      }
      core.growCanvas();
      core.historyManager.saveState();
      var autoBtn = core.cache['auto-btn'];
      if (autoBtn) autoBtn.click();
    };
    reader.readAsDataURL(file);
  }

  /* ── CustomEvent protocol ── */

  dispatchUpdateEvent() {
    var area = 0;
    this.state.items.forEach(function (it) { area += it.w * it.h; });
    var areaCm = Math.round(area / this.CANVAS_W * 600 / this.CANVAS_W * 600 / 100);
    this.dispatchEvent(new CustomEvent('sticker-configurator:update', {
      bubbles: true,
      detail: {
        itemCount: this.state.items.length,
        totalAreaCm: areaCm,
        type: 'update'
      }
    }));
  }

  dispatchSelectionEvent() {
    this.dispatchEvent(new CustomEvent('sticker-configurator:selection', {
      bubbles: true,
      detail: {
        selectedIds: this.state.selectedIds.slice(),
        count: this.state.selectedIds.length,
        type: 'selection'
      }
    }));
  }

  dispatchPriceEvent() {
    var qty = parseInt(this.qtyEl ? this.qtyEl.textContent : 1) || 1;
    this.dispatchEvent(new CustomEvent('sticker-configurator:price', {
      bubbles: true,
      detail: {
        price: this.state.basePrice * (this.state.items.length || 1) * qty,
        quantity: qty,
        basePrice: this.state.basePrice,
        type: 'price'
      }
    }));
  }

  dispatchAddToCartEvent() {
    this.dispatchEvent(new CustomEvent('sticker-configurator:add-to-cart', {
      bubbles: true,
      detail: {
        variantId: null,
        quantity: parseInt(this.qtyEl ? this.qtyEl.textContent : 1) || 1,
        type: 'add-to-cart'
      }
    }));
  }

  dispatchExportEvent() {
    this.dispatchEvent(new CustomEvent('sticker-configurator:export', {
      bubbles: true,
      detail: {
        type: 'export',
        format: 'pdf'
      }
    }));
  }
}

/* ── Registration ── */
if (!customElements.get('sticker-configurator')) {
  customElements.define('sticker-configurator', StickerConfigurator);
}
