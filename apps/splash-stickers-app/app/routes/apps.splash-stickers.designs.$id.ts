import type { LoaderFunctionArgs } from "react-router";

import { requireAppProxy } from "../services/app-proxy.server";
import { findDesign } from "../services/designs.server";
import { apiError, json } from "../services/http.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireAppProxy(request);
  const id = String(params.id || "").slice(0, 128);
  if (!id) return apiError(400, "missing_design_id", "A design ID is required.");

  const design = await findDesign(shop, id);
  if (!design) return apiError(404, "design_not_found", "Design was not found.");
  return json({ design });
}
