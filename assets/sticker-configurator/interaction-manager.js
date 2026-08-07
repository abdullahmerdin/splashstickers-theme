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

  moveDraggedItems(ds, dx, dy) {
    var draggedItems = this._dragItems(ds.ids);
    if (!draggedItems.length) return draggedItems;

    // Dragging is deliberately free so artwork can pass over occupied areas.
    // Collision and bounds remain non-blocking feedback during the gesture;
    // onMouseUp/onTouchEnd reject an illegal drop and restore startPos.
    draggedItems.forEach(function (item) {
      item.x += dx;
      item.y += dy;
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
    });
    this._setMoveVisual(ds, this._isMoveIllegal(ds));
    return draggedItems;
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
      var draggedItems = im.moveDraggedItems(ds, dx, dy);

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

      // Illegal positions are allowed during the gesture, but never accepted.
      // Snapping is validated too so it cannot turn a legal drop into an overlap.
      if (ds.illegal) {
        this._restoreMove(ds);
      } else if (core.state.snapEnabled) {
        var beforeSnap = this._snapshotMovePositions(ds);
        var snapItems = [];
        ds.ids.forEach(function (id) {
          var dragged = core.state.items.find(function (i) { return i.id === id; });
          if (dragged) snapItems.push(dragged);
        });
        core.snapEngine.applySnap(snapItems);
        if (this._isMoveIllegal(ds)) this._restoreMovePositions(beforeSnap);
      }
      this._clearMoveVisual(ds);
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
      e.preventDefault();
      this._cancelTouchInteraction(true);
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
        e.preventDefault();
        if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        this.startResize({ clientX: t.clientX, clientY: t.clientY }, cid, e.target.dataset.handle);
        return;
      }
      if (e.target.classList.contains('rot-handle')) {
        e.preventDefault();
        if (core.state.selectedIds.indexOf(cid) === -1) {
          core.state.selectedIds = [cid];
          core.selectionManager.updateSelection();
        }
        this.startRotate({ clientX: t.clientX, clientY: t.clientY }, cid);
        return;
      }
      var item = core.state.items.find(function (candidate) { return candidate.id === cid; });
      e.preventDefault();
      core.state.touchStarted = {
        id: cid,
        x: t.clientX,
        y: t.clientY,
        moved: false,
        wasSelected: core.state.selectedIds.indexOf(cid) > -1,
        locked: Boolean(item && item.locked)
      };
      return;
    }

    // Empty-canvas gestures pan after a short intent threshold. A tap clears
    // selection, while a drag keeps the canvas viewport moving.
    core.state.touchStarted = {
      id: null,
      x: t.clientX,
      y: t.clientY,
      moved: false,
      wasSelected: false,
      locked: false
    };
  }

  _dragItems(ids) {
    var core = this.core;
    return (ids || []).map(function (id) {
      return core.state.items.find(function (item) { return item.id === id; });
    }).filter(Boolean);
  }

  _isMoveIllegal(ds) {
    var core = this.core;
    return this._dragItems(ds.ids).some(function (item) {
      return !core.collisionEngine.canPlace(item, core.state.items, ds.ids);
    });
  }

  _setMoveVisual(ds, illegal) {
    var core = this.core;
    (ds.ids || []).forEach(function (id) {
      var item = core.state.items.find(function (candidate) { return candidate.id === id; });
      if (!item || !item.el) return;
      item.el.classList.toggle('is-illegal', Boolean(illegal));
      item.el.style.opacity = '';
      item.el.style.filter = '';
      item.el.style.outline = '';
    });
    ds.illegal = Boolean(illegal);
  }

  _restoreMove(ds) {
    var core = this.core;
    (ds.ids || []).forEach(function (id) {
      var item = core.state.items.find(function (candidate) { return candidate.id === id; });
      var start = ds.startPos && ds.startPos[id];
      if (!item || !start) return;
      item.x = start.x;
      item.y = start.y;
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
    });
  }

  _snapshotMovePositions(ds) {
    var core = this.core;
    return (ds.ids || []).map(function (id) {
      var item = core.state.items.find(function (candidate) { return candidate.id === id; });
      return item ? { id: id, x: item.x, y: item.y } : null;
    }).filter(Boolean);
  }

  _restoreMovePositions(positions) {
    var core = this.core;
    (positions || []).forEach(function (position) {
      var item = core.state.items.find(function (candidate) { return candidate.id === position.id; });
      if (!item) return;
      item.x = position.x;
      item.y = position.y;
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
    });
  }

  _clearMoveVisual(ds) {
    var core = this.core;
    (ds && ds.ids || []).forEach(function (id) {
      var item = core.state.items.find(function (candidate) { return candidate.id === id; });
      if (!item || !item.el) return;
      item.el.classList.remove('is-illegal');
      item.el.classList.remove('is-dragging');
      item.el.style.opacity = '';
      item.el.style.filter = '';
      item.el.style.outline = '';
    });
  }

  onTouchMove(e) {
    var core = this.core;
    var im = this;
    if (e.touches.length === 2) {
      // Pinch zoom
      e.preventDefault();
      if (core.state.dragState || core.state.touchStarted) {
        this._cancelTouchInteraction(true);
      }
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

    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    if (!core.state.dragState && core.state.touchStarted) {
      var pending = core.state.touchStarted;
      if (Math.hypot(t.clientX - pending.x, t.clientY - pending.y) < 7) return;
      pending.moved = true;
      e.preventDefault();
      core.state.touchStarted = null;
      if (pending.id != null && !pending.locked) {
        if (!pending.wasSelected) {
          if (core.state.multiSelectMode) {
            core.selectionManager.toggleSelect(pending.id, true);
          } else {
            core.state.selectedIds = [pending.id];
            core.selectionManager.updateSelection();
          }
        }
        this.startDrag({ clientX: pending.x, clientY: pending.y }, pending.id);
      } else {
        core.state.dragState = {
          type: 'pan',
          ox: pending.x,
          oy: pending.y,
          scrollX: core.wrap ? core.wrap.scrollLeft : 0,
          scrollY: core.wrap ? core.wrap.scrollTop : 0
        };
        if (core.wrap) core.wrap.classList.add('is-panning');
      }
    }
    if (!core.state.dragState) return;
    e.preventDefault();
    var ds = core.state.dragState;

    if (ds.type === 'pan') {
      if (!core.wrap) return;
      core.wrap.scrollLeft = ds.scrollX - (t.clientX - ds.ox);
      core.wrap.scrollTop = ds.scrollY - (t.clientY - ds.oy);
      core.canvasRenderer.clampPan();
    } else if (ds.type === 'move') {
      // Ignore sub-pixel touch noise without making the first drag movement feel sticky.
      var mx = t.clientX - (ds._lastX || ds.ox);
      var my = t.clientY - (ds._lastY || ds.oy);
      if (Math.abs(mx) < 0.5 && Math.abs(my) < 0.5) {
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
      im.moveDraggedItems(ds, dx, dy);
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
    if (e.touches && e.touches.length > 0) {
      core.state.lastTouchDist = 0;
      return;
    }
    if (core.state.touchStarted) {
      var pending = core.state.touchStarted;
      core.state.touchStarted = null;
      if (!pending.moved) {
        if (pending.id != null) {
          if (core.state.multiSelectMode) {
            var selectedIndex = core.state.selectedIds.indexOf(pending.id);
            core.selectionManager.toggleSelect(pending.id, selectedIndex === -1);
          } else {
            core.state.selectedIds = [pending.id];
            core.selectionManager.updateSelection();
          }
        } else if (!core.state.multiSelectMode) {
          core.state.selectedIds = [];
          core.selectionManager.updateSelection();
        }
      }
      core.state.lastTouchDist = 0;
      return;
    }
    if (core.state.dragState && core.state.dragState.type === 'move') {
      if (core.guideH) core.guideH.style.display = 'none';
      if (core.guideV) core.guideV.style.display = 'none';

      if (core.state.dragState.illegal) {
        this._restoreMove(core.state.dragState);
      } else if (core.state.snapEnabled) {
        var beforeSnap = this._snapshotMovePositions(core.state.dragState);
        var snapItems = [];
        core.state.dragState.ids.forEach(function (id) {
          var dragged = core.state.items.find(function (i) { return i.id === id; });
          if (dragged) snapItems.push(dragged);
        });
        core.snapEngine.applySnap(snapItems);
        if (this._isMoveIllegal(core.state.dragState)) {
          this._restoreMovePositions(beforeSnap);
        }
      }
      this._clearMoveVisual(core.state.dragState);
      core.historyManager.saveState();
      core.growCanvas();
      core.dispatchUpdateEvent();
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
    if (core.state.dragState && core.state.dragState.type === 'move') {
      this._clearMoveVisual(core.state.dragState);
    }
    if (core.guideH) core.guideH.style.display = 'none';
    if (core.guideV) core.guideV.style.display = 'none';
    if (core.wrap) core.wrap.classList.remove('is-panning');
    core.state.dragState = null;
    core.state.touchStarted = null;
    core.state.lastTouchDist = 0;
  }

  onTouchCancel() {
    this._cancelTouchInteraction(true);
    this.core.state.touchStarted = null;
    this.core.state.lastTouchDist = 0;
  }

  _cancelTouchInteraction(revert) {
    var core = this.core;
    var ds = core.state.dragState;
    if (revert && ds) {
      if (ds.type === 'move' && ds.startPos) {
        ds.ids.forEach(function (id) {
          var item = core.state.items.find(function (candidate) { return candidate.id === id; });
          var start = ds.startPos[id];
          if (!item || !start) return;
          item.x = start.x;
          item.y = start.y;
          item.el.style.left = item.x + 'px';
          item.el.style.top = item.y + 'px';
        });
      } else if (ds.type === 'resize') {
        var resized = core.state.items.find(function (candidate) { return candidate.id === ds.id; });
        if (resized) {
          resized.x = ds.sx;
          resized.y = ds.sy;
          resized.w = ds.sw;
          resized.h = ds.sh;
          resized.el.style.left = resized.x + 'px';
          resized.el.style.top = resized.y + 'px';
          resized.el.style.width = resized.w + 'px';
          resized.el.style.height = resized.h + 'px';
          core.utils.updateSizeInfo(resized);
        }
      } else if (ds.type === 'rotate') {
        var rotated = core.state.items.find(function (candidate) { return candidate.id === ds.id; });
        if (rotated) {
          rotated.rotation = ds.startRotation;
          core.applyTransform(rotated);
        }
      }
    }
    if (ds && ds.type === 'move') this._clearMoveVisual(ds);
    if (core.wrap) core.wrap.classList.remove('is-panning');
    core.state.dragState = null;
    core.state.touchStarted = null;
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

    var center = this._itemClientCenter(item);
    var requestedAngle = Math.atan2(clientY - center.y, clientX - center.x) * 180 / Math.PI - ds.startAngle;
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
      _lastX: e.clientX, _lastY: e.clientY,
      ids: ids,
      startPos: startPos,
      illegal: false
    };
    ids.forEach(function (selectedId) {
      var selected = core.state.items.find(function (candidate) { return candidate.id === selectedId; });
      if (selected && selected.el) selected.el.classList.add('is-dragging');
    });
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
    var center = this._itemClientCenter(item);
    var startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180 / Math.PI - item.rotation;
    core.state.dragState = {
      type: 'rotate',
      ox: e.clientX, oy: e.clientY,
      id: id,
      startAngle: startAngle,
      startRotation: item.rotation || 0
    };
  }

  _itemClientCenter(item) {
    var core = this.core;
    var canvasRect = core.canvas.getBoundingClientRect();
    return {
      x: canvasRect.left + (item.x + item.w / 2) * core.state.zoom,
      y: canvasRect.top + (item.y + item.h / 2) * core.state.zoom
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
            var fontSizePx = core.utils ? core.utils.mmToPx(data.fontSize) : data.fontSize;
            core.itemManager.addTextItem(data.text, fontSizePx, false, data.color, data.bgColor, data.fontWeight, data.fontStyle, data.textAlign);
            core.state.textToolActive = false;
            if (core.canvas) core.canvas.style.cursor = 'default';
          }
        }
      );
    }
  }
}
