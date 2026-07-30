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

function readThemeJson(relativePath) {
  const source = read(relativePath).replace(/^[\s\S]*?\*\/\s*/, '');
  return JSON.parse(source);
}

const checks = [
  ['snippets/stylesheets.liquid', "'splash-theme.css' | asset_url | stylesheet_tag"],
  ['snippets/product-information-content.liquid', 'splash-product-information'],
  ['sections/product-information.liquid', 'splash-sticky-add-to-cart'],
  ['sections/sticker-configurator.liquid', 'data-clipboard-enabled'],
  ['sections/sticker-configurator.liquid', 'role="region"'],
  ['sections/sticker-configurator.liquid', 'aria-modal="true"'],
  ['sections/sticker-configurator.liquid', 'class="cfg-toolbar-more"'],
  ['sections/sticker-configurator.liquid', 'data-action="export-pdf"'],
  ['sections/sticker-configurator.liquid', '"id": "enable_analytics"'],
  ['sections/sticker-configurator.liquid', '"default": false'],
  ['assets/splash-theme.css', 'Phase 4 product and configurator surfaces.'],
  ['assets/sticker-configurator.css', '.sticker-configurator > sticker-configurator.splash-studio'],
  ['assets/sticker-configurator.css', '.cfg-toolbar-more[open] .cfg-toolbar-more-controls'],
  ['assets/sticker-configurator.js', 'features.undoEnabled'],
  ['assets/sticker-configurator.js', 'features.clipboardEnabled'],
  ['assets/sticker-configurator.js', "features.exportEnabled !== 'false'"],
];

checks.forEach(([relativePath, pattern]) => assertContains(relativePath, pattern));

const gangsheetTemplate = readThemeJson('templates/product.product-gangsheet.json');
const configurator = gangsheetTemplate.sections?.sticker_configurator;
if (!configurator || configurator.type !== 'sticker-configurator') {
  throw new Error('Gangsheet product template does not contain the configurator section.');
}

const settings = configurator.settings || {};
['show_quick_start', 'resolution_low_text', 'resolution_success_text', 'enable_analytics'].forEach((key) => {
  if (!(key in settings)) throw new Error(`Gangsheet template is missing ${key}.`);
});

if (settings.enable_analytics !== false) {
  throw new Error('Configurator analytics must remain opt-in in the gangsheet template.');
}

const defaultProductTemplate = readThemeJson('templates/product.json');
if (defaultProductTemplate.sections?.main?.type !== 'product-information') {
  throw new Error('Default product template must render product-information as its main section.');
}

const defaultSectionTypes = Object.values(defaultProductTemplate.sections || {}).map((section) => section.type);
['sticker-configurator'].forEach((sectionType) => {
  if (defaultSectionTypes.includes(sectionType)) {
    throw new Error(`Default product template must not include ${sectionType}.`);
  }
});

console.log(`Phase 4 wiring checks passed (${checks.length + 2} groups).`);
