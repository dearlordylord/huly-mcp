# Resident manual adapter: #323

Status: implementation in progress; no acceptance criterion is certified.

## Resumed candidate

On 2026-10-17, resumed from `HANDOFF-resident-mcp-323-328.md` and fetched the
current GitHub bodies for #322–#328. The handoff records uncommitted implementation
at `/private/tmp/hulymcp-resident-implementation`, which is unavailable in this
Linux environment. Git retains that worktree registration and the branch at
`1e74e62561654893c17c6439cbf06190dc316857`. Neither was removed or reset.

The Linux continuation is `/tmp/hulymcp-resident-linux`, branch
`implement/resident-mcp-linux-323-328`, based on the same commit. Existing canonical
untracked evidence and the prototype branch remain untouched. Missing uncommitted
macOS files must not be described as recovered or tested here.

## Immediate verification boundary

Reconstruct streaming response decoding before wiring the adapter. JSON and SSE
must retain their native envelopes, forward progress before stream completion,
and bound body consumption. The decoder accepts an explicit byte budget owned by
the eventual adapter policy; this step does not establish a measured production
budget. No response is retried or replayed by the decoder.

The initial focused Vitest invocation could not load Linux Rollup's native module
from canonical shared dependencies. This is a harness startup failure, not a red
behavior test. Its log is `/tmp/resident-response-red.log`. A frozen dependency
installation was started in this isolated Linux worktree only; canonical shared
dependencies were not reinstalled.

## Verified Linux increment

Frozen installation completed successfully with Linux-local dependencies.
The own-package launcher now selects `src/resident/manual-adapter-main.ts` only
for explicit `MCP_TRANSPORT=stdio-http`. It parses a loopback-literal HTTP endpoint
from `MCP_STDIO_BACKEND_URL` and redacted local authorization from `MCP_AUTH_TOKEN`.
It does not resolve Huly credentials, start a backend, discover a listener, or
retry a request. Standard startup retains its original branch.

The adapter consumes bounded NDJSON input and JSON/SSE backend bodies. Request
fibers are owned by the adapter scope; cancellation interrupts the matching HTTP
stream. It uses a bounded serialized output queue and rejects mismatched response
IDs. Current numerical admission limits are provisional: 1 MiB input lines,
128 MiB total response bytes per request, eight concurrent operations and sixteen
queued output lines. These are not qualified throughput or memory budgets.

The packaged JSON and SSE routing cases failed before launcher implementation
with `SchemaError: Missing key at ["result"]["host"]`:
`/tmp/resident-process-red.log`. Both then passed. The cancellation case also
passes: one adapter receives progress from an open SSE response, cancels it, and
the fixture observes HTTP stream closure; the other adapter completes another
read. This fixture is a real owned Node HTTP server, not a Huly integration.

Current focused evidence:

- `/tmp/resident-transport-regressions.log`: 27 tests passed across resident
  decoding/process tests, existing stdio process lifecycle and HTTP transport.
- `/tmp/resident-adapter-typecheck-final-increment.log`: TypeScript passed;
  Effect checked 1,193 files with zero errors/warnings.
- Earlier adapter typecheck attempts failed first on the output queue's missing
  completion type, then on an incorrect `Done` import. These were corrected to
  the installed `Cause.Done` queue contract; those failed runs are not passes.

The process fixture uses separate adapter subprocesses under the test runner.
Independent parent launch races remain untested. Cleanup terminates and awaits
the owned adapter children and closes the owned HTTP listener/connections.

## Remaining scope

All #323 criteria remain open: explicit attachment identity/authentication,
packaged multi-process stdio/HTTP exchange and routing, modern/legacy context,
cancellation, bounded output/admission, Quint observations, documentation,
local-Huly demonstration, full quality gate and Standards/Spec review. #324–#328
remain required under the unchanged parent contract. The superseded prototype
may be removed only after production integration and qualification.

Remaining behavioral work includes cancellation during shared acquisition,
measured admission and byte budgets, initialization and legacy session bridging,
and supported interactions and continuations. The current adapter is an early
experimental path, not a complete protocol bridge. No full quality gate,
coverage receipt, fresh review, local-Huly demonstration, native macOS or Windows
evidence, or final packaged qualification exists for this candidate.

## Response lifetime and output increment

The adapter now keeps output failures in the typed failure channel. The previous
entrypoint caught failures and returned success, which prevented NodeRuntime's
failure teardown from forcing exit. Closed stdout reproduced that hang. The
entrypoint now prints a redacted diagnostic and lets NodeRuntime exit with code 1.
An unread stdout also reproduced a hang. Each serialized output write now has a
10-second allowance, matching the existing ordinary stdio shutdown deadline.
It uses Effect time and does not change existing transport deadlines.

The process checks confirm that EOF or `SIGKILL` closes the first adapter's HTTP
stream while the second adapter remains usable. Request cancellation also leaves
the first adapter usable for another call. The closed and unread stdout checks
confirm that the affected adapter exits and the surviving adapter can read again.

An SSE response ending without a terminal reply previously left the adapter
waiting silently. A fault-timing event now ends the fixture response after the
test receives progress. The regression timed out before the completion check.
The corrected implementation reports an unknown outcome and performs no replay.
The response phase and ownership decisions are pure functions. Duplicate and
foreign terminal replies are rejected before admission to stdout.

Evidence from this increment:

- `/tmp/resident-eof-death.log`: five packaged routing and release scenarios passed.
- `/tmp/resident-output-red.log`: closed and unread stdout both exceeded the
  existing fixture's 15-second exit bound. Both cases pass in
  `/tmp/resident-output-green.log` after the fixes.
- `/tmp/resident-missing-terminal-red-confirmed.log`: the missing-terminal check
  timed out after five seconds with the completion check removed. The check was
  restored before subsequent verification.
- `/tmp/resident-observed-lifecycle.log`: all 15 resident tests passed, including
  six packaged scenarios with observed response decisions replayed in Quint.
- `/tmp/resident-observation-typecheck-2.log`: TypeScript and Effect diagnostics
  passed for 1,196 files with zero errors or warnings.
- `/tmp/resident-response-model-script.log`: six deterministic Quint tests and
  10,000 sampled traces passed. All five witnesses were reached.
- `/tmp/resident-response-model-mutant.log`: allowing a second terminal reply
  violated `safety`, with a trace showing `accepted: 2` in one request context.
- `/tmp/resident-lifecycle-final-increment.log`: all 15 resident tests passed on
  the final increment, including rejection of a contradicted observation trace
  and confirmation that the missing-terminal failure itself was observed.
- `/tmp/resident-lifecycle-final-typecheck.log`: TypeScript and Effect diagnostics
  passed for 1,196 files. Focused lint and complexity passed in
  `/tmp/resident-lifecycle-final-lint.log` and
  `/tmp/resident-lifecycle-final-complexity.log`.

An intermediate replay check failed because the test expected the failed run's
name in the subprocess Error message. Quint writes that name to stdout, while
the Error message included stderr's `error: Tests failed`. The assertion now
checks that actual model-test failure. The original assertion failure is retained
in `/tmp/resident-model-alignment-checked.log`; it is not a runtime failure or a
passing check.

The [response model reference](../../quint-specs/resident-response-ownership.md)
records its bounded domain and unmodeled requirements. This adds local replay
alignment for response decisions. Full adapter lifecycle observation and the
remaining parent invariants are still pending. No #323 acceptance criterion or
later ticket is certified by this increment.

## Native backend identity and response ownership increment

Two packaged adapters now retain the actual Claude Code and Codex identities
against the packaged native HTTP backend in both modern and legacy modes.
The native host sees each client's own catalog policy, and `get_huly_context`
passes SDK output validation. This fixture uses a deliberately unavailable Huly
endpoint and does not establish live Huly read parity.

Legacy initialization records the backend's redacted session ID and negotiated
protocol version before forwarding the response. The sequential input consumer
reserves initialization before forking its HTTP request. A second initialization
fails before opening another backend session, including while the first request
waits for response headers. Session termination remains unfinished: the installed
native HTTP implementation does not support client session termination or expiry.

Native HTTP binding to port zero previously exposed port zero in
`get_huly_context`, violating its output schema. The transport now supplies the
actual bound address before readiness, and the server parses its positive TCP
port for the context result. Existing listener readiness remains separate from
full Huly-model acquisition.

Fetch responses now have explicit ownership as soon as acquisition succeeds.
The stream releases its reader lock, and the enclosing finalizer cancels the
body on completion, failure or interruption. Acquisition remains interruptible,
including before response headers arrive. Requests and replies use Effect
Schema encoding rather than direct JSON serialization.

Evidence:

- `/tmp/resident-response-cleanup-red.log` reproduces the live unsupported-body
  leak. The in-process network check passes after explicit response ownership.
- `/tmp/resident-native-parity-red.log` records modern context validation and
  legacy identity failures before the fixes.
- `/tmp/resident-native-port-red.log` reproduces invalid port-zero output;
  `/tmp/resident-bound-port-green.log` passes the focused regression.
- `/tmp/resident-native-port-fix.log` is an interrupted failed attempt. An
  obsolete address tag caused TypeScript errors; the owned test process was
  terminated and awaited before correcting it against installed declarations.
- `/tmp/resident-native-coherent-tests.log` passes 54 affected tests in seven
  files, covering resident behavior and native HTTP server/transport checks.
- `/tmp/resident-native-coherent-typecheck.log` checks 1,199 files with zero
  errors and warnings. The later initialization reservation has separate
  verification below.
- `/tmp/resident-overlapping-initialize-red.log` reproduces two overlapping
  initializers waiting until timeout. `/tmp/resident-overlapping-initialize-green.log`
  passes five checks, including initialization rejection, pre-header cancellation,
  body cleanup and packaged modern/legacy catalogs.
- `/tmp/resident-native-session-final-tests.log` passes all 55 affected tests
  after initialization reservation. `/tmp/resident-native-session-typecheck.log`
  checks 1,199 files with zero errors and warnings. Focused lint, complexity,
  formatting and `git diff --check` also pass for this increment.

### Standards review

The independent review found missing ownership for rejected live response bodies
and schema bypass through direct JSON encoding. Both findings were fixed. A
follow-up review of response ownership, encoding, bound-port plumbing, legacy
headers and initialization reservation reported no new actionable findings.
This is a scoped review, not acceptance of the entire issue.

### Spec review

The independent review identified no additional incorrect implemented behavior
or scope expansion. It retained four unfinished requirement groups: independent
parents with live Huly reads; negotiation and supported interactions; attachment
identity/generation plus shared-acquisition cancellation; and qualified budgets,
live evidence and the full gate. Legacy session release also remains unfinished.
No issue is complete, and #324–#328 remain required.

## Routing values and independent host processes

The adapter now uses native MCP routing-header encoding for Unicode values,
leading/trailing whitespace and literal `=?base64?...?=` strings. Previously a
Unicode resource URI threw during header construction and closed the adapter.
The packaged native-backend regression now receives a resource-not-found error
containing each unchanged URI, and the adapter continues serving requests.
Request envelope schemas and header construction share one module.

The native-backend suite also runs two SDK hosts in independent parent processes.
Each host launches its own packaged adapter against the suite's single native
HTTP backend. Schema-parsed observations establish distinct parent/adapter PIDs,
host-specific native/proxy catalogs, resource-template metadata and successful
SDK output validation for `get_huly_context`, in both modern and legacy modes.
Each host closes its adapter in `finally` and waits for the SDK's process-close
callback before reporting success. This wait matters because the installed SDK
may return from `transport.close()` immediately after sending `SIGKILL`.

Evidence:

- `/tmp/resident-routing-header-red.log`: the Unicode request received
  `CONNECTION_CLOSED` before the fix.
- `/tmp/resident-routing-header-green.log`: both native protocol-mode cases pass
  after encoding, including Unicode, sentinel and whitespace resource errors.
- `/tmp/resident-independent-parents.log`: all four native-backend checks pass.
- `/tmp/resident-independent-parent-suite.log`: all 22 resident tests pass after
  adding confirmed child-close waiting.
- `/tmp/resident-independent-parent-typecheck.log`: 1,202 files checked with
  zero TypeScript/Effect errors or warnings. Focused lint, complexity, formatting
  and `git diff --check` pass for this increment.

The first extracted helper needed an explicit `Headers` return annotation for
portable declaration output and a type-only `Redacted` import. The failed checks
remain in `/tmp/resident-routing-header-typecheck.log` and
`/tmp/resident-routing-header-lint.log`; they are superseded by the checks above.

Independent Standards and Spec reviews reported no new actionable findings for
this increment. The backend still uses an unavailable fixture Huly endpoint,
so live Huly reads and shared acquisition remain pending. The separate-parent
metadata evidence does not certify the full #323 criterion or later tickets.

## Authenticated listener primitive

The [attachment design](resident-attachment-design.md) records the selected
generation-authenticated channel, alternatives, failed probes and remaining
qualification. A scoped TLS agent and native HTTPS listener factory now serve
actual native MCP context calls, reject wrong keys/generations and close pending
handshakes on interruption. A plaintext listener replacing the retired native
listener on the same port receives no reusable authorization, channel key or
operation bytes. Ordinary direct HTTP and Unix-socket reporting remain covered.

The production manual launcher is not wired to the primitive yet. Protected
attachment selection/publication, attachment/session ownership and the remaining
full issue requirements remain unfinished. Current transport evidence is in
`/tmp/resident-tls-coherent-tests.log` (59 affected tests) and
`/tmp/resident-tls-same-port-replacement.log` (the additional same-port check).
`/tmp/resident-tls-coherent-typecheck.log` reports 1,204 files and zero errors or
warnings. Full quality gate, live Huly and native platform certification remain
pending.

## Protected attachment file increment

`src/resident/attachment-file.ts` defines the schema-owned generation descriptor.
It pins the file format, transport and package version, and parses channel and
bearer secrets into `Redacted` values. Reads use no-follow, nonblocking opens,
verify the opened regular file's owner and private permissions, bound input to
64 KiB, and reject invalid UTF-8. The file name must match the parsed generation.

POSIX publication checks original and canonical ancestors and refuses an
existing non-private directory without changing its permissions. It writes and
syncs a private temporary file before an exclusive hard link publishes the
immutable generation path. Scoped cleanup closes handles and removes temporary
files on interruption. Device and inode comparisons use `bigint`.

Evidence is scoped to this increment:

- `/tmp/resident-attachment-file-coherent-tests.log`: six real-filesystem checks
  and four native TLS checks pass. Cases cover private readback, permissions,
  symlinks, malformed and oversized content, wrong generation names, incompatible
  package versions, duplicate publication, interruption and a replacement
  installed before cleanup.
- `/tmp/resident-attachment-file-final-typecheck.log`: 1,207 files checked with
  zero TypeScript or Effect errors or warnings. Focused lint and complexity pass.
- Independent Standards review found no actionable issue. Spec review identified
  the cleanup race below. Initial malformed test expressions and failed
  formatting attempts were fixture errors, corrected before these passing runs.

The cleanup inode check and unlink are separate operations. They detect a
replacement already present at the check, but cannot protect against a same-user
writer replacing that path between the check and unlink. Production integration
must enforce one writer for each immutable generation through the ownership
protocol before claiming replacement-safe cleanup. This module is not wired into
the launcher. It does not establish application readiness, managed ownership,
Windows ACL isolation, or completion of any issue. Full qualification remains
pending.

## Explicit native backend startup increment

`MCP_TRANSPORT=resident-http` now selects a separate experimental native HTTPS
backend path. It requires `MCP_RESIDENT_STATE_DIRECTORY`, binds literal loopback
with port zero, and generates a fresh UUID generation with independent 32-byte
channel and bearer secrets. The existing stdio and direct HTTP paths retain
their defaults. The stdio adapter still uses its earlier endpoint/token contract;
attachment-file selection and authenticated exchanges remain the next step.

`src/resident/manual-backend.ts` captures the actual bound endpoint through the
native listener factory. It waits for application readiness before publishing
the descriptor and reporting its non-secret path on stderr. Model acquisition
is outside that readiness barrier. Stop, interruption and startup failure close
the owned listener and release the descriptor. Readiness has a five-second
allowance with a distinct static timeout diagnostic.

Standards review found that reusing the runtime retained its previous bound
address. Each generation runtime now has an atomic one-shot claim; a second run
returns a typed conflict before starting another listener. The initial regression
failed with `McpServerError` rather than generation-level refusal in
`/tmp/resident-manual-backend-reuse-red.log`. That run did not establish an actual
stale-port publication. The corrected case passes in
`/tmp/resident-manual-backend-reuse-green.log`.

Validation for this increment:

- `/tmp/resident-manual-backend-final-tests.log`: 45 tests in five affected files
  pass, including default launch and HTTP transport checks.
- `/tmp/resident-manual-backend-timeout-tests.log`: all five final startup checks
  pass. An explicit readiness barrier proves publication waits; real TCP probes
  establish listener closure after publication refusal, readiness failure and
  timeout. The timeout case advances Effect TestClock by the existing allowance.
- `/tmp/resident-manual-backend-final-typecheck.log`: 1,209 files checked with
  zero TypeScript or Effect errors or warnings before the final timeout fixture.
  The commit hook checks the final candidate again. Focused lint and complexity
  pass.
- Fresh Standards and Spec reviews found no residual issue after the one-shot
  correction and failure-path checks. The final TestClock case adds direct
  timeout evidence to those reviewed failure scenarios.

Shared start ownership, authenticated stdio attachment, session release, live
Huly and full qualification remain pending. This increment does not satisfy the
complete manual-backend slice or promote an existing default.

## Authenticated manual adapter migration

The `stdio-http` adapter now requires `MCP_RESIDENT_ATTACHMENT_FILE`. It reads
one protected descriptor and uses its generation capability on every actual TLS
exchange. The plain endpoint and adapter bearer environment settings have been
removed from source and fixtures. `docs/resident-manual.md` documents the two
explicit package launch paths.

`src/resident/attachment-exchange.ts` uses the installed Node HTTP client with
the generation-authenticating HTTPS agent. It schema-encodes the MCP body,
retains native routing headers and streams the response within the agent's
scope. Closing that scope closes owned sockets even when a response body is
unconsumed. No redirect or retry combinator is applied. The adapter retains
per-host response ownership, cancellation and bounded input/output behavior.

The wire descriptor schema describes package versions independently from the
current package. Its derived compatibility schema pins this package's exact
version for both readback and production publication. This lets process fixtures
serialize descriptors for the actual built package without weakening admission
or substituting the test source's development-version fallback.

All old plain fixture callers now use the production TLS listener. The native
process suite starts the actual `resident-http` package entrypoint and reads its
published path. Separate modern and legacy SDK parents launch their own adapters
without receiving Huly credentials or separate bearer environment settings.
The suite verifies the private descriptor disappears after normal owned backend
shutdown. The fixture backend's Huly endpoint is deliberately unavailable; these
catalog/context checks are not real Huly read evidence.

Validation:

- `/tmp/resident-attachment-adapter-red.log`: the first attachment-selected
  response fixture failed before migration because the old adapter did not
  connect using the file; its disconnect observation timed out. This establishes
  the missing selection path, not an existing TLS cleanup defect.
- `/tmp/resident-attachment-adapter-first-tests.log`: all three migrated response
  cleanup and overlapping-initialization checks pass.
- `/tmp/resident-authenticated-adapter-process-tests.log`: 15 tests in four files
  pass, including colliding IDs, cancellation, EOF, abrupt adapter death,
  truncated responses, closed or unread stdout, and independent native parents.
- `/tmp/resident-packaged-replacement-test.log`: the actual packaged adapter
  refuses a plaintext replacement on the exact retired TLS port. The replacement
  receives no bearer, channel-key bytes or operation name, and no reply reaches
  stdio.
- `/tmp/resident-authenticated-coherent-tests.log`: all 69 tests in ten affected
  files pass, including the packaged replacement check and default-launch/HTTP
  regressions. Existing response observation replays now exercise TLS fixtures.
- `/tmp/resident-authenticated-coherent-typecheck.log`: 1,211 files checked with
  zero TypeScript or Effect errors or warnings. Focused lint and complexity pass.
- Fresh independent Standards and Spec reviews found no actionable defect in
  this migrated attachment boundary.

Private per-adapter admission, legacy-session ownership/release, shared-model
waiter cancellation, actual Huly reads, full quality gate and platform
qualification remain required. The six-issue goal remains incomplete.

## Native session ownership capability experiment

The selected per-adapter design is in `resident-session-design.md`. Grounding
confirmed that initialized native HTTP UUIDs survive request disconnect, unlike
request-local legacy compatibility bindings. Two independent candidates compared
explicit controls and per-session adoption with a persistent duplex control
stream and runtime controller. The parent and independent judge selected explicit
controls with native capability adoption, retaining separate work accounting,
unknown-outcome retention and paused/resumed caller checks.

The reviewed Effect extension now exports optional
`McpSchema.McpHttpSessionOwner`. In the real initialization request context, it
receives the new UUID and a release effect bound to that exact native session
object. Registration uses uninterruptible acquisition with installed cleanup;
adoption is interruptible. Decline, defect or interruption rolls back the actual
native map entry. Headers expose the UUID only after successful adoption. The
existing native initialize error channel is `never`, so a declined adoption
cancels that request rather than widening every initialize RPC error contract.

This is a native capability experiment, not the adapter registry. The application
owner still needs to reserve admitted work, fence release and await actual target
cleanup before invoking its capabilities. The optional hook does not introduce
an HTTP DELETE endpoint, automatic expiry or a modern MCP session.

Evidence:

- `/tmp/resident-native-session-rollback-tests.log`: four actual native tests
  pass. Releasing one UUID makes native lookup return 404 while another remains
  usable; repeated release reports no remaining entry. Absent-owner behavior
  remains usable, and modern/headerless compatibility traffic adopts no UUID.
  Declined, defective and interrupted adoption leave native lookup at 404.
- `/tmp/resident-native-session-removal-mutant.log`: withholding map deletion
  makes the first test fail with HTTP 200 instead of expected 404. This proves
  the check observes native storage, rather than only a release receipt or
  project bookkeeping. The mutation was restored.
- `/tmp/resident-native-session-coherent-tests.log`: 106 tests in 14 affected
  files pass, covering resident, HTTP/context and protocol boundaries.
- `/tmp/resident-native-session-restored-stdio-tests.log`: 29 tests in six files
  pass after restoration, including all four ownership cases and five selected
  default stdio server/transport/process/output suites.
- `/tmp/resident-native-session-final-tests.log`: the final installed patch's
  four ownership cases pass. The patch was normalized at one empty context line
  to satisfy whitespace checking; installation accepts it. Comparison with the
  edit tree found only final-newline differences in four built files, with
  otherwise identical contents. Source files match.
- `/tmp/resident-native-session-coherent-typecheck.log`: 1,212 files checked with
  zero TypeScript or Effect errors or warnings. The initial fixture-only map-key
  inference error was corrected before this passing run. Focused lint passes.
- `/tmp/resident-native-session-cohort.log` and
  `/tmp/resident-native-session-reference-check.log`: exact installed cohort and
  pinned reference corpus checks pass. The lockfile and Effect reference document
  record the final patch hash. All dependency operations used Linux-local files.
- Fresh Standards and Spec reviews found no actionable native-boundary defect.

Next is the admitted-work owner and cleanup barrier, followed by private adapter
controls and crash-expiring eligibility. Native session adoption alone does not
prove release ordering while a target is held in cleanup, ownership of legacy
UUID use, live Huly reads or any complete issue's acceptance criteria. All six
issues remain required.

## Attachment resource owner and cleanup barrier

`attachment-owner.ts` implements the scoped resource core, without private wire
admission yet. Each owner reserves work before use, exposes native adoption only
while that reservation remains retained, and fences new reservations on close.
Closing cancels only that owner's tickets, waits for explicit successful cleanup,
then invokes native release capabilities. Duplicate or completed reservations
cannot adopt another session. Typed cleanup failures and defects retain blocked
ownership. Repeated close callers join one generation-scoped drain; cancelling
or timing out a waiter does not cancel cleanup or reopen admission.

Reviews caught and corrected two initial gaps: cleanup certification must cover
typed failures as well as defects, and close waiters must be interruptible while
the drain keeps ownership. The revised API separates operation and cleanup
effects. Fresh Standards and Spec follow-up reviews found no remaining scoped
finding.

Evidence:

- `/tmp/resident-attachment-owner-coverage.log`: ten tests in two files pass;
  focused owner-module statements, branches, functions and lines are all 100%.
  The native test holds both production lifecycle target retention and client
  close. Native lookup remains usable until both finish, then returns 404;
  another native legacy session stays usable throughout. This composes real
  native MCP and the production lifecycle using explicit fixture ports, rather
  than exercising an actual MCP tool's target-retention middleware or live Huly.
- `/tmp/resident-attachment-owner-premature-release-mutant.log`: removing the
  cleanup wait makes that native test fail. The mutation is restored.
- Owner tests cover duplicate and late adoption, adoption during closing,
  repeated close, typed and defective cleanup failures, and a TestClock-bounded
  waiter whose retained cleanup later completes.
- `/tmp/resident-attachment-owner-typecheck.log`: 1,214 files checked, zero
  TypeScript or Effect errors or warnings. Focused lint, complexity and format
  checks pass.
- `quint-specs/resident-attachment-owner.md`: three model scenarios pass and
  1,000 sampled traces at depth 30 find no safety violation, with all six action
  witnesses reached. This bounded resource model has no implementation observation
  alignment yet and is separate from the existing response framing model.

Private controls, adapter identity/membership authorization, the actual HTTP
retention boundary and final qualification remain pending. No full quality gate,
live Huly run or platform qualification is claimed for this increment. All six
issues remain incomplete.

## Private attachment admission and expiring eligibility

The manually started resident now issues a private attachment capability before
accepting MCP work. POST `/resident/attachments` admits one adapter; PUT renews
its lease and DELETE fences admission and joins cleanup. The generation's TLS,
bearer, Host and Origin checks wrap these controls. MCP requests require the
capability, and a legacy UUID must belong to that same attachment. No Huly
client is acquired before attachment authorization. A rejected or expired
attachment cannot dispatch a queued request or revive its former membership.

The adapter owns admission, heartbeat and release around its existing stdio
bridge. Renewal failure stops the adapter without readmission or operation
replay. Acquisition remains interruptible even inside `acquireUseRelease`.
A lost successful admission reply leaves a server-owned lease which expires
without acknowledgment. Generation-owned cleanup continues after a DELETE
waiter times out. Capacity is reclaimed only after successful cleanup;
unverified cleanup retains ownership and its slot.

The policy is recorded in [resident-lease-policy.md](resident-lease-policy.md),
including the monotonic calibration collected before lifecycle wiring. Defaults
are 32 attachments, eight requests per attachment, a 30-second lease, five-second
renewals and five-second control or close waits. Managed startup and idle
retirement are not implemented. The proposed idle policy in that document is
not active behavior. Attachment and native-session headers extend Effect's
existing redacted header set on both client and server paths.

Evidence for this increment:

- `/tmp/resident-lease-death-pause-process-tests.log`: six packaged process tests
  pass. A killed adapter's slot expires while another adapter keeps the same
  backend. A paused adapter resumes after expiry, stops with exit 1, and emits
  no reply to its queued ping. A fresh adapter can use the reclaimed slot.
- Actual HTTP target retention is now exercised by a real native MCP tool through
  `requestContextMiddleware`, the production request-client lifecycle and the
  attachment owner. Native release follows both target cleanup and client close;
  an independent adapter survives. Fixture ports provide client behavior.
- `/tmp/resident-admission-lost-reply-test.log`: the real TLS lost-reply test
  cancels admission acquisition, retains capacity until TestClock expiry, then
  admits a fresh adapter. The expired token cannot renew.
- `/tmp/resident-renewal-failure-tests.log`: rejected and stalled renewals stop
  without readmission or replay. Static failures do not expose response payloads.
- `/tmp/resident-admission-coverage.log`: 30 focused tests pass. The initial
  focused coverage report misses 99% and is diagnostic evidence only. Additional
  admission rejection and successful renewal cases pass in
  `/tmp/resident-control-final-tests.log`. Final coverage remains unconfirmed.
- `/tmp/resident-admission-final-typecheck.log`: 1,232 files checked, zero errors
  or warnings. The latest lint and full gate are tracked separately.
- The updated attachment model passes four scenarios and 1,000 sampled traces
  with all nine witnesses. See its model report for bounds and reproduction.
- Fresh Standards and Spec reviews found no remaining scoped defect after the
  lost-admission-reply correction. Their review does not certify live Huly,
  managed idle, platform behavior or the complete six-issue specification.

The latest process rerun strengthens the initialization assertion to parse the
native successful initialize result. Its receipt and the full quality gate must
be checked before committing this increment. Live Huly, complete lifecycle
observation alignment, automatic ownership, profile isolation, recovery and
final platform qualification remain outstanding. No issue is accepted complete.

### Source-level coverage and failure boundaries

The first full gate passed all 5,461 tests but failed coverage. Bundled adapter
processes do not contribute source coverage, so direct source-level tests now use
the same real TLS fixture with Effect's Stdio service. They cover JSON and SSE
output, clean EOF, cancellation, negotiated legacy reuse, duplicate and foreign
responses, partial streams, notifications, capacity and duplicate-ID rejection,
oversized input, and a TestClock-controlled stdout write timeout.

Additional cases cover invalid session headers, unencodable outgoing data,
connection loss without replay, successful renewal across two heartbeats,
capability collision, cleanup refusal over HTTP, oversized descriptor publication,
unsafe filesystem ancestors, IPv6 loopback, and use of an agent after scope close.
The alias test checks its actual OS prerequisite and retains controlled fixture
coverage when the OS alias is unavailable. The entropy port returns a parsed
capability through an Effect; production still uses cryptographic random bytes.
No module mocks, coverage exclusions or threshold changes were introduced.

Subsequent full runs passed 5,484 and 5,497 tests but still missed branch coverage.
Their retained receipts are `/tmp/resident-admission-coverage-expanded.log` and
`/tmp/resident-admission-check-all-final.log`. The latter met all other coverage
thresholds. Tests now additionally exercise the manual backend's actual admission
middleware and reject invalid listener addresses before readiness, with owned TCP
listener cleanup. Those seven focused tests pass in
`/tmp/resident-native-server-boundary-tests.log`.

Fresh Standards review found the Linux alias assumption, confirmed its correction,
and found no further actionable finding in the new boundary tests. Spec review
found no scoped defect in the token-source port or retained lease behavior.
The completed full gate receipt is `/tmp/resident-admission-check-all-green.log`;
it exits zero.


The next full run passed 5,499 tests but still missed branch coverage at 98.99%
(`/tmp/resident-admission-check-all-complete.log`). A real native resource-list
request after quiescing admission now proves refusal before Huly acquisition.
The final boundary cohort passes eight tests in
`/tmp/resident-final-native-boundary-tests.log`; 1,239 files pass TypeScript and
Effect diagnostics in `/tmp/resident-resource-listener-typecheck.log`.

The listener fixture initially used an obsolete handwritten socket-address shape;
the installed `NetAddress` constructors corrected that diagnostic failure. A
status-only ping exposed a test shutdown timeout. An attempted string replacement
missed its formatted callback, which the reviewer caught. The exact correction
now consumes the full response before release and was read back by the reviewer.
The resource-list fixture's map is explicitly typed. The intervening diagnostic
and timeout receipts remain in `/tmp/resident-admission-check-all-certified.log`,
`/tmp/resident-admission-check-all-verified.log`, and
`/tmp/resident-native-server-boundary-corrected-tests.log`. No deadline changed.


### Verified increment

`pnpm check-all` passes on the coherent Linux candidate. All 429 test files and
5,500 tests pass. Coverage is 99.46% statements, 99.00% branches, 99.03% functions
and 99.55% lines, with the original 99% thresholds. Build, TypeScript and Effect
diagnostics, dependency cycles, complexity, lint, format, duplication and the
remaining project gate checks pass. Duplication remains 0.92%.

The stronger packaged process rerun passes all six cases in
`/tmp/resident-lease-death-pause-process-final.log`. Standards confirmed the actual
response-consumption and map-type corrections and has no remaining finding;
Spec has no remaining scoped defect. No code changed after the passing full gate.

This verifies the manual attachment admission and lease increment. It does not
accept any complete issue. Live Huly, automatic ownership, profile isolation,
managed idle, durable recovery, complete lifecycle observation alignment and
final native platform qualification remain outstanding.

The [auto client-exposure increment](issue-328.md#name-driven-auto-exposure-on-one-backend--2026-10-18)
adds maintained modern/legacy reader selection and native/proxy output parsing.
Scoped packaged managed-process and actual local-Huly scenarios retain different
project payloads with colliding IDs on one backend, exact catalogs and owned
cleanup. This does not certify all client capabilities, actual-host auto mode,
manual-mode auto behavior or complete #323 acceptance.
