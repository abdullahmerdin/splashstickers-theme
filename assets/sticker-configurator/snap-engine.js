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
    var gridMm = this.core.state.gridSize || 20;
    var g = this.core.utils ? this.core.utils.mmToPx(gridMm) : gridMm;
    items.forEach(function (it) {
      if (!it) return;
      it.x = this.snapVal(it.x, g);
      it.y = this.snapVal(it.y, g);
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
    }, this);
  }
}
