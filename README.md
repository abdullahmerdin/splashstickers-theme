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
- `packages/design-contract`: versioned contract shared by Splash Gangsheet
  Builder and the production handoff.
- Shopify theme directories (`assets`, `blocks`, `sections`, `templates`, and
  friends) remain at the repository root.

See [`docs/platform-architecture.md`](docs/platform-architecture.md) for system
boundaries, data flow and rollout requirements.

## Theme

The theme preserves Horizon's Shopify behavior layer while exposing a namespaced
Splash design system for the storefront shell, catalog, product studio, cart and
content surfaces. `assets/base.css` remains the behavior foundation; branded
overrides are loaded from `assets/splash-theme.css`.

## Splash Gangsheet Builder setup

1. Link and deploy `apps/splash-stickers-app`, including its Prisma migrations
   and `splash-storefront` theme app extension.
2. Create or choose the Shopify product that represents a gangsheet and keep
   the customer-facing variants available.
3. Add the **Gangsheet builder** app block to the product template, or assign
   the repository's `product-gangsheet` template.
4. Select the gangsheet product in the app block when the block is not rendered
   inside that same product.

The app-proxy builder resolves product, availability and price from Shopify. It
uploads artwork to Shopify Files, waits for processing, saves the canonical
design and creates a signed purchase handoff before changing Shopify cart.
Shopify line quantity is the production quantity authority.

The theme contains only the embedded app frame and compact cart summary. Builder
runtime, editor state and purchase orchestration remain app-owned rather than
theme assets.

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
npm.cmd run check:phase4
npm.cmd run check:phase5
npm.cmd run check:phase6
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

The shared three-panel, GenUI, streaming, context and diff rules for applicable
workbench surfaces are defined in `docs/workbench-interface-standard.md`.

## Storefront conversion features

The home page uses editable Shopify sections for the three-step ordering flow
and the custom-design call to action. Optional category links render only when
they have a real destination; their text and links can be managed in the theme
editor and translated per market with Shopify's locale tooling.

Splash Gangsheet Builder keeps instructions contextual: file constraints,
upload/save progress, validation warnings and recoverable errors. It does not
publish artwork names or bytes to analytics.

## Release readiness

Before publishing a theme preview, check the home, collection, search, product,
gangsheet builder, cart, account, policy, 404 and password routes at desktop,
tablet and mobile widths. Confirm keyboard focus, reduced motion, empty/error
states, variant pricing and cart payload behavior. Shopify Theme Check should be
run from an environment with the Shopify CLI installed.

Paid order lines are linked to an immutable app snapshot. Automating a
high-resolution production artifact remains a deployment follow-up.
