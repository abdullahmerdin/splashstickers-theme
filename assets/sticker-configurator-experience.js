(function () {
  'use strict';

  var STORAGE_PREFIX = 'sticker-configurator:onboarding:';
  var MIN_PRINT_DPI = 150;

  function analyticsEnabled(component) {
    return component.dataset.trackEnabled === 'true' && Array.isArray(window.dataLayer);
  }

  function publish(component, eventName, detail) {
    if (!analyticsEnabled(component)) return;

    var payload = Object.assign({
      event: eventName,
      configurator_event: eventName,
      product_id: component.dataset.productId || '',
      variant_id: component.dataset.variantId || '',
      section_id: component.dataset.sectionId || ''
    }, detail || {});

    window.dataLayer.push(payload);
    component.dispatchEvent(new CustomEvent('sticker-configurator:analytics', {
      bubbles: true,
      detail: payload
    }));
  }

  function storageKey(component) {
    return STORAGE_PREFIX + (component.dataset.onboardingVersion || '1');
  }

  function safelyRead(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function safelyWrite(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Storage can be unavailable in private browsing; dismissal still works.
    }
  }

  function setupOnboarding(component) {
    var panel = component.querySelector('.cfg-onboarding');
    if (!panel) return;

    var key = storageKey(component);
    var inThemeEditor = document.documentElement.classList.contains('shopify-design-mode');
    if (!inThemeEditor && safelyRead(key) === 'dismissed') {
      panel.hidden = true;
      return;
    }

    var dismiss = panel.querySelector('[data-configurator-dismiss]');
    if (!dismiss) return;
    dismiss.addEventListener('click', function () {
      panel.hidden = true;
      safelyWrite(key, 'dismissed');
      publish(component, 'configurator_quick_start_dismiss', {});
    });
  }

  function setupResolutionCheck(component) {
    var sid = component.dataset.sectionId;
    var fileInput = component.querySelector('#file-input-' + sid);
    var widthInput = component.querySelector('#modal-w-' + sid);
    var heightInput = component.querySelector('#modal-h-' + sid);
    var warning = component.querySelector('#resolution-warning-' + sid);
    if (!fileInput || !warning) return;

    var source = null;

    function updateWarning() {
      if (!source || !widthInput || !heightInput) {
        warning.textContent = '';
        warning.removeAttribute('data-state');
        return;
      }

      var widthMm = Math.max(1, Number(widthInput.value) || 1);
      var heightMm = Math.max(1, Number(heightInput.value) || 1);
      var dpi = Math.floor(Math.min(
        source.width / (widthMm / 25.4),
        source.height / (heightMm / 25.4)
      ));

      if (dpi < MIN_PRINT_DPI) {
        warning.dataset.state = 'warning';
        warning.textContent = (component.dataset.resolutionLow || 'Low-resolution artwork at this print size.') + ' (' + dpi + ' DPI)';
      } else {
        warning.dataset.state = 'success';
        warning.textContent = (component.dataset.resolutionSuccess || 'Resolution looks suitable at this print size.') + ' (' + dpi + ' DPI)';
      }
    }

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      source = null;
      updateWarning();
      if (!file) return;

      publish(component, 'configurator_upload_select', {
        file_type: file.type || 'unknown',
        file_size_kb: Math.round(file.size / 1024)
      });

      var objectUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        source = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
        URL.revokeObjectURL(objectUrl);
        updateWarning();
        window.setTimeout(updateWarning, 80);
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
      };
      image.src = objectUrl;
    });

    if (widthInput) widthInput.addEventListener('input', updateWarning);
    if (heightInput) heightInput.addEventListener('input', updateWarning);
  }

  function setupAnalytics(component) {
    var state = { started: false, converted: false, abandoned: false };
    var sid = component.dataset.sectionId;
    var addButton = component.querySelector('#add-btn-' + sid);

    if (addButton) {
      addButton.addEventListener('click', function () {
        publish(component, 'configurator_upload_open', {});
      });
    }

    component.addEventListener('sticker-configurator:update', function (event) {
      var count = Number(event.detail && event.detail.itemCount) || 0;
      if (count > 0 && !state.started) {
        state.started = true;
        publish(component, 'configurator_design_start', { artwork_count: count });
      }
    });

    component.addEventListener('sticker-configurator:export', function () {
      publish(component, 'configurator_export', { format: 'pdf' });
    });

    component.addEventListener('sticker-configurator:add-to-cart', function (event) {
      state.converted = true;
      publish(component, 'configurator_add_to_cart', {
        quantity: Number(event.detail && event.detail.quantity) || 0,
        artwork_count: component.state && component.state.items ? component.state.items.length : undefined
      });
    });

    window.addEventListener('pagehide', function () {
      if (!state.started || state.converted || state.abandoned) return;
      state.abandoned = true;
      publish(component, 'configurator_abandon', {
        artwork_count: component.state && component.state.items ? component.state.items.length : undefined
      });
    });
  }

  function enhance(component) {
    if (!component || component.dataset.experienceReady === 'true') return;
    component.dataset.experienceReady = 'true';
    setupOnboarding(component);
    setupResolutionCheck(component);
    setupAnalytics(component);
    publish(component, 'configurator_view', {});
  }

  function scan(root) {
    if (root instanceof Element && root.matches('sticker-configurator')) enhance(root);
    (root.querySelectorAll ? root.querySelectorAll('sticker-configurator') : []).forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(document); });
  } else {
    scan(document);
  }

  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
