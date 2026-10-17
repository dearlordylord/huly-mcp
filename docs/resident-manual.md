# Run adapters against an explicitly started resident backend

This experimental path currently has Linux process evidence with Node 24.20.0.
Full local Huly and platform qualification remains pending. See the
[implementation record](implementation/issue-323.md) for evidence and remaining
work, including attachment admission and legacy-session release.

## Start the backend

Build this checkout with `pnpm build:mcp`. Configure `HULY_URL`,
`HULY_WORKSPACE` and the usual Huly authentication variables in the backend's
environment, following the [normal setup](../README.md#installation).

From the checkout, run:

```bash
MCP_TRANSPORT=resident-http \
MCP_RESIDENT_STATE_DIRECTORY="$HOME/.local/state/huly-mcp/resident" \
node dist/index.cjs
```

The backend creates a private state directory and binds an OS-allocated
loopback port. An existing non-private directory is refused rather than repaired.
After native application readiness, stderr reports:

```text
Resident attachment: /absolute/private/directory/<generation>.json
```

Copy that exact path. Keep the backend process running. The attachment file
contains private authorization and a channel key; do not copy its contents into
host configuration, logs or chat.

## Start each stdio adapter

Launch each adapter with the same built package and the selected file:

```bash
MCP_TRANSPORT=stdio-http \
MCP_RESIDENT_ATTACHMENT_FILE="/absolute/private/directory/<generation>.json" \
node dist/index.cjs
```

Use this command and these two environment settings in each host's explicitly
selected MCP launch configuration. Supply Huly credentials to the backend.
Adapters need the attachment file instead. Each adapter retains its own stdio
connection, host metadata, request IDs and cancellation lifetime.

The adapter verifies private file ownership and permissions, package
compatibility and the selected generation's TLS key before sending HTTP
authorization or an operation. It does not follow redirects or replay requests.
On connection loss, an operation's outcome may be unknown.

## Stop or restart

Close an adapter to interrupt its owned requests. Stop the backend with SIGTERM
to retire its listener and remove its owned descriptor. After a restart, select
the new generation's printed path in each adapter launch configuration.

Do not replace or edit a live generation's descriptor. Automatic selection,
crash recovery and idle shutdown are not implemented in this manual path.
The earlier experimental `MCP_STDIO_BACKEND_URL` and adapter `MCP_AUTH_TOKEN`
settings no longer select a backend. Ordinary stdio and direct HTTP retain
their existing launch paths.
