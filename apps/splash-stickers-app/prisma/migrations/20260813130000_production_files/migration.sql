CREATE TYPE "ProductionFileStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "OrderDesign"
  ADD COLUMN "sourceWebhookId" TEXT,
  ADD COLUMN "sheetWidthMm" DECIMAL(8,2),
  ADD COLUMN "sheetHeightMm" DECIMAL(8,2),
  ADD COLUMN "artworkCount" INTEGER,
  ADD COLUMN "productionFileStatus" "ProductionFileStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "productionFileKey" TEXT,
  ADD COLUMN "productionFileId" TEXT,
  ADD COLUMN "productionFileUrl" TEXT,
  ADD COLUMN "productionFileName" TEXT,
  ADD COLUMN "productionFileMimeType" TEXT,
  ADD COLUMN "productionFileByteSize" INTEGER,
  ADD COLUMN "productionFileSha256" TEXT,
  ADD COLUMN "productionFileMinDpi" INTEGER,
  ADD COLUMN "productionFileRenderer" TEXT,
  ADD COLUMN "productionFileAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "productionFileError" TEXT,
  ADD COLUMN "productionFileLockedAt" TIMESTAMPTZ(3),
  ADD COLUMN "productionFileLastAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "productionFileReadyAt" TIMESTAMPTZ(3);

UPDATE "OrderDesign" AS order_design
SET
  "designDigest" = COALESCE(order_design."designDigest", design."digest"),
  "manifest" = COALESCE(order_design."manifest", design."manifest"),
  "productId" = COALESCE(order_design."productId", design."productId"),
  "variantId" = COALESCE(order_design."variantId", design."variantId")
FROM "Design" AS design
WHERE order_design."designId" = design."id";

UPDATE "OrderDesign"
SET
  "sheetWidthMm" = ("manifest" -> 'sheet' ->> 'widthMm')::DECIMAL(8,2),
  "sheetHeightMm" = ("manifest" -> 'sheet' ->> 'heightMm')::DECIMAL(8,2),
  "artworkCount" = jsonb_array_length("manifest" -> 'items')
WHERE "manifest" IS NOT NULL;

CREATE UNIQUE INDEX "OrderDesign_productionFileKey_key" ON "OrderDesign"("productionFileKey");
CREATE INDEX "OrderDesign_shop_productionFileStatus_createdAt_idx"
  ON "OrderDesign"("shop", "productionFileStatus", "createdAt");

ALTER TABLE "OrderDesign"
  ADD CONSTRAINT "OrderDesign_sheetWidthMm_positive" CHECK ("sheetWidthMm" IS NULL OR "sheetWidthMm" > 0),
  ADD CONSTRAINT "OrderDesign_sheetHeightMm_positive" CHECK ("sheetHeightMm" IS NULL OR "sheetHeightMm" > 0),
  ADD CONSTRAINT "OrderDesign_artworkCount_nonnegative" CHECK ("artworkCount" IS NULL OR "artworkCount" >= 0),
  ADD CONSTRAINT "OrderDesign_productionFileAttempts_nonnegative" CHECK ("productionFileAttempts" >= 0),
  ADD CONSTRAINT "OrderDesign_productionFileByteSize_positive" CHECK ("productionFileByteSize" IS NULL OR "productionFileByteSize" > 0),
  ADD CONSTRAINT "OrderDesign_productionFileMinDpi_positive" CHECK ("productionFileMinDpi" IS NULL OR "productionFileMinDpi" > 0);
