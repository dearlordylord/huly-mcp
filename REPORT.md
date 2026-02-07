# Registry Consolidation Report

## Changes

### Consolidated 5 tool handler factories into a single generic (`src/mcp/tools/registry.ts`)

**Before:** 5 near-identical factory functions, each ~20 lines, differing only in which Effect service they provided:

1. `createToolHandler` - HulyClient
2. `createStorageToolHandler` - HulyStorageClient
3. `createCombinedToolHandler` - HulyClient + HulyStorageClient
4. `createWorkspaceToolHandler` - WorkspaceClient (with availability check)
5. `createNoParamsWorkspaceToolHandler` - WorkspaceClient, no params parsing

**After:** A single generic `createHandler<P, Svc, R>` parameterized by:
- `P` - parsed params type
- `Svc` - Effect service requirement (HulyClient, HulyStorageClient, WorkspaceClient, or union)
- `R` - operation return type

Service provision is abstracted via `ProvideServices<R>` - a function that takes handler args and returns either a fully-provided Effect (Right) or an error response (Left, for WorkspaceClient unavailability). Four pre-built providers handle each service combination.

The 5 exported functions are retained as thin wrappers delegating to `createHandler` with the appropriate provider, preserving backward compatibility. No callers needed changes (except `createNoParamsWorkspaceToolHandler`).

### Removed unused `_toolName` parameter from `createNoParamsWorkspaceToolHandler`

The `_toolName` parameter was unused (prefixed with underscore). Removed from the signature. Updated all 3 call sites in `src/mcp/tools/workspace.ts`.

### Design decisions

- **`Either` for service validation**: WorkspaceClient is optional in the handler signature. Rather than using a non-null assertion (`!`), `ProvideServices` returns `Either<Effect, McpToolResponse>` - Left for validation failure, Right for the provided effect. This avoids type casts.
- **Backward-compatible exports**: All 5 original function names still exported. External callers see no API change.

## Files changed

- `src/mcp/tools/registry.ts` - Consolidated factories, removed `_toolName`
- `src/mcp/tools/workspace.ts` - Updated 3 `createNoParamsWorkspaceToolHandler` call sites

## Verification

- `pnpm build` - pass
- `pnpm typecheck` - pass
- `pnpm lint` - 0 errors (126 pre-existing warnings, unchanged)
- `pnpm test` - 755/755 pass
