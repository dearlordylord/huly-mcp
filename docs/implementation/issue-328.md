# Issue 328 qualification evidence

Status: incomplete. All six issues #323–328 and parent #322 remain open.
The live #328 body was read on 2026-10-17; its last update was
2026-10-17T21:46:31Z. This report does not replace its acceptance criteria.

The Linux candidate is in `/tmp/hulymcp-resident-linux`, branch
`implement/resident-mcp-linux-323-328`. The namespace/admission checkpoint
`15ae6b13` and subsequent increments retain namespace/locator consistency fixes.
[Issue 327](issue-327.md) records scoped process receipts and exact MCP/CLI
artifact hashes. Those receipts independently join owned exits rather than
inferring retirement from CLI acceptance or missing metadata. Ten-parent results remain inconsistent: the latest full gate failed connection
startup and a later owner-only runtime-loading increment passed one focused run.
Neither establishes complete qualification; see the evidence below.

## Acceptance evidence index

Rows follow the 15 criteria in the current GitHub issue, in order. Partial
evidence leaves the criterion pending.

| Criterion | Current evidence and remaining work |
| --- | --- |
| 1. Complete contract, coherent final gate and local Huly | Earlier gates and focused increments are recorded in #323–327 reports. The final coherent candidate gate and deferred live-Huly campaign remain pending. |
| 2. Native lifecycle/concurrency/platform scenarios | Linux normal stop, two-caller replacement and version coexistence have process receipts. The ten-parent race has preserved inconsistent results. Complete Linux schedules and native macOS/Windows remain pending. |
| 3. Windows detachment, ACL and cleanup | Pending. Current POSIX ownership protection refuses unsupported native Windows execution; that is not Windows implementation or qualification. |
| 4. Auth/profile/policy/protocol behavior | Synthetic environment-token workspaces and actual catalog/context exchange support scoped fixtures. Complete supported profile/env/token/password, policy and modern/legacy qualification remains pending. |
| 5. Actual host discovery and continued reads | Actual Codex discovery/two context reads and actual Claude Code discovery/two context calls are recorded below. The latter use a local deterministic model endpoint. Complete host catalog/resource, Huly-read and lifecycle qualification remains pending. |
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
