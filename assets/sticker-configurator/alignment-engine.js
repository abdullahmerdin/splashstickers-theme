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
