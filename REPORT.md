# Item 6: Isolate globalThis polyfills into polyfills.ts

## What changed

Extracted all globalThis polyfill code from `src/index.ts` into a new `src/polyfills.ts` file.

### Files modified
- **`src/index.ts`** -- removed polyfill code (indexedDB, window, navigator globals), removed `fake-indexeddb` import, added `import "./polyfills.js"` as first import
- **`src/polyfills.ts`** (new) -- contains all globalThis mutations with `eslint-disable functional/immutable-data` and documented `as` casts

### What moved
- `fake-indexeddb` import and `globalThis.indexedDB` assignment
- `mockWindow` object and `globalThis.window` assignment
- `globalThis.navigator` conditional polyfill via `Object.defineProperty`

### Why
The `as Record<string, unknown>` casts and `eslint-disable` directives are necessary for polyfills but pollute the main entry point. Quarantining them in a dedicated file keeps `src/index.ts` clean and makes the unsafe code easy to locate/audit.

## Verification
- `pnpm build` -- passes
- `pnpm typecheck` -- passes
- `pnpm lint` -- 0 errors (124 pre-existing warnings, none from new file)
- `pnpm test` -- 755/755 pass
