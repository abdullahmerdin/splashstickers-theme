import {
  createPublicId,
  digestDesignManifest,
  normalizeDesignManifest,
  type DesignManifest,
} from "@splash-stickers/design-contract";

import db from "../db.server";

type SaveContext = {
  shop: string;
  productId?: string;
  variantId?: string;
};

export async function saveDesign(input: unknown, context: SaveContext) {
  const normalized = normalizeDesignManifest(input, context);
  normalized.shop = { domain: context.shop };
  normalized.source = {
    ...normalized.source,
    ...(context.productId ? { productId: context.productId } : {}),
    ...(context.variantId ? { variantId: context.variantId } : {}),
  };
  if (!Object.keys(normalized.source).length) delete normalized.source;
  // Public IDs are content-addressed. A storefront client cannot select a
  // known ID and overwrite another saved design in the same shop.
  normalized.id = await createPublicId(normalized);
  const manifest = normalizeDesignManifest(normalized);
  const digest = await digestDesignManifest(manifest);
  const ready = manifest.items.every((item) => (
    item.kind === "text" || Boolean(item.assetRef?.startsWith("gid://shopify/MediaImage/"))
  ));

  const saved = await db.design.upsert({
    where: { shop_publicId: { shop: context.shop, publicId: manifest.id! } },
    create: {
      publicId: manifest.id!,
      shop: context.shop,
      schemaVersion: manifest.schemaVersion,
      status: ready ? "READY" : "DRAFT",
      productId: manifest.source?.productId,
      variantId: manifest.source?.variantId,
      manifest,
      digest,
    },
    update: {
      schemaVersion: manifest.schemaVersion,
      status: ready ? "READY" : "DRAFT",
      productId: manifest.source?.productId,
      variantId: manifest.source?.variantId,
      manifest,
      digest,
    },
    select: {
      id: true,
      publicId: true,
      status: true,
      digest: true,
      schemaVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const assetRefs = Array.from(new Set(
    manifest.items
      .filter((item) => item.kind === "image" && item.assetRef)
      .map((item) => item.assetRef!),
  ));
  await db.designAsset.deleteMany({
    where: {
      designId: saved.id,
      ...(assetRefs.length ? { storageKey: { notIn: assetRefs } } : {}),
    },
  });
  if (assetRefs.length) {
    await db.$transaction(assetRefs.map((storageKey) => db.designAsset.upsert({
      where: { designId_storageKey: { designId: saved.id, storageKey } },
      create: {
        shop: context.shop,
        designId: saved.id,
        storageKey,
        contentType: "application/octet-stream",
      },
      update: {},
    })));
  }

  return {
    publicId: saved.publicId,
    status: saved.status,
    digest: saved.digest,
    schemaVersion: saved.schemaVersion,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

export async function findDesign(shop: string, publicId: string) {
  return db.design.findUnique({
    where: { shop_publicId: { shop, publicId } },
    select: {
      publicId: true,
      status: true,
      schemaVersion: true,
      manifest: true,
      digest: true,
      createdAt: true,
      updatedAt: true,
      mockups: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { publicId: true, scene: true, options: true, status: true, outputUrl: true, errorCode: true },
      },
    },
  });
}

export function asManifest(value: unknown) {
  return value as DesignManifest;
}
