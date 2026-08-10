import type { ActionFunctionArgs } from "react-router";

import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, cleanText, json, readJson } from "../services/http.server";
import { completeImageUpload } from "../services/shopify-files.server";
import { verifyUploadTicket } from "../services/upload-ticket.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return apiError(405, "method_not_allowed", "Use POST to complete an upload.");
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");

  const payload = await readJson(request);
  const resourceUrl = cleanText(payload.resourceUrl, 2048);
  const filename = cleanText(payload.filename, 180).replace(/[\\/]/g, "-");
  const alt = cleanText(payload.alt, 200) || undefined;
  const uploadToken = cleanText(payload.uploadToken, 4_096);
  if (!/^https:\/\//i.test(resourceUrl) || !filename || !uploadToken) {
    return apiError(422, "invalid_upload", "A staged HTTPS resource and filename are required.");
  }
  if (!verifyUploadTicket(uploadToken, { shop, resourceUrl, filename })) {
    return apiError(403, "invalid_upload_token", "The staged upload token is invalid or expired.");
  }

  try {
    const file = await completeImageUpload(admin, { resourceUrl, filename, alt });
    return json({ file }, { status: 201 });
  } catch (error) {
    return apiError(502, "shopify_file_error", error instanceof Error ? error.message : "File creation failed.");
  }
}
