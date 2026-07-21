/* ===========================================
   ClipboardManager — Copy/paste with compact references
   =========================================== */

class ClipboardManager {
  constructor(core) {
    this.core = core;
  }

  copy() {
    var sel = this.core.getSelected();
    this.core.state.clipboard = sel.map(function (it) {
      return {
        // Store reference strings, not raw data URLs
        srcRef: it.el && it.el.querySelector('img') ? it.el.querySelector('img').currentSrc || it.src : null,
        isText: !!it.text,
        text: it.text || '',
        fontSize: it.fontSize || 16,
        color: it.color || '#2D3436',
        bgColor: it.bgColor || '',
        fontWeight: it.fontWeight || '',
        fontStyle: it.fontStyle || '',
        textAlign: it.textAlign || 'center',
        w: it.w,
        h: it.h
      };
    });
  }

  paste() {
    var core = this.core;
    if (!core.state.clipboard) return;
    core.historyManager.saveState();
    var autoBtn = core.querySelector('#auto-btn-' + core.sid);
    var self = this;

    core.state.clipboard.forEach(function (cd) {
      if (cd.isText) {
        var item = core.itemManager.addTextItem(
          cd.text, cd.fontSize, true,
          cd.color, cd.bgColor, cd.fontWeight, cd.fontStyle, cd.textAlign
        );
        if (item) {
          var pasteOffset = core.utils ? core.utils.mmToPx(20) : 20;
          item.x += pasteOffset;
          item.y += pasteOffset;
          item.el.style.left = item.x + 'px';
          item.el.style.top = item.y + 'px';
        }
      } else if (cd.srcRef) {
        var img = new Image();
        img.onload = function () {
          var item = core.itemManager.addImageItem(cd.srcRef, true);
          if (item) {
            item.w = cd.w;
            item.h = cd.h;
            item.el.style.width = cd.w + 'px';
            item.el.style.height = cd.h + 'px';
            if (item.el.querySelector('img')) {
              item.el.querySelector('img').style.width = cd.w + 'px';
              item.el.querySelector('img').style.height = cd.h + 'px';
            }
            item.el.style.left = item.x + 'px';
            item.el.style.top = item.y + 'px';
            core.historyManager.saveState();
            core.growCanvas();
            if (autoBtn) autoBtn.click();
          }
        };
        img.src = cd.srcRef;
      }
    });

    core.historyManager.saveState();
    core.growCanvas();
    if (autoBtn) autoBtn.click();
  }
}
