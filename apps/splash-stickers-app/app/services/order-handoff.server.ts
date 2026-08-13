import db from "../db.server";
import { verifyPurchaseClaim } from "./purchase-intents.server";
import { productionSnapshotMetadata } from "./production-file.server";
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

export async function capturePaidOrder(shop: string, payload: unknown, sourceWebhookId?: string) {
  const order = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const orderId = String(order.admin_graphql_api_id || order.id || "").slice(0, 128);
  const currency = String(order.currency || "").trim().slice(0, 3).toUpperCase() || undefined;
  const lineItems = Array.isArray(order.line_items) ? order.line_items as WebhookLine[] : [];
  if (!orderId) return { linked: 0, orderDesignIds: [] as string[] };

  let linked = 0;
  const orderDesignIds: string[] = [];
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

      const [orderDesign] = await db.$transaction([
        db.orderDesign.upsert({
          where: { shop_orderId_lineItemId: { shop, orderId, lineItemId } },
          create: {
            shop, orderId, lineItemId, designId: intent.designId, purchaseIntentId: intent.id,
            designDigest: intent.designDigest, manifest: intent.manifest as Prisma.InputJsonValue, productId: String(line.product_id || intent.productId),
            variantId: String(line.variant_id || intent.variantId), quantity: Math.max(1, Number(line.quantity) || 1),
            unitPriceCents: Number.isFinite(Number(line.price)) ? Math.round(Number(line.price) * 100) : intent.unitPriceCents,
            currency: currency || intent.currency,
            ...productionSnapshotMetadata(shop, orderId, lineItemId, intent.manifest, intent.designDigest, sourceWebhookId),
          },
          // A duplicate delivery returns the original paid snapshot unchanged.
          update: {},
        }),
        db.purchaseIntent.update({ where: { id: intent.id }, data: { status: "ORDERED" } }),
      ]);
      linked += 1;
      orderDesignIds.push(orderDesign.id);
      continue;
    }

    const publicId = designIdFromLine(line);
    if (!publicId) continue;

    const design = await db.design.findUnique({
      where: { shop_publicId: { shop, publicId } },
      select: { id: true, digest: true, manifest: true, productId: true, variantId: true },
    });
    if (!design) continue;

    const orderDesign = await db.orderDesign.upsert({
      where: { shop_orderId_lineItemId: { shop, orderId, lineItemId } },
      create: {
        shop, orderId, lineItemId, designId: design.id, designDigest: design.digest,
        manifest: design.manifest as Prisma.InputJsonValue, productId: String(line.product_id || design.productId || "") || undefined,
        variantId: String(line.variant_id || design.variantId || "") || undefined, quantity: Math.max(1, Number(line.quantity) || 1),
        unitPriceCents: Number.isFinite(Number(line.price)) ? Math.round(Number(line.price) * 100) : undefined,
        currency, ...productionSnapshotMetadata(shop, orderId, lineItemId, design.manifest, design.digest, sourceWebhookId),
      },
      // Preserve the first paid snapshot if Shopify redelivers the event.
      update: {},
    });
    linked += 1;
    orderDesignIds.push(orderDesign.id);
  }

  return { linked, orderDesignIds: Array.from(new Set(orderDesignIds)) };
}
