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

The unchanged production `2f19c614` candidate now has [live local-Huly read evidence](resident-live-linux-2026-10-18.md)
and a [successful five-suite movement campaign](resident-movement-linux-2026-10-18.md)
at documentation revision `a20fe4f1`. The current issue-328 sections additionally
record actual Claude Code and Codex app-server project reads, healthy survivor
reads after adapter death, independently captured password/profile auth context,
and disjoint native tool-policy reads/refusals. Owned exits and empty state are
checked separately from acknowledgments. Original failed manual expectation,
weaker auth receipts and unexplained initial policy timeout remain preserved.
The scope is Linux aarch64 / Node 24.20.0; full native macOS, lifecycle/model,
protocol/identity/auth-policy matrices, live mutation faults/reconciliation and
adapter-inclusive comparisons remain pending. All six issues remain open.

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

### Movement campaign admission — 2026-10-18

Candidate `a20fe4f1` (documentation over production candidate `2f19c614`). Stock coordinator plan at `/tmp/resident-movement-certification-20261018` reports all five required suites pending. First run; no failed boundary in this campaign yet. Expected duration: preparation plus five suites, each independently bounded at 1,200,000 ms; no overall campaign deadline. UTC stop time is assigned and retained by the coordinator separately for preparation and each suite. Unexecuted suffix: concurrency, tree, movement, transfer, attributes. Run uses local Huly only, container URL normalization, Linux-local dependencies, no selected-case filter. A failed mutation will require a named distinguishing diagnostic before any retry. This campaign alone does not qualify resident-specific behavior or native macOS.

The campaign's fresh preparation passed `pnpm check-all`: 483 files / 5742 tests; statements 99.45%, branches 99%, functions 99%, lines 99.55%. The coordinator quality receipt records source `a20fe4f141f59cfc3315c88327c5b75e1aea7a68`, exit 0, clean true and inputsStable true. Log `/tmp/resident-movement-certification-20261018/prepare-1792307359484.log`, independently matched SHA-256 `ac08cd2570742dee02b024ea61cb9fc52c060f2c958bb218ef1e07ed61c3a725`. The concurrency live suite started; its result and all subsequent suites are pending. Do not relaunch the active coordinator (exec session 8973) or treat this gate receipt as live-suite completion.

Prepared, not executed: `/tmp/resident-claude-live-read-665f_0cg/probe.py` adapts the retained actual Claude Code local Messages fixture to two `get_project` calls on the private selected target. `preparation.json` records the probe/candidate hashes; the copied MCP artifact matches `908e121f7d9fd4ab49b931b1ee349a448feec5a6db10d616ac3b0267dfe47416`. Credentials are inherited via the host process environment, never written into MCP configuration. Host timeout 12 seconds and existing supervisor 25 seconds remain unchanged. Before executing, inspect the prepared script, use the local URL guard and complete environment selection, and arrange kernel-owned retirement evidence separately; a host receipt alone cannot prove backend cleanup. No actual-host live Huly result is claimed by preparation.

The prepared actual Claude Code local-Huly read scenario subsequently ran once and passed under the existing explicit 45-second lease-expiry supervisor mode (the host invocation retained its 12-second bound). Private evidence `/tmp/resident-claude-live-read-665f_0cg/`: two actual `get_project` results match the selected identifier/name, host exit 0, kernel-observed registry-correlated backend exit 0, empty private namespace, supervisor exit 0 and empty supervisor diagnostics. `verify.mts` parses input/results/registry/retirement with existing Effect schemas; its first launch failed on an incorrect Effect import path, corrected to the package export, then verification passed without another host/Huly invocation. `sha256.json` retains 15 file hashes. The local deterministic Messages fixture drives the installed actual host; no remote model behavior, Codex Huly reads, complete auth/protocol matrix or native macOS is certified. Stock movement campaign session 8973 remains independently active.

Both fresh read-only Standards and Spec reviews of the documentation increment against `a20fe4f1` found no actionable findings. Both independently matched all 15 actual-Claude evidence hashes and confirmed the scoped result/retirement claims and incomplete overall status. Documentation remains uncommitted while the immutable stock movement campaign runs; do not change its source revision mid-campaign.

Actual Codex CLI 0.163.0 app-server Huly reads also passed once, with private evidence `/tmp/resident-codex-live-read-5125ura_/` and 14-file hash manifest. Two schema-parsed structured project results match the selected target; actual host exit 0, registry-correlated kernel backend exit 0, supervisor exit 0 and empty state are verified. Explicit existing 45-second lease-expiry supervision and five-second response/shutdown bounds are unchanged. There is no model inference or global configuration change. See the new issue-328 section; independent review of this Codex addition remains pending. Movement session 8973 is still active.

The subsequent Codex documentation increment also passed fresh independent Standards and Spec review with no actionable findings. Both reviewers independently matched all 14 evidence hashes and confirmed result/owner/supervisor checks and exact limitations. Actual Claude and Codex local-Huly reads are now scoped passing observations; complete host matrices, native macOS, live faults, model alignment and adapter-inclusive comparisons remain pending.

Movement campaign progress: `issue_movement_concurrency` completed with exit 0, clean true, inputsStable true, source `a20fe4f141f59cfc3315c88327c5b75e1aea7a68`. Both declared and passed case inventories contain all 18 cases of the stock routine profile (14 MCP, 4 CLI), scope full. This does not claim the optional expanded CLI matrix. Cleanup completed before the coordinator admitted `issue_tree`. Independently matched log SHA-256 `b11bdc8d62fa5fe78f77a39463187d895b1fa0a239cffce9736331d44018ff43`, path `/tmp/resident-movement-certification-20261018/issue_movement_concurrency-1792307596830.log`. Tree is active; movement, transfer and attributes remain unexecuted. Continue session 8973; do not restart or commit/change the source revision mid-campaign.

Scoped live healthy-backend isolation passed once at `/tmp/resident-live-survivor-9w2cz2g2/`: two packaged managed adapters read distinct projects using colliding request ID 41. The harness kills and joins its own first adapter (exit -9), observes four correct survivor reads immediately and at 11/22/31 seconds, then admits a fresh adapter for a correct first-project read. Exactly one generation is retained and its registry bytes remain unchanged through the observations. Fresh/survivor adapters exit 0; the existing explicit 45-second lease-expiry kernel supervisor observes the registry-correlated backend exit 0 and empty state, itself exits 0 with empty diagnostics. Same immutable MCP artifact as prior live reads. `verify.mts` parses all project results, registry and retirement via existing Effect schemas and checks exact targets, counts and exits. `sha256.json` retains the private files. This is direct child adapters under one harness parent, not separate-host parent-loss, live mutation uncertainty or native macOS. No Huly writes are requested. Independent review/report publication of this increment remains pending; movement session 8973 continues separately.

The survivor increment passed fresh Standards and Spec review; both reviewers matched all 13 hashes without findings. A separate local-Huly password path then passed once using the maintained managed-pair probe with HULY_PROFILE and HULY_TOKEN unset, complete environment email/password and guarded local URL. Evidence `/tmp/resident-live-password-a00kob3t/` contains input, unchanged candidate/probe copies, schema verifier, receipt, exit and empty diagnostics; seven-file hash manifest, receipt SHA-256 `79254079c4f7cb54ae997da99ad695ca28a4f5c827b5fcb9179c9cfe8e443f47`. Both separate reader parents have correct first/continued distinct project results, common generation/backend PID, actual owned backend exit 0 and empty state; supervisor exit 0. Default 25-second supervisor/per-exchange five-second bounds unchanged. `verify.mts` passed. Earlier live runs had token plus password present, so do not call those password-path evidence. Saved-profile live reads and full auth matrix remain pending. Documentation/review of the password increment remains pending. Movement session 8973 continues separately; preserve source revision.

Saved-profile live reads passed once at `/tmp/resident-live-profile-bwco3g8x/`. A schema-parsed local token/destination was written through the real private profile store; explicit `selected` differs from saved active `unrelated`. The run unsets all HULY_URL/WORKSPACE/EMAIL/PASSWORD/TOKEN environment values and sets only HULY_PROFILE plus isolated XDG_CONFIG_HOME. Maintained managed-pair first/continued distinct-project reads, common backend identity, kernel-owned backend exit 0, empty state and supervisor exit 0 pass; diagnostics empty. Existing 25-second supervision/five-second exchanges unchanged. `verify.mts` passed, and the created private credential file was deleted only after owned retirement/result verification (`credential-cleanup.json`). No user profile/global files changed. The first preparation failed before any Huly call because already parsed Redacted token was passed through a raw token decoder; passing its schema-derived value to store.writeCredentials corrected preparation without unwrapping/logging it. This is file-token profile selection, not keychain, live rotation/logout or full auth coverage. Evidence hashes and report review remain to be incorporated into issue-328; movement session 8973 remains active, source unchanged.

Auth evidence review correction: Standards found no issues, but Spec identified missing retained launch-key presence and resolved adapter auth method/source. Both existing read/retirement receipts remain valid, but password/profile selection must be treated as reported execution context, not independently verified auth qualification. The issue-328 section now states this limit. Next distinguishing read-only experiment: retain schema-owned redacted launch presence and auth context from each same adapter, without changing production bundles or replaying mutations. Preserve old receipts/manifests. No broad live rerun is justified by this evidence gap.

Prepared the distinguishing auth diagnostic at `/tmp/resident-live-auth-diagnostic-0f_x2pj2/`, not yet executed. `build.mjs` uses esbuild on the maintained reader and retains the exact `instrumented-identity.ts`: after the existing schema-decoded context request, it writes only the schema-encoded `GetHulyContextResultSchema.fields.auth` to an exclusive private `auth-PID.json` beside state. Production MCP copies remain unchanged. Separate password/profile state/input directories are prepared, and profile preparation uses the corrected schema-owned store path. Next: retain redacted launch-key booleans, run each bounded read-only pair with its isolated environment, verify auth method/source for both reader PIDs plus original read/retirement facts, then delete only newly created profile credential. Original mixed-strength receipts remain unchanged.

The named same-reader auth diagnostic ran once for each path and passed. `/tmp/resident-live-auth-diagnostic-0f_x2pj2/password` and `/profile` retain launch booleans and two auth files matched to receipt reader-parent PIDs. Schema verifiers require password/env/no-token versus token/profile/no-email-password respectively, and exact launch presences/absences. Both complete managed-pair read/retirement checks pass; profile fixture credential deleted after verification. Production MCP SHA unchanged; the diagnostic reader differs only by retaining its already parsed auth subsection. Original weaker evidence remains immutable. New issue-328 follow-up documents the result; fresh review of this correction is pending. Movement session 8973 remains active; tree passed and third movement suite started.

Fresh correction reviews: Standards reports no findings; Spec marks its P2 resolved. Both independently matched all 25 auth-diagnostic hashes and confirmed same-reader auth/context binding, launch-key assertions and retained weaker evidence. Tree suite receipt is exit 0, clean true and inputsStable true, with independently matched log SHA-256 `f0ec7476cbc2b75130db1111958f894aa3f7d079f03ba8c723cbc0a1bbf3ad6f` (`issue_tree-1792308596235.log`). Two of five stock movement suites now pass; movement is active, transfer/attributes remain unexecuted.

Third stock suite `issue_movement` completed exit 0, clean true, inputsStable true; log SHA independently matched `385908c65c355db0ebbe32efd7b71f99c841fccf438da7edbf4d353c99fbbbce` (`issue_movement-1792309139505.log`). It retains three `FAIL: movement MCP phase=tool-reply` cleanup diagnostics: the EXIT trap suppresses each delete failure, so the process receipt alone cannot prove fixture absence. Named bounded read-only diagnostic queried HULY by the exact fixture-title substring `Issue movement certification`, limit 200; CLI exit 0, empty diagnostics and schema-parsed zero results in `movement-cleanup-read.json`/`.exit`/`.stderr` confirm no matching fixture tasks remain in that tested project. Preserve the original diagnostics; do not generalize this to unrelated fixtures or claim every delete succeeded. Three of five suites now pass; transfer is active, attributes unexecuted. Continue session 8973 without relaunch.

Failed new live policy diagnostic preserved at `/tmp/resident-live-policy-vloojeza/`, session 27369 terminal exit 1. The intended read-only scenario used two direct packaged adapters with disjoint get_project/list_projects scopes, catalog/context checks, allowed reads and exact cross-policy refusals. It stopped at `client.request(41, tools/call, allowed)` with queue.Empty at the unchanged five-second response boundary, before retaining per-policy observations. The existing 25-second supervisor then forcibly retired remaining descendants; that is cleanup of a failed experiment, not successful lifecycle qualification. Adapter stderr files are empty; original probe/stdout/stderr/exit are retained. The evidence does not establish which allowed tool timed out or why. Do not retry unchanged or increase deadlines. Next distinguishing experiment: retain phase/tool name and already parsed catalog/context before each allowed call, run separately after movement campaign completion, and compare read-only response timing to distinguish Huly quota/load from routing/fixture/product failure. Live differing-policy qualification remains unproven. Movement session 8973 continues; no production source changes.

The named policy diagnostic is now prepared, not executed, at `/tmp/resident-live-policy-diagnostic-lxvamu3r/`. It retains the original failed root unchanged and uses the same hashed production MCP. `diagnostic-plan.json` records the hypothesis, unchanged 5/25-second bounds and requirement to run after the active movement campaign. The new probe records each request's adapter name, request ID, operation, start/reply/timeout and elapsed time without arguments or credentials; it retains each parsed catalog/context before the allowed call. Syntax compilation passes. This distinguishes the actual failing call/phase on the next attempt rather than broad retrying the original opaque schedule. No live policy qualification result is claimed from preparation.

Fourth stock suite `issue_transfer` completed exit 0, clean true, inputsStable true. Both MCP and CLI rich-leaf preservation/unknown-class scenarios passed, then the coordinator completed owned-process cleanup and admitted the fifth `issue_attributes` suite. Four of five suites now pass; attributes is active. Retain the same campaign/session 8973 and source revision. The failed independent policy diagnostic remains pending its prepared, separately scheduled phase/timing experiment.

Transfer log `/tmp/resident-movement-certification-20261018/issue_transfer-1792309358997.log` independently matches receipt SHA-256 `f3373a2736497a23db10bb0b0ed7bcdbf2dd5ed366f455bd6060a417c7f142aa` and contains no `FAIL:` diagnostics. The issue-328 current index now reflects four passing suites and the active fifth.

Prepared `docs/implementation/resident-movement-linux-2026-10-18.md` as the explicit partial campaign record (four suites passed, fifth active), preserving process-versus-fixture-cleanup limits and the named absence query. The campaign evidence root is now explicitly mode 0700 and existing regular evidence files 0600; evidence bytes/hashes are unchanged. Do not commit or adjudicate the campaign as complete while session 8973 is active.

Movement campaign is terminal success: session 8973 exited 0; all five suite receipts are exit 0, clean true, inputsStable true. Attributes log SHA-256 `c42397febb1cecc6b3abf32473f2732c129c728fb871cd9ec281d2dbe7c1318a`. All five log hashes recomputed, fresh matching-environment stock plan reports reuse for all five (no suite rerun), campaign raw files frozen by `sha256.json`. `resident-movement-linux-2026-10-18.md` now records exact success and limits. Final schema-parsed project inventory observes the same eight baseline identifiers, no new projects, unknown totals -1 and five preexisting fixture-prefix projects. A scratch array-shape assumption failed; schema correction then exposed an invalid zero-prefix assertion because those projects predate this campaign. Both failed-comparison facts and original prefix-count receipt are retained; the corrected baseline-aware receipt passes. Do not delete historical projects or turn this observed inventory into proof of all nested-record absence. Fresh report review remains pending. Source revision can now be committed after review; no active movement handle remains. Next executable work: named policy diagnostic `/tmp/resident-live-policy-diagnostic-lxvamu3r/` outside campaign load, then remaining resident gates.

Named policy diagnostic `/tmp/resident-live-policy-diagnostic-lxvamu3r/` ran once after campaign completion and passed exit 0. Catalog/context/allowed get_project + list_projects/exact forbidden-tool results and a continued get_project read are schema-verified. Two distinct policy backends/generations and both actual kernel exits 0, healthy adapter exits 0, empty state and empty diagnostics pass under unchanged 5/7/25-second bounds. First failed opaque attempt remains unchanged at `/tmp/resident-live-policy-vloojeza/`; both roots now have hash manifests. Root cause of that timeout remains unproven: instrumentation and workload timing changed. New issue-328 section describes exact scope and preserved failure. Final campaign Standards and Spec reviews both clean, independently matching all17 hashes. Policy addition review pending, then docs-only milestone can be committed; production MCP source/artifact remains unchanged.

Next fault-qualification preparation: production/documentation HEAD is `fdd88278`, prior milestone committed with clean tree and unchanged MCP/CLI hashes. A bounded local reverse proxy now passes a real SDK/Huly project read at `/tmp/resident-live-proxy-read-docker-0po4_lh7/`. It forwards real config/account/workspace/REST exchanges without module monkey-patching or recording credential headers, intercepts only configured local/Docker origins, and retains counters: one full-model request, one project query/response, zero proxy errors. Correct target, adapter exit0, kernel/registry-correlated backend exit0, empty state and supervisor exit0 are schema-verified in verify.mts; diagnostics empty; 11-file hash manifest. Original preparation failures are preserved: `/tmp/resident-live-proxy-read-noax820l/` (syntax concatenation failure before any network request,6 hashes) and `/tmp/resident-live-proxy-read-fixed-1teg62bp/` (local config read then refusal of Docker hostname nginx,6 hashes). The initial interpretation that ACCOUNTS_URL might be relative was corrected by inspecting its hostname; actual absolute nginx address is now explicitly allowed alongside localhost/127.0.0.1/host.docker.internal. No Huly write was requested and production files unchanged.

The actual live backend-death/read-response-loss schedule is NOT implemented or run yet. Next extend a separate copy of the successful proxy: hold the actual completed project response, verify the protected registry PID belongs to the live kernel-owned supervisor descendant tree and hold a pidfd, kill only that exact backend through its pidfd, observe actual owned exit, then require truthful original-adapter uncertainty and bounded fresh-adapter refusal with unchanged ownership bytes/no additional Huly dispatch. Preserve the successful baseline and every failed attempt; do not infer no-replay, crash recovery or write reconciliation from this normal read control. Existing per-response/retirement/supervisor bounds must remain intact. Native macOS/model/measurement/fullcontract gates remain pending.

Live query-loss preparation remains incomplete; no target backend was killed in the intended post-response fault schedule. Preserve attempts: `/tmp/resident-live-query-loss-i8czy4mv` (9-file manifest; descriptor endpoint mistaken for structured URL, no Huly request, supervisor forced cleanup), `/tmp/resident-live-query-loss-wire-4d9ifzaq` (11 files; held-project parser expected raw identifier, proxy errors caused SDK's installed three read retries, no kill), `/tmp/resident-live-query-loss-query-fields-qkeczj3q` (11 files; model request reached proxy but no project query, one proxy error, held wait expired before kill, forced cleanup). All terminal exit1; no mutation requested. Owned-process lineage/start-time/pidfd checks exist in the later scripts but do not establish the unexecuted fault result.

Changed diagnostic method: separate normal read control `/tmp/resident-live-query-wire-control-wnkfbs0u` passed exit0/normal retirement and retained the raw project wire response (11-file manifest). Real TotalArray rows omit query-implied identifier. Exact installed api-client/lib/rest/rest.js fills missing primitive query fields into returned documents; earlier raw-row identifier assertion was a fixture error. The corrected hold checks request query.identifier against target, one response row and target name, and preserves held-query/held-wire plus projected identifier. The latest pre-query failure remains unexplained. Prepared, not executed, `/tmp/resident-live-query-loss-phases-6deo4c_h/probe.py` adds credential-free upstream start/response/error family/status/byte-count/exception-class events and the read-sent phase, retaining existing 5-second waits and25-second supervisor. Run this named diagnostic next to distinguish model/HTTP failure from proxy parsing rather than repeating an opaque fault attempt. No production source changed; only this handoff is dirty after fdd88278. Do not claim live query-loss or no-replay qualification yet, and preserve every old root.

Named upstream-phase diagnostic `/tmp/resident-live-query-loss-phases-6deo4c_h/` passed once (exec8010 exit0): actual Huly project response held, verified supervisor ancestry/starttime and pidfd kill of exact backend, kernel exit-9, original adapter EOF/no-success and exit1 with known unknown-outcome/no-replay diagnostic, fresh adapter exit1/zero stdout/specific no-Huly-dispatch refusal, no added upstream calls and identical retained ownership hashes. Model/query/response counts 1/1/1, proxy errors0. Supervisor exit0/empty diagnostics joins owned processes; namespace remains retained deliberately. `verify.mts` passes schema/target/PID/phase/inventory/artifact/diagnostic checks. Its first two overly specific diagnostic expectations are retained as failed verifier sources; final verifier recognizes only the production connection/response/stream loss messages, without another Huly call. Root has a fresh top-level hash manifest. New issue327 section records scope/failures; live write uncertainty and fullcontract remain pending. Independent review of this query-loss increment is pending. Only docs changed after fdd88278; production code/artifact unchanged.

Both fresh read-only reviews of the live query-loss increment are clean; all23 hashes matched. A live WRITE-loss schedule now also passes once at `/tmp/resident-live-write-loss-_cpbcg7t/` (53-file top-level manifest). It creates one unique owned project once, schema-verifies createdtrue and exact before/marker, permits exactly one target/name TxUpdateDoc through the proxy, holds the actual Huly transaction response, kills exact pidfd-owned backend, observes -9 and originalEOF/exit1 uncertainty, fresh exit1/stdout0/no-dispatch, no extra upstream calls, identical retained ownership and supervisor0/empty diagnostics. A separate original-endpoint CLI read verifies the exact intended rename without retrying mutation. Main fault exec75785 exit0; verifier passes all result/Tx/ownership/diagnostic/exit/reconciliation checks. Initial fixture deletion was refused locally for missing--yes before useClientBundle, preserved in cleanup.stderr; intervening read shows it still existed. Separate confirmed cleanup with--yes returnsdeletedtrue; final read exit5/NOT_FOUND identifies the exact fixture as absent. Do not retry either the write or cleanup. Fixture lifecycle is complete. New issue327 section details boundaries; production source unchanged. Fresh independent review of WRITE increment remains pending; overallgoal remains incomplete.

The live write-loss documentation increment passed fresh independent read-only Standards and Spec reviews. Both reviewers independently matched all 53 manifest hashes and found no actionable findings. Reviews confirmed the owned fixture, exact single-name transaction, correlated backend death, original uncertainty, fresh refusal, unchanged ownership, independent reconciliation and confirmed deletion/NOT_FOUND. The local missing-confirmation cleanup refusal remains preserved. This closes review of the scoped query/write evidence, not the remaining qualification matrices. Next work is adapter-inclusive comparative measurement; native macOS, model alignment and other full-contract requirements remain pending.

Comparison harness preparation now has eight terminal local-Huly control/diagnostic outcomes at `/tmp/resident-comparison-harness-6ee05lbx/`, 92-file frozen control manifest (mutable current harness/config excluded; explicit source/bundle versions retained). See issue328's new comparative-controls section and `resident-comparison-protocol.md`. No live handles remain. Managed ten-client passes 30 reads/11 owned exits/empty state; standalone ten fails first reads and initially forced cleanup, preserved. Named standalone ten profile diagnostic has two explicit REQUEST_TIMEOUT first-read failures, 24 reads, all ten normal exits and no forced cleanup; ten V8 profiles show idle plus SDK JSON/model/GC work, no established single limiter. Original HTTP controls incorrectly sent per-request authority headers, creating request-scoped clients. Header-selected ten control fails all first reads. Corrected env-selected shared HTTP ten diagnostic passes 30 reads/full catalog/server130/supervisor0. This distinction is backed by http-client-leases source, not an assumed cache. No comparative samples admitted yet. Next improve complete CPU accounting and preserve independently verifiable raw result/role evidence, then review/freeze the maintained harness and run the declared alternating campaign without weakening deadlines. All production artifacts unchanged; broader native/model/full-contract gates remain pending.

Fresh read-only Standards and Spec reviews of the comparative-controls report and protocol found no actionable findings. Both independently matched all92 manifest hashes and confirmed the eight outcomes, preserved failures, corrected HTTP cache boundary and explicit pending campaign/CPU accounting. These reviews qualify the preparation report only; no performance conclusion or full-ticket completion follows.

Terminal CPU preparation: maintained reap-descendants.py now has optional exclusive/private wait4 receipts, with a port for receipt output. Writer failure marks failure but still joins all owned descendants. Seven Python tests and the existing unchanged-five-second Vitest wrapper pass. Five direct/nested/orphan CPU controls plus a new actual one-client managed control using this exact updated helper pass at /tmp/resident-cpu-accounting-qualified-r9azhi1c. Three raw parsed project outputs, complete catalog/templates, role/PID/owned exits, CPU closure and simultaneous sampled RSS are independently schema-verified; no performance verdict. Preliminary CPU development evidence at /tmp/resident-comparison-cpu-vactdxun is preserved but not the authoritative updated-helper control. Tick-quantized waited-child CPU plus separately adopted product wait4 usage avoids double-counting the driver's subtree; retain rounding/closure residual, not false microsecond accuracy. All live invocations are terminal. Full check-all is running as exec session36667; follow that handle, do not restart. No production runtime source changed. Campaign, all-mode CPU verification, native macOS/model/full-contract gates remain pending.

Both CPU preparation reviews are clean and independently match48 hashes. Gate36667 subsequently TERMINATED exit1: 482files/5741tests passed, drain request-loss fixture failed after fresh refusal. Preserve check-all-failed.log; do not poll/restart36667. Named invariant diagnostic94944 also failed, revealing fresh exit0 instead of1. A changed output-capture diagnostic10081 passed, not causal proof. Isolated immediate-EOF vs held-open attempts on the original retained namespace both refuse1/stdout0/no-dispatch and unchanged ownership at /tmp/resident-refusal-eof-diagnostic-nesia8ub; EOF hypothesis not supported there. Source inspection found no explicit backend-death join before fresh spawn: original adapter can close during drain before REST loss callback finishes kill/join. Fixture now asserts exact owned SIGKILL completion before fresh adapter, labels invariants and retains private stderr/stdout sidecars. All4 loss scenarios pass in drain-death-barrier-tests.log. Do not claim original failures fully explained or a production race fixed. Fresh full gate is LIVE exec43357, log check-all-death-barrier.log in the CPU evidence root. Follow it; no blind rerun. Additional fixture review pending. Sidecars/failure logs/source are frozen separately in drain-diagnostics-manifest.json. Generic all-mode CPU verifier preparation exists unexecuted at /tmp/resident-comparison-campaign-prep-nlfrh_4e; no campaign admitted. Production source/artifact unchanged.

Drain fixture follow-up Standards and Spec reviews are clean, matching16 diagnostic hashes. Gate43357 is TERMINAL exit1 at formatting (new assertion needed Oxc line wrapping), not another test result. dprint formatted that one assertion; no semantic edit. Fresh full gate is LIVE exec28882 at /tmp/resident-cpu-accounting-qualified-r9azhi1c/check-all-formatted.log; follow it and do not restart. While it runs, untimed one-client standalone and env-shared HTTP controls with complete CPU receipts both pass (three exact reads/normal product exit/owned cleanup), and the generic verifier revalidates the existing managed proof without a new managed invocation. Frozen41-file proof /tmp/resident-comparison-campaign-prep-nlfrh_4e/manifest.json; all-mode-one-client CPU/control claims await review. These controls ran alongside the quality gate and are excluded from comparative measurements. No performance campaign admitted. Source stays uncommitted pending final gate result; no production runtime source/artifact change.

Gate28882 is TERMINAL exit1: same drain fixture; labeled invariant proves known owned .attachment-* publication disappeared during drain. This is valid cleanup by attachment-file.ts use-scope finalizers. Fixed fixture: exactly one original publication, device/inode must match descriptor; only that known owned publication plus locator can be withdrawn during drain, all remaining inventory/registry checks retained. New publicationAfterLoss schema field. Also froze fault timing at real drain-entry-with-attachment: SDK fixture writes diagnostic synchronously then SIGSTOPs itself; parent observes actual /proc stateT before SIGKILL, joins death before fresh startup. New drainPausedBeforeKill is schema-literaltrue only for drain. This avoids an uncontrolled completed-drain schedule while preserving actual SDK/process boundaries and all deadlines. Five focused tests passed at paused-drain-tests.log; receipt confirms retained locator/publication/registry, uncertainty, no replay, refusal. Eight-file paused-drain-manifest.json freezes new source/log/receipt and prior failed gate. Separate earlier exit0 root cause is not claimed proven. No live gate currently; focused lint exec86061 pending. Next fresh review and full gate for corrected source, then commit; do not rerun failed immutable attempts. 41-file all-mode-one-client CPU controls await review. No production runtime changes; all broader campaign/native/model gates still pending.

Latest correction reviews are clean: Standards and Spec independently matched all8 paused-drain hashes plus41 all-mode-one-client hashes. Focused Oxlint initially flagged magic numeric2 in diagnostic fd/proc separator handling; corrected to process.stderr.fd and named separator.length, formatting and focused lint now pass. No semantics/deadlines changed by those lint fixes. Full gate47962 is LIVE at /tmp/resident-cpu-accounting-qualified-r9azhi1c/check-all-owned-publication.log for the corrected owned-publication/paused-drain candidate. This is the only live process handle; all live Huly/control/diagnostic invocations are terminal. Follow47962; preserve prior failed full gates and do not restart based on an observation timeout. Source remains uncommitted until this gate is adjudicated. Next: record terminal result, address any actual failure, then commit reviewed helper/fixture/report increment. Production artifacts remain the same2f19c614 bytes. Alternating30-run campaign, ten-client CPU matrix, native macOS, model/oracle and other complete-contract requirements remain pending.

Gate47962 is TERMINAL PASS exit0: 483files/5742tests, 1373TS/Effectfiles zeroerrors/warnings, coverage99.45/99/99/99.55%, output200/300. LogSHA5f075c03ad01ccfb2d254cd5238c7e2cad2a16f9055d48bfe9708a97d25c13d7. gate-proof.json plus8-file gate-manifest.json bind final6helper/fixture sources and sameMCP908e121f/CLIe15d82af artifacts. Preserve all3failed gates. No live process remains. Final review/commit of current9-file increment next. Prepared30-attempt campaign v1 /tmp/resident-comparison-campaign-h8p6kcqn has41frozeninputs; readiness review found verifier unbounded and noted no explicit client barrier. No campaign admitted. Corrected v2 /tmp/resident-comparison-campaign-v2-o0gq6111 adds5sec verifier deadline with owned kill/join and explicit Deferred client barrier; real success/timeout verifier-port checks prove kernel reaping, source typecheck passes. V2 not frozen/reviewed/admitted yet. V1 preserved unchanged. Next finish v2 readiness review and launch alternating campaign, stopping on failed attempts for diagnosis. Remaining native/model/full-contract scope unchanged; no push/merge/publish/service/prototype cleanup authorized yet.

Final Standards and Spec reviews both clean, independently matching all8 gate-proof hashes and the6 retained source files to the current worktree. Current passing full gate and scoped report claims are confirmed. Commit the reviewed9-file increment; no production/default/delivery promotion follows.

### Comparative campaign admitted — 2026-10-18

Both fresh read-only readiness reviews found no launch-blocking findings and matched all177 hashes (66 frozen v3 inputs,56 profile-control files,55 preserved v2 failure files). Candidate remains b1415354 over unchanged production2f19c614 artifacts. Actual campaign root `/tmp/resident-comparison-campaign-v3-pi0hult3`; controller session11919 is TERMINAL exit1, not live. Cases001–015 (five per mode, one client) independently verified successfully. Case016, first standalone ten-client attempt, failed:27/30 correct reads, one immediate REQUEST_TIMEOUT, one close TimeoutError, nine normal product exits. Product diagnostic says process-scoped Huly client cleanup timed out. Ordinary25-second supervisor killed/joined remaining server2468802 and driver2468783; kernel wait4 receipts record both -9. Partial CPU closure is not complete resource evidence. No deadline extension or retry occurred.

Named read-only boundary diagnostic `/tmp/resident-comparison-case016-diagnostic-ki5e3aql` preserves phase offsets, role/exit correlation and411 hashes of current campaign inputs/results. The first-read stall cause remains unproven. Current denominator:16 attempted,15 verified,1 failed,14 unexecuted. Controls/profiles remain outside the timed samples; no winner, budget or full-comparison completion is claimed. Next inspect stalled first-read/cleanup evidence before explicit continuation of the unexecuted suffix, preserving016 as failed. Native macOS, model approval/alignment and complete-contract matrices remain pending. All six tickets remain incomplete. Windows is excluded by the user's instruction.

The alternating series is now TERMINAL:30 attempted,28 independently verified,2failed,0unexecuted. Continuation session57738 stopped at021 (24/30 correct reads, two first-read timeouts, one close timeout; nine normal exits; remaining product+driver kernel-killed/joined by25sec supervisor). Named diagnostic `/tmp/resident-comparison-case021-diagnostic-1cjmed0y` records phases/role/kernel correlation and preserved hashes. Explicit continuation28597 completed022–030; its final exit1 is expected because016/021 remain failed. Later standalone023/025/030 passed. All15 one-client attempts and all10 shared ten-client attempts passed. No product processes remain owned by these terminal supervisors. `terminal-manifest.json` in the v3 root freezes1015 files. Rerunnable analysis/final-analysis.json and analysis-manifest.json in016 diagnostic root generate the new redacted `resident-comparison-linux-2026-10-18.md` tables; no general winner or budget is claimed without a stable limiter. Final two-axis reviews are active read-only; no full gate rerun needed for this documentation/external measurement increment. Next resolve review findings, preserve report, then continue complete-contract/native/model qualification and maintained portable campaign tooling. All six tickets remain incomplete; no push/merge/publish/service/prototype cleanup authorized.

Final comparative report Standards and Spec reviews both found no actionable findings. Both independently matched all1015 terminal hashes and the analysis manifest; Standards counted1024 terminal/analysis bindings. Counts/resource medians and explicit failed-attempt/survivor/correlated-timing limits agree. No product reruns or edits by reviewers. This review certifies the scoped measurement report, not full-ticket completion or a performance winner.

### Legacy read-path increment — 2026-10-18

CurrentHEAD3a96bc50 plus unstaged probe changes. New scripts/resident-live-protocol.ts supports exact2025-06-18 initialize/initialized and existing2026-07-28 discovery. Optional schema-owned protocol propagates pair/managed pair/host inputs and receipts; one typed resolver owns default and requestID derives from HostMessage. Managed process success case now runs both protocols, retaining actual separate parents, overlapping distinct payloads/colliding IDs, exact four project results, one owner, empty state and kernel exit0. Focused8tests pass; initial fullgate49163 TERMINAL PASS483files5743tests,1374diagnosticfiles0errors/warnings, coverage99.45/99/99/99.55. Initial Standards P2 default duplication/bareID resolved; follow-up clean and all20live bindings matched. Spec first review clean, latest live-evidence follow-up pending.

Live proof `/tmp/resident-live-legacy-qualified-k3fdvynd`: initial prep failed module loading external @hcengineering/activity before product launch, preserved receipt(empty)/diagnostics/resources terminal1. Named correction Linux-local node_modules link; distinct attempt-2 actual local-Huly legacy token/native reads PASS:4exact results from2separateparent/adapters, common generation/backend, all parent/adapter0, kernel-owned backend0, supervisor0, empty state/diagnostics. verify.mts parsed input/receipt and independently checked targets/identity/cleanup. live-manifest.json20bindings; source: keys map to exact archived source-before-review copies, all6 original hashes matched. Later source corrections centralize defaults/types without runtime behavior changes; do not imply new native platforms or full matrix.

Final fullgate79718 is LIVE `/tmp/resident-live-legacy-qualified-k3fdvynd/check-all-final.log` for corrected finalsource. Follow that exact handle; do not restart because polling expires. Runtime packaged MCP/CLI unchanged. Do not commit until finalgate adjudicated; preserve both logs and initial failure. Transient untracked scripts/.huly-cli-script-* may belong to active gate; do not remove while live. Final two-axis review/evidence freeze/report completion and local commit next; no need another Huly run for nonbehavioral resolver/type corrections absent contrary evidence. All six tickets incomplete; nativeMac, model checkpoint/oracle, remaining matrices and maintained portable comparative campaign still pending. No push/merge/publish/service/prototype cleanup authorized.

Gate79718 is TERMINAL exit1:483files5743tests all PASS, but resolver extraction leaves branch/function coverage98.99% below99%. No failing behavioral test and no threshold change. Named coverage-failure-diagnosis.json in legacy proof root records cause/correction. Added test/resident/live-read-protocol.test.ts:5focused tests pass for default/explicit/unsupported protocol selection, exact legacy handshake and ID-free initialized notification, wrong-version refusal before initialization, valid/invalid modern discovery. Initial focused lint noted type-only import, fixed before finalfocused pass/lint. final-source-manifest.json plus final-source copies bind7finalhelper/test files. Both live-evidence follow-up reviews were clean and matched20 originalbindings.

Fresh fullgate32272 is LIVE `/tmp/resident-live-legacy-qualified-k3fdvynd/check-all-protocol-laws.log`; follow this handle, not terminal79718/49163. Full gate must pass before commit. No product runtime changes or further Huly invocation needed for added pure/port behavior tests. Next finalreview tests, adjudicate gate, freeze proof/update report/localcommit. All broader pending requirements unchanged.

Latest five-test review: Spec no findings; Standards P2 requires one ordered event trace in legacy success test (separate requests/notifications arrays currently cannot prove handshake-before-notification). Accepted; NOT YET FIXED while32272 immutable gate runs. After32272 terminal, replace those two arrays with one tagged request/notification trace and assert exact initialize then initialized ordering. Then focused test/lint, fresh review and final fullgate for that final test source. Do not claim current gate is final acceptance of this pending correction. No production changes or Huly rerun needed. Also acceptance evidence index now links completed30attempt series and scoped legacy evidence rather than incorrectly calling them wholly pending. Current gate32272 confirmed live this turn; no other known live owned probe. Workingtree uncommitted.

Gate32272 TERMINAL exit1:484files5748tests pass, branches99%, functions98.99%. New uncovered callback precisely identified at resident-live-protocol.ts:47, hypothetical failure encoding fixed internal initialized notification. Replaced expected-error mapping with Effect.orDie consistently with internal-defect policy; real send failures remain typed. Ordered test now records request, negotiated Effect completion, notification in one trace and asserts exact order. Fivefocused tests/typedlint pass; both reviewers confirm P2resolved/no findings. coverage-function-diagnosis.json preserves failed gate facts; ordered-final-source-manifest.json plus7source copies freeze current candidate. Fresh fullgate34504 LIVE at `/tmp/resident-live-legacy-qualified-k3fdvynd/check-all-ordered-final.log`, only current gate. Follow34504, never terminal32272/79718. Artifact hashes rechecked unchanged908e121f/e15d82af. Protocol selection/dependency-resolution instructions added to docs/resident-read-qualification.md. verify-terminal.mts separately parsed actual attempt-2 final resource record as supervisor exit0. Next adjudicate34504, freeze terminal proof, final docreview/localcommit. All broader requirements remain pending.

Gate34504 TERMINAL PASS:484files5748tests;1375TS/Effectfiles0errors/warnings; coverage99.45/99/99.01/99.55%; output200/300. LogSHA412c5afb19dad2f98a6f2152aedf5eafaa9eb9a2690edc35982b7a87aa4a3671. gate-proof.json binds7current helper/test sources and unchangedMCP/CLIbytes. terminal-manifest.json49files preserves all earlier failures/liveproof/source snapshots. No owned live session remains. Next final scoped evidence/doc reviews then localcommit; no additional gate or Huly rerun absent a new semantic/source change. NativeMac/model/fullmatrices/portablecampaign stillpending; ticketsopen. Next useful implementation target is real auto native/proxy client identity/output behavior (#323/#325/#328) using maintained probe rather than generic forcednative identity. No new-default/push/merge/publish/service/prototypecleanup authorized.

Final Standards and Spec evidence/doc reviews both clean. Each matched49terminal hashes and all7final source hashes against current worktree, confirmed passing gate/unchangedartifacts, preservedfailures and exact scopedlegacy/protocol/dependencyinstructions. Localcommit of this reviewed10-file increment next; no broader qualification claim.

### Auto client exposure — 2026-10-18

CurrentHEAD2358443a plus reviewed unstaged10-source auto-probe increment. Optional schema-owned clients per pair/host contain name+expected configuredMode/exposure. Selected name goes through modern metadata/legacyhello. Managed context verifies actual configured/resolvedmode before Hulyread and records actualexposure/catalog. Native/proxy project calls and exact corresponding output schemas; proxy toolName mustget_project, crossed/error envelopes refuse. Existing defaultgeneric/native path preserved; receipt newfields optional for historical receipts, mandatory in autoverification.

Targeted23tests PASS: two protocols × native/default + auto Claude/Codex bothinputorders (6successcases), exact606/6catalogs/kinds, collidingIDs/differentprojects, separateparents/sharedbackend, actualfixture onefullmodelrequest, expectedmode mismatch before projectread, output negatives. Type/lint0. Two code reviews clean. Actual local-Huly campaign `/tmp/resident-live-auto-qualified-of08j_ff`4cases all supervisor0,16exactreads, contextautokinds/modes/catalogs verified, sharedbackend0/emptyprivate state/emptydiag; verify.mts independently parses receipts/input/kernelterminal and exacttargets/ownership/catalogs. No writes. Names are selected Node readers, notactual applicationhosts; inputorder is not deterministicownerelection; modelrequestcount1 fixtureonly. Live-manifest43files and10sourcehashes both reviewers matched/no findings.

Gate81104 TERMINAL PASS485files5758tests;1377TS/Effect0errors/warnings;coverage99.45/99/99.01/99.55%;output200/300. LogSHAab19656dfd9e761bd6f6e2cfb5af6e43f293d59f4ac1729a8da2cd9e14b3692c. gate-proof.json binds10sourcefiles/unchangedMCP908e121f/CLIe15d82af. terminal-manifest46files. No owned liveprocess remains. Final scoped gate/doc review then localcommit next; no extra test/Huly rerun absent newchanges. Fullcapabilities, actualhostsauto, fullauth/invalidation/nativeMac/model-oracle/portablecomparison remainpending. No push/merge/publish/service/prototypecleanup authorized; all6ticketsstillincomplete.

Final Standards/Spec gate reviews both clean:46terminal hashes/10currentsources match, passinggate/unchangedartifacts/scopedclaims confirmed. Localcommit next. Useful next scoped evidence: explicit context-backed auto reads in actual hosts (prior Codex path forced native; prior Claude omitted the setting); use existing isolated host fixtures and applicable existing retirement bounds, preserve prior failures. This would still not replace fullcapability/auth/platform/model qualification.


### Actual-host explicit auto reads — 2026-10-18

HEAD89a06619, runtime/probe sources unchanged; previous full485file/5758test gate applies. Actual Codex0.163.0 and ClaudeCode2.1.296 scopedauto scenarios both PASS once with explicit HULY_TOOL_MODE=auto, PROXY_OUTPUT_STRICT=true, TOOLS=get_project and inheritedtokenauth. Codex root /tmp/resident-codex-auto-live-49rhstmo: actualcontext auto/proxy,kindcodex,stricttrue,6tools exactproxy4+builtin2,nativevisible0/proxycandidate1; appservercontext then2invoke_tool/get_project exactnestedresults; no modelinference. Claude root /tmp/resident-claude-auto-live-dbxyk3_q: actualcontext auto/native,kindclaude-code,stricttrue; exact3model-visibletools(getproject+builtin2); deterministiclocalMessages drivescontext+2projectreads thenfinal,4finitefixtureturns, unchanged12sechostbound. EarlierClaudeimplicitauto corrected historicaloversimplification; nofirst-everautoclaim.

Both actualhosts0, registry-correlatedkernelbackend0, supervisor0, empty state/supervisordiag. Existing explicit45lease-expiry/35retirementbounds used; Codexabsolute5secresponse and existing5+5secclose/escalation waits retained; no ordinary25secextension. No Hulywrites/globalsettings/messages. Both Effect-schema verifiers pass actualcontext/catalogs/targets/identity/kernelterminal/cleanup. Raw manifests110Codex files(incl90isolatedhoststate) +24Claude. Configuredcredentialvalues absent fromnonbundle evidence. Codex verified.json initial internal summary retained; verified-schema.json plus currentverify.mts is finalschema-owned proof, verifiedwithout anotherhostrun. Inputs/artifacts/probes hashmatched. No ownedlivehandle remains (78320/89609/99375/49370terminal0). Latest scoped docs/evidence review next, then localdoccommit; do not repeat fullgate/Huly without newsourcechanges/failures. Fullcapabilities/auth/protocol/nativeMac/model/portablecampaign and all6ticketcompletion remainpending. No push/merge/publish/service/prototypecleanup authorized.

Actual-host auto Standards/Spec reviews bothclean, all134manifest hashes matched. Reports distinguish Codex directappserverdispatch from Claude deterministiclocalmodel, explicitvspriorimplicitauto and restrictedcatalogs fromcompletequalification. Localdocscommit next. Next useful work is requirement-by-requirement evidence audit before adding more scenarios: map68childcriteria +50parentstories to actualcurrentartifacts, isolate exact residual Linux gaps from nativeMac/model approvals/deliverycleanup. Avoid treating generic repeated pendinglists as evidence of missing implementation; verify each actualcriterion. No external approval repeated.

### Requirement-by-requirement audit — 2026-10-18

CurrentHEADb3e28661; runtime unchanged, no ownedlivehandles. Fresh ghissueview322–328 at /tmp/resident-completion-audit-1eqbwb97/requirements matches every cachedbodyexactly, allOPEN. Independent parent50story audit /tmp/resident-parent-stories-audit.json:30proven18partial2unverified; child68criteria /tmp/resident-child-criteria-audit.json:28proven38partial2deferred. Root additionally mapped52normative parentimplementation/testing clauses (not merely stories);21proven30partial1deferred. Combined170row data docs/implementation/resident-completion-audit.json preserves exacttext/bodyhashes/evidence/gaps; statuses79proven86partial2unverified3deferred are overlapping requirements, notpercentageprogress. Summary resident-completion-audit.md.

New rerunnable scripts/verify-resident-completion-audit.py checks exactinventory/provenance/IDs/text/status/evidence paths+lines+contentSHA; default passes inventoryonly, --require-complete currentlycorrectlyexit1. --self-test accepts twovalid inventories and rejects8invalidcases. Checker outputs/source hashes retained inauditroot. No semanticcompletionclaim derivesfromfileexistence. Next review audittool/rootnormativeclassifications then commit scopedartifact; no fullgate rerun neededforPythonread-onlyauditharness/docs with unchangedMCP/CLI sources (last485/5758gate remainsvalid).

Concrete next implementation/evidence targets: operatorstatus has no authenticatedreadiness/model/admission/attachment/request/drain observations (parentD36); packaged held-shared-model waiter cancellation/survivor/no-latedispatch and other active/queue/backpressure matrices; nativecredentialgeneration/capabilities/interactive/oldgeneration schedules; operational verified unexpected-loss retirement/reset+replacement evidence (NOT mandatoryparticularCLIcommand; boundedrefusalvalid); lifecycleQuinttype-only/nativeMacmissing; finalportableevidence/delivery/prototypecleanupafterqualification. Do not invent stronger durability/journal/transparentfailover/Windows implementation requirements. Prior permissionquestionsforMac/model remainpending; do not repeat them while independentworkexists. No push/merge/publish/service/prototypecleanup now.


### Authenticated operational status — 2026-10-18

Baseline c423395e plus current reviewed status increment. ParentD36 implemented: protected status-v1 endpoint/CLI, MCP readiness/admission, owned attachment/pending-admission/retained-request/blocked-request counts, drain and unverified recovery. No admission/Huly acquisition, retry, namespace mutation or retirement certification. Five-second/4KiB limits;16existing records maximum. Pure work projection; blocked cleanup remains observable. Independent CLI/MCP package versions negotiate known descriptor/status wires; exact-version managed attachment selection is preserved, unknownfuture payload opaque. Protocol/docs/generatedCLI skill updated.

All current check-all stages PASS:492files5767tests;1389TS/Effect files0errors/warnings; coverage99.45/99/99.01/99.55%; output200/300. Log /tmp/resident-status-check-all-complete.log SHA11a03a3888f647112d4fc3f21f843f89610a061045bb4d527b23540697479965. Earlier full failures retained: exact-version status selection exposed actualCLI0.51.1/MCP0.53.1 difference; one unnamed fixtureconstant; earlier descriptor refusal exposed case-sensitive old stop-test phrase. Typed refusal/zero-submission checks remain. Timeoutfixture cleanup corrected without productbound change. Both source/evidence reviews clean; latest2testchanges also independently accepted.

Evidence /tmp/resident-status-qualified-ai0bo0be: actual packagedCLI2→1samegeneration process counts; read-only localHuly4reads/2parents sharedbackend, one authenticatedCLI snapshot2attachments2retainedrequests, statusretirementunconfirmed, separatekernelbackend0/parentexits0/supervisor0/emptystate. verify-live.mts parses actualcontractschemas; private manifests retain source/probe/artifactbindings/failures. MCP3de87544cbb06d4119b07a8b02e2f158b23d22c30d3edfe4ee1ef2564f292c3e CLI54019c099e8fdd3ea6752abc97ced2d496c61fd106fc24f9c96bfdb46f22f03b match live and final gate. Older movement receipts bind previous runtime, not final changed-byte certification. No owned livehandles remain after gate24839/live11686/verifier83730 terminal0.

All6tickets/fullgoal remain incomplete. Previous audit is the frozen b3e28661 baseline; its D36 gap is superseded by status report, not an overall completion claim. Next concrete Linux target: packaged two-real-parent held shared-model wait cancellation/survivor/no-late-dispatch. Existing disposable-rest-fixture.ts onModelLoad callback supplies the model gate; existing managed-read/model-loss fixtures supply launch/ownership seams. No need for another server implementation. LifecycleQuint/nativeMac approvals remain previously pending; no repeat question while independentwork exists. Windows excluded; no push/merge/publish/service/prototypecleanup authorized.


### Packaged shared-model waiter cancellation — 2026-10-18

Baseline61da36a6 plus current reviewed test-only increment; no production source or runtime artifact changes. New maintained model-wait-process.test.ts builds actuallauncher and independent SDKhostparents. Four schedules: actualnegotiated2026-07-28/2025-06-18 × cancel firstmodelrequester(creatorfixture role)/joiningwaiter. This creatorrole does not identify backendstartupelectionwinner. DisposableREST onModelLoad holds actualSDK fullmodelresponse. Protectedstatus shows2retainedrequests then1aftercallerabort/servercleanup whilemodelstillheld and2attachments. Release model; survivor exactSURVIVEread, canceledclientfreshFRESHread, survivorcontinuedSURVIVEread; final0retained/0blocked/samegen/unchangedregistry. Final observations parsed AFTERkernelbackendexit0 require1fullmodel,3exactqueries SURVIVE/FRESH/SURVIVE,0writes/invalidrequests; noCANCELquery acrossshutdown. Bothparentexits0/emptystate. Allrequest/parent5s/kernel7s/supervisor25s bounds preserved.

Final gate95682 TERMINAL PASS493files5771tests;1394TS/Effect files0errors/warnings; coverage99.45/99/99.01/99.55%;output200/300. Log /tmp/resident-model-wait-final-check-all.log SHA742b8fc3626eb5a57162b5d91aff26e9550bc028155ff4f5ab8c2768ac549d4a. Evidence /tmp/resident-model-wait-qualified-0uvjka_z includes final4receipts/phases/kernelresources, verify.mts parsingcontractschemas +actualadapter-parentlineage/artifacthash/retirement, earlierfailedattemptlogs andfirstgreen gate. Initialresultshape/SDKlegacypinning fixtureerrors corrected; Standards cleanupfinding fixed via scenarioResult +allSettled parent/rest/observer cleanup preservingprimaryfailure. Bothsource reviews clean; Spec accepted strongerpost-retirementcounters. MCP3de87544cbb06d4119b07a8b02e2f158b23d22c30d3edfe4ee1ef2564f292c3e CLI54019c099e8fdd3ea6752abc97ced2d496c61fd106fc24f9c96bfdb46f22f03b unchanged fromstatusactual-Hulyproof; no newliveHuly ormacOScampaign claimed.

Currentreport resident-model-wait-linux-2026-10-18.md supersedes frozenaudit322.9's missingpackagedschedule; D36previouslysupercededbystatusreport. Frozenb3auditnotrefreshedtooverallcompletion. All6tickets/fullgoalremainincomplete. Next useful Linux unit: active-call healthy-backend isolation underadapterEOF/death, thenremainingqueue/idle/backpressure/routingmatrix/puretransitionboundary. ExistingmodelwaitIPC anddisposableRESTonProjectRead supply reusableheld-call seams; avoidunrelatedsubstitute server. NativeMac/lifecyclemodelcheckpointremainpreviouslypending; no repeatpermissionquestion. Windows excluded; no push/merge/publish/service/prototypecleanup authorized. No owned runtimehandles after95682and finalverifier89684 terminal0; next verifyfinalmanifests/reviews andlocalcommit.

### Per-project held-query fixture — 2026-10-18

Uncommitted follow-up to 6a5a276d: disposable REST now parses and records each project identifier before invoking `onProjectRead(identifier)`. Existing callbacks that ignore the argument remain supported. The new fixture test holds LEAVE and SURVIVE independently, observes their arrival order before release, completes SURVIVE while LEAVE remains held, then releases LEAVE; exact parsed HTTP results and zero writes/invalid requests are asserted. This is preparation for active-call EOF/adapter-death schedules, not proof of those schedules.

Focused fixture test and TypeScript/Effect diagnostics passed (1395 files, zero errors/warnings). An overlapping focused process run failed modern creator startup before either project-read gate was reached: `/tmp/resident-model-wait-vSixFw/failure.log` and `resources.jsonl` preserved; supervisor exited1 after bounded cleanup. Remaining12 process cases passed. Root cause remains unproven; do not dismiss this failure based on a later pass. Full gate33701 terminal PASS:494files5772tests,1395diagnosticfiles0errors/warnings; coverage99.45/99/99.01/99.55%; `/tmp/resident-query-gates-check-all.log`. Standards requested preserving parsed identifiers in the read helper; Spec requested observing actual LEAVE promise settlement after SURVIVE resolves. Both corrected and independently accepted; strengthened focused test passed. Final typecheck74529 and lint91906 terminal0; request-loss62401 terminal0 (4tests). MCP/CLI artifact hashes unchanged at3de87544cbb06d4119b07a8b02e2f158b23d22c30d3edfe4ee1ef2564f292c3e /54019c099e8fdd3ea6752abc97ced2d496c61fd106fc24f9c96bfdb46f22f03b. No production changes, commits, live Huly or macOS qualification in this follow-up. All six tickets remain incomplete; Windows remains excluded.


### Active-query EOF/adapter-death isolation — 2026-10-18

Baseline14c6415c plus current reviewed test-only increment; production unchanged. Maintained active-query-process.test.ts: two raw-stdio independent parent clients, actual packaged managed adapters, both protocols×EOF/SIGKILL; two independently held already-dispatched project queries LEAVE/SURVIVE, collidingID41. No cancellation notification. True departing stdinEOF or ownedchildSIGKILL; actual interrupted41/adapterclose0-null or null-SIGKILL verified before survivorrelease. Authenticated retainedcounts2→1→0, accepting/0blocked/samegeneration, unchangedregistry; exactSURVIVE41 thencontinuedSURVIVE42. Bothparentexits0; supervisor kernelbackendexit0, emptyprivate state, finalactualcounters1fullmodel/3exactqueriesLEAVE-SURVIVE-SURVIVE/0writes-invalid. Ordinary5sIO/7sretirement/25ssupervisor preserved; onlykill uses existing45sleaseexpiry mode/new explicit35s kernelobserver/50souter allowance. Initial mistaken transientdrainpoll requirement corrected to stableactualexit/interruption/retainedwork evidence, not productchange.

Fullgate87163 TERMINAL PASS495files5776tests;1400diagnostics0errors/warnings;coverage99.45/99/99.01/99.55%;logSHAeeb8d272dd18829e3220c595215a085a7006a1974704f1a9fc84bfbc55b757fd. Initialmatrix13390 all4PASS; correctedsourcefinalgate4receipts separatelyretained. Bothreviewsaccepted after Standards fixes: preserveprimaryfailure, independentlycleanup active/termination/reader, ownadapterkill+join ongracefailure; parsedprojecttarget throughstart. Report resident-active-query-linux-2026-10-18.md; evidence /tmp/resident-active-query-qualified-y5sam5zk, finalschema verifierPASS bindsruntimehash/protocol/loss/processlineage/status/kernelretirement/state. MCP/CLI hashes unchanged3de87544cbb06d4119b07a8b02e2f158b23d22c30d3edfe4ee1ef2564f292c3e /54019c099e8fdd3ea6752abc97ced2d496c61fd106fc24f9c96bfdb46f22f03b. No newactual-Huly/macOScampaign. Earliermodelwaitstartupfailure /tmp/resident-model-wait-vSixFw remainsunexplained and preserved; this green gate does not eraseit.

All6tickets/fullgoalremainincomplete. This supersedes only the activequeryEOF/death subset of frozen baselineaudit gaps, not generalhealthybackendmatrix completion. Remainingindependentwork includes queues/backpressure/interactivecapabilityrouting, idleprotectedwork/faultmatrix, pureexplicitadmission/idle/ownership transitionboundary, unexpectedlossverifiedreplacement; finalchanged-byte movementcertification remainspending. NativeMac/lifecycleQuintcheckpoint previouslypending; no repeatpermissionquestion. Windows excluded; no push/merge/publish/service/prototypecleanup. Allowned runtime/gate/verifier handles terminal. Next verifyfinalsource/evidencemanifests andlocalcommit.

### Shared native-backend output isolation — 2026-10-18

Baseline0491d388 plus current test-only increment; production unchanged. New output-isolation-process.test.ts runs both protocols×closed/unread raw stdout with two independent client parents and actual packaged managed adapters. Disposable REST project BLOCKED has1MiB name; peerSURVIVE. Both ID41 queries reach independently held REST boundaries, then responses released. Peerexact41 checked before joining blockedfailure observation; closed mode may actually fail sooner. Blockedadapter must exit1/no signal with specific productoutputfailure diagnostic; successfulscenario neverkillsit. Host waits actualexit, destroys unreadpipe, joins boundedstreamclose before diagnosticassertion (Standards race finding fixed). Peercontinued42 samegeneration/unchangedregistry/accepting/no blockedcleanup. Post-failure1attachment, retainedsnapshots2/0/0. Bothparentexits0/kernelbackendexit0/emptyprivate state; finalactualRESTcounters1fullmodel/3exactBLOCKED-SURVIVE-SURVIVEqueries/0writes-invalid. Ordinary5sIO/7sretirement/25ssupervisor/30souter unchanged; named15s outputexitobserver accommodates existing10s productwriteallowance, matching prior manualoutputfixture. No productdeadline changes.

Initial4matrix32185PASS; diagnostics1403files0errors/warnings/lintPASS. Standards/Spec accepted fix/report. Fullgate45063 TERMINAL PASS496files5780tests/1403diagnostics0errorswarnings/coverage99.45-99-99.01-99.55; log /tmp/resident-output-isolation-check-all.log SHAd5ce690e87dbae13ba8de599087fd4b4b0e475853c436ec7ad9db4dc03ebb54d. Final4cases in /tmp/resident-output-qualified-pgo43k2x/cases-final alreadypassed independent schema/hash/processlineage/ownedretirement/emptystate verifier. Initialcases separatelyretained; finalsource/evidencemanifests bind thiscandidate. MCP/CLI runtimehashes unchanged3de87544cbb06d4119b07a8b02e2f158b23d22c30d3edfe4ee1ef2564f292c3e /54019c099e8fdd3ea6752abc97ced2d496c61fd106fc24f9c96bfdb46f22f03b. No newliveHuly/nativeMac campaign.

All6issuesremainincomplete. This adds only shared-native-backend outputfault isolation, not queueexhaustion/generalinteractive or completehealthybackendmatrix. Next independentwork: explicitpureadmission/idle/ownershiptransitionboundary and retained-request/admissionlimits; remainingrouting/uncertainty/recovery/nativeMac/lifecycleQuint/finalchanged-byte movementcertification stillrequired. Previouslypending approvals not repeated while independentwork exists. Windows excluded; no push/merge/publish/service/prototypecleanup. Earliermodelwaitstartupfailure /tmp/resident-model-wait-vSixFw remainsunexplained and preserved. Gate/verifier terminalPASS; finish finalbindingreviews/localcommit. No ownedruntime/gate/verifier handles remain.

### Per-adapter retained-request budget — 2026-10-18

Baselinebddf6975 plus current test-only increment; no production changes. New burst-isolation-process.test.ts for bothprotocols: realpackagednativebackend/twoindependentparents. Firstadapter8distinct B0–B7 queries/IDs41–48 heldatREST; peerSURVIVE41 held; authenticated9retained across2attachments. DistinctoverflowOVERFLOW49→onlysaturatedadapterexit1/specificadmissionlimitdiagnostic aftercomplete streamclose. No successfulscenario kill/retry. Status1attachment1retained peer; releasegates exactpeer41/continued42 samegeneration/unchangedrecord/accepting0blocked. Bothparents0/kernelbackend0/emptystate; post-retirementcounters1fullmodel10reads(first8setB0–B7,last2SURVIVE),zeroOVERFLOW/writes/invalid. No claim interruptedreadsundo remote work. Ordinary5sIO7skernel25ssupervisor30souterunchanged. New burstfixturemodule owns explicit phase/ports; no runtimeprotocol introduced.

ModernfocusedPASS and bothprotocolmatrix17103PASS; diagnostics1407files0errors/warnings/lintPASS. Standards/Spec/code+report clean. Firstgeneratedtest had residualmode references and failedbeforeprotocol; correctedandlogretained /tmp/resident-burst-first.log; typeimportlintfinding corrected. Fullgate47171 TERMINAL PASS497files5782tests/1407diagnostics0errorswarnings/coverage99.45-99-99.01-99.55; log /tmp/resident-burst-check-all.log SHAd24b25b69c93cf15c13077105270cb3b43dda1d3ea35a612bc2708b77aff0b96. Evidence /tmp/resident-request-limit-qualified-9z2tmw8m, initialcases/schema+hash+processlineage+kernelretirement verifierPASS; finalcases/verifierPASS, source/evidencemanifests bindcandidate. Report resident-request-limit-linux-2026-10-18.md. No liveHuly/nativeMac campaign.

All6issuesremainincomplete. This qualifies oneper-adapter retainedbudget subset, not allqueues/fairness/interactive/generalcompletion. Next substantial implementationtarget: parentD8/D9 explicitpureadmission/idle/ownershipeventboundary (src/resident/admissions.ts andmanaged-selection.ts); architecture must preserve typedfailures, resourceownership, concurrencyfences andallcurrentprocesscases withoutdedicatedstate-machinelibrary/journal. Remainingfault/routing/recovery/lifecycleQuint/nativeMac/finalchanged-byte movementqualification stillrequired. Previouslypendingapprovalsnotrepeated whileindependentworkexists; Windows excluded; no push/merge/publish/service/prototypecleanup. Earliermodelwaitstartupfailure /tmp/resident-model-wait-vSixFw remainsunexplained/preserved. Gate/verifier terminalPASS; finalbindingreviews/localcommit next. No ownedruntime/gate/verifier handles remain.
