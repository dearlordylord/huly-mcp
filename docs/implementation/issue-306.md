# Same-project destination movement (#306)

The supplied Dalph task body is GitHub #306, despite the immutable target identifying
#311. This candidate implements the supplied same-project slice against the
[authoritative parent #305](https://github.com/dearlordylord/huly-mcp/issues/305).
Cross-project execution and cross-project conflict resolution remain unavailable.

Base: `f072f3a2fbee27287097ed4c496e5c7c70bdbb1e`.

## Behavior

MCP `move_issue` and CLI `huly issues move ISSUE --destination JSON` share one
application operation. Issue and parent selectors accept complete identifiers or
stable IDs; project selectors accept identifiers or stable IDs. Destination forms:

```sh
huly issues move HULY-123 --destination '{"project":"HULY"}'
huly issues move HULY-123 --destination '{"parent":"HULY-42"}'
huly issues move HULY-123 --destination '{"project":"HULY","parent":"HULY-42"}'
huly issues move HULY-123 --destination '{"parent":null}'
```

Schema-owned snapshots feed hierarchy inspection. Discovery uses attachment edges,
not derived child counts. The operation checks source/destination ancestor chains,
parents arrays, direct child counts and descendant time/estimation entries. It
refuses incomplete discovery, missing ancestors, cycles, foreign-project children,
ambiguous/missing selectors and inconsistent no-ops before writes. Same-project
`resolutions`, even an empty array, are refused with instructions to omit them.

Execution updates only attachment edges and direct parent counts. IDs, identifiers,
workflow values, attributes, content and relation records are not rewritten.
Bounded verification checks destination, inspected tree membership/internal edges,
ancestry/counts/aggregates and child closure. Failures after sending a write are
`indeterminate`; observed inconsistent verification is `incomplete`. Neither
claims `changed:false`, retries execution, allocates numbers or rolls back.

Reads and writes do not provide global isolation. Another Huly client can edit
between an inspection and a write or after verification. The operation detects
observed changes; it does not certify every possible concurrent race.

## Ordinary-Huly trigger evidence

Live `http://host.docker.internal:8087/config.json` reported server `0.7.409`, model
`0.7.343` (Docker installation configured as `s0.7.409`). The empirical probe used
native REST TxOperations against this ordinary server, creating disposable issues
with estimation 2 and reportedTime 3, then deleting them.

A direct `updateDoc` changing root attachment updated root ancestry and its
old/new ancestor `childInfo` entry. It left descendant ancestry and membership
stale, and left direct child counts unchanged. After updating the descendant's
unchanged `attachedTo`, its ancestry and old/new `childInfo` membership were
correct. Arrays were immediate-parent first, then outward to the oldest ancestor.

Therefore the client sends attachment updates in breadth-first parent-before-child
order, including unchanged internal descendant edges to invoke the server's
ancestry and aggregate triggers. It adjusts old/new direct counts once. It never
writes `parents` or `childInfo` during movement and never duplicates server-owned
aggregate updates. The existing parent constructor now uses the observed ordering.

## Validation evidence

- Focused application/MCP/CLI tests: 47 tests passed, including generated tree invariants and observed concurrent tree changes.
- `scripts/integration_test_issue_movement.sh`: passed MCP discovery/calls and CLI
  executable calls on the ordinary local server. Six fixture issues included an
  old parent, moved root/child/grandchild, and destination parent/ancestor.
  The suite compared preserved SDK fields and relation results, immediate-first
  ancestry and exact old/new counts/aggregate entries. It tested stable selectors,
  explicit agreement, parent-only inference, both top-level forms, no-op,
  resolutions refusal and descendant refusal. Fixture cleanup ran.
- Full quality gate, final feature rerun and broader MCP/CLI suites: pending.

## Standards review

Round 1 at candidate `60da4b11`, against the immutable base: no reasonable blocking findings. The reviewer checked schema-owned boundaries, SDK queries, shared domain rules, dependency-injected tests, failure honesty, internal nonserialized types, resources and state minimality. No blocking Fowler heuristic findings. Pending validation was excluded from this code-standards assessment.

## Spec review

Round 2 at candidate `96d16437`, against the immutable base: no reasonable blocking findings. The fresh medium-reasoning reviewer consulted #305/#306, repository instructions, supporting specifications and the entire candidate diff. Destination forms, stable selectors, prewrite refusals, edge-based discovery, consistent no-op, preservation, shared operation, honest verification and observed trigger ownership match the same-project slice. Required validation remains a separate acceptance dependency.

## Fresh Standards review

Round 2: no reasonable blocking findings. The fresh medium-reasoning reviewer checked both candidate commits and the integration snapshot bootstrap simplification against repository rules and the full Fowler heuristic baseline. Schema-owned boundaries, typed application failures, strict SDK queries, injected tests, shared logic and resource cleanup conform. Bootstrap rejection handling is permitted by the documented bootstrap exception.


## Retry attempt reviews

Immutable attempt base: `324e98b65c4d8a98d8c793572e81ac2108389e0a`.
The retained commits were recovered as `c321e577`, `068d84aa`, and `b16cd48c`.
All three fresh reviewers inspected both `Base...HEAD` and the complete feature
against original base `f072f3a2fbee27287097ed4c496e5c7c70bdbb1e`, with GitHub
#305/#306 and repository review instructions.

### Standards

No reasonable blocking Standards findings. Boundary snapshots and command/results
are schema-owned; shared modules own domain decisions; queries use `hulyQuery`;
tests use the existing HulyClient seam. Failure results do not claim unchanged
state after possible writes. Internal nonserialized plans explain their scope.
No blocking Fowler smell, distant connascence, dead export or misplaced rule.

### Spec

No reasonable blocking implementation findings. Stable/full selectors, destination
forms, inference/agreement and prewrite refusals match the slice. Edge discovery
and hierarchy checks reject inconsistent no-ops. Parent-first attachment updates
invoke observed ancestry/aggregate triggers, with separate direct count updates.
Verification distinguishes completion from incomplete/indeterminate outcomes.

### Dalph fresh review, round 1

A fresh reviewer using the inherited task model and medium reasoning reported
no reasonable blocking implementation findings against the issue, linked
specifications, repository instructions and both diffs. Fresh validation completion
was explicitly retained as an acceptance dependency, separate from code review.


## Fresh retry validation

- Focused movement suite: exit 0 on ordinary Huly server `0.7.409`, model
  `0.7.343` (fresh `/config.json` lookup). Command: source `.env.local`, replace
  `localhost` with `host.docker.internal` in `HULY_URL`, then
  `bash scripts/integration_test_issue_movement.sh`.
  Log: `/tmp/issue-306-retry-movement.log`. All five labeled checks passed:
  MCP discovery, three-level movement and preserved data/relations, actual
  ancestry/counts/aggregate state, stable-ID no-op and resolutions refusal,
  and CLI destination forms/stable selectors/cycle refusal. Cleanup completed.
  The fresh state assertions confirm the retained trigger-ownership behavior:
  attachment updates refresh immediate-first ancestry and childInfo; client
  direct-count updates produce exact old/new counts without duplicate aggregates.

## Verification-run attempt review

Immutable base: `204caecf187dba5477af85b6902f70f445f83470`. Recovered retained
candidates as `d206e1ef`, `40844fae`, and `80942273`, plus the retained 14 safety
tests. The project-change fixture now uses a project SDK reference. Reviewers
inspected both this attempt diff and the entire feature against original base
`f072f3a2fbee27287097ed4c496e5c7c70bdbb1e`, with GitHub #305/#306.

### Standards

No reasonable blocking findings. Schema-owned inputs, outputs and SDK snapshots
preserve boundary typing. Shared operations own destination and hierarchy rules;
MCP and CLI remain adapters. Queries use `hulyQuery`; tests use the HulyClient
seam and TestClock. Internal plans explain their nonserialized scope. Possible
write failures avoid claiming unchanged state. No actionable heuristic smells;
local selector similarity does not require an extraction.

### Spec

No reasonable blocking implementation findings. Stable selectors, destination
inference/agreement, cross-project refusal, resolutions rejection, incomplete
discovery/cycle safeguards, consistent no-op checks, shared MCP/CLI behavior,
identity preservation and failure reporting match the slice. Attachment updates
and separate count adjustments follow ordinary-server trigger evidence.

### Dalph fresh reviewer, round 1

Fresh task-model reviewer at medium reasoning: no reasonable blocking findings
against the issue, linked specifications, repository instructions and both diffs.
Separate parallel Standards and Spec reviews also found no blockers. Validation
completion remains a separate acceptance dependency.

## Finalize-run review and validation

Immutable attempt base: `a5eacf36c145f8f7856ec866719eb566bdc333ac`.
Recovered all three retained production commits and the fixed 14 safety tests.
Reviewers also inspected the complete feature against original base `f072f3a2`.
GitHub #305 and #306 were fetched again for this attempt.

### Standards

Separate fresh Standards reviewer: no reasonable blocking findings. Schema-owned
boundaries, typed failures, strict queries, shared movement rules and injected
client tests follow repository instructions. The four-worker Vitest cap limits
coverage/subprocess contention without weakening timeouts or required checks.
No actionable heuristic smells were found.

### Spec

Separate fresh Spec reviewer: no reasonable blocking findings. Stable selectors,
all destination forms, inference/agreement, prewrite cross-project/resolutions
refusal, closure discovery, consistent no-op and cycle safeguards match #306.
Parent-first attachment updates and separate direct-count adjustments match the
ordinary-server observations. Verification distinguishes incomplete and
indeterminate outcomes. Validation completion remains an acceptance dependency.

### Dalph fresh review, round 1

Fresh task-model reviewer with medium reasoning: no reasonable blocking findings
against immutable-base and complete-feature diffs, #305/#306 and review rules.
The recovered safety tests and worker cap were included in all three reviews.

### Reliability change

Previous gates alternated between subprocess/stdio test timeouts while focused
retests passed. Full coverage previously launched workers across all detected
CPUs while tests also bundle Effect and spawn real Node executables. Vitest now
uses at most four workers to bound that resource competition; coverage thresholds,
test timeouts, test inventory and the five-minute coverage-stage deadline remain.
No production behavior changed after the retained candidate.

### Fresh focused local Huly integration

`bash scripts/integration_test_issue_movement.sh` completed with exit 0, including
fixture cleanup. Environment was sourced from `.env.local` with `localhost`
replaced by `host.docker.internal` in `HULY_URL`. Fresh `/config.json` reports
server `0.7.409`, model `0.7.343`. Log: `/tmp/issue-306-final-movement.log`.
MCP discovery, three-level preservation and actual ancestry/count/aggregate state,
stable-ID no-op/resolutions refusal, and CLI destination forms/cycle refusal all
passed. Attachment writes refreshed immediate-first ancestry and childInfo;
separate direct-count updates produced the expected old/new counts, without
client writes to server-owned derived arrays.

Full gate: `pnpm check-all`, exit 0. All 342 files and 4810 tests passed;
coverage statements 99.47%, branches 99.00%, functions 99.01%, lines 99.56%.
Coverage stage duration 227.90 seconds, inside the unchanged five-minute bound.
Log: `/tmp/issue-306-final-check-all.log`. All checks passed and the gate emitted
277/300 permitted successful output lines.
Overseer-owned broad integration results remain pending in
`/tmp/hulymcp-dalph-306-311/verification-run/integration-status.json`; no duplicate
broad suites were launched. Production is unchanged from its candidate.
