# Movement qualification churn retrospective

The recorded final campaign ran from 06:05:52 UTC on 2026-10-04 through several repair cycles without a completed qualification. Its ledger recorded 19 movement launches, nine transfer launches and two attribute launches. Successful full quality gates did not resolve the live failure.

## Findings, in severity order

1. The campaign had no enforced parent deadline. Independent command timeouts allowed repair and renamed reruns to extend the same work indefinitely. The movement coordinator must preserve one absolute stop time covering preparation, diagnosis and execution.
2. Qualification grew beyond the originating feature criteria. Whole-server MCP and full CLI mirror runs were added to the five relevant movement suites. Routine concurrency repeated fourteen semantic cases through both transports. The selected scope is now five suites and fourteen MCP plus four representative CLI concurrency cases; all 71 feature requirements remain applicable.
3. Passing movement and transfer suites were repeated after unrelated fixture edits. Reuse now requires matching relevant source, bundles, fixture dependencies, environment and intact logs, with original tested commit retained. Historical runs without those captured inputs cannot be retroactively certified.
4. A reserved jq argument name survived expensive checks; attribute failures initially emitted empty logs. Cheap Bash/jq checks now precede the build, and fixtures retain safe assertion checkpoints and line/phase failures.
5. Broad reruns replaced discriminating diagnosis. The last attribute diagnostic showed an acknowledged write, zero actual HTTP 429 responses and missing visible authenticated movement history at the first verification read. This is an unresolved product/evidence boundary, not grounds for another identical write or a claim of completion.

## Prevention and validation

The implementation includes a bounded coordinator, fixture preflight, representative concurrency selection and retained receipts. Process review found admission races, input-drift and cleanup gaps. These were corrected in `cf03b9e3`: exclusive admission and atomic state, post-run/final fingerprints, fail-closed cleanup custody and preparation source stability. All thirteen combined Node process/preflight tests passed; independent Standards and Spec source reviews passed. The concurrency oracle correction is reviewed separately before starting the user's twenty-minute delivery clock. The final quality gate belongs inside that clock. Expiry means incomplete qualification; it does not renew the budget.

Primary evidence: the retained takeover `final-live/events.log`, `results.jsonl`, attribute diagnostic outputs and gate logs. Prevention references: sibling Dalph `docs/postmortems/issue-307-qualification-churn.md` and `docs/development/workflow.md`; sibling Jev/Hapsland commits `1cb1e4868070c40a54cbf323f9bcbb71f5484cc3` and `9f3a5873e2642e99e7de564781bb3a42db3441c5`. The retro skill's requested writing-for-agents tool was unavailable; no substitute skill was claimed.

## Bounded campaign outcome

The delivery window was 14:15:23–14:35:23 UTC. The coordinator stopped at expiry (exit 124), with ten seconds of bounded process cleanup. It did not renew the deadline. The corrected final gate passed on `0d7d6a00` (392 files, 5258 tests, branches 99.00%); the full attribute suite passed through MCP and CLI with stable-input and clean-process receipts. Tree timed out; concurrency, movement and rich transfer were not executed in this campaign. Historical movement/transfer passes remain separate characterization. Server fixture cleanup after the tree timeout is unconfirmed.

Process repair remains incomplete at one concrete boundary: detached quality-stage groups can escape the outer preparation group. The attempted relay `45244733` passed eight physical tests but source review found unbounded group-absence settlement. It was reverted from the working candidate and retained on `overseer/process-relay-review-45244733`. Before calling bounded preparation fully qualified, implement finite group-absence settlement, handle observation failures explicitly and preserve outer custody when absence cannot be proved. Do not infer descendant cleanup from leader exit alone. No merge or completion claim is justified by the partial campaign.

## Follow-up process repair

The user resumed process repair without renewing the expired integration campaign. The replacement resolves finite cleanup and custody admission in `602caa9a`: starting records precede launch, active persistence follows cleanup ownership, parent signals reach owned groups, repeated stop calls share one escalation timer, and missing close or failed absence proof settles as unconfirmed. Retained records survive late close events. The outer coordinator refuses live admission and keeps its lock for any retained entry. Preparation fingerprints include the harness, tests and gate configuration, so a changed checker cannot qualify mixed inputs.

Ten physical stage-process tests and sixteen Node process/preflight tests cover the protocol, including a real nested detached stage whose unconfirmed cleanup survives a successful preparation leader. Independent Standards and Spec source reviews passed. The final full quality gate is recorded separately once complete. The earlier tree timeout and unexecuted integration suffix remain incomplete; fixing the harness does not certify them.
