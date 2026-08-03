const clampCtaSticker = (value, min, max) => Math.min(Math.max(value, min), max);

class SplashCtaStickers extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;

    this.initialized = true;
    this.section = this.closest('.splash-cta-section') || this;
    this.items = Array.from(this.querySelectorAll('[data-sticker]')).map((element) => ({
      element,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      xRatio: Number(element.dataset.x) || 0,
      yRatio: Number(element.dataset.y) || 0,
    }));
    this.width = 0;
    this.height = 0;
    this.activeDrag = null;
    this.dragFrame = null;

    this.resize = this.resize.bind(this);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.section);
    this.resize();

    this.items.forEach((item) => {
      item.element.addEventListener('pointerdown', (event) => this.startDrag(event, item));
      item.element.addEventListener('pointermove', (event) => this.moveDrag(event));
      item.element.addEventListener('pointerup', (event) => this.endDrag(event));
      item.element.addEventListener('pointercancel', (event) => this.endDrag(event));
    });
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    if (this.dragFrame) cancelAnimationFrame(this.dragFrame);
    this.dragFrame = null;
    this.activeDrag = null;
    this.initialized = false;
  }

  resize() {
    const bounds = this.section.getBoundingClientRect();
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);

    this.items.forEach((item) => {
      item.width = item.element.offsetWidth;
      item.height = item.element.offsetHeight;
      if (previousWidth && previousHeight) {
        item.xRatio = item.x / previousWidth;
        item.yRatio = item.y / previousHeight;
      }
      item.x = clampCtaSticker(item.xRatio * this.width, 8, Math.max(8, this.width - item.width - 8));
      item.y = clampCtaSticker(item.yRatio * this.height, 8, Math.max(8, this.height - item.height - 8));
      this.applyPosition(item);
    });
  }

  applyPosition(item) {
    item.element.style.left = `${item.x}px`;
    item.element.style.top = `${item.y}px`;
  }

  startDrag(event, item) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const bounds = item.element.getBoundingClientRect();
    this.activeDrag = {
      item,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      nextX: item.x,
      nextY: item.y,
    };
    item.element.setPointerCapture?.(event.pointerId);
    item.element.classList.add('is-dragging');
    event.preventDefault();
  }

  moveDrag(event) {
    const drag = this.activeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const bounds = this.section.getBoundingClientRect();
    drag.nextX = clampCtaSticker(
      event.clientX - bounds.left - drag.offsetX,
      8,
      Math.max(8, this.width - drag.item.width - 8)
    );
    drag.nextY = clampCtaSticker(
      event.clientY - bounds.top - drag.offsetY,
      8,
      Math.max(8, this.height - drag.item.height - 8)
    );

    if (!this.dragFrame) {
      this.dragFrame = requestAnimationFrame(() => {
        const pending = this.activeDrag;
        this.dragFrame = null;
        if (!pending) return;
        pending.item.x = pending.nextX;
        pending.item.y = pending.nextY;
        pending.item.xRatio = pending.item.x / this.width;
        pending.item.yRatio = pending.item.y / this.height;
        this.applyPosition(pending.item);
      });
    }
    event.preventDefault();
  }

  endDrag(event) {
    const drag = this.activeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (this.dragFrame) {
      cancelAnimationFrame(this.dragFrame);
      this.dragFrame = null;
      drag.item.x = drag.nextX;
      drag.item.y = drag.nextY;
      drag.item.xRatio = drag.item.x / this.width;
      drag.item.yRatio = drag.item.y / this.height;
      this.applyPosition(drag.item);
    }
    drag.item.element.classList.remove('is-dragging');
    this.activeDrag = null;
  }
}

if (!customElements.get('splash-cta-stickers')) {
  customElements.define('splash-cta-stickers', SplashCtaStickers);
}
