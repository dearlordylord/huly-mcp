# Diagnostics vs Telemetry

Diagnostics are per-call degradation notices for the agent and local operator logs. They may include warning messages that explain how to interpret a degraded MCP result.

Telemetry is aggregate usage analytics sent to PostHog. It must not include diagnostic messages, workspace content, returned payload data, or backend error text.

MCP telemetry uses `HULY_MCP_TELEMETRY`; CLI telemetry uses `HULY_CLI_TELEMETRY`. Both default to enabled and can be disabled with `0`. Debug logging is controlled separately with `HULY_MCP_TELEMETRY_DEBUG=1` or `HULY_CLI_TELEMETRY_DEBUG=1`.

MCP and CLI share the same PostHog project, but every event includes `surface` (`mcp` or `cli`) and `package_name` (`@firfi/huly-mcp` or `@firfi/huly-cli`) so dashboards can split them cleanly.

Each `tool_called` event reports the underlying operation in `tool_name`, regardless of how the client reached it. `call_path` records how: `direct` when the client called the tool by name, `invoke_tool` when it was dispatched through the `invoke_tool` wrapper, which exists because most clients cannot accept the full native tool list. Both paths run the same operation, so they share one `tool_name`.

`call_path` is not `resolved_mode`. `resolved_mode` is the tool surface the session was given; `call_path` is how one call reached its operation. A proxy-mode session calls the discovery tools (`list_tool_categories`, `search_tools`, `get_tool_schema`) with `call_path` `direct` and reaches everything else with `call_path` `invoke_tool`.

Dispatch targets are attributed on success and failure, including connection and target argument errors. A malformed or unknown target has no name safe to record — arbitrary caller input may contain workspace data — so those events report `tool_name` as `invoke_tool` with `call_path` `invoke_tool`. No additional event is emitted for the target.

Group per-operation charts by `tool_name` and split by `call_path` to compare dispatch paths. Filter `surface` when comparing MCP and CLI usage. Events captured by version 0.52.2 carry the target in `operation_name` and report `tool_name` as `invoke_tool` for dispatched calls; charts spanning that range need both fields.

If degraded calls need aggregate measurement, telemetry may include sanitized counters or codes only, such as `warning_count` and `warning_codes`.
