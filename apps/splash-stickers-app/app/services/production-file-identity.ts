import { createHash } from "node:crypto";

export function productionFileIdentity(input: {
  shop: string;
  orderId: string;
  lineItemId: string;
  designDigest?: string | null;
}) {
  const keyHash = createHash("sha256")
    .update(`${input.shop}\n${input.orderId}\n${input.lineItemId}`)
    .digest("hex");
  const order = input.orderId.split("/").pop()?.replace(/[^a-z0-9-]/gi, "-") || "order";
  const line = input.lineItemId.split("/").pop()?.replace(/[^a-z0-9-]/gi, "-") || "line";
  const revision = (input.designDigest || keyHash).slice(0, 12);
  return {
    key: `production:${keyHash}`,
    filename: `splash-production-${order}-${line}-${revision}.pdf`.slice(0, 240),
  };
}

export function safeProductionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Production PDF generation failed.");
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Production PDF generation failed.";
}
