# Effect 4 migration ledger — closed

Date: 2026-08-12
Target cohort: `4.0.0-rc.108`
Capture runtime: Node `22.22.2` (with the supported-line checks noted below on Node `24.15.0`)

This document preserves the exhaustive, reproducible failure history captured
immediately after replacing the Effect 3 dependency graph. That controlled-red
interval is closed: the final checkpoint below records the complete green gate.
The historical entries explain how each failure family was removed without
restoring Effect 3, adding compatibility facades, suppressing diagnostics, or
weakening a quality threshold.

## Cohort and native-tool checks

| Check | Result | Evidence |
| --- | --- | --- |
| `mise exec node@22.22.2 -- pnpm verify:effect-cohort` | pass | Exact Effect RC and supporting-toolchain check passed. |
| `mise exec node@24.15.0 -- pnpm verify:effect-cohort` | pass | Same cohort check passed on the second supported Node line. |
| `mise exec node@22.22.2 -- pnpm exec effect-tsgo --version` | pass | Native executable started and printed `tsgo v0.36.4`. |
| `mise exec node@24.15.0 -- pnpm exec effect-tsgo --version` | pass | Native executable started and printed `tsgo v0.36.4`. |

Fresh temporary installs from the frozen lockfile also passed on both Node lines
on Linux arm64. The same `verify:effect-cohort` command runs immediately after
install in the Node 22.22.2 and 24.15.0 CI matrices; it now executes the native
tsgo binary as part of verification, covering the Linux x64 CI architecture as
well as dependency metadata.

The installed declarations and `node_modules/effect/AGENTS.md` agree with the
pinned source commits: exact rc.108 declarations remain authoritative,
`Schema.TaggedError` exists in this cohort, and the package guidance uses the v4
`Effect.gen`, `Effect.fn`, `Context.Service`, and unstable-module organization.
The pins needed no correction; `docs/mcps/effect.md` and `CLAUDE.md` were updated
to distinguish the recorded pre-cutover cohort from the now-installed target and
to put the shipped package guide into the active lookup order.

## Reproduction summary

Run these commands from the repository root after a clean cohort install. Preserve
full command output only as an untracked local artifact; the aggregates below are
the tracked ledger so compiler output does not add megabytes to the repository.

| Surface | Command | Result |
| --- | --- | --- |
| Bundle | `mise exec node@22.22.2 -- pnpm build` | fail, exit 1 |
| TypeScript | `mise exec node@22.22.2 -- pnpm typecheck:tsc` | fail, exit 1; 10,022 diagnostics in 538 files |
| Effect diagnostics | `timeout --signal=INT --kill-after=5s 120s mise exec node@22.22.2 -- pnpm typecheck:effect` | timeout, exit 124; no diagnostic payload before the bound |
| Tests | `mise exec node@22.22.2 -- pnpm test` | fail, exit 1; 252 files failed and 13 passed |

`pnpm check-all` is deliberately not run during this interval: its first build
stage is already represented by the focused build failure, and all later source
gates would be downstream noise until that failure is repaired.

## Build failure

The MCP bundle cannot resolve the removed package `@effect/platform` imported by
`src/mcp/http-transport.ts:10`. Because `build:mcp` fails first, `build:cli` does
not run. This is the complete build-stage failure at this cutover point.

## TypeScript failure inventory

The compiler emitted 10,022 diagnostics across 538 unique files: 5,718 in `src`
(324 files), 3,715 in `test` (172 files), 391 in `scripts` (29 files), and 198 in
`packages` (13 files). The diagnostic-code multiset below is exhaustive:

`TS1360` 1; `TS18046` 953; `TS18047` 5; `TS18048` 1; `TS2305` 68;
`TS2307` 10; `TS2314` 20; `TS2322` 338; `TS2339` 2,734; `TS2345` 1,131;
`TS2347` 187; `TS2352` 1; `TS2353` 11; `TS2366` 10; `TS2367` 24;
`TS2375` 1,404; `TS2379` 13; `TS2464` 9; `TS2488` 569; `TS2493` 1;
`TS2532` 2; `TS2551` 1,236; `TS2554` 279; `TS2560` 7; `TS2571` 141;
`TS2635` 3; `TS2678` 5; `TS2694` 18; `TS2698` 4; `TS2724` 105;
`TS2739` 21; `TS2740` 206; `TS2741` 12; `TS2769` 18; `TS7006` 436;
`TS7031` 30; `TS7053` 9.

These diagnostics collapse into the following migration categories. Cascading
`unknown`, assignability, iterator, and implicit-`any` errors are retained in the
code multiset above and should disappear only through the owning API migrations.

| Category | Representative evidence | Required migration family |
| --- | --- | --- |
| Removed packages/exports | 8 `@effect/cli` and 2 `@effect/platform` unresolved-module diagnostics; `NodeContext` absent | CLI to `effect/unstable/cli`, HTTP to `effect/unstable/http`, `NodeContext` to `NodeServices` |
| Schema construction and metadata | `annotations` 1,151; `optionalWith` 112; `extend` 24; old variadic `Literal`/`Union`; removed filters such as `positive` | v4 schema constructors, `.annotate`, `optionalKey`, field composition, array-based members, current checks |
| Schema parse/encode and JSON Schema | `decodeUnknown` 681; `decodeUnknownEither` 130; `encodeUnknown` 36; `JSONSchema` 83; `ParseResult` 13 | Result/effect parsers and encoders plus the project Draft-07 adapter |
| Services, layers, config, and yielding | `Context.Tag` 10; service values not iterable; `Effect`/service environment mismatches; removed config APIs | `Context.Service`, v4 Layer composition/memoization, current Config provider/schema APIs |
| Effect combinators and runtime | `either` 151; `fork` 19; `catchAll` 4; `zipRight` 2; logger/console APIs | v4 Result/error, fiber, sequencing, logging, and runtime APIs |
| Cause/Exit failures | removed `isDie`, `isFailType`, `sequential`, fiber-failure symbols, and old cause fields | centralized flattened `Cause.reasons` and explicit `Exit` interpretation |
| Test APIs | old `@effect/vitest` assumptions and `TestClock` import failures | `effect/testing`, v4 Effect Vitest test shape, explicit layer isolation |

To regenerate the exact counts without retaining the raw log:

```bash
mise exec node@22.22.2 -- pnpm typecheck:tsc > /tmp/hulymcp-effect4-tsc.log 2>&1
rg -o 'error TS[0-9]+' /tmp/hulymcp-effect4-tsc.log | sort | uniq -c
rg -o '^(src|packages|scripts|test)/[^(:]+' /tmp/hulymcp-effect4-tsc.log | sort -u | wc -l
```

## Effect diagnostic timeout

`effect-tsgo diagnostics` starts successfully but produces no diagnostics or
completion within 120 seconds and is interrupted by the explicit bound (exit
124). Its native binary itself starts on both supported Node lines, so this is a
project-analysis timeout distinct from native executable startup. Keep this entry
red until the compiler migration surface is reduced enough for diagnostics to
complete; do not remove the Effect diagnostic gate or lower its severity.

## Test failure inventory

Vitest completes in about 36 seconds: 252 of 265 files fail, 13 pass; 139 tests
execute, with 136 passing and 3 failing. Of the failed files, 250 are suite import
or collection failures. Their observed root-error inventory is:

| Root failure | Observed count |
| --- | ---: |
| Undefined schema value followed by `.annotations` | 111 |
| Undefined schema value followed by `.ast` | 10 |
| Missing `@effect/cli` package | 6 |
| `Schema.Literal(...).annotations` is absent | 5 |
| Old union member call (`members.map` failure) | 2 |
| `Schema.optionalWith` is absent | 2 |
| `Context.Tag` is absent | 2 |
| Missing `@effect/platform` package | 1 |
| Other schema startup roots (`finite`, undefined `pipe`/`encoding`) | 3 |

The three executed assertion failures are also migration-owned:

- two property-harness tests call removed `Schema.decodeUnknownEither`;
- the CLI defect-boundary test receives exit status 1 instead of the preserved
  status 70 because the old Cause/runtime interpretation no longer applies.

The 142 root-error lines are not a count of failed files. A single collection
root is imported through the test module graph and therefore accounts for many
failed suites without Vitest emitting another root error for every importer. All
250 collection failures belong to that import-graph fan-out; every distinct root
error Vitest emitted is classified above, so there are no 108 unassigned failure
families.

The suite counts, test names, and root errors can be refreshed with:

```bash
mise exec node@22.22.2 -- pnpm test > /tmp/hulymcp-effect4-test.log 2>&1
rg '^TypeError:|^Error: Cannot find package' /tmp/hulymcp-effect4-test.log | sort | uniq -c
tail -n 12 /tmp/hulymcp-effect4-test.log
```

## Ticket #212 testing-primitives delta

The first v4-native testing slice now passes independently:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  src/domain/schemas/json-schema.test.ts \
  test/effect4/testing-primitives.test.ts \
  test/effect4/layer-isolation.test.ts
```

Result: 2 files and 5 tests pass. These tests establish automatic `it.effect`
scopes, virtual-clock advancement, explicit readiness, deferred versus eager
fiber startup, deterministic scoped interruption, shared layer memoization, and
the `Layer.fresh` isolation choice; the guidance also records when whole-subtree
`local: true` isolation is appropriate. Direct compiler output has
no diagnostics in either new file. The global build, compiler, Effect diagnostic,
and test-suite categories above remain unchanged; #212 deliberately does not
bulk-convert the 250 migration-blocked test suites.

## Ticket #213 schema-foundation delta

The central Draft-07 adapter and shared Schema foundation pass independently:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  src/domain/schemas/json-schema.test.ts \
  test/domain/schemas/shared-identifiers.test.ts \
  test/domain/schemas.shared-foundation.test.ts \
  test/effect4/optionality-tracer.test.ts \
  test/mcp/input-schema-compat.test.ts \
  test/mcp/input-schema-compat.property.test.ts \
  test/mcp/json-schema-refs.test.ts
```

Result: 7 files and 31 tests pass, including external AJV Draft-07 validation,
input and output schemas, definitions and nested refs, tuples, authored `oneOf`,
authored boolean constraints, closed public objects, preserved v3 empty-params
runtime behavior, exact and ordinary optionality, and runtime/encoding edge cases.
Strict per-file Effect diagnostics report zero findings across the owned source
and test files. `shared.ts` was split behind its stable barrel to keep every
production file below the 420-line architecture limit.

The compiler inventory falls from 10,022 diagnostics in 538 files to 9,325 in
504 files: 5,898 in `src` (310 files), 2,858 in `test` (150 files), 368 in
`scripts` (31 files), and 201 in `packages` (13 files). The remaining global
build, domain Schema, CLI, service, Cause/Exit, and test collection categories
remain assigned to later tickets. Complete registry JSON Schema parity remains
deferred until every domain-owned generator has moved through the sole adapter.

## Ticket #214 Cause/Exit seam delta

The flattened Cause interpreter and CLI process boundary pass independently:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/runtime/cause-exit.test.ts \
  test/runtime/schema-error-format.test.ts \
  test/cli/process-failures.test.ts
```

Result: 3 files and 18 tests pass. The matrix covers successful and failed
`runPromiseExit` boundaries, typed failures, defects, interruption, empty and
multiple ordered reasons, Effect 3-compatible parse-error wording, and
process-level sanitization. Client acquisition now resolves with `Exit`;
production code no longer recognizes or renders a FiberFailure wrapper. The
neutral client-resolver port and protocol/server callbacks now carry that Exit
contract. The MCP mapping, resource, registry, and client-runtime suites remain
collection-blocked before their tests run by already-assigned domain Schema and
service declaration failures (`Schema.Union`, removed filter combinators, and
v3 `Context.Tag` shapes).
The blocked client-runtime suite contains the focused unavailable-eviction,
non-recoverable caching, and priming-race assertions for when #215 unlocks its
imports.

The compiler inventory falls from 9,325 diagnostics in 504 files to 9,257 in
501 files: 5,861 in `src` (312 files), 2,861 in `test` (147 files), 368 in
`scripts` (31 files), and 167 in `packages` (11 files). The neutral resolver and
compatibility formatter add no owned-scope compiler failures. Remaining service
declaration diagnostics belong to #215; remaining test diagnostics include
Exit-consumer updates assigned to their domain and lifecycle tickets.

## Ticket #215 service-declaration delta

All nine application services now use the exact rc.108 class declaration form,
`Context.Service<Self, Shape>()("identifier")`. Their identifiers, explicit
operation interfaces, layer requirements, static constructors, and test-layer
substitution seams are unchanged. `DiagnosticsOperations` and
`McpServerOperations` are exported as the stable shapes owned by their service
modules. No `Type` compatibility alias was added: the remaining old
`Service["Type"]` projections are assigned to the MCP registry and domain
vertical tickets. The CLI-local service remains assigned to #228.

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/effect4/service-declarations.test.ts
```

Result: 1 file and 4 tests pass. The focused contract proves exact identifiers,
direct service provision, default and replacement layers, explicit operation
shapes, and reachable operations for the independently collectible service
modules. Runtime imports for the other declarations remain collection-blocked
by already-assigned Schema and transport modules; the declaration changes add
no compiler diagnostic of their own.

The compiler inventory falls from 9,257 diagnostics in 501 files to 7,363 in
462 files: 4,685 in `src` (290 files), 2,147 in `test` (130 files), 368 in
`scripts` (31 files), and 163 in `packages` (11 files). This large reduction is
expected: restoring service class shapes removes downstream contextual type
cascades without migrating the domain-owned `Service["Type"]` projections.
The remaining `Layer.scoped` failures stay assigned to #217; config, Schema,
MCP lifecycle/HTTP, domain, and CLI failures retain their existing owners.

## Ticket #216 configuration and telemetry delta

The typed configuration boundary now uses exact rc.108 `Config.schema`,
`Config.ConfigError`, Schema checks, Result/Effect decoders, and explicit
`ConfigProvider` services. Raw token and password values decode through
`Schema.RedactedFromValue`; header configuration uses a request-owned in-memory
provider. Focused tests no longer mutate ambient `process.env`. Telemetry remains
a lazy layer recipe, keeps MCP and CLI variables isolated, and preserves its
existing explicit shutdown ownership.

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/config/config.test.ts \
  test/config/config-headers.property.test.ts \
  test/telemetry/telemetry.test.ts
```

Result: 3 files and 75 tests pass. The matrix covers missing, malformed,
empty-string, default, override, token-priority, header-provider, redaction,
telemetry enablement/debug selection, lazy construction, CLI/MCP isolation, and
callable shutdown behavior. Owned-source TypeScript diagnostics are zero.

The compiler inventory falls from 7,363 diagnostics in 462 files to 7,262 in
457 files: 4,642 in `src` (288 files), 2,099 in `test` (128 files), 358 in
`scripts` (30 files), and 163 in `packages` (11 files). Remaining runtime-layer,
domain Schema, MCP lifecycle/transport, script, and CLI diagnostics retain their
assigned tickets.

## Ticket #217 client and runtime lifecycle delta

Client, storage, and workspace layers now use rc.108 resource APIs. The
process-level resolver owns the scope of its memoized bundle and exposes an
idempotent close operation; bootstrap brackets that resolver with
`Effect.acquireUseRelease`. Eager stdio acquisition uses the same resolver,
recoverable unavailable failures retain Exit-aware eviction, fatal failures stay
cached, pending acquisition is interruptible, and primed bundles remain
externally owned with awaitable ownership transfer. The real transaction client
registers `client.close()` in its layer scope. Header-auth HTTP requests acquire
isolated scoped bundles whose close operation is owned by the request lifecycle.
The old unscoped `buildClientBundle` escape hatch was removed.

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/effect4/layer-isolation.test.ts \
  test/runtime/scoped-client.test.ts \
  test/runtime/huly-clients.test.ts \
  test/runtime/http-client-leases.test.ts \
  test/mcp/request-client-lifecycle.test.ts
```

Result: 5 files and 31 tests pass. The matrix covers successful acquisition,
shared memoization, exact-once/idempotent release, post-close resolution,
externally owned priming, recoverable retry, fatal caching, mixed fatal causes,
prime races, pending-acquisition interruption, per-header workspace/credential
isolation, env-cache separation, request success/failure/abort/shutdown, cleanup
rejection, the real transaction client's scope-owned close hook, and shared
versus `Layer.fresh` acquisition counts.

The compiler inventory falls from 7,262 diagnostics in 457 files to 7,168 in
446 files: 4,567 in `src` (280 files), 2,080 in `test` (125 files), 358 in
`scripts` (30 files), and 163 in `packages` (11 files). Owned source and test
files have zero TypeScript diagnostics; remaining domain Schema, MCP
lifecycle/transport, script, and CLI diagnostics retain their assigned tickets.

## Ticket #218 work-management vertical checkpoint

The project, issue, issue-template, label, milestone, and generic workflow
status boundary schemas now use exact rc.108 annotations, optionality, checks,
transformations, parsers, tagged-error unions, and the shared Draft-07 adapter.
Ordinary optional fields continue to accept explicit `undefined`; only the six
formerly exact issue reference/metadata fields use `Schema.optionalKey`. Authored
at-least-one constraints and error messages remain present.

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/domain/schemas/milestones.test.ts \
  test/domain/schemas.workflow-statuses.test.ts \
  test/huly/errors-workflow-statuses.test.ts \
  test/huly/operations/workflow-statuses.test.ts
```

Result: 4 files and 93 tests pass. The runnable matrix covers milestone status
literals and update constraints, workflow scalar/gradient codecs, explicit
undefined versus omitted encoding, authored update messages, workflow error
unions, and representative workflow reads and writes.

The compiler inventory falls from 7,168 diagnostics in 446 files to 6,485 in
423 files: 4,092 in `src` (259 files), 1,872 in `test` (123 files), 358 in
`scripts` (30 files), and 163 in `packages` (11 files). The four downstream
issue-operation status-category diagnostics were removed by #219. Issue, label,
and milestone operation suites remain collection-blocked by `tags.ts` and
`workbench.ts`, assigned to #224. The focused
family MCP registry/call proof remains assigned to #225. Ticket #218 therefore
remains open until those declared dependency seams make its full vertical proof
executable; this checkpoint does not claim the complete acceptance matrix.

## Tickets #219–#222 domain-wave checkpoint

The work-management, content/storage, messaging/calendar, and
contacts/collaboration families now use exact rc.108 annotations, optionality,
checks, transformations, Result decoders, service shapes, and the shared
Draft-07 adapter throughout their owned production leaves. Authored JSON Schema
constraints and LLM-facing property descriptions are restored explicitly where
Effect's Draft-07 conversion does not retain nested key metadata. No Effect 3
compatibility layer or diagnostic suppression was introduced.

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/domain/schemas.planner.test.ts \
  test/domain/schemas.task-management.test.ts \
  test/domain/schemas.workspace.test.ts \
  test/domain/schemas.chat-message-attachments.test.ts \
  test/huly/storage.property.test.ts \
  src/domain/schemas/calendar.test.ts \
  src/domain/schemas/contact-channels.test.ts \
  src/domain/schemas/contacts.test.ts \
  test/domain/schemas.comments.test.ts
```

Result: 10 files and 180 tests pass. This covers representative ordinary
optional omission versus explicit `undefined`, encoded omission, authored
cross-field constraints and enum restoration, calendar recurrence boundaries,
storage properties, contact target schemas, comment contracts, and public
property descriptions. Each owned production manifest is clean under focused
type-aware Oxlint, TypeScript/Effect diagnostics, formatting, and an obsolete-
API scan.

The aggregate compiler inventory is 3,963 diagnostics in 275 files: 2,069 in
`src` (141 files), 1,375 in `test` (93 files), 357 in `scripts` (30 files), and
162 in `packages` (11 files). Domain operation and protocol suites for these
four tickets remain collection-blocked by the #224 `workbench.ts` and related
shared platform/admin schema barrel. Focused MCP/CLI registration and call proof
is assigned to #225 after every domain family is migrated. Tickets #219–#222
therefore remain open; this checkpoint records coherent owned migrations and
their declared integration edges rather than claiming full vertical closure.

## Tickets #223–#224 specialist and administration checkpoint

Boards/cards/inventory, recruiting/leads/support, and the administration and
extension families now use exact rc.108 schemas, Result decoders, service
shapes, and Draft-07 conversion. Explicit per-schema description maps preserve
LLM-facing create/update distinctions; a runtime audit covers 70 administration
exports with 233 properties and 64 board/card/inventory exports with 220
properties, with no missing top-level property descriptions. Authored one-of,
mutual-exclusion, at-least-one, exact-optional, and filter path/message contracts
remain covered. Shared approval-request and model-metadata leaves discovered by
barrel traversal were added to #224 rather than orphaned.

Focused runnable evidence includes 24 board/card/inventory schema tests, 43
lead/recruiting schema tests, 55 card operation tests, 61 administration schema
tests, 33 SDK-discovery/model-administration tests, 7 approval-request schema
tests, and 132 association/custom-field/SDK-configuration/message-template
tests. The final combined reviewer matrix passed 379 tests with no assertion
failures. Owned manifests pass focused type-aware lint, formatting,
obsolete-API scans, and filtered TypeScript diagnostics.

After the shared model-metadata decoder and test-codec helpers were migrated,
the dependency cascades in the earlier inventory disappeared: the complete
strict TypeScript 7 check and strict Effect diagnostics now pass with zero
diagnostics. This closes the deliberately red compiler interval opened by #211.
Remaining work is runtime/public-contract contraction in the explicitly
deferred registry/protocol, CLI, HTTP/lifecycle, and shared domain/barrel seams.
Tickets #223–#224 remain open until #225/#228 prove complete MCP/CLI exposure
and the final focused operation suites execute.

## Ticket #225 registry and schema-corpus checkpoint

The complete production operation registry now constructs under Effect 4 and
retains exactly 522 unique operation names. Shared component, context, module
label, related-issue-target, user-status, and virtual-office schemas now route
through the project Draft-07 adapter. There are no remaining direct
`JSONSchema.make` calls in production, package, script, or test TypeScript.
Registry, proxy, resource, protocol-parser, and service-shape consumers use
rc.108 Result, SchemaError, optional-key, and Context.Service APIs.

The oracle tooling now performs structural JSON-Pointer comparison with an
exact intentional-delta allowlist that rejects unexpected, duplicate, and
stale entries, with a machine-readable per-surface delta report. It compiles
the native and proxy corpus with strict Ajv
Draft-07 validation and checks representative runtime parsing against emitted
refinement, tuple, closed-object, and authored cross-field constraints. The
focused corpus/adapter/registry matrix passes 8 files and 67 tests;
the broader owned registry/proxy/resource cohorts account for 275 passing
assertions, and the migrated domain dependency suites pass 157 tests.

The full bundled wire comparison is not yet executable because the build still
stops at the #227-owned `@effect/platform` HTTP transport import, while the
oracle command imports the #228-owned Effect CLI framework. Those downstream
tickets must make both artifacts constructible before the checked-in Effect 3
wire oracle can be compared end to end. Likewise, a fresh complete TypeScript
inventory is currently red in the explicitly deferred CLI, server/transport,
and integration-script/test surfaces; the earlier zero-diagnostic statement
above records the settled domain-wave checkpoint, not the current whole-tree
state. Ticket #225 remains open until the bundled comparison runs after those
edges land.

## Ticket #226 MCP stdio lifecycle checkpoint

The production MCP service now exposes an explicit readiness effect and its
concentrated lifecycle tests use scope-owned eager fibers with Deferred and the
Effect test clock instead of detached fibers and 17 wall-clock sleeps. Stdio EOF
is unconditional ownership loss: the removed `MCP_AUTO_EXIT` escape hatch can no
longer keep an abandoned Codex child alive as a PID-1 orphan.
EOF, close, SIGINT, SIGTERM, and programmatic stop share one idempotent Deferred
shutdown path.

In-flight request drain, telemetry flush, and SDK wire close each receive a
named five-second grace period. A timeout interrupts the Effect-owned cleanup,
continues to the next cleanup phase, and writes one sanitized diagnostic to
stderr; rejected closes likewise omit the underlying cause so credentials
cannot cross the process boundary. SDK handler errors use the same secret-free
stderr policy. Produced responses are drained before wire
close. Protocol tests retain final `2026-07-28` discovery and `2025-06-18`
initialize/tool compatibility. A raw built-command exchange additionally proves
a representative `get_huly_context` call, invalid-parameter rendering, response
drain, and actual zero-code child exit after stdin EOF. The HTTP endpoint token remains `Redacted` across the
shared bootstrap/server seam and is left for the #227 auth adapter to unwrap at
its point of use.

The focused lifecycle and bundled stdio matrix now executes after the #227
transport import migration:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/index.test.ts \
  test/mcp/server.test.ts \
  test/mcp/server-parseToolsets.test.ts \
  test/mcp/server-stdio-lifecycle.test.ts \
  test/mcp/stdio-transport.test.ts \
  test/mcp/http-transport.test.ts \
  test/mcp/server-http.test.ts
```

Result: the focused seven-file MCP/index matrix passes 37 suites and all 157 tests, including
all 68 assertions in `test/mcp/server.test.ts`. The in-process lifecycle cases
use the virtual Effect clock; the spawned built-artifact cases retain their
process test bound and prove both protocol generations using unconditional EOF
shutdown.

The deterministic lifecycle matrix covers safe-default EOF, response drain,
racing EOF/close/SIGTERM/stop idempotence, bounded stuck telemetry and wire
close, sanitized close rejection, listener cleanup through scoped interruption,
and the already-migrated malformed-request/single-response protocol handlers.
The broader `server.test.ts` uses explicit Deferred registration/config-provider
seams and passes all 68 assertions without sleeps or test mocks. Concurrent
`run()` calls claim one atomic Ref slot, and process/request cleanup diagnostics
are bounded and static so rejected cleanup cannot disclose secrets.

## Ticket #227 HTTP transport checkpoint

The HTTP endpoint now uses the exact rc.108 `HttpEffect`, effectful
`HttpRouter`, `HttpServer`, and `NodeHttpServer` APIs. Listener acquisition is
scoped and completes only after Node reports that the socket is listening; the
server service's HTTP readiness signal is emitted after the router is attached.
Port-zero startup reports the acquired address rather than `:0`. Process signal
ownership remains in the #226 server lifecycle, while interruption of the HTTP
transport fiber closes the router, listener, MCP products, and request-owned
leases through scope finalizers.

`MCP_AUTH_TOKEN` remains `Redacted` from bootstrap through server configuration
and is unwrapped only inside the authorization adapter. The endpoint retains its
single `Bearer` form, constant-time equal-length comparison, 401 response, and
secret-free JSON/error output. Localhost Host and Origin checks, malformed JSON,
final `2026-07-28`, legacy `2025-06-18`, sanitized factory failures, and
idempotent/aggregated legacy close behavior remain covered.

HTTP handler shutdown and its scope finalizer use the same configurable grace
period as the server lifecycle. Timeout interrupts the Effect-owned wait,
continues finalization, and emits one static diagnostic; arbitrary SDK or factory
error messages are never copied to stderr. The timeout fallback is covered with
the virtual Effect clock and a deliberately non-completing server close, without
wall-clock sleeps.

The integration suite gates two request leases concurrently before releasing
either one, proving distinct per-request workspace identities, products, and
exactly-once cleanup without wall-clock sleeps or test mocks. Mounted-handler
shutdown deterministically interrupts an in-flight modern request with the SDK's
499 response and waits for it to settle before close completes.

```bash
mise exec node@22.22.2 -- pnpm exec vitest run --maxWorkers=1 \
  test/mcp/http-transport.test.ts \
  test/mcp/server-http.test.ts \
  test/index.test.ts \
  test/mcp/server-stdio-lifecycle.test.ts \
  test/mcp/stdio-transport.test.ts
```

Result: 5 files and 69 tests pass. `mise exec node@22.22.2 -- pnpm build:mcp`,
focused type-aware Oxlint, formatting, and `git diff --check` also pass. The
whole-tree TypeScript check remains red only in separately owned CLI/scripts and
their adjacent tests; no #227 production or test path appears in its diagnostic
output.

## Ticket #228 CLI framework checkpoint

The CLI framework now uses the exact rc.108 unstable `Command`, `Flag`, and
`Argument` APIs with `NodeServices.layer`; the Effect 3 CLI compatibility
surface is gone. Generated routing, progressive help, local profile/auth
commands, typed error rendering, JSON/file precedence, nullable and negated
flags, and the full-integration mirror retain their prior serialized behavior.
The catalog remains the command source of truth at 522 shared operations, 522
unique native routes, and zero ignored operations. The older 451-route and
71-ignore values remain only as the immutable program baseline.

The complete focused CLI checkpoint is 12 files and 133 tests passing, including
the catalog contract, built-process failure boundary, repeated raw-occurrence
precedence, and generated-help truthfulness cases, including boolean negation
syntax without unsupported nullable-clear guidance. The shared JSON Schema
adapter again preserves the authored priority enum, so the prior controlled-red
catalog assertion is resolved. The CLI-owned and directly required adapter paths
have no TypeScript diagnostics; broader diagnostics remain in separately owned
migration surfaces.

## Ticket #225 bundled oracle certification (historical checkpoint)

The immutable Effect 3 behavioral baseline was compared to a separately rendered
Effect 4 corpus after the #227 HTTP and #228 CLI build edges landed. The baseline
was not regenerated. The comparison found exactly 21,086 structural deltas:
12,754 Draft-07 structural dialect changes, 4,894 schema-metadata changes, 3,428
authored-constraint projection changes, 6 richer CLI JSON parse diagnostics, and
4 concise CLI help-renderer changes.

These counts describe the #225 checkpoint, not the current bundled corpus. The
current certificate supersedes this checkpoint with 21,092 deltas: metadata is
4,894 and a separate six-entry #245 direct issue-assignee description
category is present. `behavioral-oracle-delta-review.md` and its JSON certificate
are authoritative for current totals and hashes.

Each category records an exact count and SHA-256 of its sorted exact delta identities
in `behavioral-oracle-delta-review.json`, avoiding duplication of baseline/current
values. The verifier rejects unclassified paths, changed exact sets, stale or
duplicate categories, and corpus hash drift.
The complete classification, immutable baseline hash, reviewed current-corpus
hash, and verification commands are recorded in
`behavioral-oracle-delta-review.md`.

`mise exec node@22.22.2 -- pnpm verify:effect4-oracle:built` passes against the
full bundled MCP and CLI corpus. Strict Ajv Draft-07 compilation remains green
for all 524 native and 6 proxy tool schemas; the registry remains 522 ordered,
unique operations and the authored-constraint corpus retains all 522 tools.

## Ticket #229 packed CLI and generated documentation checkpoint

README command reference and the shipped Agent Skill are regenerated from the
522-entry CLI catalog, shared operation schemas, local rc.108 command metadata,
and typed failure contract. All catalog descriptions pass the mechanical
LLM-first contract: each begins with an action, names a target, and excludes
framework-facing wording. Packed skill files are compared byte-for-byte with
their tracked generated sources.

The fresh packed executable reports `huly v0.48.1`, exposes 54 root commands and
all 522 operation routes, accepts structured JSON with explicit-field
precedence, and preserves exact human/JSON stderr and exit-2 input failures.
Package closure is pinned to exactly one external, `ws`.

Schema-owned artifact metrics and exact absolute/percentage deltas are generated
in `cli-artifact-size.json`. Verification rejects stale evidence and an
unexplained increase above 10%. The measured decrease is explained by removal of
the Effect 3 CLI runtime and compatibility surface.

## Ticket #230 zero-diagnostic and full-gate checkpoint

The migration baseline is fully green. TypeScript 7 reports zero diagnostics,
and strict Effect language-service diagnostics check all 842 files with zero
errors, warnings, or messages. Pathological language-service expansion from
inline construction of large schema decoders was removed by hoisting the exact
same decoders once; no diagnostic scope, severity, or execution timeout was
weakened.

The full unchanged quality gate passes under the supported Node 22 runtime:

```bash
mise exec node@22.22.2 -- pnpm check-all
```

The gate builds both artifacts; verifies the exact Effect cohort, schema
boundaries, circular dependencies, complexity, registry metadata/schema, the
reviewed bundled oracle, CLI integration inventory, generated README and Agent
Skill, packed-skill byte parity, and package closure; then runs type-aware lint,
formatting, duplication detection, and coverage. The final test run passes 283
files and all 4,244 tests. Coverage is 99.61% statements, 99.01% branches,
99.35% functions, and 99.66% lines, with the configured 99% thresholds unchanged.

Active instructions now direct Effect work to the installed declarations and
the pinned v4 source. The v3 snapshot remains explicitly archival parity
evidence and is no longer provisioned, verified, or presented as implementation
guidance.

## Ticket #231 clean-consumer artifact certification

Both packed artifacts pass the complete clean-consumer matrix on exact Node
22.22.2 and 24.15.0 with both pnpm 10.29.3 and npm. Every matrix cell installs
the local tarballs into a new project, resolves the complete dependency graph,
and runs the executable rather than the workspace build. The MCP executable
proves embedded discovery version, a successful `get_huly_context` call, an
invalid `get_issue` call, drained EOF shutdown, and deterministic SIGTERM exit.
The CLI proves its embedded version, all 54 root groups and 522 catalog routes,
representative help, structured-input precedence, and exact human/JSON failure
streams and statuses.

The schema-owned tarball verifier checks manifest identity and supported-engine
range, executable mode `0755`, bundle/file closure, and absence of Effect 3
imports. The MCP archive contains four files and has the reviewed nonlocal
composition of five AJV runtime helpers plus `ws`; the CLI archive contains
seven files and has the exact one-member external set `ws`. Optional native
accelerators are not required: clean installs on both supported Node lines
resolve and start through their portable fallbacks.

The final packed MCP measures 8,253,902 raw bundle bytes, 1,561,887 gzip bytes,
1,598,836 tarball bytes, and 8,406,554 unpacked bytes. Against the immutable
Effect 3 bundle baseline this is a 2.17% raw and 2.22% gzip decrease. CLI
baseline/current size evidence and deltas remain generated and verified in
`cli-artifact-size.json`; MCP measurements and closure are likewise frozen in
`mcp-artifact-certification.json`, and package-smoke rejects stale evidence. The larger CLI decrease is the removal of the Effect 3
CLI runtime and compatibility layer. CI and package-smoke use the same exact
22.22.2/24.15.0 matrix as both package manifests, while the Docker and registry
publication paths intentionally use the exact supported 24.15.0 release line.

The final release-candidate aggregate gate passes 289 files and all 4,278 tests.
Coverage is 99.57% statements, 99.01% branches, 99.25% functions, and 99.61%
lines, with the configured 99% thresholds unchanged.

## Ticket #232 final local-Huly and release certification

The release candidate was exercised from the project container against
local Huly after loading `.env.local` and rewriting only `localhost` to
`host.docker.internal`. HTTP environment and request-header configuration each
completed the full lifecycle matrix with 1,091 passing, zero failing, and 31
intentionally skipped checks. The isolated stdio matrix and full packed CLI
mirror each completed with 1,095 passing, zero failing, and 27 intentionally
skipped checks. The focused packed CLI suite passed all 123 labeled parsing,
typed-failure, confirmation, output, write, and cleanup checks. The dedicated tool-scope matrix passes for
request-local client classification, automatic/explicit exposure modes,
category and tool pins, strict proxy output, and invalid pins.

The live matrix found and repaired four boundary defects. Planner scheduling now
projects Huly's mixin-backed employee fields before Schema decoding, preserving
the active-employee invariant without requiring the SDK proxy fields to be own
properties. Modern MCP exposure now reads client identity from the validated
per-request metadata envelope and uses the connection accessor only for legacy
fallback. CLI operator diagnostics now use stderr rather than corrupting JSON
stdout, and CLI client cleanup has a five-second bound with static diagnostics so
a stuck SDK close cannot hide a completed operation. Targeted real-HTTP
authentication checks return 401 for missing and incorrect bearer credentials
and 200 for the configured credential. Disposable resources are cleaned by the
lifecycle harness, and stdio/HTTP shutdown remains owned and bounded by the
certified lifecycle implementation.

At the #232 checkpoint, the final parity report linked the unchanged Effect 3
baseline to the then-current reviewed 21,086-delta certificate and the #225,
#229, and #231 schema, CLI, artifact, and clean-consumer evidence. That count is
historical and is superseded by the current 21,092-delta certificate documented
in `behavioral-oracle-delta-review.md` and `final-parity-report.md`. The archival
decision is explicit: `.reference/effect-v3.22.1` remains historical parity
provenance only; setup does not provision or verify it, it is outside the active
lookup order, and no `.reference/effect` alias exists. Active guidance names the
installed rc.108 declarations, installed `AGENTS.md`, and pinned v4 source.

Both published packages receive a patch Changesets entry. The final supported
Node 22 release-candidate command is:

```bash
mise exec node@22.22.2 -- pnpm check-all
```

It passed on the final tree: strict Effect diagnostics checked 854 files with
zero errors or warnings, 515 dependency files had no cycles, all 289 test files
and 4,278 tests passed, and coverage was 99.57% statements, 99.01% branches,
99.25% functions, and 99.61% lines. No compatibility layers, suppressions, or
changes to diagnostic, architecture, duplication, no-mocks, complexity, or 99%
coverage gates were introduced.

## Closed-ledger maintenance rule

The controlled-red exception has ended. `pnpm check-all` is mandatory for every
subsequent release-ready change; new compiler, diagnostic, architecture, lint,
test, coverage, or packaging failures are ordinary blockers and must not be
recorded as deferred migration work.
