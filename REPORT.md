# Storage Type Safety Improvements

## Changes

### Item 3: FileSourceParams discriminated union
**File:** `src/huly/storage.ts` (lines 96-112)

Converted `FileSourceParams` from an interface with 3 optional fields to a discriminated union with `_tag`:
- `{ _tag: "filePath", filePath: string }`
- `{ _tag: "fileUrl", fileUrl: string }`
- `{ _tag: "base64", data: string }`

`getBufferFromParams` now uses an exhaustive `switch` on `_tag` -- no runtime assertion needed, compiler guarantees completeness.

**File:** `src/huly/operations/attachments.ts` (lines 294-304)

Updated `toFileSourceParams` to construct the appropriate tagged variant. The fallback (none of the 3 fields set) throws, matching the original `assertExists` behavior. Schema validation (`hasFileSource` filter) guarantees this path is unreachable in practice.

Removed unused `assertExists` import from `storage.ts`.

### Item 12: blob._id cast removal
**File:** `src/huly/storage.ts` (line 187-189)

Removed `as Ref<Blob>` cast. The SDK types show `Blob extends Doc` and `Doc._id: Ref<this>`, so `blob._id` is already `Ref<Blob>`. The cast was redundant -- confirmed by successful typecheck.

### Item 13: ErrnoException type guard
**File:** `src/huly/storage.ts` (line 239, 358-359)

Added `isErrnoException` type guard function: `(e: unknown): e is NodeJS.ErrnoException => e instanceof Error && "code" in e`. Replaced the bare `as NodeJS.ErrnoException` cast in `readFromFilePath`'s catch handler with this guard.

### Item 47: buildFileUrl URL encoding
**File:** `src/huly/storage.ts` (lines 252-254)

Replaced manual string concatenation with `URLSearchParams` for query parameters (properly encodes `workspace` and `file` values) and `concatLink` for path joining (reuses existing utility, removes duplicated trailing-slash logic).

## Verification

- `pnpm build`: pass
- `pnpm typecheck`: pass (0 errors)
- `pnpm lint`: pass (0 errors; 124 pre-existing warnings unchanged)
- `pnpm test`: 755/755 tests pass
