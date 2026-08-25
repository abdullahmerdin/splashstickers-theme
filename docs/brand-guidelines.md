# Splash Stickers brand guidelines

## Source of truth

Splash Stickers is the only customer-facing brand name. These guidelines align the Codex UI/UX skills with the existing Shopify theme tokens in `snippets/splash-theme-variables.liquid`, `assets/splash-theme.css`, and the repository rules in `AGENTS.md`.

Do not create a parallel token source for this Shopify theme. New UI work must use the existing `--color-*`, `--splash-color-*`, and component-level semantic tokens.

## Brand voice

### Brand Personality

| Trait | Meaning |
| --- | --- |
| **Clear** | Uses plain language and one obvious next action. |
| **Warm** | Helpful and human without becoming casual or noisy. |
| **Practical** | States real product, order, file, and error information. |
| **Confident** | Gives direct guidance without hype or unsupported promises. |

### Core Attributes

| Attribute | Description |
| --- | --- |
| **Functional** | Every visual or sentence supports clarity, trust, accessibility, or task completion. |
| **Restrained** | Color, motion, containers, and emphasis are used only when they add meaning. |

### Prohibited

| Avoid | Reason |
| --- | --- |
| Invented sub-brands or feature nicknames | Splash Stickers is the only customer-facing brand name. |
| Slogans, hype, and generic AI filler | Copy must state concrete facts, actions, errors, and outcomes. |
| Decorative gradients, glow, neon, and busy effects | The storefront uses flat semantic surfaces and restrained hierarchy. |

Splash Stickers sounds clear, warm, practical, and confident.

- Use short, direct sentences and concrete action labels.
- Explain real state, action, error, trust, or accessibility information.
- Keep product terms plain: stickers, gangsheet, design, builder, cart, checkout, order, production file.
- Use **Gangsheet Builder** as the customer-facing product term. Use `configurator` only as an internal technical term when necessary.
- Avoid slogans, invented feature names, sub-brands, promotional filler, and generic AI language.
- Prefer “Add design”, “Save design”, “Review order”, and “Continue to checkout” over vague or inflated CTA copy.

## Visual identity

The visual system is a bright sticker-printing palette held by ink, surface, line, and focus neutrals. Use one primary action color at a time and keep secondary colors purposeful.

### Primary Colors

| Color | Hex | Usage |
| --- | --- | --- |
| Purple | `#6C5CE7` | Primary action, links, selected controls |
| Pink | `#FD79A8` | Secondary action, cart emphasis, small accent |

### Secondary Colors

| Color | Hex | Usage |
| --- | --- | --- |
| Yellow | `#FDCB6E` | Light-surface status or supporting accent |
| Teal | `#00CEC9` | Supporting status or small accent |

### Neutral

| Color | Hex | Usage |
| --- | --- | --- |
| Ink | `#2D3436` | Text and inverse surface |
| Surface | `#FFFFFF` | Light surface |
| Muted | `#636E72` | Secondary text; verify contrast in context |
| Line | `#E8E8E8` | Borders and separators |

### Semantic

| Token | Hex | Usage |
| --- | --- | --- |
| Focus | `#2D3436` | Visible keyboard focus |

| Token | Default | Use |
| --- | --- | --- |
| `--splash-color-purple` | `#6C5CE7` | Primary action, links, selected controls |
| `--splash-color-pink` | `#FD79A8` | Secondary action, cart emphasis, small accent |
| `--splash-color-yellow` | `#FDCB6E` | Light-surface status or supporting accent |
| `--splash-color-teal` | `#00CEC9` | Supporting status or small accent |
| `--splash-color-ink` | `#2D3436` | Text and inverse surface |
| `--splash-color-surface` | `#FFFFFF` | Light surface |
| `--splash-color-muted` | `#636E72` | Secondary text; verify contrast in context |
| `--splash-color-line` | `#E8E8E8` | Borders and separators |
| `--splash-color-focus` | `#2D3436` | Visible keyboard focus |

## Layout and components

- Prefer flat semantic surfaces, borders, restrained spacing, and typography hierarchy.
- Keep controls compact and proportionate. Touch targets are at least 44 × 44 px.
- Avoid unnecessary cards, pills, badges, nested panels, dividers, oversized empty states, and competing emphasis.
- Do not add decorative gradients, glows, neon, colored shadows, illuminated transitions, or oversized shadows. Existing theme tokens do not authorize adding new decorative effects.
- Keep mobile layouts free of horizontal overflow. Applicable workbenches use the shared context/history, primary task surface, and live preview model; expose side regions as accessible drawers on narrow screens.
- Preserve artwork, product media, and output-preview colors. Interface dark mode must not recolor content canvases.

## Typography and motion

### Font Stack

Use the Shopify-configured families through these semantic tokens:

The brand extractor maps `--font-heading: "var(--splash-font-display)"` and `--font-body: "var(--splash-font-body)"` to the configured families; implementation CSS must use the unquoted `var(...)` form below.

| Role | Token |
| --- | --- |
| Heading | "var(--splash-font-display)" |
| Body | "var(--splash-font-body)" |

```css
--font-heading: var(--splash-font-display);
--font-body: var(--splash-font-body);
```

- Use `--splash-font-display` and `--splash-font-body`, which inherit the Shopify heading/body font settings.
- Keep body text readable, with clear line-height and a visible hierarchy.
- Use the existing Splash transition tokens and honor `prefers-reduced-motion: reduce`.
- Never make motion the only way to communicate state.

## Accessibility and theme modes

- Preserve visible `:focus-visible` outlines using `--splash-color-focus` and `--splash-focus-width`.
- Keep contrast at WCAG AA levels, including muted, disabled, dark-mode, and focus states.
- Use semantic HTML, accessible names, keyboard support, and nearby error/status messaging.
- Support light and dark modes in every new or changed UI state. Use semantic tokens and existing `assets/dark-mode.css` behavior rather than hardcoded light-only colors.

### Style Keywords

| Direction | Keywords |
| --- | --- |
| Storefront | clean, product-led, flat, practical, friendly |
| Builder | focused, compact, precise, accessible, responsive |

### Visual Mood Descriptors

- Clear and calm
- Bright but controlled
- Tactile through spacing and borders, not decoration
- Trustworthy in cart, checkout, and production states

### Visual Don'ts

| Avoid | Why |
| --- | --- |
| Gradient hero backgrounds | They compete with product and action hierarchy. |
| Glow, neon, and illuminated transitions | They reduce restraint and can weaken contrast. |
| Busy multi-color palettes | Secondary colors should communicate state or small emphasis only. |

## Pre-delivery check

Before delivery, remove anything that does not improve clarity, trust, accessibility, or task completion. Verify naming, token usage, light/dark states, keyboard focus, reduced motion, responsive overflow, media fidelity, and concise copy.
