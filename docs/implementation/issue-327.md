# Issue 327 implementation evidence

Current lifecycle amendment: [ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md)
adopts MCPorter practices, permits interruption of all callers on backend crash
and supersedes the mandatory guardian/restricted-worker proposal. Earlier guardian
experiments and proposals below remain historical evidence.

Current uncertainty amendment: [ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md)
removes the mandatory operation journal. Earlier journal proposals below remain
historical checkpoint descriptions, not current implementation requirements.

This is an incomplete candidate under #322. No criterion or issue is accepted by
this report alone. The shared implementation remains in
`/tmp/hulymcp-resident-linux` on `implement/resident-mcp-linux-323-328`.

## Status secret assertion correction (2026-10-17)

The status tests previously passed a `Redacted` wrapper to `not.toContain`,
which did not establish absence of the actual channel key. They now unwrap only
the fixture-owned key and assert a boolean substring result, so assertion failure
does not print the key. This changes test evidence, not the production payload.
The final core/CLI unit run passes 13 tests in two files
(`/tmp/resident-status-actual-key-assertions-final.log`, SHA-256
`63f143ce3390c6e49abb85afb0948978567adcdc4e428ae735d76d14dbaca3f9`).
The final packaged CLI test also passes
(`/tmp/resident-status-actual-key-process-final.log`).

An earlier combined run failed on the first absent-directory CLI invocation,
before reaching the key assertion. Its bundle remains at
`dist/resident-status-cli-TzsiMQ/index.cjs`, with state root
`/tmp/resident-status-process-k31Mvu` and log
`/tmp/resident-status-actual-channel-key-checks.log`. The same retained CLI passed
that invocation outside Vitest; the isolated packaged test passed before and
after the boolean assertion change. These controls do not explain the earlier
failure or resolve launch/process timing qualification.

## Linux packaged stop and concurrent normal replacement (2026-10-17)

`managed-operator-stop-process.test.ts` now builds the actual MCP and CLI packages
and runs independent pinned MCP client parents in an isolated namespace. It
starts a creator and attached peer for one workspace and a separate backend for
another workspace. After the creator closes, the still-live original backend is
adopted by the Linux fixture supervisor. The packaged CLI targets that exact
generation; its acknowledgment still reports retirement unconfirmed.

The supervisor's opt-in private inherited pipe reports actual `waitpid` results
for its kernel-owned children. The fixture waits for the original backend's exit
with code zero and checks its registry retirement before launching two replacement
parents concurrently. Those parents have different adapter/parent IDs but observe
the same actual backend port and expected workspace through schema-decoded
`get_huly_context` results. Exactly one new generation exists alongside the
unrelated backend. That unrelated adapter still answers with its original port,
workspace and byte-identical record. Remaining parents close, all three backend
exits are joined through the supervisor, and the namespace becomes empty.

The context-aware operator-stop and existing two-version regression suites pass
(`/tmp/resident-managed-stop-context-verified.log`, SHA-256
`7947a28da49d7efbfab260c40f58ab1eebba6098649fc9dd9b6d47cc154d03f4`).
The redacted receipt and phases are
`/tmp/resident-managed-stop-wSWcMz.receipt.json` and
`/tmp/resident-managed-stop-wSWcMz.phases.log`. The receipt includes MCP artifact
SHA-256 `2a4b2e7573b36df5cf403f70daa5938d5d2a86c3b65c2c9283d0f8bd2c4264da`
and CLI artifact SHA-256
`996d4a684ea25ebf536105ae92b493925af94c76149e38d332d1d9bf6f4ae60e`.
No runtime code changed from `b3a3fc5c` for this qualification increment.

The supervisor retains its existing 25-second run and four-second forced-cleanup
bounds; a forced termination fails the test. Response waits remain five seconds,
retirement waits seven seconds and process tests thirty seconds. The default
supervisor mode remains unchanged and the existing two-version fixture passes
through it. Initial successful runs without context/caller-pair evidence remain
in `/tmp/resident-managed-operator-stop-process-first.log`,
`/tmp/resident-managed-stop-and-version-verified.log` and
`/tmp/resident-managed-stop-replacement-race-verified.log`. Test-only type-import
and named-constant lint errors were fixed before final checks.

TypeScript/Effect diagnostics pass 1,332 files with zero warnings. Full
lint/format/duplication, circular dependency and complexity checks pass in
`/tmp/resident-managed-stop-process-{lint,circular,complexity}.log`. Fresh
Standards and Spec reviews, including concurrent replacement and context
observations, report no actionable findings.

This proves the exercised Linux normal-stop/two-caller replacement schedule.
Its discovery/context calls do not acquire a real Huly model or mutate Huly.
It does not qualify active writes, failed finalizers, unresolved crash recovery,
the ten-parent startup race or native macOS/Windows. CLI acceptance is not the
source of retirement proof, and no PID-absence inference or runtime journal was
introduced. All remaining requirements and final whole-candidate gate remain.

## Managed stop server checkpoint (2026-10-17)

The subsequent client/CLI increment implements protected read-only target
selection, stable wire negotiation independent of CLI package version and one
POST. Its invocation knowledge is one discriminated state, replacing two flags
after Standards review identified an impossible combination. Spec review found
no actionable divergence; Standards recheck accepted the fix. No new persistent
state or lifecycle owner is introduced.

The 11 client tests pass, including real TLS acknowledgment loss, malformed and
wrong-generation acknowledgment, explicit refusal after capability negotiation,
authentication/wire refusal, different recorded implementation version and source
CLI acceptance/uncertainty (`/tmp/resident-stop-client-faults-verified.log`, SHA-256
`7104f0fd97c4880baaf9f81b6385f9553d107721c5da470724b415fbbdd4e9af`).
Each possible-submission case checks one POST and unchanged protected metadata;
pre-submission refusals check zero POSTs. The version fixture rewrites both
protected fixture payloads consistently; it is not a released-package upgrade.

The source CLI plus packaged status/stop-refusal run passes 15 tests in three
files (`/tmp/resident-stop-client-cli-verified.log`, SHA-256
`f6eaa834b027ddfcab9d1e0ddbc51ad31ac5ca3729c4589007d599363c10559c`).
The packaged stop refuses an absent exact target with NOT_FOUND/exit 5, empty
stdout and no namespace creation. It does not exercise successful packaged stop
or error-path retirement. Lint/format/duplication (0.91%), circular and complexity
checks pass in `/tmp/resident-stop-client-{lint,circular,complexity}.log`.
TypeScript/Effect diagnostics and generated CLI skill checks pass. Intermediate
TypeScript inference and destructuring-order errors were fixed without casts.
No full final gate, native-platform or live-Huly qualification is claimed.

### Earlier server-only checkpoint

The [selected design](resident-stop-design.md) reuses the existing admissions
fence and managed shutdown owner. A private authenticated exact-generation route
returns acceptance with retirement explicitly unconfirmed. Manual/foreground
lifetimes refuse. No separate stop fiber, completion witness, journal, PID signal
or ownership reset is introduced. The operator client and CLI were pending at
this earlier checkpoint and are implemented in the increment above.

Five focused suites pass 19 tests, including actual TLS authorization, malformed
and oversized input, wrong generation, duplicate acceptance and held real server
cleanup (`/tmp/resident-stop-server-verified.log`, SHA-256
`8e769e74654142f73ff76408b195d551e2edb3d593414a2346bb9aa26ba90e4a`).
TypeScript and Effect diagnostics pass all 1,326 files with zero warnings
(`/tmp/resident-stop-http-typecheck.log`, SHA-256
`6373ee7f66d06cb8a444ef447449deeae146694e6e41868a1ababd78656251f6`).
Full lint/format/duplication (0.9%), circular dependency and complexity checks pass
in `/tmp/resident-stop-server-{lint,circular,complexity}.log`. Fresh separate
Standards and Spec reviews of this server-only increment report no actionable
findings. No final whole-candidate gate is claimed.

The first native route test exposed socket reset for oversized input and empty
body handling for 405; the test now permits the bounded oversized refusal/reset
and verifies subsequent valid requests still work. The first backend test used
the nonexistent `Fiber.poll`; it was corrected to installed `pollUnsafe` before
the passing run. Initial logs remain at `/tmp/resident-stop-http-first.log` and
`/tmp/resident-managed-operator-stop-first.log`.

The tests join real backend cleanup but do not prove enclosing registry receipt
retirement, lost-ACK outcomes, cleanup-failure retention, packaged CLI behavior or
verified replacement. Those fault fixtures, remaining six-ticket requirements,
full gate and final native/live-Huly qualification remain pending.

## Current refusal and uncertainty policy

### Managed adapter diagnostic regression (2026-10-17)

The managed entrypoint now preserves `BackendResponseError` instead of replacing
it with a generic attachment-startup error. This keeps the existing
unknown-outcome/no-replay diagnostic when an admitted request loses its backend.
Admission refusal separately states that no Huly request was dispatched.

`test/resident/managed-request-loss-process.test.ts` builds the package and runs a
native backend plus the managed stdio adapter through the pinned MCP client.
The disposable REST fixture kills its owned backend only after receiving the
project query. The receipt confirms one dispatch, backend and adapter closure,
the unknown-outcome diagnostic, and byte-identical retained generation metadata.
This read schedule checks error translation; the committed-write fixtures below
remain the evidence for mutation uncertainty.

The test first failed on `unknownOutcome: false` against the old entrypoint
(`/tmp/resident-managed-request-loss-red.log`, SHA-256
`2656864a1729e11a67bfbc76f7cfad0a03e28ab7a61e8232e2becc441f51c8cd`).
The corrected test passed with its original five-second request bound and
30-second process bound (`/tmp/resident-managed-loss-verified.log`, SHA-256
`4a806f36956f4ac8918a2276822fc9e12e8efaba0523f9d41502ebcfbd1f6534`).
The existing crash-refusal fixture also passed with an added assertion for the
before-dispatch diagnostic (`/tmp/resident-managed-crash-diagnostic-verified.log`,
SHA-256 `4ea3c7c483e2e71cdfa6046376b437886c314e07993f3eb4ac0c770b258b4e10`).
TypeScript and Effect diagnostics and focused Oxlint passed.

Intermediate executions failed before backend publication, including an existing
crash-refusal fixture. Both the unchanged baseline and corrected retained bundles
subsequently published successfully, and the corrected retained bundle completed
the fault schedule in 4.49 seconds. The startup failures remain unexplained;
these focused passes do not establish launch-race reliability or final
qualification. Failed bundles, roots and logs remain available locally. Full
gate, reviews, remaining fault schedules and final live-Huly certification remain
pending for the combined candidate.

Startup does not signal a PID from registry metadata. A parent can terminate its
own prepared `ChildProcess` before attempting Start. It consumes that authority
before attempting the private Start send and never restores it after a failed
send, cancellation or lost readiness. An authorized child owns its own lifetime.

Selection treats unavailable current owners, corrupt state, unresolved claims and
multiple compatible live owners as refusal. This candidate does not yet implement
verified crash replacement. Registry retirement requires an owned receipt and the
original device/inode; failed or pending application cleanup retains publication.
PID absence alone does not establish descendant retirement.

The adapter never automatically retries an MCP operation. Encoding refusal before
HTTP execution reports non-dispatch. A failed connection, incomplete reply or
disconnected response can leave the operation outcome unknown. A new healthy
generation cannot reconcile that old operation. The caller must retain its
uncertainty and use an operation-specific read/reconciliation contract before
deciding what to do next. No general exactly-once guarantee is made.

Current compatibility requires the exact package implementation version and the
captured Huly authority, policy and generation. Known incompatible registry
versions remain opaque and can coexist within the bounded inventory. Unknown
registry formats block selection. Registry coexistence tests do not establish
native coexistence of two separately installed package versions or a migration
protocol; those remain pending.

## Separate-parent implementation-version coexistence

`test/resident/managed-version-process.test.ts` builds two isolated package
layouts, each with its own `package.json` and executable, under separate
`node_modules/@firfi/huly-mcp` installation paths. Both use the current source;
their implementation versions are the checked-out package version and that
version with a `-coexistence.1` suffix. This deliberately exercises version
identity without claiming compatibility with a different released source tree.

Two real parent processes run the packaged managed adapters against one private
registry. The fixture confirms two exact implementation versions, distinct
generation IDs and host-specific tool discovery. It closes the first parent,
waits for that backend's actual exit and record retirement, checks the second
record remains byte-identical, and reads through the same surviving adapter.
After the second parent closes, both backend PIDs are observed absent and the
private state root is empty. A Linux kernel child subreaper independently owns
and joins fixture descendants. No PID from a record is signalled by the fixture.
The receipt pairs each package identity with its executable's SHA-256 hash.

The fixture retains the existing five-second response, seven-second retirement,
30-second process and subreaper bounds. Earlier passes are in
`/tmp/resident-version-coexistence-tests.log` and
`/tmp/resident-installed-version-coexistence-tests.log`. Final receipt-shape
verification is recorded in `/tmp/resident-version-artifact-receipt-tests.log`.
The final process test passed in 21.21 seconds. Its receipt is
`/tmp/resident-version-coexistence-XPtEFY.receipt.json`, SHA-256
`393f2eb67aa5f3d822455e3304d95931c4f39b9293d09d0b24ff000eefe2795f`.
The final process log has SHA-256
`4ba8e9eae3d5699e9f4feaee8e1ab553dfb4da6c975d3565b23c0d1620f54769`.
TypeScript and Effect diagnostics passed after that refinement in
`/tmp/resident-version-artifact-typecheck.log`; focused lint and formatting also
passed on the final source.

This is Linux version-boundary and retirement evidence. It does not certify
package-manager installation, arbitrary released-version upgrades, other native
platforms, corrupt-state recovery, the full gate or final live-Huly behavior.
Those requirements remain pending. The supported intentional-coexistence policy
and upgrade limitations are documented in
[launch choices](../resident-manual.md#managed-package-versions).

### Increment review

Fresh read-only Standards and Spec reviews compared all tracked and untracked
increment files against `1e3e863d8fb867b07e1ba3606b0b63550ea798a3`. The Spec
review reported no actionable findings. Standards reported one P2: the new
coexistence helper signatures discarded existing PID, package-path and host-name
domain types. Their parameters now derive from the owning schemas, and the
Standards reviewer confirmed the fix with no residual finding. Runtime logic
did not change after the final process pass. This review does not accept the
remaining criteria or replace the combined final gate.

## Read-only managed ownership status

The CLI now provides `huly resident status [--state-directory <path>] --json`.
It resolves the same protected namespace and legacy-directory guard as startup,
without creating a root or registry, launching a backend, acquiring a claim,
probing a PID or modifying records. Default selection is shared through
`readManagedDirectoryForOwner`; an explicit directory permits inspection of a
legacy namespace without selecting it for a new backend.

Registry inventory moved unchanged into `registry-inventory.ts`, shared by
startup/publication and status. It retains the 16-record and 65,536-byte limits,
protected file reads and unknown-format refusal. Status additionally bounds
root inspection to 34 entries and checks claim/publication directories,
descriptor file handles, and descriptor/registry generation-name correspondence.
Opaque implementation-specific descriptor payloads are not interpreted or
returned. The Schema-owned result includes only recorded versions, generations,
diagnostic PIDs, claim presence and explicit unverified liveness. `absent` does
not prove retirement. Corruption, missing expected state or unsafe permissions
causes refusal without repair. This supplies neither historical operation
status nor force-stop/reset/recovery authority.

The packaged CLI process fixture runs without Huly credentials and confirms
JSON success, empty stderr, absence without creation, unchanged private records,
and one structured `INVALID_INPUT` failure for unsafe state. CLI help and the
packaged agent skill include the new surface; the skill generator and its
verification contract were updated together. The final focused run passed all
21 cases in `/tmp/resident-status-reviewed-fixes-tests.log`, SHA-256
`cba4cf23b8459b0e7ce0f6843bc915def7fb00c642d74b684cc1a865c55f08bc`.
TypeScript/Effect, full lint (including formatting and duplication), circular
dependency and focused complexity checks passed on that source.
Earlier registry and existing CLI suites passed all 64 cases in
`/tmp/resident-status-cli-tests.log`; these totals overlap and are not added.

Fresh Standards and Spec reviews compared the increment against `930b4a62`.
Both found missing descriptor-file permission inspection; Standards additionally
found duplicated legacy namespace construction. Both fixes were rechecked with
no residual finding. The new descriptor-mode test first failed before the fix
(`/tmp/resident-status-descriptor-permissions-red.log`, SHA-256
`411521d42e6e05f10aa80c2c148344e4367ec24f27e0c9cdd1749b33b19391be`),
then passed while verifying that refusal leaves mode `0644` unchanged.

### Retained launch timing failures

The unchanged ten-parent regression failed while waiting for connections:
`/tmp/resident-status-ten-parent-regression.log`, SHA-256
`f13412eef674df498381a171adb68559eca3f243e8486bc9c3e7a991d56f8963`.
The retained fixture and candidate executable are in
`dist/stdio-suite-pVXbEe/`. An unchanged baseline executable also failed the
same fixture; its ten parents eventually connected, but the last connection
arrived 5,059 ms after the coordinator began its five-second wait. Baseline
stdout and phases are retained under
`/tmp/resident-status-baseline-race-x7kjblpg`.

A subsequent controlled run of the same retained candidate executable and
fixture passed all ten parents, creator exit, survivor requests and final
retirement in 22.83 seconds. Its receipt-like stdout is
`/tmp/resident-status-candidate-race-ep66x72y.stdout`, SHA-256
`50314992d0cf506c9bd267a27de3603da716ed57840becf4e987386500abcecb`;
phase log SHA-256 is
`1e375b378720ab2b2a30d2fa94a177f9b4a6f88111b1eaa370dccac22f18e08e`.
No deadline, caller count or hold/retirement assertion changed. This pass does
not explain the earlier failures or establish launch reliability. The later
review fixes affect status permission inspection and centralize an unchanged
directory-selection expression; final qualification must use a fresh combined
artifact. Full gate, the remaining recovery/fault/native scenarios and final
live-Huly certification remain pending.

## Committed-write response loss

`test/resident/uncertain-write-process.test.ts` drives the packaged manual adapter
over actual authenticated TLS. A disposable fixture commits a private file write,
then loses its response either before headers or after the host observes a progress
notification. The second schedule uses an explicit fault callback after observed
progress, rather than a timing delay. Independent file parsing confirms one commit,
and the fixture counts one dispatch. The adapter exits with no terminal reply and
with an unknown-outcome/no-replay diagnostic. Owned child handles are joined, the
listener is closed, and failed bundles are retained.

The after-progress case first fails because the diagnostic says only
`Backend response disconnected` (`/tmp/resident-uncertain-stream-write-red.log`).
The adapter now includes the unknown-outcome and no-replay wording on that path.
The fixed two-schedule fixture and nearby adapter boundary tests pass, 16 tests
(`/tmp/resident-uncertain-stream-write-green.log`). This fixture demonstrates
response loss after a disposable mutation; it does not
simulate backend process death or establish live Huly reconciliation.

## Published-backend crash and stale-locator refusal

`test/resident/managed-crash-process.test.ts` runs the actual packaged backend and
managed adapters under the Linux kernel subreaper. After the backend announces
application-ready publication, the fixture records its actual private directory
and registry inventory and checks the child lists of every kernel task. It then
kills only its own backend `ChildProcess` handle and joins that handle. Recovering
adapters refuse the unavailable owner and a foreign plaintext listener bound to
the old port. They emit no stdout, retain the original record bytes and complete
root/registry entry inventory, and leave the foreign listener running.

The fixture initially assumes the root contains only a locator and `generations`
(`/tmp/resident-managed-crash-refusal-tests.log`). Actual forced-crash evidence also
retains the owner's `.attachment-*` staging directory. The fixture now compares the
observed pre-kill inventory instead of guessing which uncertain state may remain.
Failed bundles and private roots are retained. Successful teardown removes only
its own root after the subreaper joins all descendants.

Review identified chunk-local credential scanning as inadequate evidence. The
shared `makeByteDisclosureDetector` now retains a copied, bounded per-socket
overlap, and both foreign-listener fixtures use it. Properties compare arbitrary
TCP chunks to a whole-stream oracle and force an inserted secret through one-byte
fragments. Review also required comparing nested registry entries, not only root
entry names. Both findings are corrected. The refined three-suite run passes ten
tests (`/tmp/resident-crash-disclosure-refinement-tests.log`).

This is Linux safe-refusal evidence with no Huly model acquisition. It does not
prove replacement after a crash, cleanup of acquired Huly resources, mutation
reconciliation, or native behavior on another platform. The pre-kill task inventory
is a recorded observation; descendant retirement is separately joined by the
kernel-owned subreaper.

The frozen increment passes `pnpm check-all`: 456 files, 5,635 tests, statements
99.45%, branches 99%, functions 99%, lines 99.56%, with all diagnostics and existing
limits retained. Receipt: `/tmp/resident-crash-refusal-frozen-check-all.log`, SHA-256
`7617283189a8d30e50a7af119f8f88b0c0ca5d3a7c319b1292d1c7aa7654ea63`.
Its process receipt is `/tmp/resident-crash-refusal-vwGFuv.receipt.json`.
Fresh Standards and Spec reviews identify no remaining finding after the two
evidence corrections. No production source changes belong to this test increment.

## Native shutdown confirmation

Ownership tracing finds that native HTTP shutdown logs and absorbs drain or
listener-close failure and timeout. A resident owner could therefore complete
successfully and retire its registry after incomplete cleanup. The corrected
transport regression fails against committed source in
`/tmp/resident-confirmed-shutdown-corrected-red.log`. A separate actual TLS
server/registry regression also fails against committed source in
`/tmp/resident-native-retirement-registry-red.log`.

Resident TLS factories now require confirmed shutdown. The default direct-HTTP
factory retains best-effort reporting. A confirmed failure produces a static
typed `HttpTransportError`; listener cleanup is still attempted after drain
failure. The resident registry remains published after the failed owner exits,
and a fresh selection refuses attachment and replacement. This fixes retirement
proof propagation, not crash replacement.

Review finds two additional failure schedules. An uninterruptible scope finalizer
can outlast an Effect timeout, and a throwing diagnostic sink can skip listener
closure. Shutdown now separately owns each cleanup operation and bounds its join
waiter. A listener close keeps its scope until cleanup settles; timeout reports
unconfirmed retirement. A timed-out drain receives a nonjoining interruption
request, retaining any pending cleanup. Diagnostic delivery failures become
static typed failures. The held-finalizer fixture observes refusal before
releasing cleanup, then joins its finalizer and actual listener closure.

The corrected observed failure is
`/tmp/resident-held-retirement-observed-red.log`; the two-case passing run is
`/tmp/resident-held-retirement-green.log`. Earlier held-finalizer fixtures assumed
serial finalizer execution and subscribed to listener closure too late; those
attempts are retained separately and are not the final proof. The initial drain
fixture also applied its policy to the wrong helper; that wiring error is
recorded in `/tmp/resident-confirmed-shutdown-green.log` and corrected before
reproducing the production failure.

The four affected suites pass 40 tests in
`/tmp/resident-confirmed-retirement-bounded-focused.log`. Explicit drain-finalizer
joins and held-close/sink cases pass in
`/tmp/resident-confirmed-retirement-owned-finalizers.log`. TypeScript and Effect
diagnostics pass for 1,303 files with zero errors or warnings in
`/tmp/resident-confirmed-retirement-bounded-typecheck.log`. Both scoped reviews
report no remaining finding after the corrections.

The frozen full gate passes 457 files and 5,645 tests, with statements 99.45%,
branches 99%, functions 99% and lines 99.56%. All existing diagnostics and limits
remain enabled. Receipt:
`/tmp/resident-confirmed-retirement-frozen-check-all.log`, SHA-256
`e06b35eeca70891f71d8ea8ea7e16fa502753668fa7fd7418a10a1d57d9dea46`.
The packaged `dist/index.cjs` SHA-256 is
`a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.
Its ten-parent receipt is `/tmp/resident-managed-parents-5Q8R15.receipt.json`.
This pass does not erase the earlier intermittent launch-race failure.

The [recovery design decision](resident-recovery-design.md) records the conditional
next architecture: a surviving guardian retaining original child and publication
capabilities. Two independent-role sketches and a cross-review converge on that
shape, subject to packaged containment falsifiers. No guardian/restricted-worker
implementation or recovery claim is introduced by this fix. Design artifacts and
their local failed flag probe remain in
`/tmp/resident-recovery-design-2d9acdd6/`. The actual current engine contract is
Node >=22.19.0; stale Node20 framing in the initial design prompt is corrected in
the maintained decision.

## Restricted packaged SDK experiment

The test-only `restricted-native-process` fixture runs the actual packaged
`resident-http` backend under Node permissions, with native addons disabled.
An awaited import preload exercises child-process creation, Worker creation,
addon loading, WASI construction and inspector opening. All five must be denied
before the application entrypoint runs. No production launch policy changes.

A real SDK stdio adapter then calls `list_projects` twice through the native MCP
backend. A disposable loopback HTTP server implements the installed SDK's config,
workspace selection, account, full-model and project-query protocol. Schemas own
the fixture payloads. The actual pinned Huly SDK requests `full=true` and constructs
its model once; both project reads return the expected empty result. This uses an
empty synthetic model, not a real workspace or representative large model.

The fixture observes every backend kernel task's child list, kills only its own
backend handle, joins closure, requires the old port to refuse TCP connection and
checks retained registry bytes. The existing Linux subreaper independently joins
descendants. The probe creates and aborts only its own socket. No metadata PID or
foreign listener is signalled.

The unrestricted control removes the permission policy while retaining
`--no-addons`. Actual child, Worker, WASI and inspector probes then succeed, and
the preload refuses application startup. The test requires a normal failure exit,
empty stdout and no publication, excluding timeout/signal termination. This checks
that the denial probe is capable of falsifying the proposed policy.

The initial control incorrectly kept filesystem grant flags without enabling
permissions; Node rejects that CLI before running the probe. That failed attempt
is preserved in `/tmp/resident-restricted-native-controlled.log`, with its bundle
and root retained. The corrected control removes the dependent grant flags too.
Initial typechecking also catches an unparsed SDK structured-content access;
the result envelope is now parsed before use.

Both cases pass on Linux arm64 with Node 24.20.0, 22.22.2 and the declared minimum
22.19.0. Receipts are respectively
`/tmp/resident-restricted-native-5RKJe5.receipt.json`,
`/tmp/resident-restricted-native-lcBAMm.receipt.json`, and
`/tmp/resident-restricted-native-oNRu2M.receipt.json`. Logs are
`/tmp/resident-restricted-native-closure-node24.log`,
`/tmp/resident-restricted-native-closure-node22.log`, and
`/tmp/resident-restricted-native-minimum-node22.log`.
The isolated Node 22.19.0 archive matches its
[official checksum](https://nodejs.org/dist/v22.19.0/SHASUMS256.txt):
`0b2d9f564b6594222a62c82e1df2efe119dd4a4aff29644f4dd325bf360b6bcc`.
Dependencies and host configuration are unchanged.

Both scoped reviews find no actionable defect. TypeScript and Effect diagnostics
pass in `/tmp/resident-restricted-native-closure-typecheck.log`. The full gate
passes at the checkpoint recorded below. This experiment does not qualify inherited
IPC handle transfer, guardian control, ownership-file write isolation, durable
uncertainty, verified replacement, live Huly or native macOS/Windows behavior.
Filesystem reads and writes are unrestricted in this experiment. The recovery
design remains conditional on the remaining premises.

## Checkpoint before pause, 2026-10-17

The first full gate for the restricted experiment fails in the existing ten-parent
launch race. The new restricted cases pass. The preserved log is
`/tmp/resident-restricted-native-frozen-check-all.log`, SHA-256
`585f7305067808cd1d0a56a51933e9f96f34b29cbfea2f773de40094263e44b8`.
Nine parents reach their five-second SDK connection deadline. The remaining parent
connects after 5,029 ms. These observations do not establish the cause.

The harness now runs the same ten-parent file in a dedicated `resident-launch`
project before unrelated suites. Vitest's installed `sequence.groupOrder` API
orders the projects. All ten parents, deadlines, assertions, retries and coverage
settings are unchanged. Before and after `vitest list --filesOnly --json=...`
inventories contain the same 458 files exactly once; only that project's assignment
changes. This arrangement controls competing suite work but does not prove that
contention caused the earlier failure or provide performance qualification.

`GOMAXPROCS=2 pnpm check-all` passes on the frozen executable candidate:
458 files, 5,647 tests; statements 99.45%, branches 99%, functions 99%, lines 99.56%.
The log is `/tmp/resident-scheduled-launch-check-all.log`, SHA-256
`30c4c9b210f77b432b95bdd0ee3f1f5f3db7b41a93e09d6e7a4e5b9821a78281`.
The packaged MCP bundle SHA-256 is
`a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.
Fresh Standards and Spec reviews find no actionable issue in the experiment or
scheduling change. This checkpoint completes neither #327 nor the six-ticket goal.
The [pause handoff](HANDOFF-resident-mcp-323-328.md) records the resume boundary.

## Remaining qualification

Complete crash timing schedules, verified replacement with concurrent callers,
late acquisitions and descendant inventory, reused-PID/foreign-listener refusal,
two-installed-version coexistence, and failure isolation across configurations.
Align observed transitions with the approved lifecycle model and record its safety
domain and liveness assumptions separately. The new model remains a type-only
sketch awaiting approval. Final live Huly write/reconciliation and native-platform
qualification remain pending. The combined Linux checkpoint passes `pnpm check-all`
with 454 files and 5,632 tests at the unchanged thresholds
(`/tmp/resident-lifecycle-boundaries-frozen-check-all.log`). Fresh combined Standards
and Spec reviews report no actionable defect in staged tree
`b5ed29cd8cd11336fa2430a6e835ed327824a3e9`; neither accepts any issue as complete.


## Guardian IPC and protected files, 2026-10-17 resume

The user resumed #323 through #328 from the #328 checkpoint comment at
`be8855e9`. No ticket is complete. This increment extends the existing packaged
restricted-runtime experiment without changing production source or launch policy.

The owned parent sends a schema-encoded random challenge over its original IPC
channel. The pre-import worker parses the challenge and returns a schema-encoded
reply. The parent verifies the reply before accepting native readiness. The IPC
channel remains connected until the original child is killed and joined. No
process or socket handle is transferred.

The worker has filesystem write permission only for its disposable backend state
directory. A separate guardian directory lies outside that grant. Before SDK
imports, synchronous overwrite, rename and removal probes must each receive
`ERR_ACCESS_DENIED` with `FileSystemWrite`. The parent independently verifies the
exact guardian directory inventory and every original file's contents. The
unrestricted control performs those edits and removals successfully, then refuses
native startup. Both cases retain the original deadlines and owned cleanup.

Both cases pass on Linux arm64 with Node 24.20.0, 22.22.2 and the minimum 22.19.0.
Final receipts are `/tmp/resident-restricted-native-hDGAT0.receipt.json`,
`/tmp/resident-restricted-native-yUZzqU.receipt.json` and
`/tmp/resident-restricted-native-mfPGPX.receipt.json`, respectively. The final
22.22.2 focused log is `/tmp/resident-guardian-permissions-final-node22.log`.
The minimum-version log is
`/tmp/resident-guardian-permissions-minimum-sync-probes.log`.

Two failures remain preserved. Disconnecting IPC early reaches the reads but
fails the bounded original-child close wait in
`/tmp/resident-guardian-permissions-close-diagnosis.log`. The passing case does
not qualify that disconnect schedule. On Node 22.19.0, promise-based denied rename
leaves an exception that surfaces during a later permitted write. That failure
is preserved in `/tmp/resident-guardian-permissions-minimum-diagnosis.log` and
was reproduced separately using only disposable filesystem operations. The
passing probe qualifies synchronous filesystem denial only. No Node runtime
minimum, restriction or deadline was relaxed.

The first exploratory gate fails formatting while diagnosis edits are still in
progress. Its log is `/tmp/resident-guardian-permissions-check-all.log`. After
formatting and freezing the executable TypeScript and test files,
`GOMAXPROCS=2 pnpm check-all` passes all 458 files and 5,647 tests. Coverage remains
99.45% statements, 99% branches, 99% functions and 99.56% lines. Its log is
`/tmp/resident-guardian-permissions-frozen-check-all.log`, SHA-256
`709fff2c152437bc706d5e45a0effbeaed64371335f7c96a7047e2b372cd4908`.
The unchanged production bundle SHA-256 remains
`a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.
Fresh Standards and Spec reviews find no actionable defect in the experiment.

The guardian-aware [type sketch](../../quint-specs/resident-launch.qnt) and
[scope note](../../quint-specs/resident-launch.md) are proposed separately from
that frozen executable candidate. `pnpm exec quint typecheck` passes for the
sketch. No initialization, actions, invariants or simulation result are added.
The sketch now separates callers, guardians, restricted workers, per-identity
claims, leases, requests and durable journal entries. Review requests explicit
journal capacity and separate reservation acknowledgment; both are encoded in
the proposed types. Logic still awaits explicit approval.

This experiment proves neither production guardian publication and recovery nor
worker ownership of acquired Huly resources. Read grants remain unrestricted,
and the worker still publishes its own disposable backend state. Guardian-only
production publication, filesystem alias behavior, durable uncertainty and
replacement remain unimplemented. Native macOS and Windows, real Huly behavior,
actual host discovery and adapter-inclusive measurements remain pending. Raw
receipts are local evidence, not uploaded certification artifacts.


## Operation journal decision after review with Astra

The user requested an independent decision with Astra and corresponding
specification changes. Both reviews conclude that the durable operation journal
is unnecessary for a transport that never replays or restores requests. Opaque
journal entries cannot reconcile remote Huly effects, deduplicate new-ID calls
or prove host receipt. ADR 0002 explicitly excludes cross-session operation-status
lookup while preserving truthful unknown outcomes and protected ownership
inventory. This changes an ambiguous evidence-retention requirement in #322 and
clarifies #327; it is not acceptance of the unchanged earlier contract.

The proposed Quint sketch removes journal entries, capacity, reservations and
durability acknowledgments. Invocation history is explicitly oracle state keyed
by adapter incarnation and ordinal. Terminal production, adapter receipt,
queue admission and host observation are separate phases. The sketch still has
no logic and needs type-sketch approval before transitions. The amended design
requires the existing fault cases plus heartbeat, output-loss, total caller-loss
and delayed remote-commit schedules. No runtime behavior or deadline changes in
this decision, and no recovery, deletion-safety or live-Huly result is claimed.

The reviewed amendment is published in the bodies of
[#322](https://github.com/dearlordylord/huly-mcp/issues/322),
[#327](https://github.com/dearlordylord/huly-mcp/issues/327) and
[#328](https://github.com/dearlordylord/huly-mcp/issues/328). Each body was compared
with the reviewed source before editing and read back exactly afterward. All
50 parent stories remain verbatim. All 11 #327 criteria and all 15 #328 criteria
remain; one #327 criterion is clarified by the explicit evidence-lifetime scope.
No issue state or historical comment was changed.

Astra's final read-only audit finds no actionable issue after narrowing the
fresh-read wording to preserve explicit operation-specific reconciliation.
`pnpm exec quint typecheck quint-specs/resident-launch.qnt`, local specification
links and `git diff --check` pass. No TypeScript runtime or test source changes.
The production bundle hash remains
`a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.

The fresh `GOMAXPROCS=2 pnpm check-all` attempt passes the preceding gates but
fails the unchanged ten-independent-parent launch fixture: 457 files and 5,646
tests pass, one file/test fails. The fixture's parents reach their five-second
connection deadlines. This is a preserved failure, not a successful gate or a
proven diagnosis of contention. The log is
`/tmp/resident-no-operation-journal-check-all.log`, SHA-256
`3fd34e47b137ce0fb30ce1745ec19646d06857922f1c7f0fb91d4483109d0c74`.
The retained fixture root is `/tmp/resident-managed-parents-0vzqPO` and its bundle
is `dist/stdio-suite-0FRQT2`. No concurrency case, deadline or assertion is changed.

The single follow-up isolation run of
`pnpm exec vitest run test/resident/managed-backend-process.test.ts` passes its
one existing test with the same ten parents, assertions and deadlines. Log:
`/tmp/resident-no-journal-ten-parent-isolation.log`. This isolated pass neither
erases the full-gate failure nor identifies its cause. No broad rerun is used
to replace the failed receipt, and no full-gate success is claimed for this
specification amendment.


## Adopted lifecycle practice and crash boundary

The user directed us to put the already researched practice into the
specification and rejected stronger operation-durability or multi-client crash
continuity as a feature requirement. [ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md)
adopts MCPorter's coordinated startup, authenticated ownership, generation fences,
graceful drain and bounded refusal after unresolved owner loss. It explicitly
supersedes the conditional guardian/restricted-worker baseline. A backend crash
may interrupt every client, with ordinary stdio's existing remote-write
uncertainty and no automatic replay.

The exact reference `docs/daemon.md` at MCPorter commit
`1e3fa8a893e3245a0843f714f81bfdf3b0ad5dbc` was fetched again through GitHub's
contents API. The local source receipt is
`/tmp/resident-mcporter-pinned-daemon.md`, SHA-256
`a9ec3fe4a503e3944a159f099399228ae4b7cc79130bad821f6e2aac6ed0e6d4`.
The application retains native HTTP/TLS and per-compatible-configuration
backends. It does not copy a universal broker, foreign timeout/lease budgets,
unknown-outcome idle pinning or a third-party runtime dependency.

The amended bodies of #322, #324, #326, #327 and #328 were checked against their
source before editing and read back exactly after publication. All 50 parent
stories and every affected acceptance checklist remain verbatim. The explicit
new scope permits crash interruption and stale-owner refusal until verified
local retirement; it does not silently claim the stronger previous recovery
contract. Healthy-backend cancellation/EOF/idle isolation, credential boundaries,
all concurrency cases and native qualification remain required. Same-user
manual destruction of live ownership state is not supported automatic recovery;
detectable corrupt or missing expected state still refuses unsafe selection.

The model sketch now contains callers and native backends, with unverified,
owned-closure and operator-verified retirement evidence. Guardian, restricted
worker and operation-journal types are removed. Invocation history remains
oracle-only state. `pnpm exec quint typecheck quint-specs/resident-launch.qnt`,
local specification links, checklist preservation and `git diff --check` pass.
No initialization, transitions, simulation or runtime implementation result is
claimed. No TypeScript runtime/test code, concurrency case, deadline, coverage
threshold or platform requirement changes in this amendment.

The fresh `GOMAXPROCS=2 pnpm check-all` run passes 458 files and 5,647 tests.
Coverage is 99.45% statements, 99% branches, 99% functions and 99.56% lines.
The receipt is `/tmp/resident-adopt-practices-check-all.log`, SHA-256
`bc37a91a0977d7a39c7d9d79713d04bc6c3e5942de2030339e3e18888a73327d`.
The production bundle remains unchanged at SHA-256
`a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.
The earlier failed ten-parent run remains preserved above; this pass does not
identify its cause or claim to fix it. This specification amendment completes no
feature ticket and supplies no new live-Huly or native-platform certification.

## Stop during an operation and failed cleanup (2026-10-17)

`managed-stop-fault-process.test.ts` runs the packaged MCP adapter and CLI
against an embedded native backend with an explicitly injected tool registry and
client-close port. The tool commits one disposable filesystem write, then the
host explicitly cancels its pending response after authenticated operator stop.
This exercises host cancellation during stop, not spontaneous response loss or
a real Huly write. The fixture payload lives outside the protected resident
namespace; it is test evidence, not a runtime operation journal.

Both schedules retain byte-identical ownership metadata while cleanup is held.
Successful cleanup joins the owned backend exit with code 0, retires ownership,
and permits a fresh packaged backend generation. Failed client cleanup joins exit
code 1, retains the original record, and refuses replacement before dispatch.
Both receipts assert one dispatch, one committed write and redaction of the
private failure cause. Replacement shutdown is independently joined through the
kernel-owned child reaper; no signal targets a PID read from metadata.

The final focused run passed 17 tests in two files, including the existing
managed-owner suite. Log: `/tmp/resident-stop-fault-final-verified.log`, SHA-256
`9b912e1c585eeb51dd22ee3f17305bffbfa6e86c8f798750d3eaac1504a4c9ec`.
Normal receipt: `/tmp/resident-stop-fault-3okrQ0.receipt.json`, SHA-256
`22c5eb5172482e839d317b71c3b9c744fe0094a909360856513c6e6bc41b2181`.
Failed-cleanup receipt: `/tmp/resident-stop-fault-LpFyXX.receipt.json`, SHA-256
`44fb198b117a921963e25242383500b3845306c13fa9ad80b1bf2d978d715623`.
Each receipt separately hashes the production MCP/CLI artifacts and the embedded
backend fixture, so the fixture is not presented as a production backend bundle.

Earlier failed diagnostic-observation attempts remain in
`/tmp/resident-managed-stop-fault-first.log` and
`/tmp/resident-stop-fault-retention-diagnosis.log`. The pinned MCP client probes
versions through a disposable sibling transport whose stderr does not belong to
the original transport. The final fixture therefore observes the actual packaged
adapter refusal directly, while retaining the SDK connection-refusal check.
No production behavior, deadline or assertion was weakened to resolve that test
observation issue. Fresh read-only Standards and Spec reviews reported no
actionable findings.

This evidence does not qualify actual Huly client cleanup, remote write outcome,
crash recovery, native macOS/Windows, or the unresolved ten-parent race. The full
six-ticket delivery, final coherent gate and deferred live-Huly campaign remain
pending.

## Refuse detectable ownership-state loss before selection (2026-10-17)

Managed startup previously read only the generation registry. Removing a record
or its directory while leaving a locator therefore allowed the `absent` branch
to authorize a fresh owner, although read-only status already rejected the same
inconsistent namespace. `/tmp/resident-state-loss-red.log` preserves the two
failing-before cases (SHA-256
`a7a64a03ef0013ffdbef0df87500d938efa61c1a87f284e2d13c52c1fc5b9462`).

The shared `namespace-inventory.ts` core now reads bounded, protected namespace
entries and parsed registry envelopes. Status projects metadata from that result;
selection consumes the same parsed records under its claim before opening or
creating a registry directory. Missing expected records/locators refuse without
repair or owner launch. Foreign implementation payloads remain opaque.

Review exposed another detectable-loss case: removing both indexes while leaving
the publication directory. Its failing regression is
`/tmp/resident-state-loss-orphan-red.log` (SHA-256
`a512b5d461fb6f253fd7926881b45cf5a962131a7c3ad1208fb0d9e5526d8eb9`).
Every publication now requires a private attachment file whose device/inode
matches a protected root locator. The writer and reader share the publication
filename constant. The check does not interpret a missing PID, quiet port or
complete namespace erasure as retirement evidence.

The packaged Linux fixture holds a real adapter/backend generation while it
injects, in order: corrupt registry bytes, a missing record, missing registry
directory, missing locator, and both indexes missing with publication retained.
Each new adapter exits 1 with no protocol reply, preserves the fault, and omits
the tested TLS key/bearer values from diagnostics. The original adapter keeps its
identity/port/workspace and continues synthetic catalog/context reads. The
fixture explicitly restores its own injected files; production performs no
repair. It then closes the caller, joins the supervisor's kernel-owned backend
exit with code 0, and verifies complete private-state removal.

Final process log: `/tmp/resident-state-loss-final-process.log`, SHA-256
`cb23bf28b104e3c2dd761df348d5fca44c8f664132fdd31a315b6cd06b4fc2f8`.
Receipt: `/tmp/resident-state-loss-qTQ8bE.receipt.json`, SHA-256
`aa4c808b0e010f043839d74de339cd89b301ef69c7f5dcf5047e19e0dd62fafe`.
Its packaged MCP SHA-256 is
`a35a9c71155115e206ee54bee0a74f415db212d243bfadb00b6d8d8382e8a95b`;
coordinator and host hashes are recorded separately. Earlier scoped process
receipts remain preserved. All existing response/supervision deadlines remain.

Existing fixture owners now publish paired locators and registry records rather
than relying on incomplete metadata. The final targeted owner/idle/status/state
loss/admission suite contains 36 tests. Fresh Standards and Spec reviews had
no residual actionable findings after inode association, artifact path typing,
and shared filename corrections. This is synthetic local process qualification,
not real Huly mutation evidence, native macOS/Windows certification, or completion
of the full six-ticket contract. No operation journal or automatic replay exists.

Final validation logs: `/tmp/resident-state-loss-final-unit.log` (36 passing tests),
`/tmp/resident-state-loss-final-verified-typecheck.log` (1,342 files, zero
errors/warnings), and `/tmp/resident-state-loss-final-verified-{lint,circular,complexity}.log`.
All exited successfully. The source increment does not replace the coherent
final `check-all` or the deferred real-Huly campaign.

## Parse and compare current locator contents (2026-10-17)

Private permissions and publication inode association did not detect changed
locator contents when the registry copy remained intact. Five failing-before
cases cover malformed JSON and otherwise valid descriptors with changed bearer,
TLS key, endpoint or generation. Log `/tmp/resident-locator-corruption-red.log`,
SHA-256 `2e42b509aaacfb7d9ca62c2d291e98ce1bc7ed8eee3eb7bc9076953800d35645`.

The shared namespace reader now parses current-version locators through the
existing bounded attachment codec and compares all schema-owned fields with the
registered descriptor. Schema-derived equivalence compares Redacted secret
values without unwrapping or stringifying them. Endpoints compare their normalized
`href` values. The parsed matching descriptors are passed directly to selection;
the previous second registry-descriptor parse is removed. Whitespace-only JSON
changes are accepted, while another implementation's locator and descriptor
payload remain opaque. Filename, permission and publication-link checks still
apply to every version.

The final nearby run passes 43 tests in six files, including the five regressions,
whitespace equivalence, foreign opaque payloads, status, missing metadata,
selection, ambiguity/interruption cleanup, owner lifecycle and idle retirement.
Log `/tmp/resident-locator-final-nearby.log`, SHA-256
`478a7c7cfd3dc8045109eb846359fb7617a1bb2211323d8e9b79de02ad71d964`.
TypeScript/Effect checked 1,343 files with zero errors/warnings; lint, circular,
complexity and both fresh read-only reviews pass without actionable findings.

The packaged fixture now requires all seven metadata-fault schedules: its prior
five plus malformed locator bytes and a valid mismatched bearer. The original
adapter remains usable; new adapters refuse without a protocol reply or fixture
Huly token/original/mutated bearer/TLS-key text in diagnostics. Explicit fixture
restoration precedes successful kernel-owned backend exit and complete cleanup.
Process log `/tmp/resident-locator-corruption-process.log`, SHA-256
`953377632df9c49a6a700bef98d7fcb0dcefe53ae1001069fc82208479d54e2e`.
Receipt `/tmp/resident-state-loss-IWfDMp.receipt.json`, SHA-256
`e1add847a8a147b811be08b54b4807d86d4625fe6178a7a3c33cbf501a57cf04`,
records MCP artifact SHA-256
`46d6da1873caab884f407e205a809db70cbc9904cf85fdf39317d70f82b49db6`
and separate coordinator/host hashes. All deadlines and required earlier faults
remain intact. This is synthetic Linux metadata-fault evidence, not real Huly
mutation or native macOS/Windows qualification. The final combined gate and full
six-ticket delivery remain pending; no operation journal or replay was added.


## Adapter loss followed by a delayed remote commit — 2026-10-18

`delayed-commit-process.test.ts` uses the packaged manual stdio adapter against an
owned real TLS fixture. The remote operation reaches the fixture once, then its
counter commit is held behind an explicit Deferred. The fixture counter is remote
domain payload for this test, not resident ownership metadata or an operation
journal. The host kills only its actual owned adapter process, joins its SIGKILL
exit, confirms that the HTTP response disconnected, and observes no terminal
stdout. No diagnostic is expected from an abruptly killed adapter.

A different adapter then submits a read with the same request ID 1 and sees the
old counter value 0. Only afterward does the original remote operation commit.
The fresh adapter's continued read with ID 2 sees 1. The fixture records exactly
one write dispatch and two read dispatches. The reader exits normally with code
0; fixture operations are joined and the owned TLS listener is closed. This
shows why an intervening ordinary read cannot establish that an old unconfirmed
write failed. It does not add historical operation lookup, automatic replay or a
new runtime reconciliation rule.

The bounded-exit focused run passes both files / three tests, including the two
existing before-headers/after-progress loss cases. Log:
`/tmp/resident-delayed-remote-commit-bounded-exit-focused.log`, SHA-256 `bd4685982578f1bd8065b0d07358d14af69895fdfc86c7cabb82fcdef7656c76`.
Standards review found that the first test version started its exit timer at
spawn. The corrected test captures close events immediately but starts the same
five-second bound only when awaiting shutdown. The readback resolves that finding;
Spec review has no actionable scoped finding. The earlier full gate was
intentionally interrupted during lint to apply this review fix, not reported as
a completed gate: `/tmp/resident-delayed-remote-commit-check-all.log`, SHA-256 `4916c72a1aab308a571225f82d69aecdbd4f66de042d6bf9e4da9a44ef666cdb`.

This is adapter-incarnation loss with a delayed fixture commit. The externally
owned backend generation stays alive throughout. It does not cover late commit
after verified backend retirement/replacement, actual host-process death, native
Huly SDK mutation or live Huly behavior. Those extensions, complete lifecycle
qualification and all six issue outcomes remain pending. No production source,
existing timeout, coverage threshold or test was changed.


The corrected candidate passes `GOMAXPROCS=2 pnpm check-all`: 481 files / 5735
tests; statements 99.45% (29550/29713), branches 99% (12463/12588), functions
99% (7996/8076), lines 99.55% (27159/27280). Every quality-gate stage passes
with the original thresholds and bounds. Log `/tmp/resident-delayed-remote-commit-bounded-exit-check-all.log`, SHA-256
`56f75e089d9c6f328c385af9dccb798dc93f0e35a8b693c9d77df8e0bbab895f`. Frozen artifacts, successful logs and the
interrupted attempt are retained at `/tmp/resident-delayed-commit-gate-rafe398k`.
MCP SHA-256: `7cc7b8c300354694118b08e2b39248e5ea08e1de1df7bae2ce56ecf7a43c8a12`;
CLI SHA-256: `c957044a36f2559fbdf5230a0f37860911af276f800b1a37933539d7298f5697`.
Runtime bundles match the preceding candidate. This test increment does not
complete #327 or the full #323–328 delivery.
