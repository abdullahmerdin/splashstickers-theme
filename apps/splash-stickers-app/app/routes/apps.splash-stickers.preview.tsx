import type { LinksFunction } from "react-router";
import { GangsheetBuilder, links as builderLinks } from "./apps.splash-stickers.builder";

export const links: LinksFunction = builderLinks;

export async function loader() {
  if (process.env.NODE_ENV === "production") throw new Response("Not found", { status: 404 });
  return null;
}

const sampleArtwork = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><rect width="240" height="160" rx="24" fill="#6c5ce7"/><circle cx="72" cy="80" r="38" fill="#fdcb6e"/><path d="M126 50h72v18h-72zm0 32h54v18h-54z" fill="#fff"/></svg>')}`;

export default function BuilderPreview() {
  return <GangsheetBuilder previewMode product={{
    id: "gid://shopify/Product/1",
    legacyResourceId: "1",
    title: "Gangsheet · local visual preview",
    handle: "gangsheet",
    currency: "USD",
    selectedVariantId: "1",
    variants: [{ id: "gid://shopify/ProductVariant/1", legacyResourceId: "1", title: "600 × 400 mm", priceCents: 2500, available: true }],
  }} previewItems={[{
    id: "preview-artwork",
    name: "sample-artwork.svg",
    previewUrl: sampleArtwork,
    assetRef: "gid://shopify/MediaImage/1",
    uploadState: "ready",
    xMm: 36,
    yMm: 42,
    widthMm: 180,
    heightMm: 120,
    rotation: -4,
  }]} />;
}
