---
"@firfi/huly-mcp": patch
"@firfi/huly-cli": patch
---

Report the underlying operation as `tool_name` in tool telemetry, and add `call_path` (`direct` or `invoke_tool`) to record how the caller reached it. Since `invoke_tool` is a dispatcher that exists to work around client tool-count limits, a dispatched call and a direct call to the same operation now share one `tool_name`. Replaces `operation_name`.
