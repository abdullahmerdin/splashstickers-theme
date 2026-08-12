type AdminGraphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
type VariantNode = { id: string; legacyResourceId: string; title: string; price: string; availableForSale: boolean };

export type BuilderProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  currency: string;
  selectedVariantId: string;
  variants: Array<{ id: string; legacyResourceId: string; title: string; priceCents: number; available: boolean }>;
};

export async function resolveBuilderProduct(admin: AdminGraphql, legacyVariantId: string): Promise<BuilderProduct> {
  if (!/^\d+$/.test(legacyVariantId)) throw new Error("A valid Shopify variant is required.");
  const response = await admin.graphql(
    `#graphql
      query SplashGangsheetProduct($variantId: ID!) {
        shop { currencyCode }
        productVariant(id: $variantId) {
          id legacyResourceId
          product {
            id legacyResourceId title handle status
            variants(first: 100) { nodes { id legacyResourceId title price availableForSale } }
          }
        }
      }
    `,
    { variables: { variantId: `gid://shopify/ProductVariant/${legacyVariantId}` } },
  );
  const payload = await response.json() as {
    data?: { shop?: { currencyCode?: string }; productVariant?: { id: string; legacyResourceId: string; product: {
      id: string; legacyResourceId: string; title: string; handle: string; status: string; variants: { nodes: VariantNode[] };
    } } };
    errors?: Array<{ message?: string }>;
  };
  const selected = payload.data?.productVariant;
  if (!selected?.product || selected.product.status !== "ACTIVE") {
    throw new Error(payload.errors?.[0]?.message || "This gangsheet product is not available.");
  }
  const variants = selected.product.variants.nodes.map((variant) => ({
    id: variant.id,
    legacyResourceId: String(variant.legacyResourceId),
    title: variant.title,
    priceCents: Math.max(0, Math.round(Number(variant.price) * 100)),
    available: Boolean(variant.availableForSale),
  }));
  if (!variants.some((variant) => variant.legacyResourceId === legacyVariantId)) throw new Error("The selected variant does not belong to this product.");
  return {
    id: selected.product.id, legacyResourceId: String(selected.product.legacyResourceId), title: selected.product.title,
    handle: selected.product.handle, currency: payload.data?.shop?.currencyCode || "USD", selectedVariantId: legacyVariantId, variants,
  };
}
