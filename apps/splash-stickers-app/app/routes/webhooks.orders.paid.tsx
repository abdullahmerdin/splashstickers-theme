import type { ActionFunctionArgs } from "react-router";

import { capturePaidOrder } from "../services/order-handoff.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload } = await authenticate.webhook(request);
  await capturePaidOrder(shop, payload);
  return new Response();
}
