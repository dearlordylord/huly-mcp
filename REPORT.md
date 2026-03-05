# MCP Architecture Cleanup Report

## Item 49: handleToolCall return type (IMPLEMENTED)

**Change**: `Promise<McpToolResponse> | null` -> `Promise<McpToolResponse | null>`

The null (meaning "tool not found") is now inside the Promise, making the return type uniform. The `buildRegistry` handler became `async` so it always returns a Promise. The caller in `server.ts` now does `await` first, then checks for null -- simpler control flow, no need to distinguish "synchronous null" from "async response."

## Item 48: McpToolResponse index signature (IMPLEMENTED -- remove)

**Decision**: Remove the `[key: string]: unknown` index signature. Add `_meta?: ErrorMetadata` as an explicit optional field on `McpToolResponse`.

**Rationale**: The index signature existed solely to allow `_meta` on the `McpErrorResponseWithMeta` subtype. That's one field. An open index signature is too permissive -- it allows any arbitrary key assignment without type errors, defeating TypeScript's structural checking. Making `_meta` explicit:
- Self-documents the only extra field actually used
- Prevents accidental property assignments
- The MCP SDK uses Zod `$loose` (passthrough) at runtime, so extra properties are accepted regardless of our TypeScript types

`McpErrorResponseWithMeta` still narrows `_meta` to required (non-optional) and `isError` to `true`.

## Item 51: WorkspaceClient optional in handler (KEPT AS-IS)

**Decision**: No change.

**Rationale**: `WorkspaceClient` is genuinely optional -- it depends on workspace-level API availability. The optionality flows from `createMcpServer(... workspaceClient?)` through the registry to individual handlers. Only 2 handler factories (`createWorkspaceToolHandler`, `createNoParamsWorkspaceToolHandler`) check for it, and they produce clear error responses when absent. Lifting resolution higher would either force `WorkspaceClient` as required everywhere (breaking non-workspace setups) or require splitting registries by client dependency (over-engineering for 2 null checks).

## Item 52: toMcpResponse strips _meta by rebuild (SIMPLIFIED)

**Decision**: Simplify from manual object rebuild to destructuring.

**Before**: Built a new object property-by-property, conditionally copying `isError`.
**After**: `const { _meta: _, ...wire } = response; return wire`

This is equivalent but idiomatic. With `_meta` now explicit on `McpToolResponse` (item 48), the destructuring is type-safe. The return type is `Omit<McpToolResponse, "_meta">`, making it clear that `_meta` is intentionally stripped before the wire. The parameter type simplified from `McpErrorResponseWithMeta | McpToolResponse` to just `McpToolResponse` since the union was unnecessary (`McpErrorResponseWithMeta extends McpToolResponse`).

## Verification

- `pnpm build`: pass
- `pnpm typecheck`: pass (0 errors)
- `pnpm lint`: pass (0 errors, pre-existing warnings only)
- `pnpm test`: 755/755 tests pass

---

# Error Architecture Research - Summary

## Summary

Investigated the viability of the 4-edit error architecture in `errors.ts` and found significant issues: the TypeScript compiler catches only 1 of 4 required edits, there is a critical exhaustiveness bug in error-mapping.ts, and substantial dead code exists. Option A (simplifying via mcpErrorCode) is recommended.

## Item Addressed

2b -- error 4-edit architecture viability research

## Findings

### Compiler Safety Is Incomplete

Of 4 required edits per new error, only 1 is caught at compile time:

| Edit | Caught? | Reason |
|------|---------|--------|
| 1. Error class definition | - | Starting point |
| 2. Type union (`HulyDomainError`) | Yes | Operation error type mismatch caught by createToolHandler |
| 3. Schema union | No | Dead code, never imported |
| 4. Error-mapping switch | No | `as never` cast defeats exhaustive checking |

### Critical Bug Found

In `src/mcp/error-mapping.ts` line 106, the pattern `absurd(error as never)` defeats TypeScript's exhaustiveness check. The `as never` cast silences the compiler regardless of whether all cases are covered. Correct pattern: `absurd(error)` without the cast.

### Dead Code

1. `const HulyDomainError` Schema union (lines 586-652) -- never used in production/tests
2. `getMcpErrorCode()` function (line 657) -- only called in tests
3. `mcpErrorCode` property on every error -- never read at runtime (switch uses `_tag`)

### Architecture Issues

- 660 lines in errors.ts; ~90% are "entity not found" boilerplate
- `mcpErrorCode` property duplicates switch logic; could drift
- Only 4 errors have custom message prefixes justifying the switch's existence

## Recommendation: Option A

Delete the error-mapping switch. Use `error.mcpErrorCode` directly:

```typescript
export const mapDomainErrorToMcp = (error: HulyDomainError): McpErrorResponseWithMeta =>
  createErrorResponse(error.message, error.mcpErrorCode)
```

**Benefits:**
- Reduces edits per new error from 4 to 2 (class + type union)
- Eliminates exhaustiveness bug entirely
- Makes mcpErrorCode actually useful instead of dead
- Custom message prefixes move to error's message getter
- Removes dead Schema union

## Commit

**Hash:** 6c283fb
**Message:** docs: error architecture research report

---

**Full research available at:** `/Users/firfi/work/typescript/hulymcp/.worktrees/wt-errors-research/REPORT.md` (long form with detailed analysis, files examined, and option comparison)
