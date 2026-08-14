ALTER TYPE "PricingMethod" RENAME VALUE 'LENGTH' TO 'AREA';

ALTER TABLE "ProductPricingPolicy"
  DROP CONSTRAINT "ProductPricingPolicy_fixedWidthMm_standard";

ALTER TABLE "ProductPricingPolicy"
  RENAME COLUMN "fixedWidthMm" TO "baseWidthMm";

ALTER TABLE "ProductPricingPolicy"
  ADD COLUMN "baseLengthMm" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "basePriceCents" INTEGER;

UPDATE "ProductPricingPolicy" AS policy
SET "basePriceCents" = COALESCE(
  (
    SELECT tier."priceCents"
    FROM "PricingTier" AS tier
    WHERE tier."policyId" = policy."id"
    ORDER BY CASE WHEN tier."threshold" = 100 THEN 0 ELSE 1 END, tier."threshold" ASC
    LIMIT 1
  ),
  200
)
WHERE policy."method" = 'AREA';

DELETE FROM "PricingTier" AS tier
USING "ProductPricingPolicy" AS policy
WHERE tier."policyId" = policy."id"
  AND policy."method" = 'AREA';

ALTER TABLE "ProductPricingPolicy"
  ADD CONSTRAINT "ProductPricingPolicy_baseWidthMm_standard" CHECK ("baseWidthMm" = 600),
  ADD CONSTRAINT "ProductPricingPolicy_baseLengthMm_standard" CHECK ("baseLengthMm" = 1000),
  ADD CONSTRAINT "ProductPricingPolicy_basePriceCents_method" CHECK (
    ("method" = 'AREA' AND "basePriceCents" IS NOT NULL AND "basePriceCents" > 0)
    OR ("method" = 'UNIT' AND "basePriceCents" IS NULL)
  );
