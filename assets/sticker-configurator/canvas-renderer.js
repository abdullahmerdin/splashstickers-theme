/* ===========================================
   CanvasRenderer — Grid, zoom/pan, renderToCanvas
   =========================================== */

class CanvasRenderer {
  constructor(core) {
    this.core = core;
  }

  drawGrid() {
    var core = this.core;
    var ctx = core.gridCanvas ? core.gridCanvas.getContext('2d') : null;
    if (!ctx) return;
    var dpr = core.state.dpr;
    var w = core.CANVAS_W;
    var h = core.CANVAS_H;

    core.gridCanvas.width = w * dpr;
    core.gridCanvas.height = h * dpr;
    core.gridCanvas.style.width = w + 'px';
    core.gridCanvas.style.height = h + 'px';

    // CRITICAL: DPR-aware setTransform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#E8E8E8';
    ctx.lineWidth = 0.5;

    var gridSize = core.state.gridSize || 20;
    var cols = Math.floor(w / gridSize);
    var rows = Math.floor(h / gridSize);

    ctx.beginPath();
    for (var i = 0; i <= rows; i++) {
      var y = i * gridSize;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    for (var j = 0; j <= cols; j++) {
      var x = j * gridSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    this.scheduleBackdropGridSync();
  }

  syncBackdropGrid() {
    var core = this.core;
    if (!core.wrap || !core.canvas) return;
    var zoom = this.clampZoom(core.state.zoom);
    var step = Math.max(4, (core.state.gridSize || 20) * zoom);
    var wrapRect = core.wrap.getBoundingClientRect();
    var canvasRect = core.canvas.getBoundingClientRect();
    core.wrap.style.setProperty('--cfg-grid-step', step + 'px');
    core.wrap.style.setProperty('--cfg-grid-origin-x', (canvasRect.left - wrapRect.left) + 'px');
    core.wrap.style.setProperty('--cfg-grid-origin-y', (canvasRect.top - wrapRect.top) + 'px');
  }

  scheduleBackdropGridSync() {
    var core = this.core;
    if (core._gridBackdropRaf) return;
    var renderer = this;
    core._gridBackdropRaf = requestAnimationFrame(function () {
      core._gridBackdropRaf = null;
      renderer.syncBackdropGrid();
    });
  }

  applyZoom() {
    if (this.core._zoomRaf) return;
    this.core._zoomRaf = true;
    var self = this;
    requestAnimationFrame(function () {
      self.core._zoomRaf = false;
      self._syncZoomTransform();
    });
  }

  _syncZoomTransform() {
    var core = this.core;
    if (!core.canvas) return;
    var zoom = this.clampZoom(core.state.zoom);
    core.state.zoom = zoom;

    if (core.canvasStage) {
      core.canvasStage.style.width = (core.CANVAS_W * zoom) + 'px';
      core.canvasStage.style.height = (core.CANVAS_H * zoom) + 'px';
    }

    core.canvas.style.width = core.CANVAS_W + 'px';
    core.canvas.style.height = core.CANVAS_H + 'px';
    core.canvas.style.transform = 'scale(' + zoom + ')';
    core.canvas.style.transformOrigin = '0 0';
    this.scheduleBackdropGridSync();
    var zoomDisplay = core.querySelector('#zoom-display-' + core.sid);
    if (zoomDisplay) {
      zoomDisplay.textContent = Math.round(zoom * 100) + '%';
    }
  }

  clampZoom(value) {
    return Math.max(1, Math.min(4, Number(value) || 1));
  }

  clampPan() {
    var core = this.core;
    if (!core.wrap) return;
    var maxX = Math.max(0, core.wrap.scrollWidth - core.wrap.clientWidth);
    var maxY = Math.max(0, core.wrap.scrollHeight - core.wrap.clientHeight);
    core.wrap.scrollLeft = Math.max(0, Math.min(maxX, core.wrap.scrollLeft));
    core.wrap.scrollTop = Math.max(0, Math.min(maxY, core.wrap.scrollTop));
    core.state.panX = core.wrap.scrollLeft;
    core.state.panY = core.wrap.scrollTop;
  }

  zoomAt(value, clientX, clientY) {
    var core = this.core;
    if (!core.wrap) return;

    var oldZoom = core.state.zoom || 1;
    var newZoom = this.clampZoom(value);
    if (Math.abs(newZoom - oldZoom) < 0.001) return;

    var wrapRect = core.wrap.getBoundingClientRect();
    var anchorX = Number.isFinite(clientX) ? clientX - wrapRect.left : core.wrap.clientWidth / 2;
    var anchorY = Number.isFinite(clientY) ? clientY - wrapRect.top : core.wrap.clientHeight / 2;
    var oldStageLeft = core.canvasStage ? core.canvasStage.offsetLeft : 0;
    var oldStageTop = core.canvasStage ? core.canvasStage.offsetTop : 0;
    var worldX = (core.wrap.scrollLeft + anchorX - oldStageLeft) / oldZoom;
    var worldY = (core.wrap.scrollTop + anchorY - oldStageTop) / oldZoom;

    core.state.zoom = newZoom;
    this._syncZoomTransform();
    var newStageLeft = core.canvasStage ? core.canvasStage.offsetLeft : 0;
    var newStageTop = core.canvasStage ? core.canvasStage.offsetTop : 0;
    core.wrap.scrollLeft = newStageLeft + worldX * newZoom - anchorX;
    core.wrap.scrollTop = newStageTop + worldY * newZoom - anchorY;
    this.clampPan();
  }

  zoomToFit() {
    var core = this.core;
    if (!core.canvas || !core.wrap) return;
    core.state.zoom = 1;
    this._syncZoomTransform();

    requestAnimationFrame(function () {
      core.wrap.scrollLeft = Math.max(0, (core.wrap.scrollWidth - core.wrap.clientWidth) / 2);
      core.wrap.scrollTop = Math.max(0, (core.wrap.scrollHeight - core.wrap.clientHeight) / 2);
      core.state.panX = core.wrap.scrollLeft;
      core.state.panY = core.wrap.scrollTop;
    });
  }

  getCanvasXY(e) {
    var core = this.core;
    if (!core.canvas) return { x: 0, y: 0 };
    var rect = core.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / core.state.zoom,
      y: (e.clientY - rect.top) / core.state.zoom
    };
  }

  renderToCanvas() {
    var core = this.core;
    var c = document.createElement('canvas');
    c.width = core.CANVAS_W;
    c.height = core.CANVAS_H;
    var ctx = c.getContext('2d');
    if (!ctx) return null;

    // Draw grid background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, core.CANVAS_W, core.CANVAS_H);

    // Draw items
    core.state.items.forEach(function (it) {
      ctx.save();
      ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
      ctx.scale(it.scaleX || 1, it.scaleY || 1);
      if (it.rotation) ctx.rotate(it.rotation * Math.PI / 180);
      ctx.translate(-it.w / 2, -it.h / 2);

      if (it.text && it.bgColor) {
        ctx.fillStyle = it.bgColor;
        ctx.fillRect(0, 0, it.w, it.h);
      }

      if (it.text) {
        ctx.fillStyle = it.color || '#2D3436';
        ctx.font = (it.fontWeight || '') + ' ' + (it.fontStyle || '') + ' ' + (it.fontSize || 16) + 'px sans-serif';
        ctx.textAlign = it.textAlign || 'center';
        ctx.textBaseline = 'middle';
        var tx = it.w / 2;
        if (it.textAlign === 'left') tx = 8;
        else if (it.textAlign === 'right') tx = it.w - 8;
        ctx.fillText(it.text, tx, it.h / 2);
      } else if (it.el && it.el.querySelector('img')) {
        var img = it.el.querySelector('img');
        ctx.drawImage(img, 0, 0, it.w, it.h);
      }

      ctx.restore();
    });

    return c;
  }
}
