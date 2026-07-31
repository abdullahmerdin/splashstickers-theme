'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readThemeJson(relativePath) {
  const source = read(relativePath);
  return JSON.parse(source.slice(source.indexOf('*/') + 2));
}

function assertContains(relativePath, pattern) {
  assert.ok(read(relativePath).includes(pattern), relativePath + ' is missing ' + JSON.stringify(pattern));
}

function assertNotContains(relativePath, pattern) {
  assert.ok(!read(relativePath).toLowerCase().includes(pattern.toLowerCase()), relativePath + ' still contains ' + JSON.stringify(pattern));
}

const indexTemplate = readThemeJson('templates/index.json');
const collectionTemplate = readThemeJson('templates/collection.json');
const splashStyles = read('assets/splash-theme.css');

assert.deepEqual(indexTemplate.order, ['splash_drawing', 'featured_stickers', 'sticker_process']);
assert.equal(collectionTemplate.sections.section.type, 'sticker-collection-hero');

[
  ['templates/index.json', 'splash_cta_j4yGQL'],
  ['templates/index.json', 'section_nebJeq'],
  ['templates/index.json', 'Made with care'],
  ['templates/collection.json', 'show_sticker_'],
  ['templates/collection.json', 'art_meta_text'],
  ['sections/sticker-collection-hero.liquid', 'show_sticker_'],
  ['sections/sticker-collection-hero.liquid', 'splash-word'],
  ['sections/sticker-process.liquid', 'section.settings.eyebrow'],
  ['assets/splash-theme.css', 'splash-gangsheet-summary::before'],
].forEach(([relativePath, pattern]) => assertNotContains(relativePath, pattern));

assertContains('sections/header.liquid', 'splash-header__accent-strip');
assertContains('assets/splash-theme.css', 'splash-header__accent-strip');
assertContains('sections/splash-hero.liquid', 'role="group"');
assertContains('sections/splash-hero.liquid', 'aria-describedby="splash-hero-hint-{{ section.id }}"');
assertContains('sections/splash-hero.liquid', 'aria-expanded="false"');
assertContains('sections/splash-hero.liquid', 'touch-action: pan-y;');
assertContains('assets/splash-hero-ink.js', 'prefers-reduced-motion: reduce');
assertContains('assets/splash-hero-ink.js', 'handleMotionPreferenceChange');
assertContains('assets/splash-hero-ink.js', 'handleKeyDown');
assertContains('assets/splash-hero-ink.js', "event.key !== 'Escape'");
assertContains('assets/splash-hero-ink.js', "this.style.touchAction = this.isTouchDevice ? 'pan-y' : 'auto';");
assertContains('assets/splash-hero-ink.js', "button.setAttribute('aria-expanded', String(expanded))");

assertContains('snippets/group.liquid', '@param {string} [content_style]');
assertContains('snippets/group.liquid', '{{ content_style }}');
assertContains('blocks/_product-details.liquid', 'content_style:');
assertContains('blocks/_product-details.liquid', '--border-style: solid;');

const importantDeclarations = splashStyles
  .split(/\r?\n/)
  .filter((line) => line.includes('!important') && !line.trim().startsWith('/*'))
  .map((line) => line.trim());
assert.deepEqual(importantDeclarations, [
  '--gallery-aspect-ratio: 1 / 1 !important;',
  '--product-media-fit: contain !important;',
  '--media-radius: var(--splash-radius-card) !important;',
  'border-radius: var(--splash-radius-control) !important;',
  'background: transparent !important;',
  'background-color: transparent !important;',
]);

console.log('Storefront cleanup and accessibility guardrails passed.');
