# Item 22: Extract markup format conversion helpers

## Problem

In `src/huly/client.ts`, the `createMarkupOps` function contained three `switch(format)` blocks with duplicated markup conversion logic:

1. `fetchMarkup` -- converts internal markup to the requested output format (markup/html/markdown)
2. `uploadMarkup` -- converts input format to internal markup before calling `collaborator.createMarkup`
3. `updateMarkup` -- identical conversion to `uploadMarkup`, before calling `collaborator.updateMarkup`

Cases 2 and 3 were fully identical switch blocks. Case 1 was the inverse direction.

## Solution

Extracted two helper functions at module scope in `src/huly/client.ts`:

- `toInternalMarkup(value, format, opts)` -- converts from external format (markup/html/markdown) to internal Huly markup string. Replaces the duplicated switch in `uploadMarkup` and `updateMarkup`.
- `fromInternalMarkup(markup, format, opts)` -- converts from internal markup to the requested external format. Replaces the switch in `fetchMarkup`.

Both accept a `MarkupConvertOptions` object (`{ refUrl, imageUrl }`) needed for markdown conversion.

The three method bodies in `createMarkupOps` are now one-liners delegating to these helpers.

## Files changed

- `src/huly/client.ts`

## Verification

`pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- all pass (0 errors, 755 tests).
