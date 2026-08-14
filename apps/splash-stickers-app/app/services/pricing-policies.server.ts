import type { PricingMethod } from "@prisma/client";

import db from "../db.server";
import { AREA_BASE_LENGTH_MM, AREA_BASE_WIDTH_MM, type PricingTierValue } from "../lib/pricing-policy";

export async function listPricingPolicies(shop: string) {
  return db.productPricingPolicy.findMany({
    where: { shop },
    include: { tiers: { orderBy: { threshold: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function savePricingPolicy(input: {
  shop: string;
  productId: string;
  method: PricingMethod;
  currency: string;
  basePriceCents: number | null;
  tiers: PricingTierValue[];
}) {
  return db.$transaction(async (transaction) => {
    const policy = await transaction.productPricingPolicy.upsert({
      where: { shop_productId: { shop: input.shop, productId: input.productId } },
      create: {
        shop: input.shop,
        productId: input.productId,
        method: input.method,
        currency: input.currency,
        baseWidthMm: AREA_BASE_WIDTH_MM,
        baseLengthMm: AREA_BASE_LENGTH_MM,
        basePriceCents: input.basePriceCents,
      },
      update: {
        method: input.method,
        currency: input.currency,
        baseWidthMm: AREA_BASE_WIDTH_MM,
        baseLengthMm: AREA_BASE_LENGTH_MM,
        basePriceCents: input.basePriceCents,
      },
    });

    await transaction.pricingTier.deleteMany({ where: { policyId: policy.id } });
    if (input.tiers.length) {
      await transaction.pricingTier.createMany({
        data: input.tiers.map((tier) => ({
          policyId: policy.id,
          threshold: tier.threshold,
          priceCents: tier.priceCents,
        })),
      });
    }
    return policy;
  });
}
