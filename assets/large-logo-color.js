(function () {
  if (window.__largeLogoColorInitialized) {
    return;
  }

  window.__largeLogoColorInitialized = true;

  const TARGET_SELECTOR = '[data-large-logo-color-target]';
  const LAST_COLOR_STORAGE_KEY = 'large-logo-color:last';
  const DEFAULT_PALETTE = [
    '#6C5CE7',
    '#FD79A8',
    '#FDCB6E',
    '#00CEC9',
    '#2D3436',
    '#FFFFFF',
    '#FF6B6B',
    '#FF8C42',
    '#E76F51',
    '#2A9D8F',
    '#0B132B',
    '#1D3557',
    '#264653',
    '#1B4332',
    '#3A0CA3',
    '#4A1942',
    '#7F1D1D',
    '#111827',
  ];

  function parseColor(value) {
    if (!value) {
      return null;
    }

    const normalizedValue = value.trim();
    const hexMatch = normalizedValue.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);

    if (hexMatch) {
      let hex = hexMatch[1];

      if (hex.length === 3 || hex.length === 4) {
        hex = hex
          .split('')
          .map((character) => character + character)
          .join('');
      }

      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }

    const rgbMatch = normalizedValue.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
    );

    if (!rgbMatch) {
      return null;
    }

    const alphaValue = rgbMatch[4];

    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: alphaValue?.endsWith('%') ? Number.parseFloat(alphaValue) / 100 : Number(alphaValue ?? 1),
    };
  }

  function toHex({ r, g, b }) {
    return `#${[r, g, b]
      .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase();
  }

  function getTextColor({ r, g, b }) {
    const channels = [r, g, b].map((channel) => {
      const normalizedChannel = channel / 255;
      return normalizedChannel <= 0.03928
        ? normalizedChannel / 12.92
        : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

    return luminance > 0.179 ? '#000000' : '#FFFFFF';
  }

  function getLastColor() {
    try {
      return window.sessionStorage.getItem(LAST_COLOR_STORAGE_KEY);
    } catch (_error) {
      return null;
    }
  }

  function setLastColor(color) {
    try {
      window.sessionStorage.setItem(LAST_COLOR_STORAGE_KEY, color);
    } catch (_error) {
      // Storage can be unavailable in privacy-restricted browsing contexts.
    }
  }

  function getPalette(target) {
    const configuredPalette = (target.dataset.largeLogoColorPalette || '')
      .split('|')
      .map((color) => color.trim())
      .filter(Boolean);
    const palette = [...configuredPalette, ...DEFAULT_PALETTE].filter(
      (color, index, colors) => colors.indexOf(color) === index
    );

    return palette
      .map((color) => ({ raw: color, parsed: parseColor(color) }))
      .filter(({ parsed }) => parsed && parsed.a > 0);
  }

  function chooseRandomColor(target) {
    const palette = getPalette(target);

    if (!palette.length) {
      return null;
    }

    const previousColor = getLastColor() || target.dataset.largeLogoColorFixed;
    const previousParsedColor = parseColor(previousColor);
    const previousHex = previousParsedColor?.a > 0 ? toHex(previousParsedColor) : null;
    const availableColors = palette.filter(({ parsed }) => toHex(parsed) !== previousHex);
    const choices = availableColors.length ? availableColors : palette;
    const selectedColor = choices[Math.floor(Math.random() * choices.length)];
    const selectedHex = toHex(selectedColor.parsed);

    setLastColor(selectedHex);
    return selectedHex;
  }

  function getSurfaceElements(target) {
    const sectionBackground = target.previousElementSibling?.matches('.section-background')
      ? target.previousElementSibling
      : target.closest('.shopify-section')?.querySelector('.section-background');

    return [target, sectionBackground].filter(Boolean);
  }

  function setColorTokens(target, background, foreground) {
    const backgroundHex = toHex(background);
    const backgroundRgb = `${background.r}, ${background.g}, ${background.b}`;
    const foregroundRgb = foreground === '#FFFFFF' ? '255, 255, 255' : '0, 0, 0';
    const surfaces = getSurfaceElements(target);

    surfaces.forEach((surface) => {
      surface.style.setProperty('--color-background', backgroundHex);
      surface.style.setProperty('--color-background-rgb', backgroundRgb);
      surface.style.setProperty('--color', foreground);
      surface.style.setProperty('--color-rgb', foregroundRgb);
      surface.style.setProperty('--color-foreground', foreground);
      surface.style.setProperty('--color-foreground-rgb', foregroundRgb);
      surface.style.setProperty('--color-foreground-muted', `rgb(${foregroundRgb} / var(--opacity-muted-text))`);
      surface.style.setProperty('--color-foreground-subdued', `rgb(${foregroundRgb} / var(--opacity-subdued-text))`);
      surface.style.setProperty('--color-border', foreground);
      surface.style.setProperty('--color-border-rgb', foregroundRgb);
      surface.style.backgroundColor = backgroundHex;
      surface.style.color = foreground;
    });

    target.querySelectorAll('.text-block, jumbo-text, .logo-block, .logo-section').forEach((textElement) => {
      textElement.style.setProperty('--color', foreground);
      textElement.style.setProperty('--color-rgb', foregroundRgb);
      textElement.style.color = foreground;
    });

    const logoFilter = foreground === '#FFFFFF' ? 'brightness(0) invert(1)' : 'brightness(0)';
    target.querySelectorAll('.logo-block__image, .logo-section__image').forEach((image) => {
      image.style.filter = logoFilter;
    });

    target.dataset.largeLogoColorValue = backgroundHex;
    target.dataset.largeLogoTextColor = foreground;
  }

  function applyColor(target) {
    const randomize = target.dataset.largeLogoColorRandomize === 'true';
    let colorValue = randomize ? chooseRandomColor(target) : target.dataset.largeLogoColorFixed;

    if (!colorValue) {
      const surface = getSurfaceElements(target)[0];
      colorValue = window.getComputedStyle(surface).backgroundColor;
    }

    const background = parseColor(colorValue);

    if (!background || background.a === 0) {
      return;
    }

    setColorTokens(target, background, getTextColor(background));
  }

  function initialize(root = document) {
    const targets = root.matches?.(TARGET_SELECTOR) ? [root] : [...root.querySelectorAll(TARGET_SELECTOR)];
    targets.forEach(applyColor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target instanceof HTMLElement) {
      initialize(event.target);
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      initialize();
    }
  });
})();
