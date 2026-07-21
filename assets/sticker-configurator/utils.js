/* ===========================================
   Utils — Unit conversion, size helpers
   =========================================== */

class Utils {
  constructor(core) {
    this.core = core;
  }

  getWorkspaceWidthMm() {
    return Math.max(1, Number(this.core.SHEET_WIDTH_MM) || 600);
  }

  getWorkspaceHeightMm() {
    return this.pxToMm(this.core.CANVAS_H);
  }

  getPixelsPerMm() {
    return Math.max(0.001, this.core.CANVAS_W / this.getWorkspaceWidthMm());
  }

  pxToMm(px) {
    return Number(px) / this.getPixelsPerMm();
  }

  mmToPx(mm) {
    return Number(mm) * this.getPixelsPerMm();
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
    var val = Math.max(this.mmToPx(10), this.mmToPx(parseInt(input.value) || 50));
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
