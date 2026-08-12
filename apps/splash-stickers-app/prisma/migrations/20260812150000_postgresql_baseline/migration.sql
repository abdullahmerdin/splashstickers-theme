-- Fresh PostgreSQL baseline for the Supabase-backed app.
-- The earlier migrations were SQLite-only and are intentionally replaced
-- because this database has not been deployed to production yet.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "DesignStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');
CREATE TYPE "MockupStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ProductionStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'FULFILLED', 'CANCELLED');
CREATE TYPE "PurchaseIntentStatus" AS ENUM ('OPEN', 'ORDERED', 'EXPIRED', 'REJECTED');

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "status" "DesignStatus" NOT NULL DEFAULT 'DRAFT',
    "productId" TEXT,
    "variantId" TEXT,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "originalName" TEXT,
    "byteSize" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mockup" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "scene" TEXT NOT NULL DEFAULT 'phone',
    "options" JSONB,
    "status" "MockupStatus" NOT NULL DEFAULT 'QUEUED',
    "outputUrl" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Mockup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseIntent" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "designDigest" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PurchaseIntentStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "authorName" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderDesign" (
    "id" TEXT NOT NULL,
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
    "status" "ProductionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderDesign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Design_shop_status_updatedAt_idx" ON "Design"("shop", "status", "updatedAt");
CREATE UNIQUE INDEX "Design_shop_publicId_key" ON "Design"("shop", "publicId");
CREATE INDEX "DesignAsset_designId_idx" ON "DesignAsset"("designId");
CREATE INDEX "DesignAsset_shop_createdAt_idx" ON "DesignAsset"("shop", "createdAt");
CREATE UNIQUE INDEX "DesignAsset_designId_storageKey_key" ON "DesignAsset"("designId", "storageKey");
CREATE INDEX "Mockup_shop_status_createdAt_idx" ON "Mockup"("shop", "status", "createdAt");
CREATE INDEX "Mockup_designId_idx" ON "Mockup"("designId");
CREATE INDEX "Mockup_designId_scene_createdAt_idx" ON "Mockup"("designId", "scene", "createdAt");
CREATE UNIQUE INDEX "Mockup_shop_publicId_key" ON "Mockup"("shop", "publicId");
CREATE INDEX "PurchaseIntent_shop_status_expiresAt_idx" ON "PurchaseIntent"("shop", "status", "expiresAt");
CREATE INDEX "PurchaseIntent_designId_idx" ON "PurchaseIntent"("designId");
CREATE UNIQUE INDEX "PurchaseIntent_shop_publicId_key" ON "PurchaseIntent"("shop", "publicId");
CREATE INDEX "Review_shop_productId_status_createdAt_idx" ON "Review"("shop", "productId", "status", "createdAt");
CREATE UNIQUE INDEX "Review_shop_publicId_key" ON "Review"("shop", "publicId");
CREATE INDEX "OrderDesign_designId_idx" ON "OrderDesign"("designId");
CREATE INDEX "OrderDesign_purchaseIntentId_idx" ON "OrderDesign"("purchaseIntentId");
CREATE INDEX "OrderDesign_shop_status_createdAt_idx" ON "OrderDesign"("shop", "status", "createdAt");
CREATE UNIQUE INDEX "OrderDesign_shop_orderId_lineItemId_key" ON "OrderDesign"("shop", "orderId", "lineItemId");

ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mockup" ADD CONSTRAINT "Mockup_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseIntent" ADD CONSTRAINT "PurchaseIntent_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderDesign" ADD CONSTRAINT "OrderDesign_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderDesign" ADD CONSTRAINT "OrderDesign_purchaseIntentId_fkey"
  FOREIGN KEY ("purchaseIntentId") REFERENCES "PurchaseIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
