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
    var im = this;
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
      var itemsArr = core.state.items;
      draggedItems.forEach(function (item) {
        var candidateX = item.x + dx;
        var candidateY = item.y + dy;
        candidateX = Math.max(0, Math.min(core.CANVAS_W - item.w, candidateX));
        candidateY = Math.max(0, candidateY);
        var result = ce.constrainPosition(
          candidateX, candidateY, item, itemsArr, ds.ids,
          item.x, item.y  // startX/startY unused in v3, kept for ABI compat
        );
        item.x = result.x;
        item.y = result.y;
        item.el.style.left = result.x + 'px';
        item.el.style.top = result.y + 'px';

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

      // Re-check minimums after clamping
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
    var im = this;
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
      draggedItems.forEach(function (item) {
        var candidateX = item.x + dx;
        var candidateY = item.y + dy;
        candidateX = Math.max(0, Math.min(core.CANVAS_W - item.w, candidateX));
        candidateY = Math.max(0, candidateY);
        var result = ce.constrainPosition(
          candidateX, candidateY, item, itemsArr, ds.ids,
          item.x, item.y
        );
        item.x = result.x;
        item.y = result.y;
        item.el.style.left = result.x + 'px';
        item.el.style.top = result.y + 'px';

        // Visual feedback for overlap (V3: use helper)
        im.applyOverlapVisual(item, itemsArr, ds.ids);
      });
    } else if (ds.type === 'resize') {
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

      // Re-check minimums after clamping
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
