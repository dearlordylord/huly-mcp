# Project Instructions

Rules are reflexive: when adding a rule, apply it immediately.

## Design Principle: LLM-First API

The primary consumer of this MCP server is an LLM coding agent, not a human developer. All design decisions — tool naming, parameter shapes, description writing, error messages, defaults — must optimize for LLM comprehension and single-call correctness. Prefer fewer tool calls with clear semantics over multi-step protocols. Auto-resolve identifiers where possible rather than requiring the caller to decompose them. Write tool descriptions as if the reader has no documentation beyond the schema and the description string.

## Project Harness (COPY TO NEW PROJECTS)

This project's quality harness is the reference template for new TypeScript/Effect projects.
When setting up a new project from this one, ALL of these components must be copied:

1. **Test coverage** (`vitest.config.ts`): v8 provider, 99% thresholds, `test:coverage` script. Requires `@vitest/coverage-v8` dev dep.
2. **Code duplication** (`.jscpd.json` + `jscpd src` in lint script): threshold 2%, console reporter.
3. **Circular dependency detection** (`madge --circular` in `circular` script, wired into `check-all`): catches import cycles.
4. **Pre-commit hooks** (`.husky/pre-commit`): lint-staged + gitleaks secrets scanning.
5. **check-all** (`pnpm check-all`): build + typecheck + circular + lint (eslint + jscpd) + test. Gate for all work.
6. **Effect testing** (`@effect/vitest`): Effect-aware test runner integration.
7. **ESLint** (`@effect/eslint-plugin`, `eslint-plugin-functional`, `@effect/dprint`): formatting + lint.
8. **Property test placement**: fast-check/property-based tests live in `*.property.test.ts` files only. ESLint must reject `fast-check` imports in ordinary `*.test.ts` files so generated tests stay discoverable and reviewable as a distinct test class.
9. **Strict TypeScript baseline** (`tsconfig.json`): `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`.

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

If the container has instead been attached to the Huly Docker network, the `NODE_OPTIONS="-r ./scripts/container-patch.cjs"` path documented in `INTEGRATION_TESTING.md` is also valid.

## Type Safety

Type casts (`as T`) are a sin. Avoid them. All data crossing system boundaries (APIs etc.) must be strongly typed with Effect Schema.

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

Test mocks are banned. Do not use `vi.mock`, `vi.doMock`, `vi.hoisted`, `vi.spyOn`, `vi.stubGlobal`, Jest-style `jest.mock`, or any module-level monkey-patching. If a test needs to substitute behavior, the subject must expose a dependency-injection seam — an Effect `Context.Tag` / `Effect.Service` provided via `Layer`, or a plain ports argument. Tests then provide a real stub implementation through that seam.

This applies to every side effect, including time. Code that reads the clock must depend on `Effect.Clock` (or a `Clock`-like service) rather than calling `Date.now()`, `performance.now()`, or `new Date()` directly. Tests supply a deterministic `TestClock` or equivalent stub via `Layer.provide`.

The intent: if a test cannot be written without reaching into another module's internals, that is a design signal — refactor the subject to accept its dependencies explicitly.

## Code Review

Code review agents must consult `.claude/review-rules.md` for project-specific quality gates.
<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `.reference/effect/` for real implementations (run `effect-solutions setup` first)

In secondary worktrees, `.reference/effect/` may exist only in the master checkout at `/workspace/typescript/hulymcp/.reference/effect/`. After creating a worktree, run `bash scripts/bootstrap-worktree.sh` to link ignored local resources (`node_modules`, `.reference`, `.env.local`, `CLAUDE.local.md`) from the master checkout when available. If `effect-solutions` is not on PATH, do not report that the Effect reference is missing until you have checked `/workspace/typescript/hulymcp/.reference/effect/`; search it directly with `rg` and read relevant files from there.

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
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
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}' | \
HULY_URL=... HULY_EMAIL=... HULY_PASSWORD=... HULY_WORKSPACE=... timeout 5 node dist/index.cjs
```

Use short timeouts (5s) - MCP keeps connection open.

## Worktrees

Worktrees symlink `node_modules` and `.reference` to the main tree. `.gitignore` must use `node_modules` and `.reference` (no trailing slash) — trailing slash only matches directories, not symlinks, so `git add .` will commit the symlink.
After creating a secondary worktree, run `bash scripts/bootstrap-worktree.sh` from that worktree. This links ignored local resources from `/workspace/typescript/hulymcp`, including `node_modules`, `.reference`, `.env.local`, and `CLAUDE.local.md`, so Effect and Huly reference material remains available outside the master checkout.

Before deleting a worktree or branch, always check for uncommitted changes (`git status`) and unmerged commits (`git log <branch> --not master`) first. Never force-delete without verifying all work is integrated.

After merging a worktree branch, verify the merge commit actually landed (`git log --oneline -1`) and that CODE_SMELLS.md updates are staged — don't leave integration work uncommitted.

## Formatting

Formatting is handled by `@effect/dprint` via ESLint (included in `pnpm lint`).

- `pnpm format` — auto-format files (dprint rules only)
- `pnpm check-format` — check formatting without writing

## Publishing

Versioning uses [Changesets](https://github.com/changesets/changesets):

1. `npx changeset` — describe changes (creates a changeset file)
2. `pnpm local-release` — version bump + publish

`prepublishOnly` runs `pnpm check-all` automatically before publish.

Package: `@firfi/huly-mcp` on npm.
