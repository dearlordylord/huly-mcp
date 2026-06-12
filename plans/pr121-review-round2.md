# Ralph Lane pr121-review-round2

Branch: `codex/status-model-fallback` (PR #121 — second review round; all tasks land in this PR)

## Context

Round-1 follow-ups (see `plans/pr121-review-followups.md`) were implemented and re-reviewed.
The re-review verified: `pnpm check-all` green (99.65% statements), the healthy-path wire
envelope correct (1 content block, `structuredContent` = `{result}` only), and the full
integration suite at **414 passed, 1 failed** — the single failure being a bug in the new
guard itself. This lane fixes the two blockers and all agreed design findings.

Lesson carried into this lane as a hard rule: **evidence over claims.** The round-1 guard
shipped inverted because the integration suite was not run (or its failure ignored) after
the change. Every task below that touches runtime or script behavior must end with the
full integration suite run and the `RESULTS:` line pasted into the commit message or
progress notes. "check-all is green" is not sufficient for seams the unit suite cannot
see (jq expressions, client-side MCP validation).

Execution order (maintainer-decided, deliberately not numeric): **task-1 → task-8 →
task-2 → tasks 3-7.** Task-1 first because it is the known false-failure and ten
minutes of work; until it lands the suite cannot read 0-failed at all. Task-8 second
because every later task's evidence rule depends on the suite's RESULTS line, and with
151 uncounted capture sites that instrument can swallow failures — calibrate the
measuring instrument before using it to verify tasks 2-7. If task-8's conversion
surfaces latent failures that were already happening silently, they belong to the
untouched baseline and must be triaged (and reported to the maintainer) before
proceeding, not attributed to later tasks.

**CHECKPOINT after task-8 (unconditional):** stop the lane after tasks 1 and 8 land —
even on a clean run — and hand back to the maintainer for a review checkpoint before
starting task-2. Bring as evidence: the before/after `RESULTS:` lines, the task-1 jq
sample tests (healthy/degraded), and the task-8 conversion diff. The reviewer will
re-verify the guard live in both directions and confirm the calibrated baseline; only
then do tasks 2-7 proceed. Then task-2 (blocker), then 3-7.

### Checkpoint resolution (reviewer findings + remaining instructions)

Reviewer verification ALREADY DONE — do not redo: working-tree diff of
`scripts/integration_test_full.sh` reviewed (jq guard is character-for-character the
tested expression; `run_capture_to_var VAR ...` + `if [ $? -eq 0 ]` preserves the old
exit-code flow; the script has no `set -e`, so bare helper calls cannot abort the run);
audits passed (`bash -n` OK; 0 counting `$(run_capture ` sites remain; the 16
`run_capture_only` command-substitution sites are untouched, correct since they are
non-counting by design; 193 `_to_var` helper calls present).

REMAINING — the agent must do, in order, before starting task-2:

1. Done: the tasks 1+8 script work was committed with this plan file's status updates.
2. Done: build (`pnpm build`) and run the FULL integration suite to completion against local
   Huly — from a devcontainer use
   `HULY_URL="${HULY_URL/localhost/host.docker.internal}"` per CLAUDE.md. Do not stop
   it early this time; the missing checkpoint evidence is exactly the final `RESULTS:`
   line on the calibrated script.
3. Done: acceptance met. `RESULTS: 559 passed, 0 failed, 27 skipped (of 586)`.
   The passed count is materially above the old 414.
4. Not applicable: no failures appeared.
5. Clean run satisfied the checkpoint — proceed directly to task-2 following the
   execution order above (2, then 3-7).

Original acceptance criteria retained for audit:
3. Acceptance: `0 failed`, and the passed count materially above the old 414 (rough
   expectation 550-570 — exact value depends on conditionally-executed sections; a
   stable different number with 0 failed is fine). Paste the `RESULTS:` line into the
   commit message (amend the tasks 1+8 commit or add an evidence note here).
4. If ANY failures appear: the latent-baseline rule applies — these were pre-existing
   silent failures, NOT regressions from tasks 1/8. Do not weaken conversions to hide
   them; triage each (broken tool vs stale test), record findings in this file, and
   STOP for maintainer review.
5. On a clean run the checkpoint is satisfied — proceed directly to task-2 without a
   further human gate, following the execution order above (2, then 3-7).

## Tasks

In execution order:

- [x] `task-1` Fix the inverted no-warnings jq guard (BLOCKER)
- [x] `task-8` Complete the run_capture subshell accounting audit (calibrates the suite)
- [x] `task-2` Stop emitting structuredContent on error envelopes (BLOCKER)
- [ ] `task-3` Derive the warning-code enum from ToolWarningCodeSchema
- [ ] `task-4` Remove the dead HandlerArgs.diagnostics field
- [ ] `task-5` Require Diagnostics in R on the warn path (drop serviceOption)
- [ ] `task-6` Centralize the three ref-fallback merge implementations
- [ ] `task-7` Justify or eliminate leftover fixture casts

## task-1

Status: `done`

Done in this lane. Verification run: focused jq sample tests for healthy/degraded/status-named-`warnings`
cases, `bash -n scripts/integration_test_full.sh`, grep audit for remaining counting
`VAR=$(run_capture ...)` sites, grep audit for accidental `run_capture_only` conversions,
review-agent pass, and full live integration. The live run reached
`list_statuses(HULY) emits no degradation warnings` and passed that guard. Final suite
evidence: `RESULTS: 559 passed, 0 failed, 27 skipped (of 586)`.

### Load

Fix the inverted no-warnings guard in `scripts/integration_test_full.sh` (the
`list_statuses` block, ~line 726). Empirically established defect: the expression
`(.structuredContent.warnings? // empty) | not` produces an EMPTY jq output stream when
warnings are absent, because `null // empty` yields no values and `not` over an empty
stream stays empty; `jq -e` exits 4 on empty output, so the shell `if` takes the FAIL
branch on every healthy workspace. Verified live: the suite fails exactly here
(`FAIL: list_statuses(HULY) emitted degradation warnings`) while the server's actual
response has no warnings. Additionally, the second clause's substring check
`contains("\"warnings\"")` false-positives if any result field legitimately contains the
quoted word warnings (e.g. a status named `warnings`). Replace the whole jq filter with
the following expression, already tested against healthy, degraded, and
tricky (status named "warnings") samples:

```jq
((.structuredContent.warnings? // []) | length == 0)
and ([.content[]? | select((.text | fromjson? | has("warnings")) == true)] | length == 0)
```

Keep the PASS/FAIL message style, the surrounding `run_result_to_var` capture, the
defense-in-depth raw-ref regex sub-check, and the explanatory comment unchanged.
Verification: `bash -n scripts/integration_test_full.sh`; then build and run the full
integration suite against local Huly (from a devcontainer use
`HULY_URL="${HULY_URL/localhost/host.docker.internal}"` per CLAUDE.md) and confirm the
`RESULTS:` line shows 0 failed with the no-warnings guard now PASSing; paste the RESULTS
line as evidence. Blast radius: one shell script. Constraints: do not weaken the guard —
healthy must PASS, a response carrying warnings must FAIL (test both directions of the
jq expression with sample JSON via `jq -e` before running the suite).

## task-2

Status: `done`

Done in this lane. Verification run: focused MCP tests
(`test/mcp/error-mapping.test.ts`, `test/mcp/registry.test.ts`,
`test/mcp/protocol-handlers.test.ts`), `pnpm typecheck`, `pnpm check-all`, a live
stdio `get_project` missing-project error check confirming `isError: true` and no
`structuredContent`, review-agent pass, and full live integration. Final suite
evidence: `RESULTS: 559 passed, 0 failed, 27 skipped (of 586)`.

### Load

Stop emitting `structuredContent` on error envelopes so spec-validating MCP clients can
read tool errors from warning-emitting calls. Evidence of the defect: the official MCP
TS SDK client validates `structuredContent` against the tool's declared output schema
WHENEVER it is present — see
`node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js` ~lines 503-515: the
`isError` exemption applies only to the ABSENCE check; presence is validated
unconditionally. Every tool advertises `defaultToolOutputSchema` with
`required: ["result"]` (`src/mcp/tool-output-schema.ts`, advertised at
`src/mcp/protocol-handlers.ts:251`), so the current error shape
`structuredContent: { warnings }` (no `result`) makes SDK-based hosts throw
`McpError: Structured content does not match the tool's output schema`, masking the real
tool error — precisely for users on degraded workspaces. Fix in
`src/mcp/error-mapping.ts`: `createErrorResponse` must never set `structuredContent`;
warnings on errors travel ONLY as the second content text block
(`{"warnings":[...]}`), which is already emitted. Restore the type to make impossible
states unrepresentable: `McpToolResponse.structuredContent` returns to
`{ readonly result: unknown; readonly warnings?: ReadonlyArray<ToolWarning> }` with
`result` REQUIRED (the current `result?` widening exists only to permit the error shape
being removed). `createSuccessResponse` keeps its current dual emission. Do not change
the registry draining: `mapDomainCauseToMcp`/`mapDomainErrorToMcp` keep accepting and
forwarding warnings. Update the tests that currently bless the invalid shape:
`test/mcp/registry.test.ts` ("adds diagnostics warnings to failure envelopes") and the
error-mapping tests must now assert isError responses have NO `structuredContent` and
DO carry the warnings content block; keep the success-path assertions unchanged; keep
`test/mcp/protocol-handlers.test.ts`'s probe test green. Expected additional test: an
error envelope WITHOUT warnings also has no `structuredContent` (unchanged behavior,
pin it). Verification: `pnpm check-all`; then a live error-path check against local
Huly via the single-tool stdio pattern (e.g. `get_project` on a nonexistent project)
confirming the error response carries no `structuredContent`; then the full integration
suite with the `RESULTS:` line pasted. Blast radius: `error-mapping.ts` plus two test
files; no registry, transport, or operations changes. Constraints: no casts; preserve
`_meta` error metadata handling exactly.

## task-3

Status: `pending`

### Load

Eliminate the hand-duplicated warning-code enum in `src/mcp/tool-output-schema.ts`. The
JSON output schema currently hardcodes `enum: ["status_metadata_unresolved"]`, repeating
the literal that `ToolWarningCodeSchema` (`src/domain/schemas/tool-warnings.ts`) already
owns. This is distant connascence of value: when the next warning code is added to the
Schema, the advertised JSON schema goes stale, and because the warning item schema
declares `additionalProperties: false` with a closed enum, spec-validating clients will
REJECT successful degraded responses carrying the new code — a silent future break.
Fix: import `ToolWarningCodeSchema` and derive the enum from the schema's literals
(Effect's `Schema.Literal` exposes a `literals` tuple on the schema class — verify the
exact accessor against `.reference/effect/` or effect-solutions before use; if a
spread of the tuple needs widening to a mutable array for the JSON schema type, prefer
`[...ToolWarningCodeSchema.literals]` over any cast). Add a focused unit test pinning
that the advertised enum equals the schema's literals (this is a runtime-derivation
test, not a compile-time-only assertion, so it earns its existence under the test
rules). Verification: `pnpm check-all`. Blast radius: one src file, one test file.
Constraints: no casts without justification; do not restructure the rest of the JSON
schema.

## task-4

Status: `pending`

### Load

Remove the dead `diagnostics` field from `HandlerArgs` in `src/mcp/tools/registry.ts`.
The field is set in `createHandler`'s `provide({ diagnostics: diagnosticsScope.service,
... })` call but no `ProvideServices` implementation reads `args.diagnostics` — the
Diagnostics service is provided separately via
`provided.right.pipe(Effect.provideService(Diagnostics, diagnosticsScope.service))`.
Per the dead-code rule (every member must have a reader at time of writing), delete the
interface field and the object property; the separate `provideService` pipe is the real
mechanism and stays. NOTE: if task-5 lands first it does not change this — the per-call
scope provisioning in `createHandler` remains the production seam either way.
Verification: `pnpm check-all` (typecheck will confirm nothing read it). Blast radius:
one file, a few lines. Constraints: no behavior change; do not touch the provisioning
pipe.

## task-5

Status: `pending`

### Load

Make the Diagnostics dependency explicit on the warn path: replace
`Effect.serviceOption(Diagnostics)` in `findStatusDocs`
(`src/huly/operations/issues-shared.ts`) with a required `yield* Diagnostics`, removing
the `Option.match` indirection and both `onNone` fallback branches (they are unreachable
in production — the registry always provides the service — and they duplicate logging
behavior that `warnAgent`/`trail` already own). Rationale (maintainer-agreed): the type
system should track where agent-visible warnings can originate; a soft dependency hides
the capability and lets a future non-registry call path silently drop agent visibility.
The widened handler factory signatures already accept `Svc | Diagnostics` operations —
`test/mcp/protocol-handlers.test.ts`'s `diagnostic_probe` tool proves the explicit-R
path compiles end-to-end. Consequences to implement: `findStatusDocs` becomes
`Effect.Effect<ReadonlyArray<Status>, never, Diagnostics>`; widen the explicit R
annotations along the call chain — `findProjectWithStatuses` (issues-shared),
`getStatusDocs`/`loadWorkflowData` and the exported operations in
`src/huly/operations/task-management.ts`, `getFunnelStatuses`/`listLeads`/`getLead`
chain in `src/huly/operations/leads.ts`, and the exported operations in `projects.ts`,
`issues-read.ts`, `issues-write.ts`, `issues-update.ts` whose explicit annotations sit
on the warn path (add `| Diagnostics` to R; let inference carry it where annotations
are absent). Update every operation-level test that exercises these paths WITHOUT
providing Diagnostics (e.g. `test/huly/operations/operations-helpers.test.ts`,
`projects.test.ts`, `task-management.test.ts`, `issues-task-types.test.ts`,
`leads.test.ts` and any tool-level tests that call operations directly) to provide a
scope via `makeDiagnosticsScope` + `Effect.provideService(Diagnostics, scope.service)`
— follow the existing pattern in `leads.test.ts:440-470`. Where a test previously
relied on the onNone log fallback, it must now assert through the provided scope (or
simply provide it and keep prior assertions). Expected tests: existing suites compile
and pass with the service provided; at least one test asserts the exact warning code
and message wording through the scope for the issues-shared path (move/keep from
round-1 coverage). Verification: `pnpm check-all`; full integration suite with
`RESULTS:` pasted (production provisioning is unchanged, but prove it). Blast radius:
THIS IS THE APP-WIDE TASK — ~6 operation src files (annotation widening only, no logic
changes outside issues-shared), plus roughly 5-8 operation/tool test files gaining
scope provisioning. No registry, envelope, or transport changes. Constraints: no
casts; do not change warning/trail message wording; keep `Option` import removal tidy
(unused-import lint).

## task-6

Status: `pending`

### Load

Centralize the three duplicated ref-fallback merge implementations behind one generic
resolver. Current duplicates of the same algorithm (build Map of docs by `_id`, map
refs to doc-derived value or ref-derived fallback): `workflowStatusesFromDocsOrRefs`
(`src/huly/operations/issues-shared.ts`), `statusDocsWithFallbacks`
(`src/huly/operations/task-management.ts`), `statusInfosWithFallbacks`
(`src/huly/operations/leads.ts`). Per the connascence rule (centralize duplicated
algorithms behind one implementation), add ONE generic helper in `issues-shared.ts` —
shape suggestion: `resolveByStatusRef<T>(statusRefs, statusDocs, fromDoc: (d: Status)
=> T, fromRef: (r: Ref<Status>) => T): Array<T>` — and express all three call sites
through it (issues-shared passes `workflowStatusFromDoc`/`workflowStatusFromRef`;
task-management passes identity-ish doc passthrough and `fallbackStatusDoc`; leads
passes its `StatusInfo` projections). Delete the three bespoke implementations. Keep
output types exact with no casts; the generic parameter carries the difference. Keep
`fallbackStatusDoc`'s `satisfies Status` construction as-is (it is the type-honest
part). Expected tests: existing operation tests already pin all three behaviors —
they must pass unchanged; no new tests needed unless the helper is exported (export
only if used across modules, which it is — task-management and leads import it).
Verification: `pnpm check-all` (jscpd duplication threshold should improve or hold);
no integration rerun required if `check-all` is green and no behavior changed, but
run the suite anyway if any output ordering changed. Blast radius: three operation
src files. Constraints: preserve ref order and dedup semantics exactly (refs map in
input order; docs deduped upstream by `uniqueStatusDocs`).

## task-7

Status: `pending`

### Load

Resolve the leftover unjustified fixture casts flagged in round 2. Sites:
`test/huly/operations/projects.test.ts:168` and `:177` (`Effect.succeed({} as never)`
in updateDoc/removeDoc stubs) and `test/huly/operations/issues-task-types.test.ts:273`
(`Effect.succeed({ object: { sequence: 2 } } as never)` in the addCollection-adjacent
stub). These predate PR #121 but live in fixtures this PR touches, and the cast
checklist in `.claude/review-rules.md` requires every `as T` to carry an accurate
justification comment or be eliminated. Preferred: eliminate — inspect the
`HulyClientOperations` member signatures these stubs implement and type the stub
return honestly (e.g. construct the minimal value the signature's generic demands, or
type the stub function via `satisfies HulyClientOperations["updateDoc"]` the way
`task-management.test.ts`'s fixtures do). Where elimination genuinely fights the SDK's
generic-by-class signatures, keep the cast but add the eslint-disable +
justification-comment pattern already used by `findAllInModelImpl` fixtures
("generic by requested class; fixture mirrors..."). Verification: `pnpm check-all`.
Blast radius: two test files. Constraints: no behavior change to what the stubs
return; comments must be technically accurate per review-rules (no "branded at
runtime"-class errors).

## task-8

Status: `done` — COMMITTED (maintainer decided to do this, sequenced immediately
after task-1 and BEFORE tasks 2-7; see execution order in Context).

Done in this lane. Verification run: `bash -n scripts/integration_test_full.sh`, grep
audit confirming no remaining counting `VAR=$(run_capture ...)` call sites, grep audit
confirming `run_capture_only` discovery/setup captures remain non-counting, `git diff
--check`, review-agent pass, and full live integration. Final calibrated suite evidence:
`RESULTS: 559 passed, 0 failed, 27 skipped (of 586)`.

### Load

Runs second, right after task-1, because it calibrates the verification instrument the
remaining tasks depend on. Complete the round-1 audit that was skipped: convert the remaining
`VAR=$(run_capture ...)` command-substitution call sites in
`scripts/integration_test_full.sh` (151 occurrences at review time — create_task_type,
create_issue_status, get_project_type, create_issue, relations, drive, comments, and
more) to the subshell-safe helpers (`run_capture_to_var` for `.content[0].text`
consumers, `run_result_to_var` where the full `.result` JSON is needed). Defect being
fixed: `$(...)` runs the helper in a subshell, discarding `PASSED`/`FAILED`/`ERRORS`
mutations, so any of those captures failing leaves the suite's exit code green; the
final tally also undercounts passes by ~151. Mechanics to preserve: the `_to_var`
helpers return the same exit codes, so `if VAR=$(run_capture ...); then` patterns
convert to `if run_capture_to_var VAR "name" "$PAYLOAD"; then`; plain assignments
convert to a bare helper call followed by the existing `[ -n "$VAR" ]` guards
unchanged; `run_capture_only` sites are exempt BY DESIGN (documented as not counting)
— do not convert them. Work mechanically section by section; do not change any test
payloads, names, or jq assertions. Verification: `bash -n` after each section; then
the full integration suite — expect the passed count to rise by roughly the number of
converted sites; paste the before/after `RESULTS:` lines as evidence. IMPORTANT: this
conversion may surface failures that were ALREADY happening silently in subshells. If
the suite reports new failures after conversion, do NOT "fix" them by weakening the
conversion and do not proceed to later tasks — triage each one (is the tool actually
broken, or is the test stale?), record findings, and stop for maintainer review. A
clean run is 0 failed; anything else is a discovery, not a regression caused by this
task.
Blast radius: one shell script, many lines, zero src changes. Constraints: keep diff
reviewable (consider one commit per script section); do not "fix" unrelated script
style while in there.
