import type { LoaderFunctionArgs } from "react-router";
import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, json } from "../services/http.server";
import { getImageFileStatuses } from "../services/shopify-files.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { context } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");
  const ids = new URL(request.url).searchParams.getAll("id").filter((id) => /^gid:\/\/shopify\/MediaImage\/\d+$/.test(id)).slice(0, 20);
  if (!ids.length) return apiError(422, "invalid_file_ids", "At least one Shopify MediaImage ID is required.");
  return json({ files: await getImageFileStatuses(admin, ids) });
}
