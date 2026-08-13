import assert from "node:assert/strict";
import test from "node:test";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { generateProductionPdf, PRODUCTION_RENDERER_VERSION } from "./production-pdf.server";

test("production renderer creates a verified physical-size PDF", async (context) => {
  const artwork = await sharp({
    create: { width: 600, height: 300, channels: 4, background: { r: 108, g: 92, b: 231, alpha: 1 } },
  }).png().toBuffer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(artwork, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(artwork.byteLength) },
  });
  context.after(() => { globalThis.fetch = originalFetch; });

  const manifest = {
    schemaVersion: "1.0",
    sheet: { widthMm: 50, heightMm: 30, unit: "mm", gapMm: 2, background: "#ffffff" },
    quantity: 1,
    items: [
      {
        id: "art-1",
        kind: "image",
        assetRef: "gid://shopify/MediaImage/1",
        placement: { xMm: 5, yMm: 4, widthMm: 20, heightMm: 10, rotation: 12, flipX: true, flipY: false, zIndex: 0 },
      },
      {
        id: "text-1",
        kind: "text",
        text: "Baskı hazır",
        style: { fontSizePt: 12, color: "#161616", textAlign: "center" },
        placement: { xMm: 8, yMm: 18, widthMm: 34, heightMm: 6, rotation: 0, flipX: false, flipY: false, zIndex: 1 },
      },
    ],
  };
  const result = await generateProductionPdf(
    manifest,
    new Map([["gid://shopify/MediaImage/1", "https://cdn.shopify.com/test.png"]]),
    { orderId: "gid://shopify/Order/123", lineItemId: "456", createdAt: new Date("2026-08-13T00:00:00Z") },
  );
  const pdf = await PDFDocument.load(result.bytes, { updateMetadata: false });
  const page = pdf.getPages()[0];
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(Math.abs(page.getWidth() - 50 * 72 / 25.4) < 0.01);
  assert.ok(Math.abs(page.getHeight() - 30 * 72 / 25.4) < 0.01);
  assert.equal(pdf.getCreator(), PRODUCTION_RENDERER_VERSION);
  assert.equal(result.artworkCount, 2);
  assert.equal(result.minimumDpi, 762);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.bytes.byteLength > 1_000);
});

test("production renderer fails when a Shopify artwork URL is missing", async () => {
  const manifest = {
    schemaVersion: "1.0",
    sheet: { widthMm: 20, heightMm: 20, unit: "mm", gapMm: 1, background: "transparent" },
    quantity: 1,
    items: [{
      id: "art-1",
      kind: "image",
      assetRef: "gid://shopify/MediaImage/missing",
      placement: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, rotation: 0, flipX: false, flipY: false, zIndex: 0 },
    }],
  };
  await assert.rejects(
    generateProductionPdf(manifest, new Map(), { orderId: "1", lineItemId: "2" }),
    /unavailable/,
  );
});
