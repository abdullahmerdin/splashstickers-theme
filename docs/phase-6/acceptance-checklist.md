# Phase 6 acceptance checklist

- [x] Branded CSS is loaded through `assets/splash-theme.css`.
- [x] Duplicate `assets/custom.css` loading and file are removed.
- [x] Active Splash section primitives remain available after consolidation.
- [x] Legacy hard-coded brand colors were removed from the audited hero,
      category, header-version and attribution surfaces.
- [x] Theme metadata and release documentation identify Splash Stickers.
- [x] Local Phase 4, Phase 5, Phase 6 and configurator checks pass.
- [ ] Shopify Preview route matrix completed at 1440, 768 and 375 px.
- [ ] Shopify Theme Check completed in an environment with the CLI installed.
- [x] Paid configurator lines generate one print-ready PDF in Shopify Files.
- [x] `OrderDesign` stores sheet, artwork, file, checksum, attempt and error metadata.
- [x] Duplicate webhook delivery is idempotent and failed generation is retryable.
- [x] Shopify admin exposes the production queue, PDF, failure and workflow actions.

## 2026-08-25 release pass evidence

- [ ] Preview content route sign-off remains open: the documented matrix was exercised at 1440 × 900, 768 × 1024 and 375 × 812 on `a4511a6704c012553d651bc1b926faeec7695689` using `https://splash-stickers-d8nmeoak.myshopify.com`.
- [x] All 30 documented route/viewport attempts completed navigation. `/password` rendered the Splash Stickers password screen at all three sizes; the other 27 attempts (home, collection, search, standard product, gangsheet product, cart, about, contact and invalid route) returned Shopify’s generic “Bu web sitesi yüklenirken sorun oluştu” error page while the storefront was locked/unavailable.
- [x] Browser evidence for the reachable/blocked states: `scrollWidth === clientWidth` at 1440, 768 and 375 px for every attempt; 0 captured console error/warning entries; no theme `data-theme` state was available because the theme shell did not render.
- [ ] Layout, dark-mode, keyboard/reduced-motion, cart payload, checkout handoff and builder interaction sign-off is blocked by the preview state above; no source-code regression was changed without rendered storefront evidence.
- [x] Local validation passed: `npm.cmd run check:phase4`, `npm.cmd run check:phase5`, `npm.cmd run check:phase6`, `npm.cmd run check:storefront`, `npm.cmd run check:builder`, and `npm.cmd run check:platform` (including contract tests, production tests, typecheck, lint and app build).
- [ ] Shopify Theme Check could not be completed: `shopify theme check` timed out after 64 seconds in this environment without returning a result.
