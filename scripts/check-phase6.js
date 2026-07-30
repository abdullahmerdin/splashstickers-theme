const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(relativePath, pattern) {
  const source = read(relativePath);
  if (!source.includes(pattern)) {
    throw new Error(`${relativePath} is missing ${JSON.stringify(pattern)}`);
  }
}

function assertNotContains(relativePath, pattern) {
  const source = read(relativePath).toLowerCase();
  if (source.includes(pattern.toLowerCase())) {
    throw new Error(`${relativePath} still contains retired ${JSON.stringify(pattern)}`);
  }
}

const checks = [
  ['snippets/stylesheets.liquid', "'splash-theme.css' | asset_url | stylesheet_tag"],
  ['assets/splash-theme.css', '.sticker-process-grid'],
  ['assets/splash-theme.css', '.trust-badge'],
  ['assets/splash-theme.css', '.splash-cta-button--outline'],
  ['assets/splash-theme.css', 'var(--splash-font-display)'],
  ['sections/sticker-categories.liquid', 'var(--splash-color-purple)'],
  ['sections/splash-hero.liquid', 'var(--splash-color-ink)'],
  ['sections/asset-attribution.liquid', 'var(--splash-color-ink-rgb)'],
  ['snippets/header-actions.liquid', 'var(--splash-color-surface-rgb)'],
  ['config/settings_schema.json', '"theme_name": "Splash Stickers"'],
  ['config/settings_schema.json', '"theme_version": "6.0.0"'],
  ['README.md', '## Release readiness'],
];

checks.forEach(([relativePath, pattern]) => assertContains(relativePath, pattern));

if (fs.existsSync(path.join(root, 'assets', 'custom.css'))) {
  throw new Error('assets/custom.css should be retired after the Splash stylesheet consolidation');
}

assertNotContains('snippets/stylesheets.liquid', 'custom.css');
[
  ['sections/sticker-categories.liquid', '#6c5ce7'],
  ['sections/sticker-categories.liquid', '#fd79a8'],
  ['sections/sticker-categories.liquid', '#fdcb6e'],
  ['sections/sticker-categories.liquid', '#00cec9'],
  ['sections/splash-hero.liquid', '#1f2937'],
  ['snippets/header-actions.liquid', '#1f2937'],
].forEach(([relativePath, pattern]) => assertNotContains(relativePath, pattern));

const splashThemeBytes = fs.statSync(path.join(root, 'assets', 'splash-theme.css')).size;
if (splashThemeBytes >= 102400) {
  throw new Error(`assets/splash-theme.css is ${splashThemeBytes} bytes; keep it below the Theme Check budget`);
}

console.log(`Phase 6 release checks passed (${checks.length + 8} assertions).`);
