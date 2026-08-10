import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic } = await authenticate.webhook(request);
  const normalizedTopic = String(topic).toLowerCase().replaceAll("_", "/");

  // The app stores no customer ID, email, address, or customer-linked profile.
  // A shop redaction removes all tenant data, including order/design links.
  if (normalizedTopic === "shop/redact") {
    await db.$transaction([
      db.orderDesign.deleteMany({ where: { shop } }),
      db.mockup.deleteMany({ where: { shop } }),
      db.designAsset.deleteMany({ where: { shop } }),
      db.design.deleteMany({ where: { shop } }),
      db.review.deleteMany({ where: { shop } }),
      db.session.deleteMany({ where: { shop } }),
    ]);
  }

  return new Response();
}
