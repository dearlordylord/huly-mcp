# Item 46: Fix email filtering happening after limit in listPersons

## Problem

In `listPersons`, when `emailSearch` was provided, the flow was:

1. Query persons with `limit` applied server-side
2. Fetch email channels for those persons
3. Filter by email substring client-side

This meant if you requested `limit=50` and only 30 of those 50 persons had matching emails, you'd get 30 results instead of 50. The limit was applied before the email filter, so the user never got the number of results they asked for.

## Solution: Channel-first query strategy

Instead of fetching persons then filtering, we now query email channels first when `emailSearch` is provided:

1. Query `Channel` documents where `provider=Email` and `value` matches via `$like` (server-side substring match)
2. Collect the `attachedTo` person IDs from matching channels
3. Query persons with `_id: { $in: matchingPersonIds }` (intersected with `nameSearch` if present)
4. Apply `limit` to the final person query

This ensures the limit applies to already-email-filtered persons, so the caller gets up to `limit` results that all match the email search.

### Why this approach

- **Server-side filtering**: The `$like` operator on Channel `value` delegates substring matching to the server, avoiding client-side post-filtering entirely.
- **No over-fetching**: We don't need to guess how many extra persons to fetch; the channel query tells us exactly which persons match.
- **Correct limit semantics**: The `limit` parameter on `findAll` for persons is applied after the email filter constraint, guaranteeing up to `limit` matching results.
- **Early return**: If no channels match the email search, we return `[]` immediately without querying persons at all.

## Files changed

- `src/huly/operations/contacts.ts` -- Added `findPersonIdsByEmail` helper; rewrote `listPersons` to use channel-first strategy when `emailSearch` is provided.
- `src/huly/operations/contacts.test.ts` -- Enhanced mock `findAllImpl` to support `$in` on person `_id` and `$like` on channel `value`. Added 3 new tests: email substring filtering, empty email match returns `[]`, and limit respected with email search.

## Verification

- `pnpm build` -- pass
- `pnpm typecheck` -- pass
- `pnpm lint` -- 0 errors (pre-existing warnings only)
- `pnpm test` -- 758 tests pass (25 contacts tests, 3 new)

Cannot test against a live Huly instance. The `$like` operator on Channel `value` is assumed to work the same as on other string fields (Person `name`, Issue `title`, Document `title`), which all use `$like` successfully in this codebase. User should verify via integration testing before release.
