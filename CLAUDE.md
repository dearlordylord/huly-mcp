# Project Instructions

Rules are reflexive: when adding a rule, apply it immediately.

## Design Principle: LLM-First API

The primary consumer of this MCP server is an LLM coding agent, not a human developer. All design decisions — tool naming, parameter shapes, description writing, error messages, defaults — must optimize for LLM comprehension and single-call correctness. Prefer fewer tool calls with clear semantics over multi-step protocols. Auto-resolve identifiers where possible rather than requiring the caller to decompose them. Write tool descriptions as if the reader has no documentation beyond the schema and the description string.

## Project Harness (COPY TO NEW PROJECTS)

This project's quality harness is the reference template for new TypeScript/Effect projects.
When setting up a new project from this one, ALL of these components must be copied:

1. **Test coverage** (`vitest.config.ts`): v8 provider, 99% thresholds, `test:coverage` script. Requires `@vitest/coverage-v8` dev dep.
2. **Code duplication** (`.jscpd.json` + `jscpd src` in lint script): threshold 2%, console reporter.
3. **Circular dependency detection** (`madge --circular` in `circular` script): catches import cycles.
4. **Pre-commit hooks** (`.husky/pre-commit`): lint-staged + gitleaks secrets scanning.
5. **check-all** (`pnpm check-all`): build + typecheck + lint (eslint + jscpd) + test. Gate for all work.
6. **Effect testing** (`@effect/vitest`): Effect-aware test runner integration.
7. **ESLint** (`@effect/eslint-plugin`, `eslint-plugin-functional`, `@effect/dprint`): formatting + lint.

Missing any of these degrades the quality gate. Coverage and duplication detection are especially easy to forget.

## Package Manager

Use `pnpm`, not npm. Prefer package.json scripts over raw commands (e.g., `pnpm typecheck` not `pnpm tsc --noEmit`).

## Verification

Run before considering work complete:
1. `pnpm check-all` (runs build, typecheck, lint, test)
2. Integration tests against local Huly (Docker) — **required** for any new feature, major change, or pre-release. Do not defer to the user; run them yourself. See `INTEGRATION_TESTING.md` for test patterns and `CLAUDE.local.md` for credentials/setup.

## Type Safety

Type casts (`as T`) are a sin. Avoid them. All data crossing system boundaries (APIs etc.) must be strongly typed with Effect Schema.

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

## Manual Testing (stdio)

```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}' | \
HULY_URL=... HULY_EMAIL=... HULY_PASSWORD=... HULY_WORKSPACE=... timeout 5 node dist/index.cjs
```

Use short timeouts (5s) - MCP keeps connection open.

## Worktrees

Worktrees symlink `node_modules` to the main tree. `.gitignore` must use `node_modules` (no trailing slash) — trailing slash only matches directories, not symlinks, so `git add .` will commit the symlink.

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
