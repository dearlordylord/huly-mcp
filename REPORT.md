# Refactor Report: server.ts version/casts/config + remove HulyConfigError alias

## Changes

### Item 5: Version hardcode (server.ts:78)

**Problem**: `version: "1.0.0"` was hardcoded while `package.json` says `0.1.25`.

**Fix**: esbuild `--define` injects `PKG_VERSION` at build time.

- `package.json` build script now reads version via `node -p "require('./package.json').version"` and passes it as `--define:PKG_VERSION="\"$V\""`.
- `src/globals.d.ts` declares `PKG_VERSION` for TypeScript.
- `src/mcp/server.ts` uses `const VERSION = typeof PKG_VERSION !== "undefined" ? PKG_VERSION : "0.0.0-dev"` -- the fallback covers test/dev environments where esbuild define is absent.
- In the built bundle, esbuild replaces `PKG_VERSION` with `"0.1.25"` and constant-folds the ternary to just `"0.1.25"`.

### Item 7: Remove `as Error` casts (server.ts:163,196,235)

**Problem**: Three `catch: (e) => ... cause: e as Error` casts from `unknown` to `Error`.

**Fix**: Removed all three. `McpServerError.cause` is typed as `Schema.optional(Schema.Defect)` which accepts `unknown` directly.

### Item 45: TOOLSETS via Effect Config (server.ts:134)

**Problem**: `process.env.TOOLSETS` read directly, inconsistent with rest of codebase.

**Fix**: Replaced with `Effect.orElseSucceed(Config.string("TOOLSETS"), () => "")`. Uses Effect's `Config.string` for consistency. `Effect.orElseSucceed` eliminates `ConfigError` from the error channel (the layer declares error type `never`), defaulting to empty string when unset. Added `Config` to the effect import.

### Item 57: Remove HulyConfigError alias (config.ts:91)

**Problem**: `export type HulyConfigError = ConfigValidationError` -- redundant alias.

**Fix**: Removed the alias. Updated all references:
- `src/config/config.ts`: removed alias, updated `loadConfig` and `layer` type annotations.
- `src/index.ts`: replaced `HulyConfigError` import and all usages with `ConfigValidationError`.

## Files Changed

- `src/mcp/server.ts` -- version constant, removed casts, TOOLSETS via Config
- `src/config/config.ts` -- removed HulyConfigError alias, updated annotations
- `src/index.ts` -- HulyConfigError -> ConfigValidationError
- `src/globals.d.ts` -- new file, declares `PKG_VERSION` global
- `package.json` -- build script injects PKG_VERSION via esbuild --define

## Verification

```
pnpm build     -- pass (version correctly injected as "0.1.25" in bundle)
pnpm typecheck -- pass
pnpm lint      -- pass (0 errors, only pre-existing warnings)
pnpm test      -- pass (755/755 tests)
```
