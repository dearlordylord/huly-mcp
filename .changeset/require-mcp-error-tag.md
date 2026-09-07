---
"@firfi/huly-mcp": patch
---

Make the error classification on MCP error responses mandatory and closed. `createErrorResponse` and `createInvalidParamsError` now require an `McpErrorTag` — the union of domain error `_tag`s plus the protocol-level outcomes — instead of accepting an optional bare `string`. Interrupted operations report `Interrupted` rather than going out unclassified.
