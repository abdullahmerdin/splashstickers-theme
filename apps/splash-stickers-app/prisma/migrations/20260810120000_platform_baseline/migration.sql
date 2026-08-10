-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "productId" TEXT,
    "variantId" TEXT,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "originalName" TEXT,
    "byteSize" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignAsset_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mockup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "outputUrl" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mockup_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "authorName" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderDesign_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Design_shop_publicId_key" ON "Design"("shop", "publicId");
CREATE INDEX "Design_shop_status_updatedAt_idx" ON "Design"("shop", "status", "updatedAt");
CREATE UNIQUE INDEX "DesignAsset_designId_storageKey_key" ON "DesignAsset"("designId", "storageKey");
CREATE INDEX "DesignAsset_designId_idx" ON "DesignAsset"("designId");
CREATE INDEX "DesignAsset_shop_createdAt_idx" ON "DesignAsset"("shop", "createdAt");
CREATE UNIQUE INDEX "Mockup_shop_publicId_key" ON "Mockup"("shop", "publicId");
CREATE INDEX "Mockup_shop_status_createdAt_idx" ON "Mockup"("shop", "status", "createdAt");
CREATE INDEX "Mockup_designId_idx" ON "Mockup"("designId");
CREATE UNIQUE INDEX "Review_shop_publicId_key" ON "Review"("shop", "publicId");
CREATE INDEX "Review_shop_productId_status_createdAt_idx" ON "Review"("shop", "productId", "status", "createdAt");
CREATE UNIQUE INDEX "OrderDesign_shop_orderId_lineItemId_key" ON "OrderDesign"("shop", "orderId", "lineItemId");
CREATE INDEX "OrderDesign_designId_idx" ON "OrderDesign"("designId");
CREATE INDEX "OrderDesign_shop_status_createdAt_idx" ON "OrderDesign"("shop", "status", "createdAt");
