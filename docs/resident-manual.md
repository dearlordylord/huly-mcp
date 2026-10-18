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

For the final local Huly campaign, use the [two-reader qualification procedure](resident-read-qualification.md).
Its receipt covers adapter and reader exits; backend retirement remains separately owned.

## Stop or restart

Close an adapter to interrupt its owned requests. Stop the backend with SIGTERM
to retire its listener and remove its owned descriptor. After a restart, select
the new generation's printed path in each adapter launch configuration.

The pinned Effect runtime returns exit code 130 for interruption-only shutdown,
including SIGTERM. That code differs from a successful managed idle exit (0).
Confirm the owned exit and descriptor cleanup separately; the code alone is not
a retirement receipt.

Do not replace or edit a live generation's descriptor. Automatic selection,
crash recovery and idle shutdown are not implemented in this manual path.
The earlier experimental `MCP_STDIO_BACKEND_URL` and adapter `MCP_AUTH_TOKEN`
settings no longer select a backend. Ordinary stdio and direct HTTP retain
their existing launch paths.

## Managed state location

The experimental `MCP_TRANSPORT=stdio-resident` path selects and starts a
compatible backend. Without `MCP_RESIDENT_STATE_DIRECTORY`, its ownership state
uses `$XDG_STATE_HOME/huly-mcp/resident` on Linux, falling back to
`$HOME/.local/state/huly-mcp/resident` when the XDG value is absent, empty or
relative. This follows the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/).
On macOS the location is `$HOME/Library/Application Support/huly-mcp/resident`.
Windows resident support is out of scope and startup is refused.

The selected directory must pass the existing current-user ownership and private
permission checks. An explicit `MCP_RESIDENT_STATE_DIRECTORY` still selects a
separate namespace, including a disposable test directory. It must be shared by
all launchers that are meant to share that backend.

Earlier experimental builds defaulted to the OS temporary directory's
`huly-mcp-<uid>` child. Before upgrading those builds, stop their launchers and
verify retirement of their actual owned backend processes and resources. The
new default refuses an occupied legacy directory rather than starting a second
backend or deleting old evidence. It also refuses when that directory cannot
be inspected. An empty or absent legacy directory permits the new location.
This check does not coordinate with an older executable concurrently launching
into its old namespace; keep those launchers stopped during migration. No
records are migrated or reset automatically.

Ownership records contain discovery and authorization state, not an operation
journal. Do not delete live state or infer retirement from a missing PID.
Unexpected owner loss retains evidence and requires verified local retirement
before replacement. Native platform and final local-Huly qualification of the
combined managed path remain pending.

## Managed package versions

Automatic attachment requires an exact implementation-version match as well as
matching Huly authority and tool policy. Two installed versions may use the same
protected state directory: each selects its own backend generation. Stopping one
version's callers lets that backend retire after its idle period; callers of the
other version retain their backend and captured context.

Use separate installation paths during an upgrade. Do not rewrite a running
package's executable or edit a generation record to claim a different version.
An upgrade does not migrate sessions, queued requests or uncertain operation
results. Close old callers normally, let confirmed cleanup remove their own
records, and launch new callers from the selected installation. If old ownership
is unresolved, preserve it and verify retirement before any explicit recovery.

The Linux coexistence fixture builds two package layouts from this candidate
with distinct implementation versions. It checks separate-parent attachment,
generation isolation and independent retirement. This is compatibility evidence
for that version boundary, not certification of arbitrary released-version
upgrades, package-manager installation or native macOS behavior. Windows resident support is out of scope.

## Inspect managed ownership state

Run the CLI without Huly credentials:

```bash
huly resident status --json
huly resident status --state-directory /absolute/private/namespace --json
```

The default uses the same directory configuration as managed startup, including
its legacy-directory upgrade guard. An explicit path can inspect the old
namespace. The command reads existing state without creating directories,
starting a backend, acquiring a selection claim or changing records.

JSON reports `absent` or `observed`. An observed snapshot includes implementation
versions, generation IDs, diagnostic PIDs and whether a selection claim is
present. PID liveness remains `unverified`: a PID is diagnostic information, not
process ownership evidence. For each generation with a recognized protected descriptor format, the command also
makes one authenticated, generation-bound TLS/bearer status request. An
`authenticated` observation reports MCP readiness, admission fencing, adapter and
pending-admission counts, retained/blocked request counts and drain state. Requests
remain counted until their cleanup finishes. A blocked drain means cleanup has
failed or exceeded its allowance while work remains; preserve ownership.

Status does not acquire an adapter or Huly client. All generation probes run within
individual five-second bounds, concurrently under the 16-record inventory limit,
with response bodies capped at 4 KiB and no retry. Package versions may differ; status has its own versioned wire contract. An
unrecognized descriptor format, unsupported endpoint, connection loss, invalid response or generation mismatch
produces `unavailable` with recovery `unverified`. Private response fields are
omitted from encoded output. No endpoint, authorization value, channel key,
attachment payload or operation history is returned.

Inspection accepts at most 16 generation records of 65,536 bytes each. Root
inspection allows at most 34 entries, accounting for each generation's
descriptor and protected publication directory plus the shared registry and
claim directories. Unknown entries or formats, corrupt registry envelopes,
missing expected descriptor/registry names, unsafe permissions and symbolic
entries in the ownership namespace cause a structured refusal. Concurrent publication or cleanup can also
invalidate the snapshot; preserve the state and inspect again after that
transition finishes. The command leaves all evidence in place.

Neither an empty snapshot nor an absent directory proves that an old backend
and its resources retired. A live status observation describes that generation
at the time of its reply and reports retirement as `unconfirmed`; it does not
interpret opaque attachment payloads from other implementation versions. It cannot
authorize killing a PID, deleting ownership state or replaying an unconfirmed
operation. Verified local retirement and safe recovery remain separate work;
this command supplies no force-stop or reset action. Linux executable evidence
exists for this path; native macOS qualification remains pending. Windows resident support is out of scope.

## Request a managed generation stop

Use the exact generation UUID from status:

```bash
huly resident stop --generation <uuid> --json
huly resident stop --generation <uuid> --state-directory /absolute/private/namespace --json
```

The command authenticates that generation, checks its control-wire capability
and submits one stop request. It needs no Huly credentials. Configured managed
backends fence new admission and follow their existing normal cleanup path.
Manual and foreground backends refuse this control. The command does not start
a backend, signal a PID, remove records or reset a namespace.

Exit zero and `kind: "accepted"` mean admission was fenced. The result explicitly
says `retirement: "unconfirmed"`; it does not prove cleanup or permit resetting
ownership. If acknowledgment is lost or invalid after possible submission, the
CLI returns a nonretryable CONFLICT failure (exit 5). With `--json`, that failure
is JSON on stderr and stdout is empty. No stop request is automatically retried.

Stopping locally does not settle earlier unconfirmed Huly mutations. Preserve
that uncertainty and use operation-specific reconciliation before repeating a
mutation. Full packaged lifecycle, cleanup-failure, replacement and native
platform qualification remain pending for this command.
