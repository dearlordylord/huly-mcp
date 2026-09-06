# Diagnostics vs Telemetry

Diagnostics are per-call degradation notices for the agent and local operator logs. They may include warning messages that explain how to interpret a degraded MCP result.

Telemetry is aggregate usage analytics sent to PostHog. It must not include diagnostic messages, workspace content, returned payload data, or backend error text.

MCP telemetry uses `HULY_MCP_TELEMETRY`; CLI telemetry uses `HULY_CLI_TELEMETRY`. Both default to enabled and can be disabled with `0`. Debug logging is controlled separately with `HULY_MCP_TELEMETRY_DEBUG=1` or `HULY_CLI_TELEMETRY_DEBUG=1`.

MCP and CLI share the same PostHog project, but every event includes `surface` (`mcp` or `cli`) and `package_name` (`@firfi/huly-mcp` or `@firfi/huly-cli`) so dashboards can split them cleanly.

Each `tool_called` event preserves `tool_name` as the called tool (including the `invoke_tool` wrapper). `operation_name` identifies the underlying operation: the direct tool name for native MCP and CLI calls, or the catalog-resolved target for `invoke_tool`. Proxy discovery calls retain their own names. Recognized proxy targets are attributed on success and failure, including connection and target argument errors; malformed or unknown proxy targets omit `operation_name`. No additional event is emitted for the target.

Group new per-operation charts by `operation_name`. For historical direct calls, fall back to `tool_name`; historical `invoke_tool` events have no recoverable target attribution. Filter `surface` when comparing MCP and CLI usage.

If degraded calls need aggregate measurement, telemetry may include sanitized counters or codes only, such as `warning_count` and `warning_codes`.
