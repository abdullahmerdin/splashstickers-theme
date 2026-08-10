(function () {
  'use strict';

  var SCENES = {
    phone: { label: 'Phone case', surface: [30, 10.4, 39.8, 79], print: [34.8, 33.7, 30.4, 45.3], color: '#f5f2ec' },
    laptop: { label: 'Laptop', surface: [7, 16.7, 86.6, 64.3], print: [12.8, 22.4, 75, 52.5], color: '#d9dde2' },
    mailer: { label: 'Shipping box', surface: [10.4, 14, 79, 70.1], print: [15.8, 19.5, 68.2, 59], color: '#f4f1eb' }
  };
  var COLORS = ['#f5f2ec', '#20242a', '#315cce', '#d6678c', '#789b79'];

  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }

  async function request(root, path, options) {
    var response = await fetch(root.dataset.proxyBase + path, Object.assign({
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    }, options || {}));
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(payload.error && payload.error.message || 'Something went wrong.');
    return payload;
  }

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { resolve({ url: url, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
      image.src = url;
    });
  }

  function defaults(scene) {
    return { xPct: 50, yPct: 50, scalePct: 100, rotationDeg: 0, productColor: SCENES[scene].color };
  }

  function setRect(element, rect) {
    ['left', 'top', 'width', 'height'].forEach(function (name, index) { element.style[name] = rect[index] + '%'; });
  }

  function makeEditor(root, scene, state) {
    var definition = SCENES[scene];
    var article = root.querySelector('[data-editor-template]').content.firstElementChild.cloneNode(true);
    article.dataset.sceneEditor = scene;
    article.querySelector('[data-editor-title]').textContent = definition.label;
    var plate = article.querySelector('.splash-studio-plate');
    var surface = article.querySelector('.splash-studio-surface');
    var printArea = article.querySelector('.splash-studio-print-area');
    var artwork = article.querySelector('.splash-studio-artwork');
    var scale = article.querySelector('[data-scale]');
    var rotation = article.querySelector('[data-rotation]');
    var customColor = article.querySelector('[data-custom-color]');
    var presets = article.querySelector('[data-color-presets]');
    plate.src = root.dataset['scene' + scene[0].toUpperCase() + scene.slice(1)];
    plate.alt = 'Blank ' + definition.label.toLowerCase() + ' mockup';
    setRect(surface, definition.surface);
    setRect(printArea, definition.print);

    COLORS.forEach(function (value) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'splash-studio-swatch';
      button.style.setProperty('--swatch', value);
      button.dataset.color = value;
      button.setAttribute('aria-label', 'Use product color ' + value);
      button.onclick = function () { state.configs[scene].productColor = value; update(); };
      presets.append(button);
    });

    function update() {
      var config = state.configs[scene];
      surface.style.background = config.productColor;
      scale.value = config.scalePct;
      rotation.value = config.rotationDeg;
      customColor.value = config.productColor;
      article.querySelector('[data-scale-output]').textContent = Math.round(config.scalePct) + '%';
      article.querySelector('[data-rotation-output]').textContent = Math.round(config.rotationDeg) + '°';
      presets.querySelectorAll('button').forEach(function (button) {
        button.setAttribute('aria-pressed', button.dataset.color === config.productColor);
      });
      if (!state.image) { artwork.hidden = true; return; }
      var imageAspect = state.image.width / state.image.height;
      var viewportAspect = definition.print[2] / definition.print[3];
      var baseWidth = imageAspect >= viewportAspect ? 78 : 78 * imageAspect / viewportAspect;
      artwork.src = state.image.url;
      artwork.hidden = false;
      artwork.style.left = config.xPct + '%';
      artwork.style.top = config.yPct + '%';
      artwork.style.width = baseWidth * config.scalePct / 100 + '%';
      artwork.style.transform = 'translate(-50%, -50%) rotate(' + config.rotationDeg + 'deg)';
    }

    scale.oninput = function () { state.configs[scene].scalePct = Number(scale.value); update(); };
    rotation.oninput = function () { state.configs[scene].rotationDeg = Number(rotation.value); update(); };
    customColor.oninput = function () { state.configs[scene].productColor = customColor.value; update(); };
    article.querySelector('[data-reset]').onclick = function () { state.configs[scene] = defaults(scene); update(); };

    var drag;
    artwork.tabIndex = 0;
    artwork.onpointerdown = function (event) {
      if (!state.image) return;
      drag = { x: event.clientX, y: event.clientY, left: state.configs[scene].xPct, top: state.configs[scene].yPct };
      artwork.setPointerCapture(event.pointerId);
      artwork.classList.add('is-dragging');
      event.preventDefault();
    };
    artwork.onpointermove = function (event) {
      if (!drag) return;
      var bounds = printArea.getBoundingClientRect();
      state.configs[scene].xPct = clamp(drag.left + (event.clientX - drag.x) / bounds.width * 100, -25, 125);
      state.configs[scene].yPct = clamp(drag.top + (event.clientY - drag.y) / bounds.height * 100, -25, 125);
      update();
    };
    function stopDrag() { drag = null; artwork.classList.remove('is-dragging'); }
    artwork.onpointerup = stopDrag;
    artwork.onpointercancel = stopDrag;
    artwork.onkeydown = function (event) {
      var amount = event.shiftKey ? 5 : 2;
      if (event.key === 'ArrowLeft') state.configs[scene].xPct -= amount;
      else if (event.key === 'ArrowRight') state.configs[scene].xPct += amount;
      else if (event.key === 'ArrowUp') state.configs[scene].yPct -= amount;
      else if (event.key === 'ArrowDown') state.configs[scene].yPct += amount;
      else return;
      state.configs[scene].xPct = clamp(state.configs[scene].xPct, -25, 125);
      state.configs[scene].yPct = clamp(state.configs[scene].yPct, -25, 125);
      event.preventDefault();
      update();
    };
    state.update[scene] = update;
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
    if (!uploaded.ok) throw new Error('Artwork upload failed.');
    var completed = await request(root, 'uploads/complete', {
      method: 'POST', body: JSON.stringify({
        resourceUrl: staged.target.resourceUrl,
        filename: staged.filename,
        alt: file.name.replace(/\.[^.]+$/, ''),
        uploadToken: staged.uploadToken
      })
    });
    if (!completed.file || !completed.file.id) throw new Error('Artwork reference is missing.');
    return completed.file.id;
  }

  function designManifest(state, assetRef) {
    var aspect = state.image.width / state.image.height;
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
    if (mockup.status === 'FAILED') throw new Error('Mockup generation failed.');
    if (attempt >= 40) throw new Error('Artwork is still processing. Please try again shortly.');
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
    card.innerHTML = '<span class="splash-studio-spinner" aria-hidden="true"></span><p>Creating ' + SCENES[scene].label.toLowerCase() + '…</p>';
    grid.append(card);
  }

  function renderResult(root, scene, mockup) {
    var card = root.querySelector('[data-result-scene="' + scene + '"]');
    card.classList.remove('is-loading');
    card.innerHTML = '<img src="' + mockup.outputUrl + '" alt="Generated ' + SCENES[scene].label.toLowerCase() + ' mockup"><div><strong>' + SCENES[scene].label + '</strong><a href="' + mockup.outputUrl + '" target="_blank" rel="noopener">Open full size</a></div>';
  }

  function init(root) {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    var state = { file: null, image: null, configs: {}, update: {} };
    var editors = root.querySelector('[data-studio-editors]');
    var input = root.querySelector('[data-studio-file]');
    var dropzone = root.querySelector('[data-studio-dropzone]');
    var status = root.querySelector('[data-studio-status]');
    var generate = root.querySelector('[data-studio-generate]');
    Object.keys(SCENES).forEach(function (scene) {
      state.configs[scene] = defaults(scene);
      editors.append(makeEditor(root, scene, state));
    });

    function sync() {
      var scenes = selected(root);
      root.querySelectorAll('[data-scene-editor]').forEach(function (editor) { editor.hidden = !scenes.includes(editor.dataset.sceneEditor); });
      root.querySelectorAll('[data-scene-card]').forEach(function (card) {
        card.dataset.selected = String(card.querySelector('input').checked);
      });
      generate.disabled = !state.file || !scenes.length;
    }

    async function chooseFile(file) {
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) {
        status.textContent = 'Use a PNG, JPG or WebP file up to 25 MB.';
        return;
      }
      try {
        var info = await readImage(file);
        if (state.image) URL.revokeObjectURL(state.image.url);
        state.file = file;
        state.image = info;
        root.querySelector('[data-studio-filename]').textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB';
        root.classList.add('has-artwork');
        Object.keys(state.update).forEach(function (scene) { state.update[scene](); });
        status.textContent = 'Design ready. Fine-tune each selected product.';
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
    root.querySelectorAll('[data-scene-choice]').forEach(function (choice) { choice.onchange = sync; });

    generate.onclick = async function () {
      var scenes = selected(root);
      if (!state.file || !scenes.length) return;
      generate.disabled = true;
      generate.setAttribute('aria-busy', 'true');
      status.textContent = 'Uploading your design…';
      var results = root.querySelector('[data-studio-results]');
      var grid = results.querySelector('[data-result-grid]');
      results.hidden = false;
      grid.replaceChildren();
      scenes.forEach(function (scene) { resultPlaceholder(grid, scene); });
      try {
        var assetRef = await uploadArtwork(root, state.file);
        status.textContent = 'Preparing mockups…';
        var saved = await request(root, 'designs', { method: 'POST', body: JSON.stringify({ manifest: designManifest(state, assetRef) }) });
        await Promise.all(scenes.map(async function (scene) {
          var created = await request(root, 'mockups', {
            method: 'POST', body: JSON.stringify({ designId: saved.design.publicId, scene: scene, options: state.configs[scene] })
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
