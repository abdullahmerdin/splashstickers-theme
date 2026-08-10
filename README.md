# Splash Stickers platform

This repository is the deployable Splash Stickers storefront theme and the
workspace root for the accompanying Shopify app. The theme deliberately remains
at the repository root so existing Shopify theme tooling and GitHub integration
continue to work without a path migration.

Platform packages:

- `apps/splash-stickers-app`: embedded React Router app, persistence and
  storefront app-proxy API.
- `apps/splash-stickers-app/extensions/splash-storefront`: theme app blocks and
  the storefront bridge embed.
- `packages/design-contract`: versioned contract shared by the configurator and
  app.
- Shopify theme directories (`assets`, `blocks`, `sections`, `templates`, and
  friends) remain at the repository root.

See [`docs/platform-architecture.md`](docs/platform-architecture.md) for system
boundaries, data flow and rollout requirements.

## Theme

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

Install all workspace dependencies from the repository root:

```powershell
npm.cmd install
```

Run the complete platform validation:

```powershell
npm.cmd run check:all
```

The existing theme checks remain independently available:

```powershell
npm.cmd run vendor:jspdf
npm.cmd run build:configurator
npm.cmd run check:phase4
npm.cmd run check:phase5
npm.cmd run check:phase6
npm.cmd run check:configurator
npm.cmd run check:storefront
```

The app must be linked to a Shopify app record before its first dev session:

```powershell
Set-Location apps/splash-stickers-app
npm.cmd run config:link
npm.cmd run dev
```

Shopify CLI replaces the placeholder client ID and development URLs while
linking/developing. Never commit API secrets or access tokens.

`assets/sticker-configurator/*.js` contains the editable source modules and is
excluded from theme uploads. The build script emits the committed
`assets/sticker-configurator.js` bundle in a fixed order with a SHA-256 source
manifest; run the build whenever a source module changes and keep the bundle's
generated header intact.

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

The print-ready PDF remains available from the studio export action. Paid order
lines are now linked to their durable app design records; automating a
high-resolution production artifact remains a deployment follow-up.
