# Item 16: Extract clampLimit helper

## What changed

Extracted the repeated `Math.min(params.limit ?? 50, 200)` pattern into a `clampLimit` helper function.

### Helper (in `src/huly/operations/shared.ts`)

```typescript
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const clampLimit = (limit?: number): number => Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)
```

### Files modified (14 operation files + shared.ts)

All 31 occurrences replaced across:

- `src/huly/operations/shared.ts` -- helper definition
- `src/huly/operations/workspace.ts` -- 2 occurrences
- `src/huly/operations/time.ts` -- 2 occurrences
- `src/huly/operations/projects.ts` -- 1 occurrence
- `src/huly/operations/issues.ts` -- 3 occurrences
- `src/huly/operations/contacts.ts` -- 3 occurrences
- `src/huly/operations/comments.ts` -- 1 occurrence
- `src/huly/operations/calendar.ts` -- 3 occurrences
- `src/huly/operations/milestones.ts` -- 1 occurrence
- `src/huly/operations/documents.ts` -- 2 occurrences
- `src/huly/operations/activity.ts` -- 4 occurrences
- `src/huly/operations/notifications.ts` -- 3 occurrences
- `src/huly/operations/search.ts` -- 1 occurrence
- `src/huly/operations/channels.ts` -- 4 occurrences
- `src/huly/operations/attachments.ts` -- 1 occurrence

## Verification

- `pnpm build` -- pass
- `pnpm typecheck` -- pass
- `pnpm lint` -- 0 errors (127 pre-existing warnings)
- `pnpm test` -- 755 tests pass
- `grep` confirms 0 remaining `Math.min(.*limit.*200)` in src/
