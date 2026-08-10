# Splash Stickers Shopify app

Embedded React Router app for durable configurator designs, mockup jobs, review
moderation and paid-order production handoff.

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

All endpoints are behind the signed `/apps/splash-stickers/` Shopify App Proxy:

- `GET /` — health and contract version.
- `POST /designs` — validate and upsert a design manifest.
- `GET /designs/:id` — restore one shop-scoped design.
- `POST /uploads/stage` and `/uploads/complete` — send artwork directly to
  Shopify Files through temporary staged-upload targets.
- `POST /mockups` and `GET /mockups/:id` — request and poll mockup work.
- `GET /mockups/:id/render` — render the current sheet as a shop-scoped SVG.
- `GET/POST /reviews` — list approved reviews or submit a pending review.

The `orders/paid` webhook links cart `Design ID` properties to production
records without persisting customer addresses or artwork bytes.
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
