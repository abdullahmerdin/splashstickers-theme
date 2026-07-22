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
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.clear = this.clear.bind(this);
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
    this.paletteIndex = (this.paletteIndex + 1) % INK_PALETTE.length;
    const palette = INK_PALETTE[this.paletteIndex];
    this.stroke = {
      palette,
      last: point,
      midpoint: point,
      size: 32,
      velocity: 0,
      distance: 0,
      lastPoolTime: point.time,
    };
    this.drawPool(point.x, point.y, 12, palette, 0.72);
  }

  extendStroke(point) {
    const stroke = this.stroke;
    const dx = point.x - stroke.last.x;
    const dy = point.y - stroke.last.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.8) return;

    const elapsed = Math.max(8, point.time - stroke.last.time);
    const velocity = distance / elapsed;
    const targetSize = clamp(40 - velocity * 18, 10, 40);
    stroke.size = lerp(stroke.size, targetSize, 0.28);
    stroke.velocity = lerp(stroke.velocity, velocity, 0.35);
    stroke.distance += distance;

    const midpoint = {
      x: (stroke.last.x + point.x) / 2,
      y: (stroke.last.y + point.y) / 2,
    };
    const path = () => {
      this.context.beginPath();
      this.context.moveTo(stroke.midpoint.x, stroke.midpoint.y);
      this.context.quadraticCurveTo(stroke.last.x, stroke.last.y, midpoint.x, midpoint.y);
    };

    this.drawInkPath(path, stroke.size, stroke.palette);

    if (stroke.velocity < 0.32 && point.time - stroke.lastPoolTime > 95) {
      this.drawPool(point.x, point.y, stroke.size * 0.56, stroke.palette, 0.42);
      stroke.lastPoolTime = point.time;
    }

    if (stroke.velocity > 0.65 && Math.random() < Math.min(0.5, stroke.velocity * 0.18)) {
      this.spawnDroplets(point, dx / distance, dy / distance, stroke.velocity, false);
    }

    stroke.last = point;
    stroke.midpoint = midpoint;
  }

  drawInkPath(makePath, size, palette) {
    const context = this.context;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    makePath();
    context.globalAlpha = 0.11;
    context.strokeStyle = palette.base;
    context.lineWidth = size * 1.85;
    context.shadowColor = palette.base;
    context.shadowBlur = size * 0.75;
    context.stroke();

    makePath();
    context.globalAlpha = 0.92;
    context.strokeStyle = palette.base;
    context.lineWidth = size;
    context.shadowColor = palette.deep;
    context.shadowBlur = size * 0.22;
    context.stroke();

    makePath();
    context.globalAlpha = 0.22;
    context.strokeStyle = palette.deep;
    context.lineWidth = size * 0.68;
    context.shadowBlur = 0;
    context.stroke();

    makePath();
    context.globalAlpha = 0.22;
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(1.5, size * 0.12);
    context.stroke();
    context.restore();
  }

  drawPool(x, y, radius, palette, alpha = 0.65) {
    const context = this.context;
    const gradient = context.createRadialGradient(
      x - radius * 0.24,
      y - radius * 0.28,
      radius * 0.04,
      x,
      y,
      radius
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.08, palette.base);
    gradient.addColorStop(0.72, palette.base);
    gradient.addColorStop(1, palette.deep);

    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.shadowColor = palette.deep;
    context.shadowBlur = radius * 0.34;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.82, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  endStroke() {
    if (!this.stroke) return;

    const { last, palette, velocity } = this.stroke;
    this.drawPool(last.x, last.y, clamp(this.stroke.size * 0.38, 4, 13), palette, 0.58);
    this.spawnDroplets(last, 0, 0, Math.max(velocity, 0.45), true);
    this.stroke = null;
  }

  spawnDroplets(point, directionX, directionY, velocity, burst) {
    const palette = this.stroke?.palette || INK_PALETTE[this.paletteIndex] || INK_PALETTE[0];
    const count = burst ? 7 + Math.floor(Math.random() * 6) : 1 + Math.floor(Math.random() * 3);

    for (let index = 0; index < count; index += 1) {
      const angle = Math.atan2(directionY, directionX) + (Math.random() - 0.5) * (burst ? Math.PI * 2 : 1.3);
      const impulse = (burst ? 1.8 : 3.4) + Math.random() * (5 + velocity * 5);
      const droplet = {
        x: point.x,
        y: point.y,
        vx: Math.cos(angle) * impulse + (burst ? (Math.random() - 0.5) * 3 : 0),
        vy: Math.sin(angle) * impulse - Math.random() * (burst ? 4 : 2),
        radius: 1.6 + Math.random() * (burst ? 4.2 : 2.6),
        palette,
        life: 420 + Math.random() * 420,
        maxLife: 0,
      };
      droplet.maxLife = droplet.life;

      if (this.reduceMotion) {
        this.drawPool(
          droplet.x + droplet.vx * 4,
          droplet.y + droplet.vy * 4,
          droplet.radius,
          palette,
          0.48
        );
      } else {
        this.droplets.push(droplet);
      }
    }

    if (!this.reduceMotion && this.droplets.length && !this.effectsFrame) {
      this.lastEffectsTime = performance.now();
      this.effectsFrame = requestAnimationFrame((time) => this.animateDroplets(time));
    }
  }

  animateDroplets(time) {
    const elapsed = clamp(time - this.lastEffectsTime, 8, 32);
    const scale = elapsed / 16.67;
    this.lastEffectsTime = time;
    this.clearContext(this.effectsContext, this.effectsCanvas);

    const remaining = [];
    for (const droplet of this.droplets) {
      droplet.x += droplet.vx * scale;
      droplet.y += droplet.vy * scale;
      droplet.vx *= Math.pow(0.985, scale);
      droplet.vy = droplet.vy * Math.pow(0.985, scale) + 0.16 * scale;
      droplet.life -= elapsed;

      const inside = droplet.x >= 0 && droplet.x <= this.width && droplet.y >= 0 && droplet.y <= this.height;
      if (droplet.life <= 0 || !inside) {
        if (inside) this.drawPool(droplet.x, droplet.y, droplet.radius, droplet.palette, 0.5);
        continue;
      }

      const alpha = Math.min(0.78, droplet.life / droplet.maxLife + 0.15);
      const context = this.effectsContext;
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = droplet.palette.base;
      context.shadowColor = droplet.palette.deep;
      context.shadowBlur = droplet.radius * 2;
      context.beginPath();
      context.ellipse(
        droplet.x,
        droplet.y,
        droplet.radius,
        droplet.radius * (1 + Math.min(Math.abs(droplet.vy) * 0.08, 0.8)),
        Math.atan2(droplet.vy, droplet.vx),
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
      remaining.push(droplet);
    }

    this.droplets = remaining;
    if (remaining.length) {
      this.effectsFrame = requestAnimationFrame((nextTime) => this.animateDroplets(nextTime));
    } else {
      this.effectsFrame = null;
      this.clearContext(this.effectsContext, this.effectsCanvas);
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
}

if (!customElements.get('splash-ink-hero')) {
  customElements.define('splash-ink-hero', SplashInkHero);
}
