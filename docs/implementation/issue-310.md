# Issue 310 — complete descendant tree movement

Base: `9c07d6297fcb5dd404d764c2f77224aa80455268` (#309), with its review-only test correction. Worktree: `/tmp/hulymcp-dalph-306-311/takeover/issue-310`; branch: `overseer/issue-310`.

## Implementation plan

1. Discover a complete tree from actual `attachedTo` relationships, independent of cached counts and ancestry. Reject cycles, duplicate snapshots/traversal, foreign spaces and query/response limits before reserving identifiers. Reinspect attachment closure around execution.
2. Parse each task's protected payload, inspect its actual workflow and runtime-model-owned records, and aggregate all task-specific component/milestone/workflow/ownership conflicts. Validate supplied decisions against the complete current tree; new children receive no inherited discard consent.
3. Reserve one destination sequence value per transferred task; retain stable IDs and internal edges, detach only the root, assign unique identifiers and consistent ranks. Build the entire write set before sending task writes. Emit unchanged internal `attachedTo` values to request server ancestry refresh.
4. Use one scoped conditional batch for the complete task/record write set. Root direct-count adjustments accompany bare SDK task updates; server tracker triggers own ancestry, childInfo and time/estimation propagation. Verify every task, owned record, affected ancestor and approved attribute delta before returning completion.
5. Return every old/new mapping and usable URL. Keep incomplete versus indeterminate execution truthful and report all stable IDs for inspection. Inspect no-op trees and ownership invariants without renumbering or repair.
6. Exercise three-level trees, differing source/destination ancestor chains, stale caches, selective consent, newly added descendants and negative outcomes through the shared public operation. Add generated tree properties and executable MCP/CLI fixtures covering retained nested data, independent references, relations, aggregates and ordering.

## Module boundaries and prerequisites

`issue-transfer-tree.ts` owns deterministic attachment traversal and root/internal-parent decisions. `issue-transfer-tree-attributes.ts` owns complete-tree resolution admission and delegates individual field decisions to #309's resolver. Tree planning, adapter batch sequencing and verification are separate modules so discovery and transformation stay outside SDK/protocol glue.

#308 was inspected read-only at `339629bc9918017ecdfddab58905599259f87637`. Combined provisional prerequisites `fec00a1f3cfdf62c42baf8abdf6bc33cb0e63e4b` were merged at `753f9b81`, retaining `TransferSupportedRecord`, inspection `classes`, `recordClasses` write metadata, model-derived nested closure and conditional record guards. The integration fixture-contract correction `8c5d80e4` was cherry-picked at `083adfce`. Each task retains an independently inspected record closure; records are not discovered by following arbitrary references. #309's complete candidate inventories, literal matching, stale expected-from checks and conditional target membership guards remain required.

Record discovery receives complete parsed task snapshots. It omits a task row from supporting records only when the stable ID and exact inspected `subIssues` attachment/owner/class/space/hierarchy snapshot agree. Unknown or changed task edges refuse. Every visited task still receives independent nested record discovery. Scoped record closure guards exclude only those approved task IDs, while a separate task closure condition rejects new descendants and every task snapshot is matched before mutation.

The server persists an entire initial batch before calculating synchronous derived transactions. Initial tree writes therefore include projected final ancestry, so descendants read the final identifier/space/ancestor metadata of their moved parents. Because tracker triggers then read the post-persisted final parents, the batch also removes each moved task's childInfo entry from only the old external ancestors absent from its final chain. Trigger-owned final-chain pull/push behavior remains intact; direct child-count adjustments apply only to the detached/attached root. This follows the pinned `server-plugins/tracker-resources` implementation and still requires deployed-server certification.

Discovery and each full reinspection have a 10-second Effect Clock budget. Allocation, single batch execution and verification share a 30-second execution budget with explicit phase tracking. A discovery/inspection timeout refuses before writes; after allocation starts a timeout is indeterminate. A tree exceeding 1,000 tasks, 10,000 supporting records or 10,000 conflict/candidate response entries refuses before writes and never claims a prefix is complete.

## Criterion evidence map

| Criterion | Implementation and authored verification |
| --- | --- |
| Attachment discovery and inconsistencies | Tree inspector/pure traversal; three-level, generated, duplicate/cycle/foreign-space and model-edge tests |
| Unique identifiers, ancestry and ordering | Complete tree allocation/planning; schema-owned finalParents; generated unique-number/identifier/rank and internal-edge properties |
| Root detach and internal edges | Root-only counter deltas, complete task batch; top-level/nested source and destination ancestor public tests |
| Descendant supporting data | Independent per-task #308 closure and protected payload verification; MCP/CLI fixture creates each task's comments, nested/issue files, labels, reports and independent references |
| Workflow and attribute conflicts across tree | Per-task workflow inspection and tree consent resolver; simultaneous workflow/attribute and shared-source-value tests |
| Every resolution before writes | Complete-tree admission plus schema-shaped scoped retry; newly added child and selective clear public tests |
| Derived information and ancestor chains | Projected ancestry, removed-source childInfo cleanup, trigger-owned final childInfo, root counts; verifies all relevant ancestors and fixture old/new chains |
| Complete mappings and attribute changes | Dedicated pure result projection returns every write mapping and approved delta; no truncated successful response |
| Responsible bounds | Task/record/conflict-entry capacities, discovery/reinspection budgets and phase-aware execution deadline; TestClock deep-query/allocation tests |
| No-op and partial movement | Actual workspace attachment discovery, identity/record/hierarchy checks; public partial-tree no-op refuses with all known stable IDs and executable guidance |
| Three levels, stale counts and ancestry variants | Traversal tests ignore stale counts as discovery authority; public source placement/destination ancestor/new-child tests; executable four-task MCP/CLI fixture |
| Properties and mandatory gates | Generated identity/edge/identifier/rank properties and injected real ports; full gate/reviews/live evidence remain pending |

Installed SDK/server source evidence is recorded in the root-owned `310-311-source-evidence.md`. Scoped apply conditions are cooperative guards, not global isolation or ACID promises. Deployed server trigger/parent ordering evidence remains a final live certification obligation.

## Verification status

Implementation in progress. Compiler, tests and full gate are waiting for root's shared verification scheduling and combined prerequisites. No live fixture has run; all live suites are explicitly reserved for final all-six certification. Coverage thresholds, diagnostics and deadlines remain unchanged.

Review successor: incomplete attachment discovery now retains usable parsed siblings,
continues their descendant inspection within the existing bound, and aggregates their
workflow, attributes and supplied resolution conflicts before refusing all writes.
Malformed rows and truncated totals remain explicitly incomplete. Every transfer,
including a leaf, requires the guarded complete-tree port before sequence allocation.
Verification distinguishes unavailable closure/payload parsing from confirmed absent
or inconsistent state using the typed closure inspector. Public regression cases and
the pinned batch ancestry simulation are authored; verification remains unrun pending
the root's scheduled slot. No live Huly writes were made.

First scheduled typecheck at 067786ea terminated in TypeScript with six errors;
Effect diagnostics and focused tests did not run. The source successor uses one
SDK-supported `$pull: { childInfo: { childId } }` per removed task, all queued in
the same scoped apply. This matches the pinned tracker trigger at index.ts:482
and the core operator's exact object-field predicate at operator.ts:58; every
old-only external ancestor entry is removed without replacing unrelated entries.
The adapter batch simulation now parses and applies that actual scalar predicate.
The remaining errors were fixture readonly construction, brand comparisons and
the shared UNKNOWN_TOTAL import. No gate or live success is claimed.

Scheduled 2c1c42df typecheck passed: 1089 files, zero strict Effect errors,
warnings or messages. The seven-file focused run completed in 2.59s with 21
passed and two failed. Its failures identified a parent-payload dependency that
hid independently parsed descendant attributes and an incorrectly populated
adapter fixture. The successor retains the child protected snapshot while adding
an explicit unavailable-parent conflict; movement still refuses. The SDK-port
fixture now contains every actual task/ancestor/owned-record snapshot, evaluates
all match and notMatch conditions in strict mode, and checks that an actual
changed grandchild timestamp refuses the batch. No test success is claimed for
this successor until the scheduled rerun.

Scheduled verification at immutable 9b777554d9aee381444107d9f4dd6f165d4a19e3:
`GOMAXPROCS=2 pnpm typecheck` exited 0; TypeScript passed and strict Effect
checked 1089 files with zero errors, warnings or messages within the unchanged
120-second budget. The seven focused tree files exited 0: 23 tests passed in
5.23s, including SDK-port batching/ancestry and conditional-refusal evidence,
partial/malformed/unknown-total conflict preservation, exact task ownership,
complete tree mappings, generated properties and TestClock phase bounds. Logs:
`/tmp/hulymcp-dalph-306-311/takeover/issue-310-types-9b7.log` and
`/tmp/hulymcp-dalph-306-311/takeover/issue-310-focused-9b7.log`.
Both independent source review axes passed that immutable candidate. These
focused checks do not certify the complete harness, strict coverage or deployed
Huly behavior; combined gates and the final authorized live suite remain pending.
