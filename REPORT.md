# Item 27: Remove unnecessary results.total fallback

## Finding

`FindResult<T>` from `@hcengineering/core` is typed as `WithLookup<T>[] & { total: number }`. The `total` property is always `number`, never `undefined` or `null`. The `?? .length` fallback was dead code.

## Type evidence

From `node_modules/@hcengineering/core/types/storage.d.ts`:
```ts
export type FindResult<T extends Doc> = WithLookup<T>[] & {
    total: number;
    lookupMap?: Record<string, Doc>;
};
```

## Changes

### Production code (8 occurrences removed)

| File | Variable | Before | After |
|------|----------|--------|-------|
| `src/huly/operations/documents.ts:183` | `teamspaces` | `teamspaces.total ?? teamspaces.length` | `teamspaces.total` |
| `src/huly/operations/documents.ts:238` | `documents` | `documents.total ?? documents.length` | `documents.total` |
| `src/huly/operations/projects.ts:47` | `projects` | `projects.total ?? projects.length` | `projects.total` |
| `src/huly/operations/notifications.ts:539` | `unreadNotifications` | `unreadNotifications.total ?? unreadNotifications.length` | `unreadNotifications.total` |
| `src/huly/operations/channels.ts:467` | `messages` | `messages.total ?? messages.length` | `messages.total` |
| `src/huly/operations/channels.ts:553` | `dms` | `dms.total ?? dms.length` | `dms.total` |
| `src/huly/operations/channels.ts:643` | `replies` | `replies.total ?? replies.length` | `replies.total` |
| `src/huly/operations/search.ts:50` | `results` | `results.total ?? results.length` | `results.total` |

### Test fix

`test/huly/operations/documents.test.ts`: The mock `findAll` was casting plain arrays to `FindResult<Doc>` without setting `total`, which meant `total` was `undefined` at runtime despite the type saying `number`. Replaced `as unknown as FindResult<Doc>` casts with `toFindResult()` from `@hcengineering/core`, which properly sets the `total` property.

## Verification

```
pnpm build    -- OK
pnpm typecheck -- OK (0 errors)
pnpm lint     -- OK (0 errors, only pre-existing warnings)
pnpm test     -- OK (755/755 passed)
```
