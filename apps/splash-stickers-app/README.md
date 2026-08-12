# Splash Gangsheet Builder Shopify app

React Router Shopify app for the app-proxy Gangsheet Builder, durable artwork
and design state, signed cart handoff, mockup jobs, review moderation and
paid-order production snapshots.

## Local development

Install dependencies from the repository root, then link this directory to the
correct Shopify app record:

```powershell
npm.cmd install
Set-Location apps/splash-stickers-app
npm.cmd run config:link
npm.cmd run dev
```

Shopify CLI replaces the placeholder client ID and development URLs. Copy
`.env.example` to `.env` only when your hosting/development flow needs explicit
environment values; never commit API secrets.

## Storefront endpoints

All endpoints are behind the signed `/apps/splash-stickers/` Shopify App Proxy.
The customer builder is `GET /builder?variant=...`; its durable purchase flow
uses `/uploads/stage`, `/uploads/complete`, `/uploads/status`, `/designs` and
`/purchase-intents` before it changes Shopify cart.

Other endpoints:

- `GET /` — health and contract version.
- `POST /designs` — validate and upsert a design manifest.
- `GET /designs/:id` — restore one shop-scoped design.
- `POST /uploads/stage` and `/uploads/complete` — send artwork directly to
  Shopify Files through temporary staged-upload targets.
- `POST /mockups` and `GET /mockups/:id` — request and poll mockup work.
- `GET /mockups/:id/render` — render the current sheet as a shop-scoped SVG.
- `GET/POST /reviews` — list approved reviews or submit a pending review.

The `orders/paid` webhook verifies the signed handoff and snapshots the paid
line's manifest, digest, product, variant, price and quantity without storing
customer addresses or artwork bytes.
Shopify privacy compliance topics share a signed webhook endpoint; `shop/redact`
removes all tenant records.

## Validation

From the repository root:

```powershell
npm.cmd run check:platform
shopify app build --path apps/splash-stickers-app
```

SQLite is for local development. Select a hosted production database and a
high-resolution renderer for production output before deployment. Storefront
mockups are rendered as SVG and artwork storage uses Shopify Files. Run
`prisma migrate deploy` in the host release step.

Build the container from the repository root so npm can resolve the shared
workspace package:

```powershell
docker build -f apps/splash-stickers-app/Dockerfile -t splash-stickers-app .
```
