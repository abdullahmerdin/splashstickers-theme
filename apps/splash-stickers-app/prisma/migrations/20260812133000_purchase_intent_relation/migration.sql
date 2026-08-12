PRAGMA foreign_keys=OFF;

CREATE TABLE "new_OrderDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "purchaseIntentId" TEXT,
    "orderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "designDigest" TEXT,
    "manifest" JSONB,
    "productId" TEXT,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderDesign_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderDesign_purchaseIntentId_fkey" FOREIGN KEY ("purchaseIntentId") REFERENCES "PurchaseIntent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_OrderDesign" (
    "id", "shop", "designId", "purchaseIntentId", "orderId", "lineItemId",
    "designDigest", "manifest", "productId", "variantId", "quantity",
    "unitPriceCents", "currency", "status", "createdAt", "updatedAt"
)
SELECT
    "id", "shop", "designId", "purchaseIntentId", "orderId", "lineItemId",
    "designDigest", "manifest", "productId", "variantId", "quantity",
    "unitPriceCents", "currency", "status", "createdAt", "updatedAt"
FROM "OrderDesign";

DROP TABLE "OrderDesign";
ALTER TABLE "new_OrderDesign" RENAME TO "OrderDesign";

CREATE UNIQUE INDEX "OrderDesign_shop_orderId_lineItemId_key" ON "OrderDesign"("shop", "orderId", "lineItemId");
CREATE INDEX "OrderDesign_designId_idx" ON "OrderDesign"("designId");
CREATE INDEX "OrderDesign_purchaseIntentId_idx" ON "OrderDesign"("purchaseIntentId");
CREATE INDEX "OrderDesign_shop_status_createdAt_idx" ON "OrderDesign"("shop", "status", "createdAt");

PRAGMA foreign_keys=ON;
