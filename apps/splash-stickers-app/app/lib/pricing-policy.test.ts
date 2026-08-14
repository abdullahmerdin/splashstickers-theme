import assert from "node:assert/strict";
import test from "node:test";

import { calculatePolicyPriceCents, parsePricingTiers } from "./pricing-policy";

test("length pricing selects the next maximum-length tier", () => {
  const tiers = parsePricingTiers([
    { threshold: "110", price: "2.20" },
    { threshold: "100", price: "2" },
  ], "LENGTH");

  assert.deepEqual(tiers, [
    { threshold: 100, priceCents: 200 },
    { threshold: 110, priceCents: 220 },
  ]);
  assert.equal(calculatePolicyPriceCents("LENGTH", tiers, 100), 200);
  assert.equal(calculatePolicyPriceCents("LENGTH", tiers, 105), 220);
  assert.throws(() => calculatePolicyPriceCents("LENGTH", tiers, 111), /exceeds/);
});

test("unit pricing selects the greatest minimum-quantity tier", () => {
  const tiers = parsePricingTiers([
    { threshold: 10, price: "1,50" },
    { threshold: 1, price: "2.00" },
  ], "UNIT");

  assert.equal(calculatePolicyPriceCents("UNIT", tiers, 1), 200);
  assert.equal(calculatePolicyPriceCents("UNIT", tiers, 9), 200);
  assert.equal(calculatePolicyPriceCents("UNIT", tiers, 10), 150);
});

test("pricing tiers reject duplicates and invalid money", () => {
  assert.throws(() => parsePricingTiers([
    { threshold: 100, price: "2" },
    { threshold: 100, price: "2.20" },
  ], "LENGTH"), /unique/);
  assert.throws(() => parsePricingTiers([{ threshold: 1, price: "0" }], "UNIT"), /between/);
  assert.throws(() => parsePricingTiers([{ threshold: 1.5, price: "2" }], "UNIT"), /whole/);
});
