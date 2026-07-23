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
    this.effectsCanvas = this.querySelector('[data-ink-effects]');
    this.querySelector('.splash-hero-subtext')?.remove();
    this.context = this.canvas?.getContext('2d');
    this.effectsContext = this.effectsCanvas?.getContext('2d');
    if (!this.context || !this.effectsContext) return;

    this.initialized = true;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.paletteIndex = -1;
    this.stroke = null;
    this.droplets = [];
    this.activePointer = null;
    this.effectsFrame = null;
    this.lastEffectsTime = 0;
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
    if (this.effectsFrame) cancelAnimationFrame(this.effectsFrame);
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

    for (const layer of [this.canvas, this.effectsCanvas]) {
      layer.width = Math.round(width * dpr);
      layer.height = Math.round(height * dpr);
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.effectsContext.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (previousWidth && previousHeight) {
      const scaleX = width / previousWidth;
      const scaleY = height / previousHeight;
      if (this.stroke) {
        for (const point of this.stroke.points) {
          point.x *= scaleX;
          point.y *= scaleY;
        }
        this.stroke.last = this.stroke.points[this.stroke.points.length - 1];
      }
      for (const droplet of this.droplets) {
        droplet.x *= scaleX;
        droplet.y *= scaleY;
      }
    }

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
    this.renderEffectsLayer();
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
    event.preventDefault();
    this.activePointer = event.pointerId;
    this.beginStroke(this.pointFromEvent(event));
    if (event.pointerType !== 'mouse') this.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    if (this.isInteractiveTarget(event.target)) {
      this.endStroke();
      return;
    }
    // Desktop drawing is press-and-drag. Without this guard, every ordinary
    // mouse move after a completed stroke would silently start another one.
    if (this.activePointer !== event.pointerId) return;
    event.preventDefault();

    const events = event.getCoalescedEvents?.() || [event];
    for (const sample of events) {
      const point = this.pointFromEvent(sample);
      if (!this.stroke) this.beginStroke(point);
      else this.extendStroke(point);
    }
    this.renderEffectsLayer();
  }

  handlePointerEnd(event) {
    if (this.activePointer !== event.pointerId) return;
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
    if (event.pointerType === 'mouse' && this.activePointer === event.pointerId) {
      this.endStroke();
      this.activePointer = null;
    }
  }

  beginStroke(point) {
    this.showScrollButton();
    this.paletteIndex = (this.paletteIndex + 1) % INK_PALETTE.length;
    const palette = INK_PALETTE[this.paletteIndex];
    this.stroke = {
      palette,
      nextPalette: INK_PALETTE[(this.paletteIndex + 1) % INK_PALETTE.length],
      points: [point],
      last: point,
      size: 32,
      velocity: 0,
    };
    this.renderEffectsLayer();
  }

  extendStroke(point) {
    const stroke = this.stroke;
    const dx = point.x - stroke.last.x;
    const dy = point.y - stroke.last.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.8) return;

    const elapsed = Math.max(8, point.time - stroke.last.time);
    const velocity = distance / elapsed;
    const targetSize = clamp(38 - velocity * 12, 20, 38);
    stroke.size = lerp(stroke.size, targetSize, 0.12);
    stroke.velocity = lerp(stroke.velocity, velocity, 0.35);
    stroke.points.push(point);

    if (stroke.velocity > 0.72 && Math.random() < Math.min(0.28, stroke.velocity * 0.1)) {
      this.spawnDroplets(point, dx / distance, dy / distance, stroke.velocity, false, stroke.palette);
    }

    stroke.last = point;
  }

  traceStrokePath(context, points) {
    const first = points[0];
    context.beginPath();
    context.moveTo(first.x, first.y);

    if (points.length === 1) {
      context.lineTo(first.x + 0.01, first.y + 0.01);
      return;
    }

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const midpointX = (previous.x + point.x) / 2;
      const midpointY = (previous.y + point.y) / 2;
      context.quadraticCurveTo(previous.x, previous.y, midpointX, midpointY);
    }

    const last = points[points.length - 1];
    context.quadraticCurveTo(last.x, last.y, last.x, last.y);
  }

  createStrokeGradient(context, stroke, tone) {
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    const endX = first.x === last.x && first.y === last.y ? last.x + 1 : last.x;
    const gradient = context.createLinearGradient(first.x, first.y, endX, last.y);
    gradient.addColorStop(0, stroke.palette[tone]);
    gradient.addColorStop(1, stroke.nextPalette[tone]);
    return gradient;
  }

  renderInkStroke(context, stroke) {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // Every pass traces the complete curve once. This keeps the glossy ink
    // treatment without stacking a round cap at every pointer sample.
    this.traceStrokePath(context, stroke.points);
    context.globalAlpha = 0.14;
    context.strokeStyle = this.createStrokeGradient(context, stroke, 'base');
    context.lineWidth = stroke.size * 1.62;
    context.shadowColor = stroke.palette.base;
    context.shadowBlur = stroke.size * 0.48;
    context.stroke();

    this.traceStrokePath(context, stroke.points);
    context.globalAlpha = 0.94;
    context.strokeStyle = this.createStrokeGradient(context, stroke, 'base');
    context.lineWidth = stroke.size;
    context.shadowColor = stroke.palette.deep;
    context.shadowBlur = stroke.size * 0.16;
    context.stroke();

    this.traceStrokePath(context, stroke.points);
    context.globalAlpha = 0.2;
    context.strokeStyle = this.createStrokeGradient(context, stroke, 'deep');
    context.lineWidth = stroke.size * 0.66;
    context.shadowBlur = 0;
    context.stroke();

    this.traceStrokePath(context, stroke.points);
    context.globalAlpha = 0.2;
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(1.5, stroke.size * 0.1);
    context.stroke();
    context.restore();
  }

  endStroke() {
    if (!this.stroke) return;

    const completedStroke = this.stroke;
    this.renderInkStroke(this.context, completedStroke);
    this.spawnDroplets(
      completedStroke.last,
      0,
      0,
      Math.max(completedStroke.velocity, 0.45),
      true,
      completedStroke.nextPalette
    );
    this.stroke = null;
    this.renderEffectsLayer();
  }

  spawnDroplets(point, directionX, directionY, velocity, burst, palette) {
    const count = burst ? 5 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2);

    for (let index = 0; index < count; index += 1) {
      const angle = Math.atan2(directionY, directionX) + (Math.random() - 0.5) * (burst ? Math.PI * 2 : 1.1);
      const impulse = (burst ? 1.5 : 3) + Math.random() * (4.5 + velocity * 4);
      const droplet = {
        x: point.x,
        y: point.y,
        vx: Math.cos(angle) * impulse + (burst ? (Math.random() - 0.5) * 2.5 : 0),
        vy: Math.sin(angle) * impulse - Math.random() * (burst ? 3.5 : 1.8),
        radius: 1.4 + Math.random() * (burst ? 3.6 : 2.2),
        palette,
        life: 380 + Math.random() * 360,
        maxLife: 0,
      };
      droplet.maxLife = droplet.life;

      if (this.reduceMotion) {
        droplet.x += droplet.vx * 3;
        droplet.y += droplet.vy * 3;
        this.drawDroplet(this.context, droplet, 0.5);
      } else {
        this.droplets.push(droplet);
      }
    }

    if (!this.reduceMotion && this.droplets.length && !this.effectsFrame) {
      this.lastEffectsTime = performance.now();
      this.effectsFrame = requestAnimationFrame((time) => this.animateDroplets(time));
    }
  }

  drawDroplet(context, droplet, alpha) {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = droplet.palette.base;
    context.shadowColor = droplet.palette.deep;
    context.shadowBlur = droplet.radius * 1.6;
    context.beginPath();
    context.ellipse(
      droplet.x,
      droplet.y,
      droplet.radius,
      droplet.radius * (1 + Math.min(Math.abs(droplet.vy) * 0.07, 0.7)),
      Math.atan2(droplet.vy, droplet.vx),
      0,
      Math.PI * 2
    );
    context.fill();
    context.restore();
  }

  renderEffectsLayer() {
    if (!this.effectsContext) return;
    this.clearContext(this.effectsContext, this.effectsCanvas);
    if (this.stroke) this.renderInkStroke(this.effectsContext, this.stroke);

    for (const droplet of this.droplets) {
      const alpha = Math.min(0.78, droplet.life / droplet.maxLife + 0.15);
      this.drawDroplet(this.effectsContext, droplet, alpha);
    }
  }

  animateDroplets(time) {
    const elapsed = clamp(time - this.lastEffectsTime, 8, 32);
    const scale = elapsed / 16.67;
    this.lastEffectsTime = time;

    const remaining = [];
    for (const droplet of this.droplets) {
      droplet.x += droplet.vx * scale;
      droplet.y += droplet.vy * scale;
      droplet.vx *= Math.pow(0.985, scale);
      droplet.vy = droplet.vy * Math.pow(0.985, scale) + 0.16 * scale;
      droplet.life -= elapsed;

      const inside = droplet.x >= 0 && droplet.x <= this.width && droplet.y >= 0 && droplet.y <= this.height;
      if (droplet.life <= 0 || !inside) {
        if (inside) this.drawDroplet(this.context, droplet, 0.48);
        continue;
      }
      remaining.push(droplet);
    }

    this.droplets = remaining;
    this.renderEffectsLayer();
    if (remaining.length) {
      this.effectsFrame = requestAnimationFrame((nextTime) => this.animateDroplets(nextTime));
    } else {
      this.effectsFrame = null;
    }
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
    this.droplets = [];
    this.showTouchHint();
    if (this.effectsFrame) cancelAnimationFrame(this.effectsFrame);
    this.effectsFrame = null;
    this.clearContext(this.context, this.canvas);
    this.clearContext(this.effectsContext, this.effectsCanvas);
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
    const hintAnchor = this.querySelector('.splash-hero-heading');
    hint.classList.add('splash-ink-touch-hint');
    hint.setAttribute('role', 'status');
    if (!hasMarkupHint) {
      hint.innerHTML = '<span class="splash-ink-touch-visual" aria-hidden="true"><span class="splash-ink-touch-ring"></span><span class="splash-ink-touch-finger"><svg viewBox="0 0 80 64" aria-hidden="true" focusable="false"><path d="M30 54V18a5 5 0 0 1 10 0v15V10a5 5 0 0 1 10 0v23V16a5 5 0 0 1 10 0v20V22a5 5 0 0 1 10 0v20c0 11-9 18-20 18H41c-6 0-11-3-15-9l-6-9a5 5 0 0 1 8-6l2 3Z"/><path class="splash-ink-touch-arrow" d="M9 28h16m0 0-6-6m6 6-6 6"/></svg></span></span><span>Swipe to draw</span>';
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
      filter: 'drop-shadow(0 2px 3px rgba(31, 41, 55, 0.18))',
      animation: this.reduceMotion ? 'none' : 'splash-ink-touch-swipe 1.8s ease-in-out infinite',
    });

    const fingerSvg = finger.querySelector('svg');
    if (fingerSvg) {
      Object.assign(fingerSvg.style, {
        display: 'block',
        width: '58px',
        height: '58px',
        overflow: 'visible',
      });
      fingerSvg.setAttribute('fill', 'none');
      fingerSvg.setAttribute('stroke', 'currentColor');
      fingerSvg.setAttribute('stroke-width', '2.8');
      fingerSvg.setAttribute('stroke-linecap', 'round');
      fingerSvg.setAttribute('stroke-linejoin', 'round');
      const hand = fingerSvg.querySelector('path:not(.splash-ink-touch-arrow)');
      if (hand) {
        hand.setAttribute('fill', 'rgba(108, 92, 231, 0.14)');
        hand.setAttribute('stroke', 'currentColor');
      }
      const arrow = fingerSvg.querySelector('.splash-ink-touch-arrow');
      if (arrow) arrow.setAttribute('stroke', '#6c5ce7');
    }

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
