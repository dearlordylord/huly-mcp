# HTTP Transport Cleanup Report

## Item 14: Transport cast at line 115

**Decision: Keep cast, add documentation.**

`StreamableHTTPServerTransport` declares `implements Transport` in the SDK, but its property types
(e.g., `onmessage` signature, `send` options subset) don't satisfy the `Transport` interface under
`exactOptionalPropertyTypes: true` (our tsconfig). The SDK was compiled without this strict flag.

This is an upstream SDK type bug. The cast is safe because the class genuinely implements the
interface at runtime. Added a comment explaining the root cause.

**Alternatives considered:**
- Wrapping in an adapter object that satisfies `Transport` exactly -- adds unnecessary runtime
  overhead for a compile-time-only issue.
- Removing `exactOptionalPropertyTypes` -- weakens the entire codebase for one SDK edge case.
- Generic type parameter on `Server.connect` -- not available, the method signature is fixed.

## Item 50: Signal handlers accumulate on repeated starts

**Decision: Clean up handlers in both completion paths.**

The original code only cleaned up signal handlers on Effect interruption (the `return Effect.sync(cleanup)`
path). When a signal fires and `resume(Effect.void)` is called (normal completion), the cleanup
function was never invoked, leaving stale handlers on `process`.

Fix: extracted a `cleanup` function called both from `shutdown` (normal signal path) and from
the Effect interruption finalizer. Now handlers are removed regardless of how the async effect
completes.

## Item 62: Redundant async on GET/DELETE handlers

**Decision: Remove `async`, update return types to `void`.**

The `get` and `del` handlers contained no `await` expressions. Removed the `async` keyword and
changed their return type annotations from `Promise<void>` to `void` in both the function signatures
and the `createMcpHandlers` return type.

No test changes needed -- `await` on a `void` value is a no-op in the existing tests.

## Verification

- `pnpm build` -- pass
- `pnpm typecheck` -- pass (0 errors)
- `pnpm lint` -- pass (0 errors, 127 pre-existing warnings)
- `pnpm test` -- 755/755 tests pass
