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
    if (axis === 'w') {
      item.w = val;
      item.el.style.width = item.w + 'px';
    } else {
      item.h = val;
      item.el.style.height = item.h + 'px';
    }
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
   CollisionEngine v5 — Binary search wall-collision
   =========================================== */

class CollisionEngine {
  constructor(core) {
    this.core = core;
    this.GAP = 2;
    this.EPSILON = 0.01;
  }

  rectsOverlap(a, b) {
    return (a.x + this.EPSILON) < (b.x + b.w - this.EPSILON) &&
           (b.x + this.EPSILON) < (a.x + a.w - this.EPSILON) &&
           (a.y + this.EPSILON) < (b.y + b.h - this.EPSILON) &&
           (b.y + this.EPSILON) < (a.y + a.h - this.EPSILON);
  }

  _overlapDepths(a, b) {
    var overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return { x: overlapX, y: overlapY };
  }

  constrainPosition(cx, cy, draggedItem, allItems, draggedIds, sx, sy) {
    var w = draggedItem.w, h = draggedItem.h;
    var core = this.core;
    var SKIN = 2;
    var ds = {};
    if (draggedIds) {
      for (var di = 0; di < draggedIds.length; di++) ds[draggedIds[di]] = true;
    }
    function hit(cx, cy, o) {
      return (cx - SKIN + 0.01) < (o.x + o.w + SKIN - 0.01) &&
             (o.x - SKIN + 0.01) < (cx + w + SKIN - 0.01) &&
             (cy - SKIN + 0.01) < (o.y + o.h + SKIN - 0.01) &&
             (o.y - SKIN + 0.01) < (cy + h + SKIN - 0.01);
    }
    for (var i = 0; i < allItems.length; i++) {
      var o = allItems[i];
      if (o.id === draggedItem.id || ds[o.id]) continue;
      if (!hit(cx, cy, o)) continue;
      var fromX = sx != null ? sx : cx;
      var fromY = sy != null ? sy : cy;
      var dirX = cx - fromX;
      var dirY = cy - fromY;
      if (Math.abs(dirX) >= Math.abs(dirY)) {
        cx = dirX > 0 ? o.x - w : o.x + o.w;
      } else {
        cy = dirY > 0 ? o.y - h : o.y + o.h;
      }
      if (hit(cx, cy, o)) {
        if (Math.abs(dirX) >= Math.abs(dirY)) {
          cy = dirY > 0 ? o.y - h : o.y + o.h;
        } else {
          cx = dirX > 0 ? o.x - w : o.x + o.w;
        }
      }
      break;
    }
    cx = Math.max(0, Math.min(core.CANVAS_W - w, cx));
    cy = Math.max(0, Math.min(core.CANVAS_H - h, cy));
    return { x: cx, y: cy };
  }

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

  findAllOverlaps(item, allItems) {
    var results = [];
    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;
      if (this.rectsOverlap(item, other)) {
        results.push({ other: other, depths: this._overlapDepths(item, other) });
      }
    }
    return results;
  }

  hasAnyOverlap(items, excludeIds) {
    var excludeSet = {};
    if (excludeIds) {
      for (var ei = 0; ei < excludeIds.length; ei++) {
        excludeSet[excludeIds[ei]] = true;
      }
    }
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        if (excludeSet[items[i].id] && excludeSet[items[j].id]) continue;
        if (this.rectsOverlap(items[i], items[j])) return true;
      }
    }
    return false;
  }

  findNearestClearSpot(item, allItems) {
    var core = this.core;
    var GAP = this.GAP;
    var w = item.w, h = item.h;
    if (this.findAllOverlaps(item, allItems).length === 0) {
      return { x: item.x, y: item.y };
    }
    var bestX = item.x, bestY = item.y;
    var bestDist = Infinity;
    for (var i = 0; i < allItems.length; i++) {
      var other = allItems[i];
      if (other.id === item.id) continue;
      if (!this.rectsOverlap(item, other)) continue;
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
        ex = Math.max(0, Math.min(core.CANVAS_W - w, ex));
        ey = Math.max(0, Math.min(core.CANVAS_H - h, ey));
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
    if (bestDist === Infinity) return null;
    return { x: bestX, y: bestY };
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
    core.canvas.style.transform = 'scale(' + core.state.zoom + ') translate(' + (core.state.panX / core.state.zoom) + 'px, ' + (core.state.panY / core.state.zoom) + 'px)';
    core.canvas.style.transformOrigin = '0 0';
    var zoomDisplay = core.querySelector('#zoom-display-' + core.sid);
    if (zoomDisplay) {
      zoomDisplay.textContent = Math.round(core.state.zoom * 100) + '%';
    }
  }

  clampPan() {
    var core = this.core;
    if (!core.canvas) return;
    var rect = core.canvas.getBoundingClientRect();
    var maxPanX = Math.max(0, core.CANVAS_W * core.state.zoom - rect.width);
    var maxPanY = Math.max(0, core.CANVAS_H * core.state.zoom - rect.height);
    core.state.panX = Math.max(0, Math.min(maxPanX, core.state.panX || 0));
    core.state.panY = Math.max(0, Math.min(maxPanY, core.state.panY || 0));
  }

  zoomToFit() {
    var core = this.core;
    if (!core.canvas) return;
    var wrapW = core.wrap ? core.wrap.clientWidth : core.CANVAS_W;
    var wrapH = core.wrap ? (core.wrap.clientHeight || core.CANVAS_H) : core.CANVAS_H;
    var zoomX = (wrapW - 20) / core.CANVAS_W;
    var zoomY = (wrapH - 20) / core.CANVAS_H;
    core.state.zoom = Math.max(1, Math.min(5, Math.min(zoomX, zoomY)));
    core.state.panX = 0;
    core.state.panY = 0;
    this.applyZoom();
  }

  getCanvasXY(e) {
    var core = this.core;
    if (!core.canvas) return { x: 0, y: 0 };
    var rect = core.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / core.state.zoom - core.state.panX,
      y: (e.clientY - rect.top) / core.state.zoom - core.state.panY
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

    sel.forEach(function (it) {
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
      it.el.style.left = x + 'px';
      it.el.style.top = y + 'px';
      x += it.w + gapPx;
      col++;
      if (it.h > rowH) rowH = it.h;
    });
    core.historyManager.saveState();
    core.growCanvas();
    core.dispatchUpdateEvent();
  }

  distributeHorizontal() {
    var sel = this.core.selectionManager.getSelected();
    if (sel.length < 3) return;
    this.core.historyManager.saveState();

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
      sel[j].el.style.left = curX + 'px';
      curX += sel[j].w + gap;
    }

    this.core.historyManager.saveState();
    this.core.growCanvas();
  }

  distributeVertical() {
    var sel = this.core.selectionManager.getSelected();
    if (sel.length < 3) return;
    this.core.historyManager.saveState();

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
      sel[j].el.style.top = curY + 'px';
      curY += sel[j].h + gap;
    }

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
    var isMobile = window.innerWidth < 768 ||
      ('ontouchstart' in window && window.innerWidth < 1024);
    if (isMobile) {
      this.onMobileToggle();
    }
  }

  onMobileToggle() {
    var core = this.core;
    core.state.mobile = !core.state.mobile;
    core.classList.toggle('mobile-mode', core.state.mobile);

    if (core.state.mobile) {
      // CRITICAL: clear wrap.style.height on mobile, but NEVER clear canvas.style.height
      if (core.wrap) core.wrap.style.height = '';
    } else {
      // Restore canvas height and wrap height
      if (core.canvas) core.canvas.style.height = core.CANVAS_H + 'px';
      if (core.wrap) core.wrap.style.height = core.CANVAS_H + 'px';
    }

    // Update mobile button icon
    if (core.mobileBtn) {
      core.mobileBtn.innerHTML = core.state.mobile
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
    }

    setTimeout(function () { core.canvasRenderer.zoomToFit(); }, 100);
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
      if (textEl) textEl.textContent = 'Click to choose a design file';
      if (iconEl) iconEl.innerHTML = '&#x1F5BC;';
    }
    if (core.modalEl) core.modalEl.style.display = 'flex';
    if (core.fileInput) core.fileInput.value = '';
    this.trapFocus(core.modalEl);
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
    var modal = document.createElement('div');
    modal.className = 'cfg-modal';
    modal.style.display = 'flex';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (htmlStructure) {
      modal.innerHTML = htmlStructure;
    }
    document.body.appendChild(modal);
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

    var handler = function (e) {
      if (e.key === 'Escape') {
        container.style.display = 'none';
        container.remove();
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

    container.addEventListener('keydown', handler, { signal: this.core.abortController.signal });
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
      core.state.selectedIds = [];
      core.selectionManager.updateSelection();
      var visibleModal = core.querySelector('.cfg-modal[style*="display: flex"]');
      if (!visibleModal) {
        visibleModal = core.querySelector('.cfg-modal');
        if (visibleModal && visibleModal.style.display !== 'none') {
          visibleModal.style.display = 'none';
        }
      }
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
   =========================================== */

class InteractionManager {
  constructor(core) {
    this.core = core;
  }

  onMouseDown(e) {
    var core = this.core;
    core.updateCanvasWH();
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

      // Middle-click pan
      if (e.button === 1) {
        core.state.dragState = { type: 'pan', ox: e.clientX, oy: e.clientY };
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
    if (!core.state.dragState) return;
    var ds = core.state.dragState;

    if (ds.type === 'pan') {
      core.state.panX += e.clientX - ds.ox;
      core.state.panY += e.clientY - ds.oy;
      ds.ox = e.clientX;
      ds.oy = e.clientY;
      core.canvasRenderer.clampPan();
      core.canvasRenderer.applyZoom();
      return;
    }

    if (ds.type === 'move') {
      var prevX = ds._lastX != null ? ds._lastX : ds.ox;
      var prevY = ds._lastY != null ? ds._lastY : ds.oy;
      var dx = (e.clientX - prevX) / core.state.zoom;
      var dy = (e.clientY - prevY) / core.state.zoom;
      ds._lastX = e.clientX;
      ds._lastY = e.clientY;
      ds.ids.forEach(function (id) {
        var item = core.state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        var candidateX = item.x + dx;
        var candidateY = item.y + dy;
        candidateX = Math.max(0, Math.min(core.CANVAS_W - item.w, candidateX));
        candidateY = Math.max(0, candidateY);
        var result = core.collisionEngine.constrainPosition(
          candidateX, candidateY, item, core.state.items, ds.ids,
          item.x, item.y
        );
        item.x = result.x;
        item.y = result.y;
        item.el.style.left = result.x + 'px';
        item.el.style.top = result.y + 'px';
      });

      core.selectionManager.updateGuides(
        core.state.items.find(function (i) { return i.id === ds.ids[0]; }),
        core.state.items
      );
      return;
    }

    if (ds.type === 'resize') {
      var item = core.state.items.find(function (i) { return i.id === ds.id; });
      if (!item) return;
      var dx = (e.clientX - ds.ox) / core.state.zoom;
      var dy = (e.clientY - ds.oy) / core.state.zoom;
      if (ds.handle.indexOf('e') > -1) item.w = Math.max(30, ds.sw + dx);
      if (ds.handle.indexOf('w') > -1) {
        var nw = Math.max(30, ds.sw - dx);
        item.x = ds.sx + ds.sw - nw;
        item.w = nw;
      }
      if (ds.handle.indexOf('s') > -1) item.h = Math.max(30, ds.sh + dy);
      if (ds.handle.indexOf('n') > -1) {
        var nh = Math.max(30, ds.sh - dy);
        item.y = ds.sy + ds.sh - nh;
        item.h = nh;
      }
      item.x = Math.max(0, Math.min(core.CANVAS_W - item.w, item.x));
      item.y = Math.max(0, item.y);
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
      item.el.style.width = item.w + 'px';
      item.el.style.height = item.h + 'px';
      core.utils.updateSizeInfo(item);
      return;
    }

    if (ds.type === 'rotate') {
      var item = core.state.items.find(function (i) { return i.id === ds.id; });
      if (!item) return;
      var cx = item.x + item.w / 2;
      var cy = item.y + item.h / 2;
      var angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      item.rotation = angle - ds.startAngle;
      core.applyTransform(item);
      return;
    }

    if (ds.type === 'selbox') {
      var selBox = core.querySelector('.sel-box');
      if (!selBox) return;
      var rect = core.canvas.getBoundingClientRect();
      var x1 = (ds.sx - rect.left) / core.state.zoom - core.state.panX;
      var y1 = (ds.sy - rect.top) / core.state.zoom - core.state.panY;
      var x2 = (e.clientX - rect.left) / core.state.zoom - core.state.panX;
      var y2 = (e.clientY - rect.top) / core.state.zoom - core.state.panY;
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

    if (ds.type === 'selbox') {
      var selBox = core.querySelector('.sel-box');
      if (selBox) selBox.style.display = 'none';
      var rect = core.canvas.getBoundingClientRect();
      var x1 = (ds.sx - rect.left) / core.state.zoom - core.state.panX;
      var y1 = (ds.sy - rect.top) / core.state.zoom - core.state.panY;
      var x2 = (e.clientX - rect.left) / core.state.zoom - core.state.panX;
      var y2 = (e.clientY - rect.top) / core.state.zoom - core.state.panY;
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

      // Use nearest clear spot if overlap persists
      ds.ids.forEach(function (id) {
        var dragged = core.state.items.find(function (i) { return i.id === id; });
        if (!dragged) return;
        var next = core.collisionEngine.findNearestClearSpot(dragged, core.state.items);
        if (next) {
          dragged.x = next.x;
          dragged.y = next.y;
          dragged.el.style.left = next.x + 'px';
          dragged.el.style.top = next.y + 'px';
        }
        dragged.el.style.opacity = '';
        dragged.el.style.outline = '';
      });
      core.historyManager.saveState();
      core.growCanvas();
      core.dispatchUpdateEvent();
    }

    if (ds.type === 'resize' || ds.type === 'rotate') {
      core.historyManager.saveState();
      core.growCanvas();
      core.dispatchUpdateEvent();
    }

    core.state.dragState = null;
  }

  onTouchStart(e) {
    var core = this.core;
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
        core.state.touchStarted = { ox: t.clientX, oy: t.clientY, type: 'pan', sel: true };
        return;
      }
      this.startDrag({ clientX: t.clientX, clientY: t.clientY }, cid);
      return;
    }

    core.state.selectedIds = [];
    core.selectionManager.updateSelection();
    core.state.touchStarted = { ox: t.clientX, oy: t.clientY, type: 'pan' };
  }

  onTouchMove(e) {
    var core = this.core;
    if (e.touches.length === 2) {
      // Pinch zoom
      var t1 = e.touches[0], t2 = e.touches[1];
      var dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (core.state.lastTouchDist > 0) {
        var scale = dist / core.state.lastTouchDist;
        core.state.zoom = Math.max(1, Math.min(5, core.state.zoom * scale));
        core.canvasRenderer.applyZoom();
      }
      core.state.lastTouchDist = dist;
      return;
    }

    if (!core.state.dragState && core.state.touchStarted && e.touches.length === 1) {
      var t = e.touches[0];
      if (core.state.touchStarted.sel) return;
      var dx = t.clientX - core.state.touchStarted.ox;
      var dy = t.clientY - core.state.touchStarted.oy;
      if (Math.abs(dx) < 20) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
      e.preventDefault();
      core.state.panX += dx;
      core.state.panY += dy;
      core.state.touchStarted.ox = t.clientX;
      core.state.touchStarted.oy = t.clientY;
      core.canvasRenderer.applyZoom();
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
      ds._lastX = t.clientX;
      ds._lastY = t.clientY;

      var dx = (t.clientX - ds.ox) / core.state.zoom;
      var dy = (t.clientY - ds.oy) / core.state.zoom;
      ds.ids.forEach(function (id) {
        var item = core.state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        var candidateX = item.x + dx;
        var candidateY = item.y + dy;
        candidateX = Math.max(0, Math.min(core.CANVAS_W - item.w, candidateX));
        candidateY = Math.max(0, candidateY);
        var result = core.collisionEngine.constrainPosition(
          candidateX, candidateY, item, core.state.items, ds.ids,
          item.x, item.y
        );
        item.x = result.x;
        item.y = result.y;
        item.el.style.left = result.x + 'px';
        item.el.style.top = result.y + 'px';
      });
    } else if (ds.type === 'resize') {
      var item = core.state.items.find(function (i) { return i.id === ds.id; });
      if (!item) return;
      var dx = (t.clientX - ds.ox) / core.state.zoom;
      var dy = (t.clientY - ds.oy) / core.state.zoom;
      if (ds.handle.indexOf('e') > -1) item.w = Math.max(30, ds.sw + dx);
      if (ds.handle.indexOf('w') > -1) {
        var nw = Math.max(30, ds.sw - dx);
        item.x = ds.sx + ds.sw - nw;
        item.w = nw;
      }
      if (ds.handle.indexOf('s') > -1) item.h = Math.max(30, ds.sh + dy);
      if (ds.handle.indexOf('n') > -1) {
        var nh = Math.max(30, ds.sh - dy);
        item.y = ds.sy + ds.sh - nh;
        item.h = nh;
      }
      item.x = Math.max(0, Math.min(core.CANVAS_W - item.w, item.x));
      item.y = Math.max(0, item.y);
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
      item.el.style.width = item.w + 'px';
      item.el.style.height = item.h + 'px';
      core.utils.updateSizeInfo(item);
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

      core.state.dragState.ids.forEach(function (id) {
        var dragged = core.state.items.find(function (i) { return i.id === id; });
        if (!dragged) return;
        var next = core.collisionEngine.findNearestClearSpot(dragged, core.state.items);
        if (next) {
          dragged.x = next.x;
          dragged.y = next.y;
          dragged.el.style.left = next.x + 'px';
          dragged.el.style.top = next.y + 'px';
        }
        dragged.el.style.opacity = '';
        dragged.el.style.outline = '';
      });
      core.historyManager.saveState();
      core.growCanvas();
    } else if (core.state.dragState &&
      (core.state.dragState.type === 'resize' || core.state.dragState.type === 'rotate')) {
      core.historyManager.saveState();
      core.growCanvas();
    }
    core.state.dragState = null;
    core.state.touchStarted = null;
    core.state.lastTouchDist = 0;
  }

  onWheel(e) {
    var core = this.core;
    e.preventDefault();
    var delta = e.deltaY > 0 ? -0.1 : 0.1;
    core.state.zoom = Math.max(1, Math.min(5, core.state.zoom + delta));
    core.canvasRenderer.applyZoom();
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
/* ===========================================
   StickerConfigurator — Entry Point
   ES6 class extends HTMLElement
   Light DOM for Shopify theme compatibility
   Orchestrates 15 submodules via constructor injection
   Snap-to-grid (V03), collision (V02), distribute (V16) integrated
   =========================================== */

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
    this.state = null;
    this.wrap = null;
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
    this.sid = this.dataset.sectionId;

    // DOM caching (V07 fix): cache all commonly-queried elements
    this.cache = {};
    this._cacheDomRefs();

    // CRITICAL: CANVAS_W = wrap.clientWidth — FROZEN, do not reassign
    var CANVAS_W = this.wrap ? this.wrap.clientWidth : 600;
    this.CANVAS_W = CANVAS_W;
    this.CANVAS_H = Math.round(CANVAS_W * 400 / 600);

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

    // Set canvas heights at init
    if (this.canvas) {
      this.canvas.style.height = this.CANVAS_H + 'px';
    }
    if (this.wrap) {
      this.wrap.style.height = this.CANVAS_H + 'px';
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
      'canvas-wrap', 'canvas', 'grid-canvas', 'hint', 'file-input', 'modal',
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
      this.canvas.addEventListener('wheel', function (e) { core.interactionManager.onWheel(e); }, { signal });
      this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { signal });

      this.canvas.addEventListener('touchstart', function (e) { core.interactionManager.onTouchStart(e); }, { signal, passive: false });
      this.canvas.addEventListener('touchmove', function (e) { core.interactionManager.onTouchMove(e); }, { signal, passive: false });
      this.canvas.addEventListener('touchend', function (e) { core.interactionManager.onTouchEnd(e); }, { signal, passive: true });

      this.canvas.addEventListener('drop', function (e) { core.handleCanvasDrop(e); }, { signal });
      this.canvas.addEventListener('dragover', function (e) { e.preventDefault(); }, { signal });
    }

    // Keyboard
    document.addEventListener('keydown', function (e) { core.keyboardManager.onKeyDown(e); }, { signal });

    // Add design button
    var addBtn = this.cache['add-btn'];
    if (addBtn) {
      addBtn.addEventListener('click', function () { core.modalManager.showAddDesignModal(); }, { signal });
    }

    // Modal events
    var modalCancel = this.cache['modal-cancel'];
    if (modalCancel) {
      modalCancel.addEventListener('click', function () { if (core.modalEl) core.modalEl.style.display = 'none'; }, { signal });
    }
    var modalZone = this.cache['modal-zone'];
    if (modalZone) {
      modalZone.addEventListener('click', function () { if (core.fileInput) core.fileInput.click(); }, { signal });
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
      if (this.canvas) this.canvas.style.height = newH + 'px';
      if (this.wrap) this.wrap.style.height = newH + 'px';
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
      if (iconEl) iconEl.innerHTML = '&#x2705;';
    }
    if (modalAddBtn) modalAddBtn.disabled = false;
    if (this.modalEl) this.modalEl.style.display = 'flex';
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

    if (this.modalEl) this.modalEl.style.display = 'none';

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
