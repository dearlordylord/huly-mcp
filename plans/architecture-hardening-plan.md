# Plan: Architecture Hardening And Type Precision Pass

> Source report: [REPORT.md](/workspace/typescript/hulymcp/REPORT.md)
> Updated: 2026-04-25
> Status: partially completed; keep this file until remaining open items are either implemented or moved to tracked issues.

## Current Status

This plan is no longer a fresh implementation plan. Several items were addressed by later work, but the original report findings are not fully closed.

Completed or mostly completed:

- Typed output and boundary work landed in later commits, including `cd60559 Harden typed outputs and SDK boundaries` and `3bab07d Validate encoded outputs for hardened tools`.
- Shared helper cleanup progressed in `24032db refactor huly operations helpers`.
- Guardrails improved through the no-mocks rule, stricter review guidance, and a working `pnpm check-all` path in a correctly provisioned environment.

Still open:

- `custom-fields` remains the clearest typed-boundary hotspot.
- `workspace` and `time` still have some widened string/result fields.
- Some shared helper and fallback lookup patterns still deserve a focused pass.
- `REPORT.md` has not been reconciled with the later fixes, so it should be treated as historical input plus unresolved findings, not as a current-state report.

## Architectural Decisions

Durable decisions that still apply:

- Keep the existing end-to-end flow intact: Effect config and service layers -> MCP server and registry -> domain schemas -> Huly operations -> Huly SDK clients.
- Continue decoding all MCP tool inputs through Effect Schema before reaching operations.
- Prefer extending and reusing `src/domain/schemas/shared.ts` branded types instead of inventing parallel aliases.
- Keep unsafe casts at explicit Huly SDK edges. Dynamic document inspection should be isolated in adapter/decoder helpers.
- Each implementation slice must cut through schema/result types, operation logic, MCP behavior, and tests.
- Each completed slice must pass `pnpm check-all`; behavior-changing Huly workflow slices also need live integration coverage.

## Phase 1: Typed Output Baseline

Status: mostly complete, but not re-audited after all later features.

What landed:

- Relation, custom-field, time, and workspace output contracts were hardened in later work.
- Encoded output validation was added for hardened tools.

Remaining work:

- [ ] Re-audit relation outputs against current `src/domain/schemas/relations.ts`.
- [ ] Re-audit small time-tracking return values in `src/domain/schemas/time.ts`.
- [ ] Confirm no newer tool reintroduced parse-precise / return-loose output contracts.
- [ ] Update `REPORT.md` or close the relevant findings in a tracked issue.

Acceptance criteria before closing:

- [ ] Relation result types avoid bare strings wherever an existing identifier or class-name domain type is available.
- [ ] Small time-tracking result types use existing branded IDs where appropriate.
- [ ] JSON payloads remain backward-compatible.
- [ ] Tests prove result typing and serialized output still match expectations.

## Phase 2: Custom Fields Boundary Containment

Status: open.

Why it remains open:

- `src/huly/operations/custom-fields.ts` still contains dynamic `Record<string, unknown>` handling.
- `src/domain/schemas/custom-fields.ts` still exposes `typeDetails: Record<string, unknown>`.
- Custom-field metadata is still the highest-value place to isolate SDK dynamic shapes behind typed adapters.

What to build:

Refactor the custom-fields vertical slice so dynamic Huly metadata is decoded once into narrow internal shapes, then used through typed helpers for listing fields, reading values, and setting values. Keep runtime behavior backward-compatible.

Acceptance criteria:

- [ ] Dynamic SDK reads for custom-field metadata are isolated behind dedicated typed adapters.
- [ ] Custom-field type names become a closed domain where practical, including an explicit `unknown` case if needed.
- [ ] Custom-field result contracts become more precise without breaking MCP callers.
- [ ] Tests cover list, read, and set flows through the new typed boundary.
- [ ] `pnpm check-all` passes.

## Phase 3: Workspace And Time Precision Pass

Status: partially complete.

Why it remains open:

- `workspace` is operationally clean but still has some widened strings and anonymous maps.
- `time` has improved coverage and typed outputs, but should be re-audited for IDs that still widen back to `string`.

What to build:

Apply the output-hardening pattern to the remaining workspace and time result surfaces. Tighten result interfaces, reduce anonymous string maps where possible, and preserve existing tool behavior.

Acceptance criteria:

- [ ] Workspace result types use domain-specific identifiers and constrained-string aliases where stable and justified.
- [ ] Time-tracking outputs stop widening known IDs back to `string`.
- [ ] No new sentinel-string states are introduced.
- [ ] Tool tests verify that refined types do not change successful runtime output.
- [ ] `pnpm check-all` passes.

## Phase 4: Shared Helper Discipline

Status: partially complete.

What landed:

- Shared operation helpers have been refactored since this plan was written.
- Cast justifications and SDK-boundary comments are more explicit than when `REPORT.md` was written.

Remaining work:

- [ ] Re-audit `toRef` usage and confirm each call is either fed by a validated domain value or clearly at an SDK boundary.
- [ ] Re-audit `src/huly/operations/test-management-shared.ts` fallback lookup helpers for avoidable reassignment and duplication.
- [ ] Prefer reusable ID-or-name lookup helpers where they reduce repeated control flow without weakening error messages.

Acceptance criteria:

- [ ] Shared reference-conversion helpers accept narrower inputs where practical.
- [ ] Fallback lookup helpers avoid `let`-based conditional reassignment where practical.
- [ ] Test-management shared finders match the style expected by `.claude/review-rules.md`.
- [ ] Cast justifications remain explicit and limited to true SDK boundaries.
- [ ] `pnpm check-all` passes.

## Phase 5: Guardrails And Regression Proof

Status: partially complete.

What landed:

- The project bans test mocks and module monkey-patching.
- Review guidance and lint rules now make several architecture regressions harder.
- `pnpm check-all` runs cleanly in this workspace/container.

Remaining work:

- [ ] Reconcile `REPORT.md` with completed work, or convert remaining findings into tracked issues.
- [ ] Add focused regression tests for any new adapter/helper boundaries introduced by Phases 2-4.
- [ ] Document the current branded-type expectation in contributor/reviewer guidance if it is not already clear enough.

Acceptance criteria:

- [ ] Targeted tests cover the new typed result contracts and boundary helpers.
- [ ] Documentation or reviewer guidance points contributors toward existing shared branded types.
- [ ] The standard quality gate runs cleanly in a correctly provisioned environment.
- [ ] The report’s high- and medium-severity findings are resolved or explicitly tracked elsewhere.

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
