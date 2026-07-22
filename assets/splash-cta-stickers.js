const clampCtaSticker = (value, min, max) => Math.min(Math.max(value, min), max);

class SplashCtaStickers extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;

    this.initialized = true;
    this.section = this.closest('.splash-cta-section') || this;
    this.canvas = this.querySelector('[data-sticker-ropes]');
    this.context = this.canvas?.getContext('2d');
    this.anchor = this.section.querySelector('h2');
    this.items = Array.from(this.querySelectorAll('[data-sticker]')).map((element) => ({
      element,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      xRatio: Number(element.dataset.x) || 0,
      yRatio: Number(element.dataset.y) || 0,
    }));
    this.activeItem = null;
    this.width = 0;
    this.height = 0;
    this.devicePixelRatio = 1;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.render = this.render.bind(this);

    this.items.forEach((item) => {
      item.element.addEventListener('pointerdown', (event) => this.handlePointerDown(event, item));
    });
    document.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    document.addEventListener('pointerup', this.handlePointerUp);
    document.addEventListener('pointercancel', this.handlePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.section);
    this.resize();

    if (this.reduceMotion) {
      this.render();
    } else {
      this.animationFrame = requestAnimationFrame(this.render);
    }
  }

  disconnectedCallback() {
    if (!this.initialized) return;

    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointercancel', this.handlePointerUp);
    this.resizeObserver?.disconnect();
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.initialized = false;
  }

  resize() {
    if (!this.context || !this.canvas) return;

    const bounds = this.section.getBoundingClientRect();
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    this.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.devicePixelRatio);
    this.canvas.height = Math.round(this.height * this.devicePixelRatio);
    this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);

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

  handlePointerDown(event, item) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const bounds = item.element.getBoundingClientRect();
    this.activeItem = {
      item,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    item.element.setPointerCapture?.(event.pointerId);
    item.element.classList.add('is-dragging');
    event.preventDefault();
  }

  handlePointerMove(event) {
    if (!this.activeItem || event.pointerId !== this.activeItem.pointerId) return;

    const bounds = this.section.getBoundingClientRect();
    const { item, offsetX, offsetY } = this.activeItem;
    item.x = clampCtaSticker(
      event.clientX - bounds.left - offsetX,
      8,
      Math.max(8, this.width - item.width - 8)
    );
    item.y = clampCtaSticker(
      event.clientY - bounds.top - offsetY,
      8,
      Math.max(8, this.height - item.height - 8)
    );
    item.xRatio = item.x / this.width;
    item.yRatio = item.y / this.height;
    this.applyPosition(item);
    event.preventDefault();
  }

  handlePointerUp(event) {
    if (!this.activeItem || event.pointerId !== this.activeItem.pointerId) return;

    this.activeItem.item.element.classList.remove('is-dragging');
    this.activeItem = null;
  }

  getAnchorPoint() {
    const sectionBounds = this.section.getBoundingClientRect();
    const anchorBounds = this.anchor?.getBoundingClientRect();
    if (!anchorBounds) {
      return { x: this.width / 2, y: this.height / 2 };
    }

    return {
      x: anchorBounds.left - sectionBounds.left + anchorBounds.width / 2,
      y: anchorBounds.top - sectionBounds.top + anchorBounds.height / 2,
    };
  }

  getStickerCenter(item) {
    return {
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
    };
  }

  drawRope(from, to, phase) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const normalX = distance ? -dy / distance : 0;
    const normalY = distance ? dx / distance : 1;
    const sag = Math.min(48, 10 + distance * 0.12) + Math.sin(performance.now() / 950 + phase) * 4;
    const controlX = (from.x + to.x) / 2 + normalX * sag;
    const controlY = (from.y + to.y) / 2 + normalY * sag;

    this.context.beginPath();
    this.context.moveTo(from.x, from.y);
    this.context.quadraticCurveTo(controlX, controlY, to.x, to.y);
    this.context.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    this.context.lineWidth = 2.5;
    this.context.stroke();
    this.context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    this.context.lineWidth = 1;
    this.context.stroke();
  }

  render() {
    if (!this.context) return;

    this.context.clearRect(0, 0, this.width, this.height);
    const anchor = this.getAnchorPoint();
    const centers = this.items.map((item) => this.getStickerCenter(item));

    centers.forEach((center, index) => this.drawRope(anchor, center, index));
    for (let index = 0; index < centers.length - 1; index += 1) {
      this.drawRope(centers[index], centers[index + 1], index + 3);
    }

    if (!this.reduceMotion) {
      this.animationFrame = requestAnimationFrame(this.render);
    }
  }
}

if (!customElements.get('splash-cta-stickers')) {
  customElements.define('splash-cta-stickers', SplashCtaStickers);
}
