/* ===========================================
   ItemManager — Item CRUD, factory, slot finder
   =========================================== */

class ItemManager {
  constructor(core) {
    this.core = core;
  }

  addImageItem(src, silent) {
    var core = this.core;
    if (!core.canvas) return null;

    var id = core.state.nextId++;
    var el = this._createItemElement(id);

    var img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    img.alt = 'Sticker design';
    el.appendChild(img);

    core.canvas.appendChild(el);

    var item = this.addItemHelpers(el, id);
    item.src = src;

    // Calculate default size proportional to canvas
    var defaultW = Math.round(core.CANVAS_W * 0.15);
    var defaultH = Math.round(defaultW * 0.75);
    item.w = defaultW;
    item.h = defaultH;
    el.style.width = defaultW + 'px';
    el.style.height = defaultH + 'px';

    // Find slot
    var slot = this.findNextSlot(defaultW, defaultH);
    item.x = slot.x;
    item.y = slot.y;
    el.style.left = item.x + 'px';
    el.style.top = item.y + 'px';

    if (!silent) {
      core.state.selectedIds = [id];
      core.historyManager.saveState();
      core.growCanvas();
      core.selectionManager.updateSelection();
      core.priceManager.updateCount();
      core.priceManager.updatePrice();
      core.dispatchUpdateEvent();
    }

    // Hide hint
    if (core.hintEl) core.hintEl.style.display = 'none';

    return item;
  }

  addTextItem(text, fontSize, silent, color, bgColor, fontWeight, fontStyle, textAlign) {
    var core = this.core;
    if (!core.canvas) return null;

    var id = core.state.nextId++;
    var el = this._createItemElement(id);

    var content = document.createElement('div');
    content.className = 'text-content';
    content.textContent = text;
    content.style.fontSize = (fontSize || 16) + 'px';
    content.style.color = color || '#2D3436';
    content.style.backgroundColor = bgColor || '';
    content.style.fontWeight = fontWeight || '';
    content.style.fontStyle = fontStyle || '';
    content.style.textAlign = textAlign || 'center';
    el.appendChild(content);

    // WCAG: role="img" and aria-label
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Text: ' + text);

    core.canvas.appendChild(el);

    var item = this.addItemHelpers(el, id);
    item.text = text;
    item.fontSize = fontSize || 16;
    item.color = color || '#2D3436';
    item.bgColor = bgColor || '';
    item.fontWeight = fontWeight || '';
    item.fontStyle = fontStyle || '';
    item.textAlign = textAlign || 'center';

    // Calculate size based on text
    var fs = fontSize || 16;
    item.w = Math.round(text.length * fs * 0.6 + 20);
    item.h = Math.round(fs * 1.8 + 16);
    item.w = Math.max(60, Math.min(core.CANVAS_W * 0.4, item.w));
    item.h = Math.max(40, Math.min(core.CANVAS_H * 0.15, item.h));
    el.style.width = item.w + 'px';
    el.style.height = item.h + 'px';

    // Find slot
    var slot = this.findNextSlot(item.w, item.h);
    item.x = slot.x;
    item.y = slot.y;
    el.style.left = item.x + 'px';
    el.style.top = item.y + 'px';

    if (!silent) {
      core.state.selectedIds = [id];
      core.historyManager.saveState();
      core.growCanvas();
      core.selectionManager.updateSelection();
      core.priceManager.updateCount();
      core.priceManager.updatePrice();
      core.dispatchUpdateEvent();
    }

    // Hide hint
    if (core.hintEl) core.hintEl.style.display = 'none';

    return item;
  }

  _createItemElement(id) {
    var el = document.createElement('div');
    el.className = 'canvas-item';
    el.dataset.itemId = id;

    // Add resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(function (h) {
      var handle = document.createElement('div');
      handle.className = 'resize-handle ' + h;
      handle.dataset.handle = h;
      el.appendChild(handle);
    });

    // Rotation handle
    var rot = document.createElement('div');
    rot.className = 'rot-handle';
    el.appendChild(rot);

    // Size info
    var info = document.createElement('div');
    info.className = 'size-info';
    el.appendChild(info);

    // WCAG: role="img" and aria-label
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Sticker design item');

    return el;
  }

  addItemHelpers(el, id) {
    var item = {
      id: id,
      el: el,
      x: 0, y: 0, w: 50, h: 50,
      rotation: 0,
      scaleX: 1, scaleY: 1,
      text: null,
      fontSize: 16,
      color: '#2D3436',
      bgColor: '',
      fontWeight: '',
      fontStyle: '',
      textAlign: 'center',
      locked: false,
      src: null
    };
    this.core.state.items.push(item);
    return item;
  }

  finishItem(el, id, w, h) {
    var item = this.core.state.items.find(function (i) { return i.id === id; });
    if (!item) return;
    item.w = w;
    item.h = h;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    this.core.growCanvas();
  }

  findNextSlot(w, h) {
    var CANVAS_W = this.core.CANVAS_W;
    var items = this.core.state.items;
    var cols = Math.floor(CANVAS_W / (w + 20));
    if (cols < 1) cols = 1;
    var gap = 10;

    for (var row = 0; row < 50; row++) {
      for (var col = 0; col < cols; col++) {
        var x = col * (w + gap) + gap;
        var y = row * (h + gap) + gap;
        var fits = true;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (x < it.x + it.w + 5 && x + w + 5 > it.x &&
              y < it.y + it.h + 5 && y + h + 5 > it.y) {
            fits = false;
            break;
          }
        }
        if (fits) return { x: x, y: y };
      }
    }
    return { x: gap, y: this.core.CANVAS_H + gap };
  }

  deleteSelected() {
    var core = this.core;
    var ids = core.state.selectedIds;
    if (!ids.length) return;
    core.historyManager.saveState();
    ids.forEach(function (id) {
      var idx = -1;
      for (var i = 0; i < core.state.items.length; i++) {
        if (core.state.items[i].id === id) { idx = i; break; }
      }
      if (idx > -1) {
        core.state.items[idx].el.remove();
        core.state.items.splice(idx, 1);
      }
    });
    core.state.selectedIds = [];
    core.selectionManager.updateSelection();
    core.priceManager.updateCount();
    core.priceManager.updatePrice();
    core.growCanvas();
    core.dispatchUpdateEvent();

    // Show hint if canvas empty
    if (core.state.items.length === 0 && core.hintEl) {
      core.hintEl.style.display = '';
    }
  }

  duplicateSelected() {
    var core = this.core;
    var sel = core.selectionManager.getSelected();
    if (!sel.length) return;
    core.historyManager.saveState();
    sel.forEach(function (it) {
      if (it.text) {
        var dup = core.itemManager.addTextItem(
          it.text, it.fontSize, true,
          it.color, it.bgColor, it.fontWeight, it.fontStyle, it.textAlign
        );
        if (dup) {
          dup.x = it.x + 20;
          dup.y = it.y + 20;
          dup.w = it.w;
          dup.h = it.h;
          dup.rotation = it.rotation || 0;
          dup.scaleX = it.scaleX || 1;
          dup.scaleY = it.scaleY || 1;
          dup.el.style.left = dup.x + 'px';
          dup.el.style.top = dup.y + 'px';
          dup.el.style.width = dup.w + 'px';
          dup.el.style.height = dup.h + 'px';
          core.applyTransform(dup);
        }
      } else if (it.src) {
        var img = new Image();
        img.onload = function () {
          var dup = core.itemManager.addImageItem(it.src, true);
          if (dup) {
            dup.x = it.x + 20;
            dup.y = it.y + 20;
            dup.w = it.w;
            dup.h = it.h;
            dup.rotation = it.rotation || 0;
            dup.scaleX = it.scaleX || 1;
            dup.scaleY = it.scaleY || 1;
            dup.el.style.left = dup.x + 'px';
            dup.el.style.top = dup.y + 'px';
            dup.el.style.width = dup.w + 'px';
            dup.el.style.height = dup.h + 'px';
            if (dup.el.querySelector('img')) {
              dup.el.querySelector('img').style.width = dup.w + 'px';
              dup.el.querySelector('img').style.height = dup.h + 'px';
            }
            core.applyTransform(dup);
            core.historyManager.saveState();
            core.growCanvas();
          }
        };
        img.src = it.src;
      }
    });
    core.historyManager.saveState();
    core.growCanvas();
    core.dispatchUpdateEvent();
  }

  flipH() {
    var sel = this.core.selectionManager.getSelected();
    sel.forEach(function (it) {
      it.scaleX = (it.scaleX || 1) * -1;
      this.core.applyTransform(it);
    }, this);
    this.core.historyManager.saveState();
  }

  flipV() {
    var sel = this.core.selectionManager.getSelected();
    sel.forEach(function (it) {
      it.scaleY = (it.scaleY || 1) * -1;
      this.core.applyTransform(it);
    }, this);
    this.core.historyManager.saveState();
  }

  lockSelected() {
    var sel = this.core.selectionManager.getSelected();
    if (!sel.length) return;
    var allLocked = sel.every(function (it) { return it.locked; });
    sel.forEach(function (it) {
      it.locked = !allLocked;
      it.el.style.opacity = it.locked ? '0.6' : '1';
      it.el.style.cursor = it.locked ? 'default' : 'grab';
    });
    this.core.selectionManager.updateSelection();
  }
}
