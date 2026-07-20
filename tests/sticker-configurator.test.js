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
  source + '\n;globalThis.__configuratorClasses = { Utils, CollisionEngine, CanvasRenderer, CartManager, StickerConfigurator };',
  context
);

const {
  Utils,
  CollisionEngine,
  CanvasRenderer,
  CartManager,
  StickerConfigurator
} = context.__configuratorClasses;

test('millimetre conversion stays stable on the 600 mm workspace', () => {
  const utils = new Utils({ CANVAS_W: 600 });
  assert.ok(Math.abs(utils.mmToPx(42) - 42) < Number.EPSILON * 100);
  assert.equal(utils.pxToMm(125), 125);
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

test('long production canvases reduce both axes with one uniform scale', () => {
  const core = { CANVAS_W: 600, CANVAS_H: 1600 };
  const renderer = new CanvasRenderer(core);
  const scale = renderer.getRenderScale({ dpi: 300, maxPixels: 45000000 });

  assert.ok(scale < 300 / 25.4);
  assert.ok(core.CANVAS_W * core.CANVAS_H * scale * scale <= 45000000.001);
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
