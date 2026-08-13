import { createHash } from "node:crypto";

import { normalizeDesignManifest, type DesignItem, type DesignManifest } from "@splash-stickers/design-contract";
import { PDFDocument, degrees, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";

export const PRODUCTION_RENDERER_VERSION = "splash-pdf-v1";
export const PRODUCTION_MIME_TYPE = "application/pdf";

const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ARTWORK_BYTES = 64 * 1024 * 1024;
const TEXT_RASTER_DPI = 300;
const MAX_TEXT_RASTER_EDGE = 4096;

export type ProductionPdfResult = {
  bytes: Uint8Array;
  sha256: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  artworkCount: number;
  minimumDpi: number | null;
};

type ArtworkFile = {
  bytes: Uint8Array;
  mimeType: string;
};

function mmToPoints(value: number) {
  return value * POINTS_PER_INCH / MM_PER_INCH;
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cssColor(value: unknown, fallback = "#000000") {
  const candidate = String(value || "").trim();
  return /^(?:#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\)|[a-z]+)$/i.test(candidate)
    ? candidate
    : fallback;
}

function pdfColor(value: unknown) {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.toLowerCase() === "transparent") return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(candidate);
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i.exec(candidate);
  const parts = short
    ? short.slice(1).map((part) => Number.parseInt(`${part}${part}`, 16))
    : full?.slice(1, 4).map((part) => Number.parseInt(part, 16));
  return parts ? rgb(parts[0] / 255, parts[1] / 255, parts[2] / 255) : rgb(1, 1, 1);
}

function imagePlacement(item: DesignItem, widthPx: number, heightPx: number) {
  const placement = item.placement;
  const sourceAspect = widthPx / heightPx;
  const boxAspect = placement.widthMm / placement.heightMm;
  const widthMm = sourceAspect > boxAspect ? placement.widthMm : placement.heightMm * sourceAspect;
  const heightMm = sourceAspect > boxAspect ? placement.widthMm / sourceAspect : placement.heightMm;
  return {
    xMm: placement.xMm + (placement.widthMm - widthMm) / 2,
    yMm: placement.yMm + (placement.heightMm - heightMm) / 2,
    widthMm,
    heightMm,
  };
}

async function downloadArtwork(url: string): Promise<ArtworkFile> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Artwork URL is invalid.");
  }
  if (parsed.protocol !== "https:") throw new Error("Artwork URL must use HTTPS.");

  const response = await fetch(parsed, {
    headers: { accept: "image/png,image/jpeg,image/webp" },
    signal: AbortSignal.timeout(20_000),
  });
  const mimeType = (response.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  if (!response.ok) throw new Error(`Artwork download failed (${response.status}).`);
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error("Artwork has an unsupported image type.");
  }
  if (declaredBytes > MAX_ARTWORK_BYTES) throw new Error("Artwork exceeds the 25 MB production limit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_ARTWORK_BYTES) {
    throw new Error("Artwork exceeds the 25 MB production limit.");
  }
  return { bytes, mimeType };
}

export async function fetchProductionArtwork(artworkUrls: Map<string, string>) {
  const artwork = new Map<string, ArtworkFile>();
  let totalBytes = 0;
  for (const [assetRef, url] of artworkUrls) {
    const file = await downloadArtwork(url);
    totalBytes += file.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_ARTWORK_BYTES) throw new Error("Artwork exceeds the production job size limit.");
    artwork.set(assetRef, file);
  }
  return artwork;
}

async function embedArtwork(
  document: PDFDocument,
  cache: Map<string, { image: PDFImage; widthPx: number; heightPx: number }>,
  assetRef: string,
  file: ArtworkFile,
  flipX: boolean,
  flipY: boolean,
) {
  const key = `${assetRef}:${flipX ? 1 : 0}:${flipY ? 1 : 0}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let pipeline = sharp(file.bytes, { failOn: "error", limitInputPixels: 100_000_000 });
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Artwork dimensions are unavailable.");
  if (flipX) pipeline = pipeline.flop();
  if (flipY) pipeline = pipeline.flip();
  const png = await pipeline.png({ compressionLevel: 7, adaptiveFiltering: true }).toBuffer();
  const embedded = {
    image: await document.embedPng(png),
    widthPx: metadata.width,
    heightPx: metadata.height,
  };
  cache.set(key, embedded);
  return embedded;
}

async function renderTextPng(item: DesignItem) {
  const placement = item.placement;
  const pixelsPerMm = Math.min(
    TEXT_RASTER_DPI / MM_PER_INCH,
    MAX_TEXT_RASTER_EDGE / placement.widthMm,
    MAX_TEXT_RASTER_EDGE / placement.heightMm,
  );
  const width = Math.max(1, Math.ceil(placement.widthMm * pixelsPerMm));
  const height = Math.max(1, Math.ceil(placement.heightMm * pixelsPerMm));
  const fontSize = item.style?.fontSizePt
    ? Math.max(2, item.style.fontSizePt * pixelsPerMm * MM_PER_INCH / POINTS_PER_INCH)
    : Math.max(2, height * 0.55);
  const align = item.style?.textAlign === "left" ? "start" : item.style?.textAlign === "right" ? "end" : "middle";
  const x = align === "start" ? 0 : align === "end" ? width : width / 2;
  const weight = /^(?:normal|bold|[1-9]00)$/i.test(item.style?.fontWeight || "") ? item.style?.fontWeight : "400";
  const fontStyle = /^(?:normal|italic|oblique)$/i.test(item.style?.fontStyle || "") ? item.style?.fontStyle : "normal";
  const background = item.style?.background
    ? `<rect width="${width}" height="${height}" fill="${xml(cssColor(item.style.background, "transparent"))}"/>`
    : "";
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    background +
    `<text x="${x}" y="${height / 2}" fill="${xml(cssColor(item.style?.color))}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="${xml(weight)}" font-style="${xml(fontStyle)}" text-anchor="${align}" dominant-baseline="middle">${xml(item.text)}</text>` +
    `</svg>`,
  );
  let pipeline = sharp(svg);
  if (item.placement.flipX) pipeline = pipeline.flop();
  if (item.placement.flipY) pipeline = pipeline.flip();
  return pipeline.png({ compressionLevel: 7 }).toBuffer();
}

function drawRotatedImage(
  page: PDFPage,
  image: PDFImage,
  item: DesignItem,
  pageHeight: number,
  fitted?: { xMm: number; yMm: number; widthMm: number; heightMm: number },
) {
  const placement = fitted || {
    xMm: item.placement.xMm,
    yMm: item.placement.yMm,
    widthMm: item.placement.widthMm,
    heightMm: item.placement.heightMm,
  };
  const width = mmToPoints(placement.widthMm);
  const height = mmToPoints(placement.heightMm);
  const centerX = mmToPoints(placement.xMm + placement.widthMm / 2);
  const centerY = pageHeight - mmToPoints(placement.yMm + placement.heightMm / 2);
  const angle = -item.placement.rotation * Math.PI / 180;
  const originX = centerX - (Math.cos(angle) * width / 2 - Math.sin(angle) * height / 2);
  const originY = centerY - (Math.sin(angle) * width / 2 + Math.cos(angle) * height / 2);
  page.drawImage(image, {
    x: originX,
    y: originY,
    width,
    height,
    rotate: degrees(-item.placement.rotation),
  });
}

export async function generateProductionPdf(
  input: unknown,
  artworkUrls: Map<string, string>,
  metadata: { orderId: string; lineItemId: string; createdAt?: Date },
): Promise<ProductionPdfResult> {
  const manifest: DesignManifest = normalizeDesignManifest(input);
  const requiredRefs = Array.from(new Set(
    manifest.items.filter((item) => item.kind === "image").map((item) => item.assetRef || "").filter(Boolean),
  ));
  if (!requiredRefs.every((ref) => artworkUrls.has(ref))) {
    throw new Error("One or more production artwork files are unavailable.");
  }
  const artwork = await fetchProductionArtwork(new Map(requiredRefs.map((ref) => [ref, artworkUrls.get(ref)!])));

  const document = await PDFDocument.create();
  const pageWidth = mmToPoints(manifest.sheet.widthMm);
  const pageHeight = mmToPoints(manifest.sheet.heightMm);
  const page = document.addPage([pageWidth, pageHeight]);
  const background = pdfColor(manifest.sheet.background);
  if (background) page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: background });

  const imageCache = new Map<string, { image: PDFImage; widthPx: number; heightPx: number }>();
  let minimumDpi = Number.POSITIVE_INFINITY;
  for (const item of manifest.items.slice().sort((left, right) => left.placement.zIndex - right.placement.zIndex)) {
    if (item.kind === "image" && item.assetRef) {
      const file = artwork.get(item.assetRef);
      if (!file) throw new Error("Production artwork could not be loaded.");
      const embedded = await embedArtwork(document, imageCache, item.assetRef, file, item.placement.flipX, item.placement.flipY);
      const fitted = imagePlacement(item, embedded.widthPx, embedded.heightPx);
      const dpi = Math.min(
        embedded.widthPx / (fitted.widthMm / MM_PER_INCH),
        embedded.heightPx / (fitted.heightMm / MM_PER_INCH),
      );
      minimumDpi = Math.min(minimumDpi, dpi);
      drawRotatedImage(page, embedded.image, item, pageHeight, fitted);
      continue;
    }

    if (item.kind === "text") {
      const textImage = await document.embedPng(await renderTextPng(item));
      drawRotatedImage(page, textImage, item, pageHeight);
    }
  }

  const fixedDate = metadata.createdAt || new Date(0);
  document.setTitle(`Splash Stickers production file ${metadata.orderId}`);
  document.setSubject(`Paid order line ${metadata.lineItemId}`);
  document.setAuthor("Splash Stickers");
  document.setCreator(PRODUCTION_RENDERER_VERSION);
  document.setProducer(PRODUCTION_RENDERER_VERSION);
  document.setCreationDate(fixedDate);
  document.setModificationDate(fixedDate);

  const bytes = await document.save({ useObjectStreams: false });
  const verification = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = verification.getPages();
  if (pages.length !== 1) throw new Error("Production PDF must contain exactly one sheet.");
  const size = pages[0].getSize();
  if (Math.abs(size.width - pageWidth) > 0.01 || Math.abs(size.height - pageHeight) > 0.01) {
    throw new Error("Production PDF page size does not match the ordered sheet.");
  }

  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sheetWidthMm: manifest.sheet.widthMm,
    sheetHeightMm: manifest.sheet.heightMm,
    artworkCount: manifest.items.length,
    minimumDpi: Number.isFinite(minimumDpi) ? Math.max(1, Math.round(minimumDpi)) : null,
  };
}
