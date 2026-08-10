(function () {
  'use strict';

  var SCENES = {
    phone: { _label: 'Phone case', _surface: [30, 10.4, 39.8, 79], _print: [34.8, 33.7, 30.4, 45.3], _color: '#f5f2ec' },
    laptop: { _label: 'Laptop', _surface: [7, 16.7, 86.6, 64.3], _print: [12.8, 22.4, 75, 52.5], _color: '#d9dde2' },
    mailer: { _label: 'Shipping box', _surface: [10.4, 14, 79, 70.1], _print: [15.8, 19.5, 68.2, 59], _color: '#f4f1eb' }
  };
  var COLORS = ['#f5f2ec', '#20242a', '#315cce', '#d6678c', '#789b79'];

  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
  function angle(value) { return ((Number(value) + 180) % 360 + 360) % 360 - 180; }

  async function request(root, path, options) {
    var response = await fetch(root.dataset.proxyBase + path, Object.assign({
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    }, options || {}));
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error && payload.error.message || 'Failed.');
    return payload;
  }

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { resolve({ url: url, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Invalid image.')); };
      image.src = url;
    });
  }

  function defaults(scene) {
    return { xPct: 50, yPct: 50, scalePct: 100, rotationDeg: 0, productColor: SCENES[scene]._color };
  }

  function setRect(element, rect) {
    ['left', 'top', 'width', 'height'].forEach(function (name, index) { element.style[name] = rect[index] + '%'; });
  }

  function arrowStep(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') return -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') return 1;
    return 0;
  }

  function bindHandle(handle, frame, active, begin, move, className) {
    var interaction;
    handle.onpointerdown = function (event) {
      if (!active()) return;
      var bounds = frame.getBoundingClientRect();
      interaction = begin(event, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
      handle.setPointerCapture(event.pointerId);
      frame.classList.add(className);
      event.stopPropagation();
      event.preventDefault();
    };
    handle.onpointermove = function (event) { if (interaction) move(event, interaction); };
    function stop() { interaction = null; frame.classList.remove(className); }
    handle.onpointerup = stop;
    handle.onpointercancel = stop;
  }

  function makeEditor(root, scene, state, sync) {
    var definition = SCENES[scene];
    var article = root.querySelector('[data-editor-template]').content.firstElementChild.cloneNode(true);
    var activate = article.querySelector('[data-editor-activate]');
    var plate = article.querySelector('.splash-studio-plate');
    var surface = article.querySelector('.splash-studio-surface');
    var printArea = article.querySelector('.splash-studio-print-area');
    var frame = article.querySelector('[data-artwork-frame]');
    var artwork = article.querySelector('.splash-studio-artwork');
    var rotateHandle = article.querySelector('[data-rotate-handle]');
    var resizeHandle = article.querySelector('[data-resize-handle]');
    var customColor = article.querySelector('[data-custom-color]');
    var presets = article.querySelector('[data-color-presets]');
    article.dataset.sceneEditor = scene;
    article.querySelector('[data-editor-title]').textContent = definition._label;
    activate.setAttribute('aria-label', 'Edit ' + definition._label.toLowerCase());
    activate.onclick = function () { state.activeScene = scene; sync(); };
    plate.src = root.dataset['scene' + scene[0].toUpperCase() + scene.slice(1)];
    plate.alt = definition._label + ' mockup';
    setRect(surface, definition._surface);
    setRect(printArea, definition._print);

    COLORS.forEach(function (value) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'splash-studio-swatch';
      button.style.setProperty('--swatch', value);
      button.dataset.color = value;
      button.setAttribute('aria-label', 'Product color ' + value);
      button.onclick = function () { state._configs[scene].productColor = value; update(); };
      presets.append(button);
    });

    function update() {
      var config = state._configs[scene];
      surface.style.background = config.productColor;
      customColor.value = config.productColor;
      presets.querySelectorAll('button').forEach(function (button) {
        button.setAttribute('aria-pressed', button.dataset.color === config.productColor);
      });
      if (!state._image) { frame.hidden = true; return; }
      var imageAspect = state._image.width / state._image.height;
      var viewportAspect = definition._print[2] / definition._print[3];
      var baseWidth = imageAspect >= viewportAspect ? 78 : 78 * imageAspect / viewportAspect;
      artwork.src = state._image.url;
      frame.hidden = false;
      frame.style.left = config.xPct + '%';
      frame.style.top = config.yPct + '%';
      frame.style.width = baseWidth * config.scalePct / 100 + '%';
      frame.style.aspectRatio = state._image.width + ' / ' + state._image.height;
      frame.style.transform = 'translate(-50%, -50%) rotate(' + config.rotationDeg + 'deg)';
    }

    customColor.oninput = function () { state._configs[scene].productColor = customColor.value; update(); };
    article.querySelector('[data-reset]').onclick = function () { state._configs[scene] = defaults(scene); update(); };

    var drag;
    frame.onpointerdown = function (event) {
      if (!state._image || state.activeScene !== scene || event.target.closest('[data-rotate-handle], [data-resize-handle]')) return;
      drag = { x: event.clientX, y: event.clientY, _left: state._configs[scene].xPct, _top: state._configs[scene].yPct };
      frame.setPointerCapture(event.pointerId);
      frame.classList.add('is-dragging');
      event.preventDefault();
    };
    frame.onpointermove = function (event) {
      if (!drag) return;
      var bounds = printArea.getBoundingClientRect();
      state._configs[scene].xPct = clamp(drag._left + (event.clientX - drag.x) / bounds.width * 100, -25, 125);
      state._configs[scene].yPct = clamp(drag._top + (event.clientY - drag.y) / bounds.height * 100, -25, 125);
      update();
    };
    function stopDrag() { drag = null; frame.classList.remove('is-dragging'); }
    frame.onpointerup = stopDrag;
    frame.onpointercancel = stopDrag;
    frame.onkeydown = function (event) {
      if (event.target !== frame || state.activeScene !== scene) return;
      var step = arrowStep(event);
      if (!step) return;
      var amount = event.shiftKey ? 5 : 2;
      var property = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'xPct' : 'yPct';
      state._configs[scene][property] = clamp(state._configs[scene][property] + step * amount, -25, 125);
      event.preventDefault();
      update();
    };

    bindHandle(resizeHandle, frame, function () { return state.activeScene === scene; }, function (event, center) {
      return { _center: center, _distance: Math.max(1, Math.hypot(event.clientX - center.x, event.clientY - center.y)), _scale: state._configs[scene].scalePct };
    }, function (event, data) {
      state._configs[scene].scalePct = clamp(data._scale * Math.hypot(event.clientX - data._center.x, event.clientY - data._center.y) / data._distance, 30, 220);
      update();
    }, 'is-resizing');
    resizeHandle.onkeydown = function (event) {
      var step = arrowStep(event);
      if (!step) return;
      state._configs[scene].scalePct = clamp(state._configs[scene].scalePct + step * 5, 30, 220);
      event.preventDefault();
      update();
    };

    bindHandle(rotateHandle, frame, function () { return state.activeScene === scene; }, function (event, center) {
      return { _center: center, _start: Math.atan2(event.clientY - center.y, event.clientX - center.x), _rotation: state._configs[scene].rotationDeg };
    }, function (event, data) {
      var current = Math.atan2(event.clientY - data._center.y, event.clientX - data._center.x);
      state._configs[scene].rotationDeg = angle(data._rotation + (current - data._start) * 180 / Math.PI);
      update();
    }, 'is-rotating');
    rotateHandle.onkeydown = function (event) {
      var step = arrowStep(event);
      if (!step) return;
      state._configs[scene].rotationDeg = angle(state._configs[scene].rotationDeg + step * 5);
      event.preventDefault();
      update();
    };
    state._update[scene] = update;
    update();
    return article;
  }

  async function uploadArtwork(root, file) {
    var staged = await request(root, 'uploads/stage', {
      method: 'POST', body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSize: file.size })
    });
    var body = new FormData();
    (staged.target.parameters || []).forEach(function (parameter) { body.append(parameter.name, parameter.value); });
    body.append('file', file);
    var uploaded = await fetch(staged.target.url, { method: 'POST', body: body });
    if (!uploaded.ok) throw new Error('Upload failed.');
    var completed = await request(root, 'uploads/complete', {
      method: 'POST', body: JSON.stringify({
        resourceUrl: staged.target.resourceUrl,
        filename: staged.filename,
        alt: file.name.replace(/\.[^.]+$/, ''),
        uploadToken: staged.uploadToken
      })
    });
    if (!completed.file || !completed.file.id) throw new Error('Upload error.');
    return completed.file.id;
  }

  function designManifest(state, assetRef) {
    var aspect = state._image.width / state._image.height;
    var width = aspect >= 1 ? 100 : 100 * aspect;
    var height = aspect >= 1 ? 100 / aspect : 100;
    return {
      schemaVersion: '1.0',
      sheet: { widthMm: width, heightMm: height, unit: 'mm', gapMm: 0, background: 'transparent' },
      quantity: 1,
      items: [{
        id: crypto.randomUUID ? crypto.randomUUID() : 'art-' + Date.now(), kind: 'image', assetRef: assetRef,
        placement: { xMm: 0, yMm: 0, widthMm: width, heightMm: height, rotation: 0, flipX: false, flipY: false, zIndex: 0 }
      }]
    };
  }

  async function poll(root, id, attempt) {
    var payload = await request(root, 'mockups/' + encodeURIComponent(id));
    var mockup = payload.mockup;
    if (mockup.status === 'READY' && mockup.outputUrl) return mockup;
    if (mockup.status === 'FAILED') throw new Error('Generation failed.');
    if (attempt >= 40) throw new Error('Try again shortly.');
    await new Promise(function (resolve) { setTimeout(resolve, 1500); });
    return poll(root, id, attempt + 1);
  }

  function selected(root) {
    return Array.from(root.querySelectorAll('[data-scene-choice]:checked'), function (input) { return input.value; });
  }

  function resultPlaceholder(grid, scene) {
    var card = document.createElement('article');
    card.className = 'splash-studio-result is-loading';
    card.dataset.resultScene = scene;
    card.innerHTML = '<span class="splash-studio-spinner" aria-hidden="true"></span>';
    grid.append(card);
  }

  function renderResult(root, scene, mockup) {
    var card = root.querySelector('[data-result-scene="' + scene + '"]');
    card.classList.remove('is-loading');
    card.innerHTML = '<img src="' + mockup.outputUrl + '" alt="Generated ' + SCENES[scene]._label.toLowerCase() + ' mockup"><div><strong>' + SCENES[scene]._label + '</strong><a href="' + mockup.outputUrl + '" target="_blank" rel="noopener">Open full size</a></div>';
  }

  function init(root) {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    var state = { _file: null, _image: null, _configs: {}, _update: {}, activeScene: 'phone' };
    var editors = root.querySelector('[data-studio-editors]');
    var input = root.querySelector('[data-studio-file]');
    var dropzone = root.querySelector('[data-studio-dropzone]');
    var status = root.querySelector('[data-studio-status]');
    var generate = root.querySelector('[data-studio-generate]');

    function sync() {
      var scenes = selected(root);
      if (!scenes.includes(state.activeScene)) state.activeScene = scenes[0] || null;
      editors.dataset.count = String(scenes.length);
      root.querySelectorAll('[data-scene-editor]').forEach(function (editor) {
        var isSelected = scenes.includes(editor.dataset.sceneEditor);
        var isActive = isSelected && editor.dataset.sceneEditor === state.activeScene;
        editor.hidden = !isSelected;
        editor.dataset.active = String(isActive);
        editor.querySelector('[data-editor-activate]').tabIndex = isActive ? -1 : 0;
      });
      root.querySelectorAll('[data-scene-card]').forEach(function (card) {
        var isSelected = card.querySelector('[data-scene-choice]').checked;
        var isActive = isSelected && card.dataset.scene === state.activeScene;
        card.dataset.selected = String(isSelected);
        card.dataset.active = String(isActive);
        card.querySelector('[data-scene-activate]').setAttribute('aria-pressed', String(isActive));
      });
      generate.disabled = !state._file || !scenes.length;
    }

    Object.keys(SCENES).forEach(function (scene) {
      state._configs[scene] = defaults(scene);
      editors.append(makeEditor(root, scene, state, sync));
    });

    async function chooseFile(file) {
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) {
        status.textContent = 'PNG, JPG or WebP; max 25 MB.';
        return;
      }
      try {
        var info = await readImage(file);
        if (state._image) URL.revokeObjectURL(state._image.url);
        state._file = file;
        state._image = info;
        var filename = root.querySelector('[data-studio-filename]');
        filename.textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB';
        filename.hidden = false;
        root.classList.add('has-artwork');
        Object.keys(state._update).forEach(function (scene) { state._update[scene](); });
        status.textContent = 'Design ready.';
        sync();
      } catch (error) { status.textContent = error.message; }
    }

    input.onchange = function () { chooseFile(input.files && input.files[0]); };
    ['dragenter', 'dragover'].forEach(function (name) {
      dropzone.addEventListener(name, function (event) { event.preventDefault(); dropzone.classList.add('is-dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      dropzone.addEventListener(name, function (event) { event.preventDefault(); dropzone.classList.remove('is-dragging'); });
    });
    dropzone.addEventListener('drop', function (event) { chooseFile(event.dataTransfer.files && event.dataTransfer.files[0]); });
    root.querySelectorAll('[data-scene-choice]').forEach(function (choice) {
      choice.onchange = function () { if (choice.checked) state.activeScene = choice.value; sync(); };
    });
    root.querySelectorAll('[data-scene-activate]').forEach(function (button) {
      button.onclick = function () {
        var card = button.closest('[data-scene-card]');
        card.querySelector('[data-scene-choice]').checked = true;
        state.activeScene = card.dataset.scene;
        sync();
      };
    });

    generate.onclick = async function () {
      var scenes = selected(root);
      if (!state._file || !scenes.length) return;
      generate.disabled = true;
      generate.setAttribute('aria-busy', 'true');
      status.textContent = 'Uploading…';
      var results = root.querySelector('[data-studio-results]');
      var grid = results.querySelector('[data-result-grid]');
      results.hidden = false;
      grid.replaceChildren();
      scenes.forEach(function (scene) { resultPlaceholder(grid, scene); });
      try {
        var assetRef = await uploadArtwork(root, state._file);
        status.textContent = 'Preparing…';
        var saved = await request(root, 'designs', { method: 'POST', body: JSON.stringify({ manifest: designManifest(state, assetRef) }) });
        await Promise.all(scenes.map(async function (scene) {
          var created = await request(root, 'mockups', {
            method: 'POST', body: JSON.stringify({ designId: saved.design.publicId, scene: scene, options: state._configs[scene] })
          });
          renderResult(root, scene, await poll(root, created.mockup.id, 0));
        }));
        status.textContent = scenes.length + ' mockup' + (scenes.length === 1 ? '' : 's') + ' ready.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        generate.removeAttribute('aria-busy');
        sync();
      }
    };
    sync();
  }

  function initialize() { document.querySelectorAll('[data-splash-studio]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
  document.addEventListener('shopify:section:load', initialize);
}());
