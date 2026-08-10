export const MOCKUP_SCENES = ["phone", "laptop", "mailer"] as const;

export type MockupScene = typeof MOCKUP_SCENES[number];

export type MockupOptions = {
  xPct: number;
  yPct: number;
  scalePct: number;
  rotationDeg: number;
  productColor: string;
};

const DEFAULT_COLORS: Record<MockupScene, string> = {
  phone: "#f5f2ec",
  laptop: "#d9dde2",
  mailer: "#f4f1eb",
};

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function hexColor(value: unknown, fallback: string) {
  const candidate = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
}

export function normalizeMockupScene(value: unknown): MockupScene {
  return MOCKUP_SCENES.includes(value as MockupScene) ? value as MockupScene : "phone";
}

export function normalizeMockupOptions(value: unknown, sceneValue: unknown = "phone"): MockupOptions {
  const scene = normalizeMockupScene(sceneValue);
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    xPct: finiteNumber(input.xPct, 50, -25, 125),
    yPct: finiteNumber(input.yPct, 50, -25, 125),
    scalePct: finiteNumber(input.scalePct, 100, 30, 220),
    rotationDeg: finiteNumber(input.rotationDeg, 0, -180, 180),
    productColor: hexColor(input.productColor, DEFAULT_COLORS[scene]),
  };
}
