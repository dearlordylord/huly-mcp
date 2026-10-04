# Movement qualification churn retrospective

The recorded final campaign ran from 06:05:52 UTC on 2026-10-04 through several repair cycles without a completed qualification. Its ledger recorded 19 movement launches, nine transfer launches and two attribute launches. Successful full quality gates did not resolve the live failure.

## Findings, in severity order

1. The campaign had no enforced parent deadline. Independent command timeouts allowed repair and renamed reruns to extend the same work indefinitely. The movement coordinator must preserve one absolute stop time covering preparation, diagnosis and execution.
2. Qualification grew beyond the originating feature criteria. Whole-server MCP and full CLI mirror runs were added to the five relevant movement suites. Routine concurrency repeated fourteen semantic cases through both transports. The selected scope is now five suites and fourteen MCP plus four representative CLI concurrency cases; all 71 feature requirements remain applicable.
3. Passing movement and transfer suites were repeated after unrelated fixture edits. Reuse now requires matching relevant source, bundles, fixture dependencies, environment and intact logs, with original tested commit retained. Historical runs without those captured inputs cannot be retroactively certified.
4. A reserved jq argument name survived expensive checks; attribute failures initially emitted empty logs. Cheap Bash/jq checks now precede the build, and fixtures retain safe assertion checkpoints and line/phase failures.
5. Broad reruns replaced discriminating diagnosis. The last attribute diagnostic showed an acknowledged write, zero actual HTTP 429 responses and missing visible authenticated movement history at the first verification read. This is an unresolved product/evidence boundary, not grounds for another identical write or a claim of completion.

## Prevention and validation

The implementation includes a bounded coordinator, fixture preflight, representative concurrency selection and retained receipts. Process review found additional admission races, input-drift and cleanup gaps; those must be fixed before calling the process repaired. Run focused process tests and independent source review before starting the user's twenty-minute delivery clock. The final quality gate belongs inside that clock. Expiry means incomplete qualification; it does not renew the budget.

Primary evidence: the retained takeover `final-live/events.log`, `results.jsonl`, attribute diagnostic outputs and gate logs. Prevention references: sibling Dalph `docs/postmortems/issue-307-qualification-churn.md` and `docs/development/workflow.md`; sibling Jev/Hapsland commits `1cb1e4868070c40a54cbf323f9bcbb71f5484cc3` and `9f3a5873e2642e99e7de564781bb3a42db3441c5`. The retro skill's requested writing-for-agents tool was unavailable; no substitute skill was claimed.
