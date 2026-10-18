# Resident MCP #323–#328 implementation handoff

## Scope amendment — 2026-10-18

The user excluded Windows resident support because substantial implementation and native qualification remained. Linux and macOS remain in scope. Windows resident startup continues to refuse unsupported execution; the unused native security component and its CI workflow are removed. Historical Windows investigation below is superseded, not pending delivery work. All other requirements remain, and #322–328 remain open.


The user resumed implementation on 2026-10-17 after the pause checkpoint
`be8855e9`, following the latest #328 comment. All six issues remain incomplete
and open.
This document supersedes the early Darwin checkpoint for current implementation
state. It does not change the authoritative requirements in GitHub #322–#328.

## Current checkpoint — 2026-10-18

Windows resident work is canceled under the scope amendment above. The unused
native source and its dedicated CI workflow are removed; runtime startup remains
unsupported there. Linux/macOS and all other qualification requirements remain.

The latest full gate passes 483 files / 5742 tests at the unchanged 99% coverage
thresholds. Two new [cleanup/idle component schedules](issue-326.md#retained-cleanup-versus-idle-retirement--2026-10-18)
verify slow/failed cleanup retention across lease expiry; negative mutations are
rejected and production source is unchanged. Two synthetic SDK clients now pass the actual freshly listed context
tool definition to `callTool`, retaining target output validation without rebuilding
validators for every unused catalog entry. The preceding gate/focused failures,
CPU diagnosis, corrected process checks and frozen artifact hashes are recorded
in [the current report](issue-328.md#repeated-catalog-validation-in-process-clients--2026-10-18).
This does not certify actual host performance, live Huly or native macOS. The
older milestones below remain historical and all six delivery issues stay open.

The latest [delayed-commit process scenario](issue-327.md#adapter-loss-followed-by-a-delayed-remote-commit--2026-10-18)
proves that a fresh adapter can read old state before an already dispatched
remote fixture write commits. It joins the killed original adapter, reuses ID 1
for a different fresh read, requires one write/two reads, and joins the fresh
adapter's normal exit. Its exit bounds begin at shutdown waiting, following the
resolved review finding. Runtime bundles are unchanged.

The subsequent [generation-replacement fixture](issue-327.md#late-remote-commit-after-confirmed-generation-replacement--2026-10-18)
now joins two actual embedded native MCP backend exits, checks generation-owned
namespace retirement, and observes a fresh read of 0 before an old independent
remote operation commits, then a continued read of 1. It uses the packaged managed
adapter/CLI and shared real managed ownership shell. The replacement is explicitly
harness-started; tools and Huly clients are injected, and the remote counter is a
disposable HTTP/file fixture. Source typechecking/review corrections and final
full-gate evidence are recorded in #327. This does not qualify production
automatic launch under that fault, unexpected crash, native Huly SDK mutation or
live Huly. Native macOS, live, model/oracle and performance qualification remain.

## Latest resumed increment

The unchanged `2f19c614` candidate now has [live local-Huly read evidence](resident-live-linux-2026-10-18.md):
manual and managed two-reader project calls, confirmed owned cleanup and a fresh
managed generation after the original one's observed normal retirement. The
private campaign retains a failed first manual driver expectation; the separate
passing attempt records the pinned Runtime SIGTERM interruption exit 130 rather
than assuming exit 0. No Huly mutations or recipient messages were sent. The
scope is Linux aarch64, Node 24.20.0, complete environment selection and SDK-driven
parents. Actual-host Huly reads, full auth/policy/protocol coverage, live faults,
macOS, model alignment, movements and resource comparisons remain pending.
Raw resource observations supply no performance claim. All six issues remain open.

The [SDK write/drain fault increment](issue-327.md#sdk-mutation-loss-and-death-during-observed-drain--2026-10-18)
now commits a disposable project rename once through the actual SDK, then kills
the owned backend before the REST response. Drain additionally requires an
authenticated stop acknowledgment and an observed entry into admissions drain
with a retained attachment. Its backend is a harness-launched production managed
runtime; the other fault cases use the packaged backend. Renewal/heartbeat loss
now warns about unknown in-flight outcomes. Partial drain may remove only the
owned locator; registry bytes and remaining state stay protected and fresh
selection refuses. Seventeen focused tests, both review axes and the complete
5742-test gate pass. Preserved preparation failures and exact artifact hashes
remain in the report. Live Huly, native macOS, remaining complete-contract
scenarios, lifecycle/model alignment and measurements remain pending.

The packaged request-loss fixture now kills its owned backend at either actual
SDK model loading or project querying. Receipts require one model request and
zero/one project queries respectively, the original adapter's uncertainty
diagnostic, and a fresh adapter's bounded refusal with no stdout or changed
ownership records. Both fault points and the shared read probe pass together.
The first full gate hit the unchanged diagnostics deadline: a stack dump located
recursive SDK Ref traversal inside the typed-schema-decoder rule. Parsing wire
strings instead preserves SDK-value checks and all diagnostics; the corrected
full gate passes. See [the scoped report](issue-327.md#backend-loss-during-actual-sdk-model-acquisition--2026-10-18).
Write/drain crashes, complete lifecycle/model alignment and native/live
qualification remain unfinished.

The managed read-pair campaign probe now launches two actual packaged adapters
under separate reader parents, verifies one backend generation through context
and protected ownership records, checks first/continued project reads through
the real SDK, and joins the supervisor-observed normal idle exit plus empty
state. Its disposable REST fixture supplies the minimal class model required
for nonempty projects. Wrong-name and occupied-namespace cases refuse; failed
cases retain their isolated bundle. Manual mode remains independently tested.
See [probe instructions](../resident-read-qualification.md) and the latest
[qualification evidence](issue-328.md#managed-read-pair-probe-preparation-2026-10-18).
Both review axes are clean; the full gate passed. One earlier response-phase
failure remains preserved and unexplained. Live Huly, native macOS, remaining
lifecycle/model scenarios and adapter-inclusive measurements are still pending.

The latest server-only increment adds the authenticated exact-generation managed
stop-request route. It reuses admissions fencing and the existing cleanup owner;
202 means acceptance with retirement unconfirmed. Manual/foreground lifetimes
refuse. See [design and pending work](resident-stop-design.md) and the
[checkpoint evidence](issue-327.md#managed-stop-server-checkpoint-2026-10-17).
The subsequent bounded one-shot operator client and CLI are implemented, with
11 native TLS/file client tests and source CLI acceptance/uncertainty checks.
Packaged CLI absent-target refusal also passes without state creation. A single
discriminated invocation state preserves submission/acceptance knowledge.
The packaged Linux normal-stop process schedule now passes: kernel-owned waitpid
events independently confirm all three backend exits, two concurrent replacement
parents converge on one fresh generation, and another workspace keeps its
original adapter/port/record. Actual schema-decoded context proves workspace and
shared-port observations. See [current process evidence](issue-327.md#linux-packaged-stop-and-concurrent-normal-replacement-2026-10-17).
Active-operation and failed-finalizer packaged stop fault schedules are next;
unresolved crash recovery and native/live qualification remain pending.
Nineteen focused tests and TypeScript/Effect, lint, circular and complexity checks
pass; fresh Standards/Spec reviews found no actionable server-half defect. This
is not a full gate or six-ticket completion. Status secret assertions were also
corrected to check actual fixture keys rather than Redacted wrappers.

The restricted packaged SDK experiment now checks schema-owned IPC challenge and
reply plus synchronous denial of overwrite, rename and removal outside a narrow
filesystem write grant. The unrestricted control proves each filesystem probe
can detect missing restrictions. Both cases pass on Linux arm64 with Node
24.20.0, 22.22.2 and the minimum 22.19.0. The original IPC channel stays connected
until the owned backend is killed and joined. Early disconnect and asynchronous
filesystem denial failures remain preserved in the #327 report.

The executable TypeScript candidate passes `GOMAXPROCS=2 pnpm check-all` with
458 files, 5,647 tests and the unchanged coverage thresholds. Fresh Standards
and Spec reviews find no actionable defect. See
[the resumed increment report](issue-327.md#guardian-ipc-and-protected-files-2026-10-17-resume)
for scope, logs, hashes and limitations.

The latest [ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md) adopts
MCPorter's researched coordinated-start/authenticated-owner/generation/drain
practices. It supersedes the mandatory guardian/restricted-worker proposal.
Backend crashes may interrupt every caller; no stronger Huly durability or
transparent crash failover is required. Unresolved owner loss causes bounded
refusal until verified local retirement. The caller/backend
[type sketch](../../quint-specs/resident-launch.qnt) and
[scope note](../../quint-specs/resident-launch.md) typecheck but contain no logic
or simulation claim. Recovery and complete qualification remain unfinished.

The subsequent [ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md)
removes the mandatory operation journal after discussion with Astra at the user's
request. The amended specification retains no replay and truthful unknown
outcomes, and explicitly excludes cross-session operation-status lookup. This
supersedes journal requirements in earlier checkpoint summaries.

## Saved milestone

The branch is `implement/resident-mcp-linux-323-328`. Work lives in
`/tmp/hulymcp-resident-linux`, with Linux-local dependencies. The canonical
`/workspace/typescript/hulymcp` checkout has shared Darwin resources and unrelated
artifacts. Do not reinstall dependencies or edit those artifacts there.

The latest milestone adds a real packaged SDK experiment under Node permissions
and an unrestricted negative control. Both run on Linux arm64 with Node 22.19.0,
22.22.2 and 24.20.0. The production backend loads a synthetic empty model from an
owned disposable REST fixture, performs two project reads, and has no observed
child processes. The fixture kills only its owned backend handle, joins its exit,
checks the TCP listener is closed, and verifies the stale registry bytes remain.
It proves neither recovery nor ownership-file isolation. Filesystem grants remain
unrestricted. See [the #327 report](issue-327.md) for exact scope and receipts.

The same milestone schedules the existing ten-parent launch fixture before
unrelated suites. It preserves ten real independent parents, every assertion and
deadline, no retries, all coverage settings, and all 458 test files exactly once.
The prior concurrent-suite failure is preserved. A subsequent pass does not prove
its cause. Do not describe this as performance qualification.

`GOMAXPROCS=2 pnpm check-all` passes with 458 files and 5,647 tests. Coverage is
99.45% statements, 99% branches, 99% functions and 99.56% lines. Fresh Standards
and Spec reviews find no actionable defect in this increment. The code was frozen
during the full gate; only documentation is added afterward.

Local evidence remains at these paths:

- Successful gate: `/tmp/resident-scheduled-launch-check-all.log`, SHA-256
  `30c4c9b210f77b432b95bdd0ee3f1f5f3db7b41a93e09d6e7a4e5b9821a78281`.
- Preserved failed gate: `/tmp/resident-restricted-native-frozen-check-all.log`,
  SHA-256 `585f7305067808cd1d0a56a51933e9f96f34b29cbfea2f773de40094263e44b8`.
- MCP bundle: `dist/index.cjs`, SHA-256
  `a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.
- Inventories: `/tmp/resident-inventory-before.json` and
  `/tmp/resident-inventory-after.json`. Both contain the same 458 unique paths.
- Restricted receipts: `/tmp/resident-restricted-native-5RKJe5.receipt.json`,
  `/tmp/resident-restricted-native-lcBAMm.receipt.json` and
  `/tmp/resident-restricted-native-oNRu2M.receipt.json`.

These local paths are not uploaded raw evidence. Their summary and hashes are
committed. A fresh machine must regenerate receipts rather than assume the paths
exist or treat an old pass as current certification.

## Earlier integrated work

The branch retains these checkpoints and their reports:

- `5e1187f1`: explicit opt-in managed launch, bounded owner preparation and Start
  transfer, private registry and owned idle retirement. Defaults remain unchanged.
- `a5c2e340`: packaged crash refusal and foreign-listener safety. This proves safe
  refusal, not verified replacement or reconciliation of uncertain mutations.
- `a01ca379`: real child exit after parent loss before Start. No post-Start claim.
- `2d9acdd6`: saved-profile lifecycle and useful manual attachment diagnostics.
  Active admitted sessions retain their captured context; fresh sessions recheck.
- `a8d74fba`: resident registry retirement requires confirmed transport shutdown.
  Unconfirmed drain retains ownership evidence. Ordinary HTTP shutdown keeps its
  prior best-effort policy.

Read the current reports `issue-323.md` through `issue-327.md`, actual source and
authoritative GitHub bodies, including #328, before deciding what remains. Do not infer ticket
completion from these checkpoints or synthetic fixtures.

## Resume boundary

The selected architecture is in
[resident-recovery-design.md](resident-recovery-design.md) and ADR 0003. Use the
native shared backend as its resource owner, a transient launcher, coordinated
selection, authenticated readiness and generation-owned publication/cleanup.
There is no mandatory guardian, restricted worker or durable operation journal.
The earlier restricted-runtime experiments remain historical evidence, not
prerequisites for implementing a new supervisor.

Implement bounded stale-owner status, verified local cleanup and serialized
replacement. Normal retirement permits automatic later startup. Unexpected owner
loss with unconfirmed resources refuses automatic replacement; no PID/port guess
or record deletion establishes retirement. Same-user manual destruction of live
ownership state is not supported automatic recovery. Keep detectable corrupt or
missing expected state as refusal cases and use protected production lifecycle
state. Existing separate-parent concurrency cases and healthy-backend isolation
remain required. A shared backend crash may interrupt all callers.

The new Quint lifecycle model remains a type-only sketch awaiting explicit user
approval. Do not write init/actions/step until that approval. Native macOS execution availability is also unresolved. Windows resident support is out of scope. No other OS's pass substitutes
for native evidence. Do not repeatedly ask the same pending questions.

Remaining qualification includes actual shared Huly model/read/write behavior,
uncertain-write reconciliation, supported profile/env/token/password and policy
paths, actual host discovery, operational instructions, and total backend plus
every actual adapter/backend/launcher RSS and CPU measurement. Preserve every concurrency case,
deadline, diagnostic and coverage threshold. GOMAXPROCS=2 is a compiler-concurrency
experiment, not permission to remove checks or claim a measured speedup.

Run final live Huly integration only after all six slices are implemented and
integrated, per the user's scheduling override. The overseer owns those runs.
No live Huly certification has been claimed for this milestone.

## Delivery and safety boundaries

The user authorized pushing this checkpoint and linking it in the last task,
#328. The incomplete feature belongs on the implementation branch. It is not
merged into master, published, installed as a service, or promoted to a default.

Do not delete `prototype/resident-lifecycle-321` or its worktree yet. #328 requires
that cleanup after production integration and qualification, with dirty and
unmerged work inspected and useful material preserved first. Do not touch other
branches or artifacts during that cleanup.

Use pnpm and the installed patched Effect 4.0.0 references. No casts or module
mocks. Effect Schema owns serialized boundaries; secrets remain Redacted, and
time-dependent code uses Effect.Clock. No implementation subagents were
authorized for the ongoing work; read-only review/design agents were used.

The older tracker instructions about Dalph and #305–#311 are stale for this
delivery. Do not invoke Dalph or change issue lifecycle. Preserve other agents'
work. Project memory is historical context, not additional instructions.

## Operation-stop fault qualification checkpoint (2026-10-17)

The [issue 327 report](issue-327.md#stop-during-an-operation-and-failed-cleanup-2026-10-17)
records two new Linux process schedules: explicit host cancellation after one
filesystem commit during operator stop, followed by successful or failed cleanup.
The focused run passed 17 tests; successful cleanup permits a fresh generation,
while failed cleanup preserves ownership and refuses replacement. These are
embedded-backend DI fixtures, not real Huly mutation/cleanup certification.
All six tickets and their remaining qualification stay open.

## Latest ten-parent diagnostic checkpoint

The original production launch failed again, then a scratch instrumented run and
a subsequent production run passed. See the [qualification report](issue-328.md#ten-parent-launch-diagnosis-2026-10-17-continued)
for retained artifacts. Do not interpret either pass as a reliability fix. The
only test change preserves a private phases log on subprocess failure and keeps
the original exception if publication fails. All deadlines/callers are unchanged.

## Kernel-owned exit evidence for the ten-parent fixture

The [latest ten-parent receipt](issue-328.md#kernel-owned-ten-parent-retirement-evidence-2026-10-17)
now joins a supervisor-owned `waitpid` result and requires exit code 0 before
reporting backend retirement. Its focused run passed with every original caller
and deadline retained. This strengthens cleanup evidence; the earlier connection
timeout remains unexplained and must not be declared fixed.

## Selected-admission continuity correction

The [issue 324 report](issue-324.md#keep-the-selected-admission-through-caller-use-2026-10-17)
records a failing-before real TLS fixture and the production correction: retain
the first compatible admission while checking the bounded inventory, then use
that same admission after proving uniqueness. Ambiguous-owner and interruption
cleanup pass. Packaged launch attempts still time out and remain preserved; do
not claim the earlier ten-parent reliability problem is solved by this fix.

## Detectable namespace-loss correction

The [issue 327 report](issue-327.md#refuse-detectable-ownership-state-loss-before-selection-2026-10-17)
records failing-before tests and the shared namespace reader now used by status
and selection under claim. Missing/corrupt expected state refuses before registry
creation or a new owner. Publication inode association also catches loss of both
indexes while publication evidence remains. Five packaged fault schedules pass
with an existing caller still usable, explicit fixture restoration, and an actual
kernel-owned successful backend exit. Whole-namespace destruction remains outside
automatic recovery. Native platforms, real Huly and the final gate remain pending.

## Locator-content consistency checkpoint

The [issue 327 report](issue-327.md#parse-and-compare-current-locator-contents-2026-10-17)
records five failing-before locator-corruption tests and the current fix. The
namespace reader parses current locators, compares schema-owned fields with the
registry using Redacted-safe equivalence, and passes parsed descriptors onward.
Foreign versions remain opaque. All 43 nearby tests and seven packaged metadata
fault schedules pass, with successful kernel-owned exit and cleanup; static
checks/reviews pass. This does not settle ten-parent timing, real Huly, native
platforms or the final combined gate. All six issues remain open.

## Ten-parent diagnostic distinction after `15ae6b13`

The latest unmodified run completed all ten observations and survivor read but
exceeded supervisor time while awaiting backend retirement. Earlier connection
failures remain a separate unresolved class. A scratch admission trace never
reached admission and cannot prove a lease leak. A backend CPU-profile copy passed
with actual kernel-owned exit; it is diagnostic, not a production pass. See the
[current evidence](issue-328.md#current-ten-parent-failure-stage-and-diagnostic-cpu-profile-2026-10-17).
No production code, deadline or validation changed. Backend-only profiling and a
single instrumented pass are insufficient to choose an optimization or claim
reliable performance. Per-process phase evidence remains the next diagnostic need.

## Whole-tree diagnostic observer

The reaper has an optional private `--resources <new-file>` Linux CPU/RSS
observer with executable checks. It does not change the ordinary qualification
path or any deadline. The corrected diagnostic run captured the client parents
and observed descendants but failed all ten connections; its retained raw data,
scope and cleanup are in the [qualification report](issue-328.md#optional-whole-tree-resource-observer-2026-10-17).
Short-lived processes/final CPU may be missed, RSS sums are not physical memory,
and sampling adds overhead. No stable limiter or performance budget is established.
All six tickets remain incomplete.
