# Issue 328 qualification evidence

## Scope amendment — 2026-10-18

The user excluded Windows resident support because substantial implementation and native qualification remained. Linux and macOS remain in scope. Windows resident startup continues to refuse unsupported execution; the unused native security component and its CI workflow are removed. Historical Windows investigation below is superseded, not pending delivery work. All other requirements remain, and #322–328 remain open.


Status: incomplete. All six issues #323–328 and parent #322 remain open.
The live #328 body was refreshed read-only on 2026-10-18; its cached source
is `/tmp/resident-current-requirements-323-328/328.json`. This report does not replace its acceptance criteria.

The Linux candidate is in `/tmp/hulymcp-resident-linux`, branch
`implement/resident-mcp-linux-323-328`, at documentation checkpoint `a20fe4f1`
over production candidate `2f19c614`. Its fresh campaign quality gate passes
483 files / 5742 tests. [Issue 327](issue-327.md) records the preceding ownership
and uncertainty increments. Earlier ten-parent failures and later focused/full
gate passes remain preserved below; the passing gate does not explain every
historical failure or establish native macOS qualification. Current live
observations and remaining obligations are indexed below.

## Acceptance evidence index

Rows follow the 15 criteria in the current GitHub issue, in order. Partial
evidence leaves the criterion pending.

| Criterion | Current evidence and remaining work |
| --- | --- |
| 1. Complete contract, coherent final gate and local Huly | Candidate `2f19c614` passes the full 5742-test gate and the [scoped local-Huly read schedules](resident-live-linux-2026-10-18.md). All five stock movement suites and the coordinator pass; see the [campaign report](resident-movement-linux-2026-10-18.md). Complete-contract qualification remains pending. |
| 2. Native lifecycle/concurrency/platform scenarios | Linux normal stop, two-caller replacement and version coexistence have process receipts. Live Huly now covers two-reader idle retirement and a later fresh managed generation. Earlier ten-parent failures remain preserved. Complete Linux schedules and native macOS remain pending. |
| 3. Unsupported Windows startup | Native Windows work is excluded by the 2026-10-18 user decision. Unsupported resident startup remains refused. |
| 4. Auth/profile/policy/protocol behavior | Synthetic fixtures plus live token/password/saved-profile reads now have scoped evidence, including same-reader auth source and launch receipts. A disjoint native live-policy diagnostic passes; its earlier allowed-call timeout remains unexplained. Complete policy/protocol/auth matrices remain pending. |
| 5. Actual host discovery and continued reads | Actual Codex discovery/two context reads and actual Claude Code discovery/two context calls are recorded below. The latter use a local deterministic model endpoint. SDK-driven separate parents, actual Claude Code and actual Codex app-server now pass scoped local-Huly project reads; complete catalog/resource/lifecycle qualification remains pending. |
| 6. Alternating fresh-process comparisons | Pending for standalone, managed and direct HTTP with one/ten clients and declared cache boundaries. The read campaign is not a performance comparison. |
| 7. Total RSS/CPU/completion rates | Raw whole-tree samples accompany the live read campaign; aggregate analysis and the comparison matrix remain pending. No prior direct-HTTP memory figure is adopted as a managed-stdio budget. Include every actual adapter, launcher and backend. |
| 8. Adversarial routing/backpressure/no replay | Existing scoped routing/request-loss evidence and the [operation-stop fault schedules](issue-327.md#stop-during-an-operation-and-failed-cleanup-2026-10-17) prove scoped local behavior. The latter use an embedded registry and one filesystem write with explicit host cancellation. The [detectable namespace-loss schedules](issue-327.md#refuse-detectable-ownership-state-loss-before-selection-2026-10-17) and [locator-content schedules](issue-327.md#parse-and-compare-current-locator-contents-2026-10-17) cover seven local metadata faults with a live existing caller. A [live held-query response loss](issue-327.md#live-huly-held-query-response-and-exact-backend-death--2026-10-18) now proves scoped uncertainty and fresh refusal after exact owned backend death. A [live rename response-loss case](issue-327.md#live-project-rename-committed-before-lost-response--2026-10-18) additionally checks one mutation, fresh refusal and explicit operation-specific reconciliation. Complete fault qualification remains pending. |
| 9. Quint and aligned oracle scenarios | The newer lifecycle model is type-only awaiting its recorded sketch checkpoint. Full lifecycle logic, checks and observed scenario alignment remain pending. |
| 10. Per-platform receipts and cleanup | Linux receipts include source/artifact evidence and owned exit checks. The live read report adds actual Linux backend exits and empty namespaces, preserving the failed first manual expectation. Complete native platform and cleanup suffixes remain pending. |
| 11. Operational launch/status/stop/recovery/upgrade guidance | [Manual](../resident-manual.md), status/stop help and generated CLI skill document current behavior. Acceptance explicitly leaves retirement unconfirmed. Final supported-path audit remains pending. |
| 12. Prototype/artifact cleanup after qualification | Not yet due: production integration and complete qualification have not occurred. Preserve the prototype and useful evidence. |
| 13. Local/remote prototype branch deletion | Not yet due. Inspect dirty work and unmerged commits, preserve useful work, then record deletion only after integration/qualification. |
| 14. Keep cleanup in scope | No prototype, unrelated branch or artifact cleanup was performed by this increment. Final delivery audit remains pending. |
| 15. Complete-contract delivery decision | Pending. No subset pass closes this ticket or parent. |

Live Huly runs were deferred while the six-slice candidate was being integrated,
as instructed by the user. The integrated `2f19c614` candidate now has bounded
read-only Linux qualification recorded in [the live read report](resident-live-linux-2026-10-18.md).
Remaining native/live/measurement/model gates are still incomplete. No publishing,
default promotion, OS service, global host configuration change or prototype
deletion is authorized by these receipts.
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

## Actual Codex host discovery and shutdown diagnosis (2026-10-17)

The installed `codex-cli 0.163.0` app-server was driven directly through its
generated experimental JSON-RPC API, following the [app-server protocol](https://learn.chatgpt.com/docs/app-server).
This is the actual host executable, not the programmatic MCP client labelled
`codex-mcp-client` in earlier fixtures. Each attempt used its own temporary HOME,
CODEX_HOME and working directory, an explicit synthetic token/workspace, the
packaged managed adapter, and an unreachable loopback model provider. No model
turn was started and no real Huly connection or message was requested. Global
host configuration was not changed. Claude Code 2.1.296 is installed but was not
exercised by these attempts.

Initialization, an ephemeral thread, `mcpServerStatus/list`, and two consecutive
`mcpServer/tool/call` requests for `get_huly_context` succeeded. Both structured
results identify `actual-host-fixture` and the same backend port. Discovery
contains `get_huly_context` and the proxy tool inventory. These are local context
reads, not live-Huly reads or full catalog/resource qualification.

The initial receipt is
`/tmp/resident-actual-hosts-1wBgjp/codex.receipt.json`, SHA-256
`8650b2dd8cce9324c91d094db6bb7b013c577d5cf4632f4d3c48d4383ff1899f`.
The unmodified MCP artifact is the `46d6da18…` artifact recorded above. This run
failed supervision during shutdown and required forced owned-descendant cleanup;
it is not an end-to-end qualification pass. Ownership metadata remains retained.

A separate observed repeat at `/tmp/resident-codex-cleanup-trace-MPA352`
confirmed host exit code 0; its snapshots then contain the supervisor and backend
without a live adapter. Receipt SHA-256
`1be62717421369b0150982d97af1d35972362e017b7d6c5e69753fa9081d9741`;
resource samples SHA-256
`530db3a15aadc6548a42c6ee63249af1288c62f0dc25361b3be71e7ad0cae9b0`.
It also exceeded the original supervision deadline. A scratch instrumented bundle
at `/tmp/resident-codex-admission-trace-OB4ZJU` recorded one admission and no
forget event before forced termination. Trace SHA-256
`432bfb0eb2aa71e04622379f80c256d69ec087428adb1c7df206b112cf7e15ac`.
Instrumentation is diagnostic evidence only.

An explicit `thread/unsubscribe` attempt returned `unsubscribed`, completed both
reads and exited the host with code 0, but still exceeded supervision. Its receipt
at `/tmp/resident-codex-unsubscribe-u7KILW/codex.receipt.json` has SHA-256
`143c827b3cf8283c388026949e824f42a4a9861ec850bc472afb436182e5516e`.
The earlier script indentation failure in that directory is preserved separately
from `corrected.stderr.log` and `resources-corrected.ndjson`; it started no host.

The production lease is 30 seconds and the existing complete supervision bound
is 25 seconds. Therefore these attempts cannot distinguish a leaked admission
from expiry after abrupt adapter termination. Host exit alone is not evidence of
graceful adapter release. No deadline or lease was changed, and this uncertainty
must not be converted into either a leak diagnosis or a cleanup pass. Next work
must establish the actual adapter shutdown signal/EOF behavior and test its
bounded release path. Full real-host cleanup, Claude discovery, supported auth
paths, live Huly and all native/platform requirements remain pending.

### Kernel-observed termination during actual host shutdown

A further isolated Codex attempt at `/tmp/resident-codex-signal-ji6vT2`
retains a scratch supervisor that additionally prints its actual `waitpid`
results. It changes neither the packaged MCP artifact nor the existing
supervision deadline. Discovery and both context reads completed again; Codex
exited with code 0. The generation record identifies backend PID 1004308 and
creator PID 1004195. The kernel-owned creator was reaped with exit code -9 at monotonic
1027351.485; the driver was reaped with code 0 at 1027351.508. The backend
was subsequently reaped with code -9 during forced supervisor cleanup at
1027373.428. These timestamps mark waitpid observations, not signal delivery. These distinct kernel events
must not be conflated as one ordinary idle-retirement failure.

This establishes abrupt creator termination before the supervisor deadline,
despite successful host exit. It does not establish which actor sent that signal,
which earlier admission belonged to the creator, or that no other adapter existed.
No production PID/port is signalled based on registry metadata; this evidence
comes from the supervisor's actual owned-child wait results. The ordinary
30-second lease still cannot expire inside this 25-second complete schedule, so
cleanup after abrupt adapter death remains unqualified by this attempt. The next
test must distinguish ordinary EOF release from abrupt-adapter expiry; production
lease/deadline changes are not justified by this observation.

`exits.log` SHA-256:
`52334c5b5342c01d2cef4962084685040af3077c4c3e871aa88d8c71c9140dff`;
`codex.receipt.json` SHA-256:
`f24c234ea9eceac96f703e5413af66e32e15f3cf18a24b56eee09276b71b8257`;
scratch `reaper.py` SHA-256:
`a0961264e1c2b86adef1d494a2cbb50a556f7aeb61d5e9fba23d910951e1d77f`.
This remains a failed diagnostic schedule, with preserved ownership state and
no complete-contract or real-host cleanup pass.

The existing focused manual-backend control
`expires an adapter after death while its survivor keeps the same backend`
passed with its original 45-second bound and 31-second expiry wait. It kills an
actual owned adapter, observes its exit, keeps a survivor usable and admits a
fresh caller after expiry. Log `/tmp/resident-codex-abrupt-expiry-control.log`,
SHA-256 `5a426f34e324b257470ca9f1d6cf20024c5b2940f261ac7a6525dadf3f1c3ab1`.
Only that selected test ran (seven other cases were filtered out). This supports
the existing lease-expiry path on the manual backend; it does not prove managed
last-adapter idle retirement, real Codex cleanup or the complete suite.

### Managed last-adapter abrupt death and expiry

A new Linux packaged process schedule directly owns one managed adapter,
completes legacy initialization, confirms it created the sole published backend,
and kills only that adapter handle with SIGKILL. After its observed exit it waits
the unchanged production lease duration and joins the backend's actual
kernel-owned exit. Success requires exit code 0 and complete private-state
removal. No PID-absence or missing-file inference substitutes for the exit.

This separate expiry schedule uses the supervisor's explicit `--lease-expiry`
45-second allowance and a 50-second outer process allowance. The ordinary
supervisor default remains 25 seconds; existing callers, startup/response bounds,
seven-second kernel-exit wait, production 30-second lease and five-second idle
policy are unchanged. A 25-second complete scenario cannot cover a 30-second
lease. This new schedule adds that missing interval instead of changing the
ordinary launch or real-host failure results.

The focused new expiry test and resource-observer test pass (two files/two tests).
Log `/tmp/resident-managed-last-expiry.log`, SHA-256
`c9c70067f722b0ad7a0ca8ef0652a7875d919db790e4e544909ab739c3a15aa5`.
Receipt `/tmp/resident-last-adapter-expiry-qMsz1r.receipt.json`, SHA-256
`bcc49ee02ad14c96ccd028ad2bb609f51aca260c33b530e60481767fda403d59`,
records the owned adapter SIGKILL and backend exit code 0. Its phases log has
SHA-256 `75d06852d011d4e234caf65317d96e784096f76ade0342b81d6097c060daadc2`.
The successful fixture removed its empty state directory and isolated bundle;
private receipt/phases remain. Failure paths retain the bundle/state and save
available phases while the kernel-owned supervisor still bounds cleanup.

TypeScript/Effect diagnostics and focused lint pass. Standards and Spec reviews
find no actionable defect. This proves the scoped Linux managed last-adapter
expiry path with legacy initialization and no active operation. It does not
qualify actual Codex cleanup, all protocols, active work, another OS or the full
contract. No production implementation changed; all six issues remain open.

### Actual Codex host followed through lease expiry

The separate expiry scenario was then exercised with actual Codex 0.163.0,
temporary HOME/CODEX_HOME, synthetic authority, the same unmodified packaged MCP
artifact and the existing direct app-server discovery/two-context-read probe.
No model turn or live-Huly operation was started. The scratch supervisor adds
kernel waitpid reporting and selects the explicit 45-second expiry allowance;
ordinary qualification bounds and prior failed attempts are preserved.

This attempt completed with supervisor exit code 0. The actual host exited 0;
creator PID 1047475 was reaped with code -9. The selected backend PID 1047515 was
later reaped with code 0 at monotonic 1027759.576, without forced cleanup, and
the complete fixture namespace was empty. Times are reap observations, not
signal-delivery times. The result supports eventual managed backend retirement
after actual-host shutdown and expiry, not graceful adapter release or a shorter
shutdown bound. The short-lived helper PIDs are not assigned application roles
without further evidence.

Evidence directory `/tmp/resident-codex-expiry-complete-gNSG7C` retains the probe,
isolated host configuration, receipt and kernel observations. `exits.log`
SHA-256 `89cd48e9248f765e58645d6ff92e5401c7610c0df5d900a9d3063ac85583ae23`;
`codex.receipt.json` SHA-256
`042278412f3f8aef7094a0de9246bf29d8d4d59aded91bdfe8184873fe642788`;
scratch `reaper.py` SHA-256
`74b235b6638600c8680087eec3f2544b20dae308bec60c43706acd51c8ec110a`.
No runtime journal, replay, production timer or host global configuration changed.
Claude, real Huly, complete protocols/auth/platform coverage and the final gate
remain pending; this scoped host result does not close any ticket.

### Actual Claude Code discovery without a model turn

The installed Claude Code 2.1.296 executable was driven through its streaming
control protocol, using the initialization and MCP-status sequence described by
the [official Agent SDK implementation](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py).
The probe supplied no user message or model turn. It used temporary HOME,
CLAUDE_CONFIG_DIR and working directory, bare mode, empty settings sources,
strict explicit MCP configuration, disabled built-in tools and synthetic Huly
authority. The model endpoint was unreachable loopback and no model credentials
were supplied. No global host settings were changed.

The initial probe at `/tmp/resident-claude-discovery-GGfrvB` asked status
immediately, observed `pending`, and exited without creating managed state.
That is preserved as an incomplete observation, not successful discovery.
The subsequent probe at `/tmp/resident-claude-connected-5AdcHF` polled status
within its five-second discovery allowance. The final control response reports
`connected`, server `huly-mcp` version `0.53.1`, and the actual discovered
`get_version` and `get_huly_context` tools with read-only annotations. This uses
the unmodified packaged `46d6da18…` artifact recorded above, not an SDK client
merely named after Claude Code.

The driver and supervisor completed with code 0, host exit was 0, stderr was
empty, and the fixture's complete managed state directory was empty afterward.
The existing supervisor joins its actual owned descendants; no metadata-derived
PID kill was used. This attempt does not retain a separate per-backend exit-code
receipt, so it must not be described as independently proving backend code 0.
The explicit expiry supervisor allowance was available, but no shorter runtime
or graceful-release claim is made.

The evidence directory retains `probe.py`, temporary configuration, raw protocol
responses, receipt, host exit and stderr. The synthetic token is only in the
private configuration, not the adopted status receipt. No Huly request or
`get_huly_context` tool call was submitted through Claude Code. First/continued
reads through this host therefore remain pending, as do full catalog/resource,
auth, live-Huly and native-platform coverage. This successful discovery increment
does not complete #328 or any other ticket.

Receipt SHA-256:
`c4248b3937dde681b9f4883fa61d81462aa69ad78d4774732d7f603be7909592`;
raw `protocol.ndjson` SHA-256:
`1fb78e5eced3cc25a3ff491a560ba505365ef08a6e86aced979d332b9599b058`;
`probe.py` SHA-256:
`0a419278c61673a5158ca1459893534bfce754d68a6fdd1cd820e0ca367bff70`.

## Managed profile, environment token and password selection

The new Linux packaged `managed-auth-paths-process.test.ts` fixture writes an
actual saved profile and file credential using the existing profile store. It
selects that profile explicitly while another profile is active. Three real
managed adapters use the saved token, its equivalent environment token, and a
separate complete environment email/password configuration. Parsed context
results prove the selected workspace and token/password method; the first two
callers share one port, and password authority has a different port. The original
profile caller performs a continued context read after the other admissions and
retains its token authority, workspace and port. The namespace contains exactly
two backend records.

All three owned sessions close; the fixture joins both actual kernel-owned
backend exits with code 0 and checks empty managed state. The successful test
removes its isolated bundle, profile/credential fixture files and state directory,
retaining only private receipt/phases. Failures retain available evidence and the
kernel-owned supervisor still bounds process cleanup. Default 25-second
supervision, five-second per-response and seven-second exit waits are unchanged.
Secret absence is checked through booleans, so a failed assertion cannot print
the token/password as matcher arguments.

The final focused run passes one file/test. Log
`/tmp/resident-managed-auth-paths-final.log`, SHA-256
`5382fc5dd3e6d4d2bec5c52bbfaf9fe0c8ec7347b2dd84a1f8e181167722c03a`.
Receipt `/tmp/resident-managed-auth-Tej7A8.receipt.json`, SHA-256
`cc72cbd2316cacf11fc8f7f7f757436c28534a8ed0ce9c665ce3ef67711f1e9d`,
records ports 43767/43767/36889 and two owned exit-code-0 events. Its stderr
phases file is empty. Earlier passing attempts remain separately retained under
`/tmp/resident-managed-auth-paths.log` and
`/tmp/resident-managed-auth-paths-verified.log`.

TypeScript/Effect diagnostics cover 1,350 files with zero errors/warnings;
focused formatting/lint and fresh Standards/Spec reviews pass. This is packaged
configuration selection and isolation using local context calls, not successful
remote Huly authentication, keychain qualification, rotation/logout or full
profile/policy coverage. The deferred real-Huly campaign, final coherent gate
and all remaining requirements stay pending. No production code changed.

### Managed saved-profile rotation and removal

The packaged auth-path scenario now also replaces the saved profile's token
while existing adapters remain attached. Before rotation the original two
generations are still required. A fresh adapter selecting the same profile then
observes a third distinct port; the original caller continues through its old
port. Password isolation and equivalent environment-token sharing remain checked.

Next the fixture removes the saved credential locally and starts a fresh raw
packaged adapter. It must exit normally with code 1, no signal/timeout, empty
stdout and the existing missing-credentials diagnostic. Removing the selected
profile file entry produces the corresponding missing-profile diagnostic in
another fresh process. Both refusals leave the three generation records unchanged,
and the original caller remains usable after deletion. This exercises local file
removal, not the interactive logout command or remote token revocation; captured
authority is intentionally retained by an admitted caller. Changed-token rotation
does not establish same-token credential-generation semantics.

All three actual backend owners must exit with code 0 and leave empty managed
state. Secret-absence checks on both refused-process stderr and normal process
outputs pass only booleans to assertions. Existing response, supervision and
retirement bounds are unchanged. The receipt now includes the rotated profile
port and explicit refusal facts; older receipts remain historical scoped evidence.

TypeScript/Effect diagnostics, focused lint and the executable scenario pass;
fresh Standards/Spec reviews have no remaining findings. This increment adds no
production behavior and does not qualify real Huly auth, another OS or the full
contract. All six tickets remain open.

Final focused log `/tmp/resident-managed-profile-lifecycle-final.log`, SHA-256
`35bb96974600974dd977d9c1f8a98c77b657431444b3ddcabefb225e7fcb4682`,
records one passing file/test. Receipt
`/tmp/resident-managed-auth-4v1SZK.receipt.json`, SHA-256
`e6aa8b490023b8097d13278e85ea0c5b73a6a9c34c9849c712b1aeb832b67504`,
retains the shared/isolated/rotated ports, two refusal facts and all three owned
exit-code-0 events. Earlier rotation and weaker connection-refusal attempts are
retained separately under `/tmp/resident-managed-profile-rotation.log`,
`/tmp/resident-managed-profile-lifecycle.log` and
`/tmp/resident-managed-profile-lifecycle-verified.log`; only the final raw-process
schedule establishes the documented normal refusal exits and secret checks.

## Managed tool-policy catalog and invocation isolation

A new Linux packaged scenario uses identical environment-backed Huly authority
with two different native `TOOLS` scopes: `list_projects` and `list_issues`.
Each real adapter must discover its allowed tool and omit the other one. Each
then actually invokes the forbidden name and must receive the specific unknown-
tool refusal, rather than any generic error. Parsed local context establishes
distinct backend ports, and the namespace must contain exactly two generations.
Both actual owned backends must exit with code 0 and remove private state.

The successful run exercised the tool-error-result branch for both refusals;
the accepted protocol-error alternative is constrained to the installed Effect
`ToolNotFound` contract but was not exercised by this run. This is modern-protocol
native exposure and exact `TOOLS` filtering, not complete TOOLSETS/proxy/strict-
output or cross-host qualification. No allowed Huly data operation was dispatched;
the successful context calls require no remote Huly authentication.

The first two attempts failed during the first client connection, before catalog
or invocation checks. They remain in `/tmp/resident-managed-policy.log` and
`/tmp/resident-managed-policy-diagnostic.log`, with retained failed fixture state
and isolated bundles. Host load was high, but no causal diagnosis is established.
The subsequent run retained all original startup/response, 25-second supervision
and seven-second retirement bounds; no retries were introduced into the scenario.
It passes one file/test in `/tmp/resident-managed-policy-verified.log`, SHA-256
`05f9f8e2c5ccf470e5fbe4f8f8ea3c116d2530d9fcf0d2f0fe8369b90824a4fc`.

Receipt `/tmp/resident-managed-policy-qSSa2Q.receipt.json`, SHA-256
`975368aa3d9d9801767bf4eef2613001ea9d027ec78d2f101f836796573881cc`,
records distinct ports, both refusals and two successful kernel-owned exits.
The phases log has SHA-256
`145e437b9b76d447d238fc57b3da5110a23abe7e755b8f1682661f6bb9ac8b00`.
Successful fixture state and its isolated bundle were removed; private evidence
remains. TypeScript/Effect diagnostics, focused lint and read-only Standards/Spec
reviews pass. No production code changed. The inconsistent connection attempts,
full combined gate, real Huly and remaining platform/policy coverage stay pending.

### Strict proxy TOOLSETS and client-acquisition ordering

The policy fixture now has explicit `native` and `proxy-strict` scenarios. The
latter uses `TOOLSETS=projects` versus `TOOLSETS=issues`, proxy exposure and
`PROXY_OUTPUT_STRICT=true`. Each caller discovers proxy tools without the hidden
native names and obtains its allowed target's schema through `get_tool_schema`.
Actual `invoke_tool` calls for the other scope must return unknown-tool refusals.
Each scenario retains two distinct backend ports, actual kernel-owned exit-code-0
events and empty managed state, under the unchanged deadlines.

The first proxy attempt reached the forbidden call but returned a Huly connection
error because shared dispatch acquired clients before target lookup. Preserved
process log `/tmp/resident-proxy-policy-red.log`, SHA-256
`a192533d5d32bca46a335f67106727138701426000fc198f6f8c0d476b2b5d74`.
A cheap injected-resolver regression independently reproduced the bug:
`/tmp/resident-proxy-no-acquisition-red.log`, SHA-256
`9188650fa060d4708c17740892d85e065206770387223fbd08d795a826d3c702`.
The [shared-dispatch fix](issue-325.md#refuse-unavailable-proxy-targets-before-client-acquisition)
makes client acquisition lazy, after local target eligibility. The regression
now checks both the exact unknown-tool result and zero client-resolution calls.

Both packaged scenarios subsequently passed in
`/tmp/resident-proxy-policy-green.log`, SHA-256
`f3482f3c258f21dfef8dcf1342d62ca622ef63dc47e97c8f7930fc896be0551a`.
Native receipt `/tmp/resident-managed-policy-native-agOGUz.receipt.json`, SHA-256
`214b30e681e9d19bedc32a1e0609dee3042bc522911317807c09116c06662dcf`;
strict-proxy receipt `/tmp/resident-managed-policy-proxy-strict-M82BGQ.receipt.json`,
SHA-256 `af15eaf61c0983e46ed22366e2d5b52c73249b975e6a569a7a79cb0fc3a77c9c`.
The receipts now identify their scenario explicitly. This proves scoped catalog
and forbidden-target isolation with strict mode configured; successful remote
tool-result strictness, real Huly auth and full policy/platform qualification
remain pending. No production timer, journal or automatic retry changed.

Focused dispatch/property checks pass 17 tests; affected MCP regressions pass
71 files/508 tests. TypeScript/Effect, circular, complexity and full lint checks
pass. Fresh Standards/Spec source reviews report no actionable defect. The full
coherent quality gate is being assessed separately; these focused passes do not
stand in for that gate or six-ticket completion.

### Full-gate findings and protected-namespace corrections

The first frozen-candidate `GOMAXPROCS=2 pnpm check-all` failed: 475 test files
and 5,709 tests passed, while two process cases failed. The complete 477-file /
5,711-test inventory still ran. Preserved log
`/tmp/resident-proxy-preflight-check-all.log`, SHA-256
`abcee83130b57a1866322aa3298084124a91c1a8f510efec3a125deedd131609`.
Neither failure is counted as a proxy-preflight qualification pass.

The failed-cleanup stop fixture reached the expected replacement refusal, but
the earlier namespace-consistency work introduced an earlier ownership refusal
without the expected non-dispatch/no-replay diagnostic. A raw start against the
retained failed state confirmed exit 1, empty stdout and that specific missing
diagnostic. The fix maps namespace inspection errors only before the selection's
existing/launch callbacks can run, preserving the original message and adding
truthful non-dispatch/no-replay context for this adapter. It does not classify
any operation belonging to another caller.

The restricted-runtime experiment wrote its probe receipt inside the production
ownership namespace. The protected inventory correctly rejects that unrelated
file, preventing readiness. The receipt now lives outside the namespace, with
an exact additional write grant for that single file. Every child/worker/addon/
WASI/inspector/guardian write/rename/remove assertion and the unrestricted
negative control remain. The experiment still does not impose a mandatory
restricted-worker architecture on production.

Both affected files then passed all four tests in
`/tmp/resident-proxy-gate-corrections.log`, SHA-256
`11afa4f0bb6778943a892361f0314c5c3a8992dc73e76c58b37694244e78ca23`. No deadlines, inventory or coverage threshold
changed. Fresh read-only Standards/Spec reviews find no actionable defect in the
corrections. A fresh full gate is assessed separately on the corrected source;
the initial failure remains retained.


### Coverage gate failure and stop refusal checks

The corrected full gate passed all 477 files and 5711 tests, but failed the unchanged 99% coverage thresholds: branches 98.91% (12441/12577), functions 98.98% (7986/8068). Statements were 99.42% and lines 99.53%. This is a failed gate, not final certification. Log `/tmp/resident-proxy-preflight-check-all-corrected.log`, SHA-256 `4369e6d88b243fe01d76b58b8c3c394eef908fea59101f8e1d09d2b94b68933b`.

Additional actual-filesystem/TLS checks cover stop returning HTTP 503 after fencing (one POST, unconfirmed submission and retirement, metadata unchanged), an unverified namespace refusing stop while retaining evidence, and equally sized registry/locator inventories naming different generations refusing selection while preserving both copies. The two focused files passed 21 tests; log `/tmp/resident-stop-coverage-behaviors.log`, SHA-256 `cb868da701facfd0f33efb6b8e57bc5e92824e5a52cb9912c18977f635240779`. CLI checks additionally prove nonretryable lookup/conflict errors for missing/unverified owners and preservation of unresolved files: seven tests passed in `/tmp/resident-cli-stop-refusals.log`, SHA-256 `7d3e0d42f07a39fd29385077dd7ab279dd6670c6f697d0b753523f6ddaf27d8f`. These focused checks do not establish aggregate coverage; another full gate is required.


The next complete gate passed all 477 files / 5716 tests and all preceding build, type, circular, complexity, package and lint checks, but still failed branch coverage: 98.95% (12446/12577). Functions reached 99% (7988/8068); statements 99.44%, lines 99.54%. Six additional covered branches would be required at that denominator. Log `/tmp/resident-stop-behavior-check-all.log`, SHA-256 `07848f406934f17d7a017b3e333f25e0b4c58d5cac57e2141812dbd82dbfbbf4`. The gate remains failed.

Read-only Standards review found one secret-diagnostic issue in the new equal-count inventory test: direct string matchers could print private serialized metadata on failure. Those assertions now compare byte equality through booleans. Read-only Spec review found no actionable findings in that increment. Subsequent focused coverage additions verify that an ENOTDIR ancestor is a typed failure rather than absent state, unsupported managed stop produces a nonretryable CLI input error with no POST, and successful text output still explicitly leaves retirement unconfirmed. The state/namespace files passed 18 tests (`/tmp/resident-state-evidence-preservation.log`, SHA-256 `1f0ed7d696ccd4a4e5edd970101d0a4d0419c1dbd33daac10035f58dc380c9cd`); stop TLS/CLI schedules passed 15 tests (`/tmp/resident-cli-stop-wire.log`, SHA-256 `141780713c771c98892eb55b4463be6455a6416a62eff8621887e40ee36367cd`). Focused lint/format and TypeScript/Effect diagnostics passed (1353 files, zero diagnostics). These later tests have not yet received a full aggregate coverage run; do not infer a passing gate from focused results.


### Explicit null proxy result and another full-gate launch failure

A cheap regression reproduced `invoke_tool` replacing a valid structured `null` result with its text-content array. The wrapper now tests whether structured content is absent rather than whether its result is nullish. Red log `/tmp/resident-proxy-null-red.log`, SHA-256 `506823297f188e16b283a041c76056eb25b610455651c5e6015a53bc9188eeda`; green dispatch/property suites passed 17 tests in `/tmp/resident-proxy-null-green.log`, SHA-256 `6607aaa930419a2fcc480ab9f5fd9c731e0e69355a8dbf013d0aa5d338071ef0`. Fresh Standards and Spec reviews found no actionable findings.

The subsequent full gate failed the ten-parent launch fixture: all ten parents exceeded their original five-second connection bound. All other 5718 tests passed (476 files); no aggregate coverage report was established by this failed run. Log `/tmp/resident-proxy-null-check-all.log`, SHA-256 `7ad1fa6b88b7ed3ecdc7add78285a5b261293c90a65d3070c06728bd6e9c309c`; retained fixture directory `dist/stdio-suite-yekkyP` and phases `/tmp/resident-managed-parents-YmsYBr.phases.log`. Build, type, circular, complexity, package and lint stages passed. Thresholds and deadlines remain unchanged.

A diagnostic tested the narrower premise that bundle syntax parsing alone exceeds that allowance. Five alternating batches of ten concurrent `node --check` processes against the 11658754-byte artifact and a minimal control all exited successfully. Artifact batch times ranged 0.225–0.356 seconds; controls 0.024–0.066 seconds. This is syntax-check/process-startup work, not module initialization, MCP connection, Huly work, or end-to-end performance. It supplies no limiter or speedup claim. Receipt `/tmp/resident-parse-premise-cv72rmyz/receipt.json`, SHA-256 `0d6bab9041b8e36f27b67fab4ed1132a31ff9ab0fc873c2eb698029505302d87`, retains individual samples, affinity and load observations. That narrower premise was not supported in these runs. The subsequent owner-only runtime import change and one passing unchanged ten-parent scenario are recorded in [#324](issue-324.md#initialize-the-server-only-in-the-selected-owner); reliability and final gate remain pending.

### Actual Claude Code first and continued context calls

Claude Code 2.1.296 executed two actual `mcp__resident__get_huly_context` calls through the packaged managed adapter. A disposable loopback HTTP Messages API fixture supplied deterministic tool-use responses following the [official streaming protocol](https://platform.claude.com/docs/en/build-with-claude/streaming). This uses the actual installed host, not an MCP SDK client named after it, and tests host tool dispatch without a remote model account. It does not qualify model behavior, remote authentication, or a Huly read.

The probe used temporary HOME/config/cwd, bare mode, strict explicit MCP settings, no built-in tools, one allowed read-only MCP tool, synthetic credentials and an unreachable loopback Huly URL. The host init event reported MCP connected; both non-error tool results returned the selected fixture workspace. Its final result was success after three turns, host exit was 0, stderr was empty, and the existing owned-descendant supervisor completed with code 0 with no forced-cleanup diagnostic. State inspection afterward found no entries. This attempt does not retain a separate backend exit-code receipt, so it does not independently certify backend exit code 0 or bounded graceful adapter release. The existing explicit 45-second expiry supervisor scenario was used; no production timer or prior qualification deadline changed.

Evidence root `/tmp/resident-claude-tool-read-5wnpvft3` retains the executable probe, protocol output, local model observations, host exit, private configuration and an artifact copy. MCP artifact SHA-256 `98d8dc4d363051197b0ec6d4f840ffe668c5c49afe6fd49aa000ac6e6fe500a5` predates the owner-only runtime import change. Receipt SHA-256 `acca63493d77f338a2d5c2bd6e20fd68c6bf089386bff6974785b1fa3dda844d`; `probe.py` `d21bb0dea6db4e7b4a3f3c4019a0578458dd259ee52e334e45ed93572d809398`; host NDJSON `078335ae7caaa8089745304e1204d47d265171c6003ae24ab72edc2f5148bebc`; model observations `fbae85c9dd6f58468249d0a1fc3546e2c206f228987577df34e55ae2b328bce0`. This strengthens scoped actual-host evidence only. Full catalogs/resources, live Huly, supported auth/protocol/platform behavior and aggregate qualification remain pending.


### Protected stop capability, descriptor and source-error boundaries

The full gate after owner-only runtime loading passed all 477 files / 5719 tests, including the unchanged ten-parent scenario, but failed the unchanged branch threshold: 98.98% (12449/12577), three branch hits short of 99% at that denominator. Functions were 99% (7988/8068), statements 99.44%, lines 99.54%. Log `/tmp/resident-owner-runtime-check-all.log`, SHA-256 `3fb94979e1c888e6e4b6a9b6e53e606b40f4fa84b28eca055e4257d2629c527f`. This is not a passing gate, and its launch pass does not erase earlier failures.

New actual TLS/private-file schedules prove that HTTP 200 with malformed stop capability returns a typed owner-unavailable refusal without POST, does not expose the response marker and leaves admissions usable. A foreign implementation's opaque descriptor with a mismatched generation is refused as namespace-unverified before submission. Both preserve existing metadata. Secret-bearing byte equality assertions now report only booleans. A TestClock boundary case authorizes Start one millisecond before the preparation deadline and verifies that the following deadline/disconnect cannot revoke it or retain listeners. A ConfigProvider.SourceError supplied through the existing provider service remains a ConfigValidationError with its typed source cause and no invented field-validation name.

All 80 tests in the three focused files pass: `/tmp/resident-stop-and-config-failures-final.log`, SHA-256 `f9edd8ec42190102a95356abebc061c4ab89a3c620878944203c9a90a41da7b2`. TypeScript/Effect diagnostics pass for 1353 files with zero diagnostics; focused lint/format and fresh read-only Standards/Spec reviews found no actionable issues. No production logic, threshold, deadline, test inventory or recovery policy changed in this test increment. A full gate including these cases is assessed separately below; focused passes alone do not establish coverage compliance.

An intermediate two-module coverage diagnostic ran the capability/deadline tests before the later descriptor/source cases. Its unchanged 99% thresholds failed for that narrow test selection; it is not a full-gate result and was written to a separate report directory. Log `/tmp/resident-capability-deadline-coverage.log`, SHA-256 `e5f9f42e8c483f2a29436e8d0e0792af7f4d85841e89fbf0246e55e9639dd549`. The deadline case checks authorization behavior; it does not claim to exercise every internal timeout interleaving.


The complete gate with all four new behavioral cases passes: 477 files, 5723 tests, statements 99.45% (29521/29684), branches 99% (12452/12577), functions 99% (7988/8068), lines 99.55% (27131/27252). All build, TypeScript/Effect diagnostics, circular, complexity, metadata/schema, package, formatting, duplication and test stages pass. Duplication remains 0.91%. Command `GOMAXPROCS=2 pnpm check-all`, log `/tmp/resident-stop-config-complete-check-all.log`, SHA-256 `f93a1f67a971573e5cee48a358126b3220a3818bb92f098ef800e9aa8c091186`. No thresholds, diagnostic checks or deadlines changed. No speedup is attributed to GOMAXPROCS.

The built MCP artifact SHA-256 is `e7467d4a4e65bd68c79c9661304fc31989ae1a3c30cb535ddbdd15a90e8fc172`; CLI artifact SHA-256 is `acc23767122f3527bf11eb85242a60d69287939547283f12f7bd24fb0a4e4aa1`. Copies of both artifacts and the gate log are retained privately at `/tmp/resident-coherent-gate-ekfrhay8`. Production sources were frozen throughout this gate; later changes in this increment are report-only. This establishes the current project gate, not complete native-platform, real-Huly, model/oracle or performance qualification. All six issues and parent remain open. The previously instructed final live campaign remains deferred until the complete implementation is integrated.

### Author the supervised manual read-pair campaign probe

The [two-reader procedure](../resident-read-qualification.md) now has an executable
modern/native observer in `scripts/integration-resident-read-pair.ts`. Two real
parent processes each own a packaged stdio adapter. Both use IDs 41 and 42 for
first and continued `get_project` reads against distinct fixture identifiers and
names. Discovery, native catalog and project resource templates are checked
before reads. A success receipt requires separate parent/adapter PIDs, the
selected generation, exact project replies, and joined zero exits. Backend
retirement remains explicitly `not-requested` because its foreground owner is
external. Live Huly execution is pending the complete integrated implementation.

A new protected attachment-envelope reader permits an independently built
observer to inspect format-v1 metadata without comparing its own development
version. The normal adapter reader still requires current implementation
compatibility. Actual private-file tests cover both paths with a foreign-version
descriptor, preserving generation, size, encoding and permission checks.

The deterministic native TLS process test forces both first reads to overlap.
Its failure schedule returns the wrong project name to one reader while holding
the other operation indefinitely. Coordinator EOF interrupts that reader's
scope and finalizes its adapter. The test observes server operation cancellation,
the original `read` diagnostic and no forced supervisor cleanup. The pair entry
requires Linux and an inherited exit-observation pipe from the existing child
subreaper; no supervisor or production deadline changed. This is synthetic
process qualification of the probe, not live Huly or supported-platform evidence.

An initial successful-read attempt after adding cancellation failed because the
parent's control stdin remained open after its receipt while the coordinator
waited for exit. A second attempt reproduced it. A phase diagnostic and then a
sanitized error-tag-only diagnostic identified the five-second receipt-suffix
timeout. The coordinator now closes control stdin immediately after validating
the receipt. Temporary diagnostics were removed. Failure logs remain at
`/tmp/resident-live-read-cancellation-tests.log`,
`/tmp/resident-live-read-cancellation-repeat.log`,
`/tmp/resident-live-read-cancellation-phases.log`, and
`/tmp/resident-live-read-cancellation-error-type.log`.

The corrected focused run passes both files and all 10 tests:
`/tmp/resident-live-read-cancellation-fixed.log`, SHA-256
`d683851382c5835852f04badfbee64c7c4aeef1bfeea1a5df6bf3a1df65830d8`.
Fresh read-only Standards and Spec reviews found no actionable findings and
confirmed the prior orphan finding resolved. TypeScript/Effect diagnostics and
lint pass separately. The full gate for this increment is still pending. All
six issues remain open, including native Windows ownership, other native OS
qualification, live Huly, the complete model/oracle and performance campaign.

The first complete gate for this increment passed all 478 files / 5726 tests
but failed the unchanged branch threshold: 98.99% (12456/12582). Statements
were 99.45%, functions 99%, and lines 99.55%. Log
`/tmp/resident-live-read-complete-check-all.log`, SHA-256
`ff1caa483089d0dc1d0857addd77d9451bbb63edd49c81a093e55a3385007b63`.
The uncovered new contract branch refused matching project names. Additional
boundary tests now reject both equal identifiers and equal names, since either
would weaken the probe's response-routing check. The focused two-file run passes
all 12 tests at `/tmp/resident-live-read-input-refusal-tests.log`. A fresh complete
gate remains necessary; this failed gate is retained as evidence.

The corrected complete candidate passes `GOMAXPROCS=2 pnpm check-all`:
478 files / 5728 tests, statements 99.45% (29539/29702), branches 99%
(12457/12582), functions 99% (7991/8071), and lines 99.55%
(27148/27269). All build, diagnostics, circular, complexity, lint, package and
schema checks pass. Duplication remains 0.91%. No thresholds or deadlines changed,
and no performance conclusion is attributed to the compiler concurrency setting.

Gate log `/tmp/resident-live-read-input-refusal-check-all.log`, SHA-256
`f4b08538296fbc513ded1b31bd5a283121352e4adbc6fa80a4cd1153ef4ff7f2`.
MCP artifact `530bf75a65e3befb3f534f481b19e0e7f4c9cb4fddd7c238c85b850c7eec7be4`;
CLI artifact `c957044a36f2559fbdf5230a0f37860911af276f800b1a37933539d7298f5697`.
Private copies and a hash manifest are at `/tmp/resident-read-pair-gate-el9o56n0`.
Source remained fixed during this gate; subsequent edits only record the result.
The additional input-refusal cases also received a fresh clean Standards review.
This proves the project gate for this candidate, not the pending complete live,
native-platform, model or performance qualification.


## Repeated catalog validation in process clients — 2026-10-18

After the Windows scope removal, the unchanged runtime candidate failed the full
`GOMAXPROCS=2 pnpm check-all` process checks: operator stop, damaged ownership
state and saved-profile changes exceeded their existing scenario deadlines.
The ten-parent case passed. In total, 476 files / 5729 tests passed and three
files / three tests failed; no passing aggregate coverage gate was established.
Log `/tmp/resident-linux-macos-scope-check-all.log`, SHA-256
`73d35ae3cf3b396266f7e8af6c2c116fb7bba7157c786c09e53155461a7bfe71`.
A focused run of the three files, without coverage, reproduced operator-stop
and state-loss deadline failures; the profile file passed. Its log is
`/tmp/resident-three-process-failures-focused.log`, SHA-256
`056a0083fbbd85a65b85e96139ee4d388b5b0069d3cb26b41be2b031fbc49735`.

Scratch phase instrumentation and a separate CPU-profiled owned host identify
repeated client-side schema compilation during `get_huly_context`. The installed
MCP SDK's `ClientResponseCache.outputValidator` rebuilds validators for every
listed tool after the catalog stamp changes. Both fixtures deliberately refresh
the complete catalog before each context read. The profile retains samples
inside `_compileOutputValidator`; this diagnoses client work and does not prove
a production backend performance regression. Diagnostic files are retained at
`/tmp/resident-process-phase-diagnostic`, including the profile with SHA-256
`a2c9c2aa52cbc846f8e7b16fbd5778233af974b0c56f5e9480e3c21bb82125e2`.
The first diagnostic coordinator build failed because its guarded source match
used the wrong parameter name; the corrected diagnostic ran successfully.
No diagnostic instrumentation was added to production or committed fixtures.

The fixtures now use the SDK's supported `callTool` `toolDefinition` option with
the exact context-tool definition from the latest real catalog. Absence fails the
fixture. The SDK still compiles and checks that tool's advertised output schema;
all catalog/resource requests, equality checks, context calls, process ownership
checks and deadlines remain. No production runtime logic changed. These synthetic
SDK clients are not substitutes for actual Claude/Codex qualification or the
required adapter-inclusive performance campaign.

The corrected focused run passes four files / eleven tests, including the
unchanged ten-parent case and every case in the three previously failing files.
Log `/tmp/resident-target-definition-process-check.log`. Fresh read-only Standards
and Spec reviews have no actionable findings. This is a scoped pass; the full
aggregate gate and the remaining six-ticket qualification are assessed separately.


The fresh complete gate now passes: 479 files / 5732 tests; statements 99.45%
(29550/29713), branches 99% (12463/12588), functions 99% (7996/8076), lines
99.55% (27159/27280). Command: `GOMAXPROCS=2 pnpm check-all`; log
`/tmp/resident-target-definition-check-all.log`, SHA-256
`336e0b22cc53f4cb28d2ccdd6ea7e272fb7ab67225b3b06bd39bdd1c6954a3be`.
Focused-run log SHA-256:
`67a7ea5a328389fed5ce12f99227bae670669d4ca48971d37b0a3d34be453148`.
Frozen artifacts and the gate log are copied at `/tmp/resident-target-definition-gate-_jdu9f5c`. MCP SHA-256 is
`7cc7b8c300354694118b08e2b39248e5ea08e1de1df7bae2ce56ecf7a43c8a12`;
CLI SHA-256 is
`c957044a36f2559fbdf5230a0f37860911af276f800b1a37933539d7298f5697`.
All diagnostics, thresholds and existing tests remain. No speedup or root cause
for the older ten-parent connection failures is claimed from this gate.
The unused Windows native component/workflow are removed under the amended
Linux/macOS scope. Live Huly, native macOS and remaining contract qualification
are still pending; #322–328 remain open. Prepared idle/cleanup schedule ideas
were not added or executed during this increment and supply no evidence.


## Idle cleanup qualification increment — 2026-10-18

The [#326 report](issue-326.md#retained-cleanup-versus-idle-retirement--2026-10-18)
records two new TestClock scenarios for delayed/failed cleanup across lease expiry
and idle retirement, including temporary negative mutations and restored-source
checks. The fresh full gate passes 480 files / 5734 tests at unchanged thresholds.
This is component evidence only; native macOS, deferred live Huly, lifecycle model
alignment and the rest of the six-ticket qualification remain pending.


## Delayed remote commit after adapter death — 2026-10-18

The [#327 report](issue-327.md#adapter-loss-followed-by-a-delayed-remote-commit--2026-10-18)
records a packaged manual-adapter process test: one write remains uncommitted
when its adapter is killed, a fresh adapter reads the old state, then the original
remote fixture operation commits and a continued read observes it. Exactly one
write and two reads are required. This qualifies that scoped uncertainty case,
not live Huly or delayed commit after backend-generation retirement/replacement.
The corrected full gate passes 481 files / 5735 tests at unchanged coverage
thresholds. Earlier intentionally interrupted gate and review correction remain
recorded. Complete native/live/model/performance qualification remains pending.


## Delayed commit after verified backend replacement — 2026-10-18

The [#327 report](issue-327.md#late-remote-commit-after-confirmed-generation-replacement--2026-10-18)
now records a bounded Linux process schedule across two actual embedded native
MCP backends. After the first owned process exits 0 and its namespace retires,
a different generation reads 0, the old independently owned remote operation
commits, and a continued read observes 1. Independent server/remote counts require
one write and two reads; both backend exits and the final adapter exit are joined.
Replacement is harness-started through real managed selection; the scenario uses
explicit cancellation and a disposable HTTP/file counter with injected tools,
not production automatic launch, unexpected crash, Huly SDK or live Huly.
Existing normal/failed stop-fault behavior remains under the shared shell helper.
The fresh full gate passes 482 files / 5736 tests at unchanged thresholds.
Remaining platform, live, model/oracle and performance requirements stay open.

### Managed read-pair probe preparation (2026-10-18)

The uncommitted campaign probe now supports `managed-pair` and `managed-parent`.
Two actual packaged adapters automatically select one backend; protected identity
records are correlated with the backend context response. The Linux supervisor
observes the backend's real exit after idle retirement, and the probe requires
exit zero and an empty private namespace. Occupied namespaces refuse before
launch. Manual externally owned mode remains separately exercised.

The disposable REST fixture needed class-model transactions for nonempty project
results: the real SDK constructs its hierarchy before mapping those results.
Adding the Class and Project definitions fixed the read failure without replacing
production startup or tool execution. The process test requires four project
reads and one full-model acquisition shared by both readers. The probe also now
uses the existing production 128 MiB response cap: the real catalog is 2,586,921
bytes and exceeded its former 1 MiB probe-only cap. Production bounds are unchanged.

Focused confirmation: `/tmp/resident-managed-read-model-confirmed-test.log`, two
files/six tests passed, including the original manual cases. Latest TypeScript
and Effect diagnostics are running in `/tmp/resident-managed-read-model-typecheck.log`;
no full-gate or fresh review claim is made for this candidate yet. Live Huly and
native macOS remain pending. No Windows work is required.

Follow-up: fresh Standards and Spec reviews found one artifact-retention defect:
failed process cases deleted their isolated bundle. The test now retains it after
any nonpassing case. Both reviewers confirmed the correction with no residual
actionable findings. A new negative case requires a real SDK project request and
read-phase rejection of a wrong expected name, then verifies empty state without
forced supervision cleanup.

TypeScript and Effect diagnostics passed 1372 files with zero errors/warnings
(`/tmp/resident-managed-read-model-typecheck.log`); focused Oxlint passed. One
repeat failed positive and negative cases at response phase
(`/tmp/resident-managed-read-negative-test.log`). No cause or timing conclusion is
claimed. A temporary method-only diagnostic run passed all three managed cases
(`/tmp/resident-managed-read-method-diagnostic.log`); instrumentation was removed.
The next uninstrumented manual+managed run passed two files/seven tests
(`/tmp/resident-managed-read-repeat-test.log`). These passes do not explain the
preserved intermittent failure. All deadlines remain unchanged.

The coherent full gate is now running as `GOMAXPROCS=2 pnpm check-all`, log
`/tmp/resident-managed-read-check-all.log`. Its result is pending; it is not
interchangeable with the previous 482-file/5736-test accepted baseline.

The full gate completed successfully: **483 files / 5739 tests**. Coverage:
statements 99.45% (29556/29719), branches 99% (12463/12588), functions 99%
(7996/8076), lines 99.55% (27165/27286). All build, TypeScript/Effect diagnostics,
schema, circular, complexity, package, synchronization and lint gates passed;
duplication is 0.91%. Existing thresholds, test inventory and deadlines were not
weakened. The gate emitted 200/300 allowed successful output lines.

Log SHA-256: `6d9cbf7eb1dedfeb23ad8c58c34cd4a4ba17444a39687184dcff884221faff9a`.
Frozen artifacts and source hashes: `/tmp/resident-managed-read-gate-hx2owr_c/`.
MCP SHA-256: `7e2fff84adb7b4544173e316f98bcea30cef289bdee878e4a4b4f1aa1816a780`;
CLI SHA-256: `c957044a36f2559fbdf5230a0f37860911af276f800b1a37933539d7298f5697`.
Post-gate comparison confirmed all ten changed source/test files and both built
artifacts match the frozen hashes. Only documentation was updated afterward.
The failed repeat remains unexplained; the full-gate pass does not establish its
cause or certify real host performance. All six issues remain open. Live Huly,
native macOS, the remaining lifecycle/fault/model and measurement requirements
are not replaced by this local campaign preparation.


## Live local-Huly read qualification — 2026-10-18

The [scoped live report](resident-live-linux-2026-10-18.md) records the unchanged
`2f19c614` candidate: manual and managed two-reader project calls, first and
continued reads, actual owned retirement and a later fresh managed generation.
Three schedules pass; the first manual attempt remains failed because its driver
expected exit 0 after SIGTERM without preserving the observed code. A separate
attempt records the pinned Runtime interruption-only exit 130, empty state and
supervisor success. No Huly writes, messages or global configuration changes were
made. The private evidence root retains all 68 child criteria, original project
selection, executable probes, receipts and raw resource observations. The
15-row index above remains partial; no issue or complete campaign is closed.

## Actual Claude Code project reads against local Huly — 2026-10-18

Qualification remains incomplete. The installed Claude Code 2.1.296 now performs
first and continued `get_project` calls through the packaged managed adapter
against local Huly. Its two returned project identifiers and names match the
private selected fixture. A disposable loopback Messages endpoint supplies the
two tool-use turns and final response; this qualifies actual host dispatch and
Huly reads, not remote model behavior. The host uses isolated HOME/configuration,
strict MCP configuration, an explicit tool allowlist and no global settings.
Credentials pass through the process environment and are absent from MCP config.
No fixture mutations or recipient messages were requested.

The immutable MCP artifact is the production candidate `2f19c614`, SHA-256
`908e121f7d9fd4ab49b931b1ee349a448feec5a6db10d616ac3b0267dfe47416`.
Linux aarch64 / Node 24.20.0 and complete environment-backed Huly selection match
the scoped read campaign. Host exit is 0. The probe captures the protected
registry during execution, then matches its backend PID to an actual kernel
subreaper exit event with code 0. Private state is empty. Supervisor exit is 0
and its diagnostics are empty; no timeout cleanup was needed. The existing
explicit 45-second lease-expiry supervisor scenario is used to accommodate a
host ending an adapter without detach; the host command itself retains a
12-second bound. This observation does not establish which detach/expiry path
caused retirement or change the ordinary 25-second supervisor bound.

Private evidence root `/tmp/resident-claude-live-read-665f_0cg/` retains the
executable `probe.py`, isolated configuration, host NDJSON, local model
observations, original receipt, captured registry and separate retirement
receipt. `verify.mts` parses input, project results, registry and exit using the
existing Effect schemas and compares the target/PID/exit and final empty state.
Its initial launch used a nonexistent Effect module path; changing that import
to the package export made verification pass without another host/Huly run.
`sha256.json` records 15 evidence-file hashes. Receipt SHA-256:
`8354bbdd47cd5bca2466c37f815c878d9c1f379930eefdc733fdf1ab9a770807`;
retirement receipt:
`04b0e547290f058b352946e2da6e3f599ba3c7f97bfcc3c933cafd8245173f3f`;
probe: `51a07f7d286c75e6478791ce130eb6e6da739cbda59ec5e8385cae9502db03ed`.

Actual Codex Huly reads, full host catalog/resource behavior, configuration and
protocol matrices, native macOS, remaining live faults, model alignment and
adapter-inclusive comparisons remain pending. The five-suite movement campaign
is separately active; this read scenario is not a movement certification pass.
All six delivery issues remain open.

## Actual Codex project reads against local Huly — 2026-10-18

Qualification remains incomplete. Installed Codex CLI 0.163.0 app-server now
performs two `get_project` calls through the same immutable packaged managed
candidate used above, against local Huly. The local app-server API initializes
an ephemeral thread, requests MCP server status and invokes the tool twice;
there is no model inference. Isolated HOME/CODEX_HOME configuration names only
the credential environment variables to inherit and contains no credential
values. No global host settings, fixture data or recipient messages are changed.

Evidence `/tmp/resident-codex-live-read-5125ura_/` retains the probe, app-server
protocol, original first/second structured results, host exit, protected registry
and separate kernel-owned retirement. `verify.mts` parses both results with
`GetProjectResultSchema`, compares exact selected identifier/name, requires one
schema-parsed registry, correlates its PID to the observed exit 0, checks host
exit 0, supervisor exit 0 and empty state. The explicit existing 45-second
lease-expiry supervisor mode bounds this host shutdown scenario; individual
app-server responses and shutdown waits retain five-second bounds. No forced
supervisor cleanup occurred and its diagnostics are empty. The result does not
identify the detach/expiry mechanism or qualify model-driven Codex behavior.

`sha256.json` retains 14 evidence hashes. MCP artifact SHA-256 is
`908e121f7d9fd4ab49b931b1ee349a448feec5a6db10d616ac3b0267dfe47416`;
Codex receipt `b0b16fe173caaa10476baaf7d0a935dd71baf988668744526573311a032c6344`;
retirement receipt `640e2046513e30f9bcbd1ac1fbdedce9b590b01ddff49d9828ee78be20ddb88e`;
probe `40ff51dd32e5ac904a55a59242b54cf24fc71bae928df73c1d84e66e3fe844d0`.
This is one successful two-read attempt on Linux aarch64 / Node 24.20.0 using
complete environment selection. Full catalog/resource/protocol/auth/platform
qualification, live fault schedules, model alignment, performance and movement
certification remain pending. All six issues remain open.

## Live Huly survivor after owned adapter death — 2026-10-18

Qualification remains incomplete. One scoped Linux process schedule now tests
healthy-backend isolation with actual Huly project reads. Two directly owned
packaged managed adapters read distinct selected projects using colliding ID 41.
The harness kills and joins the first adapter (exit -9). The survivor successfully
reads its own project immediately and at 11, 22 and 31 seconds after that kill,
reusing ID 42 sequentially. A fresh adapter then reads the first selected project.
The harness checks one generation and unchanged registry bytes throughout;
responses match their intended projects rather than only succeeding generically.

Fresh and survivor adapters exit 0 after EOF. The kernel subreaper observes the
registry-correlated backend exit 0; private state is empty, supervisor exit is 0
and its diagnostics are empty. The existing explicit 45-second lease-expiry
supervisor scenario contains the run; response and adapter-exit bounds remain
five seconds, backend exit observation seven seconds. The 31-second hold crosses
the configured 30-second dead-adapter lease; it does not independently observe
which server lease transition ran. There is no claim of transparent recovery
from backend death. All adapters here share one harness parent; separate-host
parent loss remains a distinct scenario.

Private evidence `/tmp/resident-live-survivor-9w2cz2g2/` retains the executable
probe, phases, all selected project results, protected registry, exits and
schema-based `verify.mts`. Its 13-file SHA-256 manifest includes receipt
`74935d0e8ce090f90c75b96671892e32012e5e589c4a5c796f1144e8ecd5d1c2`.
The verifier parses every result with `GetProjectResultSchema`, requires two
initial/four survivor/one fresh results, checks exact identifiers/names and
adapter exits, matches the backend PID/exit and checks supervisor exit/empty
state. The production MCP artifact is unchanged from candidate `2f19c614`, hash
`908e121f7d9fd4ab49b931b1ee349a448feec5a6db10d616ac3b0267dfe47416`.
Environment remains Linux aarch64, Node 24.20.0 and complete local-Huly environment
selection. No Huly mutation was requested. This passing schedule does not certify
live mutation uncertainty, all lifecycle faults, another OS, resource comparisons
or complete issue delivery. All six issues remain open.

## Live password and explicitly selected saved-profile reads — 2026-10-18

Qualification remains incomplete. Two separate maintained managed-pair runs executed with additional
reported local-Huly selection paths on Linux aarch64 / Node 24.20.0:

- Password: unset `HULY_PROFILE` and `HULY_TOKEN`, retain complete environment
  email/password and the guarded local URL/workspace. Evidence
  `/tmp/resident-live-password-a00kob3t/`, seven-file hash manifest, receipt SHA-256
  `79254079c4f7cb54ae997da99ad695ca28a4f5c827b5fcb9179c9cfe8e443f47`.
- Saved file-token profile: use isolated `XDG_CONFIG_HOME`, explicitly select
  `selected` while the profile file has active `unrelated`, and unset all
  environment Huly URL/workspace/email/password/token values. Evidence
  `/tmp/resident-live-profile-bwco3g8x/`, nine-file hash manifest, receipt SHA-256
  `14035e89f60453acbfa58bdb1de3d5d82ba0cff95743206f3725b4495c84bd3a`.

Each run has two separate reader parents, distinct target projects and colliding
request IDs, successful first/continued reads, common generation/backend PID,
kernel-observed backend exit 0, empty ownership state, supervisor exit 0 and
empty diagnostics. The retained receipts do not independently establish resolved authentication
method/source or launch-key absence; those selection facts above are reported
execution context pending redacted launch/context receipts. Each original
read/retirement receipt is schema-parsed by its retained
`verify.mts`; target identifiers/names and process/generation identity are compared.
The immutable production MCP and maintained probe artifacts match the preceding
live campaign. Existing 25-second supervision and five-second exchanges remain
unchanged. These are passing runs, not retry or performance measurements.

The profile fixture uses the real schema-owned profile store. Its first local
preparation failed before any Huly invocation because it passed an already parsed
Redacted token through the raw-token decoder again. Passing the schema-derived
credential directly to the store corrected preparation without exposing the
secret. The created private credential file was removed after result and owned
retirement verification, recorded in `credential-cleanup.json`; global/user
profiles were untouched. Credential bytes are not retained in the evidence
manifest. The retained profile metadata alone cannot reproduce authentication
without supplying fresh credentials.

Earlier live reads had token and password values both present; those runs must
not substitute for the isolated password run. The new scope does not qualify
keychain storage, live token rotation/logout/revocation, differing live policies,
all protocol identities, another OS or the complete authentication contract.
All six issues remain open, and the independent movement campaign is still active.

### Same-reader authentication evidence follow-up

The named diagnostic above now passes for both paths, without changing the
production MCP artifact. Private evidence
`/tmp/resident-live-auth-diagnostic-0f_x2pj2/` retains an instrumented copy of the
maintained reader, its exact source insertion/build script, separate fresh
password/profile inputs, schema verifiers and redacted launch receipts.
Instrumentation writes only the schema-encoded `auth` subsection of the already
parsed `get_huly_context` response from each reader. Both reader parent PIDs are
matched to their exclusive `auth-PID.json` files.

Both password readers report method `password`, source `env`, token unconfigured
and email/password configured. The launch receipt independently records absent
HULY_PROFILE/HULY_TOKEN and present URL/workspace/email/password. Both selected
profile readers report method `token`, source `profile`, token configured and
email/password unconfigured. Their launch records profile/XDG selection present
and all environment URL/workspace/token/email/password absent. The fixture file
still has a different active profile. Verifiers parse auth with the existing
context schema, require exact launch-key booleans, and repeat original
project/identity/supervisor/retirement checks. Both runs pass; diagnostics are
empty, owned backend exits are 0 and state is empty. The new private profile
credential was removed after verification, with a cleanup receipt. Original
weaker receipts and manifests remain untouched. These read-only diagnostics
address the review gap; broader auth/lifecycle qualification remains incomplete.

## Live disjoint native tool-policy reads and preserved timeout — 2026-10-18

Qualification remains incomplete. A direct two-adapter local-Huly schedule now
checks `TOOLS=get_project` versus `TOOLS=list_projects` with identical token
authority. Each catalog exposes its allowed tool and omits the other one; parsed
context confirms native exposure and the corresponding resolved tool scope.
Allowed project/list reads return the selected fixture, and both cross-policy
calls return the precise `Unknown tool: <forbidden name>` error. A continued
first-policy read succeeds after both policies are admitted. Two distinct
backend endpoints and protected generations remain isolated. Both adapters and
kernel-correlated backend owners exit 0; state is empty, supervisor exits 0 and
its diagnostics are empty. The unchanged production MCP artifact is used.

The first attempt `/tmp/resident-live-policy-vloojeza/` failed at a permitted
read's unchanged five-second response wait. Its opaque schedule did not retain
which permitted tool timed out. Adapter stderr was empty; 25-second supervision
forcibly retired remaining processes and exited 1. It is a preserved failure,
not a qualification pass or unexplained data operation to replay.

The named distinguishing attempt
`/tmp/resident-live-policy-diagnostic-lxvamu3r/` ran after the stock movement
campaign ended. It retains operation/adapter/phase timings and parsed catalog
and context before each permitted call, without arguments or credentials in
phase logs. Five-second exchange/exit waits, seven-second backend observation
and the existing 25-second supervisor remain unchanged. It passes once.
`verify.mts` parses catalog, full context, result schemas, exact refusal,
registry and owned exits; it checks selected project values, distinct policy
ports/generations, both backend exits and final supervisor/empty state.
Both roots retain hash manifests. Successful diagnostic behavior does not
establish the earlier timeout's cause; workload timing and instrumentation
changed together. No performance or general reliability claim follows.

These are native modern-protocol direct child adapters under one harness parent,
not full proxy/strict/legacy-policy, host-identity, backpressure, backend-crash or
native macOS qualification. No Huly write was requested. All six issues remain open.

## Comparative harness controls — 2026-10-18

The alternating comparison remains pending. The
[measurement protocol](resident-comparison-protocol.md) now fixes modes, workload,
cache boundaries, resource scope, run ordering and existing deadlines. A private
executable SDK harness at `/tmp/resident-comparison-harness-6ee05lbx/` exercises
actual packaged processes, full modern discovery/catalog/resource templates and
schema-parsed immediate/warm/delayed reads against an existing local-Huly project.
No Huly writes were requested. Production MCP bytes remain unchanged. A fresh
project TypeScript check and the corrected external composite harness check pass;
earlier external configuration failures remain preserved.

These are controls, excluded from comparative samples. One-client standalone,
managed and HTTP controls each report three exact-target reads and the full
606-tool/three-template inventory. The original HTTP controls used header-selected
request-scoped Huly clients, so they do not establish the intended shared cache.
Managed ten-client control reports 30 reads, all catalogs/templates, ten adapter
exits 0, registry-correlated kernel backend exit 0 and empty state. Ordinary
five-second response, seven-second exit and 25-second supervision bounds remain.

Standalone ten-client control failed: nine clients failed during their first
read around five seconds, one completed three reads, and the supervisor forced
remaining cleanup. The original harness mixed nine client failures with one
cleanup failure into `failedClients: 10`; this is not ten failed client reads.
A named diagnostic separates these counts and records SDK error codes, with an
untimed V8 profile for each server. That diagnostic reports 24 reads, two
`REQUEST_TIMEOUT` first-read failures, ten server exits 0 and no cleanup failures;
supervisor exit 1 reflects failed workload, with no forced-cleanup diagnostic.
It is not a passing repeat or evidence of a resolved cause. Profiles show idle
samples alongside SDK `extractJson`/JSON decoding, GC and model construction.
`extractJson` maps to installed `@hcengineering/api-client/lib/rest/utils.js`.
A single stable limiter is not established; no performance verdict follows.

The header-selected ten-client HTTP control also failed all first reads with
`REQUEST_TIMEOUT`, then retired normally (server exit 130). Source inspection of
`createHttpClientLeaseResolver` identified the configuration error: `x-huly-*`
overrides create a scoped client per request. The corrected environment-selected
shared HTTP diagnostic reports 30 exact-target reads, full inventories, server
exit 130 and supervisor exit 0 with empty state. Keep both attempts. This supports
the corrected cache-boundary choice, not a general reliability or speed claim.

`controls-summary.json` and `controls-manifest.json` retain eight outcomes and
92 file hashes, including preserved harness source versions, unchanged product,
raw phase/resource events and all ten profiler files. Resource samples remain
observations of the supervisor tree, not an adapter-inclusive resource budget;
complete final CPU attribution, independent evidence review and five alternating
samples per mode/client-count cell are still pending. No timing distribution,
RSS winner, complete performance qualification or overall completion is claimed.

## Terminal CPU accounting preparation — 2026-10-18

Qualification remains incomplete. The maintained Linux fixture supervisor now
accepts optional `--cpu-receipts` and records kernel `wait4` usage for the children
it reaps. Existing response/retirement/supervision deadlines are unchanged. CPU
receipt write failure marks the run failed but continues owned-process cleanup;
exclusive mode-0600 output is opened before launching any child.

The measurement driver also snapshots its waited-child CPU ticks after directly
owned processes have exited. Its product total adds those ticks to separately
adopted product descendants' `wait4` CPU. The driver's own CPU and entire subtree
receipt are retained as cross-checks, not added again. This addresses short-lived
process/final-sample loss for successful, completely correlated Linux runs while
preserving tick quantization and accounting residuals. It does not turn sampled
RSS into physical/PSS memory or establish complete accounting for failed teardown.

Seven maintained Python checks pass, including real waited grandchildren,
separately adopted descendants, cleanup after a failing receipt writer, and
private/exclusive output before child launch. The existing Vitest wrapper passes
under its unchanged five-second bound. Five additional real-process controls
(zero, one, three, nested and orphaned children) pass in private evidence
`/tmp/resident-cpu-accounting-qualified-r9azhi1c/`.

A fresh actual managed one-client control with the updated supervisor passes:
three independently schema-parsed exact-project reads, 606 tools, three templates,
adapter/backend exits 0, correlated kernel retirement, empty state and supervisor
exit 0. The independent verifier checks those facts, role/exit/start-tick
correlation and terminal CPU closure. It retains each parsed project result and
computes simultaneous product RSS from samples. These are control observations,
excluded from comparative samples and resource-budget claims. External harness
and verifier TypeScript checks pass. Full project gate and independent review of
this increment are pending. No production runtime source changed.

The first full gate then failed: 482 files / 5741 tests passed, one drain
request-loss test failed after reporting replacement refusal. Raw
`check-all-failed.log` remains preserved in the CPU evidence root. A named
invariant diagnostic exposed another outcome: replacement exit 0 instead of the
required refusal exit 1. A subsequent diagnostic that retained replacement
stdout/stderr passed; changed timing is not a proven fix. An isolated comparison
on the original retained namespace tried immediate stdin EOF and held-open stdin;
both refused with exit 1, zero stdout, the no-dispatch diagnostic and unchanged
ownership hashes. It used an unavailable disposable loopback authority, not a
new live Huly mutation. Evidence `/tmp/resident-refusal-eof-diagnostic-nesia8ub/`.
That control does not establish EOF as the cause of the original failures.

Inspection also found a sequencing gap in the fixture: it awaited original
adapter closure but did not explicitly join backend death before spawning the
fresh adapter. The REST-side loss callback joins that death independently; an
adapter can disconnect while drain/kill is still proceeding. The fixture now
requires the owned backend's exact SIGKILL exit before starting the replacement,
retains refusal stdout/stderr in private sibling diagnostic directories, and
labels failed invariants. Every refusal/no-replay/registry assertion and deadline
remains. All four request-loss scenarios pass after this strengthening. The
original failures remain unexplained beyond the observed ordering gap; this is
not a claimed general runtime-race fix. Fresh full gate and review of the fixture
addition are pending. `drain-diagnostics-manifest.json` freezes the failed gate,
diagnostics, source versions and retained sidecars separately from the 48-file
CPU-control manifest.

The formatted full gate again failed one drain fixture (482 files / 5741 tests
passed), this time with a precise invariant: the original inode-backed
`.attachment-*` publication directory had legitimately disappeared during drain.
`withPublishedResidentAttachment` owns that directory through its use scope and
removes it during cleanup. Requiring that known publication to remain was a
fixture error. The fixture now first requires exactly one backing publication
and verifies its device/inode equals the original descriptor. Only that exact
owned directory and its locator may be withdrawn during drain; the remaining
inventory and original registry bytes must still match. Other loss points retain
the complete inventory requirement. A schema-owned `publicationAfterLoss`
records the observed state. No arbitrary publication-prefix exclusion is used
when comparing post-loss inventories.

To fix the crash schedule itself, the SDK drain fixture synchronously emits the
actual drain-entry event with an attached caller and stops its own process there.
The parent observes kernel state `T` before SIGKILL and joins that exact exit
before fresh startup. The receipt requires `drainPausedBeforeKill: true` for the
drain case and false otherwise. This controls a real process fault at drain entry;
it does not change production shutdown or establish every later drain schedule.
The passing receipt reports retained locator/publication/registry and truthful
uncertainty. Five focused tests (all four loss points plus resource wrapper) pass.
Eight new source/log/receipt hashes are in `paused-drain-manifest.json`. Earlier
failures and the unproven separate exit-0 cause remain preserved. Fresh final gate
and independent review of this last correction remain pending.

One-client terminal-CPU controls now also pass for standalone and environment-
shared HTTP. The generic verifier revalidates the existing managed evidence
without another managed invocation. Private evidence
`/tmp/resident-comparison-campaign-prep-nlfrh_4e/` freezes 41 files. All three
reports contain three correct reads, stable product-role identities and correlated
retirement; standalone/HTTP observe one product process, managed two. These ran
alongside quality verification and are excluded from timing comparisons. Full
ten-client CPU qualification and the alternating campaign remain pending.

The corrected candidate's fresh `pnpm check-all` now passes: 483 files / 5742
tests; TypeScript/Effect checks cover 1373 files with zero errors/warnings.
Coverage remains statements 99.45%, branches 99%, functions 99%, lines 99.55%.
Gate log SHA-256:
`5f075c03ad01ccfb2d254cd5238c7e2cad2a16f9055d48bfe9708a97d25c13d7`.
`gate-proof.json` and the eight-file `gate-manifest.json` in the CPU evidence root
bind the log, final six helper/fixture sources and unchanged MCP/CLI artifacts.
Both independent reviews matched the eight paused-drain and 41 all-mode control
hashes with no actionable findings. This establishes the current quality gate;
the three preceding failed gates remain preserved. It does not complete the
comparison, native platforms, model/oracle or the six delivery issues.
