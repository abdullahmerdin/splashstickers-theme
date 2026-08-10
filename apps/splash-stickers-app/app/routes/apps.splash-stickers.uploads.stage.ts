import type { ActionFunctionArgs } from "react-router";

import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, cleanText, json, readJson } from "../services/http.server";
import { stageImageUpload } from "../services/shopify-files.server";
import { createUploadTicket } from "../services/upload-ticket.server";

const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return apiError(405, "method_not_allowed", "Use POST to stage an upload.");
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");

  const payload = await readJson(request);
  const filename = cleanText(payload.filename, 180).replace(/[\\/]/g, "-");
  const mimeType = cleanText(payload.mimeType, 80).toLowerCase();
  const fileSize = Number(payload.fileSize);
  if (!filename || !MIME_TYPES.has(mimeType) || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_BYTES) {
    return apiError(422, "invalid_upload", "Use a PNG, JPG, or WebP file up to 25 MB.");
  }

  try {
    const target = await stageImageUpload(admin, { filename, mimeType, fileSize });
    const uploadToken = createUploadTicket({ shop, resourceUrl: target.resourceUrl, filename });
    return json({ target, uploadToken, filename });
  } catch (error) {
    return apiError(502, "shopify_upload_error", error instanceof Error ? error.message : "Upload staging failed.");
  }
}
