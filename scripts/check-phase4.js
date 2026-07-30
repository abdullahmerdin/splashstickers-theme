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
  ['sections/product-information.liquid', "render 'sticky-add-to-cart'"],
  ['snippets/sticky-add-to-cart.liquid', 'splash-sticky-add-to-cart'],
  ['snippets/sticky-add-to-cart.liquid', '{% stylesheet %}'],
  ['sections/sticker-configurator.liquid', 'data-clipboard-enabled'],
  ['sections/sticker-configurator.liquid', 'role="region"'],
  ['sections/sticker-configurator.liquid', 'aria-modal="true"'],
  ['sections/sticker-configurator.liquid', 'class="cfg-toolbar-more"'],
  ['sections/sticker-configurator.liquid', 'data-action="export-pdf"'],
  ['sections/sticker-configurator.liquid', '"id": "enable_analytics"'],
  ['sections/sticker-configurator.liquid', '"default": false'],
  ['sections/sticker-configurator.liquid', 'data-configurator-copy'],
  ['sections/sticker-configurator.liquid', 'sections.sticker-configurator.add_design_error'],
  ['assets/splash-theme.css', '.splash-product-information .splash-product-details .add-to-cart-button.button'],
  ['assets/sticker-configurator.css', '.sticker-configurator > sticker-configurator.splash-studio'],
  ['assets/sticker-configurator.css', '.cfg-toolbar-more[open] .cfg-toolbar-more-controls'],
  ['assets/sticker-configurator.js', 'features.undoEnabled'],
  ['assets/sticker-configurator.js', 'features.clipboardEnabled'],
  ['assets/sticker-configurator.js', "features.exportEnabled !== 'false'"],
  ['assets/sticker-configurator.js', 'function configuratorText'],
];

checks.forEach(([relativePath, pattern]) => assertContains(relativePath, pattern));

const configuratorSource = read('sections/sticker-configurator.liquid');
const configuratorSchema = JSON.parse(
  configuratorSource.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]
);
const localeReferences = [...configuratorSource.matchAll(/sections\.sticker-configurator\.([a-z0-9_]+)/g)]
  .map((match) => match[1]);
const missingLocaleKeys = [...new Set(localeReferences)]
  .filter((key) => !(key in configuratorSchema.locales.en));
if (missingLocaleKeys.length) {
  throw new Error(`Configurator section locale is missing: ${missingLocaleKeys.join(', ')}`);
}

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
