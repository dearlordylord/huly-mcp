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
