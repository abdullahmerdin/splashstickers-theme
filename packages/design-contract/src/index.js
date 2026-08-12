export const SCHEMA_VERSION = '1.0';
export const DEFAULT_PUBLIC_ID_PREFIX = 'splash_';

const LIMITS = Object.freeze({ items: 500, quantity: 999, sheetMm: 2000, string: 2048 });
const UNSAFE_KEYS = new Set([
  'file', 'files', 'blob', 'base64', 'dataurl', 'datauri', 'binary', 'bytes',
  'buffer', 'arraybuffer', 'rawdata', 'rawbytes', 'imagedata', 'artworkbytes'
]);
const ROOT_KEYS = new Set(['schemaVersion', 'id', 'shop', 'source', 'sheet', 'quantity', 'items', 'pricing', 'timestamps']);
const ITEM_KEYS = new Set(['id', 'kind', 'assetRef', 'text', 'style', 'placement']);

export class DesignManifestValidationError extends TypeError {
  constructor(errors) {
    super(`DesignManifest validation failed with ${errors.length} error(s).`);
    this.name = 'DesignManifestValidationError';
    this.errors = errors.map((error) => Object.freeze({ ...error }));
  }
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function cleanString(value, max = LIMITS.string) {
  return String(value ?? '').trim().slice(0, max);
}

function optionalString(value, max) {
  const result = cleanString(value, max);
  return result || undefined;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
}

function reportUnknownKeys(value, allowed, path, errors) {
  if (!isRecord(value)) return;
  Object.keys(value).forEach((key) => {
    const compact = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (UNSAFE_KEYS.has(compact)) addError(errors, `${path}.${key}`, 'unsafe_field', 'Raw artwork fields are not permitted.');
    else if (!allowed.has(key)) addError(errors, `${path}.${key}`, 'unknown_field', 'Field is not supported by this schema version.');
  });
}

function legacyItem(item, index) {
  const source = isRecord(item) ? item : {};
  const kind = source.text ? 'text' : 'image';
  const result = {
    id: optionalString(source.id, 128) || `item-${index + 1}`,
    kind,
    placement: {
      xMm: round(source.xMm),
      yMm: round(source.yMm),
      widthMm: round(source.widthMm),
      heightMm: round(source.heightMm),
      rotation: round(source.rotation),
      flipX: Boolean(source.flipX),
      flipY: Boolean(source.flipY),
      zIndex: Number.isInteger(source.zIndex) ? source.zIndex : index,
    },
  };
  const assetRef = optionalString(source.assetRef);
  if (assetRef) result.assetRef = assetRef;
  if (kind === 'text') {
    result.text = cleanString(source.text, 500);
    if (isRecord(source.style)) result.style = { ...source.style };
  }
  return result;
}

/** Convert the existing storefront configurator payload into canonical v1. */
export function fromConfiguratorManifest(input, context = {}) {
  const source = isRecord(input) ? input : {};
  const workspace = isRecord(source.workspace) ? source.workspace : {};
  const sourceContext = isRecord(source.source) ? source.source : {};
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    id: optionalString(source.id || source.projectId || context.id, 128),
    source: {
      productId: optionalString(sourceContext.productId || context.productId, 128),
      variantId: optionalString(sourceContext.variantId || context.variantId, 128),
    },
    sheet: {
      widthMm: round(workspace.widthMm),
      heightMm: round(workspace.heightMm),
      unit: 'mm',
      gapMm: round(source.gapMm),
      background: optionalString(source.background, 128) || '#ffffff',
    },
    quantity: Math.max(1, Math.trunc(finite(source.sheetQuantity, 1))),
    items: Array.isArray(source.items) ? source.items.map(legacyItem) : [],
  };

  const shopDomain = optionalString(context.shop || source.shop?.domain, 253);
  if (shopDomain) manifest.shop = { domain: shopDomain.toLowerCase() };
  if (!manifest.id) delete manifest.id;
  if (!manifest.source.productId) delete manifest.source.productId;
  if (!manifest.source.variantId) delete manifest.source.variantId;
  if (!Object.keys(manifest.source).length) delete manifest.source;

  const pricing = isRecord(source.pricing) ? source.pricing : context.pricing;
  if (isRecord(pricing)) {
    manifest.pricing = {
      currency: cleanString(pricing.currency || 'USD', 3).toUpperCase(),
      unitPriceCents: Math.max(0, Math.trunc(finite(pricing.unitPriceCents))),
    };
  }
  return manifest;
}

function normalizeStyle(value, errors, path) {
  if (!isRecord(value)) {
    addError(errors, path, 'invalid_type', 'style must be an object.');
    return undefined;
  }
  const allowed = new Set(['fontSizePt', 'color', 'background', 'fontWeight', 'fontStyle', 'textAlign']);
  reportUnknownKeys(value, allowed, path, errors);
  const result = {};
  if (value.fontSizePt !== undefined) result.fontSizePt = round(value.fontSizePt);
  for (const key of ['color', 'background', 'fontWeight', 'fontStyle', 'textAlign']) {
    const cleaned = optionalString(value[key], 128);
    if (cleaned) result[key] = cleaned;
  }
  return result;
}

function normalizeItem(value, index, errors) {
  const path = `$.items[${index}]`;
  if (!isRecord(value)) {
    addError(errors, path, 'invalid_type', 'Item must be an object.');
    return undefined;
  }
  reportUnknownKeys(value, ITEM_KEYS, path, errors);
  const placement = isRecord(value.placement) ? value.placement : {};
  if (!isRecord(value.placement)) addError(errors, `${path}.placement`, 'required', 'placement is required.');
  else reportUnknownKeys(placement, new Set(['xMm', 'yMm', 'widthMm', 'heightMm', 'rotation', 'flipX', 'flipY', 'zIndex']), `${path}.placement`, errors);

  const kind = value.kind === 'text' ? 'text' : value.kind === 'image' ? 'image' : undefined;
  if (!kind) addError(errors, `${path}.kind`, 'invalid_value', 'kind must be image or text.');
  const item = {
    id: cleanString(value.id, 128),
    kind: kind || 'image',
    placement: {
      xMm: round(placement.xMm),
      yMm: round(placement.yMm),
      widthMm: round(placement.widthMm),
      heightMm: round(placement.heightMm),
      rotation: round(placement.rotation),
      flipX: Boolean(placement.flipX),
      flipY: Boolean(placement.flipY),
      zIndex: Number.isInteger(placement.zIndex) ? placement.zIndex : index,
    },
  };
  if (!item.id) addError(errors, `${path}.id`, 'required', 'id is required.');
  if (!(item.placement.widthMm > 0)) addError(errors, `${path}.placement.widthMm`, 'out_of_range', 'widthMm must be positive.');
  if (!(item.placement.heightMm > 0)) addError(errors, `${path}.placement.heightMm`, 'out_of_range', 'heightMm must be positive.');

  const assetRef = optionalString(value.assetRef);
  if (assetRef) {
    if (/^(?:data|blob):/i.test(assetRef) || (assetRef.length > 256 && /^[a-z0-9+/=\s]+$/i.test(assetRef))) {
      addError(errors, `${path}.assetRef`, 'unsafe_artwork', 'assetRef cannot contain inline artwork data.');
    } else item.assetRef = assetRef;
  }
  if (item.kind === 'text') {
    item.text = cleanString(value.text, 500);
    if (!item.text) addError(errors, `${path}.text`, 'required', 'text is required for text items.');
    if (value.style !== undefined) item.style = normalizeStyle(value.style, errors, `${path}.style`);
  } else if (value.text !== undefined || value.style !== undefined) {
    addError(errors, path, 'invalid_value', 'Image items cannot contain text or text style.');
  }
  return item;
}

export function validateDesignManifest(input) {
  const errors = [];
  if (!isRecord(input)) return { valid: false, errors: [{ path: '$', code: 'invalid_type', message: 'Manifest must be an object.' }] };
  reportUnknownKeys(input, ROOT_KEYS, '$', errors);
  const sheet = isRecord(input.sheet) ? input.sheet : {};
  if (!isRecord(input.sheet)) addError(errors, '$.sheet', 'required', 'sheet is required.');
  else reportUnknownKeys(sheet, new Set(['widthMm', 'heightMm', 'unit', 'gapMm', 'background']), '$.sheet', errors);

  const manifest = {
    schemaVersion: cleanString(input.schemaVersion, 16),
    sheet: {
      widthMm: round(sheet.widthMm),
      heightMm: round(sheet.heightMm),
      unit: sheet.unit === 'mm' ? 'mm' : 'mm',
      gapMm: round(sheet.gapMm),
      background: optionalString(sheet.background, 128) || '#ffffff',
    },
    quantity: Math.trunc(finite(input.quantity)),
    items: Array.isArray(input.items) ? input.items.map((item, index) => normalizeItem(item, index, errors)).filter(Boolean) : [],
  };

  if (manifest.schemaVersion !== SCHEMA_VERSION) addError(errors, '$.schemaVersion', 'invalid_value', `schemaVersion must equal ${SCHEMA_VERSION}.`);
  if (sheet.unit !== 'mm') addError(errors, '$.sheet.unit', 'invalid_value', 'sheet.unit must equal mm.');
  if (!(manifest.sheet.widthMm > 0 && manifest.sheet.widthMm <= LIMITS.sheetMm)) addError(errors, '$.sheet.widthMm', 'out_of_range', `widthMm must be between 0 and ${LIMITS.sheetMm}.`);
  if (!(manifest.sheet.heightMm > 0 && manifest.sheet.heightMm <= LIMITS.sheetMm)) addError(errors, '$.sheet.heightMm', 'out_of_range', `heightMm must be between 0 and ${LIMITS.sheetMm}.`);
  if (!(manifest.sheet.gapMm >= 0 && manifest.sheet.gapMm <= 100)) addError(errors, '$.sheet.gapMm', 'out_of_range', 'gapMm must be between 0 and 100.');
  if (!(manifest.quantity >= 1 && manifest.quantity <= LIMITS.quantity)) addError(errors, '$.quantity', 'out_of_range', `quantity must be between 1 and ${LIMITS.quantity}.`);
  if (!Array.isArray(input.items)) addError(errors, '$.items', 'invalid_type', 'items must be an array.');
  if (!(manifest.items.length >= 1 && manifest.items.length <= LIMITS.items)) addError(errors, '$.items', 'limit_exceeded', `items must contain between 1 and ${LIMITS.items} entries.`);
  if (new Set(manifest.items.map((item) => item.id)).size !== manifest.items.length) addError(errors, '$.items', 'duplicate', 'item IDs must be unique.');
  manifest.items.forEach((item, index) => {
    const path = `$.items[${index}].placement`;
    const placement = item.placement;
    if (placement.xMm < 0) addError(errors, `${path}.xMm`, 'out_of_range', 'xMm cannot be negative.');
    if (placement.yMm < 0) addError(errors, `${path}.yMm`, 'out_of_range', 'yMm cannot be negative.');
    if (placement.rotation < -360 || placement.rotation > 360) addError(errors, `${path}.rotation`, 'out_of_range', 'rotation must be between -360 and 360 degrees.');
    const radians = placement.rotation * Math.PI / 180;
    const boundsWidth = Math.abs(placement.widthMm * Math.cos(radians)) + Math.abs(placement.heightMm * Math.sin(radians));
    const boundsHeight = Math.abs(placement.widthMm * Math.sin(radians)) + Math.abs(placement.heightMm * Math.cos(radians));
    const boundsX = placement.xMm + (placement.widthMm - boundsWidth) / 2;
    const boundsY = placement.yMm + (placement.heightMm - boundsHeight) / 2;
    if (boundsX < -0.01 || boundsX + boundsWidth > manifest.sheet.widthMm + 0.01) {
      addError(errors, path, 'outside_sheet', 'Rotated artwork must stay within the sheet width.');
    }
    if (boundsY < -0.01 || boundsY + boundsHeight > manifest.sheet.heightMm + 0.01) {
      addError(errors, path, 'outside_sheet', 'Rotated artwork must stay within the sheet height.');
    }
  });

  const id = optionalString(input.id, 128);
  if (id) manifest.id = id;
  if (input.shop !== undefined) {
    if (!isRecord(input.shop)) addError(errors, '$.shop', 'invalid_type', 'shop must be an object.');
    else {
      reportUnknownKeys(input.shop, new Set(['domain']), '$.shop', errors);
      const domain = optionalString(input.shop.domain, 253);
      if (!domain) addError(errors, '$.shop.domain', 'required', 'shop.domain is required.');
      else manifest.shop = { domain: domain.toLowerCase() };
    }
  }
  if (input.source !== undefined) {
    if (!isRecord(input.source)) addError(errors, '$.source', 'invalid_type', 'source must be an object.');
    else {
      reportUnknownKeys(input.source, new Set(['productId', 'variantId']), '$.source', errors);
      manifest.source = {};
      for (const key of ['productId', 'variantId']) {
        const value = optionalString(input.source[key], 128);
        if (value) manifest.source[key] = value;
      }
      if (!Object.keys(manifest.source).length) delete manifest.source;
    }
  }
  if (input.pricing !== undefined) {
    if (!isRecord(input.pricing)) addError(errors, '$.pricing', 'invalid_type', 'pricing must be an object.');
    else {
      reportUnknownKeys(input.pricing, new Set(['currency', 'unitPriceCents', 'totalPriceCents']), '$.pricing', errors);
      manifest.pricing = {
        currency: cleanString(input.pricing.currency, 3).toUpperCase(),
        unitPriceCents: Math.max(0, Math.trunc(finite(input.pricing.unitPriceCents))),
      };
      if (!/^[A-Z]{3}$/.test(manifest.pricing.currency)) addError(errors, '$.pricing.currency', 'invalid_format', 'currency must be a three-letter code.');
      if (input.pricing.totalPriceCents !== undefined) manifest.pricing.totalPriceCents = Math.max(0, Math.trunc(finite(input.pricing.totalPriceCents)));
    }
  }
  if (input.timestamps !== undefined) {
    if (!isRecord(input.timestamps)) addError(errors, '$.timestamps', 'invalid_type', 'timestamps must be an object.');
    else {
      reportUnknownKeys(input.timestamps, new Set(['createdAt', 'updatedAt']), '$.timestamps', errors);
      manifest.timestamps = {};
      for (const key of ['createdAt', 'updatedAt']) {
        const value = optionalString(input.timestamps[key], 64);
        if (value) manifest.timestamps[key] = value;
      }
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true, errors: [], value: manifest };
}

export function normalizeDesignManifest(input, context = {}) {
  const canonicalInput = isRecord(input) && input.schemaVersion === SCHEMA_VERSION
    ? input
    : fromConfiguratorManifest(input, context);
  const result = validateDesignManifest(canonicalInput);
  if (!result.valid) throw new DesignManifestValidationError(result.errors);
  return result.value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function createDigestPayload(input) {
  const manifest = normalizeDesignManifest(input);
  return {
    schemaVersion: manifest.schemaVersion,
    sheet: manifest.sheet,
    quantity: manifest.quantity,
    items: manifest.items,
  };
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

export async function digestDesignManifest(input) {
  return sha256Hex(canonicalJson(createDigestPayload(input)));
}

export async function createPublicId(input, options = {}) {
  const prefix = options.prefix || DEFAULT_PUBLIC_ID_PREFIX;
  const length = options.length || 24;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix)) throw new TypeError('Invalid public ID prefix.');
  if (!Number.isInteger(length) || length < 12 || length > 64) throw new RangeError('Public ID length must be 12 through 64.');
  return prefix + (await digestDesignManifest(input)).slice(0, length);
}

export async function projectCartLineProperties(input, options = {}) {
  const manifest = normalizeDesignManifest(input);
  const digest = await digestDesignManifest(manifest);
  const designId = manifest.id || await createPublicId(manifest, options);
  const prefix = options.prefix === undefined ? '_' : cleanString(options.prefix, 24);
  return {
    'Design ID': designId,
    'Artwork count': String(manifest.items.length),
    'Sheet size': `${manifest.sheet.widthMm} × ${manifest.sheet.heightMm} mm`,
    [`${prefix}design_manifest_version`]: manifest.schemaVersion,
    [`${prefix}design_digest`]: digest.slice(0, 24),
  };
}
