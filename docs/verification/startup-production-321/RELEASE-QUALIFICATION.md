# Release qualification: MCP 0.54.0 / CLI 0.52.0

Runtime/test candidate: `ce0b1d6f4514935b2c83d7b4f5b30e3b1e8e1f95`. Later report-only commits do not change the qualified runtime. Production implementation is merged through [PR #320](https://github.com/dearlordylord/huly-mcp/pull/320); subsequent master fixes repair qualification fixtures. Versions, changelogs and server registry metadata are synchronized. No npm publication or release tag was performed.

**Release qualification is incomplete.** The quality gate and several full integration modes pass, but current concurrency, native stdio and HTTP-header qualification retain failures. Passing unit tests or earlier campaign receipts do not override them.

## Artifact and quality identity

macOS arm64, pinned Node 24.14.0, platform-local dependencies, local Docker Huly. MCP bundle SHA256 `95bb2826e50607159f10241650be38341b54e06de18777f8fd7466614d9c4cac`: 8,778,183 bytes; gzip 1,690,482; packed package 1,736,499 bytes, four files, executable mode 0755. The CLI bundle is 8,412,327 bytes. Existing package size budgets and external dependency inventory remain unchanged.

`pnpm check-all` passes **428 files / 5,505 tests**. Coverage: statements 99.46%, branches 99.00%, functions 99.01%, lines 99.55%. [Stock quality receipt](release-quality-receipt.json) records exit 0, clean source and stable inputs with the successful log hash. No thresholds, diagnostics, timeouts or behavioral inventory were weakened. Fresh independent Standards and Spec reviews have no remaining findings. [Linux CI](https://github.com/dearlordylord/huly-mcp/actions/runs/38996577495) passes Node 22.22.2 and 24.15.0; [Package Smoke](https://github.com/dearlordylord/huly-mcp/actions/runs/38996577500) passes for this exact candidate.

Fixture repairs preserve assertions: jq metadata checks accept valid arrays without suppressing warnings; cleanup IDs are retained until deletion is confirmed; Darwin profile fixtures use an isolated temporary home; resistant-descendant tests prebundle the real runner before the timed test and require real IPC readiness. The latter retains its 5-second test, 2-second command, 100ms escalation and 2-second polling bounds, PID absence and empty-custody assertions. Earlier failed quality runs remain private evidence; they are superseded by the current successful gate. Node25/macOS conservative EPERM/unconfirmed process custody was not bypassed or counted as passing. Its precise earlier stale-ancestry failure cause is unresolved.

## Current local integration results

| Suite | Outcome |
| --- | --- |
| Movement concurrency | **FAIL**, exit 1, clean/stable current coordinator receipt. First three cases pass; `mcp:preserve-later-comment` fails at shell line 135. Independent actor-comment preservation passes, but the composite result is incomplete: commit acknowledged, three reservations confirmed, verification observed/incomplete/inconsistent after an unexpected owned record and interrupted remaining reads. The other 10 MCP and 4 CLI cases were not executed in this attempt. Earlier 18-case pass is retained historical evidence, not a current receipt. |
| Tree | **PASS**, MCP + packed CLI complete four-task trees, nested/rich/history/reference/mapping/aggregate/consent/no-op checks; exit 0, clean/stable. |
| Movement | **PASS**, MCP + CLI four summary groups; exit 0, clean/stable. Three cleanup replies report already cascade-deleted descendants; independent exact-title query confirms zero remaining fixture tasks. |
| Transfer | **PASS**, MCP + CLI rich leaf/nested files/labels/time/history/independent and dangling references/aggregates/no-op/unknown-class refusal; exit 0, clean/stable. Earlier unchanged pre-allocation CLI deadline failure was reproduced twice on the candidate and once on baseline, without writes. The current pass does not establish a causal fix. |
| Attributes | **PASS**, MCP + CLI conflicts, schema-shaped retry, unchanged sequence/state, stale consent, selective clear, exact matches and ambiguity; exit 0, clean/stable. |
| Full native stdio | **FAIL**: 1,443 passed, 1 failed, 31 skipped / 1,475; exit 1 after cleanup. Deleted lead attachment read did not match expected not-found text. Stock assertion did not retain raw response; exact cause unresolved. Inventory and corrected notification metadata pass. |
| Full HTTP / environment | **PASS**: 1,440 passed, 0 failed, 35 skipped / 1,475; exit 0 after cleanup. |
| Full HTTP / headers | **FAIL**: 1,438 passed, 1 failed, 35 skipped / 1,474; exit 1 after cleanup. `list_person_attachments` returned no response; one dependent assertion was not executed. No concurrent DB restart observed; exact cause unresolved. |
| Packed CLI focused | **PASS**, 196 PASS assertions, suite PASS, exit 0 after cleanup. |
| Packed CLI full mirror | **PASS**: 1,444 passed, 0 failed, 31 skipped / 1,475; exit 0 after cleanup. |
| Tool scopes | **PASS**, complete stock matrix, exit 0; intentional unknown-category/tool warnings retained. |
| File-backed profiles | **PASS**, two isolated Darwin runs including invocation from `scripts/`: login/import/status/check/CLI + stdio binding/logout. Real store JSON hashes unchanged in both corrected runs. |

The formal movement coordinator stopped on concurrency failure. Tree/movement/transfer/attributes are named diagnostic continuations using the stock bounded process and before/after suite fingerprints, each bounded at 20 minutes; these are not fabricated coordinator receipts or full campaign certification. Final independent project-ID/identifier set equals the original eight projects, with no owned fixture projects; exact movement-fixture title query returns zero. Counters advanced by integration writes are not claimed unchanged.

An earlier full-native run had 1,415 passes, 14 failures, 33 skips: 12 backend-outage failures and two corrected jq array false negatives. Cockroach logged a fatal disk-sync stall and restarted; that evidence does not explain other deadlines without a matching trace. Later suites observed no additional DB restart. Private raw logs and independent cleanup snapshots retain business payloads and are not committed. An evidence hash inventory preserves their identity.

**Profile side effect:** the original failed fixture assumed XDG paths on macOS and created an owned `shared-live` profile in the real Application Support store. Only that profile and its active selector were removed, preserving nine existing profiles. The previous active selector was not captured and was not guessed/restored; active selection remains unset. The corrected fixture prevents recurrence. No global Codex configuration was changed.

## Actual host and module evaluation

[Actual running Codex discovery/read](release-codex-host.json) passes in an isolated ephemeral thread: server 0.54.0, six proxy tools, eight-project read. [Separate full inventory](release-codex-full-inventory.json) passes: six tools, eight resources, three templates, Projects and model-dependent Notifications reads. Only Projects and Notifications of 59 groups evaluate. No model turn or global reload was used; owned processes stopped and threads unloaded.

[Unmodified-bundle V8 coverage](release-evaluation.json) proves discovery evaluates 0/59 tool groups, a first project call evaluates only Projects, explicit preload evaluates 59/59. Coverage settle delays and instrumented host observations are not latency/shutdown benchmarks. CJS still contains/parses all bundled code: lazy evaluation is not code splitting.

## Exact-artifact concurrent startup comparison

[Raw numerical comparison](release-fleet.json): Node24.14.0, Darwin arm64, 12 logical CPUs, 96GiB RAM, local Docker Huly. Baseline `938560796df0f6d868ecc6c1214adc0e66119569`, version0.53.1, hash `1207ec1cb4469132be528f91a42f432def4d2ba18b6a6584bd56e041014b6ef6`; production uses the exact 0.54.0 hash above. Warm filesystem, warmed parent SDK, four balanced alternating fresh-process fleet trials per cell, synthetic SDK2.0.0 stdio client with six proxy tools. Full inventory requests resources before its first tool call. This does not measure Codex desktop startup, package download or cold disk.

32 fleets /176 fresh server processes: **28 fleets pass, four fail**. All 16 single-process fleets pass. Each ten-process cell passes 3/4 fleets: eight child RPCs in total reach the unchanged 20-second timeout, four baseline and four production, during first-projects or resource startup. All owned process cleanup is confirmed. Exact catalog/read parity is required for successful observations; the aggregate parity flag remains false because not all fleets complete. An initial aborted comparison with baseline timeouts is also retained privately; it is not counted as a successful trial.

The following are fleet completion medians in milliseconds **among passing fleets only**. For ten-process cells these are conditional summaries, excluding censored timeout fleets; they do not establish reliable tail performance. The fleet, not each of its ten children, is the statistical unit. Raw samples and spread remain available in JSON.

| Processes | Workload | Version | Fleets passed | Catalog | Requested inventory | First projects | Model-dependent read |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | tools-first | baseline | 4/4 | 1172 | 1172 | 3452 | 3455 |
| 1 | tools-first | production | 4/4 | 933 | 933 | 1092 | 2938 |
| 1 | full-inventory | baseline | 4/4 | 1295 | 3449 | 3546 | 3553 |
| 1 | full-inventory | production | 4/4 | 762 | 928 | 1046 | 2621 |
| 10 | tools-first | baseline | 3/4 | 3545 | 3545 | 12097 | 12101 |
| 10 | tools-first | production | 3/4 | 2437 | 2437 | 3897 | 10894 |
| 10 | full-inventory | baseline | 3/4 | 3865 | 13160 | 13260 | 13265 |
| 10 | full-inventory | production | 3/4 | 2791 | 3795 | 6619 | 11234 |

Single-process tools-first projects readiness improves 3,452→1,092ms; full-inventory readiness improves 3,449→928ms. Background full-model work still takes time: model-dependent readiness improves less, and ten-process startup still has failed deadlines in both versions. This supports the chosen catalog/lazy-handler/narrow-project-read design, not a claim that every operation is now instant.

Post-read summed RSS and CPU observations are included only for passed fleets; they are not peak, idle or proportional memory measurements. Prewarming pays full-model cost even for an idle valid stdio connection, and each host-created process still owns a separate model. Earlier three-sample Node25 comparisons in [REPORT.md](REPORT.md) use an earlier source-equivalent implementation build; their artifact identity is not substituted for this current-artifact study.

## Decision and remaining diagnostics

Keep the implemented production design: exact metadata catalog, memoized per-group evaluation, stdio model prewarm, narrow project-read capability and full model for remaining operations. Pure laziness retains the cold first-call delay; preloading all handlers adds work; globally disabling the model loses required data. Temporary executable prototypes and benchmark bundles were removed after retaining evidence.

Existing environment-backed HTTP shares one process-owned model; header-backed HTTP keeps per-request credentials/resources isolated. The passing full suites establish behavior in those modes, but the earlier nine HTTP contexts were sequential: a matched ten-client shared-vs-isolated HTTP startup comparison is **not yet measured**. Do not claim measured cross-thread amortization. Optional managed shared HTTP is the next candidate for reducing per-thread duplication; changing default transport or host configuration requires a separate decision.

Release blockers remain the current movement verification failure and the two unresolved full-suite failures. Next distinguishing diagnostics should retain the exact composite verification reads and missing attachment responses in bounded, owned fixtures before rerunning affected cases; do not replay uncertain mutations automatically or weaken complete-verification expectations. Numerical SLAs, idle/peak-memory budgets and representative cross-thread HTTP gains remain unqualified. No real-recipient messages, npm publication or deployment was performed.
