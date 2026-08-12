# Splash Stickers platform architecture

Status: implementation baseline

## Decision

Splash Stickers is one source repository with two independently deployable
surfaces:

1. The Shopify theme stays at the repository root and owns storefront layout,
   native cart/checkout presentation and app-block placement.
2. The Shopify app lives in `apps/splash-stickers-app` and owns Splash
   Gangsheet Builder, durable data, asynchronous work, merchant administration
   and storefront APIs.

The app must not modify installed theme files through the Asset API. Storefront
integration is delivered through the `splash-storefront` theme app extension.

## Ownership boundaries

| Capability | Theme | App |
| --- | --- | --- |
| Gangsheet canvas and direct manipulation | Launches app block | Owns |
| Immediate review step and live preview | Does not own | Renders and persists |
| Generated production mockup | Displays | Queues, stores and publishes status |
| Customer review display/form | Hosts app block | Stores and moderates submissions |
| Cart line metadata | Writes compact public references | Resolves references for production |
| Raw artwork | Never owns | Stages directly into Shopify Files |
| Order/production handoff | Shows customer status | Associates order lines with designs |

Artwork bytes are intentionally excluded from `DesignManifest`. The contract
contains only references, dimensions, placements and non-secret metadata.

## Storefront data flow

```text
Theme app block
  -> signed app-proxy Splash Gangsheet Builder
  -> stage artwork directly into Shopify Files and wait for READY
  -> normalize + validate and persist DesignManifest
  -> create signed, unique PurchaseIntent snapshot
  -> add compact handoff + summary to native Shopify cart
  -> orders/paid verifies handoff and stores the paid line snapshot
```

All storefront API requests pass through Shopify App Proxy authentication. Every
database lookup is scoped to the authenticated shop; public IDs are not treated
as authorization credentials.

## Deployments

Theme deployment and app deployment are separate release operations:

- Run Shopify theme commands from the repository root.
- Run Shopify app commands from `apps/splash-stickers-app`.
- Host the React Router server and its production database before deploying the
  app configuration/extension with `shopify app deploy`.

The committed `shopify.app.toml` contains placeholder URLs until the project is
linked. `shopify app dev` can update development URLs automatically. Production
URLs and the app proxy destination must be set to the deployed host before a
production app release.

## Security and privacy baseline

- No API secrets, access tokens, upload bytes or customer addresses belong in
  the manifest, Liquid settings, cart properties or logs.
- Storefront SVG rendering inlines bounded artwork responses transiently so the
  browser receives a self-contained preview; those bytes are not persisted.
- The app proxy signature is verified before accepting storefront writes.
- Payload sizes, dimensions, quantity and URL schemes are validated at the
  server boundary.
- Review moderation status defaults to pending.
- Artwork uploads use Shopify staged upload targets; the app stores durable file
  IDs rather than upload bytes or temporary credentials.
- Upload completion requires a short-lived HMAC ticket bound to the signed shop,
  staged resource URL and sanitized filename.
- Shopify privacy compliance webhooks are wired; retention, support and legal
  policy language still require production review before public distribution.

## Rollout gates

1. Link the local source to the correct Shopify app and development store.
2. Replace placeholder production URLs and choose the hosted database.
3. Apply Prisma migrations and connect the high-resolution production renderer
   in the hosted environment.
4. Enable the storefront bridge app embed and add the review/mockup app blocks.
5. Complete Shopify Preview visual regression in light/dark and mobile/desktop.
6. Exercise design save/restore, mockup status, cart metadata and order handoff
   against a real development order.
