'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const themeJson = (relativePath) => JSON.parse(read(relativePath).replace(/^[\s\S]*?\*\/\s*/, ''));

[
  ['snippets/stylesheets.liquid', "'splash-theme.css' | asset_url | stylesheet_tag"],
  ['snippets/product-information-content.liquid', 'splash-product-information'],
  ['sections/product-information.liquid', "render 'sticky-add-to-cart'"],
  ['snippets/sticky-add-to-cart.liquid', 'splash-sticky-add-to-cart'],
  ['apps/splash-stickers-app/extensions/splash-storefront/blocks/gangsheet-builder.liquid', 'apps/splash-stickers/builder'],
  ['apps/splash-stickers-app/extensions/splash-storefront/blocks/gangsheet-builder.liquid', '<iframe'],
  ['apps/splash-stickers-app/extensions/splash-storefront/blocks/gangsheet-builder.liquid', 'embedded=1'],
  ['templates/product.product-gangsheet.json', 'blocks/gangsheet-builder'],
].forEach(([relativePath, pattern]) => assert.ok(read(relativePath).includes(pattern), `${relativePath} is missing ${pattern}`));

[
  'sections/sticker-configurator.liquid',
  'assets/sticker-configurator.css',
  'assets/sticker-configurator.js',
  'assets/sticker-configurator-experience.js',
].forEach((relativePath) => assert.ok(!fs.existsSync(path.join(root, relativePath)), `${relativePath} must stay retired from the theme`));

const defaultTemplate = themeJson('templates/product.json');
const gangsheetTemplate = themeJson('templates/product.product-gangsheet.json');
assert.equal(defaultTemplate.sections.main?.type, 'product-information', 'default product keeps its native product surface');
assert.ok(!JSON.stringify(defaultTemplate).includes('blocks/gangsheet-builder'), 'default products do not expose the gangsheet-only builder');
assert.ok(JSON.stringify(gangsheetTemplate).includes('blocks/gangsheet-builder'), 'gangsheet template embeds the app-owned builder');
assert.ok(!JSON.stringify(defaultTemplate).includes('sticker-configurator'), 'default product does not embed the retired theme configurator');
assert.ok(!JSON.stringify(gangsheetTemplate).includes('sticker-configurator'), 'gangsheet template does not embed the retired theme configurator');

console.log('Phase 4 product and app-builder wiring checks passed.');
