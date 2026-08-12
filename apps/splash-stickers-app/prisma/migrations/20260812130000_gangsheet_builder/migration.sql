CREATE TABLE "PurchaseIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "designDigest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseIntent_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseIntent_shop_publicId_key" ON "PurchaseIntent"("shop", "publicId");
CREATE INDEX "PurchaseIntent_shop_status_expiresAt_idx" ON "PurchaseIntent"("shop", "status", "expiresAt");
CREATE INDEX "PurchaseIntent_designId_idx" ON "PurchaseIntent"("designId");

ALTER TABLE "OrderDesign" ADD COLUMN "purchaseIntentId" TEXT;
ALTER TABLE "OrderDesign" ADD COLUMN "designDigest" TEXT;
ALTER TABLE "OrderDesign" ADD COLUMN "manifest" JSONB;
ALTER TABLE "OrderDesign" ADD COLUMN "productId" TEXT;
ALTER TABLE "OrderDesign" ADD COLUMN "variantId" TEXT;
ALTER TABLE "OrderDesign" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OrderDesign" ADD COLUMN "unitPriceCents" INTEGER;
ALTER TABLE "OrderDesign" ADD COLUMN "currency" TEXT;
CREATE INDEX "OrderDesign_purchaseIntentId_idx" ON "OrderDesign"("purchaseIntentId");
