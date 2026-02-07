# Code Smell Fixes Report

## Item 55: Remove `makeJsonSchema` wrapper

**Problem**: `makeJsonSchema` in `src/domain/schemas/shared.ts` was a transparent pass-through of `JSONSchema.make` from Effect, adding no value.

**Changes**:
- Removed the `makeJsonSchema` function definition from `src/domain/schemas/shared.ts`
- Removed re-export from `src/domain/schemas/index.ts`
- Updated 15 schema files to import `JSONSchema` from `"effect"` and call `JSONSchema.make` directly:
  - `src/domain/schemas/shared.ts` (1 call site)
  - `src/domain/schemas/activity.ts` (8 call sites)
  - `src/domain/schemas/attachments.ts` (9 call sites)
  - `src/domain/schemas/calendar.ts` (8 call sites)
  - `src/domain/schemas/channels.ts` (12 call sites)
  - `src/domain/schemas/comments.ts` (4 call sites)
  - `src/domain/schemas/contacts.ts` (8 call sites)
  - `src/domain/schemas/documents.ts` (6 call sites)
  - `src/domain/schemas/issues.ts` (18 call sites)
  - `src/domain/schemas/milestones.ts` (6 call sites)
  - `src/domain/schemas/notifications.ts` (10 call sites)
  - `src/domain/schemas/projects.ts` (1 call site)
  - `src/domain/schemas/search.ts` (1 call site)
  - `src/domain/schemas/storage.ts` (1 call site)
  - `src/domain/schemas/workspace.ts` (7 call sites)
- Updated test file `test/domain/schemas.test.ts` to use `JSONSchema.make` directly
- Fixed 3 dprint lint errors where shorter imports needed single-line formatting

## Item 66: Remove `TOOL_DEFINITIONS` redundant `as` cast

**Problem**: `TOOL_DEFINITIONS` in `src/mcp/tools/index.ts` had `as Record<string, RegisteredTool>` cast, but `Object.fromEntries(ReadonlyMap<string, RegisteredTool>)` already returns `{ [k: string]: RegisteredTool }`, making the cast redundant.

**Changes**:
- Removed `as Record<string, RegisteredTool>` from line 81 of `src/mcp/tools/index.ts`

## Verification

All checks pass:
- `pnpm build` -- success
- `pnpm typecheck` -- success
- `pnpm lint` -- 0 errors (127 pre-existing warnings unchanged)
- `pnpm test` -- 755 tests passed across 24 test files
