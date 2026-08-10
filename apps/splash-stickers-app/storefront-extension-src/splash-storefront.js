(function () {
  'use strict';

  if (window.SplashStorefront) return;

  var state = { savePromise: null, saveTimer: null, uploads: new Set() };

  function proxyBase(node) {
    return node && node.dataset && node.dataset.proxyBase || '/apps/splash-stickers/';
  }

  async function request(node, path, options) {
    var response = await fetch(proxyBase(node) + path, Object.assign({
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    }, options || {}));
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var message = payload.error && payload.error.message ? payload.error.message : 'Request failed.';
      throw new Error(message);
    }
    return payload;
  }

  function manifestFor(component, supplied) {
    var manifest = supplied || (component.cartManager && component.cartManager.buildManifest
      ? component.cartManager.buildManifest()
      : null);
    if (!manifest) return null;
    manifest.source = {
      productId: component.dataset.productId || undefined,
      variantId: String(component.state && component.state.variantId || component.dataset.variantId || '') || undefined
    };
    manifest.pricing = {
      unitPriceCents: Number(component.state && component.state.unitPriceCents || component.dataset.unitPriceCents || 0),
      currency: component.dataset.currency || 'USD'
    };
    return manifest;
  }

  async function saveDesign(component, supplied) {
    var bridge = document.querySelector('[data-splash-bridge]');
    var manifest = manifestFor(component, supplied);
    if (!bridge || !manifest || !manifest.items || !manifest.items.length) return null;
    if (state.uploads.size) {
      await Promise.all(Array.from(state.uploads));
      manifest = manifestFor(component);
    }
    if (state.savePromise) await state.savePromise.catch(function () {});
    state.savePromise = request(bridge, 'designs', {
      method: 'POST',
      body: JSON.stringify({ manifest: manifest })
    }).then(function (payload) {
      if (payload.design && payload.design.publicId) component.state.projectId = payload.design.publicId;
      component.dispatchEvent(new CustomEvent('splash:design-saved', {
        bubbles: true,
        detail: { design: payload.design, manifest: manifest }
      }));
      return payload.design;
    }).finally(function () {
      state.savePromise = null;
    });
    return state.savePromise;
  }

  async function uploadArtwork(bridge, component, file, itemIds) {
    if (!file || !itemIds || !itemIds.length) return;
    var staged = await request(bridge, 'uploads/stage', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size })
    });
    var target = staged.target;
    var body = new FormData();
    (target.parameters || []).forEach(function (parameter) {
      body.append(parameter.name, parameter.value);
    });
    body.append('file', file);
    var uploadResponse = await fetch(target.url, { method: 'POST', body: body });
    if (!uploadResponse.ok) throw new Error('Upload failed.');

    var completed = await request(bridge, 'uploads/complete', {
      method: 'POST',
      body: JSON.stringify({
        resourceUrl: target.resourceUrl,
        filename: staged.filename,
        alt: file.name.replace(/\.[^.]+$/, ''),
        uploadToken: staged.uploadToken
      })
    });
    var assetRef = completed.file && completed.file.id;
    if (!assetRef) throw new Error('Missing artwork reference.');
    (component.state.items || []).forEach(function (item) {
      if (itemIds.indexOf(item.id) !== -1) item.assetRef = assetRef;
    });
    if (typeof component.dispatchUpdateEvent === 'function') component.dispatchUpdateEvent();
  }

  function attachConfigurator(component) {
    if (!component || component.splashBridgeAttached) return;
    component.splashBridgeAttached = true;
    component.splashPersistDesign = function (manifest) { return saveDesign(component, manifest); };
  }

  function initBridge(bridge) {
    document.querySelectorAll('sticker-configurator').forEach(attachConfigurator);
    document.addEventListener('sticker-configurator:artwork-added', function (event) {
      var component = event.target && event.target.closest ? event.target.closest('sticker-configurator') : null;
      var detail = event.detail || {};
      if (!component || !detail.file) return;
      attachConfigurator(component);
      var upload = uploadArtwork(bridge, component, detail.file, detail.itemIds || [])
        .catch(function (error) {
          if (component.cartManager && component.cartManager.reportError) component.cartManager.reportError(error.message);
          throw error;
        });
      state.uploads.add(upload);
      upload.finally(function () { state.uploads.delete(upload); }).catch(function () {});
    });
    document.addEventListener('sticker-configurator:update', function (event) {
      var component = event.target && event.target.closest ? event.target.closest('sticker-configurator') : null;
      if (!component || bridge.dataset.autosave !== 'true') return;
      attachConfigurator(component);
      window.clearTimeout(state.saveTimer);
      state.saveTimer = window.setTimeout(function () {
        saveDesign(component).catch(function () {});
      }, 900);
    });
    document.addEventListener('shopify:section:load', function () {
      document.querySelectorAll('sticker-configurator').forEach(attachConfigurator);
    });
  }

  function renderReviews(root, payload) {
    var summary = root.querySelector('[data-review-summary]');
    var list = root.querySelector('[data-review-list]');
    var count = payload.summary ? payload.summary.count : 0;
    var average = payload.summary ? payload.summary.average : 0;
    summary.textContent = count ? average + '/5 · ' + count + ' review' + (count === 1 ? '' : 's') : 'No reviews yet';
    list.replaceChildren();
    (payload.reviews || []).forEach(function (review) {
      var article = document.createElement('article');
      article.className = 'splash-review';
      var title = document.createElement('h3');
      title.className = 'splash-review__title';
      title.textContent = review.rating + '/5 · ' + (review.title || 'Review');
      var body = document.createElement('p');
      body.className = 'splash-review__body';
      body.textContent = review.body;
      var meta = document.createElement('p');
      meta.className = 'splash-review__meta';
      meta.textContent = (review.authorName || 'Customer') + (review.verified ? ' · Verified' : '');
      article.append(title, body, meta);
      list.append(article);
    });
  }

  function initReviews(root) {
    var productId = root.dataset.productId;
    if (!productId) return;
    request(root, 'reviews?product_id=' + encodeURIComponent(productId))
      .then(function (payload) { renderReviews(root, payload); })
      .catch(function () {
        root.querySelector('[data-review-summary]').textContent = 'Reviews unavailable.';
      });

    var form = root.querySelector('[data-review-form]');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = form.querySelector('[data-review-form-status]');
      var data = new FormData(form);
      status.textContent = 'Submitting…';
      request(root, 'reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: productId,
          rating: Number(data.get('rating')),
          authorName: data.get('authorName'),
          title: data.get('title'),
          body: data.get('body')
        })
      }).then(function () {
        form.reset();
        status.textContent = 'Thank you. Review submitted for moderation.';
      }).catch(function (error) {
        status.textContent = error.message;
      });
    });
  }

  function initMockup(root) {
    document.addEventListener('splash:design-saved', function (event) {
      var design = event.detail && event.detail.design;
      if (!design || !design.publicId) return;
      var status = root.querySelector('[data-mockup-status]');
      status.textContent = 'Mockup queued…';
      request(root, 'mockups', {
        method: 'POST',
        body: JSON.stringify({ designId: design.publicId })
      }).then(function (payload) {
        pollMockup(root, payload.mockup.id, 0);
      }).catch(function (error) {
        status.textContent = error.message;
      });
    });
  }

  function pollMockup(root, id, attempt) {
    request(root, 'mockups/' + encodeURIComponent(id)).then(function (payload) {
      var mockup = payload.mockup;
      var status = root.querySelector('[data-mockup-status]');
      status.textContent = mockup.status.toLowerCase().replace('_', ' ');
      if (mockup.status === 'READY' && mockup.outputUrl) {
        var image = root.querySelector('[data-mockup-image]');
        image.src = mockup.outputUrl;
        image.hidden = false;
        root.querySelector('[data-mockup-empty]').hidden = true;
      } else if ((mockup.status === 'QUEUED' || mockup.status === 'PROCESSING') && attempt < 20) {
        window.setTimeout(function () { pollMockup(root, id, attempt + 1); }, 1500);
      }
    }).catch(function (error) {
      root.querySelector('[data-mockup-status]').textContent = error.message;
    });
  }

  function initialize() {
    document.querySelectorAll('[data-splash-bridge]').forEach(initBridge);
    document.querySelectorAll('[data-splash-reviews]').forEach(initReviews);
    document.querySelectorAll('[data-splash-mockup]').forEach(initMockup);
  }

  window.SplashStorefront = { initialize: initialize, saveDesign: saveDesign };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());
