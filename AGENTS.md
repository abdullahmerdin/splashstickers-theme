# Project delivery directive

- When the user requests a project change, publish the task's intended files directly to `origin/master` without asking for a separate push confirmation.
- Preserve unrelated working-tree changes and stage only files belonging to the requested change.
- Run the relevant validation before pushing and report the commit and push result.

## Codex and Notion work tracking

- Use the Splash Stickers Notion workspace as the operational system of record for Codex work.
- At the start of every actionable Splash Stickers request, create or update its record in the Notion `Görevler` database before implementation. Do not create duplicate records for the same scope.
- If the request has multiple deliverables, phases, or independently trackable workstreams, create a record in the Notion `Projeler` database and link its implementation tasks to that project.
- Keep the Notion task status aligned with reality while working: use `Yapılıyor`, `Beklemede`, `Bloke`, or `Review` as appropriate.
- Mark a task `Tamamlandı` only after the requested outcome is complete and the relevant validation has succeeded. Planning, partial implementation, or a commit alone is not completion.
- Add the final result and relevant evidence, commit, release, or output link to the task before closing it.
- Pure questions, explanations, status requests, and read-only reviews do not require a task unless they produce an actionable follow-up.

## AI clutter and output restraint

- Apply this standard to every generated artifact, including storefronts, workbenches, admin UI, Notion pages, documentation, and customer-facing copy.
- Prefer calm, compact, functional output with one clear hierarchy. The primary task or information must be obvious without scanning decorative layers.
- Remove copy that does not enable an action, communicate real state or data, prevent an error, establish necessary trust, or support accessibility. Do not repeat the heading, confirmation, or surrounding UI in helper text.
- Do not invent feature names, section nicknames, sub-brands, slogans, eyebrow text, or branded process labels. Use the established `Splash Stickers` name, plain product terms, and direct functional labels.
- Do not add decorative gradients, glows, colored shadows, neon treatments, illuminated transitions, or a busy multi-color palette. Prefer flat semantic surfaces, restrained color, borders, spacing, and typography.
- Avoid unnecessary cards, pills, badges, callouts, icons, nested panels, headings, dividers, oversized empty states, and competing emphasis. Every container or accent must have a clear information-architecture purpose.
- Avoid verbose, promotional, self-congratulatory, or generic AI-sounding language. State concrete facts, actions, errors, and outcomes in the shortest clear form.
- Preserve visual or textual elements required for content fidelity, status, hierarchy, validation, trust, and accessibility; restraint must not hide useful information or controls.
- Before finalizing, run a clutter pass: if removing an element does not reduce clarity, trust, accessibility, or task completion, remove it.

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
