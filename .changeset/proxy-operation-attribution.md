---
"@firfi/huly-mcp": patch
"@firfi/huly-cli": patch
---

Add operation_name to tool telemetry so proxy calls can be attributed to their underlying operation while preserving tool_name and event counts. Direct MCP and CLI calls also include operation_name.
