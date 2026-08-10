import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, json } from "../services/http.server";
import { artworkIsReady } from "../services/mockup-renderer.server";
import { normalizeMockupOptions } from "../services/mockup-options.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");
  const publicId = String(params.id || "").slice(0, 128);
  const mockup = await db.mockup.findUnique({
    where: { shop_publicId: { shop, publicId } },
    select: {
      publicId: true,
      status: true,
      outputUrl: true,
      errorCode: true,
      scene: true,
      options: true,
      updatedAt: true,
      design: { select: { publicId: true, status: true, manifest: true } },
    },
  });
  if (!mockup) return apiError(404, "mockup_not_found", "Mockup was not found.");
  if (mockup.status === "QUEUED" && mockup.design.status === "READY" && await artworkIsReady(admin, mockup.design.manifest)) {
    const ready = await db.mockup.update({
      where: { shop_publicId: { shop, publicId } },
      data: {
        status: "READY",
        outputUrl: `/apps/splash-stickers/mockups/${mockup.publicId}/render`,
        errorCode: null,
      },
    });
    mockup.status = ready.status;
    mockup.outputUrl = ready.outputUrl;
    mockup.errorCode = ready.errorCode;
    mockup.updatedAt = ready.updatedAt;
  }
  return json({
    mockup: {
      id: mockup.publicId,
      designId: mockup.design.publicId,
      scene: mockup.scene,
      options: normalizeMockupOptions(mockup.options, mockup.scene),
      status: mockup.status,
      outputUrl: mockup.outputUrl,
      errorCode: mockup.errorCode,
      updatedAt: mockup.updatedAt,
    },
  });
}
