# Project Instructions

Rules are reflexive: when adding a rule, apply it immediately.

## Design Principle: LLM-First API

The primary consumer of this MCP server is an LLM coding agent, not a human developer. All design decisions — tool naming, parameter shapes, description writing, error messages, defaults — must optimize for LLM comprehension and single-call correctness. Prefer fewer tool calls with clear semantics over multi-step protocols. Auto-resolve identifiers where possible rather than requiring the caller to decompose them. Write tool descriptions as if the reader has no documentation beyond the schema and the description string.

## Project Harness (COPY TO NEW PROJECTS)

This project's quality harness is the reference template for new TypeScript/Effect projects.
When setting up a new project from this one, ALL of these components must be copied:

1. **Test coverage** (`vitest.config.ts`): v8 provider, 99% thresholds, `test:coverage` script. Requires `@vitest/coverage-v8` dev dep.
2. **Code duplication** (`.jscpd.json` + `jscpd src` in lint script): threshold 2%, console reporter.
3. **Circular dependency detection** (`dpdm --exit-code circular:1` in `circular`, wired into `check-all`): catches import cycles while ignoring type-only dependencies.
4. **Cyclomatic complexity** (`oxlint.complexity.json`, wired into `check-all`): The lint gate caps classic McCabe complexity at 8 for all production TypeScript, with no suppression baseline.
5. **Pre-commit hooks** (`.husky/pre-commit`): lint-staged + gitleaks secrets scanning.
6. **check-all** (`pnpm check-all`): build + TypeScript 7 and Effect diagnostics + circular + complexity + lint (Oxlint + jscpd) + test. Gate for all work.
7. **Effect testing** (`@effect/vitest`): Effect-aware test runner integration.
8. **Effect language-service diagnostics** (`effect-tsgo diagnostics --project tsconfig.json --strict --severity error,warning`): run through `@effect/tsgo` as part of `typecheck` without patching TypeScript; Effect errors and warnings fail the gate.
9. **Oxc lint and formatting** (`.oxlintrc.json` + `oxlint-tsgolint` + `dprint.json` with `dprint-plugin-oxc`): type-aware Oxlint plus Oxc formatting through dprint, without the ESLint runtime. Project-only architectural rules live in `scripts/oxlint-project-plugin.mjs`.
10. **Property test placement**: fast-check/property-based tests live in `*.property.test.ts` files only. Oxlint must reject `fast-check` imports in ordinary `*.test.ts` files so generated tests stay discoverable and reviewable as a distinct test class.
11. **Strict TypeScript 7 baseline** (`@typescript/native` + `tsconfig.json`): project typechecking uses TypeScript 7 with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`. The `typescript-compiler-api` alias is TypeScript 5 used only by the README AST generator because the native TypeScript 7 package does not expose the JavaScript compiler API.

Missing any of these degrades the quality gate. Coverage and duplication detection are especially easy to forget.

Line-count limits are architecture signals. If `max-lines` fails, split the file along a coherent module boundary; do not shave, compress, alias, or otherwise game individual lines just to get under the threshold.

## Package Manager

Use `pnpm`, not npm. Prefer package.json scripts over raw commands (e.g., `pnpm typecheck` not `pnpm tsc --noEmit`).

## Verification

Run before considering work complete:
1. `pnpm check-all` (runs build, typecheck, circular, lint, test)
2. Integration tests against local Huly (Docker) — **required** for any new feature, major change, or pre-release. Do not defer to the user; run them yourself. See `INTEGRATION_TESTING.md` for test patterns and `CLAUDE.local.md` for credentials/setup.

### Local Huly from This Container

This checkout normally runs inside a container. `.env.local` is shared with host-side workflows and may contain `HULY_URL=http://localhost:8087`; inside the container that localhost is the container itself, not the host Huly nginx. In this environment:

- `host.docker.internal` resolves and reaches local Huly.
- `docker.host.local` does not resolve reliably.
- `localhost:8087` is not reachable from the container.

When running integration tests from this container, source `.env.local` and override the URL for the command:

```bash
pnpm build
set -a && source .env.local && set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh
```

Integration preflight rejects cross-platform `node_modules` before fixture writes.

If the container has instead been attached to the Huly Docker network, the `NODE_OPTIONS="-r ./scripts/container-patch.cjs"` path documented in `INTEGRATION_TESTING.md` is also valid.

## Type Safety

Type casts (`as T`) are a sin. Avoid them. All data crossing system boundaries (APIs etc.) must be strongly typed with Effect Schema.

### Schema as Source of Truth at I/O Boundaries

At every I/O boundary, Effect Schema owns the payload contract. Examples include MCP tool input/output, HTTP requests and responses, database records, SDK DTOs, files, environment/config, and serialized cache/storage data.

For boundary payloads, define the schema first and derive the TypeScript type from it:

```ts
export const FooSchema = Schema.Struct({ ... })
export type Foo = Schema.Schema.Type<typeof FooSchema>
```

This keeps the runtime codec, JSON schema, parser/encoder, and TypeScript type tied to one source of truth.

Hand-written interfaces are reserved for internal-only ports, services, and implementation details that are not parsed, encoded, serialized, or exposed across an I/O boundary. When a boundary-adjacent type is intentionally not schema-derived, leave a short comment explaining why the schema is not the owner of that shape.

### Optional Boundary Fields

With `exactOptionalPropertyTypes`, handwritten `field?: T | undefined` usually means the code is modeling Effect Schema's default `Schema.optional(T)` behavior manually.

For schema-owned payloads, let the schema derive that type. Mappers should usually omit absent output fields rather than materialize explicit `undefined` values. When explicit `undefined` is not part of the accepted contract, use `Schema.optionalKey(T)` for an exact optional field.

### Parse, Don't Validate

Boundary code must turn unknown or less-structured input into domain types as early as practical. Do not validate a raw DTO or primitive and then pass the raw value onward; pass the parsed/refined value so downstream code can rely on what was learned.

Use names that preserve meaning:
- `parseX(input)` for untrusted or less-structured input that returns a typed value or typed parse error.
- `makeX(...)` / `createX(...)` for smart constructors from already-typed pieces.
- `isX(value): boolean` only for true predicates.

Avoid `validateX` when the function returns a refined value. It parsed something.

Effect Schema is the default boundary parser. Use schemas at system edges and MCP tool boundaries; core/application logic should receive parsed domain input instead of repeatedly revalidating the same facts. Expected parse, domain, authorization, integration, and persistence failures must stay in typed Effect error channels. Throwing/rejected promises are only for defects, framework-required behavior, or startup/bootstrap failures.

### Functional Core, Imperative Shell

Keep reusable behavior out of protocol handlers and SDK glue. The functional core contains domain logic, parsers, state transitions, target resolution, projection/mapping decisions, and other deterministic decisions. It should avoid I/O, hidden dependencies, ambient time/randomness, thrown expected failures, and MCP/HTTP/stdin framework concerns.

The imperative shell owns Effect sequencing, Huly SDK calls, storage/network I/O, config loading, telemetry, resource lifetime, and protocol translation. Entrypoints should parse protocol-specific input, call shared modules with parsed domain values, and render protocol-specific output. Do not duplicate business rules in MCP handlers when a shared operation can own them.

### Config and Resource Boundaries

Parse configuration at startup or the earliest request boundary into typed config with redacted secret values. Do not read `process.env` throughout the app. Missing or invalid config is a typed startup/request-boundary failure with useful context.

Secrets such as tokens, passwords, API keys, and credential headers must be wrapped in `Redacted` at the boundary and unwrapped only inside the adapter that needs the raw value. Do not put raw secrets in errors, logs, traces, snapshots, diagnostics, or tool results.

Avoid top-level side effects except in true entrypoint/bootstrap files. Modules must not start servers, open connections, read env, register handlers, or perform I/O at import time. Resource creation and cleanup should be explicit and owned by bootstrap/imperative-shell code or Effect layers/scopes.

## No Test Mocks

Test mocks are banned. Do not use `vi.mock`, `vi.doMock`, `vi.hoisted`, `vi.spyOn`, `vi.stubGlobal`, Jest-style `jest.mock`, or any module-level monkey-patching. If a test needs to substitute behavior, the subject must expose a dependency-injection seam — an Effect `Context.Service` provided via `Layer`, or a plain ports argument. Tests then provide a real stub implementation through that seam.

This applies to every side effect, including time. Code that reads the clock must depend on `Effect.Clock` (or a `Clock`-like service) rather than calling `Date.now()`, `performance.now()`, or `new Date()` directly. Tests supply a deterministic `TestClock` or equivalent stub via `Layer.provide`.

The intent: if a test cannot be written without reaching into another module's internals, that is a design signal — refactor the subject to accept its dependencies explicitly.

## Code Review

Code review agents must consult `.claude/review-rules.md` for project-specific quality gates.
<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult the project-pinned Effect references before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Read `docs/mcps/effect.md` for the authoritative lookup order
4. Read `node_modules/effect/AGENTS.md` for guidance shipped with the exact installed package
5. Search `.reference/effect-v4.0.0/` for exact target implementations and declarations

In secondary worktrees, `.reference` may exist only in the master checkout at `/workspace/typescript/hulymcp/.reference`. After creating a worktree, run `bash scripts/bootstrap-worktree.sh` to link ignored local resources (`node_modules`, `.reference`, `.env.local`, `CLAUDE.local.md`) from the master checkout when available. If `effect-solutions` is not on PATH, use the pinned references directly. Exact installed package declarations and pinned source override generic or globally installed skill guidance.

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Use the installed 4.0.0 declarations and the smallest relevant pinned source region. Never guess at Effect patterns.
<!-- effect-solutions:end -->

## Huly API Reference

**Source**: https://github.com/hcengineering/huly-examples/tree/main/platform-api

**Local clone**: `.reference/huly-examples/platform-api/` - examples showing API usage patterns

**Keep updated**: `cd .reference/huly-examples && git pull`

Key examples to reference:
- Issue management: `examples/issue-*.ts`
- Document operations: `examples/documents/document-*.ts`
- Contact/person handling: `examples/person-*.ts`

Search examples for real usage patterns when implementing MCP tools.

## Huly API Gotchas

**Eventual consistency**: Huly's client does not see its own writes immediately within the same session. `findOne`, `addCollection` (resolves `attachedTo` ref internally), and other read-after-write patterns will hang or return stale data if the target document was just created.

**Query typing**: Huly's SDK `DocumentQuery<T>` permits arbitrary string keys. Use `hulyQuery<T>()` for new or changed direct `client.findAll` / `client.findOne` query object literals, and use `StrictDocumentQuery<T>` for mutable query builders before passing them through `hulyQuery`. This catches invented fields such as `"blockedBy._id"` locally. If a dynamic or intentionally escaped query must bypass this helper, document the Huly behavior being relied on at the call site.

## Manual Testing (stdio)

```bash
echo '{"jsonrpc":"2.0","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"test","version":"1.0"}}},"id":2}' | \
HULY_URL=... HULY_EMAIL=... HULY_PASSWORD=... HULY_WORKSPACE=... timeout 5 node dist/index.cjs
```

Use short timeouts (5s) - MCP keeps connection open.

## Worktrees

Worktrees symlink `node_modules` and `.reference` to the main tree. `.gitignore` must use `node_modules` and `.reference` (no trailing slash) — trailing slash only matches directories, not symlinks, so `git add .` will commit the symlink.

When the checkout or `node_modules` is shared with another platform (for example, macOS and a Linux container), do not reinstall dependencies in the shared tree. Use an isolated checkout with its own platform-local dependencies for verification. A container reinstall can remove dependencies or replace native binaries while a host release is building.
After creating a secondary worktree, run `bash scripts/bootstrap-worktree.sh` from that worktree. This links ignored local resources from `/workspace/typescript/hulymcp`, including `node_modules`, `.reference`, `.env.local`, and `CLAUDE.local.md`, so Effect and Huly reference material remains available outside the master checkout.

Before deleting a worktree or branch, always check for uncommitted changes (`git status`) and unmerged commits (`git log <branch> --not master`) first. Never force-delete without verifying all work is integrated.

After merging a worktree branch, verify the merge commit actually landed (`git log --oneline -1`) and that CODE_SMELLS.md updates are staged — don't leave integration work uncommitted.

## Formatting

Formatting is handled by Oxc through `dprint-plugin-oxc` (included in `pnpm lint`).

- `pnpm format` — auto-format TypeScript files with Oxc
- `pnpm check-format` — check formatting without writing

## Publishing

Versioning uses [Changesets](https://github.com/changesets/changesets):

1. `npx changeset` — describe changes (creates a changeset file)
2. `pnpm local-release` — version bump + publish

`prepublishOnly` runs `pnpm check-all` automatically before publish.

Package: `@firfi/huly-mcp` on npm.

## Dalph delivery for issues 306–311

Dalph owns task and integration worktrees and the issue dependency frontier. Implement only the task specified by the title and body in your supplied task specification. The immutable RunTarget URL points to overall closure root311, not necessarily your assigned task. Never infer your task identity from that URL. Do not create competing orchestration or manually close issues. You are not alone in this codebase; accommodate others' changes and do not revert them.

Task identity and prerequisite mapping:

| Issue | Supplied task title | Immediate prerequisites |
| --- | --- | --- |
|306|Unify destination-based movement within a project|none|
|307|Move a compatible leaf issue across projects with verifiable outcomes|306|
|308|Preserve task-owned records during project movement|307|
|309|Resolve project attribute conflicts through an actionable retry|307|
|310|Move complete issue trees with all descendant data and conflicts|308 and309|
|311|Detect concurrent movement changes and expose verified outcomes|310|

306 is already accepted and promoted at200075a4e86c21791130d57277bb252203b403a6. Do not recover or reimplement306. Task307 needs306 only; issues308–311 are future work, not307 prerequisites. Read your supplied task specification fully, consult parent305, and preserve every acceptance criterion. Cached original issue bodies are available in /tmp/hulymcp-dalph-306-311/issues/305.json through311.json. Prefer gh api repos/dearlordylord/huly-mcp/issues/NNN for fresh REST reads when gh issue view's GraphQL quota is restricted. A failed auxiliary fetch does not change your assigned task.

Before acceptance, invoke $code-review against the immutable base_sha from the Dalph task prompt. Use separate parallel Standards and Spec reviewer sub-agents. Consult .claude/review-rules.md and parent GitHub issue305 in addition to your task issue. Record both review reports and validation evidence in docs/implementation/issue-NNN.md. Resolve blocking findings before returning an accepted commit.

## User-directed validation cadence: live integration only at the end

The user explicitly changed the integration cadence: run live Huly integration only after all six306–311 slices are implemented and integrated. This overrides earlier per-feature and per-slice integration scheduling instructions in this checkout and linked issues. Keep every behavioral acceptance criterion; defer its real-server execution evidence to final certification, rather than discarding the requirement. Do not launch any new live Huly suite, including focused movement suites, during intermediate slices.

Each intermediate slice must pass pnpm check-all and fresh parallel Standards/Spec plus Dalph reviews. Implement complete unit/property coverage with existing injection seams, and author or extend executable real-Huly fixture cases covering every issue criterion for the final run. Record the final integration obligations and accurate evidence status in docs/implementation/issue-NNN.md. Intermediate code acceptance permits progression and integration; it does not certify final live behavior. Do not reject an otherwise passing intermediate implementation merely because its live evidence is scheduled at the end by the user.

After all six slices are integrated, the overall delivery must pass final check-all, all authored movement/transfer fixture suites through MCP and CLI, and clean whole-server MCP/full CLI regression suites on that final production candidate. The overseer owns long live suites because Dalph's opaque functions.exec command sessions have a600000ms lifetime limit. Dalph still owns implementation, reviews, worktrees and code integration. Any real-server defect found at final certification must be fixed and the relevant required checks rerun before overall completion.

306 passed fresh check-all:342 files,4810 tests, all coverage metrics99% or higher. Its report is docs/implementation/issue-306.md. Historical scoped real-Huly movement verification passed. Historical broad MCP had1441 passes and one document-edit missing-response failure; a focused diagnostic passed27 cases. Historical full CLI was intentionally interrupted. All historical live processes are stopped. These results are not final combined-candidate certification; the broad MCP failure remains a final regression obligation.

Bootstrap every generated worktree using bash scripts/bootstrap-worktree.sh /tmp/hulymcp-dalph-306-311/retry-repository. That repository has Linux-local dependencies. Never reinstall dependencies in the canonical shared checkout.

## Preserve accepted prerequisites in dependent worktrees

The production planner starts ordinary attempts at one configured base, even after prerequisite code is accepted and promoted. At the beginning of each dependent slice (307after306;308/309after307;310after308/309;311after310), inspect refs/heads/master in the shared repository and merge that accepted integration head into your own Dalph-owned worktree before implementation. Preserve the immutable planned base in your evidence. Do not import an unaccepted candidate or discard another worker's changes. If master lacks the accepted prerequisite, report the missing authority rather than rebuilding its API. Review both the complete planned-base diff and your delta from the observed prerequisite head. Dalph's integrator owns final integration and conflicts.
