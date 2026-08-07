const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { jsPDF } = require('jspdf');

const bundlePath = path.resolve(__dirname, '..', 'assets', 'sticker-configurator.js');
const source = fs.readFileSync(bundlePath, 'utf8');
const context = {
  AbortController,
  Blob,
  console,
  crypto,
  CustomEvent: class CustomEvent {},
  document: {
    documentElement: { lang: 'en-US' }
  },
  Event,
  EventTarget,
  FormData,
  HTMLElement: class HTMLElement {},
  Image: class Image {},
  Intl,
  Promise,
  setTimeout,
  clearTimeout,
  URL,
  window: {
    crypto,
    devicePixelRatio: 1
  },
  customElements: {
    get() { return undefined; },
    define() {}
  }
};

vm.runInNewContext(
  source + '\n;globalThis.__configuratorClasses = { Utils, CollisionEngine, CanvasRenderer, CartManager, StickerConfigurator, AlignmentEngine, KeyboardManager };',
  context
);

const {
  Utils,
  CollisionEngine,
  CanvasRenderer,
  CartManager,
  StickerConfigurator,
  AlignmentEngine,
  KeyboardManager
} = context.__configuratorClasses;

test('millimetre conversion stays stable on the 600 px fallback workspace', () => {
  const utils = new Utils({ CANVAS_W: 600 });
  assert.ok(Math.abs(utils.mmToPx(42) - 42) < Number.EPSILON * 100);
  assert.equal(utils.pxToMm(125), 125);
});

test('millimetres map to a viewport-width pixel workspace without changing physical size', () => {
  const core = { CANVAS_W: 1800, CANVAS_H: 1200, SHEET_WIDTH_MM: 600 };
  const utils = new Utils(core);

  assert.equal(utils.getPixelsPerMm(), 3);
  assert.equal(utils.mmToPx(42), 126);
  assert.equal(utils.pxToMm(375), 125);
  assert.equal(utils.getWorkspaceWidthMm(), 600);
  assert.equal(utils.getWorkspaceHeightMm(), 400);
});

test('workspace resize fills the viewport and preserves item millimetres', () => {
  const textContent = { style: {} };
  const item = {
    x: 10, y: 20, w: 30, h: 40, fontSize: 16,
    el: {
      style: {},
      querySelector(selector) { return selector === '.text-content' ? textContent : null; }
    }
  };
  const core = {
    CANVAS_W: 600,
    CANVAS_H: 400,
    SHEET_WIDTH_MM: 600,
    wrap: { clientWidth: 1800, scrollLeft: 0, scrollTop: 0 },
    state: {
      items: [item],
      history: [[{ x: 10, y: 20, w: 30, h: 40, fontSize: 16 }]],
      clipboard: null
    }
  };

  const changed = StickerConfigurator.prototype.resizeWorkspaceToViewport.call(core, false);

  assert.equal(changed, true);
  assert.equal(core.CANVAS_W, 1800);
  assert.equal(core.CANVAS_H, 1200);
  assert.deepEqual(
    { x: item.x, y: item.y, w: item.w, h: item.h, fontSize: item.fontSize },
    { x: 30, y: 60, w: 90, h: 120, fontSize: 48 }
  );
  const utils = new Utils(core);
  assert.equal(utils.pxToMm(item.w), 30);
  assert.equal(textContent.style.fontSize, '48px');
});

test('empty workspace fits both viewport axes without pushing the hint below the canvas', () => {
  const core = {
    CANVAS_W: 600,
    CANVAS_H: 400,
    SHEET_WIDTH_MM: 600,
    wrap: { clientWidth: 1800, clientHeight: 720, scrollLeft: 0, scrollTop: 0 },
    state: {
      items: [],
      history: [],
      clipboard: null
    }
  };

  const changed = StickerConfigurator.prototype.resizeWorkspaceToViewport.call(core, false);

  assert.equal(changed, true);
  assert.equal(core.CANVAS_W, 1080);
  assert.equal(core.CANVAS_H, 720);
});

test('canvas zoom never falls below its 100 percent scale', () => {
  const renderer = new CanvasRenderer({});
  assert.equal(renderer.clampZoom(0.25), 1);
  assert.equal(renderer.clampZoom(0.99), 1);
  assert.equal(renderer.clampZoom(1), 1);
});

test('collision engine enforces configured gaps and workspace bounds', () => {
  const core = {
    CANVAS_W: 600,
    CANVAS_H: 400,
    state: { gapSize: 3 },
    utils: { mmToPx: (value) => value }
  };
  const engine = new CollisionEngine(core);
  const first = { id: 1, x: 10, y: 10, w: 50, h: 50, rotation: 0 };
  const touchingGap = { id: 2, x: 62, y: 10, w: 50, h: 50, rotation: 0 };
  const clear = { id: 2, x: 63, y: 10, w: 50, h: 50, rotation: 0 };

  assert.equal(engine.canPlace(touchingGap, [first, touchingGap], []), false);
  assert.equal(engine.canPlace(clear, [first, clear], []), true);
  assert.equal(
    engine.canPlace({ id: 3, x: 590, y: 10, w: 20, h: 20, rotation: 0 }, [first], []),
    false
  );
});

test('auto arrange fills the gap beneath shorter artwork instead of starting a new shelf', () => {
  const items = [
    { id: 1, x: 0, y: 0, w: 100, h: 200, rotation: 0, el: { style: {} } },
    { id: 2, x: 0, y: 0, w: 100, h: 100, rotation: 0, el: { style: {} } },
    { id: 3, x: 0, y: 0, w: 100, h: 100, rotation: 0, el: { style: {} } },
    { id: 4, x: 0, y: 0, w: 100, h: 100, rotation: 0, el: { style: {} } }
  ];
  const core = {
    CANVAS_W: 320,
    CANVAS_H: 300,
    state: { items, gapSize: 10 },
    utils: { mmToPx: (value) => value },
    canvasRenderer: { drawGrid() {}, _syncZoomTransform() {} },
    historyManager: { saveState() {} },
    growCanvas() {},
    dispatchUpdateEvent() {}
  };
  core.collisionEngine = new CollisionEngine(core);

  assert.equal(new AlignmentEngine(core).onAutoArrange(), true);
  assert.deepEqual(
    items.map(({ id, x, y }) => ({ id, x, y })),
    [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 110, y: 0 },
      { id: 3, x: 220, y: 0 },
      { id: 4, x: 110, y: 110 }
    ]
  );
  assert.equal(core.CANVAS_H, 300);
});

test('cart quantity is sheet quantity and does not multiply artwork copies', () => {
  const core = {
    CANVAS_W: 600,
    CANVAS_H: 400,
    dataset: { currency: 'USD' },
    qtyEl: { textContent: '10' },
    state: {
      projectId: 'project-1',
      gapSize: 3,
      backgroundColor: '#ffffff',
      items: [
        { x: 1, y: 2, w: 30, h: 40, rotation: 0, scaleX: 1, scaleY: 1 },
        { x: 50, y: 60, w: 70, h: 80, rotation: 90, scaleX: -1, scaleY: 1 }
      ]
    }
  };
  const manager = new CartManager(core);
  const manifest = manager.buildManifest();

  assert.equal(manager.getCartQuantity(), 10);
  assert.equal(manifest.items.length, 2);
  assert.equal(manifest.sheetQuantity, 10);
  assert.equal(manifest.items[1].flipX, true);
  assert.equal(manifest.workspace.widthMm, 600);
});

test('cart manifest converts responsive display pixels back to millimetres', () => {
  const core = {
    CANVAS_W: 1800,
    CANVAS_H: 1200,
    SHEET_WIDTH_MM: 600,
    dataset: { currency: 'USD' },
    qtyEl: { textContent: '2' },
    state: {
      projectId: 'responsive-project',
      gapSize: 3,
      backgroundColor: '#ffffff',
      items: [{ x: 30, y: 60, w: 150, h: 90, rotation: 0, scaleX: 1, scaleY: 1 }]
    }
  };
  core.utils = new Utils(core);
  const manifest = new CartManager(core).buildManifest();

  assert.equal(manifest.workspace.widthMm, 600);
  assert.equal(manifest.workspace.heightMm, 400);
  assert.equal(manifest.items[0].xMm, 10);
  assert.equal(manifest.items[0].yMm, 20);
  assert.equal(manifest.items[0].widthMm, 50);
  assert.equal(manifest.items[0].heightMm, 30);
});

test('cart request uses Shopify JSON payload and never builds the production PDF', async () => {
  let requestOptions;
  let exportWasCalled = false;
  context.fetch = async (_url, options) => {
    requestOptions = options;
    return {
      ok: true,
      text: async () => JSON.stringify({ id: 123 })
    };
  };
  const button = {
    classList: { add() {}, remove() {} },
    disabled: false,
    innerHTML: '<span>Add to cart</span>',
    textContent: ''
  };
  const core = {
    CANVAS_W: 600,
    CANVAS_H: 800,
    cache: {
      submit: button,
      'cart-status': { dataset: {}, textContent: '' }
    },
    canvasRenderer: {
      renderToCanvas() {
        return {
          toBlob(callback) {
            callback(new Blob(['preview'], { type: 'image/jpeg' }));
          }
        };
      }
    },
    dataset: {
      cartAddUrl: '/cart/add.js',
      currency: 'USD',
      redirectToCart: 'false'
    },
    dispatchAddToCartEvent() {},
    exportManager: {
      async buildPdfBlob() {
        exportWasCalled = true;
        throw new Error('Production PDF should not be built during cart submission.');
      }
    },
    modalManager: { showErrorModal() {} },
    qtyEl: { textContent: '1' },
    state: {
      backgroundColor: '#ffffff',
      gapSize: 3,
      items: [{ x: 10, y: 20, w: 30, h: 40, rotation: 0, scaleX: 1, scaleY: 1 }],
      projectId: 'project-2',
      variantAvailable: true,
      variantId: 123
    }
  };

  await new CartManager(core).addToCart();

  assert.equal(exportWasCalled, false);
  assert.equal(requestOptions.headers['Content-Type'], 'application/json');
  const cartPayload = JSON.parse(requestOptions.body);
  assert.equal(cartPayload.items[0].id, 123);
  assert.equal(cartPayload.items[0].quantity, 1);
  assert.equal(cartPayload.items[0].properties['Design ID'], 'project-2');
  assert.equal(cartPayload.items[0].properties['Artwork count'], '1');
  assert.equal(cartPayload.items[0].properties._configurator_version, '3');
});

test('the rendered add-to-cart button is wired to CartManager', () => {
  let calls = 0;
  const submit = new EventTarget();
  const core = {
    cache: { submit },
    cartManager: {
      addToCart() {
        calls += 1;
      }
    }
  };

  StickerConfigurator.prototype._bindCartButton.call(
    core,
    new AbortController().signal
  );
  submit.dispatchEvent(new Event('click'));

  assert.equal(calls, 1);
});

test('variant setup errors remain clickable and surface an explicit message', async () => {
  let modalMessage = '';
  const core = {
    cache: {
      submit: { disabled: true },
      'cart-status': { dataset: {}, textContent: '' }
    },
    modalManager: {
      showErrorModal(message) {
        modalMessage = message;
      }
    },
    qtyEl: { textContent: '1' },
    state: {
      items: [{}],
      variantAvailable: false,
      variantId: 123
    }
  };
  const manager = new CartManager(core);

  manager.updateButtonState();
  await manager.addToCart();

  assert.equal(core.cache.submit.disabled, false);
  assert.match(modalMessage, /unavailable|sold out/i);
});

test('disabled feature flags do not hijack keyboard shortcuts', () => {
  let prevented = 0;
  let undoCalls = 0;
  let redoCalls = 0;
  let copyCalls = 0;
  let pasteCalls = 0;
  const core = {
    dataset: { undoEnabled: 'false', clipboardEnabled: 'false' },
    state: { exporting: false, selectedIds: [1], clipboard: [{}] },
    historyManager: {
      undo() { undoCalls += 1; },
      redo() { redoCalls += 1; }
    },
    clipboardManager: {
      copy() { copyCalls += 1; },
      paste() { pasteCalls += 1; }
    }
  };
  const keyboard = new KeyboardManager(core);
  const press = (key, shiftKey = false) => keyboard.onKeyDown({
    ctrlKey: true,
    metaKey: false,
    key,
    shiftKey,
    target: { tagName: 'BODY' },
    preventDefault() { prevented += 1; }
  });

  press('z');
  press('z', true);
  press('y');
  press('c');
  press('v');

  assert.equal(prevented, 0);
  assert.equal(undoCalls, 0);
  assert.equal(redoCalls, 0);
  assert.equal(copyCalls, 0);
  assert.equal(pasteCalls, 0);
});

test('long production canvases reduce both axes with one uniform scale', () => {
  const core = { CANVAS_W: 600, CANVAS_H: 1600 };
  const renderer = new CanvasRenderer(core);
  const scale = renderer.getRenderScale({ dpi: 300, maxPixels: 45000000 });

  assert.ok(scale < 300 / 25.4);
  assert.ok(core.CANVAS_W * core.CANVAS_H * scale * scale <= 45000000.001);
  assert.equal((core.CANVAS_W * scale) / (core.CANVAS_H * scale), 600 / 1600);
});

test('production render scale is based on physical millimetres, not display width', () => {
  const core = { CANVAS_W: 1800, CANVAS_H: 4800, SHEET_WIDTH_MM: 600 };
  core.utils = new Utils(core);
  const renderer = new CanvasRenderer(core);
  const scale = renderer.getRenderScale({ dpi: 300 });

  assert.ok(Math.abs(scale - ((300 / 25.4) / 3)) < 1e-12);
  assert.ok(Math.abs(core.CANVAS_W * scale - 600 * 300 / 25.4) < 1e-9);
  assert.equal((core.CANVAS_W * scale) / (core.CANVAS_H * scale), 600 / 1600);
});

test('export image geometry matches CSS object-fit contain', () => {
  const renderer = new CanvasRenderer({ CANVAS_W: 600, CANVAS_H: 400 });
  const landscape = renderer.getContainedRect(400, 200, 100, 100);
  const portrait = renderer.getContainedRect(200, 400, 100, 100);

  assert.deepEqual(
    { x: landscape.x, y: landscape.y, width: landscape.width, height: landscape.height },
    { x: 0, y: 25, width: 100, height: 50 }
  );
  assert.deepEqual(
    { x: portrait.x, y: portrait.y, width: portrait.width, height: portrait.height },
    { x: 25, y: 0, width: 50, height: 100 }
  );
});

test('jsPDF preserves the physical dimensions of a tall gangsheet page', () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [600, 1600],
    compress: true
  });

  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 600) < 0.01);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 1600) < 0.01);
});
