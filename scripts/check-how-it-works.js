'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(
    read(relativePath)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  );
}

function readLocale(relativePath) {
  return JSON.parse(
    read(relativePath)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  );
}

const templates = {
  'templates/page.how-it-works.json': 'hub',
  'templates/page.how-it-works-products.json': 'products',
  'templates/page.how-it-works-site.json': 'site',
  'templates/page.how-it-works-guide.json': 'guide',
};

for (const [relativePath, layout] of Object.entries(templates)) {
  const template = readJson(relativePath);
  assert.deepEqual(template.order, ['main'], `${relativePath} must contain one main section`);
  assert.equal(template.sections.main.type, 'how-it-works', `${relativePath} must use the How It Works section`);
  assert.equal(template.sections.main.settings.layout, layout, `${relativePath} must use the ${layout} layout`);
}

const section = read('sections/how-it-works.liquid');
const styles = read('assets/how-it-works.css');
const documentation = read('docs/how-it-works.md');

for (const slug of [
  'die-cut',
  'magnet',
  'uv-dtf',
  'uv',
  'emboss',
  'textile',
  'configurator',
  'background-removal',
  'browse-and-choose',
  'cart-and-checkout',
  'contact-and-help',
]) {
  const guideKey = slug.replaceAll('-', '_');
  assert.ok(section.includes(guideKey), `missing How It Works guide key for ${slug}`);
  assert.ok(documentation.includes(`how-it-works-${slug}`), `missing documented How It Works route for ${slug}`);
}

assert.ok(section.includes('routes.root_url }}pages/how-it-works-{{ item_slug }}'), 'directory cards must build internal guide links');
assert.ok(section.includes('{% assign directory_items = product_guides %}'), 'products directory variables must be Liquid assignments');
assert.ok(section.includes('{% assign directory_items = site_guides %}'), 'site directory variables must be Liquid assignments');
assert.ok(!section.includes('\n          assign directory_'), 'directory assignments must not render as storefront text');

for (const token of [
  'var(--color-background',
  'var(--splash-color-surface',
  'var(--splash-color-purple',
  'html[data-theme=\'dark\'] .how-it-works',
  '@media (prefers-reduced-motion: reduce)',
]) {
  assert.ok(styles.includes(token), `How It Works styles are missing ${token}`);
}

for (const localePath of ['locales/en.default.json', 'locales/tr.json']) {
  const locale = readLocale(localePath);
  assert.ok(locale.how_it_works?.common?.eyebrow, `${localePath} is missing How It Works translations`);
  assert.ok(locale.how_it_works?.guides?.configurator?.step_3_text, `${localePath} is missing guide translations`);
}
assert.ok(section.includes('page.handle'), 'Guide pages must resolve content from their page handle');

console.log('How It Works templates, routes, translations and theme-mode styles passed.');
