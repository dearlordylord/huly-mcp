# Issue 309: actionable project attribute retry

Implements task-scoped component and milestone resolution for compatible leaf transfers independently of issue 308. Descendant and additional owned-record refusals remain unchanged until the independent ownership slice is integrated.

The schema describes exact per-task consent `{issueId, field, from, to}`. The resolver prioritizes explicit consent, valid destination references, literal unique labels, and structured conflicts. It does not normalize labels, create values, convert workflow, or cache plans. Dangling source IDs allow explicit replacement and null clearing without source names. Duplicate/out-of-tree consent, invalid replacements and stale current references (including null/unset) block before sequence reservation. Same-project supplied resolutions, including an empty array, remain rejected before no-op detection.

Component and milestone discovery uses direct complete SDK `findAll` snapshots, including total counts. The 1,000-value per-project safety limit, invalid payloads, mismatched classes/spaces and duplicate stable IDs are explicit incomplete discovery refusals; no arbitrary exact-name choice occurs. Component candidates expose lead; milestone candidates expose status and target date. Workflow and attribute conflicts are returned together. Blocked results include discovery completeness, stable IDs, field/current value/candidates and a schema-valid nextCall using the stable root ID. Conflict guidance explains how to append exact resolutions to that original destination.

Approved automatic/explicit deltas travel through the transfer plan to conditional expected-reference adapter writes and completion `attributeChanges`. Verification compares planned final attributes while retaining all other protected issue payload and record/history equality checks. Independent Component/Milestone documents are never moved.

## Evidence

- Focused operation and existing adapter baseline: 29 tests passed before later added cases.
- Resolver/property focused suite: 8 tests passed, including scoped consent, literal case/whitespace distinctions, duplicates, null/unset staleness, total/class/space/invalid/limit discovery refusal and simultaneous workflow conflicts.
- MCP/CLI published-schema round trip: 2 tests passed using the real registered operation and CLI parser/invocation with injected Huly ports.
- Focused lint and complexity passed at the intermediate checkpoint; final gate pending scheduled compiler availability.
- Initial TypeScript diagnostic found adapter optional update and generic fixture result typing errors; both corrected. Final TypeScript/Effect diagnostics pending.
- Executable final certification fixture: `scripts/integration_test_issue_attributes.sh` (shell syntax checked). Both transports cover unchanged blocked-state/sequence snapshots, two simultaneous conflicts, response-derived retry, intervening stale data, selective milestone clear, automatic exact names and duplicate-name ambiguity.
- Live Huly evidence remains pending root-owned final combined certification per explicit delivery instruction. No live fixture writes have been performed by this slice.

## Remaining acceptance evidence

The final candidate must pass `pnpm check-all`, fresh independent Standards/Spec reviews, and root-owned combined MCP/CLI local Huly certification. Do not interpret intermediate focused tests as final acceptance or atomicity/isolation evidence. The inherited SDK conditional batch contract is cooperative; scopes do not establish global isolation.
