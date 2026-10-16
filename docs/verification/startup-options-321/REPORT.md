# MCP startup experiments and recommended direction

Current decision evidence for [#321](https://github.com/dearlordylord/huly-mcp/issues/321), 2026-10-16. The throwaway executable prototypes have been removed after replacement by production code. Current implementation and qualification are recorded in [the production report](../startup-production-321/REPORT.md); this report retains the useful design comparisons.

## Recommendation

Adopt a staged initialization design:

1. Keep discovery metadata independent of operation implementations; replace central schema imports with direct imports at the remaining startup sites. Preserve native and proxy catalogs.
2. Provide a small, shared REST query capability for concrete resource listing and audited ordinary reads. It should reuse authenticated workspace discovery with the full client, rather than introducing a second identity or repeating authentication. The project-list proof below is promising; it does not establish that every ordinary operation can use this adapter.
3. Load handlers by group on demand. Start full-model acquisition in the background after discovery can respond, with process-owned single-flight initialization and bounded work. Prioritize real requests. Do not eagerly evaluate every handler group alongside model acquisition by default.
4. Offer a shared HTTP process for workflows with many loaded threads. Retain stdio as the compatibility default unless the operator chooses otherwise. Do not silently convert configuration or share resources across identities.

The smallest first implementation is metadata separation/direct imports plus model-only background acquisition and lazy handlers. The lightweight REST capability is the next high-impact slice: it addresses immediate first reads and resource discovery, which prewarming alone cannot make fast when the caller arrives immediately.

Preserve full-model correctness. A global `fullModel=false` switch is rejected by behavioral evidence. The final production implementation still needs lifecycle/error handling, catalog generation discipline, packaging validation and broader adapter qualification; the throwaway transformations are not suitable to ship.

## Method

- Base: PR #320 candidate `938560796df0f6d868ecc6c1214adc0e66119569`; its unrelated small startup fixes are common to all variants here.
- macOS 27 arm64, Node 25.6.1, 12 logical CPUs, local Huly; warm filesystem caches. Fresh server process for each stdio sample. No production files modified.
- `build.cjs` snapshots real catalog definitions, reconstructs the existing registry with deferred group imports and optionally rewrites named imports from schema barrels to defining modules. All variants remain bundled CommonJS, matching the current package shape. These experiments defer evaluation; they do not claim separate chunks or avoid parsing all bundle code.
- Automatic exposure, same client identity and protocol settings, same `list_projects` call. Three alternating trials per variant and delay. Delay is after listing and a catalog-search check, not a measurement of the agent's actual thinking time. Zero-delay means immediately after those catalog requests, not literally the first possible microsecond.
- The final baseline-versus-recommended comparison and the final three-variant prewarm comparison ran without concurrent build/test campaigns. Earlier exploratory comparisons included ancillary investigation activity and are retained as supporting evidence, not tight latency claims.
- No numeric SLA is inferred from three samples. Raw observations and medians/ranges are in JSON files; `summarize.cjs` derives the aggregate without copying business data. Model and project payloads remain in memory for equality checks and are not published.

## Final matched baseline comparison

From `baseline-final.json`; milliseconds, medians of three fresh processes per cell:

| Mode | Catalog, immediate-call scenario | First call immediately | Catalog, delayed-call scenario | First call after 2 s pause |
| --- | ---: | ---: | ---: | ---: |
| Current PR #320 baseline | 700 | 1,274 | 718 | 1,274 |
| Direct schema imports + lazy handlers + model-only background | 603 | 1,234 | 592 | 36 |

Baseline catalog range in the immediate scenario: 699–712 ms; candidate: 597–609 ms. Delayed candidate first-call range: 32–44 ms. Immediate first-call ranges overlap (baseline 1,190–1,330 ms; candidate 1,228–1,243 ms): no material immediate-call speedup is established from prewarming alone. Warm reads remain tens of milliseconds.

The prototype duplicates serialized catalog metadata alongside runtime schemas. Post-read resident memory was about 552 MiB for baseline versus 601 MiB for this candidate (median snapshots, not peak memory). This is a real cost to address before choosing the catalog implementation, particularly with multiple stdio processes. Snapshot generation proves a boundary; it is not the prescribed final storage format.

## Lazy versus full versus model-only prewarming

From `final-comparison.json`; all three variants use direct schema imports and deferred handlers:

| Strategy | Catalog with immediate call | Immediate first call | First call after 2 s |
| --- | ---: | ---: | ---: |
| Pure lazy | 584 ms | 1,255 ms | 1,212 ms |
| Prewarm all handlers and full model | 589 ms | 1,417 ms | 35 ms |
| Prewarm model; handlers on demand | 596 ms | 1,215 ms | 44 ms |

Full handler preloading adds about 200 ms to an immediate call in these samples while buying only about 9 ms after a pause. Process CPU-time snapshots after reads were roughly 2.5–2.6 s with full preload and 2.0–2.1 s with model-only preload; they are coarse `ps` cumulative counters, not CPU profiles. Prefer model-only prewarming unless a measured workload establishes a reason to preload selected handler groups.

An exploratory batch of ten simultaneous starts with non-network benchmark configuration had median catalog times of 1,705 ms (baseline), 1,805 ms (lazy registry only), and 2,396 ms (all-handler background). One batch per variant is insufficient for a precise ranking, but it rejects the assumption that speculative work is free. It is not a live ten-client Huly throughput or model-memory benchmark.

## Isolated imports and compatibility

`trace-parity.cjs` verifies exact native/auto listing and project-result equality against baseline. Runtime tracing shows no tool-category module evaluation during discovery; the first Projects call evaluates `projects.ts` and does not evaluate `issues.ts`. Shared registry infrastructure still initializes at startup. This demonstrates that an isolated category call need not pull all handlers, even with the existing single-file bundle.

`lifecycle.cjs` verifies the background smoke path evaluates all 59 production tool-group modules. It also cancels one waiting read at a 100 ms SDK deadline, then starts three concurrent reads: all succeed with exactly one SDK transaction-client acquisition and one ready event. This exercises the real local-Huly path, not an injected SDK replacement.

These probes do not prove that every handler's transitive dependencies are minimal. A production dependency gate should cover all group boundaries. Import failure/retry behavior in the prototype is deliberately incomplete; production code must use typed failures and deliberate cache/retry ownership rather than detached rejected imports.

## Minimum versus full model

`model-parity.json` compares six read-only operations with the same local Huly state:

| Operation | `fullModel=false` parity |
| --- | --- |
| `list_projects` | Equal |
| `list_huly_classes` | Equal |
| `list_notification_providers` | Error instead of successful result |
| `list_notification_types` | Different result |
| `list_workbench_applications` | Different, substantially reduced result without an error |
| `list_viewlets` | Different, substantially reduced result without an error |

Lazy and direct-import variants retain exact baseline results for all six. Resource enumeration retains eight resources. Full-model initialization still costs roughly 1.2–1.5 s on resource listing; moving module evaluation does not remove this network/model wait.

### Direct REST proof for lightweight project/resource discovery

`direct-read.js` uses the installed SDK's `createRestClient` directly, without `getModel` or `createRestTxOperations`. It loads server configuration, authenticates/selects the workspace and queries non-archived projects using the same 200-row limit and name ordering as resource discovery. It parses mapped summaries with the existing `ProjectSummarySchema` and asserts equality with the full-model client's summaries in three alternating pairs.

| Adapter | Authentication/discovery + query median | Range |
| --- | ---: | ---: |
| Direct REST, no model | 32 ms | 30–95 ms |
| Full transaction client/model | 1,213 ms | 1,132–1,285 ms |

All eight project summaries match. Module imports and config parsing occur before these timers; this is not total MCP startup latency. Repeated samples in one process reuse network/SDK caches. Equality is demonstrated for project summaries, not an unrestricted substitute for the transaction client. The existing resource mapper consumes these summaries, so this provides a concrete route to lightweight resource discovery without returning an empty resource list.

## Shared HTTP

`http-only.json` records three independently started servers and three sequential independent request contexts per server, using the supported 2026 HTTP protocol. First reads pay model acquisition (median 1,277 ms). Reads from subsequent contexts reuse the process-owned environment-backed client (median about 24 ms, range 21–31 ms). Subsequent discovery plus listing takes about 6.6 ms median in the already-running process.

The server is given a fixed 1.5 s readiness allowance before these HTTP requests; that is not measured server startup time. HTTP versus stdio timings use different protocol/transport paths and the HTTP daemon's startup is excluded: do not claim a direct end-to-end speedup ratio. This proves amortization across request contexts, not a new Codex desktop connection benchmark or simultaneous multi-user load test.

Default environment clients are shared. Explicit Huly configuration headers create request-scoped clients, even for identical headers, as covered by existing tests. Switching to HTTP therefore needs deliberate configuration and process lifecycle ownership. Native-profile resolution is currently stdio-specific.

## Lifecycle and discovery requirements for implementation

- Discovery, tool schemas and catalog tools must not wait for Huly. Resource listing must preserve its real results and use the light path where qualified.
- Full-model work must have one process/configuration owner. A foreground caller joins it. Cancellation of one caller does not kill shared startup; process shutdown does.
- Caller deadlines include waiting. A canceled waiter must not dispatch its operation later. Do not replay mutations on timeout. Expected initialization/import failures need typed, useful errors and bounded retry.
- Distinguish metadata readiness, lightweight client readiness and full-model readiness; avoid replacing an in-use client during an implicit upgrade.
- Background tasks must not block the event loop before discovery is written. The 150 ms timer used by this prototype is an experimental scheduling device, not a final lifecycle contract.
- The actual Codex full-status probe can request `resources/list`; it must not be confused with every normal UI startup. No new global Codex reload or configuration change was used in these experiments. The real application path remains a required final implementation acceptance check.

## Alternatives and decision

| Option | Benefit | Cost / limitation |
| --- | --- | --- |
| Model-only background + lazy handlers | Smallest demonstrated first slice; nearly warm reads after agent delay | Immediate calls still wait for the model; prototype catalog adds memory |
| Add qualified lightweight REST capability | Removes model dependency for immediate project/resource reads; strongest measured opportunity | New adapter boundary, query/metadata parity and ownership work |
| Full handler prewarm | Slightly faster delayed first call in sample | More CPU, worse immediate calls, redundant work across stdio processes |
| Pure lazy | Avoids speculative model/handler work | Pays preparation on first call even after a long idle pause |
| Shared HTTP | Reuses process/model across threads | Daemon/configuration ownership; profile and identity constraints; cold daemon still costs startup |
| Disable full model globally | Faster initial connection | Rejected: errors and silent metadata loss |

Choose staged stdio initialization as the default implementation direction, with lightweight REST as its next high-impact slice. Choose shared HTTP additionally if multiple loaded threads are the dominant workload. Full eager handler preload should remain an explicit smoke/debug facility, or a measured opt-in policy.

## Verification and practical limits

- `pnpm check-all`: PASS, 424 files / 5,475 tests; statements 99.46%, branches 99.00%, functions 99.02%, lines 99.56%; Effect diagnostics: zero errors/warnings. This certifies unchanged production sources at the baseline, not a production-quality lazy implementation.
- Focused lifecycle/resource suite: PASS, 41 tests. The full gate also includes HTTP lease/configuration isolation tests.
- Existing HTTP no-config smoke: PASS.
- Live local-Huly read probes, exact native/auto parity, six-operation model comparison, 59-group preload and canceled-waiter/single-acquisition probe: PASS, except intentionally rejected light-model parity.
- No mutations, external deployments, default transport changes, Codex configuration edits or production implementation changes. No claim about arbitrary Huly versions, every operation, cold filesystem startup, ten live full-model clients, or production mutation cancellation certification.

## Reproduction

Use this research checkout with Darwin-local dependencies. Scripts currently identify `/tmp/hulymcp-perf-startup` as their source root; adjust that constant if replaying elsewhere. Source local credentials privately and disable telemetry; never publish `.env.local` or raw SDK payloads.

```sh
node docs/verification/startup-options-321/build.cjs
BUILD_VARIANTS=trace,trace-background,narrow-model-background node docs/verification/startup-options-321/build.cjs
set -a
source .env.local
set +a
node docs/verification/startup-options-321/compare.cjs
PERF_VARIANTS=baseline,narrow,narrow-background PERF_OUTPUT=schema-comparison.json node docs/verification/startup-options-321/compare.cjs
PERF_VARIANTS=narrow,narrow-background,narrow-model-background PERF_OUTPUT=final-comparison.json node docs/verification/startup-options-321/compare.cjs
PERF_VARIANTS=baseline,narrow-model-background PERF_OUTPUT=baseline-final.json node docs/verification/startup-options-321/compare.cjs
MODEL_ONLY=1 node docs/verification/startup-options-321/http-model.cjs
HTTP_ONLY=1 node docs/verification/startup-options-321/http-model.cjs
node docs/verification/startup-options-321/trace-parity.cjs
node docs/verification/startup-options-321/lifecycle.cjs
pnpm exec esbuild docs/verification/startup-options-321/direct-read.js --bundle --platform=node --format=cjs --outfile=docs/verification/startup-options-321/direct-read.cjs
node docs/verification/startup-options-321/direct-read.cjs
node docs/verification/startup-options-321/summarize.cjs
```

Run timing campaigns sequentially without builds/tests in parallel. `usage` fields are post-read `ps rss,time` snapshots (KiB and cumulative process CPU time), not peaks. Generated bundles, metadata files, catalog snapshots and temporary diagnostic logs are excluded from the evidence commit; regenerate them with the scripts.
