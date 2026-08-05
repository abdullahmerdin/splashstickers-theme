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
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion = this.motionQuery.matches;
    this.isTouchDevice = window.matchMedia('(max-width: 749px)').matches
      && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleMotionPreferenceChange = this.handleMotionPreferenceChange.bind(this);
    this.clear = this.clear.bind(this);
    this.scrollToNextSection = this.scrollToNextSection.bind(this);
    this.toggleExpanded = this.toggleExpanded.bind(this);
    this.updateExpandedHeight = this.updateExpandedHeight.bind(this);

    // Touch drawing needs to own the gesture, but desktop drawing must not
    // turn the hero into a wheel-scroll trap. Keep the browser's normal page
    // scrolling behaviour for mouse/trackpad users.
    this.style.touchAction = this.isTouchDevice ? 'pan-y' : 'auto';
    this.style.overscrollBehavior = 'auto';
    this.addEventListener('pointermove', this.handlePointerMove);
    this.addEventListener('pointerdown', this.handlePointerDown);
    this.addEventListener('pointerup', this.handlePointerEnd);
    this.addEventListener('pointercancel', this.handlePointerEnd);
    this.addEventListener('pointerleave', this.handlePointerLeave);
    this.addEventListener('touchmove', this.handleTouchMove, { passive: false, capture: true });
    this.addEventListener('keydown', this.handleKeyDown);
    this.motionQuery.addEventListener?.('change', this.handleMotionPreferenceChange);
    this.motionQuery.addListener?.(this.handleMotionPreferenceChange);
    this.querySelector('[data-ink-clear]')?.addEventListener('click', this.clear);
    this.querySelector('[data-ink-expand]')?.addEventListener('click', this.toggleExpanded);
    this.querySelector('[data-ink-scroll]')?.addEventListener('click', this.scrollToNextSection);
    window.addEventListener('resize', this.updateExpandedHeight);
    window.visualViewport?.addEventListener('resize', this.updateExpandedHeight);

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
    this.removeEventListener('keydown', this.handleKeyDown);
    this.motionQuery?.removeEventListener?.('change', this.handleMotionPreferenceChange);
    this.motionQuery?.removeListener?.(this.handleMotionPreferenceChange);
    this.querySelector('[data-ink-clear]')?.removeEventListener('click', this.clear);
    this.querySelector('[data-ink-expand]')?.removeEventListener('click', this.toggleExpanded);
    this.querySelector('[data-ink-scroll]')?.removeEventListener('click', this.scrollToNextSection);
    window.removeEventListener('resize', this.updateExpandedHeight);
    window.visualViewport?.removeEventListener('resize', this.updateExpandedHeight);
    this.heightAnimation?.cancel();
    this.heightAnimation = null;
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

  handleMotionPreferenceChange(event) {
    const reduceMotion = Boolean(event?.matches ?? this.motionQuery?.matches);
    if (this.reduceMotion === reduceMotion) return;

    this.reduceMotion = reduceMotion;
    if (reduceMotion) {
      if (this.effectsFrame) cancelAnimationFrame(this.effectsFrame);
      this.effectsFrame = null;
      this.droplets = [];
      this.renderEffectsLayer();
    }
  }

  handleKeyDown(event) {
    if (event.key !== 'Escape' || !this.hasAttribute('data-expanded')) return;

    event.preventDefault();
    this.toggleExpanded(event);
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
    if (event.button !== undefined && event.button !== 0) return;

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
    if (this.effectsFrame) cancelAnimationFrame(this.effectsFrame);
    this.effectsFrame = null;
    this.clearContext(this.context, this.canvas);
    this.clearContext(this.effectsContext, this.effectsCanvas);
  }

  scrollToNextSection(event) {
    event?.stopPropagation();
    const section = this.closest('.shopify-section') || this;
    const nextSection = section.nextElementSibling;
    if (!nextSection) return;

    const headerHeight = document.querySelector('#header-group')?.getBoundingClientRect().height || 0;
    const targetTop = nextSection.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: this.reduceMotion ? 'auto' : 'smooth',
    });
  }

  toggleExpanded(event) {
    event?.stopPropagation();
    this.heightAnimation?.cancel();
    this.heightAnimation = null;
    const currentHeight = Math.max(1, Math.round(this.getBoundingClientRect().height));

    // Keep a pixel height underneath the animation so the expanded CSS rule
    // cannot make either direction jump straight to its final size.
    this.style.height = `${currentHeight}px`;
    this.style.minHeight = `${currentHeight}px`;
    this.style.maxHeight = `${currentHeight}px`;

    const expanded = this.toggleAttribute('data-expanded');
    let targetHeight;
    if (expanded) {
      targetHeight = this.getAvailableExpandedHeight();
    } else {
      // Measure the normal section height while the expanded attribute is
      // off, then restore the current pixel height for the transition start.
      this.style.height = 'auto';
      this.style.removeProperty('min-height');
      this.style.removeProperty('max-height');
      targetHeight = Math.max(1, Math.round(this.getBoundingClientRect().height));
      this.style.height = `${currentHeight}px`;
      this.style.minHeight = `${currentHeight}px`;
      this.style.maxHeight = `${currentHeight}px`;
    }

    // Let the animation own the height, without the expanded min-height
    // constraining an in-between frame.
    this.style.minHeight = '0px';
    this.style.maxHeight = 'none';

    const settle = () => {
      if (expanded) {
        this.updateExpandedHeight();
      } else {
        this.style.removeProperty('height');
        this.style.removeProperty('min-height');
        this.style.removeProperty('max-height');
      }
    };

    if (this.reduceMotion || Math.abs(targetHeight - currentHeight) < 1 || !this.animate) {
      this.style.height = `${targetHeight}px`;
      settle();
    } else {
      const animation = this.animate(
        [{ height: `${currentHeight}px` }, { height: `${targetHeight}px` }],
        {
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        }
      );
      this.heightAnimation = animation;
      animation.onfinish = () => {
        if (this.heightAnimation !== animation) return;
        this.heightAnimation = null;
        settle();
        animation.cancel();
      };
      animation.oncancel = () => {
        if (this.heightAnimation === animation) this.heightAnimation = null;
      };
    }

    const button = this.querySelector('[data-ink-expand]');
    if (button) {
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', expanded ? 'Collapse drawing area' : 'Expand drawing area');
      button.title = expanded ? 'Collapse drawing area' : 'Expand drawing area';
    }
  }

  getAvailableExpandedHeight() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const top = Math.max(0, this.getBoundingClientRect().top);
    return Math.max(1, Math.round(viewportHeight - top));
  }

  updateExpandedHeight() {
    if (!this.hasAttribute('data-expanded')) return;
    if (this.heightAnimation) return;

    const availableHeight = this.getAvailableExpandedHeight();
    this.style.height = `${availableHeight}px`;
    this.style.minHeight = `${availableHeight}px`;
    this.style.maxHeight = `${availableHeight}px`;
  }

}

if (!customElements.get('splash-ink-hero')) {
  customElements.define('splash-ink-hero', SplashInkHero);
}
