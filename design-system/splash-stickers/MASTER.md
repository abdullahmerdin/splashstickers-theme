# Splash Stickers design system

## Purpose

The shared design system for the Splash Stickers Shopify storefront and Gangsheet Builder. It complements the theme implementation; the Shopify Liquid tokens remain the implementation source of truth.

## Brand rules

- Customer-facing name: **Splash Stickers**.
- Product term: **Gangsheet Builder**. Do not invent sub-brands, feature nicknames, slogans, or decorative process labels.
- Copy is concise, direct, warm, and factual. Remove generic AI filler and repeated helper text.
- Prefer calm hierarchy, flat semantic surfaces, borders, spacing, and typography over decorative layers.

## Token layers

Use three layers when adding a component token:

1. Primitive values come from the existing `--splash-color-*`, spacing, radius, focus, font, transition, and shadow tokens.
2. Semantic aliases describe purpose, such as `--color-background`, `--color-foreground`, `--color-border`, `--color-primary`, and `--color-focus`.
3. Component tokens describe the local control or surface, and must reference semantic aliases rather than raw hex values.

### Core semantic mapping

| Purpose | Theme token |
| --- | --- |
| Primary action | `--splash-color-purple` |
| Secondary accent | `--splash-color-pink` |
| Supporting light accent | `--splash-color-yellow` |
| Supporting teal accent | `--splash-color-teal` |
| Text | `--splash-color-ink` |
| Surface | `--splash-color-surface` |
| Muted text | `--splash-color-muted` |
| Border | `--splash-color-line` |
| Focus | `--splash-color-focus` with `--splash-focus-width` |
| Display type | `--splash-font-display` |
| Body type | `--splash-font-body` |

## Component defaults

| Component | Default | Required states |
| --- | --- | --- |
| Primary button | Purple surface, white text, compact control radius | Hover, active, disabled, loading, focus-visible, dark mode |
| Secondary button | Transparent or surface background with semantic border | Hover, active, disabled, focus-visible, dark mode |
| Card | Surface, line border, restrained radius | Hover only when actionable, focus-within, dark mode |
| Form field | Semantic surface, visible label, line border | Focus, invalid, disabled, success, dark mode |
| Drawer/dialog | Semantic surface, controlled focus, explicit close | Opening, closing, error, dark mode, reduced motion |
| Status | Text and icon/shape plus color, never color alone | Loading, success, error, cancelled, dark mode |

## Responsive and accessibility rules

- Start mobile-first and keep every layout within the viewport.
- Use at least 44 × 44 px touch targets and visible keyboard focus.
- Keep body text readable and maintain WCAG AA contrast for normal text and controls.
- Preserve artwork and preview canvases as content; do not recolor them for dark mode.
- Honor `prefers-reduced-motion: reduce` and reserve space for async content to reduce layout shift.
- For applicable workbenches, keep the primary task surface central and expose context/history and preview/order as accessible drawers on narrow screens.

## Restraint rules

Do not introduce decorative gradients, glows, neon, colored shadows, illuminated transitions, oversized empty states, unnecessary pills/badges, or extra panels. Existing legacy tokens are not a reason to add new decorative effects.

## Implementation references

- Brand voice and palette: `docs/brand-guidelines.md`
- Repository constraints: `AGENTS.md`
- Theme primitives: `snippets/splash-theme-variables.liquid`
- Theme implementation: `assets/splash-theme.css`
- Dark-mode implementation: `assets/dark-mode.css`
