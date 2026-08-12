import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { publicId } from "./http.server";
import { resolveBuilderProduct } from "./products.server";
import { getImageFileStatuses } from "./shopify-files.server";

type AdminGraphql = Parameters<typeof resolveBuilderProduct>[0];

function claimSecret() {
  const value = process.env.SHOPIFY_API_SECRET;
  if (!value) throw new Error("SHOPIFY_API_SECRET is required to sign purchase handoffs.");
  return value;
}
function signClaim(value: string) { return createHmac("sha256", claimSecret()).update(value).digest("base64url"); }
export function verifyPurchaseClaim(reference: string, claim: string) {
  const supplied = Buffer.from(claim, "utf8");
  const expected = Buffer.from(signClaim(reference), "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function createPurchaseIntent(input: { shop: string; designPublicId: string; designDigest: string; variantId: string; admin: AdminGraphql }) {
  const design = await db.design.findUnique({ where: { shop_publicId: { shop: input.shop, publicId: input.designPublicId } } });
  if (!design || design.status !== "READY" || design.digest !== input.designDigest) throw new Error("Save the current design before adding it to cart.");
  const product = await resolveBuilderProduct(input.admin, input.variantId);
  const variant = product.variants.find((entry) => entry.legacyResourceId === input.variantId);
  if (!variant?.available) throw new Error("The selected Shopify variant is unavailable.");
  if (design.productId !== product.id || design.variantId !== variant.id) {
    throw new Error("The saved design does not match the selected Shopify option.");
  }
  const manifest = design.manifest as { items?: Array<{ kind?: unknown; assetRef?: unknown }> };
  const assetRefs = Array.from(new Set((manifest.items || [])
    .filter((item) => item.kind === "image" && typeof item.assetRef === "string")
    .map((item) => String(item.assetRef))));
  const files = await getImageFileStatuses(input.admin, assetRefs);
  if (!assetRefs.length || files.length !== assetRefs.length || files.some((file) => file.status !== "READY")) {
    throw new Error("Every artwork file must be available in this shop before checkout.");
  }
  const intent = await db.purchaseIntent.create({ data: {
    publicId: publicId("handoff"), shop: input.shop, designId: design.id, designDigest: design.digest,
    manifest: design.manifest as Prisma.InputJsonValue, productId: product.id, variantId: variant.id, unitPriceCents: variant.priceCents,
    currency: product.currency, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  } });
  return { reference: intent.publicId, claim: signClaim(intent.publicId), variantId: variant.legacyResourceId,
    productId: product.legacyResourceId, designId: design.publicId, digest: design.digest, expiresAt: intent.expiresAt };
}
