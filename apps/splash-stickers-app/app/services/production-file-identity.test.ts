import assert from "node:assert/strict";
import test from "node:test";

import { productionFileIdentity, safeProductionError } from "./production-file-identity";

test("production file identity is stable for duplicate webhook deliveries", () => {
  const input = {
    shop: "example.myshopify.com",
    orderId: "gid://shopify/Order/123",
    lineItemId: "456",
    designDigest: "abcdef1234567890",
  };
  const first = productionFileIdentity(input);
  const duplicate = productionFileIdentity(input);
  assert.deepEqual(duplicate, first);
  assert.equal(first.filename, "splash-production-123-456-abcdef123456.pdf");
  assert.match(first.key, /^production:[a-f0-9]{64}$/);
});

test("production errors are safe and bounded for operator display", () => {
  const error = safeProductionError(new Error(`Upload\nfailed ${"x".repeat(600)}`));
  assert.equal(error.includes("\n"), false);
  assert.equal(error.length, 500);
});
