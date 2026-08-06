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

  const expectedBlockCount = { hub: 0, products: 6, site: 5, guide: 4 }[layout];
  const blocks = Object.values(template.sections.main.blocks || {});
  assert.equal(blocks.length, expectedBlockCount, `${relativePath} must contain the default editable blocks`);
  if (expectedBlockCount > 0) {
    const expectedBlockType = layout === 'guide' ? 'guide_step' : 'directory_card';
    assert.ok(blocks.every((block) => block.type === expectedBlockType), `${relativePath} contains an unexpected block type`);
    assert.equal(template.sections.main.block_order.length, expectedBlockCount, `${relativePath} must order every editable block`);
  }
}

const detailTemplates = {
  'die-cut': 'die_cut',
  magnet: 'magnet',
  'uv-dtf': 'uv_dtf',
  uv: 'uv',
  emboss: 'emboss',
  textile: 'textile',
  configurator: 'configurator',
  'background-removal': 'background_removal',
  'browse-and-choose': 'browse_and_choose',
  'cart-and-checkout': 'cart_and_checkout',
  'contact-and-help': 'contact_and_help',
};

for (const [slug, guideKey] of Object.entries(detailTemplates)) {
  const relativePath = `templates/page.how-it-works-${slug}.json`;
  const template = readJson(relativePath);
  assert.deepEqual(template.order, ['main'], `${relativePath} must contain one main section`);
  assert.equal(template.sections.main.type, 'how-it-works', `${relativePath} must use the How It Works section`);
  assert.equal(template.sections.main.settings.layout, 'guide', `${relativePath} must use the guide layout`);
  assert.equal(template.sections.main.settings.guide_key, guideKey, `${relativePath} must pin its guide key`);
  assert.equal(Object.values(template.sections.main.blocks || {}).length, 4, `${relativePath} must contain four editable steps`);
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
for (const settingId of [
  'hub_title',
  'hub_products_text',
  'quick_step_one',
  'directory_intro',
  'guide_intro',
  'guide_note_text',
  'guide_cta_url',
  'show_hub_hero',
  'show_hub_products_card',
  'show_hub_site_card',
  'show_hub_quick_path',
  'show_directory_hero',
  'show_directory_cards',
  'show_guide_hero',
  'show_guide_breadcrumbs',
  'show_guide_what_card',
  'show_guide_best_card',
  'show_guide_steps',
  'show_guide_note',
  'show_guide_actions',
]) {
  assert.ok(section.includes(`"id": "${settingId}"`), `missing Theme Editor setting ${settingId}`);
}
for (const visibilityGuard of [
  'section.settings.show_hub_hero != false',
  'section.settings.show_directory_cards != false',
  'section.settings.show_guide_steps != false',
]) {
  assert.ok(section.includes(visibilityGuard), `missing visibility guard ${visibilityGuard}`);
}
assert.ok(section.includes('"type": "directory_card"'), 'directory cards must be editable blocks');
assert.ok(section.includes('"type": "guide_step"'), 'guide steps must be editable blocks');

for (const token of [
  'var(--color-background',
  'var(--splash-color-surface',
  'var(--splash-color-purple',
  'html[data-theme=\'dark\'] .how-it-works',
  'padding-inline: clamp(1rem, 4vw, 3rem)',
  '@media (prefers-reduced-motion: reduce)',
]) {
  assert.ok(styles.includes(token), `How It Works styles are missing ${token}`);
}

for (const localePath of ['locales/en.default.json', 'locales/tr.json']) {
  const locale = readLocale(localePath);
  assert.ok(locale.how_it_works?.common?.eyebrow, `${localePath} is missing How It Works translations`);
  assert.ok(locale.how_it_works?.common?.see_all_guides, `${localePath} is missing the all-guides label`);
  assert.ok(locale.how_it_works?.guides?.configurator?.step_3_text, `${localePath} is missing guide translations`);
}
assert.ok(section.includes('page.handle'), 'Guide pages must resolve content from their page handle');

console.log('How It Works templates, routes, translations and theme-mode styles passed.');
