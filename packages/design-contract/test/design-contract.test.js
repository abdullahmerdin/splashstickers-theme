import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DesignManifestValidationError,
  createPublicId,
  digestDesignManifest,
  fromConfiguratorManifest,
  normalizeDesignManifest,
  projectCartLineProperties,
  validateDesignManifest,
} from '../src/index.js';

const legacy = {
  version: 1,
  projectId: 'project-123',
  workspace: { widthMm: 600, heightMm: 400 },
  gapMm: 3,
  background: '#ffffff',
  sheetQuantity: 2,
  items: [
    { id: 'image-1', kind: 'image', xMm: 1, yMm: 2, widthMm: 30, heightMm: 40, rotation: 0 },
    { id: 'text-1', kind: 'text', xMm: 5, yMm: 6, widthMm: 20, heightMm: 8, rotation: 5, text: 'Splash' },
  ],
};

test('adapts the existing theme manifest without artwork bytes', () => {
  const manifest = normalizeDesignManifest(legacy, { productId: '123', variantId: '456' });
  assert.equal(manifest.schemaVersion, '1.0');
  assert.equal(manifest.id, 'project-123');
  assert.equal(manifest.sheet.widthMm, 600);
  assert.equal(manifest.items[1].text, 'Splash');
  assert.equal(manifest.source.variantId, '456');
  assert.equal(JSON.stringify(manifest).includes('data:image'), false);
});

test('rejects inline artwork and unknown raw fields with structured errors', () => {
  const manifest = fromConfiguratorManifest(legacy);
  manifest.items[0].assetRef = 'data:image/png;base64,AAAA';
  manifest.rawBytes = 'AAAA';
  const result = validateDesignManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'unsafe_artwork'));
  assert.ok(result.errors.some((error) => error.code === 'unsafe_field'));
  assert.throws(() => normalizeDesignManifest(manifest), DesignManifestValidationError);
});

test('digest and public ID are deterministic and ignore volatile identity', async () => {
  const first = normalizeDesignManifest(legacy);
  const second = { ...first, id: 'another-id', timestamps: { updatedAt: '2026-08-10T00:00:00Z' } };
  assert.equal(await digestDesignManifest(first), await digestDesignManifest(second));
  assert.match(await createPublicId(first), /^splash_[a-f0-9]{24}$/);
});

test('cart projection contains compact references only', async () => {
  const properties = await projectCartLineProperties(legacy);
  assert.equal(properties['Design ID'], 'project-123');
  assert.equal(properties['Sheet copies'], undefined);
  assert.equal(properties._design_manifest_version, '1.0');
  assert.equal(JSON.stringify(properties).includes('Splash'), false);
});

test('rejects artwork whose rotated bounds leave the sheet', () => {
  const manifest = normalizeDesignManifest(legacy);
  manifest.items[0].placement = {
    ...manifest.items[0].placement,
    xMm: 590,
    yMm: 390,
    widthMm: 40,
    heightMm: 40,
    rotation: 45,
  };
  const result = validateDesignManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'outside_sheet'));
});
