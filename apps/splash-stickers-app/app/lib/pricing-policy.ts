export type PricingMethodValue = "AREA" | "UNIT";

export type PricingTierValue = {
  threshold: number;
  priceCents: number;
};

const MAX_TIERS = 100;
const MAX_QUANTITY = 1_000_000;
const MAX_PRICE_CENTS = 100_000_000;
export const AREA_BASE_WIDTH_MM = 600;
export const AREA_BASE_LENGTH_MM = 1000;
const AREA_BASE_SQUARE_MM = AREA_BASE_WIDTH_MM * AREA_BASE_LENGTH_MM;

export function parseUnitPricingTiers(value: unknown): PricingTierValue[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TIERS) {
    throw new Error(`Add between 1 and ${MAX_TIERS} pricing tiers.`);
  }

  const tiers = value.map((entry) => {
    if (!isRecord(entry)) throw new Error("Every pricing tier must include a threshold and price.");
    const threshold = parsePositiveInteger(entry.threshold, MAX_QUANTITY, "quantity");
    const priceCents = parseMoneyToCents(entry.price);
    return { threshold, priceCents };
  }).sort((left, right) => left.threshold - right.threshold);

  if (new Set(tiers.map((tier) => tier.threshold)).size !== tiers.length) {
    throw new Error("Each quantity threshold must be unique.");
  }
  return tiers;
}

export function parseBasePriceCents(value: unknown) {
  return parseMoneyToCents(value);
}

export function calculateAreaPriceCents(basePriceCents: number, widthMm: number, lengthMm: number): number {
  if (!Number.isSafeInteger(basePriceCents) || basePriceCents < 1) throw new Error("A positive base price is required.");
  if (!Number.isFinite(widthMm) || widthMm <= 0 || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    throw new Error("Positive sheet dimensions are required.");
  }
  const scaledPriceCents = Math.ceil(basePriceCents * widthMm * lengthMm / AREA_BASE_SQUARE_MM);
  return Math.max(basePriceCents, scaledPriceCents);
}

export function calculateUnitPriceCents(tiers: PricingTierValue[], quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("A positive quantity is required.");
  const ordered = [...tiers].sort((left, right) => left.threshold - right.threshold);
  if (!ordered.length) throw new Error("No pricing tier is configured.");
  const tier = ordered.filter((entry) => quantity >= entry.threshold).at(-1);
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
