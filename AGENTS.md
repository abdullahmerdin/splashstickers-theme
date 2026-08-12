# Project delivery directive

- When the user requests a project change, publish the task's intended files directly to `origin/master` without asking for a separate push confirmation.
- Preserve unrelated working-tree changes and stage only files belonging to the requested change.
- Run the relevant validation before pushing and report the commit and push result.

## Theme implementation rules

- Every new or changed storefront UI must support both light and dark modes in the same change, including all states, cards, forms, popovers, drawers, dialogs, and responsive layouts.
- Use the semantic theme tokens (`--color-*`, `--splash-color-*`, and component-level tokens derived from them) instead of hardcoded light-only colors. Add both light and dark semantic values when a new token is necessary.
- Treat media, artwork, and output-preview canvases as content: preserve their source or user-selected colors instead of recoloring them as interface chrome.
- An optional dark-mode product hero is uploaded as product image media whose filename contains `--dark` (for example, `happy-cat--dark.webp`). Keep its light image as the first/featured product media, never assign the helper to a variant, exclude the helper from every storefront gallery/count/thumbnail/zoom list, and fall back to the light image when no helper exists.
- Keep the color-mode control accessible, honor the system preference before a visitor chooses, and persist an explicit visitor choice.

## Storefront content and visual restraint

- Prefer compact, proportionate storefront controls and previews. Do not let upload areas, helper panels, or inactive previews dominate the viewport.
- Add instructional or status copy only when it prevents confusion, communicates progress, or explains an error. Omit self-evident helper text and repeated confirmations.
- Do not use decorative gradients, glow effects, illuminated transitions, or oversized shadows. Use flat semantic surfaces, borders, spacing, and hierarchy that match the theme.
- Treat these removed phrases as negative AI-artifact examples and do not reintroduce similar filler: "No configurator needed", "Each product keeps its own placement, scale and color", "Drag the design on the product", and "Design ready. Fine-tune each selected product."

## Workbench and generative UI standard

- Apply `docs/workbench-interface-standard.md` to every builder, assistant, code, analysis, or admin workbench. Do not force ordinary storefront, cart, checkout, policy, or editorial pages into a workbench layout.
- Applicable desktop workbenches use context/history at left, the authoritative task surface and one-to-five-line expandable prompt at center, and live preview/change review at right. On narrow screens, keep the center primary and expose both sides as accessible drawers.
- Use controlled components for commerce, confirmation, errors, and other trust-critical actions. Render model-selected UI only from an allowlisted declarative schema. Sandbox open-ended previews in an iframe or worker and never execute generated markup in the parent document.
- Streaming operations must be cancellable, stable against layout shift, resumable by monotonic event ID, and expose explicit idle/running/success/error/cancelled states. Tool traces and model rationale stay collapsed by default.
- Generated changes are typed, reversible proposals with a base revision. Show accessible before/after review and require explicit apply/reject; never let generated output mutate Shopify cart, checkout, persisted designs, or production data directly.
