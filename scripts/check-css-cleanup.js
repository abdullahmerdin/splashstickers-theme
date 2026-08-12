'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertNotContains(relativePath, pattern) {
  assert.ok(
    !read(relativePath).toLowerCase().includes(pattern.toLowerCase()),
    `${relativePath} still contains retired ${JSON.stringify(pattern)}`
  );
}

assertNotContains('assets/splash-theme.css', 'sticker-configurator');

const splashThemeStyles = read('assets/splash-theme.css');
const importantDeclarations = splashThemeStyles
  .split(/\r?\n/)
  .map((line, index, lines) => ({ line: line.trim(), index, lines }))
  .filter(({ line }) => line.includes('!important') && !line.startsWith('/*'));

assert.deepEqual(
  importantDeclarations.map(({ line }) => line),
  [
    '--gallery-aspect-ratio: 1 / 1 !important;',
    '--product-media-fit: contain !important;',
    '--media-radius: var(--splash-radius-card) !important;',
    'border-radius: var(--splash-radius-control) !important;',
    'background: transparent !important;',
    'background-color: transparent !important;',
  ],
  'assets/splash-theme.css contains an undocumented !important declaration'
);

importantDeclarations.forEach(({ index, lines }) => {
  const rationale = lines.slice(Math.max(0, index - 2), index).some((line) =>
    line.includes('Intentional !important')
  );
  assert.ok(rationale, `assets/splash-theme.css line ${index + 1} needs an !important rationale`);
});

console.log('CSS namespace and !important cleanup guardrails passed.');
