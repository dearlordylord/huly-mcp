# Issue #314

Status: implemented; release certification pending.

Issue details include the assigned component as `{ id, label }` through a schema-owned reference and component index scoped to the issue's actual project. Missing, null, undefined, deleted, and malformed references are omitted; unresolved metadata emits the existing style of bounded agent warning.

Unit cases cover assigned, null, undefined, deleted, and malformed components. The shared full integration fixture asserts `set_issue_component` followed by `get_issue` returns the same stable ID and label; the packed CLI full mirror executes the same assertion.

## Validation

- Standards and Spec reviews: no blocking findings after corrections.
- Focused issue/movement tests: 193 passed; failure-path tests: 37 passed; final cycle tests: 11 passed.
- First `pnpm check-all` stopped at the 60-second movement-process gate; no live writes launched. Isolated coordinator diagnostic: 31 passed in 40.9 seconds.
- Validation uses `/tmp/hulymcp-release-linux-313-314` with frozen-lockfile Linux dependencies. Canonical master dependencies are Darwin and were preserved.
- Existing master compiler hotspot: `preferTypedSchemaDecoder` recursively traversed the SDK Issue graph in the ancestry test parser. Unchanged baseline and candidate timed out at the same file; a one-line unknown-input parser boundary resolves the focused diagnostic with zero errors/warnings. All rules and deadlines remain enabled.
- Final `pnpm check-all`, movement qualification, full MCP/CLI, and release smoke evidence: pending. Logs retained in `/tmp/hulymcp-release-evidence-313-314`.
