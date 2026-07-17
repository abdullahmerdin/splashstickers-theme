/* ===========================================
   KeyboardManager — Keyboard shortcut routing
   =========================================== */

class KeyboardManager {
  constructor(core) {
    this.core = core;
  }

  onKeyDown(e) {
    var core = this.core;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl/Cmd + Z — Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      core.historyManager.undo();
      return;
    }

    // Ctrl/Cmd + Shift + Z — Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      core.historyManager.redo();
      return;
    }

    // Ctrl/Cmd + Y — Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      core.historyManager.redo();
      return;
    }

    // Delete/Backspace — Delete selected
    if (e.key === 'Delete' || e.key === 'Backspace') {
      core.itemManager.deleteSelected();
      return;
    }

    // Ctrl/Cmd + C — Copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && core.state.selectedIds.length) {
      e.preventDefault();
      core.clipboardManager.copy();
      return;
    }

    // Ctrl/Cmd + V — Paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && core.state.clipboard) {
      e.preventDefault();
      core.clipboardManager.paste();
      return;
    }

    // Ctrl/Cmd + A — Select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      core.state.selectedIds = core.state.items.map(function (it) { return it.id; });
      core.selectionManager.updateSelection();
      core.dispatchSelectionEvent();
      return;
    }

    // T key — Text tool toggle
    if (e.key === 't' || e.key === 'T') {
      core.interactionManager.onTextToolToggle();
      return;
    }

    // Escape — Unselect / close modals
    if (e.key === 'Escape') {
      core.state.selectedIds = [];
      core.selectionManager.updateSelection();
      var visibleModal = core.querySelector('.cfg-modal[style*="display: flex"]');
      if (!visibleModal) {
        visibleModal = core.querySelector('.cfg-modal');
        if (visibleModal && visibleModal.style.display !== 'none') {
          visibleModal.style.display = 'none';
        }
      }
      return;
    }
  }
}
