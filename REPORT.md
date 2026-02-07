# shared.ts cleanup report

## Item 11: Double-cast at line 41

**Before:**
```typescript
const statusClassRef: Ref<Class<Status>> = core.class.Status as Ref<Class<Doc>> as Ref<Class<Status>>
```

**After:**
```typescript
const statusClassRef = core.class.Status
```

**Analysis:** The double cast was unnecessary. The SDK's `@hcengineering/core` type declarations already declare `core.class.Status` as `Ref<Class<Status>>` (see `node_modules/@hcengineering/core/types/component.d.ts`, line 76). The `require(...).default as typeof import(...)` pattern used for CJS interop preserves this type information. Direct assignment works without any cast. Removed the explicit type annotation and the `Class` import (no longer referenced).

## Item 31: Dead interfaces (lines 232-245)

**Removed:**
- `PaginationOptions`
- `SearchOptions`
- `LookupOptions<T>`

**Confirmation:** Grep across the entire worktree found each interface only in `shared.ts` itself -- zero imports or usages elsewhere. Also removed the `FindOptions` import which was only used by `LookupOptions`.

## Verification

- `pnpm build` -- pass
- `pnpm typecheck` -- pass (0 type errors)
- `pnpm lint` -- pass (0 errors; 127 pre-existing warnings unchanged)
- `pnpm test` -- 755/755 pass
