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
    core.canvas.style.transform = 'scale(' + core.state.zoom + ') translate(' + (core.state.panX / core.state.zoom) + 'px, ' + (core.state.panY / core.state.zoom) + 'px)';
    core.canvas.style.transformOrigin = '0 0';
    var zoomDisplay = core.querySelector('#zoom-display-' + core.sid);
    if (zoomDisplay) {
      zoomDisplay.textContent = Math.round(core.state.zoom * 100) + '%';
    }
  }

  clampPan() {
    var core = this.core;
    if (!core.canvas) return;
    var rect = core.canvas.getBoundingClientRect();
    var maxPanX = Math.max(0, core.CANVAS_W * core.state.zoom - rect.width);
    var maxPanY = Math.max(0, core.CANVAS_H * core.state.zoom - rect.height);
    core.state.panX = Math.max(0, Math.min(maxPanX, core.state.panX || 0));
    core.state.panY = Math.max(0, Math.min(maxPanY, core.state.panY || 0));
  }

  zoomToFit() {
    var core = this.core;
    if (!core.canvas) return;
    var wrapW = core.wrap ? core.wrap.clientWidth : core.CANVAS_W;
    var wrapH = core.wrap ? (core.wrap.clientHeight || core.CANVAS_H) : core.CANVAS_H;
    var zoomX = (wrapW - 20) / core.CANVAS_W;
    var zoomY = (wrapH - 20) / core.CANVAS_H;
    core.state.zoom = Math.max(1, Math.min(5, Math.min(zoomX, zoomY)));
    core.state.panX = 0;
    core.state.panY = 0;
    this.applyZoom();
  }

  getCanvasXY(e) {
    var core = this.core;
    if (!core.canvas) return { x: 0, y: 0 };
    var rect = core.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / core.state.zoom - core.state.panX,
      y: (e.clientY - rect.top) / core.state.zoom - core.state.panY
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
