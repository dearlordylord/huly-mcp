# Dead Code Removal Report

## Item 30: `addSubstringSearch` -- removed

**Decision: remove.**

`addSubstringSearch` was exported from `src/huly/operations/query-helpers.ts` but never called. Five call sites (issues.ts, documents.ts, channels.ts x2, contacts.ts) perform the exact same substring search pattern manually using `escapeLikeWildcards` + `$like` + `%` wrapping. However, all call sites use mutable query mutation on `Record<string, unknown>` objects, while `addSubstringSearch` uses an immutable spread pattern with `DocumentQuery<T>` generics. Refactoring all call sites to use `addSubstringSearch` would require type changes at each site for marginal benefit -- the real abstraction (`escapeLikeWildcards`) is already factored out and well-used. Removed the function and cleaned up the now-unused `DocumentQuery` import.

**Files changed:**
- `src/huly/operations/query-helpers.ts` -- removed `addSubstringSearch` function and unused `DocumentQuery` import

## Item 32: `PersonRefSchema` / `PersonRef` -- removed from barrel export

**Decision: remove from barrel, keep internal definition.**

`PersonRefSchema` and `PersonRef` were exported from the `src/domain/schemas/index.ts` barrel but only imported externally by the test file `test/domain/schemas.test.ts`. The schema is used internally within `src/domain/schemas/issues.ts` (as part of `IssueSchema.assigneeRef`). Removed the barrel re-export and updated the test to import directly from the source module.

**Files changed:**
- `src/domain/schemas/index.ts` -- removed `PersonRef` and `PersonRefSchema` from barrel exports
- `test/domain/schemas.test.ts` -- changed import source from barrel to `../../src/domain/schemas/issues.js`

## Verification

All checks pass: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (755 tests, 0 errors).
