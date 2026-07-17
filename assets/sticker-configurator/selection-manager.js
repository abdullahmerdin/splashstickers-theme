/* ===========================================
   SelectionManager — Multi-select, guides, toolbar state
   =========================================== */

class SelectionManager {
  constructor(core) {
    this.core = core;
  }

  toggleSelect(id, add) {
    var state = this.core.state;
    var idx = state.selectedIds.indexOf(id);
    if (add) {
      if (idx === -1) state.selectedIds.push(id);
    } else {
      if (idx > -1) state.selectedIds.splice(idx, 1);
    }
    this.updateSelection();
  }

  selectAllInRect(x1, y1, x2, y2) {
    var state = this.core.state;
    var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    state.selectedIds = [];
    state.items.forEach(function (it) {
      if (it.x < maxX && it.x + it.w > minX &&
          it.y < maxY && it.y + it.h > minY) {
        state.selectedIds.push(it.id);
      }
    });
    this.updateSelection();
  }

  updateSelection() {
    var core = this.core;
    var ids = core.state.selectedIds;
    core.state.items.forEach(function (it) {
      it.el.classList.toggle('selected', ids.indexOf(it.id) > -1);
    });

    // Update toolbar buttons
    var selCount = ids.length;
    var btnIds = [
      'del-btn', 'dup-btn', 'flip-h', 'flip-v',
      'align-left', 'align-h', 'align-right',
      'align-top', 'align-v', 'align-bot'
    ];
    btnIds.forEach(function (id) {
      var btn = core.cache[id];
      if (btn) btn.disabled = selCount === 0;
    });

    // Lock button
    var lockBtn = core.cache['lock-btn'];
    if (lockBtn) {
      lockBtn.disabled = selCount === 0;
      if (selCount === 1) {
        var item = core.state.items.find(function (i) { return i.id === ids[0]; });
        lockBtn.classList.toggle('active', item && item.locked);
      } else {
        lockBtn.classList.remove('active');
      }
    }

    // Size inputs visibility
    var sizeInputs = core.cache['size-inputs'];
    if (sizeInputs) {
      sizeInputs.style.visibility = selCount > 0 ? 'visible' : 'hidden';
    }

    // Update size inputs for single selection
    if (selCount === 1) {
      var selItem = core.state.items.find(function (i) { return i.id === ids[0]; });
      if (selItem) {
        var wInput = core.cache['w-input'];
        var hInput = core.cache['h-input'];
        if (wInput) wInput.value = Math.round(core.utils.pxToMm(selItem.w));
        if (hInput) hInput.value = Math.round(core.utils.pxToMm(selItem.h));
      }
    }

    // Size info on items
    core.state.items.forEach(function (it) {
      var info = it.el.querySelector('.size-info');
      if (info) {
        info.textContent = Math.round(core.utils.pxToMm(it.w)) + 'x' + Math.round(core.utils.pxToMm(it.h)) + 'mm';
      }
    });

    core.priceManager.updateCount();
    core.dispatchSelectionEvent();
  }

  getSelected() {
    var ids = this.core.state.selectedIds;
    return this.core.state.items.filter(function (it) { return ids.indexOf(it.id) > -1; });
  }

  updateGuides(item, items) {
    var core = this.core;
    if (!item || !core.guideH || !core.guideV) return;
    var threshold = 5;
    var guideHShown = false;
    var guideVShown = false;

    items.forEach(function (other) {
      if (other.id === item.id) return;

      // Horizontal guides (top/bottom/center)
      if (Math.abs(item.y - other.y) < threshold) {
        if (core.guideH) {
          core.guideH.style.top = other.y + 'px';
          core.guideH.style.display = 'block';
          core.guideH.style.backgroundColor = '#00CEC9';
        }
        item.y = other.y;
        guideHShown = true;
      } else if (Math.abs(item.y + item.h - other.y - other.h) < threshold) {
        if (core.guideH) {
          core.guideH.style.top = (other.y + other.h - item.h) + 'px';
          core.guideH.style.display = 'block';
          core.guideH.style.backgroundColor = '#00CEC9';
        }
        item.y = other.y + other.h - item.h;
        guideHShown = true;
      } else if (Math.abs(item.y + item.h / 2 - other.y - other.h / 2) < threshold) {
        if (core.guideH) {
          core.guideH.style.top = (other.y + other.h / 2 - item.h / 2) + 'px';
          core.guideH.style.display = 'block';
          core.guideH.style.backgroundColor = '#6C5CE7';
        }
        item.y = other.y + other.h / 2 - item.h / 2;
        guideHShown = true;
      }

      // Vertical guides (left/right/center)
      if (Math.abs(item.x - other.x) < threshold) {
        if (core.guideV) {
          core.guideV.style.left = other.x + 'px';
          core.guideV.style.display = 'block';
          core.guideV.style.backgroundColor = '#00CEC9';
        }
        item.x = other.x;
        guideVShown = true;
      } else if (Math.abs(item.x + item.w - other.x - other.w) < threshold) {
        if (core.guideV) {
          core.guideV.style.left = (other.x + other.w - item.w) + 'px';
          core.guideV.style.display = 'block';
          core.guideV.style.backgroundColor = '#00CEC9';
        }
        item.x = other.x + other.w - item.w;
        guideVShown = true;
      } else if (Math.abs(item.x + item.w / 2 - other.x - other.w / 2) < threshold) {
        if (core.guideV) {
          core.guideV.style.left = (other.x + other.w / 2 - item.w / 2) + 'px';
          core.guideV.style.display = 'block';
          core.guideV.style.backgroundColor = '#6C5CE7';
        }
        item.x = other.x + other.w / 2 - item.w / 2;
        guideVShown = true;
      }
    });

    if (!guideHShown && core.guideH) core.guideH.style.display = 'none';
    if (!guideVShown && core.guideV) core.guideV.style.display = 'none';
  }
}
