# Issue 307 — compatible leaf transfer

## Authority

Assigned task: #307. Parent: #305, read from cache and refreshed with `gh api repos/dearlordylord/huly-mcp/issues/305`.
Immutable planned base and observed prerequisite head: `8541d04d8dea44a17f5071e281a7d069892e795d`.
`git merge master` reported already up to date; accepted #306 commit `200075a4e86c21791130d57277bb252203b403a6` is an ancestor.
The planned-base diff and prerequisite delta are identical for this attempt.
Worktree bootstrapped against `/tmp/hulymcp-dalph-306-311/retry-repository`, with Linux-local dependencies.

## Implemented scope

Shared `move_issue` supports cross-project compatible leaves at top level or beneath an existing parent. Stable IDs, description references, creator metadata, kind/status and relation arrays are preserved. Cross-project allocation uses Project sequence increment with retrieval; conditional Apply commit results are inspected. Existing server ancestry/aggregate triggers are used, while direct child counts are adjusted as in #306. Both source and destination hierarchies and owned record routes are verified with bounded read-only polling.

Model-declared collection types and loaded AttachedDoc descendants drive owned-record discovery. Only automatic DocUpdateMessage history is supported; original author and timestamps are retained and historical payloads are never rewritten. Populated other ownership or nested records, descendants, non-null component/milestone references and resolution inputs are refused before allocation. Discovery limitations are stated. Discoverable blockers include structured workflow, authorization and unsupported-structure conflicts.

This slice conservatively requires equal project types, membership for private destinations, and unrestricted projects; it never changes membership or converts workflow values. The equal-type restriction follows the pinned ordinary-Huly UI implementation. It remains a final live-certification obligation against the installed server, not a claim of empirical certification in this intermediate slice.

Allocation/commit uncertainty is indeterminate; SDK condition refusal after allocation is incomplete with number-gap guidance. Only pre-write refusal reports changed:false. No write is blindly retried and batching is not advertised as transactional.

Published get_issue accepts stable IDs across the workspace and returns the actual current project. Other shared issue lookups remain scoped to the supplied project. Same-destination repeats inspect identity and ownership route consistency before no-op; they never reserve a new number.

## Validation and final obligations

Work in progress: final gate and reviews pending. Focused injected-port movement, adapter and recovery checks have passed; later candidate changes require fresh validation.

The first full gate attempt failed when Effect diagnostics exceeded the existing 120-second stage bound. No threshold or timeout was changed. This is not a full gate pass. Investigation and rerun are pending.

No live Huly suite has been launched and no fixture writes were performed, per the user's final-only cadence. `scripts/integration_test_issue_transfer.sh` and `scripts/integration-issue-transfer-state.ts` author final MCP/CLI execution cases with disposable source/destination projects, a destination parent containing existing work, relation counterparts, an independent document reference and automatically created history. The fixture checks preserved payload/history, stable recovery, changed identifiers, no-op sequence stability and pre-write owned-record refusal. Injected ports cover workflow and authorization refusal, conditional commit refusal and post-send uncertainty.

Final certification must run this fixture, #306 movement fixtures and all subsequent slice fixtures on the combined production candidate, followed by final check-all and clean whole-server MCP/full CLI regressions. Record the server version and verify trigger responsibility and project-type restrictions empirically. Historical broad MCP document-edit missing-response behavior remains a regression obligation.

## Reviews

Independent parallel reviews inspected immutable candidate `d5f1611b5f27083b09d2aec51b9856b79ec0761d` against `8541d04d8dea44a17f5071e281a7d069892e795d`.

Standards found a blocking admission invariant: structured incomplete discovery and unsupported record kinds could be admitted if the adapter omitted blocker text. The successor derives refusal from discovery/classification and narrows approved plans and writes to history records. Two injected-port cases prove empty blocker text cannot authorize writes. Standards also requested existing `IssueIdentifier`/`AccountUuid` schemas and one owner for identifier/number/stable-ID lookup. The successor uses those schemas and shares a resolver with explicit project/workspace scope. Successor re-review is pending.

Spec found no confirmed behavioral defects across all 12 criteria and no scope expansion. A successful full quality gate remains an acceptance blocker. Dalph is disabled and has no review or acceptance role.

After the Standards fixes, 74 focused movement/adapter/read tests passed (`/tmp/issue307-focused-current.log`). The first compiler-cap full gate exited 1 at the unchanged 120-second TypeScript/Effect stage bound (`/tmp/issue307-final-gate.log`). Independent compiler progress identifies the new SDK adapter as the slow diagnostic file. Investigation remains active; no timeout, inventory, diagnostics or coverage requirements changed.
