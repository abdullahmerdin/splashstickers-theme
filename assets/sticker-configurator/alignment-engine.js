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

  onAutoArrange(options) {
    var core = this.core;
    if (!core.state.items.length) return false;
    options = options || {};
    if (!options.skipInitialHistory) core.historyManager.saveState();
    var previousHeight = core.CANVAS_H;
    var previous = core.state.items.map(function (item) {
      return { item: item, x: item.x, y: item.y };
    });
    var gapPx = Math.max(0, core.utils.mmToPx(core.state.gapSize));
    var entries = core.state.items.map(function (item, index) {
      var rect = core.collisionEngine.getCollisionRect(item);
      return {
        item: item,
        index: index,
        w: rect.w,
        h: rect.h,
        offsetX: rect.x - item.x,
        offsetY: rect.y - item.y
      };
    });

    // Largest artwork first gives a compact, deterministic layout.
    entries.sort(function (a, b) {
      return (b.w * b.h) - (a.w * a.h) || b.h - a.h || a.index - b.index;
    });

    var placedRects = [];
    var maxBottom = 0;
    var failed = false;

    entries.forEach(function (entry) {
      if (failed) return;
      if (entry.w > core.CANVAS_W + core.collisionEngine.EPSILON) {
        failed = true;
        return;
      }

      // Try every newly exposed right and bottom edge. Unlike a shelf layout,
      // this lets shorter artwork fill the space below taller neighbours.
      var xCandidates = [0];
      var yCandidates = [0];
      placedRects.forEach(function (rect) {
        xCandidates.push(rect.x + rect.w + gapPx);
        yCandidates.push(rect.y + rect.h + gapPx);
      });
      xCandidates.sort(function (a, b) { return a - b; });
      yCandidates.sort(function (a, b) { return a - b; });

      var slot = null;
      for (var yi = 0; yi < yCandidates.length && !slot; yi++) {
        for (var xi = 0; xi < xCandidates.length; xi++) {
          var candidate = { x: xCandidates[xi], y: yCandidates[yi], w: entry.w, h: entry.h };
          if (candidate.x + candidate.w > core.CANVAS_W + core.collisionEngine.EPSILON) continue;
          var blocked = placedRects.some(function (rect) {
            return core.collisionEngine.rectsOverlap(candidate, rect, gapPx);
          });
          if (!blocked) {
            slot = candidate;
            break;
          }
        }
      }

      // The bottom edge of the current arrangement is always a valid new row.
      if (!slot) {
        var bottom = placedRects.reduce(function (value, rect) {
          return Math.max(value, rect.y + rect.h);
        }, 0);
        slot = { x: 0, y: bottom > 0 ? bottom + gapPx : 0, w: entry.w, h: entry.h };
      }

      entry.item.x = slot.x - entry.offsetX;
      entry.item.y = slot.y - entry.offsetY;
      placedRects.push(slot);
      maxBottom = Math.max(maxBottom, slot.y + slot.h);
    });

    // Vertical growth must happen before collision validation.
    if (!failed && maxBottom > core.CANVAS_H) {
      core.CANVAS_H = Math.ceil(maxBottom);
      core.canvasRenderer.drawGrid();
      core.canvasRenderer._syncZoomTransform();
    }

    var valid = !failed &&
      entries.every(function (entry) {
        return core.collisionEngine.isInsideCanvas(entry.item);
      }) &&
      !core.collisionEngine.hasAnyOverlap(core.state.items);

    if (!valid) {
      previous.forEach(function (snapshot) {
        snapshot.item.x = snapshot.x;
        snapshot.item.y = snapshot.y;
      });
      core.CANVAS_H = previousHeight;
      core.canvasRenderer.drawGrid();
      core.canvasRenderer._syncZoomTransform();
      core.state.items.forEach(function (item) {
        item.el.style.left = item.x + 'px';
        item.el.style.top = item.y + 'px';
      });
      var stats = core.cache ? core.cache.stats : null;
      if (stats) stats.textContent = 'A design is too wide for the 600 mm workspace.';
      return false;
    }

    core.state.items.forEach(function (it) {
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    });
    core.historyManager.saveState();
    core.growCanvas();
    core.dispatchUpdateEvent();
    return true;
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
