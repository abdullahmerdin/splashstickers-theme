type AdminGraphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
type VariantNode = { id: string; legacyResourceId: string; title: string; price: string; availableForSale: boolean };

export type AdminProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  productType: string;
};

export type BuilderProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  currency: string;
  selectedVariantId: string;
  variants: Array<{ id: string; legacyResourceId: string; title: string; priceCents: number; available: boolean }>;
};

export async function listAdminProducts(admin: AdminGraphql): Promise<{ currency: string; products: AdminProduct[] }> {
  const products: AdminProduct[] = [];
  let after: string | null = null;
  let currency = "USD";

  do {
    const response = await admin.graphql(
      `#graphql
        query SplashPricingProducts($after: String) {
          shop { currencyCode }
          products(first: 100, after: $after, sortKey: TITLE) {
            nodes { id legacyResourceId title handle status productType }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { variables: { after } },
    );
    const payload = await response.json() as {
      data?: {
        shop?: { currencyCode?: string };
        products?: {
          nodes?: AdminProduct[];
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (!payload.data?.products) throw new Error(payload.errors?.[0]?.message || "Shopify products could not be loaded.");
    currency = payload.data.shop?.currencyCode || currency;
    products.push(...(payload.data.products.nodes || []));
    after = payload.data.products.pageInfo?.hasNextPage ? payload.data.products.pageInfo.endCursor || null : null;
  } while (after);

  return { currency, products };
}

export async function resolveAdminProduct(admin: AdminGraphql, productId: string) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) throw new Error("A valid Shopify product is required.");
  const response = await admin.graphql(
    `#graphql
      query SplashPricingProduct($productId: ID!) {
        shop { currencyCode }
        product(id: $productId) { id }
      }
    `,
    { variables: { productId } },
  );
  const payload = await response.json() as {
    data?: { shop?: { currencyCode?: string }; product?: { id?: string } | null };
    errors?: Array<{ message?: string }>;
  };
  if (payload.data?.product?.id !== productId) {
    throw new Error(payload.errors?.[0]?.message || "The Shopify product is not available in this shop.");
  }
  return { id: productId, currency: payload.data.shop?.currencyCode || "USD" };
}

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
