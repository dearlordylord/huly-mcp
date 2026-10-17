# Issue 324: managed resident startup

Status: incomplete. The selected design is recorded in
[Managed resident ownership](resident-managed-design.md).

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
