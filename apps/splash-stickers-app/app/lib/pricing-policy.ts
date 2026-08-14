export type PricingMethodValue = "LENGTH" | "UNIT";

export type PricingTierValue = {
  threshold: number;
  priceCents: number;
};

const MAX_TIERS = 100;
const MAX_LENGTH_CM = 100_000;
const MAX_QUANTITY = 1_000_000;
const MAX_PRICE_CENTS = 100_000_000;

export function parsePricingTiers(value: unknown, method: PricingMethodValue): PricingTierValue[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TIERS) {
    throw new Error(`Add between 1 and ${MAX_TIERS} pricing tiers.`);
  }

  const maxThreshold = method === "LENGTH" ? MAX_LENGTH_CM : MAX_QUANTITY;
  const label = method === "LENGTH" ? "length" : "quantity";
  const tiers = value.map((entry) => {
    if (!isRecord(entry)) throw new Error("Every pricing tier must include a threshold and price.");
    const threshold = parsePositiveInteger(entry.threshold, maxThreshold, label);
    const priceCents = parseMoneyToCents(entry.price);
    return { threshold, priceCents };
  }).sort((left, right) => left.threshold - right.threshold);

  if (new Set(tiers.map((tier) => tier.threshold)).size !== tiers.length) {
    throw new Error(`Each ${label} threshold must be unique.`);
  }
  return tiers;
}

export function calculatePolicyPriceCents(
  method: PricingMethodValue,
  tiers: PricingTierValue[],
  measurement: number,
): number {
  if (!Number.isFinite(measurement) || measurement <= 0) throw new Error("A positive measurement is required.");
  const ordered = [...tiers].sort((left, right) => left.threshold - right.threshold);
  if (!ordered.length) throw new Error("No pricing tier is configured.");

  if (method === "LENGTH") {
    const tier = ordered.find((entry) => measurement <= entry.threshold);
    if (!tier) throw new Error("The requested length exceeds the configured price range.");
    return tier.priceCents;
  }

  const tier = ordered.filter((entry) => measurement >= entry.threshold).at(-1);
  if (!tier) throw new Error("The requested quantity is below the configured price range.");
  return tier.priceCents;
}

function parseMoneyToCents(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Prices must be positive amounts with at most two decimal places.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_PRICE_CENTS) {
    throw new Error("Prices must be between 0.01 and 1,000,000.00.");
  }
  return cents;
}

function parsePositiveInteger(value: unknown, maximum: number, label: string) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label[0].toUpperCase()}${label.slice(1)} thresholds must be whole positive numbers.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
