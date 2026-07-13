# Plan: Useful MCP errors when the default Huly server is unreachable

## Context and current upstream status

As checked on 2026-07-10, the current upstream `develop` README contains an explicit hosted-Huly
shutdown notice:

- Hosted Huly is being discontinued because its hosting is no longer funded.
- The expected service shutdown date is **July 20**. The notice does not
  include a year. Agent-visible output must use the
  announced "July 20" deadline without inventing a year unless upstream
  clarifies it.
- The notice explicitly says the shutdown affects only hosted Huly; self-hosted
  deployments are not affected.
- The repository remains active for the platform/self-hosted code, and
  `https://huly.app` may still respond before the shutdown date.

The MCP should recognize two related states: the known hosted-Huly sunset, and
an observed inability to reach the endpoint. It should not claim that a
particular call failed because of the shutdown unless the failure and date make
that inference reasonable.

## Goal

When an MCP tool needs Huly and the configured endpoint cannot be reached, keep
the MCP session usable and return an agent-facing, actionable error. For the
documented default Huly Cloud host (`https://huly.app`), explain the hosted
service sunset, include the July 20 deadline, and tell the agent to export,
back up, and migrate. For a custom/self-hosted URL, explain that the upstream
shutdown does not affect that deployment and give endpoint-specific
troubleshooting.

Tool calls must remain MCP `CallToolResult` failures (`isError: true`). The
existing internal metadata should remain `-32603` with a stable error tag for
telemetry and tests; `toMcpResponse` strips that metadata, so this is not a
wire-level JSON-RPC `-32603` error. If callers need a machine-readable public
diagnostic, add a schema-owned safe diagnostic to the returned contract rather
than leaking internal `_meta`. The response must not expose credentials, URL
query tokens, raw SDK objects, or unstable low-level exception text.

## Current gaps

1. `src/index.ts` eagerly builds the combined Huly client layer for normal
   stdio startup. A connection failure can terminate the process before an MCP
   client can call a tool.
2. `src/mcp/protocol-handlers.ts` catches client initialization failures and
   wraps them in generic `HulyError`, losing the typed connection/auth error.
3. `HulyConnectionError` currently contains a free-form message and optional
   cause, so the MCP layer cannot reliably distinguish an unreachable endpoint
   from authentication, configuration, or protocol failures.
4. `src/mcp/error-mapping.ts` only prefixes connection errors with
   `Connection error:`; it does not give LLMs recovery guidance.
5. Existing diagnostics are per-tool and agent-visible, but warnings are for
   degraded successful payloads. An unavailable backend should remain a
   failure, not be represented as a success warning.

## Proposed design

### 1. Add a typed, sanitized connection diagnostic

Introduce a dedicated schema-owned `HulyUnavailableError` in the domain error
union. Model its diagnostic as a discriminated union so each variant carries
only meaningful, sanitized values:

- endpoint origin (`protocol + host + optional port`, never credentials,
  path, query, or fragment),
- endpoint kind (`default_cloud` or `custom`),
- failure kind (`refused`, `timeout`, `dns`, `tls`, `http_unavailable`, or
  `unknown`),
- a stable, allow-listed safe detail code only when it can be classified
  without copying arbitrary backend text.

Do not put raw causes in the schema-owned error. Centralize classification at
the connection adapter (`connectWithRetry`) so Huly client, storage client,
and workspace client use the same rules. Authentication failures must continue
to map to `HulyAuthError` and should not be described as server downtime.

Use a constant for the documented default cloud origin instead of scattering
string comparisons. Match the normalized origin exactly, not arbitrary URL
text or every `*.huly.app` host, so credentials and paths cannot affect the
classification.

### 2. Make unavailable-backend startup recoverable

Adjust normal stdio bootstrap so a connection-level failure does not prevent
the MCP transport from completing initialization:

- Preserve eager validation of required configuration and credentials.
- If only client acquisition fails because Huly is unreachable, close the
  failed scope and start the MCP server with an unprimed resolver.
- Let the first Huly-dependent tool call retry/resume client acquisition and
  pass the typed connection failure to MCP mapping.
- Keep malformed/missing configuration and authentication failures explicit;
  do not silently convert them into an availability error.
- Ensure concurrent first calls share the existing memoized resolver promise.
  Evict that promise after a typed availability failure so a later call can
  recover; clear it only if it is still the cached promise, avoiding a race
  with a newer acquisition. Keep configuration failures cached because a
  retry without a configuration change cannot repair them.

If preserving eager startup proves too invasive, the fallback is to make
connection acquisition lazy by default while retaining a separate config-only
startup parse. The chosen implementation must be tested through the real
stdio request path, not only through a mapper unit test.

### 3. Preserve typed failures through tool dispatch

Change the client-resolution error path in `protocol-handlers.ts` to parse/map
known schema-owned `HulyUnavailableError`, `HulyConnectionError`, and
`HulyAuthError` values directly. Do not wrap all resolver failures in a generic
`HulyError`, and do not trust an arbitrary rejected value merely because it has
an `_tag` property. Keep an explicit safe fallback for unknown defects.

Apply the same rule to native tools, proxy `invoke_tool`, `resources/list`, and
`resources/read`, since all can acquire Huly clients. Centralize the mapping so
these protocol paths cannot drift. The message should include the requested
operation/tool name only when useful and must not duplicate nested exception
text.

### 4. Produce an LLM-first message

For default Huly Cloud plus a classified availability failure, use a concise
message with this shape (without adding an unverified year):

> Cannot reach hosted Huly (`https://huly.app`) from this MCP server. Huly's
> README announces that hosted Huly is being discontinued, with shutdown
> expected July 20. Export and back up your data, then migrate to a
> hosted alternative or self-hosted Huly. Check network/DNS/proxy access if
> you need one last connection; set `HULY_URL` to a reachable self-hosted
> instance after migration. Do not retry a write until connectivity is
> restored.

Tune the wording by failure kind:

- timeout: mention the configured connection timeout;
- DNS/TLS: tell the agent to verify hostname, certificate, and proxy;
- custom endpoint: name only the sanitized origin and point to the operator's
  Huly deployment; do not mention hosted Huly or its shutdown;
- auth: say credentials/token/workspace authorization failed and do not imply
  downtime.

Say that upstream announced July 20 as the expected shutdown date and that the
outage may be the hosted-service shutdown; do not say shutdown is confirmed
solely from a connection failure. This wording remains accurate on either side
of the undated deadline and avoids ambient-clock logic based on an inferred
year. Keep the announcement facts and source URL in one versioned
constant/module, not spread across adapters and protocol handlers.

The message should include stable remediation terms (`HULY_URL`,
`HULY_CONNECTION_TIMEOUT`, retry, self-hosted instance) because agents can
act on them. Avoid promising a recovery time or asserting that the shutdown
caused a particular failure when the MCP only knows that its request failed.

### 5. Keep context/telemetry safe

Continue exposing sanitized URL origin through `get_huly_context`; never add
passwords, tokens, URL query strings, or raw causes. Telemetry should record
the stable error tag/failure kind and endpoint kind, not the backend exception
or secrets. Operator logs may include a sanitized diagnostic only.

## Verification plan

### Unit and property coverage

- Normalize default and custom URLs, including credentials, paths, query
  strings, ports, casing, and trailing slashes; assert secrets never appear.
- Classify representative timeout, DNS, TLS, refused, gateway/service-
  unavailable HTTP, auth, and unknown failures
  through an injected connection adapter seam. No module mocks or monkey
  patching.
- Verify error mapping retains internal `-32603`/stable-tag metadata before
  wire conversion, returns `isError: true` on the wire, and produces the
  actionable message for default-cloud refused, custom refused, timeout, DNS,
  TLS, HTTP unavailable, unknown, and auth cases.
- Verify mapper output and telemetry omit raw causes and credentials.
- Test resolver retry behavior: first acquisition fails, a tool call returns
  the useful error, then a later call can succeed after the injected adapter
  becomes available.

### MCP protocol coverage

- Start the real server path with an injected unavailable Huly adapter and
  complete `initialize`; do not depend on a test-only module mock.
- Call a native Huly tool and proxy `invoke_tool`; both must return the same
  useful connection guidance.
- Exercise `resources/list` and `resources/read`; their unavailable-backend
  guidance must be consistent with tool calls.
- Confirm `get_huly_context` still works while Huly is unavailable and reports
  sanitized configuration only.
- Confirm malformed configuration and invalid credentials retain distinct
  messages and are not mislabeled as network outage.

### Required repository gates

- `pnpm check-all`
- Local Huly integration tests using the container URL override documented in
  `AGENTS.md`/`INTEGRATION_TESTING.md`.
- A short stdio smoke test with a deliberately unreachable endpoint and a
  short timeout, verifying the MCP process stays available long enough for the
  tool call response.

## Acceptance criteria

- An unreachable `https://huly.app` does not prevent MCP initialization solely
  because of backend connectivity.
- A Huly-dependent tool call returns an actionable error in one response,
  without requiring the agent to call a separate diagnostic tool first.
- The default-cloud response reflects the upstream README's hosted-service
  shutdown notice and July 20 deadline without inventing a year, while clearly
  limiting the impact to hosted Huly and distinguishing an inference from a
  confirmed shutdown.
- Custom Huly deployments receive endpoint-appropriate guidance and are not
  incorrectly classified as the default cloud.
- Authentication/configuration failures remain distinguishable from network
  failures.
- No secrets or raw backend error payloads appear in tool results, telemetry,
  logs, snapshots, or tests.
- Existing success results, warnings, error codes, and integration behavior
  remain compatible.

## Explicit non-goals

- Do not poll GitHub or Huly on every tool call to infer global service status;
  keep the known notice/date in versioned MCP messaging and update it when the
  upstream notice changes.
- Do not automatically migrate data, switch endpoints, or claim that a
  self-hosted deployment is closing.
- Do not make a failed write appear successful or retry destructive writes
  blindly.
