/* ===========================================
   MobileHandler — Auto-detect mobile, toggle mode
   =========================================== */

class MobileHandler {
  constructor(core) {
    this.core = core;
  }

  autoDetectMobile() {
    var isMobile = window.innerWidth < 768 ||
      ('ontouchstart' in window && window.innerWidth < 1024);
    if (isMobile) {
      this.onMobileToggle();
    }
  }

  onMobileToggle() {
    var core = this.core;
    core.state.mobile = !core.state.mobile;
    core.classList.toggle('mobile-mode', core.state.mobile);

    if (core.state.mobile) {
      // CRITICAL: clear wrap.style.height on mobile, but NEVER clear canvas.style.height
      if (core.wrap) core.wrap.style.height = '';
    } else {
      // Restore canvas height and wrap height
      if (core.canvas) core.canvas.style.height = core.CANVAS_H + 'px';
      if (core.wrap) core.wrap.style.height = core.CANVAS_H + 'px';
    }

    // Update mobile button icon
    if (core.mobileBtn) {
      core.mobileBtn.innerHTML = core.state.mobile
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
    }

    setTimeout(function () { core.canvasRenderer.zoomToFit(); }, 100);
  }
}
