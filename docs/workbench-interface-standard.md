# Workbench interface standard

Status: normative for new and changed builder, assistant, analysis, code and merchant workbench UI.

This standard is conditional. Product pages, collections, cart, checkout, policy and editorial routes keep their task-appropriate storefront layout. A workbench is a surface where a person manages context, performs a primary task and reviews generated or computed output.

## Layout

- Desktop has three regions: scoped context/history and assets at left, the authoritative task surface plus prompt at center, and live preview/change review at right.
- The center remains primary. Below 60rem, side regions become labelled drawers with Escape, backdrop and focus-return behavior. Do not squeeze three columns onto a narrow viewport.
- The prompt starts at one line and grows with content to no more than five lines. Long content scrolls inside the control.
- Controls remain compact. Empty upload targets, inactive previews and persistent instructions must not dominate the viewport.

## Generative UI trust levels

| Level | Allowed output | Boundary | Use |
| --- | --- | --- | --- |
| Controlled | Existing application components and events | Normal component tree | Commerce, confirmations, errors, status and permissions |
| Declarative | JSON that validates against an allowlisted component/command schema | Schema validator plus component registry | Analysis panels, reports, forms and proposed design changes |
| Open-ended | Arbitrary preview code or UI | Sandboxed iframe or worker without parent DOM, secrets or commerce authority | Live web previews and disposable prototypes |

Generated output cannot directly change cart, checkout, persisted designs, orders, permissions or production state. It proposes a typed operation; application validation and an explicit user action apply it.

## Streaming and state

- Streaming uses SSE where infrastructure permits, with fetch-stream fallback only when documented. Every event carries `operationId`, `requestId`, monotonic `seq`, `phase` and a terminal outcome.
- Operations support AbortController cancellation and a visible Stop action while running. Reconnect resumes from the last event ID and rejects duplicate or stale events.
- Reserve output space or use stable scroll anchoring so token and progress updates do not shift the whole page. Do not auto-scroll a reader who has moved away from the live edge.
- Required states are `idle`, `running`, `success`, `error`, `cancelled`, `conflict` and `offline`. Status is exposed through a concise `aria-live` region.
- Tool calls, traces and model rationale are collapsed by default. Surface decisions, warnings and actionable errors; omit performative progress prose.

## Context and conversation

- Show context use as a bounded meter. Pinning keeps explicitly selected messages/assets in context; it does not grant extra authority.
- Context snapshots are allowlisted and versioned. They may contain IDs, dimensions, selection, locale, capabilities and durable asset references. They must not contain raw artwork bytes, tokens, secrets, customer addresses or an unbounded transcript.
- Critical messages support pin/unpin. Editable user messages can create a new branch; the prior branch remains immutable and addressable.

## Change review and code

- Proposals include `baseRevision`, `clientMutationId`, author, typed forward operations and inverse operations. Stale writes return a conflict instead of overwriting newer state.
- Diff views distinguish additions and removals with semantic colors plus signs/text, never color alone. Allow individual selection and bulk Apply/Reject. Applied changes enter normal undo history.
- Code blocks use Shiki or Prism, line numbers, a copy control with confirmation and an IDE handoff when the host supports it. Generated code previews follow the same sandbox rule as open-ended UI.

## Visual and accessibility baseline

- Every state supports semantic light and dark tokens, keyboard operation, reduced motion and at least 44px touch targets on touch layouts.
- Artwork, media and output canvases are content. Never recolor them to match interface chrome.
- Use flat surfaces, borders, spacing and one restrained focus/selection ring. No decorative gradients, glows, illuminated transitions or oversized shadows.
- Copy exists to prevent confusion, show real progress or explain recovery. Avoid repeated instructions, celebratory confirmations and assistant-like filler.

## Shopify boundary

- Product/variant/price facts used for purchase are resolved server-side from Shopify. Browser query parameters and hidden inputs are requests, not authority.
- A design is uploaded and durably saved before a signed, unique purchase handoff is created. Only then may a controlled action add the Shopify line.
- Shopify line quantity is the production quantity authority. Paid-order ingestion stores an immutable manifest/digest/variant/price snapshot and is idempotent.
- Theme integration is delivered through app blocks/embeds and compact line properties. App runtime does not write installed theme assets or embed builder logic in a theme section.
