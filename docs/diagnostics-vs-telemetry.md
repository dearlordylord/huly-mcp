# Diagnostics vs Telemetry

Diagnostics are per-call degradation notices for the agent and local operator logs. They may include warning messages that explain how to interpret a degraded MCP result.

Telemetry is aggregate usage analytics sent to PostHog. It must not include diagnostic messages, workspace content, returned payload data, or backend error text.

If degraded calls need aggregate measurement, telemetry may include sanitized counters or codes only, such as `warning_count` and `warning_codes`.
