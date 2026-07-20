# AllTheStickers Shopify theme

## Gangsheet configurator setup

1. Create or choose the Shopify product that represents one configured gangsheet.
2. In Shopify Admin, assign the `product-gangsheet` theme template to that product.
3. Keep inventory available for the variants customers can select.
4. Configure export DPI, maximum upload size, and other defaults in the theme editor.

The configurator uses the selected Shopify variant price as the authoritative
price for one configured sheet. The quantity control represents the number of
identical sheets to order; artwork copies placed on the canvas do not multiply
the Shopify cart quantity.

Each configured line includes a public design ID, artwork count, and sheet
dimensions. The print-ready PDF remains available from the configurator's
Export PDF action.

## Local checks

Install dependencies, vendor the pinned PDF runtime, and run the configurator
checks:

```powershell
npm.cmd install
npm.cmd run vendor:jspdf
npm.cmd run check:configurator
```

The vendored `assets/jspdf.umd.min.js` file is committed so the storefront does
not depend on a third-party CDN at runtime.
