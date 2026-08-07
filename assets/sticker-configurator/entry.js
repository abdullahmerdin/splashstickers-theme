class StickerConfigurator extends HTMLElement {
  constructor() {
    super();
    this.abortController = new AbortController();
    this.state = {};
  }

  /* ── Lifecycle ── */

  connectedCallback() {
    this.classList.add('is-loading');
    this.setAttribute('aria-busy', 'true');
    this._loadingStartedAt = Date.now();

    var boot = () => {
      if (this._lazyObserver) this._lazyObserver.disconnect();
      if (this._lazyInitTimer) clearTimeout(this._lazyInitTimer);
      requestAnimationFrame(() => this.init());
    };

    if ('IntersectionObserver' in window) {
      this._lazyObserver = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) boot();
      }, { rootMargin: '240px 0px' });
      this._lazyObserver.observe(this);
      this._lazyInitTimer = setTimeout(boot, 1400);
    } else {
      boot();
    }
  }

  disconnectedCallback() {
    this.abortController.abort();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this._lazyObserver) this._lazyObserver.disconnect();
    if (this._lazyInitTimer) clearTimeout(this._lazyInitTimer);
    if (this._revealTimer) clearTimeout(this._revealTimer);
    if (this._workspaceResizeRaf) cancelAnimationFrame(this._workspaceResizeRaf);
    this.state = null;
    this.wrap = null;
    this.canvasStage = null;
    this.canvas = null;
    this.gridCanvas = null;
    this.hintEl = null;
    this.fileInput = null;
    this.modalEl = null;
    this.cache = null;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'section-id' && oldVal !== null && oldVal !== newVal) {
      this.classList.add('is-loading');
      this.setAttribute('aria-busy', 'true');
      this._loadingStartedAt = Date.now();
      this.init();
    }
  }

  static get observedAttributes() {
    return ['section-id'];
  }

  /* ── Initialization ── */

  init() {
    if (this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
    this.sid = this.dataset.sectionId;
    this.copy = {};
    var copyScript = this.querySelector('[data-configurator-copy]');
    if (copyScript) {
      try {
        this.copy = JSON.parse(copyScript.textContent || '{}');
      } catch (_error) {
        this.copy = {};
      }
    }

    // DOM caching (V07 fix): cache all commonly-queried elements
    this.cache = {};
    this._cacheDomRefs();

    // Physical sheet dimensions stay stable while display pixels follow the
    // available editor width.
    this.SHEET_WIDTH_MM = 600;
    this.INITIAL_SHEET_HEIGHT_MM = 400;
    this.CANVAS_W = 600;
    this.CANVAS_H = 400;

    // Shopify variant pricing is authoritative; the section price is fallback-only.
    var basePrice = parseFloat(this.dataset.basePrice) || 2.5;
    var unitPriceCents = parseInt(this.dataset.unitPriceCents, 10);
    if (!(unitPriceCents >= 0)) unitPriceCents = Math.round(basePrice * 100);

    // Build state
    this.state = {
      items: [],
      selectedIds: [],
      nextId: 1,
      history: [],
      historyIdx: -1,
      zoom: 1,
      panX: 0,
      panY: 0,
      dragState: null,
      dpr: window.devicePixelRatio || 1,
      textToolActive: false,
      mobile: false,
      basePrice: basePrice,
      unitPriceCents: unitPriceCents,
      variantId: parseInt(this.dataset.variantId, 10) || null,
      variantAvailable: this.dataset.variantAvailable === 'true',
      projectId: window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      backgroundColor: '#FFFFFF',
      clipboard: null,
      touchStarted: null,
      lastTouchDist: 0,
      spacePressed: false,
      mobileOverride: null,
      multiSelectMode: false,
      exporting: false,
      snapEnabled: this.dataset.snapEnabled !== 'false',
      gridSize: Math.max(5, Math.min(100, parseInt(this.dataset.gridSize, 10) || 20)),
      gapSize: Math.max(3, Math.min(50, parseInt(this.dataset.gapMm, 10) || 3)),
      modalFile: null,
      modalImageSize: null,
      modalSizeExplicit: false,
      canvasBackgroundUserSelected: false,
      gridStrokeColor: '#E8E8E8'
    };

    // ── Compose submodules ──
    this.utils = new Utils(this);
    this.canvasRenderer = new CanvasRenderer(this);
    this.selectionManager = new SelectionManager(this);
    this.historyManager = new HistoryManager(this);
    this.priceManager = new PriceManager(this);
    this.clipboardManager = new ClipboardManager(this);
    this.snapEngine = new SnapEngine(this);
    this.collisionEngine = new CollisionEngine(this);
    this.itemManager = new ItemManager(this);
    this.interactionManager = new InteractionManager(this);
    this.mobileHandler = new MobileHandler(this);
    this.modalManager = new ModalManager(this);
    this.exportManager = new ExportManager(this);
    this.cartManager = new CartManager(this);
    this.keyboardManager = new KeyboardManager(this);
    this.alignmentEngine = new AlignmentEngine(this);

    // Fill the editor viewport at 100% zoom. The sheet keeps this width and
    // grows only downward when artwork needs more vertical room.
    this.resizeWorkspaceToViewport(false);

    // Set logical canvas dimensions at init. The viewport height is owned by CSS.
    if (this.canvas) {
      this.canvas.style.width = this.CANVAS_W + 'px';
      this.canvas.style.height = this.CANVAS_H + 'px';
    }

    // Apply the configured background, adapting only the default surface to
    // the site theme. A color explicitly chosen by the user remains intact.
    var bgColor = this.dataset.bgColor || '#F8F9FA';
    this.state.backgroundColor = bgColor;
    this._applyThemeCanvasBackground(document.documentElement.dataset.theme || 'light');

    this.canvasRenderer.drawGrid();
    this.canvasRenderer._syncZoomTransform();
    this.bindEvents();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if ('ResizeObserver' in window && this.wrap) {
      var core = this;
      this.resizeObserver = new ResizeObserver(function () {
        if (core._workspaceResizeRaf) cancelAnimationFrame(core._workspaceResizeRaf);
        core._workspaceResizeRaf = requestAnimationFrame(function () {
          core._workspaceResizeRaf = null;
          core.resizeWorkspaceToViewport(true);
        });
      });
      this.resizeObserver.observe(this.wrap);
    }
    this.historyManager.saveState();
    this.mobileHandler.autoDetectMobile();
    this.priceManager.updatePrice();
    this.selectionManager.updateSelection();

    // Set initial cursor
    if (this.canvas) {
      this.canvas.style.cursor = this.state.textToolActive ? 'crosshair' : 'default';
    }

    this._finishLoading();
  }

  _finishLoading() {
    var core = this;
    var elapsed = Date.now() - (this._loadingStartedAt || Date.now());
    var delay = Math.max(0, 260 - elapsed);
    if (this._revealTimer) clearTimeout(this._revealTimer);
    this._revealTimer = setTimeout(function () {
      core.classList.remove('is-loading');
      core.classList.add('is-ready');
      core.setAttribute('aria-busy', 'false');
      core._revealTimer = null;
    }, delay);
  }

  /* ── DOM caching ── */
  _cacheDomRefs() {
    var sid = this.dataset.sectionId;
    var ids = [
      'canvas-wrap', 'canvas-stage', 'canvas', 'grid-canvas', 'hint', 'file-input', 'modal',
      'export-overlay',
      'undo-btn', 'redo-btn', 'item-count', 'price-display', 'qty-display',
      'mobile-btn', 'multi-select-btn', 'guide-h', 'guide-v',
      'del-btn', 'dup-btn', 'flip-h', 'flip-v',
      'lock-btn', 'size-inputs', 'w-input', 'h-input',
      'auto-btn', 'export-btn', 'text-btn', 'zoom-fit',
      'qty-down', 'qty-up', 'clear-btn', 'bg-color',
      'snap-btm', 'grid-size', 'gap-size',
      'add-btn', 'submit', 'cart-status', 'variant-select',
      'modal-cancel', 'modal-zone', 'modal-add',
      'modal-w', 'modal-h', 'modal-qty', 'modal-fname',
      'stats'
    ];

    for (var i = 0; i < ids.length; i++) {
      var key = ids[i];
      this.cache[key] = this.querySelector('#' + key + '-' + sid);
    }

    // Convenience aliases
    this.wrap = this.cache['canvas-wrap'];
    this.canvasStage = this.cache['canvas-stage'];
    this.canvas = this.cache['canvas'];
    this.gridCanvas = this.cache['grid-canvas'];
    this.hintEl = this.cache['hint'];
    this.fileInput = this.cache['file-input'];
    this.modalEl = this.cache['modal'];
    this.exportOverlay = this.cache['export-overlay'];
    this.undoBtn = this.cache['undo-btn'];
    this.redoBtn = this.cache['redo-btn'];
    this.countEl = this.cache['item-count'];
    this.priceEl = this.cache['price-display'];
    this.qtyEl = this.cache['qty-display'];
    this.mobileBtn = this.cache['mobile-btn'];
    this.multiSelectBtn = this.cache['multi-select-btn'];
    this.guideH = this.cache['guide-h'];
    this.guideV = this.cache['guide-v'];
  }

  _setCanvasBackground(color) {
    if (!color) return;
    this.state.backgroundColor = color;
    if (this.wrap) this.wrap.style.setProperty('--cfg-grid-surface', color);
    if (this.gridCanvas) this.gridCanvas.style.background = color;
    if (this.canvas) this.canvas.style.background = color;
    if (this.canvasRenderer) this.canvasRenderer.drawGrid();
  }

  _applyThemeCanvasBackground(mode) {
    if (this.state.canvasBackgroundUserSelected) return;
    var configuredBackground = this.dataset.bgColor || '#F8F9FA';
    var background = mode === 'dark' ? '#191c23' : configuredBackground;
    this.state.gridStrokeColor = mode === 'dark' ? '#3a3f4b' : '#E8E8E8';
    this._setCanvasBackground(background);
  }

  /* ── Event Binding Toolbar Delegation ── */
  bindEvents() {
    var signal = this.abortController.signal;
    var core = this;

    document.addEventListener('theme:change', function (event) {
      core._applyThemeCanvasBackground(event.detail && event.detail.mode ? event.detail.mode : 'light');
    }, { signal: signal });

    // Keep a two-finger gesture inside the editor. Without this capture-level
    // guard some mobile browsers treat the same pinch as page zoom, which
    // scales the UI even though the canvas zoom itself is clamped at 100%.
    var preventViewportPinch = function (e) {
      if (e.type.indexOf('gesture') === 0 || (e.touches && e.touches.length > 1)) {
        e.preventDefault();
      }
    };
    this.addEventListener('touchstart', preventViewportPinch, { signal: signal, capture: true, passive: false });
    this.addEventListener('touchmove', preventViewportPinch, { signal: signal, capture: true, passive: false });
    this.addEventListener('gesturestart', preventViewportPinch, { signal: signal, passive: false });
    this.addEventListener('gesturechange', preventViewportPinch, { signal: signal, passive: false });

    var variantSelect = this.cache['variant-select'];
    if (variantSelect) {
      variantSelect.addEventListener('change', function () {
        var option = variantSelect.options[variantSelect.selectedIndex];
        core.state.variantId = parseInt(option.value, 10) || null;
        core.state.unitPriceCents = parseInt(option.dataset.priceCents, 10) || 0;
        core.state.variantAvailable = option.dataset.available === 'true';
        core.priceManager.updatePrice();
        core.cartManager.setStatus('');
      }, { signal });
    }

    // Toolbar DELEGATION (V22 fix): use data-action on .toolbar container
    var toolbar = this.querySelector('.toolbar');
    if (toolbar) {
      var touchActionHandledUntil = 0;
      toolbar.addEventListener('pointerup', function (e) {
        if (e.pointerType !== 'touch') return;
        var btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        touchActionHandledUntil = Date.now() + 500;
        core._handleToolbarAction(btn.dataset.action);
      }, { signal: signal });
      toolbar.addEventListener('click', function (e) {
        if (Date.now() < touchActionHandledUntil) {
          touchActionHandledUntil = 0;
          return;
        }
        var btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        var action = btn.dataset.action;
        core._handleToolbarAction(action);
      }, { signal });

      // Update toolbar buttons from Liquid template to use data-action
      this._updateToolbarForDelegation();
    }

    // Canvas mouse events
    if (this.canvas) {
      this.canvas.addEventListener('mousedown', function (e) { core.interactionManager.onMouseDown(e); }, { signal });
      this.canvas.addEventListener('mousemove', function (e) { core.interactionManager.onMouseMove(e); }, { signal });
      this.canvas.addEventListener('mouseup', function (e) { core.interactionManager.onMouseUp(e); }, { signal });
      this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { signal });

      this.canvas.addEventListener('touchstart', function (e) { core.interactionManager.onTouchStart(e); }, { signal, passive: false });
      this.canvas.addEventListener('touchmove', function (e) { core.interactionManager.onTouchMove(e); }, { signal, passive: false });
      this.canvas.addEventListener('touchend', function (e) { core.interactionManager.onTouchEnd(e); }, { signal, passive: true });
      this.canvas.addEventListener('touchcancel', function () { core.interactionManager.onTouchCancel(); }, { signal, passive: true });

      this.canvas.addEventListener('drop', function (e) { core.handleCanvasDrop(e); }, { signal });
      this.canvas.addEventListener('dragover', function (e) { e.preventDefault(); }, { signal });
    }

    if (this.wrap) {
      this.wrap.addEventListener('wheel', function (e) { core.interactionManager.onWheel(e); }, { signal, passive: false });
      this.wrap.addEventListener('scroll', function () {
        core.state.panX = core.wrap.scrollLeft;
        core.state.panY = core.wrap.scrollTop;
        core.canvasRenderer.scheduleBackdropGridSync();
      }, { signal, passive: true });
    }

    // Keyboard
    document.addEventListener('keydown', function (e) {
      var isField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
      if (e.code === 'Space' && !isField && core.matches(':hover')) {
        e.preventDefault();
        core.state.spacePressed = true;
        if (core.wrap) core.wrap.classList.add('is-pan-ready');
      }
      core.keyboardManager.onKeyDown(e);
    }, { signal });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Space') {
        core.state.spacePressed = false;
        if (core.wrap) core.wrap.classList.remove('is-pan-ready');
      }
    }, { signal });
    document.addEventListener('mouseup', function (e) {
      if (core.state && core.state.dragState) core.interactionManager.onMouseUp(e);
    }, { signal });
    window.addEventListener('resize', function () {
      if (core.mobileHandler) core.mobileHandler.syncToViewport();
      if (core.canvasRenderer) {
        core.resizeWorkspaceToViewport(true);
        core.canvasRenderer.scheduleBackdropGridSync();
      }
    }, { signal, passive: true });

    // Add design button
    var addBtn = this.cache['add-btn'];
    if (addBtn) {
      addBtn.addEventListener('click', function () { core.modalManager.showAddDesignModal(); }, { signal });
    }

    // Modal events
    var modalCancel = this.cache['modal-cancel'];
    if (modalCancel) {
      modalCancel.addEventListener('click', function () { core.modalManager.closeModal(core.modalEl); }, { signal });
    }
    var modalZone = this.cache['modal-zone'];
    if (modalZone) {
      modalZone.addEventListener('click', function () { if (core.fileInput) core.fileInput.click(); }, { signal });
      modalZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (core.fileInput) core.fileInput.click();
        }
      }, { signal });
      modalZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        modalZone.classList.add('is-dragover');
      }, { signal });
      modalZone.addEventListener('dragleave', function () {
        modalZone.classList.remove('is-dragover');
      }, { signal });
      modalZone.addEventListener('drop', function (e) {
        e.preventDefault();
        modalZone.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files.length) {
          core.handleFileSelect(e.dataTransfer.files[0]);
        }
      }, { signal });
    }
    var modalAddBtn = this.cache['modal-add'];
    if (modalAddBtn) {
      modalAddBtn.addEventListener('click', function () { core.onModalAddClick(); }, { signal });
    }
    ['modal-w', 'modal-h'].forEach(function (key) {
      var input = core.cache[key];
      if (input) {
        input.addEventListener('input', function () {
          core.state.modalSizeExplicit = true;
        }, { signal });
      }
    });
    if (this.fileInput) {
      this.fileInput.addEventListener('change', function () { core.handleFileSelect(core.fileInput.files[0]); }, { signal });
    }

    // Quantity buttons
    var qtyDown = this.cache['qty-down'];
    if (qtyDown) {
      qtyDown.addEventListener('click', function () { core.priceManager.qtyDown(); }, { signal });
    }
    var qtyUp = this.cache['qty-up'];
    if (qtyUp) {
      qtyUp.addEventListener('click', function () { core.priceManager.qtyUp(); }, { signal });
    }

    // Size inputs
    var wInput = this.cache['w-input'];
    var hInput = this.cache['h-input'];
    if (wInput) {
      wInput.addEventListener('input', function () { core.utils.onSizeInput('w'); }, { signal });
      wInput.addEventListener('change', function () { core.historyManager.saveState(); core.growCanvas(); }, { signal });
    }
    if (hInput) {
      hInput.addEventListener('input', function () { core.utils.onSizeInput('h'); }, { signal });
      hInput.addEventListener('change', function () { core.historyManager.saveState(); core.growCanvas(); }, { signal });
    }

    // Background color input
    var bgColorInput = this.cache['bg-color'];
    if (bgColorInput) {
      bgColorInput.addEventListener('input', function () {
        core.state.canvasBackgroundUserSelected = true;
        core.state.gridStrokeColor = '#E8E8E8';
        core._setCanvasBackground(bgColorInput.value);
      }, { signal });
    }

    // Clear button
    var clearBtn = this.cache['clear-btn'];
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (core.state.items.length === 0) return;
        core.modalManager.showConfirmModal('Clear all designs?', function () {
          core.historyManager.saveState();
          core.state.items.slice().forEach(function (it) { it.el.remove(); });
          core.state.items.length = 0;
          core.state.selectedIds = [];
          core.selectionManager.updateSelection();
          core.priceManager.updateCount();
          core.priceManager.updatePrice();
          core.historyManager.saveState();
          if (core.hintEl) core.hintEl.style.display = '';
        });
      }, { signal });
    }

    // Snap checkbox (V04 fix): wire to this.state.snapEnabled
    var snapCheckbox = this.cache['snap-btm'];
    if (snapCheckbox) {
      snapCheckbox.addEventListener('change', function () {
        core.state.snapEnabled = snapCheckbox.checked;
      }, { signal });
    }

    // Grid size
    var gridSizeInput = this.cache['grid-size'];
    if (gridSizeInput) {
      gridSizeInput.addEventListener('change', function () {
        core.state.gridSize = parseInt(gridSizeInput.value) || 20;
        core.canvasRenderer.drawGrid();
      }, { signal });
    }

    // Gap size
    var gapSizeInput = this.cache['gap-size'];
    if (gapSizeInput) {
      gapSizeInput.value = this.state.gapSize;
      gapSizeInput.addEventListener('change', function () {
        var nextGap = parseInt(gapSizeInput.value, 10);
        var previousGap = core.state.gapSize;
        var clampedGap = Math.max(3, Math.min(50, Number.isFinite(nextGap) ? nextGap : 3));
        if (clampedGap === previousGap) {
          gapSizeInput.value = previousGap;
          return;
        }
        core.historyManager.saveState();
        core.state.gapSize = clampedGap;
        gapSizeInput.value = core.state.gapSize;
        if (core.state.items.length) {
          if (!core.alignmentEngine.onAutoArrange({ skipInitialHistory: true })) {
            core.state.gapSize = previousGap;
            gapSizeInput.value = previousGap;
          }
        } else {
          core.historyManager.saveState();
        }
      }, { signal });
    }

    this._bindCartButton(signal);
  }

  _bindCartButton(signal) {
    var core = this;
    var submitBtn = this.cache && this.cache.submit;
    if (!submitBtn) return;
    submitBtn.addEventListener('click', function () {
      core.cartManager.addToCart();
    }, { signal: signal });
  }

  /* ── Update toolbar buttons for delegation ── */
  _updateToolbarForDelegation() {
    var actionMap = {
      'undo-btn': 'undo',
      'redo-btn': 'redo',
      'auto-btn': 'auto-arrange',
      'del-btn': 'delete',
      'dup-btn': 'duplicate',
      'flip-h': 'flip-h',
      'flip-v': 'flip-v',
      'text-btn': 'add-text',
      'zoom-fit': 'zoom-fit',
      'export-btn': 'export-pdf',
      'lock-btn': 'lock',
      'mobile-btn': 'mobile',
      'multi-select-btn': 'multi-select'
    };

    for (var id in actionMap) {
      if (!actionMap.hasOwnProperty(id)) continue;
      var btn = this.querySelector('#' + id + '-' + this.sid);
      if (btn) {
        btn.dataset.action = actionMap[id];
        if (!btn.getAttribute('aria-label') && btn.getAttribute('title')) {
          btn.setAttribute('aria-label', btn.getAttribute('title'));
        }
        if (!btn.getAttribute('title')) {
          btn.setAttribute('title', actionMap[id].replace(/-/g, ' '));
        }
      }
    }
  }

  /* ── Toolbar action router ── */
  _handleToolbarAction(action) {
    if (this.state.exporting && action !== 'export-pdf') return;
    var features = this.dataset || {};
    switch (action) {
      case 'undo': if (features.undoEnabled !== 'false') this.historyManager.undo(); break;
      case 'redo': if (features.undoEnabled !== 'false') this.historyManager.redo(); break;
      case 'auto-arrange': if (features.autoArrangeEnabled !== 'false') this.alignmentEngine.onAutoArrange(); break;
      case 'delete': this.itemManager.deleteSelected(); break;
      case 'duplicate': this.itemManager.duplicateSelected(); break;
      case 'flip-h': this.itemManager.flipH(); break;
      case 'flip-v': this.itemManager.flipV(); break;
      case 'add-text': this.interactionManager.onTextToolToggle(); break;
      case 'zoom-fit': this.canvasRenderer.zoomToFit(); break;
      case 'export-pdf': if (features.exportEnabled !== 'false') this.exportManager.onExportPDF(); break;
      case 'lock': this.itemManager.lockSelected(); break;
      case 'mobile': this.mobileHandler.onMobileToggle(); break;
      case 'multi-select':
        this.state.multiSelectMode = !this.state.multiSelectMode;
        if (this.multiSelectBtn) {
          this.multiSelectBtn.classList.toggle('active', this.state.multiSelectMode);
          this.multiSelectBtn.setAttribute('aria-pressed', String(this.state.multiSelectMode));
          this.multiSelectBtn.title = this.state.multiSelectMode
            ? configuratorText(this, 'multi_select_exit', 'Exit multi-select')
            : configuratorText(this, 'multi_select', 'Multi-select');
        }
        break;
      default: break;
    }
  }

  resizeWorkspaceToViewport(renderAfterResize) {
    if (!this.wrap || !this.state) return false;
    var oldWidth = Math.max(1, Number(this.CANVAS_W) || 600);
    var oldHeight = Math.max(1, Number(this.CANVAS_H) || 400);
    var targetWidth = Math.max(240, Math.floor(this.wrap.clientWidth || 0));
    var viewportHeight = Math.floor(this.wrap.clientHeight || 0);
    if (!(targetWidth > 0)) return false;

    var scale = targetWidth / oldWidth;
    var targetHeight = viewportHeight > 0 ? viewportHeight : oldHeight * scale;
    if (this.state.items.length) {
      var maxBottom = 0;
      var collisionEngine = this.collisionEngine;
      this.state.items.forEach(function (item) {
        var rect = collisionEngine ? collisionEngine.getCollisionRect(item) : item;
        maxBottom = Math.max(maxBottom, (rect.y + rect.h) * scale);
      });
      var bottomPadding = (this.utils ? this.utils.mmToPx(20) : 20) * scale;
      targetHeight = Math.max(targetHeight, maxBottom + bottomPadding);
    }
    targetHeight = Math.max(1, Math.ceil(targetHeight));
    if (Math.abs(targetWidth - oldWidth) < 1 && Math.abs(targetHeight - oldHeight) < 1) return false;

    var oldScrollLeft = this.wrap.scrollLeft || 0;
    var oldScrollTop = this.wrap.scrollTop || 0;
    function scaleGeometry(data) {
      if (!data) return;
      ['x', 'y', 'w', 'h'].forEach(function (key) {
        if (Number.isFinite(data[key])) data[key] *= scale;
      });
      if (Number.isFinite(data.fontSize)) data.fontSize *= scale;
    }

    this.CANVAS_W = targetWidth;
    this.CANVAS_H = targetHeight;
    this.state.items.forEach(function (item) {
      scaleGeometry(item);
      if (!item.el) return;
      item.el.style.left = item.x + 'px';
      item.el.style.top = item.y + 'px';
      item.el.style.width = item.w + 'px';
      item.el.style.height = item.h + 'px';
      var textContent = item.el.querySelector('.text-content');
      if (textContent && Number.isFinite(item.fontSize)) {
        textContent.style.fontSize = item.fontSize + 'px';
      }
    });

    (this.state.history || []).forEach(function (snapshot) {
      snapshot.forEach(scaleGeometry);
    });
    if (Array.isArray(this.state.clipboard)) {
      this.state.clipboard.forEach(scaleGeometry);
    }

    if (renderAfterResize !== false && this.canvasRenderer) {
      this.canvasRenderer.drawGrid();
      this.canvasRenderer._syncZoomTransform();
      this.wrap.scrollLeft = oldScrollLeft * scale;
      this.wrap.scrollTop = oldScrollTop * scale;
      this.canvasRenderer.clampPan();
      if (this.selectionManager) this.selectionManager.updateSelection();
      if (this.priceManager) this.priceManager.updateStats();
    }
    return true;
  }

  /* ── CRITICAL: growCanvas() — physical height grows, never shrinks ── */

  growCanvas() {
    if (!this.state.items.length) return;
    var maxB = 0;
    var collisionEngine = this.collisionEngine;
    this.state.items.forEach(function (it) {
      var rect = collisionEngine.getCollisionRect(it);
      var b = rect.y + rect.h;
      if (b > maxB) maxB = b;
    });
    var bottomPadding = this.utils ? this.utils.mmToPx(20) : 20;
    var newH = Math.max(this.CANVAS_H, maxB + bottomPadding);
    if (newH > this.CANVAS_H) {
      this.CANVAS_H = newH;
      this.canvasRenderer.drawGrid();
      this.canvasRenderer._syncZoomTransform();
    }
  }

  /* ── CRITICAL: updateCanvasWH() — STUB, must exist ── */

  updateCanvasWH() {
    // STUB — called in zoom/drag hot paths
  }

  /* ── Item operations (delegated forward) ── */

  getSelected() {
    return this.selectionManager.getSelected();
  }

  applyTransform(item) {
    if (!item || !item.el) return;
    var transforms = [];
    transforms.push('scale(' + (item.scaleX || 1) + ', ' + (item.scaleY || 1) + ')');
    if (item.rotation) {
      transforms.push('rotate(' + item.rotation + 'deg)');
    }
    item.el.style.transform = transforms.join(' ');
  }

  /* ── File handling ── */

  handleFileSelect(file) {
    if (!file) return;
    var allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    var maxBytes = Math.max(2, Number(this.dataset.maxFileMb) || 20) * 1024 * 1024;
    if (allowedTypes.indexOf(file.type) === -1) {
      this.modalManager.showErrorModal(configuratorText(this, 'file_type_error', 'Use a PNG, JPG, or WebP artwork file.'));
      if (this.fileInput) this.fileInput.value = '';
      return;
    }
    if (file.size > maxBytes) {
      this.modalManager.showErrorModal(configuratorText(
        this,
        'file_size_error',
        'Artwork files must be smaller than ' + (Number(this.dataset.maxFileMb) || 20) + ' MB.'
      ));
      if (this.fileInput) this.fileInput.value = '';
      return;
    }
    this.state.modalFile = file;
    this.state.modalImageSize = null;
    this.state.modalSizeExplicit = false;
    var modalFname = this.cache['modal-fname'];
    var modalZone = this.cache['modal-zone'];
    var modalAddBtn = this.cache['modal-add'];
    if (modalFname) {
      modalFname.textContent = file.name;
      modalFname.style.display = 'block';
    }
    if (modalZone) {
      var textEl = modalZone.querySelector('.cfg-modal-text');
      var iconEl = modalZone.querySelector('.cfg-modal-icon');
      if (textEl) textEl.textContent = configuratorText(this, 'design_selected', 'File selected');
      if (iconEl) {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      }
    }
    if (modalAddBtn) modalAddBtn.disabled = true;
    this.modalManager.openModal(this.modalEl);

    var core = this;
    var objectUrl = URL.createObjectURL(file);
    var probe = new Image();
    probe.onload = function () {
      var pixelCount = (probe.naturalWidth || probe.width) * (probe.naturalHeight || probe.height);
      if (pixelCount > 50000000) {
        core.state.modalFile = null;
        if (modalAddBtn) modalAddBtn.disabled = true;
        URL.revokeObjectURL(objectUrl);
        core.modalManager.closeModal(core.modalEl);
        core.modalManager.showErrorModal(configuratorText(core, 'resolution_too_large', 'Artwork resolution is too large. The maximum is 50 megapixels.'));
        return;
      }
      var fitted = core._fitModalImageSize(
        probe.naturalWidth || probe.width,
        probe.naturalHeight || probe.height
      );
      core.state.modalImageSize = fitted;
      core.state.modalSourcePixels = {
        width: probe.naturalWidth || probe.width,
        height: probe.naturalHeight || probe.height
      };
      if (modalFname) {
        modalFname.textContent = file.name + ' · ' +
          core.state.modalSourcePixels.width + '×' + core.state.modalSourcePixels.height + ' px';
      }
      if (!core.state.modalSizeExplicit) {
        if (core.cache['modal-w']) core.cache['modal-w'].value = fitted.w;
        if (core.cache['modal-h']) core.cache['modal-h'].value = fitted.h;
      }
      if (modalAddBtn) modalAddBtn.disabled = false;
      URL.revokeObjectURL(objectUrl);
    };
    probe.onerror = function () {
      if (modalAddBtn) modalAddBtn.disabled = false;
      URL.revokeObjectURL(objectUrl);
    };
    probe.src = objectUrl;
  }

  handleCanvasDrop(e) {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      this.handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  onModalAddClick() {
    var file = this.state.modalFile;
    if (!file) return;
    var modalW = this.cache['modal-w'];
    var modalH = this.cache['modal-h'];
    var modalQty = this.cache['modal-qty'];
    var natural = this.state.modalImageSize;
    var wMm = parseInt(modalW && modalW.value, 10);
    var hMm = parseInt(modalH && modalH.value, 10);
    if (!this.state.modalSizeExplicit && natural) {
      wMm = natural.w;
      hMm = natural.h;
    }
    wMm = Number.isFinite(wMm) && wMm > 0 ? wMm : (natural ? natural.w : 50);
    hMm = Number.isFinite(hMm) && hMm > 0 ? hMm : (natural ? natural.h : 50);
    var qty = parseInt(modalQty ? modalQty.value : 1) || 1;

    this.modalManager.closeModal(this.modalEl);

    var reader = new FileReader();
    var core = this;
    reader.onload = function (e) {
      for (var i = 0; i < qty; i++) {
        core.itemManager.addImageItem(e.target.result, false, {
          w: core.utils ? core.utils.mmToPx(wMm) : wMm,
          h: core.utils ? core.utils.mmToPx(hMm) : hMm
        });
      }
      core.growCanvas();
      core.historyManager.saveState();
      core.alignmentEngine.onAutoArrange();
    };
    reader.readAsDataURL(file);
  }

  _fitModalImageSize(width, height) {
    var max = this.SHEET_WIDTH_MM || 600;
    var maxHeight = this.utils ? this.utils.getWorkspaceHeightMm() : (this.INITIAL_SHEET_HEIGHT_MM || 400);
    var sourceW = Math.max(1, Number(width) || 1);
    var sourceH = Math.max(1, Number(height) || 1);
    var w = sourceW / 300 * 25.4;
    var h = sourceH / 300 * 25.4;
    var scale = Math.min(1, max / w, maxHeight / h);
    return {
      w: Math.max(10, Math.round(w * scale)),
      h: Math.max(10, Math.round(h * scale))
    };
  }

  /* ── CustomEvent protocol ── */

  dispatchUpdateEvent() {
    var core = this;
    var areaMm = 0;
    this.state.items.forEach(function (it) {
      var widthMm = core.utils ? core.utils.pxToMm(it.w) : it.w;
      var heightMm = core.utils ? core.utils.pxToMm(it.h) : it.h;
      areaMm += widthMm * heightMm;
    });
    var areaCm = Math.round(areaMm / 100);
    this.dispatchEvent(new CustomEvent('sticker-configurator:update', {
      bubbles: true,
      detail: {
        itemCount: this.state.items.length,
        totalAreaCm: areaCm,
        type: 'update'
      }
    }));
  }

  dispatchSelectionEvent() {
    this.dispatchEvent(new CustomEvent('sticker-configurator:selection', {
      bubbles: true,
      detail: {
        selectedIds: this.state.selectedIds.slice(),
        count: this.state.selectedIds.length,
        type: 'selection'
      }
    }));
  }

  dispatchPriceEvent() {
    var qty = parseInt(this.qtyEl ? this.qtyEl.textContent : 1) || 1;
    var cartQuantity = this.state.items.length
      ? (this.cartManager ? this.cartManager.getCartQuantity() : qty)
      : 0;
    var totalCents = this.state.unitPriceCents * cartQuantity;
    this.dispatchEvent(new CustomEvent('sticker-configurator:price', {
      bubbles: true,
      detail: {
        price: totalCents / 100,
        priceCents: totalCents,
        quantity: qty,
        cartQuantity: cartQuantity,
        unitPriceCents: this.state.unitPriceCents,
        currency: this.dataset.currency || 'USD',
        type: 'price'
      }
    }));
  }

  dispatchAddToCartEvent(response) {
    this.dispatchEvent(new CustomEvent('sticker-configurator:add-to-cart', {
      bubbles: true,
      detail: {
        variantId: this.state.variantId,
        quantity: this.cartManager ? this.cartManager.getCartQuantity() : 0,
        projectId: this.state.projectId,
        response: response || null,
        type: 'add-to-cart'
      }
    }));
  }

  dispatchExportEvent() {
    this.dispatchEvent(new CustomEvent('sticker-configurator:export', {
      bubbles: true,
      detail: {
        type: 'export',
        format: 'pdf'
      }
    }));
  }
}

/* ── Registration ── */
if (!customElements.get('sticker-configurator')) {
  customElements.define('sticker-configurator', StickerConfigurator);
}
