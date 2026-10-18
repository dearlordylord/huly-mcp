# Issue 328 qualification evidence

Status: incomplete. All six issues #323–328 and parent #322 remain open.
The live #328 body was read on 2026-10-17; its last update was
2026-10-17T21:46:31Z. This report does not replace its acceptance criteria.

The Linux candidate is in `/tmp/hulymcp-resident-linux`, branch
`implement/resident-mcp-linux-323-328`. The latest production checkpoint is
`15ae6b13`, including retained admission and namespace/locator consistency fixes.
[Issue 327](issue-327.md) records scoped process receipts and exact MCP/CLI
artifact hashes. Those receipts independently join owned exits rather than
inferring retirement from CLI acceptance or missing metadata. The current
unmodified ten-parent run still fails qualification; see the diagnostic section
below.

## Acceptance evidence index

Rows follow the 15 criteria in the current GitHub issue, in order. Partial
evidence leaves the criterion pending.

| Criterion | Current evidence and remaining work |
| --- | --- |
| 1. Complete contract, coherent final gate and local Huly | Earlier gates and focused increments are recorded in #323–327 reports. The final coherent candidate gate and deferred live-Huly campaign remain pending. |
| 2. Native lifecycle/concurrency/platform scenarios | Linux normal stop, two-caller replacement and version coexistence have process receipts. The ten-parent race has preserved inconsistent results. Complete Linux schedules and native macOS/Windows remain pending. |
| 3. Windows detachment, ACL and cleanup | Pending. Current POSIX ownership protection refuses unsupported native Windows execution; that is not Windows implementation or qualification. |
| 4. Auth/profile/policy/protocol behavior | Synthetic environment-token workspaces and actual catalog/context exchange support scoped fixtures. Complete supported profile/env/token/password, policy and modern/legacy qualification remains pending. |
| 5. Actual host discovery and continued reads | Programmatic pinned MCP client parents exercise the packaged adapter. Naming clients after hosts is not actual application-host discovery. Native host evidence remains pending. |
| 6. Alternating fresh-process comparisons | Pending for standalone, managed and direct HTTP with one/ten clients and declared cache boundaries. |
| 7. Total RSS/CPU/completion rates | Pending. No prior direct-HTTP memory figure is adopted as a managed-stdio budget. Include every actual adapter, launcher and backend. |
| 8. Adversarial routing/backpressure/no replay | Existing scoped routing/request-loss evidence and the [operation-stop fault schedules](issue-327.md#stop-during-an-operation-and-failed-cleanup-2026-10-17) prove scoped local behavior. The latter use an embedded registry and one filesystem write with explicit host cancellation. The [detectable namespace-loss schedules](issue-327.md#refuse-detectable-ownership-state-loss-before-selection-2026-10-17) and [locator-content schedules](issue-327.md#parse-and-compare-current-locator-contents-2026-10-17) cover seven local metadata faults with a live existing caller. Complete real-Huly fault qualification remains pending. |
| 9. Quint and aligned oracle scenarios | The newer lifecycle model is type-only awaiting its recorded sketch checkpoint. Full lifecycle logic, checks and observed scenario alignment remain pending. |
| 10. Per-platform receipts and cleanup | Linux receipts include source/artifact evidence and owned exit checks. Complete platform receipts, preserved failures and all cleanup suffixes remain pending. |
| 11. Operational launch/status/stop/recovery/upgrade guidance | [Manual](../resident-manual.md), status/stop help and generated CLI skill document current behavior. Acceptance explicitly leaves retirement unconfirmed. Final supported-path audit remains pending. |
| 12. Prototype/artifact cleanup after qualification | Not yet due: production integration and complete qualification have not occurred. Preserve the prototype and useful evidence. |
| 13. Local/remote prototype branch deletion | Not yet due. Inspect dirty work and unmerged commits, preserve useful work, then record deletion only after integration/qualification. |
| 14. Keep cleanup in scope | No prototype, unrelated branch or artifact cleanup was performed by this increment. Final delivery audit remains pending. |
| 15. Complete-contract delivery decision | Pending. No subset pass closes this ticket or parent. |

Live Huly runs remain deferred until all six implementation slices are integrated,
as instructed by the user. No publishing, default promotion, OS service, global
host configuration change or prototype deletion is authorized by these receipts.
The current recovery policy has no durable operation journal or automatic replay;
unresolved owner loss remains bounded refusal until verified local retirement.

## Ten-parent launch diagnosis (2026-10-17, continued)

At production checkpoint `39c2339b`, the unchanged ten-parent process suite
failed again before any parent completed connection. All ten parent phase logs
reached their existing five-second connection limit. The preserved run is
`/tmp/resident-ten-parent-current-diagnosis.log`, SHA-256
`3fd5b9c76e1ebf8e0f4fd8cfc9d4aaafd330a79555792fe8bab589d17931c46d`;
its isolated bundle remains `dist/stdio-suite-ddJSdZ`.

A separate scratch copy added file markers before and after bundle evaluation,
without changing deadlines or callers. That run completed, with evidence under
`/tmp/resident-ten-parent-stages-etcvx1ug`. It changes the artifact and therefore
is diagnostic evidence only, not production qualification. Its success does not
explain the preceding failure or establish that bundle evaluation is the cause.
The SDK disposable version-probe process suppresses stderr, so existing parent
logs do not identify the internal connection stage responsible for the failure.

The process test now also saves its private phases log on subprocess failure,
instead of saving it only on success. Publication failure emits a static warning
and preserves the original subprocess exception. The subsequent focused run
passed with the unchanged deadlines and all ten callers; log
`/tmp/resident-ten-parent-retained-diagnostics.log`, SHA-256
`2fe60c45ed5b8d3e64229a6251b7d633460751740d7b99985520c92984e46ba2`,
and receipt `/tmp/resident-managed-parents-91VfaN.receipt.json`.
This passing run did not exercise the new failure-publication branch. The launch
reliability issue remains unresolved; no deadline, caller count, production path
or acceptance requirement was relaxed.

## Kernel-owned ten-parent retirement evidence (2026-10-17)

The ten-parent fixture now receives the existing supervisor's private reaped-event
pipe and joins the actual kernel-owned backend `waitpid` result. The receipt
includes `backendExit`; the test requires exit code 0 and identity equal to the
selected registry owner. PID absence is no longer the final backend-retirement
proof. Parent-loss, survivor read, ten independent clients, eleven-second hold,
and all existing response/retirement/supervision deadlines remain intact.
The observer closes in an outer finalizer, including failed runs.

The focused suite passed: `/tmp/resident-ten-parent-kernel-exit.log`, SHA-256
`bd95ef8b68d25f1cd0fd16c8c7c91695ae943c77ba1c21a501389a7a72093f53`.
Receipt `/tmp/resident-managed-parents-wq4aov.receipt.json`, SHA-256
`dcc7cd5ec8dc2825d73f4003258c3598d5c888af41a161be599fe70a7d568e34`,
records the matching owned exit with code 0 and complete private-state removal.
TypeScript/Effect diagnostics and focused lint passed. Read-only Spec review
reported no actionable findings.

A scratch shell wrapper also captured disposable probe stderr under
`/tmp/resident-probe-stderr-4isluebc`; that diagnostic run passed and its twenty
probe/session stderr files were empty. It does not identify the cause of the
earlier connection timeout. This change strengthens retirement evidence only;
launch reliability, complete platform qualification and final integration remain
pending. No production code or recovery policy changed.

## Current ten-parent failure stage and diagnostic CPU profile (2026-10-17)

The unmodified production artifact at `15ae6b13` was tested once with all original
callers and deadlines. This attempt completed connections and initial catalog /
context observations for all ten parents, passed creator-loss and survivor-read
checks, and closed the remaining parents. It then exceeded the supervisor's
existing 25-second run deadline while waiting for idle backend exit. This failure
is therefore distinct from the earlier connection-stage timeouts; neither class
is resolved. Log `/tmp/resident-current-ten-parent-15ae6b13.log`, SHA-256
`08ae81e9f6ffc6b891ef3ee9def5e092a0e29743e39636605498efdd5cec0975`.
The retained artifact `dist/stdio-suite-yXSVRO/index.cjs` has SHA-256
`46d6da1873caab884f407e205a809db70cbc9904cf85fdf39317d70f82b49db6`.

An admission-trace scratch copy under `/tmp/resident-idle-trace-od2tb61j` failed
earlier, before any admission was recorded. Its fence events with zero members
cannot establish whether a successfully connected run leaks a lease. Do not cite
that attempt as successful cleanup or a negative leak test.

A second diagnostic copy changed only managed-child arguments to enable Node's
CPU profiler. This instrumented run passed ten-parent convergence, caller loss,
the retained eleven-second session hold, survivor read, and kernel-owned backend
exit code 0, with complete private-state removal. The original supervisor and
response deadlines were unchanged. Receipt
`/tmp/resident-startup-cpu-67spu_9w/receipt.json`, SHA-256
`b6aa47a701162dbb9e1ac4a07b88961d3e86441c64fd4ac700e4de0b6c7f7bf1`;
phases SHA-256 `4c7c6abaddf24a35a532386ede51b970aaed3bcb3204ff857543b04432490437`.
This is diagnostic evidence, not a production qualification pass.

The retained CPU profile is
`/tmp/resident-startup-cpu-67spu_9w/CPU.20261017.201759.102260.0.001.cpuprofile`,
SHA-256 `ef3b88ef729a13bc5041fe9aeafa8e20ae60d178842fdf3f612e1863adb88ec9`.
Its active samples include JSON-tree checks, JSON-RPC encoding, module loading
and garbage collection. The large idle portion includes the fixture's deliberate
session hold and production idle wait; it cannot itself identify an unexpected
wait. Only the backend was profiled, so client/adapter CPU and complete system
resource costs remain unmeasured. Environment/claim and raw profile summaries are
retained beside it. Both the effective process affinity and host-reported CPU
count in the retained claim are 12. No separate physical-core inventory was
established.

The esbuild metafile in the same directory shows no static import path from the
managed adapter entrypoint to `src/mcp/tools/index.ts` when dynamic import edges
are excluded. This rejects the proposed eager full-registry import path; it does
not eliminate bundle parsing or runtime import costs.

Performance verdict: inconclusive. One instrumented run, preserved inconsistent
ordinary attempts and a backend-only profile do not establish a stable limiter,
repeatable improvement or a complete resource comparison. No production timer,
lease, validation or protocol behavior was changed from these observations.
Further diagnosis needs phase-aligned per-process evidence, including actual
adapters/clients. All qualification criteria remain required.

## Optional whole-tree resource observer (2026-10-17)

`test/resident/fixtures/reap-descendants.py` now accepts optional `--resources
<new-file>`. Its separate `process_resources.py` observer records the supervisor
and observed descendants every 100 ms, using all process threads' Linux child
inventories. Rows contain PID, parent PID, process start ticks, state, cumulative
user/system CPU ticks and RSS bytes. They omit command lines, process names and
environment values. The file is exclusively created with mode 0600. Traversal is
bounded to 1,024 identities; parent changes, disappearance and changed start
identity discard that observation. A handled sampling error makes the attempt
fail but does not abandon the supervisor's owned-child cleanup.

The existing response, idle, retirement and supervision deadlines are unchanged.
Without the option, no resource observer is imported or run. Three executable
Python checks cover stat parsing (including parentheses in process names), actual
child observation, private/exclusive output and owned completion after a supplied
sampling failure. A Linux-only Vitest entry runs those checks in the regular test
inventory. This diagnostic observer supplies no native macOS/Windows evidence.

The declared diagnostic purpose is to observe per-process work during the
ten-parent schedule, including client parents, rather than infer a limiter from
backend-only CPU. A first observer attempt completed but predates the reviewed
parent-identity correction; it is retained at
`/tmp/resident-tree-resources-qEYDxz` and is not adopted as corrected evidence.
The corrected observer attempt at
`/tmp/resident-tree-resources-verified-ePaPcn` used the unmodified production MCP
artifact with SHA-256
`46d6da1873caab884f407e205a809db70cbc9904cf85fdf39317d70f82b49db6`.
All ten clients reached their connection deadline; no initial observations were
completed. The observer retained 108 snapshots, with up to 25 processes present
in a snapshot. This is a failed diagnostic attempt, not qualification. The reaper
finished without its forced-cleanup warning, the final snapshot contained only
the supervisor, and the fixture state directory was empty. No successful backend
operation or complete per-process CPU accounting is inferred from that cleanup.

Retained raw resources SHA-256:
`6f9ff9fc7dff8a525f198e81b321a71194b623af304c35172e908c8387c992fe`;
`phases.log` SHA-256:
`4853c524cfd3cd1df21ae2f1be4338b963dc7b59c630e1d8c3cf9690ff65132c`.
The observer source used for that attempt has SHA-256
`a2711fd09c9f24f88baadb43e72a5ee49795dee2d240ee12e4833fa2ad939d7b`;
the reaper source has SHA-256
`b4e3597776a137779383dcdec5051a755a94f542a0d853658014777bb61174b0`.

The metadata retains load average, effective affinity, page size and clock-tick
units. CPU values are observed lower bounds: a process may disappear before its
last sample or be born and exit between samples. RSS sums include shared pages
repeatedly, plus the coordinator/client load generator and supervisor overhead;
they are neither physical memory nor PSS. Sampling adds overhead. Unknown
descendants are not labelled as a specific backend/adapter merely from their
PID. The preserved mixture of successful and failed schedules, changing host
load and incomplete CPU attribution still makes the performance verdict
inconclusive. No optimization or production budget is selected from this run.

To reproduce the observer against an isolated packaged fixture bundle, allocate
a fresh private evidence directory and run the existing supervisor command with
`--resources <directory>/resources.ndjson` before `--report-reaped`. Preserve the
command's exit status, stdout receipt and stderr phases, including failure. The
unobserved fixture remains the qualification path. Current focused Vitest,
TypeScript/Effect diagnostics and read-only Standards/Spec reviews pass; the
final combined gate and complete-contract qualification remain pending.
