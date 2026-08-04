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
