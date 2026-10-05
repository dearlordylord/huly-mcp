# Issue #313

Status: implemented; release certification pending.

Cycle destinations are refused during tree preflight with actionable root/parent identifiers, all discovered tree IDs, and `destinationParentId`. No retry call repeats the invalid destination. Blocked pre-write inspection uses the source project; reservation gap guidance is emitted only when execution evidence contains reservations.

Unit coverage checks root, child, grandchild, stable-ID and identifier selectors, agreeing project selectors, and a descendant in the destination project. All assert zero allocation and writes. Existing failure tests distinguish zero reservations from confirmed reservations. The movement CLI fixture checks the specific cycle reason and offending stable parent ID.

## Validation

- Standards and Spec reviews: no blocking findings after corrections.
- Focused issue/movement tests: 193 passed; failure-path tests: 37 passed; final cycle tests: 11 passed.
- First `pnpm check-all` stopped at the 60-second movement-process gate; no live writes launched. Isolated coordinator diagnostic: 31 passed in 40.9 seconds.
- Validation uses `/tmp/hulymcp-release-linux-313-314` with frozen-lockfile Linux dependencies. Canonical master dependencies are Darwin and were preserved.
- Existing master compiler hotspot: `preferTypedSchemaDecoder` recursively traversed the SDK Issue graph in the ancestry test parser. Unchanged baseline and candidate timed out at the same file; a one-line unknown-input parser boundary resolves the focused diagnostic with zero errors/warnings. All rules and deadlines remain enabled.
- Final `pnpm check-all`, movement qualification, full MCP/CLI, and release smoke evidence: pending. Logs retained in `/tmp/hulymcp-release-evidence-313-314`.
