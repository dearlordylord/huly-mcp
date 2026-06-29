# Diagnostics vs Telemetry

Diagnostics are per-call degradation notices for the agent and local operator logs. They may include warning messages that explain how to interpret a degraded MCP result.

Telemetry is aggregate usage analytics sent to PostHog. It must not include diagnostic messages, workspace content, returned payload data, or backend error text.

MCP telemetry uses `HULY_MCP_TELEMETRY`; CLI telemetry uses `HULY_CLI_TELEMETRY`. Both default to enabled and can be disabled with `0`. Debug logging is controlled separately with `HULY_MCP_TELEMETRY_DEBUG=1` or `HULY_CLI_TELEMETRY_DEBUG=1`.

MCP and CLI share the same PostHog project, but every event includes `surface` (`mcp` or `cli`) and `package_name` (`@firfi/huly-mcp` or `@firfi/huly-cli`) so dashboards can split them cleanly.

If degraded calls need aggregate measurement, telemetry may include sanitized counters or codes only, such as `warning_count` and `warning_codes`.
