(() => {
  'use strict';

  const SELECTOR = '[data-sample-gallery]';
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.5;

  class ProductSamplesGallery {
    constructor(root) {
      this.root = root;
      this.root.dataset.sampleGalleryReady = 'true';
      this.dialog = root.querySelector('[data-sample-dialog]');
      this.filterBar = root.querySelector('[data-sample-filter-bar]');
      this.grid = root.querySelector('[data-sample-grid]');
      this.emptyFilter = root.querySelector('[data-sample-empty-filter]');
      this.closeButton = root.querySelector('[data-sample-close]');
      this.previousButton = root.querySelector('[data-sample-previous]');
      this.nextButton = root.querySelector('[data-sample-next]');
      this.viewport = root.querySelector('[data-sample-viewport]');
      this.dialogImage = root.querySelector('[data-sample-dialog-image]');
      this.dialogTitle = root.querySelector('[data-sample-dialog-title]');
      this.dialogCategory = root.querySelector('[data-sample-dialog-category]');
      this.dialogDescription = root.querySelector('[data-sample-dialog-description]');
      this.counter = root.querySelector('[data-sample-counter]');
      this.thumbnails = root.querySelector('[data-sample-thumbnails]');
      this.zoomOutButton = root.querySelector('[data-sample-zoom="out"]');
      this.zoomInButton = root.querySelector('[data-sample-zoom="in"]');
      this.zoomResetButton = root.querySelector('[data-sample-zoom="reset"]');

      this.items = [];
      this.activeItem = null;
      this.lastFocusedElement = null;
      this.zoom = MIN_ZOOM;
      this.panX = 0;
      this.panY = 0;
      this.dragState = null;

      if (!this.dialog || !this.grid) return;

      this.collectItems();
      this.bindEvents();
      this.buildFilters();
      this.applyFilter('all');
      this.updateZoomState();
    }

    collectItems() {
      this.items = Array.from(this.grid.querySelectorAll('[data-sample-card]'))
        .map((card) => {
          const trigger = card.querySelector('[data-sample-open]');
          if (!trigger) return null;

          const images = Array.from(card.querySelectorAll('[data-sample-image]')).map((image) => ({
            fullSrc: image.dataset.sampleFullSrc || '',
            thumbSrc: image.dataset.sampleThumbSrc || image.dataset.sampleFullSrc || '',
            alt: image.dataset.sampleAlt || trigger.dataset.sampleTitle || '',
          }));

          return {
            card,
            trigger,
            category: trigger.dataset.sampleCategory || 'other',
            categoryLabel: trigger.dataset.sampleCategoryLabel || '',
            title: trigger.dataset.sampleTitle || '',
            description: trigger.dataset.sampleDescription || '',
            images,
            activeImageIndex: 0,
          };
        })
        .filter((item) => item && item.images.length > 0);

      this.items.forEach((item, index) => {
        item.index = index;
      });

      if (this.items.length === 0) {
        this.root.classList.add('product-samples--empty');
      }
    }

    bindEvents() {
      this.items.forEach((item) => {
        item.trigger.addEventListener('click', () => this.openItem(item));

        item.previousButton = item.card.querySelector('[data-sample-card-previous]');
        item.nextButton = item.card.querySelector('[data-sample-card-next]');
        item.dots = item.card.querySelector('[data-sample-card-dots]');

        item.previousButton?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.setCardImage(item, item.activeImageIndex - 1);
        });
        item.nextButton?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.setCardImage(item, item.activeImageIndex + 1);
        });

        this.buildCardDots(item);
        this.setCardImage(item, 0);
      });

      this.filterBar?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-sample-filter]');
        if (!button || !this.filterBar.contains(button)) return;
        this.applyFilter(button.dataset.sampleFilter || 'all');
      });

      this.closeButton?.addEventListener('click', () => this.close());
      this.previousButton?.addEventListener('click', () => this.goToRelativeItem(-1));
      this.nextButton?.addEventListener('click', () => this.goToRelativeItem(1));

      this.root.querySelectorAll('[data-sample-zoom]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.sampleZoom;
          if (action === 'in') this.changeZoom(ZOOM_STEP);
          if (action === 'out') this.changeZoom(-ZOOM_STEP);
          if (action === 'reset') this.resetZoom();
        });
      });

      this.dialog.addEventListener('click', (event) => {
        if (event.target === this.dialog) this.close();
      });

      this.dialog.addEventListener('close', () => this.handleDialogClose());
      this.dialog.addEventListener('cancel', () => {
        this.resetZoom();
      });
      this.dialog.addEventListener('keydown', (event) => this.handleKeyDown(event));

      this.viewport?.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
      this.viewport?.addEventListener('dblclick', () => {
        if (this.zoom > MIN_ZOOM) {
          this.resetZoom();
        } else {
          this.setZoom(2);
        }
      });
      this.viewport?.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
      this.viewport?.addEventListener('pointermove', (event) => this.handlePointerMove(event));
      this.viewport?.addEventListener('pointerup', (event) => this.handlePointerUp(event));
      this.viewport?.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
    }

    buildCardDots(item) {
      if (!item.dots || item.images.length < 2) return;

      item.images.forEach((image, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'product-samples__card-dot';
        dot.dataset.sampleCardDot = String(index);
        dot.setAttribute('aria-label', `${item.title}, photo ${index + 1}`);
        dot.setAttribute('aria-pressed', String(index === 0));
        dot.addEventListener('click', (event) => {
          event.stopPropagation();
          this.setCardImage(item, index);
        });
        item.dots.append(dot);
      });
    }

    setCardImage(item, imageIndex) {
      if (!item || item.images.length === 0) return;

      const nextIndex = (imageIndex + item.images.length) % item.images.length;
      item.activeImageIndex = nextIndex;

      item.card.querySelectorAll('[data-sample-card-slide]').forEach((slide, index) => {
        const isActive = index === nextIndex;
        slide.hidden = !isActive;
        slide.setAttribute('aria-hidden', String(!isActive));
      });

      item.dots?.querySelectorAll('[data-sample-card-dot]').forEach((dot, index) => {
        dot.setAttribute('aria-pressed', String(index === nextIndex));
      });

      const hasMultiple = item.images.length > 1;
      if (item.previousButton) item.previousButton.hidden = !hasMultiple;
      if (item.nextButton) item.nextButton.hidden = !hasMultiple;
      if (item.dots) item.dots.hidden = !hasMultiple;
    }

    buildFilters() {
      if (!this.filterBar || this.items.length === 0) return;

      const categories = [];
      const labels = new Map();

      this.items.forEach((item) => {
        if (!categories.includes(item.category)) categories.push(item.category);
        if (!labels.has(item.category)) labels.set(item.category, item.categoryLabel || item.category);
      });

      categories.forEach((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'product-samples__filter-button';
        button.dataset.sampleFilter = category;
        button.setAttribute('aria-pressed', 'false');
        button.textContent = labels.get(category);
        this.filterBar.append(button);
      });
    }

    applyFilter(category) {
      const visibleItems = this.items.filter((item) => category === 'all' || item.category === category);

      this.items.forEach((item) => {
        const isVisible = visibleItems.includes(item);
        item.card.hidden = !isVisible;
        item.card.setAttribute('aria-hidden', String(!isVisible));
        item.trigger.tabIndex = isVisible ? 0 : -1;
      });

      this.filterBar?.querySelectorAll('[data-sample-filter]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.sampleFilter === category));
      });

      if (this.emptyFilter) this.emptyFilter.hidden = visibleItems.length > 0;
    }

    getVisibleItems() {
      return this.items.filter((item) => !item.card.hidden);
    }

    getVisibleViews() {
      return this.getVisibleItems().flatMap((item) =>
        item.images.map((image, imageIndex) => ({ item, image, imageIndex })),
      );
    }

    openItem(item, { focusClose = true, imageIndex = item?.activeImageIndex || 0 } = {}) {
      if (!item || !this.dialog || item.images.length === 0) return;

      const wasOpen = this.dialog.open;
      this.activeItem = item;
      this.setCardImage(item, imageIndex);
      if (!wasOpen) {
        this.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      this.updateDialogContent(item, item.images[item.activeImageIndex]);

      if (!wasOpen) {
        if (typeof this.dialog.showModal === 'function') {
          this.dialog.showModal();
        } else {
          this.dialog.setAttribute('open', '');
        }
      }

      this.resetZoom();
      this.updateThumbnails();

      if (focusClose) {
        window.requestAnimationFrame(() => this.closeButton?.focus());
      }
    }

    updateDialogContent(item, image) {
      if (this.dialogImage) {
        this.dialogImage.src = image.fullSrc;
        this.dialogImage.alt = image.alt;
      }

      if (this.dialogTitle) this.dialogTitle.textContent = item.title;
      if (this.dialogCategory) this.dialogCategory.textContent = item.categoryLabel;
      if (this.dialogDescription) {
        this.dialogDescription.textContent = item.description;
        this.dialogDescription.hidden = !item.description;
      }

      const visibleViews = this.getVisibleViews();
      const visiblePosition = visibleViews.findIndex(
        (view) => view.item === item && view.imageIndex === item.activeImageIndex,
      );
      if (this.counter) {
        this.counter.textContent = `${Math.max(visiblePosition + 1, 1)} / ${visibleViews.length}`;
      }

      const hasMultiple = visibleViews.length > 1;
      if (this.previousButton) this.previousButton.disabled = !hasMultiple;
      if (this.nextButton) this.nextButton.disabled = !hasMultiple;
    }

    updateThumbnails() {
      if (!this.thumbnails) return;

      this.thumbnails.replaceChildren();
      const visibleViews = this.getVisibleViews();

      visibleViews.forEach((view) => {
        const { item, image, imageIndex } = view;
        const thumbnail = document.createElement('button');
        thumbnail.type = 'button';
        thumbnail.className = 'product-samples__thumbnail';
        thumbnail.setAttribute('role', 'listitem');
        thumbnail.setAttribute('aria-label', `${item.title}, photo ${imageIndex + 1}`);
        thumbnail.setAttribute(
          'aria-selected',
          String(item === this.activeItem && imageIndex === item.activeImageIndex),
        );

        const imageElement = document.createElement('img');
        imageElement.src = image.thumbSrc;
        imageElement.alt = '';
        imageElement.loading = 'lazy';
        imageElement.decoding = 'async';
        thumbnail.append(imageElement);
        thumbnail.addEventListener('click', () =>
          this.openItem(item, { focusClose: false, imageIndex }),
        );
        this.thumbnails.append(thumbnail);
      });
    }

    goToRelativeItem(direction) {
      const visibleViews = this.getVisibleViews();
      if (visibleViews.length < 2) return;

      let position = visibleViews.findIndex(
        (view) => view.item === this.activeItem && view.imageIndex === this.activeItem.activeImageIndex,
      );
      if (position < 0) position = 0;
      const nextPosition = (position + direction + visibleViews.length) % visibleViews.length;
      const nextView = visibleViews[nextPosition];
      this.openItem(nextView.item, { focusClose: false, imageIndex: nextView.imageIndex });
    }

    handleKeyDown(event) {
      if (!this.dialog.open) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.goToRelativeItem(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.goToRelativeItem(1);
      } else if (event.key === '+' || event.key === '=' || event.key === 'NumpadAdd') {
        event.preventDefault();
        this.changeZoom(ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_' || event.key === 'NumpadSubtract') {
        event.preventDefault();
        this.changeZoom(-ZOOM_STEP);
      } else if (event.key === '0' || event.key === 'Numpad0') {
        event.preventDefault();
        this.resetZoom();
      }
    }

    handleWheel(event) {
      if (!this.dialog.open) return;
      event.preventDefault();
      this.changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }

    handlePointerDown(event) {
      if (this.zoom <= MIN_ZOOM || event.button > 0) return;

      this.dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: this.panX,
        panY: this.panY,
      };
      this.viewport?.classList.add('is-dragging');
      this.viewport?.setPointerCapture?.(event.pointerId);
    }

    handlePointerMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId || !this.viewport) return;

      const nextX = this.dragState.panX + event.clientX - this.dragState.startX;
      const nextY = this.dragState.panY + event.clientY - this.dragState.startY;
      const maxX = Math.max(0, (this.viewport.clientWidth * (this.zoom - 1)) / 2);
      const maxY = Math.max(0, (this.viewport.clientHeight * (this.zoom - 1)) / 2);

      this.panX = this.clamp(nextX, -maxX, maxX);
      this.panY = this.clamp(nextY, -maxY, maxY);
      this.updateZoomState();
    }

    handlePointerUp(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
      this.viewport?.releasePointerCapture?.(event.pointerId);
      this.viewport?.classList.remove('is-dragging');
      this.dragState = null;
    }

    changeZoom(delta) {
      this.setZoom(this.zoom + delta);
    }

    setZoom(value) {
      const nextZoom = this.clamp(Math.round(value * 10) / 10, MIN_ZOOM, MAX_ZOOM);
      this.zoom = nextZoom;
      if (this.zoom === MIN_ZOOM) {
        this.panX = 0;
        this.panY = 0;
      }
      this.updateZoomState();
    }

    resetZoom() {
      this.zoom = MIN_ZOOM;
      this.panX = 0;
      this.panY = 0;
      this.dragState = null;
      this.viewport?.classList.remove('is-dragging');
      this.updateZoomState();
    }

    updateZoomState() {
      this.viewport?.style.setProperty('--sample-zoom-scale', String(this.zoom));
      this.viewport?.style.setProperty('--sample-pan-x', `${this.panX}px`);
      this.viewport?.style.setProperty('--sample-pan-y', `${this.panY}px`);
      this.viewport?.setAttribute('data-zoomed', String(this.zoom > MIN_ZOOM));

      if (this.zoomOutButton) this.zoomOutButton.disabled = this.zoom <= MIN_ZOOM;
      if (this.zoomInButton) this.zoomInButton.disabled = this.zoom >= MAX_ZOOM;
      if (this.zoomResetButton) this.zoomResetButton.disabled = this.zoom <= MIN_ZOOM;
    }

    close() {
      if (!this.dialog) return;

      if (typeof this.dialog.close === 'function' && this.dialog.open) {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
        this.handleDialogClose();
      }
    }

    handleDialogClose() {
      this.resetZoom();
      this.dialogImage?.removeAttribute('src');
      this.dialogImage?.removeAttribute('srcset');

      if (this.lastFocusedElement?.isConnected) {
        this.lastFocusedElement.focus();
      }
      this.lastFocusedElement = null;
    }

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
  }

  function initialize(scope = document) {
    const roots = scope instanceof Element && scope.matches(SELECTOR)
      ? [scope]
      : Array.from(scope.querySelectorAll?.(SELECTOR) || []);

    roots.forEach((root) => {
      if (root.dataset.sampleGalleryReady === 'true') return;
      new ProductSamplesGallery(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }

  document.addEventListener('shopify:section:load', (event) => initialize(event.target));
})();
