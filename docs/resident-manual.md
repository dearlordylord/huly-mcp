# Run adapters against an explicitly started resident backend

This experimental path currently has Linux process evidence with Node 24.20.0.
Qualification receipts distinguish actual local-Huly observations from native
macOS execution, which is explicitly deferred. Track remaining acceptance in
[the resident feature issue](https://github.com/dearlordylord/huly-mcp/issues/322).

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

Ownership records contain discovery and authorization state, not an operation
journal. Do not delete live state or infer retirement from a missing PID.
Unexpected owner loss retains evidence and requires verified local retirement
before replacement. Qualification applies only to the source, artifacts and
platform named in a retained receipt.

## Managed identity and credential handoff

A configured managed backend captures the effective Huly URL, workspace,
authentication method, credential values, connection timeout, tool policy and
`LAZY_ENVS` setting. A profile name alone does not identify a compatible backend.

For a new backend, the launcher removes inherited Huly credential and profile
settings from the child environment. It sends the captured configuration through
private, versioned Start IPC after the prepared child's nonce and package version
match. Huly credentials do not enter the child's command arguments.

For an existing backend, the adapter authenticates the expected TLS generation
and requests a single-use comparison challenge. The adapter sends an HMAC of the
captured selection and challenge, using a key derived from the private daemon
authorization. The comparison binds the package version and backend generation.
It does not send Huly credentials to the existing backend or publish a stable credential
fingerprint. Resident ownership records contain local TLS and daemon
authorization secrets, protected by the private file checks. They contain no
Huly credentials or credential hashes.

Local TLS and daemon authorization grant access to the resident protocol.
Huly credentials authenticate the captured Huly connection separately. Configured
residents reject `x-huly-*` override headers before creating request clients,
except for `x-huly-resident-attachment`. They do not select Huly authority
through token headers on each invocation. Existing profile credential stores
retain their own storage and selection rules.
Resident HTTP spans redact all `x-huly-*` header values, including rejected
override headers.

Selections are snapshots. Rotating credentials, logging out, deleting a profile
or changing its URL or workspace does not retarget an existing adapter or an
operation it has already admitted. A subsequent adapter resolves its selection
again. Missing profiles or credentials are refused. A changed valid selection
requires a separate compatible managed backend; an explicit attachment to an
incompatible backend is refused before Huly dispatch. Restoring the original
selection permits attachment to its compatible backend again.

Existing adapters retain their captured authority. Revoking that credential in
Huly can make their requests fail; keeping a local snapshot does not bypass
upstream revocation. An existing operation is never retried under credentials
from a newly selected profile.

## Attachment leases and managed idle retirement

The current defaults are:

| Policy | Configured interval |
| --- | --- |
| Adapter heartbeat | 5 seconds between renewals |
| Attachment eligibility | 30 seconds from admission or the last accepted renewal |
| Managed idle interval | 5 seconds after the last attachment and pending admission finish |
| Idle inventory polling | At most 250 milliseconds between checks |
| Attachment close and generation drain allowance | 5 seconds each |
| Adapter admission, renewal and release control request | 5 seconds |

Lease and idle decisions use the backend's injected monotonic clock. These
intervals are configured policies, not measured native shutdown times or
guarantees about OS scheduling.

A paused or dead adapter, or one that loses heartbeats, becomes ineligible when
its lease expires. Expiry retires that attachment and starts its owned cleanup;
it does not prove that a dispatched Huly operation stopped or failed. Clean EOF
and close release the adapter's own attachment. Another adapter's attachment and
work remain independently owned.

Request and cleanup accounting outlive adapter eligibility. An attachment stays
in the generation inventory until its owned cleanup finishes, and pending
admission is counted separately. Managed idle retirement waits for this inventory
to empty, then fences new admission before stopping the server. A racing caller
either enters an accepting generation or receives an explicit refusal; it is
never admitted into the retiring generation.

A drain fences admission first. If cleanup fails or exceeds its allowance,
ownership remains unverified and overlapping replacement is blocked. Preserve
the namespace and inspect authenticated status rather than deleting records or
signalling a diagnostic PID. A local timeout, lease expiry or successful local
cleanup never authorizes replay of an uncertain Huly write. There is no durable
operation journal or cross-session operation-status lookup.

Foreground/manual backends use attachment leases but do not use managed idle
retirement. Retain native lifecycle observations separately from the quality gate;
a passing gate alone does not establish live Huly or platform behavior.

## Adapter message and queue limits

| Guard | Limit |
| --- | --- |
| Stdio input message | 1 MiB |
| HTTP response body per request | 128 MiB |
| Concurrent adapter requests | 8 |
| Queued output frames | 16 |
| Output write deadline | 10 seconds per output write |

These are enforced protocol guards, not a qualified process memory budget or a
promise that every ordinary-stdio payload fits resident mode. Queue capacity
counts frames, not bytes. A blocked output can retain large frames; request,
response, decoded-object and transport allocations add further memory costs.

The Linux comparison on `0fe6f918` observed 585 requests with a maximum of 312
bytes and 504 responses with a maximum of 2,586,921 bytes, including the full
606-tool catalog. It did not size arbitrary documents, uploads, worst-case
parallel responses or suspended clients. The 1 MiB input limit can refuse large
inline arguments before dispatch, including arguments accepted by other
transports. Do not infer upload-size parity from these read-only measurements.

The original quantitative selection basis for all these provisional values,
and the historical change from a fifteen-second to five-second idle interval,
remains incompletely evidenced. Current enforcement tests and successful
lifecycle observations do not retroactively establish that design chronology.

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

The default uses the same directory configuration as managed startup. An explicit
path selects the namespace to inspect. The command reads existing state without creating directories,
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

## Native stdio bridge

Managed `stdio-resident` uses a packaged native bridge on Linux and macOS,
for arm64 and x64. Users do not need Rust or a compiler. Ordinary stdio remains
unchanged and remains the package default; the setup examples explicitly select `stdio-resident`.

Before replacing Node, the launcher checks platform support and runs the native executable with `--check`, without reading MCP input or starting a backend. If this bounded probe fails, the executable is missing/non-executable, or `execve` is unavailable, it starts ordinary stdio and writes a fixed diagnostic to stderr. Once the bridge starts, resident failures remain terminal; they never switch transports or replay requests.

The small Node launcher replaces itself with the native executable. A
short-lived Node bootstrap selects or creates the compatible generation and
prepares a one-use compatibility proof over the existing authenticated TLS
control channel. The native socket takes over that same admission before the
bootstrap exits; the handoff uses one capacity slot without an idle gap. Local NoConfig discovery and profile startup diagnostics retain their ordinary
stdio behavior in a local Node child; they do not acquire resident ownership.
The backend owns the native session's admission, renewal, protocol
translation, cancellation and cleanup. A bounded binary frame carries opaque bytes,
transport heartbeats and terminal diagnostics; the bridge does not parse MCP JSON.
Only heartbeats received from the bridge renew its lease. Host stdout writes retain
the ten-second deadline. The bridge forwards bytes without
reconnecting or replaying requests.

Each generation owns a private temporary directory (0700) and Unix socket
(0600). The native process checks the endpoint's ownership and permissions.
The backend verifies the generation's private bearer and consumes the one-use
configuration proof before acknowledging admission or accepting MCP messages.
The socket and temporary directory are removed when the generation retires.

Source builds require Rustup, Python 3 and Bash. Run `pnpm setup:native`
to install the pinned Rust toolchain, cross-compilation targets, cargo-zigbuild,
Zig and the macOS SDK; CI and Docker run the same setup explicitly.
`pnpm build:native` cross-compiles the four binaries; Linux binaries use static musl.
The Rust bridge uses one nonblocking I/O loop without an async runtime.
`pnpm test:native` runs formatting, Clippy and real pipe/Unix-socket tests.
Packed-artifact receipts are exact and scoped to the build host platform and
architecture: Cargo metadata and Mach-O signatures can differ across compiler
hosts. `certify-packed-artifact --write` records the current host receipt; a
missing receipt fails verification rather than falling back to another host.

### Reproducing the split-build experiment

`pnpm bench:resident-builds` preserves the earlier JavaScript adapter comparison
under `.bench/resident-builds`: one CommonJS bundle and an ESM build with code
splitting, with esbuild metadata for each. These are experimental artifacts,
not an additional transport mode or release build. The JS baseline retains the
pre-native adapter so the effect of splitting can be measured separately from
the native bridge. Use equal client counts, credentials, operations and idle
intervals; record RSS, PSS and swap, and exclude the benchmark host itself.
