/* ===========================================
   CollisionEngine — Push-apart overlap resolution
   =========================================== */

class CollisionEngine {
  constructor(core) {
    this.core = core;
  }

  rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  _pushApart(a, b) {
    var dx2 = (a.x + a.w / 2) - (b.x + b.w / 2);
    var dy2 = (a.y + a.h / 2) - (b.y + b.h / 2);
    if (Math.abs(dx2) > Math.abs(dy2)) {
      var push = dx2 > 0 ? 4 : -4;
      a.x += push; b.x -= push;
    } else {
      var push = dy2 > 0 ? 4 : -4;
      a.y += push; b.y -= push;
    }
  }

  resolveOverlaps(items, draggedIds) {
    var core = this.core;
    for (var p = 0; p < 5; p++) {
      var ov = false;
      for (var ai = 0; ai < items.length; ai++) {
        for (var bi = ai + 1; bi < items.length; bi++) {
          var a = items[ai], b = items[bi];
          if (this.rectsOverlap(a, b)) {
            ov = true;
            this._pushApart(a, b);
          }
        }
      }
      if (!ov) break;
    }

    // Clamp and update positions
    if (draggedIds) {
      draggedIds.forEach(function (id) {
        var item = core.state.items.find(function (i) { return i.id === id; });
        if (!item) return;
        item.x = Math.max(0, Math.min(core.CANVAS_W - item.w, item.x));
        item.y = Math.max(0, item.y);
        item.el.style.left = item.x + 'px';
        item.el.style.top = item.y + 'px';
      });
    }
  }
}
