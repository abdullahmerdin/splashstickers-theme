CREATE TYPE "PricingMethod" AS ENUM ('LENGTH', 'UNIT');

CREATE TABLE "ProductPricingPolicy" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "method" "PricingMethod" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "fixedWidthMm" INTEGER NOT NULL DEFAULT 600,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProductPricingPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductPricingPolicy_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "ProductPricingPolicy_fixedWidthMm_standard" CHECK ("fixedWidthMm" = 600)
);

CREATE TABLE "PricingTier" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PricingTier_threshold_positive" CHECK ("threshold" > 0),
  CONSTRAINT "PricingTier_priceCents_positive" CHECK ("priceCents" > 0)
);

CREATE UNIQUE INDEX "ProductPricingPolicy_shop_productId_key"
  ON "ProductPricingPolicy"("shop", "productId");

CREATE UNIQUE INDEX "PricingTier_policyId_threshold_key"
  ON "PricingTier"("policyId", "threshold");

ALTER TABLE "PricingTier"
  ADD CONSTRAINT "PricingTier_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "ProductPricingPolicy"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
