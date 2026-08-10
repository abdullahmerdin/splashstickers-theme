export type SchemaVersion = '1.0';
export type DesignItem = {
  id: string;
  kind: 'image' | 'text';
  assetRef?: string;
  text?: string;
  style?: { fontSizePt?: number; color?: string; background?: string; fontWeight?: string; fontStyle?: string; textAlign?: string };
  placement: { xMm: number; yMm: number; widthMm: number; heightMm: number; rotation: number; flipX: boolean; flipY: boolean; zIndex: number };
};
export type DesignManifest = {
  schemaVersion: SchemaVersion;
  id?: string;
  shop?: { domain: string };
  source?: { productId?: string; variantId?: string };
  sheet: { widthMm: number; heightMm: number; unit: 'mm'; gapMm: number; background: string };
  quantity: number;
  items: DesignItem[];
  pricing?: { currency: string; unitPriceCents: number; totalPriceCents?: number };
  timestamps?: { createdAt?: string; updatedAt?: string };
};
export type ValidationError = { path: string; code: string; message: string };
export declare const SCHEMA_VERSION: SchemaVersion;
export declare const DEFAULT_PUBLIC_ID_PREFIX: string;
export declare class DesignManifestValidationError extends TypeError { errors: ValidationError[] }
export declare function fromConfiguratorManifest(input: unknown, context?: Record<string, unknown>): DesignManifest;
export declare function validateDesignManifest(input: unknown): { valid: false; errors: ValidationError[] } | { valid: true; errors: []; value: DesignManifest };
export declare function normalizeDesignManifest(input: unknown, context?: Record<string, unknown>): DesignManifest;
export declare function canonicalJson(value: unknown): string;
export declare function createDigestPayload(input: unknown): Pick<DesignManifest, 'schemaVersion' | 'sheet' | 'quantity' | 'items'>;
export declare function sha256Hex(text: string): Promise<string>;
export declare function digestDesignManifest(input: unknown): Promise<string>;
export declare function createPublicId(input: unknown, options?: { prefix?: string; length?: number }): Promise<string>;
export declare function projectCartLineProperties(input: unknown, options?: { prefix?: string; length?: number }): Promise<Record<string, string>>;
