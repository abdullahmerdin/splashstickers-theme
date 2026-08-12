import type { ActionFunctionArgs } from "react-router";
import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, cleanText, json, readJson } from "../services/http.server";
import { createPurchaseIntent } from "../services/purchase-intents.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return apiError(405, "method_not_allowed", "Use POST to finalize a purchase handoff.");
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");
  const payload = await readJson(request);
  const designPublicId = cleanText(payload.designId, 128);
  const designDigest = cleanText(payload.digest, 128);
  const variantId = cleanText(payload.variantId, 32);
  if (!designPublicId || !designDigest || !/^\d+$/.test(variantId)) return apiError(422, "invalid_handoff", "Design, digest and Shopify variant are required.");
  try {
    return json({ handoff: await createPurchaseIntent({ shop, designPublicId, designDigest, variantId, admin }) }, { status: 201 });
  } catch (error) {
    return apiError(422, "handoff_failed", error instanceof Error ? error.message : "Purchase handoff failed.");
  }
}
