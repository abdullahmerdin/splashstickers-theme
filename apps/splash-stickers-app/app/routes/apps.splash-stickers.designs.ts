import type { ActionFunctionArgs } from "react-router";
import { DesignManifestValidationError } from "@splash-stickers/design-contract";

import { requireAppProxy } from "../services/app-proxy.server";
import { saveDesign } from "../services/designs.server";
import { apiError, json, readJson } from "../services/http.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST" && request.method !== "PUT") {
    return apiError(405, "method_not_allowed", "Use POST or PUT to save a design.");
  }

  const { shop } = await requireAppProxy(request);
  const payload = await readJson(request);

  try {
    const design = await saveDesign(payload.manifest ?? payload, {
      shop,
      productId: typeof payload.productId === "string" ? payload.productId : undefined,
      variantId: typeof payload.variantId === "string" ? payload.variantId : undefined,
    });
    return json({ design }, { status: request.method === "POST" ? 201 : 200 });
  } catch (error) {
    if (error instanceof DesignManifestValidationError) {
      return json(
        { error: { code: "invalid_manifest", message: error.message, fields: error.errors } },
        { status: 422 },
      );
    }
    throw error;
  }
}
