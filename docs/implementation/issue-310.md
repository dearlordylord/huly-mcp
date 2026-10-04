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

#308 was inspected read-only at `339629bc9918017ecdfddab58905599259f87637`. Its `TransferSupportedRecord`, inspection `classes`, `recordClasses` write metadata and model-derived nested closure must be integrated before final tree execution. Each task retains an independently inspected record closure; records are not discovered by following arbitrary references. #309's complete candidate inventories, literal matching, stale expected-from checks and conditional target membership guards remain required.

Installed SDK/server source evidence is recorded in the root-owned `310-311-source-evidence.md`. Scoped apply conditions are cooperative guards, not global isolation or ACID promises. Deployed server trigger/parent ordering evidence remains a final live certification obligation.

## Verification status

Implementation in progress. Compiler, tests and full gate are waiting for root's shared verification scheduling and combined prerequisites. No live fixture has run; all live suites are explicitly reserved for final all-six certification. Coverage thresholds, diagnostics and deadlines remain unchanged.
