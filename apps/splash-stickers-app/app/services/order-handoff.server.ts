import db from "../db.server";

type WebhookProperty = { name?: unknown; value?: unknown };
type WebhookLine = { id?: unknown; properties?: unknown };

export function designIdFromLine(line: WebhookLine) {
  const properties = Array.isArray(line.properties) ? line.properties as WebhookProperty[] : [];
  const property = properties.find((entry) => entry?.name === "Design ID");
  return String(property?.value || "").trim().slice(0, 128);
}

export async function capturePaidOrder(shop: string, payload: unknown) {
  const order = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const orderId = String(order.admin_graphql_api_id || order.id || "").slice(0, 128);
  const lineItems = Array.isArray(order.line_items) ? order.line_items as WebhookLine[] : [];
  if (!orderId) return { linked: 0 };

  let linked = 0;
  for (const line of lineItems) {
    const publicId = designIdFromLine(line);
    const lineItemId = String(line.id || "").slice(0, 128);
    if (!publicId || !lineItemId) continue;

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
