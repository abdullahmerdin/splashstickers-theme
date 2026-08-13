import { normalizeDesignManifest, type DesignManifest } from "@splash-stickers/design-contract";

import laptopPlate from "../assets/mockups/laptop.webp?inline";
import mailerPlate from "../assets/mockups/mailer.webp?inline";
import phoneCasePlate from "../assets/mockups/phone-case.webp?inline";
import {
  normalizeMockupOptions,
  normalizeMockupScene,
  type MockupOptions,
  type MockupScene,
} from "./mockup-options.server";
import { artworkRefs, resolveArtworkUrls } from "./shopify-files.server";

export { artworkRefs, resolveArtworkUrls } from "./shopify-files.server";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type Rect = { x: number; y: number; width: number; height: number; radius: number };

type SceneDefinition = {
  label: string;
  plate: string;
  surface: Rect;
  printArea: Rect;
  padding: number;
};

const MAX_INLINE_ARTWORK_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_MOCKUP_BYTES = 32 * 1024 * 1024;
const INLINE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MOCKUP_SCENE_SIZE = 1000;

const MOCKUP_SCENE_DEFINITIONS: Record<MockupScene, SceneDefinition> = {
  phone: {
    label: "Phone case",
    plate: phoneCasePlate,
    surface: { x: 300, y: 104, width: 398, height: 790, radius: 76 },
    printArea: { x: 348, y: 337, width: 304, height: 453, radius: 22 },
    padding: 32,
  },
  laptop: {
    label: "Laptop lid",
    plate: laptopPlate,
    surface: { x: 70, y: 167, width: 866, height: 643, radius: 27 },
    printArea: { x: 128, y: 224, width: 750, height: 525, radius: 18 },
    padding: 34,
  },
  mailer: {
    label: "Shipping box",
    plate: mailerPlate,
    surface: { x: 104, y: 140, width: 790, height: 701, radius: 8 },
    printArea: { x: 158, y: 195, width: 682, height: 590, radius: 6 },
    padding: 38,
  },
};

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

function artworkElements(manifest: DesignManifest, artworkUrls: Map<string, string>) {
  return manifest.items
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
}

export function renderMockupSvg(
  input: unknown,
  artworkUrls: Map<string, string>,
  sceneValue: unknown = "phone",
  optionsValue: Partial<MockupOptions> = {},
) {
  const manifest: DesignManifest = normalizeDesignManifest(input);
  const scene = normalizeMockupScene(sceneValue);
  const options = normalizeMockupOptions(optionsValue, scene);
  const definition = MOCKUP_SCENE_DEFINITIONS[scene];
  const bounds = artworkBounds(manifest);
  const availableWidth = definition.printArea.width - definition.padding * 2;
  const availableHeight = definition.printArea.height - definition.padding * 2;
  const baseScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const scale = baseScale * options.scalePct / 100;
  const centerX = definition.printArea.x + definition.printArea.width * options.xPct / 100;
  const centerY = definition.printArea.y + definition.printArea.height * options.yPct / 100;
  const offsetX = centerX - (bounds.x + bounds.width / 2) * scale;
  const offsetY = centerY - (bounds.y + bounds.height / 2) * scale;
  const surface = definition.surface;
  const printArea = definition.printArea;
  const elements = artworkElements(manifest, artworkUrls);
  const title = `${definition.label} sticker mockup`;

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MOCKUP_SCENE_SIZE}" height="${MOCKUP_SCENE_SIZE}" viewBox="0 0 ${MOCKUP_SCENE_SIZE} ${MOCKUP_SCENE_SIZE}" role="img" aria-label="${xml(title)}">` +
    `<title>${xml(title)}</title>` +
    `<defs>` +
    `<clipPath id="product-surface"><rect x="${surface.x}" y="${surface.y}" width="${surface.width}" height="${surface.height}" rx="${surface.radius}"/></clipPath>` +
    `<clipPath id="print-area"><rect x="${printArea.x}" y="${printArea.y}" width="${printArea.width}" height="${printArea.height}" rx="${printArea.radius}"/></clipPath>` +
    `<filter id="sticker-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#251f1a" flood-opacity="0.24"/></filter>` +
    `</defs>` +
    `<g style="isolation:isolate">` +
    `<image href="${xml(definition.plate)}" width="${MOCKUP_SCENE_SIZE}" height="${MOCKUP_SCENE_SIZE}" preserveAspectRatio="xMidYMid slice"/>` +
    `<rect x="${surface.x}" y="${surface.y}" width="${surface.width}" height="${surface.height}" rx="${surface.radius}" fill="${xml(options.productColor)}" opacity="0.82" clip-path="url(#product-surface)" style="mix-blend-mode:multiply"/>` +
    `<g clip-path="url(#print-area)"><g transform="rotate(${options.rotationDeg} ${centerX} ${centerY}) translate(${offsetX} ${offsetY}) scale(${scale})" filter="url(#sticker-shadow)">${elements}</g></g>` +
    `</g></svg>`;
}
