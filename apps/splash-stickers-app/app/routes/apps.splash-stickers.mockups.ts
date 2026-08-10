import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { requireAppProxy } from "../services/app-proxy.server";
import { apiError, json, publicId, readJson } from "../services/http.server";
import { artworkIsReady } from "../services/mockup-renderer.server";
import { normalizeMockupOptions, normalizeMockupScene } from "../services/mockup-options.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return apiError(405, "method_not_allowed", "Use POST to request a mockup.");
  }

  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");
  const payload = await readJson(request);
  const designPublicId = String(payload.designId || "").slice(0, 128);
  if (!designPublicId) return apiError(422, "missing_design_id", "A design ID is required.");
  const scene = normalizeMockupScene(payload.scene);
  const options = normalizeMockupOptions(payload.options, scene);

  const design = await db.design.findUnique({
    where: { shop_publicId: { shop, publicId: designPublicId } },
    select: { id: true, status: true, manifest: true },
  });
  if (!design) return apiError(404, "design_not_found", "Design was not found.");
  const ready = design.status === "READY" && await artworkIsReady(admin, design.manifest);

  const candidates = await db.mockup.findMany({
    where: { shop, designId: design.id, scene, status: { not: "FAILED" } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const existing = candidates.find((candidate) => (
    JSON.stringify(normalizeMockupOptions(candidate.options, scene)) === JSON.stringify(options)
  ));
  let mockup = existing;
  if (mockup && ready && mockup.status !== "READY") {
    mockup = await db.mockup.update({
      where: { id: mockup.id },
      data: {
        status: "READY",
        outputUrl: `/apps/splash-stickers/mockups/${mockup.publicId}/render`,
        errorCode: null,
      },
    });
  }
  if (!mockup) {
    const mockupPublicId = publicId("mock");
    mockup = await db.mockup.create({
      data: {
        publicId: mockupPublicId,
        shop,
        designId: design.id,
        scene,
        options,
        status: ready ? "READY" : "QUEUED",
        outputUrl: ready
          ? `/apps/splash-stickers/mockups/${mockupPublicId}/render`
          : null,
      },
    });
  }

  return json({
    mockup: {
      id: mockup.publicId,
      designId: designPublicId,
      scene: mockup.scene,
      options: normalizeMockupOptions(mockup.options, mockup.scene),
      status: mockup.status,
      outputUrl: mockup.outputUrl,
      errorCode: mockup.errorCode,
    },
  }, { status: existing || mockup.status === "READY" ? 200 : 202 });
}
