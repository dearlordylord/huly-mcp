# Issue 324: managed resident startup

## Scope amendment — 2026-10-18

The user excluded Windows resident support because substantial implementation and native qualification remained. Linux and macOS remain in scope. Windows resident startup continues to refuse unsupported execution; the unused native security component and its CI workflow are removed. Historical Windows investigation below is superseded, not pending delivery work. All other requirements remain, and #322–328 remain open.


Status: incomplete. The selected design is recorded in
[Managed resident ownership](resident-managed-design.md).

## Persistent ownership namespace (2026-10-17)

Managed startup now selects protected application state instead of an automatic
temporary root. Linux uses the absolute XDG state base or `~/.local/state`;
macOS uses `~/Library/Application Support`. Both append `huly-mcp/resident`.
An explicit resident state directory retains its prior behavior. Windows still
refuses unsupported ownership protection; this change supplies no native macOS
or Windows qualification.

Before selecting the new default, startup checks the former temporary
`huly-mcp-<uid>` namespace. Any entry or inspection failure refuses startup with
a verified-retirement diagnostic. The bounded inspection reads one entry and
closes its directory handle; it neither loads credentials nor deletes evidence.
An absent or empty old namespace permits selection. This is an upgrade guard,
not coordination with concurrently running old executables. Old launchers must
remain stopped during migration. No automatic metadata migration is claimed.

Seven focused tests cover Linux defaults, absolute/empty/relative XDG values,
macOS selection, absent HOME fallback, explicit namespace isolation, occupied or
unreadable legacy state and invalid supplied paths. They pass in
`/tmp/resident-persistent-directory-verified-tests.log`. The existing 15 owner
tests passed in `/tmp/resident-persistent-directory-tests.log`; that same initial
run exposed an incorrect Config API spelling in the new tests, fixed before the
focused pass. Three packaged lazy-NoConfig/profile diagnostic cases pass in
`/tmp/resident-persistent-directory-no-config.log`. TypeScript and Effect
diagnostics pass in `/tmp/resident-persistent-directory-typecheck.log`; focused
Oxlint passes in `/tmp/resident-persistent-directory-lint.log`.

These checks do not prove the entire managed process contract. Combined gate,
fresh reviews, launch/fault schedules and final live/native qualification remain
pending. [Launch documentation](../resident-manual.md#managed-state-location)
records the selected paths and migration limitation.

## Implemented foundation

`selection-claim.ts` creates an exclusive protected-directory claim. Only its
creator receives the one-use release operation. Repeated release cannot affect
a later claim. Changed inode ownership and failed cleanup retain blocked state.
`withSelectionClaim` releases normal ownership after use, failure, or interruption.

`start-authorization.ts` makes the child authorization decision irreversible.
Start permits one claim; disconnect or timeout before Start commits to exit.
The production IPC launcher has not yet been wired to these decisions.

`McpProcessPolicy` now owns the parsed tool-selection and exposure contract used
by `McpServerService`. Startup loads it once through the existing ConfigProvider.
An embedding can supply an already captured policy without rereading changed
environment values. Tool-scope resolution consumes parsed selections directly.
All callers of its former raw-string contract have been migrated.

Scope decoding rejects unnormalized, duplicate, empty, and comma-containing
entries. Environment CSV parsing preserves its existing normalization, unknown
entries, and first-occurrence order. Sorting the selection would change visible
metadata order, so compatibility must preserve that order. This prepares the
shared configuration handoff for #325; it does not implement authority matching.

## Evidence and limits

The focused claim and authorization tests pass, including ten independent Node
children using the production claim function. One child acquires ownership and
nine are refused. After SIGKILL of the winner, a later child refuses takeover.
Tests also exercise replacement ownership, repeated release, failed cleanup,
operation failure, and interruption.

TypeScript and Effect diagnostics passed for the initial foundation and process
fixture. Focused formatting and lint checks passed. The complete foundation
gate and fresh reviews are recorded below. The coherent managed-startup
candidate still requires its own qualification.

The process-policy increment passes the affected server, HTTP, scope, exposure,
and property suites. A server-layer test supplies captured policy alongside
conflicting and invalid environment policy and observes the captured toolsets.
The new serialized policy checks retain existing defaults and typed failures.
The first full foundation gate failed branch coverage at 98.99% despite 5,528
passing tests. A real Linux path-limit fixture now exercises non-conflict claim
creation failure and verifies that no claim remains. The corrected full gate
passes 434 files and 5,529 tests with all original thresholds. Its receipt is
`/tmp/resident-managed-foundation-check-all-corrected.log`.

Fresh Standards review identified an impossible-product authorization decision
type. The decision now permits only authorized with claim or none, or retired
with exit or none. Standards read back that fix and the path-limit fixture and
has no remaining finding. Fresh Spec review has no scoped defect. This verifies
the foundation increment, not complete managed startup or any whole issue.

## Automatic startup candidate, 2026-10-17

The Linux candidate now wires `MCP_TRANSPORT=stdio-resident` through bounded
selection, private IPC bootstrap and authenticated application readiness.
Configured explicit `resident-http` starts use the same selection claim and
generation registry. The parent releases its selection claim before attempting
Start and consumes its child termination capability before sending Start. A
disconnect after that attempt cannot authorize killing the independent backend.
Huly environment keys are removed from the child environment; the parsed capture
is transferred only after package version and fresh nonce verification.

The registry permits sixteen records of at most 64 KiB each. Publication uses a
private temporary file and atomic hard link; retirement checks the original
device/inode and consumes its capability before I/O. Unknown records block
selection. Known incompatible versions remain opaque and are not contacted.
The design report records the startup and cleanup bounds before their wiring.

The actual ten-parent Linux process fixture passes against this candidate:
`/tmp/resident-managed-current-ten-parent.log`. Its schema-checked, secret-free
receipt is `/tmp/resident-managed-parents-5fzatr.receipt.json`. The receipt observes
one generation, ten independent session adapters, creator exit, an active caller
termination, continued survivor reads, backend exit and removal of private state.
The installed SDK's disposable discovery probe can create the backend; the
fixture verifies that probe's exit separately from the active session adapter.
The Linux subreaper owns and joins orphaned fixture descendants. Earlier failed
race attempts remain recorded in `/tmp/resident-managed-ten-parent-*.log`.

The focused startup-budget, child-authorization, registry and owner suites pass
24 tests (`/tmp/resident-managed-owner-new-tests.log`), with five additional pure
authorization transition checks in the earlier three-suite run. They exercise
deadline sharing, queued Start after retirement, malformed frames, listener
cleanup, capacity refusal, replacement-file protection, readiness requirements
and retained evidence after reported shutdown failure.

The full gate `/tmp/resident-managed-current-check-all.log` passes all 443 files
and 5,574 tests but fails coverage: functions 98.82% and branches 98.63%, against
the unchanged 99% thresholds. Statements are 99.29% and lines 99.41%.
Diagnostics, circular detection, complexity and lint pass; duplication is 0.91%.
Fresh scoped Standards and Spec reviews report no concrete defect. These receipts do
not establish live Huly sharing, complete fault schedules, native macOS/Windows
support or acceptance of this issue.

The subsequent failure-coverage increment passes eleven source selection and
retirement tests (`/tmp/resident-managed-selection-retirement-tests.log`) and
three private bootstrap-codec tests (`/tmp/resident-bootstrap-codec-tests.log`).
The owner suite then expands to nine passing tests, including opaque incompatible
records and refusal at sixteen generations
(`/tmp/resident-managed-owner-capacity-tests.log`). Client closure is exercised
through its existing callback port for success, rejection, timeout and late
completion. Idle tests use TestClock and real admission services.

The actual ten-parent scenario also retains active sessions for eleven seconds
before the survivor read, exceeding the startup acquisition budget. It passes
within its unchanged thirty-second process bound
(`/tmp/resident-managed-long-session.log`, 22.26 seconds including bundle setup).
No live Huly resource is acquired by that metadata fixture. The fresh full gate
for this increment is `/tmp/resident-managed-retirement-check-all.log`. It fails
the ten-parent fixture while waiting for connections: 5,587 tests pass and one
fails. No coverage summary is emitted by that failed gate. Its exact bundle is
`dist/stdio-suite-UQxDmH`; the private root was removed and no process remains for
that bundle/root. The failure occurs before the new session-hold interval.

Both affected process suites subsequently pass together under coverage (eight
tests, `/tmp/resident-managed-process-phases.log`). That focused run's global
coverage failure is expected from its limited module set and is not a project
gate pass. The host fixture now emits schema-checked phase timings from Effect
Clock, and successful race runs retain a private phase log next to their receipt.
The full suite is being diagnosed with coverage reporting on failure, preserving
every case and threshold (`/tmp/resident-managed-phase-full-coverage.log`).

That complete coverage run passes 446 files and 5,588 tests, including the
instrumented ten-parent case. It still fails the unchanged thresholds: functions
98.93%, branches 98.79%; statements 99.41%, lines 99.52%. The passing phase receipt
is `/tmp/resident-managed-parents-1JR3BJ.phases.log`. It does not resolve the earlier
intermittent connection timeout, which remains part of qualification evidence.

The next increment preserves local lazy NoConfig discovery before any resident
selection. Its real SDK process test first fails on the previous implementation
(`/tmp/resident-managed-no-config-red.log`) and passes after wiring the pre-launch
decision. Invalid explicit profile selection initially loses its useful diagnostic
at the executable boundary (`/tmp/resident-managed-profile-diagnostic-red.log`).
The entrypoint now preserves known profile and resident startup errors while
redacting unexpected authority failures. All three executable discovery/diagnostic
cases pass (`/tmp/resident-managed-startup-diagnostics-tests.log`). Four source
selection tests cover absent, partial, eager, configured-lazy and missing-profile
behavior (`/tmp/resident-startup-selection-profile-tests.log`).

Ten tests now drive the source child launcher against a real owned IPC peer
(`/tmp/resident-managed-peer-tests.log`). They exercise prepared-child version and
nonce rejection, premature/malformed/refused replies, pre-Start authorization
failure, spawn failure, oversized handoff, lost readiness after Start, scrubbed
environment and disconnect without killing an authorized child. This is boundary
evidence, not an application-ready Huly backend fixture. The shared runtime
configuration boundary is isolated in `src/runtime/process-configuration.ts`;
token/password, captured authority, stored-profile provenance and explicit-profile
failure checks pass alongside configured startup
(`/tmp/resident-process-configuration-tests.log`). The complete gate must be rerun
for this source increment.

The subsequent complete gate (`/tmp/resident-retirement-candidate-check-all.log`)
passes 450 files and 5,616 tests. Functions reach 99%, statements 99.42%, and lines
99.54%; branches remain below the unchanged threshold at 98.87%. This is a failed
gate, not certification. Additional real IPC cases cover exit before the prepared
frame and refusal after Start without parent termination. All twelve IPC peer
cases pass (`/tmp/resident-managed-peer-terminal-tests.log`).

The next focused increment preserves both authenticated and unauthenticated direct
HTTP startup and refuses two simultaneously live compatible owners. The latter
uses two actual configured TLS backends and a test-owned copied locator. Neither
owner is selected or replaced; cleanup retires only that copy and joins both owned
servers. Both suites pass, 22 tests total
(`/tmp/resident-owner-http-parity-tests.log`). TypeScript caught an invalid cleanup
combinator in the new fixture; it now uses `Effect.acquireUseRelease` to preserve
typed cleanup failure. A subsequent gate passes diagnostics but stops on a
type-only import lint warning (`/tmp/resident-managed-owner-parity-check-all.log`);
the import is corrected. Fresh complete verification remains required.

## Verified Linux checkpoint

The frozen candidate passes `pnpm check-all` with 454 files and 5,632 tests:
statements 99.45%, branches 99%, functions 99%, lines 99.56%; duplication 0.91%.
TypeScript and Effect diagnostics, circular dependencies, complexity, lint,
formatting, packaging and catalog gates pass without changed limits. Receipt:
`/tmp/resident-lifecycle-boundaries-frozen-check-all.log`, SHA-256
`7d2b30f8b4c453f13df438521743f3ac9d7722d9c3608eb38643ecd51029a0e3`.
The MCP artifact `dist/index.cjs` has SHA-256
`1284ca48fed84404c6624650a9714970aa16881c9bfd0f56a00568a1886f0bd4`.
The ten-parent receipt is `/tmp/resident-managed-parents-8ClklS.receipt.json`.
This pass does not erase the earlier intermittent connection timeout or its logs.

Fresh combined Standards and Spec reviews find no actionable defect in staged
tree `b5ed29cd8cd11336fa2430a6e835ed327824a3e9` against `73a325bc`.
They explicitly distinguish the passing checkpoint from the incomplete six-issue
contract. The subsequent report-only additions record this evidence.

The standalone source fixture now observes its own port-zero listener through
`makeServerStartup` and the existing HTTP factory port. It does not reserve and
release a port before application binding. Default `main` retains the default
factory. Source startup, configured-resident startup and HTTP authorization tests
pass, 24 tests (`/tmp/resident-owned-listener-parity-tests.log`). Linux XDG default
profile lookup and late TLS/registry retirement tests pass, 20 tests
(`/tmp/resident-lifecycle-xdg-boundaries-tests.log`). The XDG case makes no native
macOS or Windows claim.

## Parent loss before Start

The packaged Linux fixture holds the detached child before its application
entrypoint, confirms its kernel parentage, and kills only the owned parent
process. The child observes IPC disconnect with zero private frames, then exits
naturally. No generation is published. The unresolved selection claim remains.
This covers parent loss before Start, not recovery after authorization.

The focused test passes in `/tmp/resident-parent-loss-minimal-preload-tests.log`.
Its schema receipt is `/tmp/resident-parent-loss-DKdAnX.receipt.json`.
TypeScript and Effect diagnostics and lint pass in
`/tmp/resident-parent-loss-final-typecheck.log` and
`/tmp/resident-parent-loss-final-lint.log`. Fresh Standards and Spec reviews find
no actionable defect in this four-file test increment.

The frozen increment passes `pnpm check-all`: 457 files and 5,636 tests, with
statements 99.45%, branches 99%, functions 99%, and lines 99.56%. All existing
limits and diagnostic checks remain enabled. The full-gate receipt is
`/tmp/resident-parent-loss-frozen-check-all.log`, SHA-256
`a5d870d4ca44a415396a80dd6c071091aba0025255bdb29e6c3972c52e4e6853`.
The process receipt from that run is
`/tmp/resident-parent-loss-HMOfXw.receipt.json`.

The gate uses Node's awaited import preloads before the application entrypoint,
as implemented in [Node 24 run_main.js](https://github.com/nodejs/node/blob/v24.20.0/lib/internal/modules/run_main.js#L82-L94).
An earlier fixture failed because its preload imported an SDK-bearing CommonJS
dependency into the ESM bundle. That attempt remains recorded in
`/tmp/resident-managed-parent-loss-tests.log`. The passing preload uses a local
bounded wait and avoids that dependency. No production module is replaced.
The fixture makes no live Huly, macOS, or Windows qualification claim.

## Remaining work

Complete source failure coverage and the remaining packaged fault schedules.
Complete the remaining profile lifecycle cases. Align implementation
observations with the lifecycle model. Final live Huly and native-platform
qualification remain pending. No complete issue criterion is accepted by these
foundation tests alone.

## Keep the selected admission through caller use (2026-10-17)

Selection previously admitted a compatible candidate, released that admission,
then acquired a second admission before invoking the caller. A real local TLS
regression fixture closes admission after release: the former implementation
loses its already-confirmed owner at that intermediate gap. The failing-before
run is `/tmp/resident-admission-continuity-red.log`, SHA-256
`10814655ee581e93e6730d58e6f5f68bee10828fce8567326d174cbc9668e7d4`.

The bounded inventory scan now retains the first matching admission inside its
original bracket, including heartbeat renewal, while checking the remaining
records. A second compatible owner still refuses before caller use. Only a unique
match releases the selection claim and invokes the caller; all normal, failure
and interruption exits unwind the existing typed admission cleanup. No admission
is released and reacquired merely to start using the selected owner. Complete
inventory decoding occurs before contacting any candidate.

The new tests cover continuity across the former gap, refusal and release of
both capacity-one owners after ambiguity, and release after caller interruption.
A fourth case selects the unique compatible owner among different configurations.
Together with compatibility tests, 12 tests passed in
`/tmp/resident-admission-continuity-final-verified.log`, SHA-256
`01cea485f8f1f02fd8c193f7d235bead9e713d460936eaf0f9f8c31b55b7a3a2`.
The nearby owner/idle/compatibility run passed 28 tests before the two additional
safety cases were added. TypeScript/Effect diagnostics checked 1,337 files with
zero errors/warnings; lint, circular and complexity passed. Fresh read-only
Standards and Spec reviews found no actionable issues.

The packaged ten-parent and operator-stop run failed during connection; its
preserved log is `/tmp/resident-admission-continuity-process.log`, SHA-256
`0d1e06800848d42e599a8c76932303f8973a6ba8adad941c34bf0146713c957a`.
A controlled ten-parent run of the same retained candidate also failed; its
artifacts remain under `/tmp/resident-admission-retained-candidate-cW67vo`.
These failures do not invalidate the deterministic gap regression, but they keep
packaged launch reliability unqualified. No timeout, caller count, inventory,
coverage threshold, recovery guarantee or default transport changed. The packaged
MCP artifact used by both failed suites has SHA-256
`7368fa498f2b25eeef9aa6d6fae77425aa7ea0bb31f882ce70fa8d2c363cc53a`.

After the static checks finished, sequential retained-artifact controls passed:
baseline receipt `/tmp/resident-admission-retained-baseline-14NwUM.receipt.json`
(SHA-256 `510cb1aaf268ca2c3ae54367945f76e456fdc902937da85797c1d3df16cb0b62`),
then candidate receipt `/tmp/resident-admission-paired-candidate-00FrTk.receipt.json`
(SHA-256 `abf90d9ec6bfd5cb9dcb527729ca98d5189aee9adbb6d8e291a8bc3d34106ba9`).
The candidate receipt includes actual kernel-owned backend exit code 0. These
are successful retained-artifact schedules, not a reliability or performance
measurement; previous connection failures remain qualification gaps.

Review strengthened the configuration test to assert the selected descriptor's
exact generation path, since both native fixtures answer ping successfully.
The final 12-test run includes that assertion; both review findings were resolved
and rechecked without residual actionable findings.

The same retained packaged candidate then passed the complete operator-stop
schedule. Receipt `/tmp/resident-admission-retained-stop-knNlOs.receipt.json`,
SHA-256 `feefcd09f29231f40550915072d1df6b6da1b1f7c98b8eab6c5332a3450cd6e4`,
records three kernel-owned backend exits with code 0, two replacement callers,
an unchanged unrelated generation record, and complete private-state removal.
This remains scoped Linux process evidence; it is not a final six-ticket gate or
live-Huly certification.


## Initialize the server only in the selected owner

The managed child previously imported the complete server runtime before sending its prepared frame. Runtime loading now occurs inside the absent-selection `runOwnedGeneration` callback, after Start authorization and ownership selection. A redundant child that finds an existing compatible generation keeps the existing notify path and does not initialize the server runtime. Captured configuration, authorization, publication, cleanup brackets and deadlines are unchanged. This defers module initialization; it does not prove a specific startup limiter or a speedup.

The first ten-parent process run after this change passed with the original callers and deadlines, including creator loss, survivor context read, matching kernel-owned backend exit code 0 and private-state removal. Log `/tmp/resident-child-owner-load-ten-parent.log`, SHA-256 `d46e15f8787330866de78f0de0823b65d35c0578900881865c754af17433dcd6`; receipt `/tmp/resident-managed-parents-PkH7Ya.receipt.json`, SHA-256 `70d27e848e2d2a4f51fe36eb4ef81f17a234e628b30521f3a47e7aa8b7787548`. One successful attempt does not resolve the preserved inconsistent launch results. TypeScript/Effect diagnostics pass for 1353 files with zero diagnostics. Fresh scoped Standards and Spec reviews found no actionable findings. A coherent full gate and complete qualification remain required.

## Windows child environment and storage design

The [Windows implementation design](resident-windows-design.md) selects an
in-process native protected-storage module while retaining the existing Node
ChildProcess and authenticated bootstrap. It preserves full private creation,
identity, inventory and cleanup requirements. Native storage, binaries and native
execution remain unimplemented/unqualified, rather than replaced with a platform
refusal or POSIX permission claim.

One concrete launcher correction is implemented: child environment construction
now parses inherited values through a schema into Redacted values and strips all
Windows case variants of inherited profile, authentication, transport and nonce
keys. POSIX keys remain case-sensitive. Only the spawn adapter unwraps values;
canonical child transport and fresh nonce are supplied once. Undefined values are
omitted; unrelated and empty values remain. `windowsHide` is set on the existing
owned detached child. Invalid environment payloads fail through a typed generic
launch error before spawn, without reporting the payload.

Four boundary tests pass, and the unchanged actual ten-parent packaged process
fixture also passes in the final two-file run: five tests total at
`/tmp/resident-windows-environment-final-process-tests.log`. This provides Linux
process regression evidence and platform-parameterized environment semantics;
it does not prove native Windows launch, job independence or ACLs.
TypeScript/Effect diagnostics pass for 1361 files with zero diagnostics, focused
lint passes, and fresh Standards/Spec reviews report no actionable findings.
An earlier typecheck caught readonly dictionary mutation and a test's inferred
property access; immutable dictionary construction and an entry-based assertion
fixed both. The failed log is retained at
`/tmp/resident-windows-environment-typecheck.log`.
The full gate for this candidate remains pending.

The complete candidate passes `GOMAXPROCS=2 pnpm check-all`: 479 files /
5732 tests, statements 99.45% (29550/29713), branches 99% (12463/12588),
functions 99% (7996/8076), and lines 99.55% (27159/27280). All preceding
build, diagnostics, circular, complexity, package/schema and lint stages pass.
No threshold, inventory or deadline changed. No performance claim is made.
Log `/tmp/resident-windows-environment-check-all.log`, SHA-256
`1029379259bd6aeb60acdf3ed62ad82013dda25572208a58c2ba6a55e7a1a112`.
MCP artifact `7cc7b8c300354694118b08e2b39248e5ea08e1de1df7bae2ce56ecf7a43c8a12`;
CLI artifact `c957044a36f2559fbdf5230a0f37860911af276f800b1a37933539d7298f5697`.
Private copies are at `/tmp/resident-windows-env-gate-qjec35y6`. Sources remained
fixed during this gate; later report text records its result. Windows native
storage and qualification, other native platforms and the deferred complete
live-Huly campaign remain pending. No issue is closed by this result.

## Begin the native Windows security component

`native/resident-win32` now contains process-token SID acquisition, creation-time
user/SYSTEM protected security descriptors, handle ACL/reparse inspection and
volume/file identity. Ancestor grants use a known-rights allowlist after Windows
generic-right expansion. Read/traverse and new-subdirectory-only rights are
allowed; replacement/control and unknown grants refuse. New-child creation alone
does not permit replacing an existing protected child. Both review axes withdrew
an initial overly broad rejection recommendation after checking that distinction.
The future path walker must still pin and verify components and refuse foreign
precreation; this component alone establishes no safe traversal claim.

An executable Windows fixture covers private creation, independently reopened
identity, world-readable/null DACL refusal, readable/new-child-only ancestors,
write rejection and exact-handle cleanup with subsequent absence confirmation.
A separate Windows workflow builds with warnings/static analysis and runs it.
That workflow has only been authored and YAML-parsed here; native build and
execution have not occurred. Node-API, path traversal, bounded file operations,
publication, cancellation and production caller migration remain unimplemented.
Current Windows resident mode continues to refuse.

Clang 14 with MinGW-w64 10.0.0-3 declarations passes x64 Windows cross-syntax,
COFF object compilation, formatting and static analysis for both translation
units with zero diagnostics. This is build/static evidence, not native Windows
qualification. Exact sources, workflow, object files, analysis outputs and hashes
are retained at `/tmp/resident-win32-security-current-g6s43koi`; receipt SHA-256
`d7a01a6b8a60b0f3035a6c0a9b5bb8e58ad8bfa453e41e8a49bbb3d6d952ad64`.
The earlier pre-allowlist snapshot is retained separately at
`/tmp/resident-win32-security-evidence-2sefptj0`.
Fresh read-only Standards/Spec reviews found no actionable remaining findings;
the final known-rights tightening also passed Standards readback.

Toolchain packages were extracted under `/tmp/resident-windows-toolchain`; the
canonical checkout and its dependencies were not changed. The last complete
project gate is the preceding `eeff872c` candidate with 5732 passing tests.
It does not exercise this subsequently added native component. Native execution,
cross-account enforcement, complete Windows support and full #323–328 delivery
remain pending.


## Pure selection and publication decisions — 2026-10-18

The [selection transition increment](resident-selection-transitions-2026-10-18.md) moves candidate uniqueness/capacity and publication authority into ordinary state/event functions while retaining actual claim and candidate resource scopes. It also fixes the observed cancellation gap between registry publication, receipt recording and claim release. Focused resource tests and pure laws pass; full check-all passed502files5802tests, and scoped current-byte modern/legacy local-Huly sharing/continued reads/kernel-owned retirement passed. This is partial parent D8/D9 evidence, not complete #324 acceptance or lifecycle-model alignment.


## Ten independent SDK readers — 2026-10-18

The [focused ten-reader increment](resident-ten-readers-2026-10-18.md) adds ten actual packaged adapters under independent parents, held single-flight full-model acquisition, distinct/colliding-ID project reads and continued reads through every adapter. Both protocols pass with explicit adapter/parent exits and kernel-owned backend retirement. Production bytes are unchanged; focused checks replace routine full gates per user instruction. The initial legacy-readiness failure remains unexplained and retained. This does not certify ten actual hosts/live-Huly readers or complete #324.


### Idle/admission ordering — 2026-10-18

[Report](resident-idle-admission-race-2026-10-18.md): real admissions shell/TestClock pending acquisition1ms predeadline protects across idle interval; resulting owner accepts work and holds lifetime, confirmed release grants full new interval; fence-first refuses without token acquisition. Three focused files8testsPASS, local lint/format and both scoped reviews accepted. Test-only, no full gate. Immediate work return does not prove held-work cleanup or packaged OS/HTTP concurrency; wider lifecycle/final qualification and all six issues remain incomplete.


### Native HTTPS accepted work across fence — 2026-10-18

[Report](resident-http-fence-work-2026-10-18.md): held nativeMCP call survives explicit generation fence with exact terminal reply; newadmission409/renewal403/newwork403, session retained until DELETE204. Shared HTTP test helper now exposes consumed body/contentType. Focused admission/context and neighboring session/shutdown/continuity checks pass; local lint/format and both reviews accepted. No production change/full gate. Explicit-fence component proof does not qualify automatic idle/processrace/full lifecycle; all six tickets remain incomplete.


### Concurrent incompatible configuration launch — 2026-10-18

[Report](resident-concurrent-config-launch-2026-10-18.md): schema-owned launch seq/concurrent; both independentparents spawnedbeforeawaitready innewconcurrent/backend-only cases, same namespace/different effectiveURLs. Existing heldpeer/fault isolation retained. Final6casesPASS50.00s /tmp/resident-config-launch-fault-six-cases.log; local lint/format and reviewsaccepted. Postrunall6roots terminal0/parentlineage/onlyfailedAregistryretained/Brecordremoved independentlychecked. Originaldiscoverreadinessfailure not reproduced; cause remainsunknown, no timeoutrelaxed or productionfix claimed. No fullgate, all6issues incomplete; exactkillboundaries/macOS/model/finalqualification open.

### Configured HTTPS late attachment — 2026-10-18

[Report](resident-late-http-idle-2026-10-18.md): actual configured managed HTTPS server selected at virtual4900ms accepts exact successful ping replies before and after a retained5000ms attachment. Confirmed release starts a full new idle interval; retirement joins, state is empty, and later selection acquires absent ownership. Original no-client retirement test retained. Two focused files/seven tests pass; no production change/full gate. Single-process controlled-clock proof does not certify OS-process races or replacement startup; all six issues remain incomplete.
