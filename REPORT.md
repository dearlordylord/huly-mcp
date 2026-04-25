# Huly MCP Architecture And Code Practices Report

Date: 2026-04-08
Repository: `/workspace/typescript/hulymcp`

Update 2026-04-25: this report is historical. Later hardening work addressed several findings called out below, including relation result brands, time/workspace wire-schema brands, custom-field decoded metadata adapters, closed custom-field type names, and test-management shared fallback helper consolidation. Treat remaining unchecked items in `plans/architecture-hardening-plan.md` as the current source of truth.

## Scope

This report is a repo-wide audit of:

- architecture and layer boundaries
- code practices against `CLAUDE.md` and `.claude/review-rules.md`
- string-type adherence and primitive leakage
- cast usage and SDK-boundary typing discipline
- quality harness completeness

This is an audit report, not a refactor pass. No production code behavior was changed here.

## Immediate Status

- `AGENTS.md` already exists and is a symlink to `CLAUDE.md`
- source footprint: 131 `src/**/*.ts` files, 66 `test/**/*.ts` files
- source size: 26,016 lines under `src/`
- tool groups exposed through MCP: 22
- quality harness pieces required by project instructions are present:
  - `vitest.config.ts` with v8 coverage and 99% thresholds
  - `.jscpd.json`
  - `madge` script in `package.json`
  - `.husky/pre-commit`
  - `check-all` script
  - `@effect/vitest`
  - Effect + functional ESLint stack

## Executive Summary

The project has a strong top-level architecture. The main path is coherent:

1. Effect config and client layers in `src/index.ts`
2. MCP transport/server boundary in `src/mcp/`
3. tool registry and handler factories in `src/mcp/tools/`
4. domain schemas in `src/domain/schemas/`
5. Huly operations in `src/huly/operations/`
6. Huly transport/client wrappers in `src/huly/*.ts`

That basic split is sound and is better than average for an MCP server. The schema-first parse path and the tool handler factories are especially good.

The main quality debt is not architectural confusion. It is local erosion at the SDK boundary:

- primitive `string` values are reintroduced after schema parsing
- several result interfaces discard existing branded/domain types
- dynamic `Record<string, unknown>` access is concentrated in a few modules
- some helper modules use mutation patterns the repo’s own review rules disallow

In short: the system shape is good, but type precision weakens in hotspots.

## Architecture Assessment

### What is working well

- `src/index.ts` composes config, telemetry, client layers, and lazy/eager startup cleanly.
- `src/mcp/server.ts` keeps transport concerns separate from domain operations.
- `src/mcp/tools/registry.ts` centralizes parse, service provision, effect execution, and MCP response shaping. This is a strong abstraction.
- `src/domain/schemas/` is the right place for external contract definitions and is used consistently for tool input decoding.
- `src/huly/operations/` is organized by domain area and keeps tool definitions thin.
- `src/domain/schemas/shared.ts` already contains a substantial branded-type vocabulary. The project is not missing the concept of domain strings; it is missing consistent propagation of them.

### Structural strengths

- Tool input validation is schema-backed instead of ad hoc.
- Error mapping is centralized.
- Client capabilities are split by responsibility: workspace, storage, main Huly client.
- README tool docs are generated from source, which reduces drift.
- Tests are broad and coverage thresholds are aggressively high.

### Structural weaknesses

- `src/domain/schemas/index.ts` is 1,061 lines and acts as a mega-barrel. It is mechanically fine, but it is now a scale hotspot for discoverability and merge pressure.
- Several feature modules combine domain translation, SDK quirks, identifier resolution, and business logic in one file, especially under `src/huly/operations/`.
- Workspace result types and some relation/custom-field result types are not schema-backed at runtime, even though they cross the MCP boundary.

## Findings

### High

#### 1. Primitive string leakage is concentrated in feature result types that already have domain replacements

This violates the project review rule: “No bare primitives for domain values.”

Examples:

- `src/domain/schemas/relations.ts:65-89`
  - `RelationEntry.identifier`, `_id`, `_class`
  - `DocumentRelationEntry.teamspace`, `_id`, `_class`
  - `AddIssueRelationResult.sourceIssue` and `targetIssue`
  - `RemoveIssueRelationResult.sourceIssue` and `targetIssue`
- `src/domain/schemas/custom-fields.ts:61-83`
  - `id`, `fieldId`, `objectId`, `ownerClassId`, `type`
- `src/domain/schemas/time.ts:24-29`
  - `WorkSlot.id` is `string` despite the shared schema already defining branded IDs for this domain family
- `src/domain/schemas/time.ts:214-226`
  - `CreateWorkSlotResult.slotId` and `StopTimerResult.reportId` fall back to bare `string`
- `src/domain/schemas/workspace.ts:35-73` and `:198-204`
  - `url`, `name`, `version`, `mode`, `socialLinks`, and several profile fields remain plain strings despite the project already branding comparable identifier and constrained-string concepts

Impact:

- downstream code loses semantic information after parsing
- identical runtime strings from different domains become interchangeable in TypeScript
- the repo’s strongest type-safety asset, `shared.ts`, is not fully leveraged

Recommendation:

- define and apply additional branded aliases where values have stable domain meaning
- prioritize IDs and cross-tool identifiers first
- then normalize returned result shapes so MCP outputs preserve branded types internally before final JSON encoding

#### 2. `custom-fields` is the most type-eroded production hotspot

`src/huly/operations/custom-fields.ts:51-64`, `:81-84`, `:103`, `:114-120`, `:155-166`, `:214-226`

This file contains the densest concentration of:

- `as unknown as Record<string, unknown>`
- `as string`
- weak `typeName: string`
- raw dynamic object reads from SDK documents

This is partly justified by the Huly SDK shape, but the current boundary is too wide. The dynamic inspection logic is spread across the entire module instead of being isolated once and then re-exposed as typed decoders.

Specific problems:

- `describeType(type: Record<string, unknown>)` returns `typeName: string` instead of a closed union.
- `attr.attributeOf as string` is repeated rather than normalized once.
- `doc as unknown as Record<string, unknown>` exposes the entire document body as an untyped map.
- `SetCustomFieldParamsSchema.value` is forced to `Schema.String`, then reparsed later by `parseValueForType`.

Impact:

- boundary typing is weaker exactly where arbitrary external metadata is handled
- custom field behavior is harder to extend safely
- callers cannot rely on precise type information for custom field metadata

Recommendation:

- introduce a dedicated decoded shape for the custom-attribute metadata boundary
- narrow `typeName` to a literal union like `"string" | "number" | "boolean" | "enum" | "array" | "ref" | "date" | "markup" | "unknown"`
- isolate unsafe SDK reads in one adapter function per document shape

### Medium

#### 3. `toRef` is the central cast escape hatch, but its parameter is too weak

`src/huly/operations/shared.ts:17-20`

```ts
export const toRef = <T extends Doc>(id: string): Ref<T> => id as Ref<T>
```

The cast is acknowledged and documented, which is good. The issue is that the helper accepts any `string`, so once a value reaches it, the compiler cannot distinguish a validated domain identifier from arbitrary text.

Impact:

- all branded ID precision is erased before the Huly SDK boundary
- accidental cross-domain ID mixing becomes easier

Recommendation:

- accept a narrower branded input where possible
- consider `NonEmptyString`-level branded inputs or domain-specific identifier types before conversion
- keep one unavoidable cast, but move more validation before the cast

#### 4. Test-management shared helpers violate the repo’s own immutability rule

`src/huly/operations/test-management-shared.ts:121-250`

The finder helpers use the repeated pattern:

- `let project = ...`
- `if undefined, reassign with fallback query`

This directly conflicts with `.claude/review-rules.md`:

- “No `let` for conditional assignment”

This is not catastrophic, but it is a consistency failure in a shared helper file used by multiple features.

Recommendation:

- rewrite these helpers as `Effect.flatMap` chains or small local functions returning early
- one helper like `findByIdOrNameInSpace` would remove the repetition entirely

#### 5. Workspace outputs are useful but under-modeled

`src/huly/operations/workspace.ts:57-58`, `:76`, `:111-127`, `:139-146`, `:173-196`, `:205-257`

The workspace module is operationally clean, but several outputs collapse into plain strings:

- `formatVersion(...): string`
- local destructuring typed as `{ email: string | undefined; name: string | undefined }`
- schema interfaces with `url: string`, `name: string`, `mode?: string`, `socialLinks?: { [x: string]: string }`

This is a good candidate for a “precision pass” because the workflow itself is stable.

Recommendation:

- introduce branded or literal-backed types for workspace URLs, mode, and profile link maps where possible
- if runtime validation is intentionally skipped for internal result types, document that boundary explicitly in the report and code comments

#### 6. Relation result types discard existing identifier semantics

`src/domain/schemas/relations.ts:65-95` and `src/huly/operations/relations.ts:221-266`

The relation params are well-typed on input using `ProjectIdentifier`, `IssueIdentifier`, and `RelationType`. The output types then widen back to plain strings.

This is a classic parse-precise / return-loose mismatch.

Recommendation:

- define typed result interfaces using the existing identifier brands
- use a dedicated brand or alias for Huly class IDs if they are intentionally exposed

### Low

#### 7. The shared schema layer is strong, but propagation is inconsistent

`src/domain/schemas/shared.ts` already defines:

- branded Huly refs
- human-readable identifiers
- constrained string domains
- workspace/account identifiers
- numeric brands

This is a major asset. The issue is adoption consistency, not missing infrastructure.

Recommendation:

- make “if a brand exists in `shared.ts`, use it” an explicit review checklist item during refactors

#### 8. Source comments are mostly useful, but a few files rely on broad file-level exceptions

Example:

- `src/huly/operations/custom-fields.ts:1`

The top-level eslint-disable comment is technically honest, but broad file-level suppression makes it easier for additional unsafe casts to accumulate later.

Recommendation:

- prefer narrower helper-level containment for SDK-boundary casts

#### 9. One TODO remains in production code

- `src/huly/operations/time.ts:67`

This is minor, but production TODOs should either become tracked issues or be resolved.

## String-Type Adherence Review

### Overall grade

Moderate, with good foundations and inconsistent enforcement.

### Evidence in favor

- many tool params already use branded types from `shared.ts`
- several literal domains are modeled correctly with `Schema.Literal(...)`
- identifier-heavy paths like issues and relations start from branded input schemas

### Evidence against

- broad search found 305 `as` occurrences in `src/` alone
- many are harmless `as const`, but several important ones are true type escapes
- multiple result interfaces revert to `string` for IDs and domain values
- `Record<string, unknown>` and `Map<string, string>` are used for domain-carrying data where more precise map/value types should exist

### Priority targets for tightening

1. `custom-fields`
2. `relations`
3. `workspace`
4. `time`
5. shared identifier bridges in `src/huly/operations/shared.ts`

## Cast Review

### Casts that appear justified

- `src/huly/operations/shared.ts:20`
  - central `Ref<T>` bridge for the Huly SDK
- `src/huly/operations/shared.ts:68`
  - `PersonUuid` after regex validation
- `src/huly/operations/relations.ts:83-122` and `:143-187`
  - `DocumentUpdate<HulyIssue>` casts around `$push`/`$pull` SDK typing limits
- `src/huly/test-management-classes.ts`
  - class-ref constants for external SDK classes

### Casts that deserve follow-up

- `src/huly/operations/custom-fields.ts`
  - repeated dynamic record casts
- `src/huly/operations/test-management-shared.ts:56-105`
  - reverse-enum maps typed through `Record<string, ...>`
- `src/huly/operations/channels.ts`
  - string maps and social ID/ref bridging
- `src/huly/operations/calendar-shared.ts`
  - server-populated sentinel values via casts

## Code Practices Review

### Aligned with project guidance

- package manager and scripts are `pnpm`-first
- `check-all` exists and matches the documented gate
- pre-commit includes `lint-staged` and `gitleaks`
- tool descriptions are written for LLM comprehension, not human-only docs
- README generation from tool definitions supports the LLM-first API principle

### Partially aligned

- boundary typing is strong on inputs, weaker on outputs
- comments are usually explanatory, but file-level suppressions are sometimes broader than necessary
- immutability discipline is inconsistent in helper modules

### Misaligned

- “No bare primitives for domain values” is not enforced consistently in result interfaces
- “No `let` for conditional assignment” is violated in shared helper code

## Quality Harness Review

Present and correct:

- `package.json`
  - `check-all`, `circular`, `test:coverage`, `prepublishOnly`
- `vitest.config.ts`
  - v8 provider, 99% thresholds
- `.jscpd.json`
  - 2% threshold
- `.husky/pre-commit`
  - updates README, runs lint-staged, runs gitleaks

One observation:

- `typecheck` in `package.json` intentionally filters compiler output to `src/|test/`. That may be deliberate, but it also means non-source typing regressions can be hidden if they surface elsewhere.

## Recommended Refactor Order

### Phase 1: tighten domain outputs

- replace bare ID strings in `relations`, `custom-fields`, `time`, and `workspace` result types with brands or named aliases
- add missing constrained string aliases where stable domains already exist

### Phase 2: isolate SDK dynamic boundaries

- introduce dedicated decoder/adapter helpers for custom field metadata and similar dynamic Huly documents
- keep `Record<string, unknown>` inside those adapters only

### Phase 3: remove low-signal mutation

- refactor `test-management-shared` finder helpers to pure/early-return patterns
- refactor `workspace.updateGuestSettings` to avoid `let updated`

### Phase 4: split a few scale hotspots

- consider splitting `src/domain/schemas/index.ts` by export area or generating it
- consider extracting common “find by id or name” helpers across operations modules

## Bottom Line

The project architecture is healthy. The main weakness is not system design but inconsistent follow-through on the project’s own type-discipline rules after values cross the Huly SDK boundary.

If you want the next highest-value engineering move, it is not another feature. It is a focused “domain string and cast containment” pass across:

- `src/huly/operations/custom-fields.ts`
- `src/domain/schemas/custom-fields.ts`
- `src/domain/schemas/relations.ts`
- `src/domain/schemas/time.ts`
- `src/domain/schemas/workspace.ts`
- `src/huly/operations/test-management-shared.ts`

That would materially improve correctness, reviewability, and future agent reliability without changing the overall architecture.
