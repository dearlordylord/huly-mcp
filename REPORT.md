# Item 20: Extract shared connection retry logic

## Problem

Three files duplicated the same connect-with-retry pattern:
- `src/huly/client.ts` (`connectRestWithRetry`)
- `src/huly/workspace-client.ts` (`connectAccountClientWithRetry`)
- `src/huly/storage.ts` (`connectStorageWithRetry`)

Each wrapped an async function in `Effect.tryPromise`, checked `isAuthError` to map to `HulyAuthError` vs `HulyConnectionError`, then piped through `withConnectionRetry`. Only the error message prefix differed.

## Solution

Added `connectWithRetry` to `src/huly/auth-utils.ts` -- a higher-order function that takes a `Promise`-returning function and an error prefix string, encapsulates the `Effect.tryPromise` + `isAuthError` check + error construction + `withConnectionRetry` wrapping.

All three call sites now delegate to one-liners:
```ts
connectWithRetry(() => connectRest(config), "Connection failed")
```

## Changes

- **`src/huly/auth-utils.ts`**: Added `connectWithRetry`. Changed `HulyConnectionError` from type-only to value import (needed for constructing instances).
- **`src/huly/client.ts`**: Replaced 12-line `connectRestWithRetry` with one-liner. Removed `isAuthError`, `withConnectionRetry`, `HulyAuthError` imports. `HulyClientError` now aliases `ConnectionError`.
- **`src/huly/workspace-client.ts`**: Replaced 12-line `connectAccountClientWithRetry` with one-liner. Removed `isAuthError`, `withConnectionRetry`, `HulyAuthError`, `HulyConnectionError` imports. `WorkspaceClientError` now aliases `ConnectionError`.
- **`src/huly/storage.ts`**: Replaced 12-line `connectStorageWithRetry` with one-liner. Removed `isAuthError`, `withConnectionRetry` imports. `HulyAuthError`/`HulyConnectionError` kept as type-only imports (used in `StorageClientError` type alias).

## Verification

`pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- all pass (755 tests, 0 lint errors).
