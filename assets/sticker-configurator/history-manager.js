/* ===========================================
   HistoryManager — Undo/redo with 50-step stack
   =========================================== */

class HistoryManager {
  constructor(core) {
    this.core = core;
  }

  saveState() {
    var state = this.core.state;
    var snapshot = state.items.map(function (it) {
      return {
        id: it.id,
        x: it.x, y: it.y, w: it.w, h: it.h,
        rotation: it.rotation || 0,
        scaleX: it.scaleX || 1,
        scaleY: it.scaleY || 1,
        text: it.text || null,
        fontSize: it.fontSize || 16,
        color: it.color || '#2D3436',
        bgColor: it.bgColor || '',
        fontWeight: it.fontWeight || '',
        fontStyle: it.fontStyle || '',
        textAlign: it.textAlign || 'center',
        locked: it.locked || false,
        src: it.src || null,
        isText: !!it.text
      };
    });
    snapshot.gapSize = state.gapSize;

    if (state.historyIdx < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIdx + 1);
    }
    state.history.push(snapshot);
    if (state.history.length > 50) {
      state.history.shift();
    }
    state.historyIdx = state.history.length - 1;
    this.updateHistoryButtons();
  }

  undo() {
    var state = this.core.state;
    if (state.historyIdx <= 0) return;
    state.historyIdx--;
    this.restoreState(state.history[state.historyIdx]);
    this.core.dispatchUpdateEvent();
  }

  redo() {
    var state = this.core.state;
    if (state.historyIdx >= state.history.length - 1) return;
    state.historyIdx++;
    this.restoreState(state.history[state.historyIdx]);
    this.core.dispatchUpdateEvent();
  }

  restoreState(snapshot) {
    var core = this.core;
    if (Number.isFinite(snapshot.gapSize)) {
      core.state.gapSize = Math.max(3, Math.min(50, snapshot.gapSize));
      var gapInput = core.cache ? core.cache['gap-size'] : null;
      if (gapInput) gapInput.value = core.state.gapSize;
    }
    // Remove existing items
    core.state.items.slice().forEach(function (it) { it.el.remove(); });
    core.state.items.length = 0;
    core.state.selectedIds = [];

    snapshot.forEach(function (data) {
      if (data.isText) {
        core.itemManager.addTextItem(
          data.text, data.fontSize || 16, true,
          data.color || '#2D3436', data.bgColor || '',
          data.fontWeight || '', data.fontStyle || '',
          data.textAlign || 'center'
        );
        var item = core.state.items[core.state.items.length - 1];
        if (item) {
          item.x = data.x; item.y = data.y;
          item.w = data.w; item.h = data.h;
          item.rotation = data.rotation || 0;
          item.scaleX = data.scaleX || 1;
          item.scaleY = data.scaleY || 1;
          item.locked = data.locked || false;
          item.el.style.left = item.x + 'px';
          item.el.style.top = item.y + 'px';
          item.el.style.width = item.w + 'px';
          item.el.style.height = item.h + 'px';
          if (item.locked) {
            item.el.style.opacity = '0.6';
            item.el.style.cursor = 'default';
          }
          core.applyTransform(item);
        }
      } else if (data.src) {
        var img = new Image();
        img.onload = function () {
          var item = core.itemManager.addImageItem(data.src, true);
          if (item) {
            item.x = data.x; item.y = data.y;
            item.w = data.w; item.h = data.h;
            item.rotation = data.rotation || 0;
            item.scaleX = data.scaleX || 1;
            item.scaleY = data.scaleY || 1;
            item.locked = data.locked || false;
            item.el.style.left = item.x + 'px';
            item.el.style.top = item.y + 'px';
            item.el.style.width = item.w + 'px';
            item.el.style.height = item.h + 'px';
            if (item.el.querySelector('img')) {
              item.el.querySelector('img').style.width = item.w + 'px';
              item.el.querySelector('img').style.height = item.h + 'px';
            }
            if (item.locked) {
              item.el.style.opacity = '0.6';
              item.el.style.cursor = 'default';
            }
            core.applyTransform(item);
          }
        };
        img.src = data.src;
      }
    });

    core.growCanvas();
    core.selectionManager.updateSelection();
    this.core.priceManager.updateCount();
    this.core.priceManager.updatePrice();
  }

  updateHistoryButtons() {
    var state = this.core.state;
    if (this.core.undoBtn) this.core.undoBtn.disabled = state.historyIdx <= 0;
    if (this.core.redoBtn) this.core.redoBtn.disabled = state.historyIdx >= state.history.length - 1;
  }
}
