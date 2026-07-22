const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (from, to, amount) => from + (to - from) * amount;

const INK_PALETTE = [
  { base: '#ff4381', deep: '#b81557' },
  { base: '#ff6b35', deep: '#b93812' },
  { base: '#00d9a3', deep: '#007f67' },
  { base: '#4d7cff', deep: '#2542a8' },
  { base: '#a855f7', deep: '#6520a8' },
  { base: '#ffd21f', deep: '#b98200' },
];

class SplashInkHero extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;

    this.canvas = this.querySelector('[data-ink-canvas]');
    this.context = this.canvas?.getContext('2d');
    if (!this.context) return;

    this.initialized = true;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.paletteIndex = -1;
    this.stroke = null;
    this.activePointer = null;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isTouchDevice = window.matchMedia('(max-width: 749px)').matches
      && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.clear = this.clear.bind(this);
    this.scrollToContent = this.scrollToContent.bind(this);
    this.toggleExpanded = this.toggleExpanded.bind(this);

    // This surface is a drawing area, so it must own a touch sequence from
    // its first frame. Keeping this inline also protects older published
    // section markup whose stylesheet still allows vertical panning.
    this.style.touchAction = 'none';
    this.style.overscrollBehavior = 'none';
    this.addEventListener('pointermove', this.handlePointerMove);
    this.addEventListener('pointerdown', this.handlePointerDown);
    this.addEventListener('pointerup', this.handlePointerEnd);
    this.addEventListener('pointercancel', this.handlePointerEnd);
    this.addEventListener('pointerleave', this.handlePointerLeave);
    this.addEventListener('touchmove', this.handleTouchMove, { passive: false, capture: true });
    this.querySelector('[data-ink-clear]')?.addEventListener('click', this.clear);
    this.querySelector('[data-ink-expand]')?.addEventListener('click', this.toggleExpanded);
    this.createScrollButton();
    this.createTouchHint();
    this.showTouchHint();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this);
    requestAnimationFrame(() => this.resize());
  }

  disconnectedCallback() {
    if (!this.initialized) return;

    this.removeEventListener('pointermove', this.handlePointerMove);
    this.removeEventListener('pointerdown', this.handlePointerDown);
    this.removeEventListener('pointerup', this.handlePointerEnd);
    this.removeEventListener('pointercancel', this.handlePointerEnd);
    this.removeEventListener('pointerleave', this.handlePointerLeave);
    this.removeEventListener('touchmove', this.handleTouchMove, { capture: true });
    this.querySelector('[data-ink-clear]')?.removeEventListener('click', this.clear);
    this.querySelector('[data-ink-expand]')?.removeEventListener('click', this.toggleExpanded);
    this.scrollButton?.removeEventListener('click', this.scrollToContent);
    this.scrollButton?.remove();
    this.scrollButton = null;
    this.touchHint?.remove();
    this.touchHint = null;
    this.touchHintStyle?.remove();
    this.touchHintStyle = null;
    this.resizeObserver?.disconnect();
    this.initialized = false;
  }

  resize() {
    const bounds = this.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.width && height === this.height && dpr === this.dpr) return;

    const previousWidth = this.width;
    const previousHeight = this.height;
    const snapshot = document.createElement('canvas');
    snapshot.width = this.canvas.width;
    snapshot.height = this.canvas.height;
    if (snapshot.width && snapshot.height) {
      snapshot.getContext('2d').drawImage(this.canvas, 0, 0);
    }

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (snapshot.width && snapshot.height) {
      const scale = width / Math.max(previousWidth, 1);
      this.context.drawImage(
        snapshot,
        0,
        0,
        snapshot.width,
        snapshot.height,
        0,
        0,
        width,
        previousHeight * scale
      );
    }
  }

  isInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest('a, button'));
  }

  pointFromEvent(event) {
    const bounds = this.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
      time: event.timeStamp || performance.now(),
    };
  }

  handlePointerDown(event) {
    if (this.isInteractiveTarget(event.target)) return;

    this.hideTouchHint();
    if (event.pointerType !== 'mouse') event.preventDefault();
    this.activePointer = event.pointerId;
    this.beginStroke(this.pointFromEvent(event));
    if (event.pointerType !== 'mouse') this.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    if (this.isInteractiveTarget(event.target)) {
      this.endStroke();
      return;
    }
    if (event.pointerType !== 'mouse' && this.activePointer !== event.pointerId) return;
    if (event.pointerType !== 'mouse') event.preventDefault();

    const events = event.getCoalescedEvents?.() || [event];
    for (const sample of events) {
      const point = this.pointFromEvent(sample);
      if (!this.stroke) this.beginStroke(point);
      else this.extendStroke(point);
    }
  }

  handlePointerEnd(event) {
    if (event.pointerType !== 'mouse' && this.activePointer !== event.pointerId) return;
    if (event.pointerType !== 'mouse') event.preventDefault();
    if (this.hasPointerCapture?.(event.pointerId)) this.releasePointerCapture(event.pointerId);
    this.activePointer = null;
    this.endStroke();
  }

  handleTouchMove(event) {
    if (this.activePointer !== null && event.touches.length === 1) {
      event.preventDefault();
    }
  }

  handlePointerLeave(event) {
    if (event.pointerType === 'mouse') this.endStroke();
  }

  beginStroke(point) {
    this.showScrollButton();
    this.paletteIndex = (this.paletteIndex + 1) % INK_PALETTE.length;
    const palette = INK_PALETTE[this.paletteIndex];
    this.stroke = {
      palette,
      last: point,
      midpoint: point,
      size: 28,
      velocity: 0,
    };
    this.drawNib(point.x, point.y, this.stroke.size, palette);
  }

  extendStroke(point) {
    const stroke = this.stroke;
    const dx = point.x - stroke.last.x;
    const dy = point.y - stroke.last.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.8) return;

    const elapsed = Math.max(8, point.time - stroke.last.time);
    const velocity = distance / elapsed;
    // A felt-tip nib changes width gradually. Large per-sample changes read as
    // overlapping circles, especially on high-frequency touch screens.
    const targetSize = clamp(33 - velocity * 8, 22, 33);
    stroke.size = lerp(stroke.size, targetSize, 0.16);
    stroke.velocity = lerp(stroke.velocity, velocity, 0.35);

    const midpoint = {
      x: (stroke.last.x + point.x) / 2,
      y: (stroke.last.y + point.y) / 2,
    };
    const path = () => {
      this.context.beginPath();
      this.context.moveTo(stroke.midpoint.x, stroke.midpoint.y);
      this.context.quadraticCurveTo(stroke.last.x, stroke.last.y, midpoint.x, midpoint.y);
    };

    this.drawMarkerPath(path, stroke.size, stroke.palette);

    stroke.last = point;
    stroke.midpoint = midpoint;
  }

  drawMarkerPath(makePath, size, palette) {
    const context = this.context;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // The dark edge and opaque core form one coherent marker stroke. Avoiding
    // translucent halos on every sample removes the bead/stamp appearance.
    makePath();
    context.globalAlpha = 1;
    context.strokeStyle = palette.deep;
    context.lineWidth = size + 2;
    context.stroke();

    makePath();
    context.globalAlpha = 1;
    context.strokeStyle = palette.base;
    context.lineWidth = size;
    context.stroke();
    context.restore();
  }

  drawNib(x, y, size, palette) {
    const context = this.context;
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = palette.deep;
    context.beginPath();
    context.arc(x, y, size / 2 + 1, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = palette.base;
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  endStroke() {
    if (!this.stroke) return;

    this.stroke = null;
  }

  clearContext(context, canvas) {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  clear(event) {
    event?.stopPropagation();
    this.stroke = null;
    this.showTouchHint();
    this.clearContext(this.context, this.canvas);
  }

  toggleExpanded(event) {
    event?.stopPropagation();
    const expanded = this.toggleAttribute('data-expanded');
    const originalHeight = Number(this.dataset.originalHeight) || 550;
    this.style.minHeight = `${expanded ? window.innerHeight : originalHeight}px`;

    const button = this.querySelector('[data-ink-expand]');
    if (button) {
      button.setAttribute('aria-pressed', String(expanded));
      button.setAttribute('aria-label', expanded ? 'Collapse drawing area' : 'Expand drawing area');
      button.title = expanded ? 'Collapse drawing area' : 'Expand drawing area';
    }
  }

  createScrollButton() {
    if (!this.isTouchDevice || this.scrollButton) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'splash-hero-scroll-down';
    button.setAttribute('aria-label', 'Scroll to content below');
    button.title = 'Scroll to content below';
    button.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7" /></svg>';
    Object.assign(button.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: '30',
      display: 'none',
      width: '44px',
      height: '44px',
      padding: '0',
      placeItems: 'center',
      border: '1px solid rgba(255, 255, 255, 0.45)',
      borderRadius: '50%',
      color: '#ffffff',
      background: 'rgba(31, 41, 55, 0.42)',
      cursor: 'pointer',
      touchAction: 'manipulation',
      backdropFilter: 'blur(8px)',
    });
    button.addEventListener('click', this.scrollToContent);
    this.append(button);
    this.scrollButton = button;
  }

  createTouchHint() {
    if (!this.isTouchDevice || this.touchHint) return;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes splash-ink-touch-swipe {
        0%, 100% { transform: translateX(-10px) scale(0.94); }
        50% { transform: translateX(10px) scale(1); }
      }
      @keyframes splash-ink-touch-ring {
        0% { opacity: 0.65; transform: scale(0.55); }
        70%, 100% { opacity: 0; transform: scale(1.3); }
      }
    `;
    this.append(style);

    const hint = this.querySelector('[data-ink-touch-hint]') || document.createElement('div');
    const hasMarkupHint = hint.hasAttribute('data-ink-touch-hint');
    const hintAnchor = this.querySelector('.splash-hero-subtext') || this.querySelector('.splash-hero-heading');
    hint.classList.add('splash-ink-touch-hint');
    hint.setAttribute('role', 'status');
    if (!hasMarkupHint) {
      hint.innerHTML = '<span class="splash-ink-touch-visual" aria-hidden="true"><span class="splash-ink-touch-ring"></span><span class="splash-ink-touch-finger">→</span></span><span>Swipe to draw</span>';
    }
    Object.assign(hint.style, {
      zIndex: '10',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      color: 'rgba(31, 41, 55, 0.72)',
      fontSize: '0.9rem',
      fontWeight: '650',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    });
    if (!hasMarkupHint) {
      if (hintAnchor) {
        Object.assign(hint.style, {
          position: 'relative',
          margin: '-4px auto 2px',
          minHeight: '76px',
        });
      } else {
        Object.assign(hint.style, {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        });
      }
    }

    const visual = hint.querySelector('.splash-ink-touch-visual');
    Object.assign(visual.style, {
      position: 'relative',
      display: 'grid',
      width: '58px',
      height: '58px',
      placeItems: 'center',
    });

    const ring = hint.querySelector('.splash-ink-touch-ring');
    Object.assign(ring.style, {
      position: 'absolute',
      inset: '4px',
      border: '2px solid rgba(108, 92, 231, 0.55)',
      borderRadius: '50%',
      animation: this.reduceMotion ? 'none' : 'splash-ink-touch-ring 1.8s ease-out infinite',
    });

    const finger = hint.querySelector('.splash-ink-touch-finger');
    finger.textContent = '\u2192';
    Object.assign(finger.style, {
      position: 'relative',
      zIndex: '1',
      fontSize: '2rem',
      lineHeight: '1',
      filter: 'drop-shadow(0 2px 3px rgba(31, 41, 55, 0.18))',
      animation: this.reduceMotion ? 'none' : 'splash-ink-touch-swipe 1.8s ease-in-out infinite',
    });

    if (hintAnchor?.parentNode) {
      if (hint !== hintAnchor.nextElementSibling) {
        hintAnchor.parentNode.insertBefore(hint, hintAnchor.nextSibling);
      }
    } else if (!hasMarkupHint) {
      this.append(hint);
    }
    this.touchHintStyle = style;
    this.touchHint = hint;
  }

  showTouchHint() {
    if (!this.touchHint) return;
    this.touchHint.style.display = 'flex';
  }

  hideTouchHint() {
    if (!this.touchHint) return;
    this.touchHint.style.display = 'none';
  }

  showScrollButton() {
    if (!this.scrollButton) return;
    this.scrollButton.style.display = 'grid';
  }

  hideScrollButton() {
    if (!this.scrollButton) return;
    this.scrollButton.style.display = 'none';
  }

  scrollToContent(event) {
    event.preventDefault();
    event.stopPropagation();
    const section = this.closest('.shopify-section') || this;
    const nextSection = section.nextElementSibling;
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
    }
  }
}

if (!customElements.get('splash-ink-hero')) {
  customElements.define('splash-ink-hero', SplashInkHero);
}
