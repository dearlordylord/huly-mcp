# Error System Cleanup Report

## Changes

### Item 29: Remove `getMcpErrorCode` (dead export)
- Removed `getMcpErrorCode` function from `src/huly/errors.ts` (was exported but never imported in source code)
- Removed corresponding test block in `test/huly/errors.test.ts`

### Item 33: Remove `mcpErrorCode` from all error classes
- Removed `readonly mcpErrorCode: McpErrorCode = ...` property from all 29 error classes in `src/huly/errors.ts`
- The switch in `error-mapping.ts` matches on `_tag`, not `mcpErrorCode`, so this was pure dead code
- Removed all `mcpErrorCode` assertions from tests:
  - `test/huly/errors.test.ts` (10 assertions)
  - `test/huly/client.test.ts` (2 test cases)
  - `test/huly/storage.test.ts` (2 test cases)

### Item 44: Move `McpErrorCode` to `error-mapping.ts`
- Moved `McpErrorCode` const and type from `src/huly/errors.ts` to `src/mcp/error-mapping.ts`
- Updated `test/mcp/error-mapping.test.ts` to import `McpErrorCode` from `error-mapping.ts` instead of `errors.ts`
- Removed "Maps to MCP ..." JSDoc lines from all error classes (no longer relevant after removing the property)

### Item 2a: Umbrella verification
- Confirmed zero references to `mcpErrorCode`, `getMcpErrorCode`, or `McpErrorCode` remain in `src/huly/errors.ts`
- `McpErrorCode` lives only in `src/mcp/error-mapping.ts` and `test/mcp/error-mapping.test.ts`

### Item 28: Extract duplicate notification context mapping
- Extracted `toDocNotifyContextSummary` helper in `src/huly/operations/notifications.ts`
- Replaced inline mapping at two call sites: `getNotificationContext` and `listNotificationContexts`

## Verification

```
pnpm build    -- OK
pnpm typecheck -- OK (0 errors)
pnpm lint     -- OK (0 errors, 127 pre-existing warnings)
pnpm test     -- OK (749 tests passed, 24 test files)
```

## Files Modified

- `src/huly/errors.ts` -- removed McpErrorCode, mcpErrorCode, getMcpErrorCode
- `src/mcp/error-mapping.ts` -- added McpErrorCode definition, updated import
- `src/huly/operations/notifications.ts` -- extracted toDocNotifyContextSummary helper
- `test/huly/errors.test.ts` -- removed mcpErrorCode/getMcpErrorCode tests
- `test/huly/client.test.ts` -- removed mcpErrorCode tests
- `test/huly/storage.test.ts` -- removed mcpErrorCode tests
- `test/mcp/error-mapping.test.ts` -- updated McpErrorCode import source
