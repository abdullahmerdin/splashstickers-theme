import db from "../db.server";
import { verifyPurchaseClaim } from "./purchase-intents.server";
import type { Prisma } from "@prisma/client";

type WebhookProperty = { name?: unknown; value?: unknown };
type WebhookLine = {
  id?: unknown;
  properties?: unknown;
  product_id?: unknown;
  variant_id?: unknown;
  quantity?: unknown;
  price?: unknown;
};

function propertyValue(line: WebhookLine, name: string) {
  const properties = Array.isArray(line.properties) ? line.properties as WebhookProperty[] : [];
  const property = properties.find((entry) => entry?.name === name);
  return String(property?.value || "").trim();
}

export function designIdFromLine(line: WebhookLine) {
  return propertyValue(line, "Design ID").slice(0, 128);
}

export async function capturePaidOrder(shop: string, payload: unknown) {
  const order = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const orderId = String(order.admin_graphql_api_id || order.id || "").slice(0, 128);
  const currency = String(order.currency || "").trim().slice(0, 3).toUpperCase() || undefined;
  const lineItems = Array.isArray(order.line_items) ? order.line_items as WebhookLine[] : [];
  if (!orderId) return { linked: 0 };

  let linked = 0;
  for (const line of lineItems) {
    const lineItemId = String(line.id || "").slice(0, 128);
    const handoffId = propertyValue(line, "_splash_handoff").slice(0, 128);
    const handoffClaim = propertyValue(line, "_splash_claim").slice(0, 256);
    if (!lineItemId) continue;

    if (handoffId && handoffClaim && verifyPurchaseClaim(handoffId, handoffClaim)) {
      const intent = await db.purchaseIntent.findUnique({
        where: { shop_publicId: { shop, publicId: handoffId } },
        select: { id: true, designId: true, designDigest: true, manifest: true, productId: true, variantId: true, unitPriceCents: true, currency: true, status: true },
      });
      if (!intent || (intent.status !== "OPEN" && intent.status !== "ORDERED")) continue;
      const paidVariantId = String(line.variant_id || "");
      const expectedVariantId = intent.variantId.split("/").pop();
      if (paidVariantId && paidVariantId !== expectedVariantId) continue;

      await db.$transaction([
        db.orderDesign.upsert({
          where: { shop_orderId_lineItemId: { shop, orderId, lineItemId } },
          create: {
            shop, orderId, lineItemId, designId: intent.designId, purchaseIntentId: intent.id,
            designDigest: intent.designDigest, manifest: intent.manifest as Prisma.InputJsonValue, productId: String(line.product_id || intent.productId),
            variantId: String(line.variant_id || intent.variantId), quantity: Math.max(1, Number(line.quantity) || 1),
            unitPriceCents: Number.isFinite(Number(line.price)) ? Math.round(Number(line.price) * 100) : intent.unitPriceCents,
            currency: currency || intent.currency,
          },
          update: {
            designId: intent.designId, purchaseIntentId: intent.id, designDigest: intent.designDigest, manifest: intent.manifest as Prisma.InputJsonValue,
            productId: String(line.product_id || intent.productId), variantId: String(line.variant_id || intent.variantId),
            quantity: Math.max(1, Number(line.quantity) || 1),
            unitPriceCents: Number.isFinite(Number(line.price)) ? Math.round(Number(line.price) * 100) : intent.unitPriceCents,
            currency: currency || intent.currency,
          },
        }),
        db.purchaseIntent.update({ where: { id: intent.id }, data: { status: "ORDERED" } }),
      ]);
      linked += 1;
      continue;
    }

    const publicId = designIdFromLine(line);
    if (!publicId) continue;

    const design = await db.design.findUnique({
      where: { shop_publicId: { shop, publicId } },
      select: { id: true },
    });
    if (!design) continue;

    await db.orderDesign.upsert({
      where: { shop_orderId_lineItemId: { shop, orderId, lineItemId } },
      create: { shop, orderId, lineItemId, designId: design.id },
      update: { designId: design.id },
    });
    linked += 1;
  }

  return { linked };
}
