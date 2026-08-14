import assert from "node:assert/strict";
import test from "node:test";

import { listAdminProducts, resolveAdminProduct } from "./products.server";

test("admin product loading follows every Shopify product page", async () => {
  const cursors: unknown[] = [];
  const pages = [
    {
      data: {
        shop: { currencyCode: "USD" },
        products: {
          nodes: [{ id: "gid://shopify/Product/1", legacyResourceId: "1", title: "Die Cut", handle: "die-cut", status: "ACTIVE", productType: "Sticker" }],
          pageInfo: { hasNextPage: true, endCursor: "next" },
        },
      },
    },
    {
      data: {
        shop: { currencyCode: "USD" },
        products: {
          nodes: [{ id: "gid://shopify/Product/2", legacyResourceId: "2", title: "Magnet", handle: "magnet", status: "DRAFT", productType: "Magnet" }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  ];
  const admin = {
    graphql: async (_query: string, options?: { variables?: Record<string, unknown> }) => {
      cursors.push(options?.variables?.after);
      return new Response(JSON.stringify(pages[cursors.length - 1]), { headers: { "Content-Type": "application/json" } });
    },
  };

  const result = await listAdminProducts(admin);

  assert.equal(result.currency, "USD");
  assert.deepEqual(cursors, [null, "next"]);
  assert.deepEqual(result.products.map((product) => product.title), ["Die Cut", "Magnet"]);
});

test("pricing policy product validation stays inside the authenticated shop", async () => {
  const productId = "gid://shopify/Product/123";
  const admin = {
    graphql: async () => new Response(JSON.stringify({
      data: { shop: { currencyCode: "USD" }, product: { id: productId } },
    }), { headers: { "Content-Type": "application/json" } }),
  };

  assert.deepEqual(await resolveAdminProduct(admin, productId), { id: productId, currency: "USD" });
  await assert.rejects(() => resolveAdminProduct(admin, "gid://shopify/Product/not-a-number"), /valid Shopify product/);
});
