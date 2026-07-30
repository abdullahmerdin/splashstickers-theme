# Phase 6 — Horizon cleanup and release readiness

Updated: 2026-07-30

This package closes the visible-theme cleanup after the Splash shell, catalog,
product studio and cart/content work.

## Changes

- `assets/base.css` remains the Horizon behavior foundation.
- `assets/splash-theme.css` is now the single branded stylesheet entrypoint.
- The duplicate `assets/custom.css` layer was retired after its active Splash
  section primitives were consolidated.
- Category, hero and header-version surfaces now use Splash semantic color,
  motion, radius and focus tokens instead of legacy hard-coded brand values.
- Theme metadata points to Splash Stickers documentation/support and is versioned
  as `6.0.0`.
- README and local release checks document the required preview QA.

## Validation

```powershell
npm.cmd run check:phase4
npm.cmd run check:phase5
npm.cmd run check:phase6
npm.cmd run check:configurator
git diff --check
```

If Shopify CLI is available, run Theme Check from the repository root as the
final platform validation. This workspace may not have the CLI installed.

## Release checklist

- [ ] Preview home, collection, search, product and gangsheet studio routes.
- [ ] Preview filled/empty cart, quantity, discount, note and checkout handoff.
- [ ] Preview account, localization, policy, 404 and password routes.
- [ ] Check desktop, tablet and mobile widths for overflow and layout shift.
- [ ] Check keyboard focus, contrast and reduced-motion behavior.
- [ ] Check console errors, broken links, variant pricing and cart payloads.
- [ ] Run Shopify Theme Check and record any platform-only findings.

The print-ready PDF/order production handoff remains an integration follow-up;
the configurator export action itself is still available.
