import { normalizeDesignManifest, type DesignManifest } from "@splash-stickers/design-contract";

import phoneCasePlate from "../assets/mockups/phone-case.webp?inline";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const MAX_INLINE_ARTWORK_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_MOCKUP_BYTES = 32 * 1024 * 1024;
const INLINE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PHONE_SCENE_SIZE = 1000;
const PHONE_PRINT_AREA = {
  x: 348,
  y: 337,
  width: 304,
  height: 453,
};
const PHONE_PRINT_PADDING = 32;

function artworkBounds(manifest: DesignManifest) {
  if (!manifest.items.length) {
    return { x: 0, y: 0, width: manifest.sheet.widthMm, height: manifest.sheet.heightMm };
  }
  const left = Math.min(...manifest.items.map((item) => item.placement.xMm));
  const top = Math.min(...manifest.items.map((item) => item.placement.yMm));
  const right = Math.max(...manifest.items.map((item) => item.placement.xMm + item.placement.widthMm));
  const bottom = Math.max(...manifest.items.map((item) => item.placement.yMm + item.placement.heightMm));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export async function resolveArtworkUrls(admin: AdminGraphql, assetRefs: string[]) {
  const ids = Array.from(new Set(assetRefs.filter((value) => value.startsWith("gid://shopify/"))));
  if (!ids.length) return new Map<string, string>();
  const response = await admin.graphql(
    `#graphql
      query SplashMockupArtwork($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          ... on MediaImage { image { url } }
        }
      }
    `,
    { variables: { ids } },
  );
  const payload = await response.json() as {
    data?: { nodes?: Array<{ id?: string; image?: { url?: string } | null } | null> };
  };
  const urls = new Map<string, string>();
  payload.data?.nodes?.forEach((node) => {
    if (node?.id && node.image?.url) urls.set(node.id, node.image.url);
  });
  return urls;
}

export function artworkRefs(input: unknown) {
  const manifest: DesignManifest = normalizeDesignManifest(input);
  return Array.from(new Set(
    manifest.items
      .filter((item) => item.kind === "image")
      .map((item) => item.assetRef || "")
      .filter(Boolean),
  ));
}

export async function artworkIsReady(admin: AdminGraphql, input: unknown) {
  const refs = artworkRefs(input);
  if (!refs.length) return true;
  const urls = await resolveArtworkUrls(admin, refs);
  return refs.every((ref) => urls.has(ref));
}

export async function inlineArtworkUrls(artworkUrls: Map<string, string>) {
  const inlined = new Map<string, string>();
  let totalBytes = 0;
  for (const [assetRef, url] of artworkUrls) {
    try {
      const response = await fetch(url, {
        headers: { accept: "image/png,image/jpeg,image/webp" },
        signal: AbortSignal.timeout(10_000),
      });
      const mimeType = (response.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
      const declaredBytes = Number(response.headers.get("content-length") || 0);
      if (!response.ok || !INLINE_MIME_TYPES.has(mimeType) || declaredBytes > MAX_INLINE_ARTWORK_BYTES) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (bytes.byteLength > MAX_INLINE_ARTWORK_BYTES || totalBytes > MAX_INLINE_MOCKUP_BYTES) break;
      inlined.set(assetRef, `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`);
    } catch {
      continue;
    }
  }
  return inlined;
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function color(value: unknown, fallback: string) {
  const candidate = String(value || "").trim();
  return /^(?:#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\)|[a-z]+)$/i.test(candidate)
    ? candidate
    : fallback;
}

export function renderMockupSvg(input: unknown, artworkUrls: Map<string, string>) {
  const manifest: DesignManifest = normalizeDesignManifest(input);
  const bounds = artworkBounds(manifest);
  const availableWidth = PHONE_PRINT_AREA.width - PHONE_PRINT_PADDING * 2;
  const availableHeight = PHONE_PRINT_AREA.height - PHONE_PRINT_PADDING * 2;
  const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const renderedWidth = bounds.width * scale;
  const renderedHeight = bounds.height * scale;
  const offsetX = PHONE_PRINT_AREA.x + PHONE_PRINT_PADDING + (availableWidth - renderedWidth) / 2 - bounds.x * scale;
  const offsetY = PHONE_PRINT_AREA.y + PHONE_PRINT_PADDING + (availableHeight - renderedHeight) / 2 - bounds.y * scale;
  const elements = manifest.items
    .slice()
    .sort((left, right) => left.placement.zIndex - right.placement.zIndex)
    .map((item) => {
      const placement = item.placement;
      const cx = placement.xMm + placement.widthMm / 2;
      const cy = placement.yMm + placement.heightMm / 2;
      const transform = `translate(${cx} ${cy}) rotate(${placement.rotation}) scale(${placement.flipX ? -1 : 1} ${placement.flipY ? -1 : 1}) translate(${-cx} ${-cy})`;
      if (item.kind === "image" && item.assetRef && artworkUrls.has(item.assetRef)) {
        return `<image href="${xml(artworkUrls.get(item.assetRef))}" x="${placement.xMm}" y="${placement.yMm}" width="${placement.widthMm}" height="${placement.heightMm}" preserveAspectRatio="xMidYMid meet" transform="${transform}"/>`;
      }
      if (item.kind === "text") {
        const size = item.style?.fontSizePt
          ? Math.max(2, item.style.fontSizePt * 25.4 / 72)
          : Math.max(2, placement.heightMm * 0.55);
        const fill = color(item.style?.color, "#161616");
        const background = item.style?.background
          ? `<rect x="${placement.xMm}" y="${placement.yMm}" width="${placement.widthMm}" height="${placement.heightMm}" rx="1" fill="${xml(color(item.style.background, "transparent"))}" transform="${transform}"/>`
          : "";
        const anchor = item.style?.textAlign === "left" ? "start" : item.style?.textAlign === "right" ? "end" : "middle";
        const x = anchor === "start" ? placement.xMm : anchor === "end" ? placement.xMm + placement.widthMm : cx;
        return `${background}<text x="${x}" y="${cy}" font-size="${size}" fill="${xml(fill)}" font-weight="${xml(item.style?.fontWeight || "normal")}" font-style="${xml(item.style?.fontStyle || "normal")}" text-anchor="${anchor}" dominant-baseline="middle" transform="${transform}">${xml(item.text)}</text>`;
      }
      return `<rect x="${placement.xMm}" y="${placement.yMm}" width="${placement.widthMm}" height="${placement.heightMm}" rx="2" fill="none" stroke="#8a8f98" stroke-dasharray="3 2" transform="${transform}"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PHONE_SCENE_SIZE}" height="${PHONE_SCENE_SIZE}" viewBox="0 0 ${PHONE_SCENE_SIZE} ${PHONE_SCENE_SIZE}" role="img" aria-label="Phone case sticker mockup">` +
    `<title>Phone case sticker mockup</title>` +
    `<defs>` +
    `<clipPath id="phone-print-area"><rect x="${PHONE_PRINT_AREA.x}" y="${PHONE_PRINT_AREA.y}" width="${PHONE_PRINT_AREA.width}" height="${PHONE_PRINT_AREA.height}" rx="22"/></clipPath>` +
    `<filter id="sticker-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#251f1a" flood-opacity="0.24"/></filter>` +
    `</defs>` +
    `<image href="${xml(phoneCasePlate)}" width="${PHONE_SCENE_SIZE}" height="${PHONE_SCENE_SIZE}" preserveAspectRatio="xMidYMid slice"/>` +
    `<g clip-path="url(#phone-print-area)"><g transform="translate(${offsetX} ${offsetY}) scale(${scale})" filter="url(#sticker-shadow)">${elements}</g></g>` +
    `</svg>`;
}
