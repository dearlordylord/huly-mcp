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

## All 14 acceptance criteria

| Criterion | Implementation / evidence |
| --- | --- |
| Independent of 308; preserve integrated ownership | Existing leaf/unsupported-record admission retained; attribute changes are additive to records and protected payload. Existing 307 operation/adapter tests remain green at focused checkpoints. |
| Complete conflicts/candidates; exact labels | Direct SDK snapshots with total/limit, class/space/schema/duplicate checks. Operation tests exercise case, leading whitespace, duplicate names and six discovery failure modes. |
| Explicit → valid ID → exact unique name → conflict | `issue-transfer-attribute-resolution.ts`; explicit-clear overrides valid-ID preservation; valid-ID tests include ambiguous names and explicit equal-reference no-change. |
| Aggregate workflow/component/milestone conflicts before writes | Transfer preflight merges workflow, attribute and ownership conflicts; three simultaneous conflict categories tested with zero allocations/sends. |
| Stable IDs, expected value, source label, detailed candidates and instructions | Schema-owned attribute conflict branch; candidates expose component lead or milestone status/date. Published-schema MCP/CLI retry tests and final executable fixture. |
| Dangling IDs explicit replacement/null; absent fields need no match | Dangling two-field retry test replaces component and selectively clears milestone. Null/unset are no matching requirement; null/unset stale consent tests remain blocked. |
| Exact task/field/from/to consent | Published command schema shares the field schema; resolver and property test verify scoped consent. |
| Reject duplicate/out-of-tree/invalid/stale | Focused public cases, generated scoped-consent property, class/space/invalid discovery tests; adapter also conditions destination target existence and membership for non-null writes. |
| Rebuild each retry; no token | Shared operation rereads root/hierarchy/workflow/inventory on every invocation. Intervening current reference test and live fixture stale-state scenario. |
| Same-project supplied resolutions reject before no-op | Existing shared destination parser rejects all supplied arrays, including empty; MCP/operation tests exercise no-op and omission instructions. |
| Report all automatic/explicit changes | Schema-owned completion `attributeChanges`, with exact-name / explicit-replacement / explicit-clear reasons. Round-trip and automatic-match assertions. |
| No creation/force/mapping/preview | Resolver only projects existing snapshots; tool descriptions explain separate creation and preserved workflow. |
| Both MCP and CLI blocked→retry→completed | Real registered operation/published AJV schema + CLI parser tests; executable `integration_test_issue_attributes.sh` includes two simultaneous conflicts, exact matches, ambiguity, stale consent and selective clear. Live run is explicitly pending final combined certification. |
| Task-scoped reusable resolver; full gates/local integration | Pure resolver takes one parsed task and snapshots; property tests prove exact consent scope. Full `pnpm check-all`, independent reviews and local Docker MCP/CLI suites remain pending scheduled/final certification. |

## Independent review corrections

The first Standards review of f1c0e037 identified representation gaps. Changes and candidates now retain field-specific schema variants: a clear has `to: null` and `reason: explicit-clear`; replacements require a non-null ID with `explicit-replacement` or `exact-name`. Component candidates require lead; milestones require status and targetDate, with distinct exact ObjectClassName values. Inventories preserve those candidate variants and branded project spaces. A single `MAX_SUPPORTED_ATTRIBUTE_VALUES` drives both the SDK query sentinel and resolver limitation text. SDK total metadata is parsed through Count before completeness decisions.

The first Spec review identified an obsolete-resolution retry gap when a field becomes null/unset. Those conflicts now state that clearing is unavailable and explicitly instruct omission of the obsolete resolution. `nextCall` removes stale/invalid/duplicate/out-of-tree decisions while retaining valid decisions for other fields. The direct now-absent-reference retry test consumes the returned nextCall without undocumented rewriting. The retry still rereads state and does not auto-authorize changed-value loss.

Additional adapter guards require approved non-null replacement documents to remain in the destination project at conditional commit. These guards are cooperative SDK conditions, retaining the inherited scoped batch limitations.
