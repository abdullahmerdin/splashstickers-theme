import type { PricingMethod } from "@prisma/client";

import db from "../db.server";
import type { PricingTierValue } from "../lib/pricing-policy";

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
        fixedWidthMm: 600,
      },
      update: {
        method: input.method,
        currency: input.currency,
        fixedWidthMm: 600,
      },
    });

    await transaction.pricingTier.deleteMany({ where: { policyId: policy.id } });
    await transaction.pricingTier.createMany({
      data: input.tiers.map((tier) => ({
        policyId: policy.id,
        threshold: tier.threshold,
        priceCents: tier.priceCents,
      })),
    });
    return policy;
  });
}
