# Plan: Architecture Hardening And Type Precision Pass

> Source report: [REPORT.md](/workspace/typescript/hulymcp/REPORT.md)
> Updated: 2026-04-25
> Status: architecture hardening items completed as of 2026-04-25; remaining unchecked items below are unvalidated SDK coverage backlog candidates, not accepted hardening scope.

## Current Status

This plan is no longer a fresh implementation plan. Several items were addressed by later work, but the original report findings are not fully closed.

Completed or mostly completed:

- Typed output and boundary work landed in later commits, including `cd60559 Harden typed outputs and SDK boundaries` and `3bab07d Validate encoded outputs for hardened tools`.
- Shared helper cleanup progressed in `24032db refactor huly operations helpers`.
- Guardrails improved through the no-mocks rule, stricter review guidance, and a working `pnpm check-all` path in a correctly provisioned environment.

Closed in the latest hardening pass:

- `custom-fields` now uses typed `typeDetails` branches correlated with the custom-field type while preserving the same JSON shape.
- `activity` now has branded secondary IDs and encoded output validation.
- `workspace` and `time` wire schemas preserve branded output IDs and constrained strings.
- `toRef` expectations are documented in reviewer guidance and covered by focused boundary tests.
- `REPORT.md` has been annotated with later fixes, so it should be treated as historical input, not as a current-state report.

## Architectural Decisions

Durable decisions that still apply:

- Keep the existing end-to-end flow intact: Effect config and service layers -> MCP server and registry -> domain schemas -> Huly operations -> Huly SDK clients.
- Continue decoding all MCP tool inputs through Effect Schema before reaching operations.
- Prefer extending and reusing `src/domain/schemas/shared.ts` branded types instead of inventing parallel aliases.
- Keep unsafe casts at explicit Huly SDK edges. Dynamic document inspection should be isolated in adapter/decoder helpers.
- Each implementation slice must cut through schema/result types, operation logic, MCP behavior, and tests.
- Each completed slice must pass `pnpm check-all`; behavior-changing Huly workflow slices also need live integration coverage.

## Phase 1: Typed Output Baseline

Status: complete as of 2026-04-25 for the originally identified relation, time, and workspace output hotspots.

What landed:

- Relation, custom-field, time, and workspace output contracts were hardened in later work.
- Encoded output validation was added for hardened tools.

Completed follow-up:

- [x] Re-audited relation outputs against current `src/domain/schemas/relations.ts`; relation result schemas now use branded/domain identifiers.
- [x] Re-audited small time-tracking return values in `src/domain/schemas/time.ts`; wire schemas now use `TimeSpendReportId` and `WorkSlotId`.
- [x] Confirmed the obvious newer custom-field, time, workspace, and relation tool outputs do not retain the original parse-precise / return-loose issues.
- [x] Annotated `REPORT.md` with the later fixes.

Acceptance criteria before closing:

- [x] Relation result types avoid bare strings wherever an existing identifier or class-name domain type is available.
- [x] Small time-tracking result types use existing branded IDs where appropriate.
- [x] JSON payloads remain backward-compatible.
- [x] Tests prove result typing and serialized output still match expectations.

## Phase 2: Custom Fields Boundary Containment

Status: complete for the originally identified boundary-containment issue.

What has already landed:

- `src/huly/operations/custom-fields.ts` now isolates dynamic SDK record inspection behind decoded adapter helpers.
- Custom-field type names are a closed domain with an explicit `unknown` case.
- Existing tests cover list, read, and set flows through that decoded boundary.
- Custom-field `typeDetails` is typed as a branch correlated with `type` for primitive, enum, array, ref, and unknown cases.
- Unknown custom-field type metadata is intentionally preserved for backward-compatible MCP output.

What to build:

Refactor the custom-fields vertical slice so dynamic Huly metadata is decoded once into narrow internal shapes, then used through typed helpers for listing fields, reading values, and setting values. Keep runtime behavior backward-compatible.

Acceptance criteria:

- [x] Dynamic SDK reads for custom-field metadata are isolated behind dedicated typed adapters.
- [x] Custom-field type names become a closed domain where practical, including an explicit `unknown` case if needed.
- [x] Custom-field result contracts become more precise without breaking MCP callers.
- [x] Tests cover list, read, and set flows through the new typed boundary.
- [x] `pnpm check-all` passes.

## Phase 3: Workspace And Time Precision Pass

Status: complete for the time/workspace wire-schema precision issues identified in this plan.

What landed:

- Time result schemas now preserve `TimeSpendReportId` and `WorkSlotId`.
- Workspace result schemas now preserve `WorkspaceUuid`, `WorkspaceName`, `UrlString`, `RegionId`, `WorkspaceVersion`, `WorkspaceMode`, `PersonUuid`, and `AccountId` where applicable.
- Runtime JSON payloads remain string-compatible.

What to build:

Apply the output-hardening pattern to the remaining workspace and time result surfaces. Tighten result interfaces, reduce anonymous string maps where possible, and preserve existing tool behavior.

Acceptance criteria:

- [x] Workspace result types use domain-specific identifiers and constrained-string aliases where stable and justified.
- [x] Time-tracking outputs stop widening known IDs back to `string`.
- [x] No new sentinel-string states are introduced.
- [x] Tool tests verify that refined types do not change successful runtime output.
- [x] `pnpm check-all` passes.

## Phase 4: Shared Helper Discipline

Status: complete.

What landed:

- Shared operation helpers have been refactored since this plan was written.
- Cast justifications and SDK-boundary comments are more explicit than when `REPORT.md` was written.
- `toRef` is documented as an SDK boundary conversion; focused tests pass decoded domain values or existing SDK refs rather than raw user text.

Completed follow-up:

- [x] Re-audited `src/huly/operations/test-management-shared.ts` fallback lookup helpers; they now use the shared `findByNameOrIdOrFail` helper instead of local `let`-based fallback reassignment.
- [x] Confirmed the test-management shared finders already use the reusable ID-or-name lookup helper without weakening not-found errors.

Acceptance criteria:

- [x] Shared reference-conversion helpers accept narrower inputs where practical.
- [x] Fallback lookup helpers avoid `let`-based conditional reassignment where practical.
- [x] Test-management shared finders match the style expected by `.claude/review-rules.md`.
- [x] Cast justifications remain explicit and limited to true SDK boundaries.
- [x] `pnpm check-all` passes.

## Phase 5: Guardrails And Regression Proof

Status: complete for architecture hardening guardrails.

What landed:

- The project bans test mocks and module monkey-patching.
- Review guidance and lint rules now make several architecture regressions harder.
- `pnpm check-all` runs cleanly in this workspace/container.

Remaining work:

- No open architecture-hardening work remains in this plan. Treat the SDK coverage backlog below as separate product discovery scope.

Acceptance criteria:

- [x] Targeted tests cover the new typed result contracts and boundary helpers.
- [x] Documentation or reviewer guidance points contributors toward existing shared branded types.
- [x] The standard quality gate runs cleanly in a correctly provisioned environment.
- [x] The report’s high- and medium-severity findings are resolved or explicitly tracked elsewhere.

## Potential SDK Coverage Backlog

Status: not validated yet.

These are candidate gaps from a quick comparison against installed Huly SDK/plugin surfaces and local examples. They are not yet validated against live Huly behavior, user demand, or SDK write semantics. Do not treat them as committed scope until each item has a small PRD or issue with integration-test strategy.

- [ ] Not validated: direct-message creation and direct-message send/update/delete tools. Current tools list direct message conversations but message write coverage is channel-focused.
- [ ] Not validated: saved document tools, such as save document, unsave document, and list saved documents.
- [ ] Not validated: document snapshot/history tools using `DocumentSnapshot`.
- [ ] Not validated: calendar management tools for `Calendar`, `ExternalCalendar`, `Schedule`, and `PrimaryCalendar` objects.
- [ ] Not validated: richer attachment/media tools for SDK classes such as `Embedding`, `Drawing`, and `Photo`.
- [ ] Not validated: social identity and contact channel inspection tools for lower-level contact/account debugging.
- [ ] Not validated: card favorites, card roles, card sections, and card view defaults/extensions.
- [ ] Not validated: project/task descriptor management beyond the safe project type, task type, and issue status tools already implemented.
- [ ] Not validated: a carefully constrained raw read-only SDK inspection tool. This should remain read-only unless a separate safety design is approved.

Validation checklist for each backlog item:

- [ ] Confirm the SDK class shape and required fields from local examples, SDK types, or live workspace inspection.
- [ ] Decide whether the tool is LLM-first and safer as a single high-level operation rather than raw SDK access.
- [ ] Define cleanup-safe integration coverage, or explicitly document why only read-only integration is safe.
- [ ] Add schema-backed inputs and encoded output validation.
- [ ] Run `pnpm check-all`.
