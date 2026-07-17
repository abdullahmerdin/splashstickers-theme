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
