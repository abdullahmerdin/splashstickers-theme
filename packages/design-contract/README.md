# Splash Stickers DesignManifest contract

This dependency-free ESM package is the versioned handoff between the Shopify
theme configurator and the backend app. It accepts the current theme manifest,
normalizes it to schema `1.0`, validates untrusted input, creates deterministic
SHA-256 IDs/digests and projects compact cart line properties.

The contract carries geometry, text artwork and durable artwork references. It
explicitly rejects raw files, blobs, buffers, base64 and `data:`/`blob:` URLs.
Image upload bytes must travel through a separate signed object-storage flow.

```js
import {
  normalizeDesignManifest,
  digestDesignManifest,
  projectCartLineProperties,
} from '@splash-stickers/design-contract';

const manifest = normalizeDesignManifest(themeManifest, {
  productId: '123',
  variantId: '456',
});
```

Identity, shop, price and timestamps are excluded from digest input. A public
design ID is a lookup reference, never an authorization secret. The backend must
scope every lookup to the authenticated Shopify shop and recalculate price.
