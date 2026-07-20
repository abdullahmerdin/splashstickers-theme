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
