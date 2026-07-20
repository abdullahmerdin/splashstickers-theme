/* ===========================================
   MobileHandler — Auto-detect mobile, toggle mode
   =========================================== */

class MobileHandler {
  constructor(core) {
    this.core = core;
  }

  autoDetectMobile() {
    var core = this.core;
    core.state.mobileOverride = null;
    var isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1023px)').matches;
    this.setMobileMode(isMobile);
  }

  syncToViewport() {
    var core = this.core;
    if (core.state.mobileOverride !== null) return;
    var isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1023px)').matches;
    if (core.state.mobile === isMobile) return;
    this.setMobileMode(isMobile);
  }

  setMobileMode(enabled) {
    var core = this.core;
    core.state.mobile = Boolean(enabled);
    core.classList.toggle('mobile-mode', core.state.mobile);
    var section = core.closest('.sticker-configurator');
    if (section) section.classList.toggle('is-mobile-mode', core.state.mobile);

    var workspaceSettings = core.querySelector('.bottom-extra');
    if (workspaceSettings) {
      if (core.state.mobile) {
        workspaceSettings.removeAttribute('open');
      } else {
        workspaceSettings.setAttribute('open', '');
      }
    }

    if (core.mobileBtn) {
      core.mobileBtn.setAttribute('aria-pressed', String(core.state.mobile));
      core.mobileBtn.title = core.state.mobile ? 'Switch to desktop controls' : 'Switch to mobile controls';
      core.mobileBtn.innerHTML = core.state.mobile
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
    }

    setTimeout(function () { core.canvasRenderer.zoomToFit(); }, 100);
  }

  onMobileToggle() {
    var core = this.core;
    core.state.mobileOverride = !core.state.mobile;
    this.setMobileMode(core.state.mobileOverride);
  }
}
