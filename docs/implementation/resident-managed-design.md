# Managed resident ownership

This records the selected ownership design for #324. It is a design contract,
not evidence that managed startup works. The manual attachment and lease code
at `5e69e7ed` supplies the starting point. The foundation's verification and
remaining qualification are recorded in the issue 324 and 325 reports.

The later [ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md) selects
MCPorter lifecycle practices for recovery: no mandatory guardian, no stronger
remote-operation durability and bounded refusal after unresolved backend-owner
loss. Normal resource retirement and healthy-backend client isolation below
remain required. Crash continuity across a failed backend is not promised.

## Selection uses an exclusive filesystem claim

Each protected resident root has one `selection.claim` directory. Creating that
directory exclusively acquires the right to inspect and mutate its generation
registry. The successful creator owns a one-use release capability. A process
that sees an existing claim cannot remove, rename, or replace it.

PID state, directory age, and an unused port never authorize takeover. Interrupted
creation and partial claim metadata cause bounded refusal. Crash recovery requires
the additional ownership proof in #327.

Release consumes its capability before its first filesystem mutation. All claim
metadata is removed before the final directory removal. No release callback or
finalizer may mutate that path afterward. Cooperating writers do not replace a
live claim. This does not promise atomic conditional deletion against arbitrary
filesystem replacement by another process with the same user authority.

The alternative design used a persistent launch authority on a fixed TCP port.
That adds another process and control protocol. Its released kernel handle still
cannot prove that descendants have retired after a crash. Filesystem ownership
therefore avoids that extra process without weakening the required refusal of
unresolved ownership.

## Child authorization transfers lifetime ownership

A managed child starts with an authenticated, owned IPC connection to the exact
executing package. Before receiving Start, it cannot acquire the selection claim.
The parent can terminate that prepared child through its own ChildProcess handle.

The parent consumes that kill capability before attempting to send Start. A send
callback or acknowledgment never restores it. Once Start may have reached the
child, cancellation closes only the parent's wait. Killing the child could kill
a backend already shared by another caller.

The child orders Start, IPC disconnect, and its preparation deadline through one
transition function. Start authorizes ownership once. Disconnect or timeout before
Start commits to exit. A later Start cannot reverse that decision. Disconnect
after Start cannot cancel the backend scope. Tests must cover a queued Start
followed by disconnect and a lost send acknowledgment.

A winning explicit `resident-http` process remains a foreground owner. Its
termination can stop its shared backend. A losing explicit start selects an
existing compatible generation and exits. Both entrypoints use the same selection
and owner operation, with lifetime supplied by the entrypoint.

## Registry retention covers complete retirement

Every generation has an immutable random identifier and a unique registry path.
The registry entry and the temporary attachment descriptor have different
lifetimes. Descriptor removal alone does not prove retirement: current startup
closes the process client resolver outside the native backend scope.

The owner removes its registry entry only after confirmed closure of listeners,
admissions, pending acquisitions, process clients, and owned descendants. Failed
or uncertain cleanup retains the entry and blocks replacement. An unconditional
finalizer that removes the entry after failed cleanup violates this contract.

Registry mutation uses the selection claim. Shutdown must fence new admissions
without waiting for that claim, so a selector awaiting a control response cannot
deadlock shutdown. Compatibility proves identity only. Attachment admission must
succeed before the caller reports attachment. A closing generation cannot be
skipped while its retirement remains unconfirmed.

## Configuration stays private and immutable

Compatibility includes the complete parsed Huly connection, authentication,
connection timeout, and effective process tool policy. Host identity remains
attachment-specific. Profile resolution follows existing precedence and captures
one immutable selection. No caller inherits another resident's credentials.

Registry names contain no credential-derived lookup value. Private compatibility
uses a domain-separated MAC over a canonical selection and a backend-issued
one-use challenge. It binds package, wire version, generation, and operation.
The canonical encoder and challenge limits are recorded below. HTTP comparison
and admission are connected at the transport module boundary. Explicit configured
backend and adapter startup now supply the captured selection; automatic managed
selection remains pending. No transcript is persisted or logged.

The comparison wire format is version 1. Its challenge contains the package
version, expected random generation, and a fresh 32-byte random nonce encoded as
64 lowercase hexadecimal characters. The backend retains at most 32 challenges,
each for five seconds of its monotonic clock. Issuing a challenge prunes expired
entries. Verification consumes its nonce before deciding whether the proof
matches. Failed verification cannot leave a challenge reusable. A collision
refuses issuance rather than replacing an existing challenge. These bounds limit
temporary control state; they do not enforce a global contender limit.

The MAC transcript is UTF-8 JSON of a fixed-order tuple containing the domain
`@firfi/huly-mcp/resident-compatibility/v1`, wire version, package version,
generation, operation `compare`, nonce, and the selection tuple. The selection
tuple contains URL, workspace, tagged authentication tuple, connection timeout,
ordered requested toolsets, ordered requested tools, configured exposure mode,
output strictness, and lazy startup behavior. Token authentication is the tuple
`["token", token]`; password authentication is `["password", email, password]`.
Strings retain their parsed bytes, without URL or credential normalization.
Integers and booleans use JSON encoding. The tuple has no absent fields or object
key ordering dependency. Schemas reuse the existing connection and policy fields.

The MAC is HMAC-SHA-256. Its 32-byte key is derived by HMAC-SHA-256 with the private
daemon authorization as key and the UTF-8 domain
`@firfi/huly-mcp/resident-compatibility-key/v1` as message. The bearer token is
never accepted as a proof. Verification compares the 32-byte MACs in constant
time. TLS authenticates the expected generation and the control response. This
operation proves compatibility only; attachment admission remains separately
required under the generation's shutdown fence. No comparison transcript or
credential-derived value is written to the registry.

When a backend supplies a compatibility authority, POST
`/resident/compatibility` issues a challenge. POST `/resident/attachments` then
requires the schema-encoded proof, verifies it, and attempts admission under the
generation fence. Missing, malformed, replayed, or incompatible proofs never
fall back to unverified admission. A server without a compatibility authority
retains the explicit manual attachment contract.

Proof request bodies are limited to 4,096 bytes. Oversized bodies cause the
installed Node transport to close the socket; ordinary malformed JSON receives
a static 400 response. The adapter bounds challenge responses to the existing
4,096-byte admission response limit. Challenge and admission together share one
five-second acquisition allowance. Renewal and release retain their existing
individual five-second allowances. A failed or lost control exchange dispatches
no Huly request and authorizes no replay.

The adapter verifies challenge package and generation against its own package
and authenticated descriptor before computing a proof. Successful comparison
does not bypass admission: a fence between comparison and admission produces a
409 refusal. Challenge replay then fails because verification consumed the nonce.

The admission service's irreversible fence blocks new admission, lookup, renewal,
and new work through previously captured owners. It does not cancel running work.
Explicit draining still owns cancellation and waits for confirmed target and
client cleanup. The fence does not wait for a paused admission or the filesystem
selection claim. Pending admissions check eligibility again after asynchronous
resource acquisition before publishing a capability. Manual backend HTTP policy
bundles its middleware with a fence that runs before native registry and client
cleanup. Its outer run cleanup also fences before the inner scope closes.
The automatic-startup candidate now adds managed idle retirement and guarded
outer process-client closure. Its qualification status is recorded in the issue
324 and 326 reports; the fence alone is not proof of completed retirement.

A stable outer registry envelope distinguishes known incompatible versions from
corrupt or unknown records before decoding the current attachment descriptor.
Unreadable or missing descriptors for unresolved records cause refusal.

Missing configuration is decided before launch using existing parsed startup
semantics. Existing lazy discovery can remain local without acquiring Huly.
The automatic adapter now chooses that local path only for parsed lazy startup
with no explicit Huly authority fields. Explicit profile or authority selection
continues through the existing strict resolver, including its failure path.
Ordinary stdio defaults to eager acquisition unless configured otherwise; managed
startup must not silently change that default. Invalid selected profiles retain
their existing error path. Authentication or ownership failure never triggers a
fallback to another resident.

## Linux experiment and remaining proof

An isolated Node v24.20.0 experiment used ten independent children per claim
method. Both exclusive mkdir and Unix socket binding produced one winner and
nine refusals. SIGKILL left a directory or socket pathname that refused a later
claim. Closing an old server after renaming its socket and reusing the original
pathname deleted the replacement pathname. Distinct generation socket paths
preserved the replacement.

The receipt is `/tmp/resident-managed-design-5e69e7ed/primitive-receipt.json`.
This supports exclusive creation and crash refusal on this Linux environment.
It does not prove packaged startup, cleanup, configuration isolation, macOS or
Windows behavior, Huly sharing, or performance.

The production `selection-claim.ts` now owns exclusive creation and one-use
release. Its scoped operation releases on operation failure and interruption.
The claim directory contains no metadata yet. Failure to inspect a newly created
claim retains unresolved ownership instead of attempting speculative cleanup.
`start-authorization.ts` supplies the child-side transition decisions, but no IPC
entrypoint uses them yet.

Focused tests exercise the production filesystem operation with ten independent
Node children. Exactly one acquires the claim; after its SIGKILL, a later child
is refused. Other tests cover replacement detection, an old release after a new
claim, nonempty-directory cleanup failure, and scoped interruption. These are
source-level process fixtures, not the packaged managed MCP qualification.

Before automatic wiring, the implementation must freeze inventory and payload
limits, the total monotonic deadline including configuration resolution, and the
local retry cadence. A per-process counter cannot enforce a global contender
limit. Packaged process tests, observed lifecycle transitions, fresh reviews,
the complete project gate, and final live Huly qualification remain required.

## Managed launch bounds selected before wiring

Managed mode will be explicitly selected as `MCP_TRANSPORT=stdio-resident`.
Configured explicit `resident-http` starts will use the same selector; the
unconfigured descriptor-only manual contract remains available. A prepared child
uses the exact executing package and a private Node IPC channel, with detached
lifetime and independent standard streams. The parent verifies the package and a
fresh per-launch nonce before sending its schema-encoded captured configuration.
Huly configuration variables are removed from the child's initial environment.
The parent consumes its pre-Start termination capability before attempting Start;
send errors, cancellation and missing acknowledgments cannot restore it.

Selection has a ten-second monotonic acquisition budget beginning before profile
resolution. Failure cleanup has a separate five-second allowance, giving a
fifteen-second caller failure envelope under a functioning local OS/filesystem.
No existing five-second application readiness or attachment control allowance is
increased. Prepared children retire after five seconds without authorization.
Claim contenders retry only the typed busy result every 25 milliseconds within
the selection budget. A deadline or unresolved record is a refusal, never
permission to remove another owner's state or replay a request.

The private `generations` inventory accepts at most sixteen records and reads at
most seventeen directory entries before refusing overflow. Each registry record
is limited to 65,536 UTF-8 bytes, including its stable version/package envelope
and descriptor. Thus selection reads at most one MiB of record payload; directory
iteration is bounded independently of record decoding. Unknown envelope formats,
corrupt entries and unresolved current-generation endpoints block selection.
Known incompatible package versions can coexist without decoding their current
protocol payload or contacting their listener. Generation identifiers remain
random and independent of credentials. Registry entries outlive the temporary
manual descriptor and are removed only by their one-use inode-fenced retirement
capability after the outer server/client owner confirms closure.

Private IPC frames are UTF-8 JSON strings limited to 65,536 bytes. The protocol
has prepared, Start, ready and refused frames; only Start carries the captured
configuration. It is not a general command channel. One parent may own one
prepared child. This does not claim a global limit on independent parents.

The managed backend's fixed ordinary idle interval is five seconds with no
admitted attachments, pending admissions or retained request cleanup. Active
leases and work retain the backend; expiring a lease still waits for its target
and client cleanup. The idle decision and admission fence are ordered in the
admission owner, independently of the filesystem selector. This interval is a
new managed policy; explicit foreground backends do not acquire idle shutdown.
Process qualification must verify these bounds and retain failures. None of
these selected constants is performance or native-platform certification.
