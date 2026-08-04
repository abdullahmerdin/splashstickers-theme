(() => {
const STORAGE_KEY = 'splash-color-mode';
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readSavedMode() {
  try {
    const mode = localStorage.getItem(STORAGE_KEY);
    return mode === 'light' || mode === 'dark' ? mode : null;
  } catch (error) {
    return null;
  }
}

function updateThemeColor(mode) {
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) return;

  if (themeColor.dataset.lightThemeColor === undefined) {
    themeColor.dataset.lightThemeColor = themeColor.content;
  }

  themeColor.content = mode === 'dark' ? '#0f1115' : themeColor.dataset.lightThemeColor;
}

function updateControls(mode) {
  const nextMode = mode === 'dark' ? 'light' : 'dark';

  document.querySelectorAll('[data-theme-mode-toggle]').forEach((control) => {
    const label = nextMode === 'dark' ? control.dataset.labelDark : control.dataset.labelLight;
    control.setAttribute('aria-label', label);
    control.setAttribute('title', label);
    control.setAttribute('aria-pressed', String(mode === 'dark'));
  });
}

function applyMode(mode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  updateThemeColor(mode);
  updateControls(mode);
  document.dispatchEvent(new CustomEvent('theme:change', { detail: { mode } }));
}

function saveMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (error) {
    // Storage can be unavailable in privacy modes; the active page still updates.
  }
}

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-theme-mode-toggle]');
  if (!control) return;

  const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  saveMode(mode);
  applyMode(mode);
});

document.addEventListener('shopify:section:load', () => {
  updateControls(document.documentElement.dataset.theme || 'light');
});

window.addEventListener('pageshow', () => {
  applyMode(document.documentElement.dataset.theme || 'light');
});

const handleSystemModeChange = (event) => {
  if (!readSavedMode()) applyMode(event.matches ? 'dark' : 'light');
};

if (mediaQuery.addEventListener) {
  mediaQuery.addEventListener('change', handleSystemModeChange);
} else {
  mediaQuery.addListener(handleSystemModeChange);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyMode(document.documentElement.dataset.theme || 'light'));
} else {
  applyMode(document.documentElement.dataset.theme || 'light');
}
})();
