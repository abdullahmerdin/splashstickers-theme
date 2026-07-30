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
    var cartQuantity = core.state.items.length
      ? (core.cartManager ? core.cartManager.getCartQuantity() : qty)
      : 0;
    var totalCents = core.state.unitPriceCents * cartQuantity;
    core.priceEl.textContent = core.cartManager
      ? core.cartManager.formatMoney(totalCents)
      : (totalCents / 100).toFixed(2);
    if (core.cartManager) core.cartManager.updateButtonState();
    core.dispatchPriceEvent();
  }

  updateCount() {
    var core = this.core;
    if (!core.countEl) return;
    var sel = core.state.selectedIds.length;
    var itemsLabel = configuratorText(core, 'items', 'items');
    var selectedLabel = configuratorText(core, 'selected', 'selected');
    core.countEl.textContent = core.state.items.length + ' ' + itemsLabel +
      (sel ? ' (' + sel + ' ' + selectedLabel + ')' : '');
  }

  updateStats() {
    var core = this.core;
    var el = core.querySelector('#stats-' + core.sid);
    if (!el) return;
    var areaMm = 0;
    core.state.items.forEach(function (it) {
      var widthMm = core.utils ? core.utils.pxToMm(it.w) : it.w;
      var heightMm = core.utils ? core.utils.pxToMm(it.h) : it.h;
      areaMm += widthMm * heightMm;
    });
    var areaCm = Math.round(areaMm / 100);
    el.textContent = core.state.items.length + ' ' + configuratorText(core, 'items', 'items')
      + ' \u00b7 ' + areaCm + ' ' + configuratorText(core, 'area_unit', 'cm\u00b2');
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
