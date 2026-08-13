import { normalizeDesignManifest } from "@splash-stickers/design-contract";

import db from "../db.server";
import { productionFileIdentity, safeProductionError } from "./production-file-identity";
import {
  generateProductionPdf,
  PRODUCTION_MIME_TYPE,
  PRODUCTION_RENDERER_VERSION,
} from "./production-pdf.server";
import { artworkRefs, resolveArtworkUrls } from "./shopify-files.server";
import {
  getProductionFile,
  uploadProductionPdf,
  waitForProductionFile,
  type ShopifyProductionFile,
} from "./production-storage.server";

type AdminGraphql = Parameters<typeof resolveArtworkUrls>[0];

const PRODUCTION_LOCK_MS = 15 * 60 * 1000;

export function productionSnapshotMetadata(
  shop: string,
  orderId: string,
  lineItemId: string,
  manifestInput: unknown,
  designDigest?: string | null,
  sourceWebhookId?: string,
) {
  const manifest = normalizeDesignManifest(manifestInput);
  const identity = productionFileIdentity({ shop, orderId, lineItemId, designDigest });
  return {
    sourceWebhookId: sourceWebhookId || undefined,
    sheetWidthMm: manifest.sheet.widthMm,
    sheetHeightMm: manifest.sheet.heightMm,
    artworkCount: manifest.items.length,
    productionFileKey: identity.key,
  };
}

async function finishProductionFile(
  shop: string,
  orderDesignId: string,
  lockedAt: Date,
  file: ShopifyProductionFile,
) {
  if (!file.url) throw new Error("Shopify marked the production file ready without a URL.");
  await db.orderDesign.updateMany({
    where: { id: orderDesignId, shop, productionFileStatus: "PROCESSING", productionFileLockedAt: lockedAt },
    data: {
      productionFileStatus: "READY",
      productionFileUrl: file.url,
      productionFileMimeType: file.mimeType || PRODUCTION_MIME_TYPE,
      productionFileByteSize: file.originalFileSize || undefined,
      productionFileError: null,
      productionFileLockedAt: null,
      productionFileReadyAt: new Date(),
    },
  });
}

export async function generateAndPersistProductionFile(
  admin: AdminGraphql,
  shop: string,
  orderDesignId: string,
) {
  const existing = await db.orderDesign.findFirst({ where: { id: orderDesignId, shop } });
  if (!existing) throw new Error("Production queue item was not found.");
  if (existing.productionFileStatus === "READY" && existing.productionFileId && existing.productionFileUrl) return existing;

  const lockedAt = new Date();
  const staleBefore = new Date(lockedAt.getTime() - PRODUCTION_LOCK_MS);
  const claimed = await db.orderDesign.updateMany({
    where: {
      id: orderDesignId,
      shop,
      productionFileStatus: { not: "READY" },
      OR: [
        { productionFileStatus: { in: ["PENDING", "FAILED"] } },
        { productionFileStatus: "PROCESSING", productionFileLockedAt: { lt: staleBefore } },
        { productionFileStatus: "PROCESSING", productionFileLockedAt: null },
      ],
    },
    data: {
      productionFileStatus: "PROCESSING",
      productionFileAttempts: { increment: 1 },
      productionFileError: null,
      productionFileLockedAt: lockedAt,
      productionFileLastAttemptAt: lockedAt,
    },
  });
  if (!claimed.count) return db.orderDesign.findFirst({ where: { id: orderDesignId, shop } });

  try {
    const orderDesign = await db.orderDesign.findFirst({ where: { id: orderDesignId, shop } });
    if (!orderDesign?.manifest) throw new Error("The paid order is missing its immutable design manifest.");

    if (orderDesign.productionFileId) {
      const uploaded = await getProductionFile(admin, orderDesign.productionFileId);
      if (uploaded && uploaded.fileStatus !== "FAILED") {
        const ready = await waitForProductionFile(admin, uploaded);
        await finishProductionFile(shop, orderDesignId, lockedAt, ready);
        return db.orderDesign.findFirst({ where: { id: orderDesignId, shop } });
      }
    }

    const manifest = normalizeDesignManifest(orderDesign.manifest);
    const refs = artworkRefs(manifest);
    const urls = await resolveArtworkUrls(admin, refs);
    if (!refs.every((ref) => urls.has(ref))) throw new Error("One or more Shopify artwork files are not ready.");

    const pdf = await generateProductionPdf(manifest, urls, {
      orderId: orderDesign.orderId,
      lineItemId: orderDesign.lineItemId,
      createdAt: orderDesign.createdAt,
    });
    const identity = productionFileIdentity(orderDesign);
    const created = await uploadProductionPdf(admin, {
      filename: identity.filename,
      bytes: pdf.bytes,
      alt: `Production PDF for order ${orderDesign.orderId.split("/").pop()}, line ${orderDesign.lineItemId.split("/").pop()}`,
    });
    await db.orderDesign.updateMany({
      where: { id: orderDesignId, shop, productionFileStatus: "PROCESSING", productionFileLockedAt: lockedAt },
      data: {
        sheetWidthMm: pdf.sheetWidthMm,
        sheetHeightMm: pdf.sheetHeightMm,
        artworkCount: pdf.artworkCount,
        productionFileKey: identity.key,
        productionFileId: created.id,
        productionFileName: identity.filename,
        productionFileMimeType: PRODUCTION_MIME_TYPE,
        productionFileByteSize: pdf.bytes.byteLength,
        productionFileSha256: pdf.sha256,
        productionFileMinDpi: pdf.minimumDpi,
        productionFileRenderer: PRODUCTION_RENDERER_VERSION,
      },
    });
    const ready = await waitForProductionFile(admin, created);
    await finishProductionFile(shop, orderDesignId, lockedAt, ready);
    return db.orderDesign.findFirst({ where: { id: orderDesignId, shop } });
  } catch (error) {
    const message = safeProductionError(error);
    await db.orderDesign.updateMany({
      where: { id: orderDesignId, shop, productionFileStatus: "PROCESSING", productionFileLockedAt: lockedAt },
      data: { productionFileStatus: "FAILED", productionFileError: message, productionFileLockedAt: null },
    });
    throw new Error(message);
  }
}

export async function markProductionFilesFailed(shop: string, ids: string[], message: string) {
  if (!ids.length) return;
  await db.orderDesign.updateMany({
    where: { shop, id: { in: ids }, productionFileStatus: { not: "READY" } },
    data: { productionFileStatus: "FAILED", productionFileError: safeProductionError(message), productionFileLockedAt: null },
  });
}
