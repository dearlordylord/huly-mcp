---
"@firfi/huly-mcp": patch
---

Show hosted Huly shutdown instructions only when the effective MCP configuration targets `https://huly.app`. Self-hosted deployments no longer receive the announcement during initialization, discovery, or tool calls, while affected stdio and HTTP clients continue to receive it.
