/* ===========================================
   CartManager — Shopify Ajax cart integration and design handoff
   =========================================== */

class CartManager {
  constructor(core) {
    this.core = core;
    this.busy = false;
  }

  getSheetQuantity() {
    return Math.max(1, parseInt(this.core.qtyEl ? this.core.qtyEl.textContent : 1, 10) || 1);
  }

  getCartQuantity() {
    return this.core.state.items.length ? this.getSheetQuantity() : 0;
  }

  formatMoney(cents) {
    var currency = this.core.dataset.currency || 'USD';
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency: currency
      }).format((Number(cents) || 0) / 100);
    } catch (_error) {
      return currency + ' ' + ((Number(cents) || 0) / 100).toFixed(2);
    }
  }

  setStatus(message, state) {
    var status = this.core.cache && this.core.cache['cart-status'];
    if (!status) return;
    status.textContent = message || '';
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  reportError(message) {
    this.setStatus(message, 'error');
    var modalManager = this.core.modalManager;
    if (modalManager && modalManager.showErrorModal) {
      modalManager.showErrorModal(message);
    }
  }

  updateButtonState() {
    var button = this.core.cache && this.core.cache.submit;
    if (!button) return;
    // Keep the button clickable when product setup is incomplete so the
    // customer/merchant receives an actionable error instead of a dead button.
    button.disabled = this.busy || this.core.state.items.length === 0;
  }

  toMm(value) {
    var utils = this.core.utils;
    return utils && typeof utils.pxToMm === 'function' ? utils.pxToMm(value) : Number(value);
  }

  roundMm(value) {
    return Math.round(this.toMm(value) * 100) / 100;
  }

  buildManifest() {
    var core = this.core;
    var manager = this;
    return {
      version: 1,
      projectId: core.state.projectId,
      workspace: { widthMm: this.roundMm(core.CANVAS_W), heightMm: this.roundMm(core.CANVAS_H) },
      gapMm: core.state.gapSize,
      background: core.state.backgroundColor,
      sheetQuantity: this.getSheetQuantity(),
      items: core.state.items.map(function (item) {
        return {
          kind: item.text ? 'text' : 'image',
          xMm: manager.roundMm(item.x),
          yMm: manager.roundMm(item.y),
          widthMm: manager.roundMm(item.w),
          heightMm: manager.roundMm(item.h),
          rotation: Math.round((Number(item.rotation) || 0) * 100) / 100,
          flipX: (item.scaleX || 1) < 0,
          flipY: (item.scaleY || 1) < 0,
          text: item.text || undefined
        };
      })
    };
  }

  async addToCart() {
    var core = this.core;
    if (this.busy) return;
    if (!core.state.items.length) {
      this.reportError('Add at least one design before continuing.');
      return;
    }
    if (!(Number(core.state.variantId) > 0)) {
      this.reportError('No Shopify product variant is connected to this configurator.');
      return;
    }
    if (!core.state.variantAvailable) {
      this.reportError('The selected Shopify product variant is unavailable or sold out.');
      return;
    }

    var button = core.cache.submit;
    var originalMarkup = button ? button.innerHTML : '';
    this.busy = true;
    this.updateButtonState();
    if (button) {
      button.classList.add('is-busy');
      button.textContent = 'Adding to cart…';
    }
    this.setStatus('Adding the configured gangsheet to Shopify.');

    try {
      var sheetWidthMm = this.roundMm(core.CANVAS_W);
      var sheetHeightMm = this.roundMm(core.CANVAS_H);
      var cartPayload = {
        items: [{
          id: Number(core.state.variantId),
          quantity: this.getCartQuantity(),
          properties: {
            'Design ID': core.state.projectId,
            'Artwork count': String(core.state.items.length),
            'Sheet copies': String(this.getSheetQuantity()),
            'Sheet size': sheetWidthMm + ' × ' + sheetHeightMm + ' mm',
            '_configurator_version': '3'
          }
        }]
      };

      var response = await fetch(
        core.dataset.cartAddUrl || ((window.Shopify && window.Shopify.routes.root) || '/') + 'cart/add.js',
        {
          method: 'POST',
          body: JSON.stringify(cartPayload),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );
      var responseText = await response.text();
      var payload = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch (_error) {
        payload = {};
      }
      if (!response.ok) {
        throw new Error(payload.description || payload.message || 'The design could not be added to cart.');
      }

      this.setStatus('Design added to cart.', 'success');
      core.dispatchAddToCartEvent(payload);
      if (core.dataset.redirectToCart !== 'false') {
        window.location.assign(core.dataset.cartUrl || '/cart');
      }
    } catch (error) {
      var message = error && error.message ? error.message : 'The design could not be added to cart.';
      this.reportError('Could not add to cart. ' + message);
    } finally {
      this.busy = false;
      if (button) {
        button.classList.remove('is-busy');
        button.innerHTML = originalMarkup;
      }
      this.updateButtonState();
    }
  }
}
