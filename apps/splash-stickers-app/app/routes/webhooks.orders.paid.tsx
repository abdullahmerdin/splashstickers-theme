import type { ActionFunctionArgs } from "react-router";

import { capturePaidOrder } from "../services/order-handoff.server";
import { queueProductionWork } from "../services/production-worker.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload, eventId } = await authenticate.webhook(request);
  const captured = await capturePaidOrder(shop, payload, eventId);
  if (captured.orderDesignIds.length) queueProductionWork();
  return new Response();
}
