# Diagnostics vs Telemetry

Diagnostics are per-call degradation notices for the agent and local operator logs. They may include warning messages that explain how to interpret a degraded MCP result.

Telemetry is aggregate usage analytics sent to PostHog. It must not include diagnostic messages, workspace content, returned payload data, or backend error text.

MCP telemetry uses `HULY_MCP_TELEMETRY`; CLI telemetry uses `HULY_CLI_TELEMETRY`. Both default to enabled and can be disabled with `0`; `DO_NOT_TRACK` set to any value other than empty, `0`, or `false` disables both. Debug logging is controlled separately with `HULY_MCP_TELEMETRY_DEBUG=1` or `HULY_CLI_TELEMETRY_DEBUG=1`.

MCP and CLI share the same PostHog project, but every event includes `surface` (`mcp` or `cli`) and `package_name` (`@firfi/huly-mcp` or `@firfi/huly-cli`) so dashboards can split them cleanly.

Each `tool_called` event reports the underlying operation in `tool_name`, regardless of how the client reached it. `call_path` records how: `direct` when the client called the tool by name, `invoke_tool` when it was dispatched through the `invoke_tool` wrapper, which exists because most clients cannot accept the full native tool list. Both paths run the same operation, so they share one `tool_name`.

`call_path` is not `resolved_mode`. `resolved_mode` is the tool surface the session was given; `call_path` is how one call reached its operation. A proxy-mode session calls the discovery tools (`list_tool_categories`, `search_tools`, `get_tool_schema`) with `call_path` `direct` and reaches everything else with `call_path` `invoke_tool`.

Dispatch targets are attributed on success and failure, including connection and target argument errors. A malformed or unknown target has no name safe to record — arbitrary caller input may contain workspace data — so those events report `tool_name` as `invoke_tool` with `call_path` `invoke_tool`. No additional event is emitted for the target.

Group per-operation charts by `tool_name` and split by `call_path` to compare dispatch paths. Filter `surface` when comparing MCP and CLI usage. Events captured by version 0.52.2 carry the target in `operation_name` and report `tool_name` as `invoke_tool` for dispatched calls; charts spanning that range need both fields.

If degraded calls need aggregate measurement, telemetry may include sanitized counters or codes only, such as `warning_count` and `warning_codes`.

## Resident diagnostics (telemetry schema 2)

Filter `telemetry_schema_version = 2` when using the following semantics. Every event includes `runtime_mode` (`stdio`, `http`, `resident`, or `cli`). A resident's underlying `transport` remains HTTP; it does not identify the client process mode.

`resident_ready` means the private attachment descriptor was published. Each admission receives a random `attachment_id` unrelated to authorization tokens, generation IDs, MCP session IDs, or workspace identity. `resident_attachment` has three phases:

- `admitted`: the backend retained an attachment; `retained_attachments` is the current inventory, including attachments whose cleanup is blocked. This does not prove a client completed initialization.
- `activity_observed`: emitted once for that attachment's first tool attempt, with `first_activity = tool_call`. Clients that only list tools remain admitted without observed tool activity.
- `closed`: emitted once after confirmed removal, with monotonic `duration_ms` and `reason` (`release`, `lease_expired`, `backend_shutdown`, or `unknown`). Pending or failed cleanup does not produce a close event.

Count attachment admissions and first activities to compare created versus used connections. An attachment approximates one connected agent; reconnections create new IDs, and these events cannot identify unique agents or users. Reconstruct concurrent retained attachments per backend session from admissions and confirmed closures. Abrupt process death can lose events; this is best-effort analytics, not an exact live process inventory.

`tool_called` carries `attachment_id` for resident calls. Its observer records exactly one outcome for a begun handler: `success`, `error`, `cancelled`, or `rejected`. Rejection includes unknown tools, malformed arguments and shutdown admission; domain failures remain errors. Cancellation describes server-side interruption, not guaranteed delivery to the client. Framework rejection before the handler is outside this event. UTF-8 `input_bytes` and `output_bytes` replace the previous string-length measurements. Unknown direct names are recorded as `unknown`; unresolved proxy targets remain `invoke_tool`.

`resident_failure` reports bounded `stage` and `reason` codes for admission, compatibility, work limits, cleanup, startup, backend and native-channel failures. Separate work rejections produce separate events; repeated observations of the same attachment cleanup incident are deduplicated. Generation-level cleanup failure can accompany an attachment incident. Planned native retirement is not a channel failure. Startup failures before the Node backend starts and abrupt process death cannot be reported by backend telemetry.

Telemetry policy participates in managed resident compatibility, so clients with different enabled/disabled settings do not share a backend. Manual adapters with telemetry disabled refuse descriptors that do not explicitly confirm a disabled backend, before making any request. Restart the manual backend with matching `HULY_MCP_TELEMETRY=0` or `DO_NOT_TRACK=1`. Old descriptors without policy metadata remain usable with enabled clients; disabled clients fail closed.

The backend owns the PostHog client until attachment cleanup finishes, then emits `session_end` and flushes once. Rust forwards bytes and does not emit analytics. Events contain codes, timings and sizes; arguments, results, error messages, credentials and workspace contents are excluded.
