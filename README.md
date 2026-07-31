# Splash Stickers Shopify theme

The theme preserves Horizon's Shopify behavior layer while exposing a namespaced
Splash design system for the storefront shell, catalog, product studio, cart and
content surfaces. `assets/base.css` remains the behavior foundation; branded
overrides are loaded from `assets/splash-theme.css`.

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
npm.cmd run build:configurator
npm.cmd run check:phase4
npm.cmd run check:phase5
npm.cmd run check:phase6
npm.cmd run check:configurator
npm.cmd run check:storefront
```

The vendored `assets/jspdf.umd.min.js` file is committed so the storefront does
not depend on a third-party CDN at runtime.

## Storefront conversion features

The home page uses editable Shopify sections for the three-step ordering flow
and the custom-design call to action. Optional category links render only when
they have a real destination; their text and links can be managed in the theme
editor and translated per market with Shopify's locale tooling.

The gangsheet configurator includes a first-visit quick start and a print-size
resolution check. Configurator analytics are opt-in. When enabled in the section
settings, events are pushed only when the storefront already provides a
`window.dataLayer` consumer:

- `configurator_view`
- `configurator_upload_open`
- `configurator_upload_select`
- `configurator_design_start`
- `configurator_export`
- `configurator_add_to_cart`
- `configurator_abandon`

No file name or artwork contents are included in these events, and the theme
does not create a new data layer when no consumer is present.

## Release readiness

Before publishing a theme preview, check the home, collection, search, product,
gangsheet studio, cart, account, policy, 404 and password routes at desktop,
tablet and mobile widths. Confirm keyboard focus, reduced motion, empty/error
states, variant pricing and cart payload behavior. Shopify Theme Check should be
run from an environment with the Shopify CLI installed.

The print-ready PDF remains available from the studio export action. Delivering
that sheet into the order/production handoff is a separate integration follow-up.
