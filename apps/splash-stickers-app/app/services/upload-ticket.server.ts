import { createHmac, timingSafeEqual } from "node:crypto";

const TICKET_TTL_MS = 10 * 60 * 1_000;

type UploadTicket = {
  version: 1;
  shop: string;
  resourceUrl: string;
  filename: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.SHOPIFY_API_SECRET;
  if (!value) throw new Error("SHOPIFY_API_SECRET is required to sign uploads.");
  return value;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

export function createUploadTicket(input: Omit<UploadTicket, "version" | "expiresAt">) {
  const payload: UploadTicket = {
    version: 1,
    ...input,
    expiresAt: Date.now() + TICKET_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyUploadTicket(token: string, expected: Omit<UploadTicket, "version" | "expiresAt">) {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return false;

  const expectedSignature = sign(encodedPayload);
  const suppliedBytes = Buffer.from(suppliedSignature, "utf8");
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as UploadTicket;
    return payload.version === 1
      && payload.shop === expected.shop
      && payload.resourceUrl === expected.resourceUrl
      && payload.filename === expected.filename
      && Number.isFinite(payload.expiresAt)
      && payload.expiresAt >= Date.now();
  } catch {
    return false;
  }
}
