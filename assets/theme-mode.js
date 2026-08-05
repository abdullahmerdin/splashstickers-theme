(() => {
const STORAGE_KEY = 'splash-color-mode';
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readImageSource(image) {
  return {
    src: image.getAttribute('src'),
    srcset: image.getAttribute('srcset'),
    sizes: image.getAttribute('sizes'),
    maxResolution: image.getAttribute('data_max_resolution'),
  };
}

function writeImageSource(image, source) {
  for (const [attribute, value] of [
    ['sizes', source.sizes],
    ['srcset', source.srcset],
    ['src', source.src],
    ['data_max_resolution', source.maxResolution],
  ]) {
    if (value) {
      image.setAttribute(attribute, value);
    } else {
      image.removeAttribute(attribute);
    }
  }
}

function updateThemeMedia(mode, root = document) {
  const templates = new Set();

  if (root instanceof HTMLImageElement && root.nextElementSibling?.matches('template[data-theme-media-sources]')) {
    templates.add(root.nextElementSibling);
  }
  if (root instanceof HTMLTemplateElement && root.matches('[data-theme-media-sources]')) templates.add(root);
  if (root instanceof Document || root instanceof DocumentFragment || root instanceof Element) {
    root.querySelectorAll('template[data-theme-media-sources]').forEach((template) => templates.add(template));
  }

  for (const template of templates) {
    const image = template.previousElementSibling;
    if (!(image instanceof HTMLImageElement)) continue;

    const sources = template.content.querySelectorAll('img');
    const sourceImage = sources[mode === 'dark' ? 1 : 0];
    if (!(sourceImage instanceof HTMLImageElement)) continue;

    writeImageSource(image, readImageSource(sourceImage));
  }
}

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
  updateThemeMedia(mode);
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

document.addEventListener('shopify:section:load', (event) => {
  const mode = document.documentElement.dataset.theme || 'light';
  updateControls(mode);
  updateThemeMedia(mode, event.target);
});

const themeMediaObserver = new MutationObserver((mutations) => {
  const mode = document.documentElement.dataset.theme || 'light';

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) updateThemeMedia(mode, node);
    }
  }
});

function observeThemeMedia() {
  if (!document.body) return;
  themeMediaObserver.observe(document.body, { childList: true, subtree: true });
}

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
  document.addEventListener('DOMContentLoaded', () => {
    applyMode(document.documentElement.dataset.theme || 'light');
    observeThemeMedia();
  });
} else {
  applyMode(document.documentElement.dataset.theme || 'light');
  observeThemeMedia();
}
})();
