import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { requireAppProxy } from "../services/app-proxy.server";
import { apiError } from "../services/http.server";
import {
  artworkRefs,
  inlineArtworkUrls,
  renderMockupSvg,
  resolveArtworkUrls,
} from "../services/mockup-renderer.server";
import { normalizeMockupOptions, normalizeMockupScene } from "../services/mockup-options.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  if (!admin) return apiError(401, "app_not_installed", "An installed app session is required.");
  const publicId = String(params.id || "").slice(0, 128);
  const mockup = await db.mockup.findUnique({
    where: { shop_publicId: { shop, publicId } },
    select: { status: true, scene: true, options: true, design: { select: { manifest: true } } },
  });
  if (!mockup) return apiError(404, "mockup_not_found", "Mockup was not found.");
  if (mockup.status !== "READY") return apiError(409, "mockup_not_ready", "Mockup is not ready.");

  const manifest = mockup.design.manifest;
  const assetRefs = artworkRefs(manifest);
  const artworkUrls = await resolveArtworkUrls(admin, assetRefs);
  if (!assetRefs.every((ref) => artworkUrls.has(ref))) {
    return apiError(409, "artwork_processing", "Artwork is still being processed.");
  }
  const artworkData = await inlineArtworkUrls(artworkUrls);
  if (!assetRefs.every((ref) => artworkData.has(ref))) {
    return apiError(503, "artwork_unavailable", "Artwork could not be loaded for this mockup.");
  }
  const scene = normalizeMockupScene(mockup.scene);
  const options = normalizeMockupOptions(mockup.options, scene);
  const svg = renderMockupSvg(manifest, artworkData, scene, options);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
