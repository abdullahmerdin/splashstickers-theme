import assert from "node:assert/strict";
import test from "node:test";

import { calculateAreaPriceCents, calculateUnitPriceCents, parseBasePriceCents, parseUnitPricingTiers } from "./pricing-policy";

test("area pricing keeps a 60 by 100 cm minimum and scales above it", () => {
  const basePriceCents = parseBasePriceCents("2.00");

  assert.equal(calculateAreaPriceCents(basePriceCents, 600, 500), 200);
  assert.equal(calculateAreaPriceCents(basePriceCents, 600, 1000), 200);
  assert.equal(calculateAreaPriceCents(basePriceCents, 600, 1100), 220);
  assert.equal(calculateAreaPriceCents(basePriceCents, 700, 1000), 234);
});

test("unit pricing selects the greatest minimum-quantity tier", () => {
  const tiers = parseUnitPricingTiers([
    { threshold: 10, price: "1,50" },
    { threshold: 1, price: "2.00" },
  ]);

  assert.equal(calculateUnitPriceCents(tiers, 1), 200);
  assert.equal(calculateUnitPriceCents(tiers, 9), 200);
  assert.equal(calculateUnitPriceCents(tiers, 10), 150);
});

test("pricing tiers reject duplicates and invalid money", () => {
  assert.throws(() => parseUnitPricingTiers([
    { threshold: 10, price: "2" },
    { threshold: 10, price: "2.20" },
  ]), /unique/);
  assert.throws(() => parseUnitPricingTiers([{ threshold: 1, price: "0" }]), /between/);
  assert.throws(() => parseUnitPricingTiers([{ threshold: 1.5, price: "2" }]), /whole/);
  assert.throws(() => calculateAreaPriceCents(200, 0, 1000), /dimensions/);
});
