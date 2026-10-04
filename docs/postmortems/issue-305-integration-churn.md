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

Ten physical stage-process tests and sixteen Node process/preflight tests cover the protocol, including a real nested detached stage whose unconfirmed cleanup survives a successful preparation leader. Independent Standards and Spec source reviews passed. The final full quality gate on `02707ebf` passed: 392 files, 5261 tests, all coverage thresholds (branches 99.00%), and the outer executor returned exit 0 with clean custody. The successful path also cancels settlement timers created while group proof was awaited; the physical resistant-descendant canary asserts custody remains empty after all parent timers drain. Default cleanup allows five seconds of termination grace plus two seconds for OS reaping proof, below the outer ten-second allowance. The earlier tree timeout and unexecuted integration suffix remain incomplete; fixing the harness does not certify them.

# Addendum: GH305–311 integration prevention and evidence

GH306–311 remains incomplete. This retrospective records observed failures and
reviewed repairs; it does not certify the pending deployed suites. Preserve prior
campaign receipts, including unsuccessful attempts, rather than relabeling them
as a successful successor.

## Observed evidence

Exact `64bbded81649e4cf9fcb89780e3ee33248723d79` passed the unchanged full gate:
393 files, 5274 tests; coverage 99.48% statements, 99% branches, 99.05% functions,
99.57% lines. Gate receipt `final-gate-1791141167542.json` records clean/stable
inputs and log SHA256
`4671efd2c537421447cf57bbbbb2644b21ead4acdffd679ee2f918e94484a14f`.
Whole-gate elapsed time was 400.613 seconds; test execution was 270.26 seconds.

Its tree live attempt then failed during setup: 492.218 seconds, exit 1, process
custody clean and inputs stable. The failing `create_issue` connection had no
call-start. Approximately ten-second timing is an inference, not an established
timeout category or cause. Other four suites were unlaunched. Deletion
acknowledgements and independent fixture-absence evidence were not retained;
process cleanliness does not prove resource cleanup. Earlier `587` tree completion
failure also had an unknown response body/cause. Keep both failures as failures.

A subsequent zero-write eager/lazy startup pair used the same `64bb` source.
Both exited zero with clean/stable process evidence. Eager elapsed 21.222 seconds;
lazy elapsed 13.597 seconds. Logs `startup-eager-1791142131689.log` and
`startup-lazy-1791142152939.log` have hashes
`300f787971d2d4db11872533f3752be314eb1a32686403c9226462858826647f` and
`184a278429f2dd9b9f9f247440e56a35fe739bbe1ece319effd154e2893750e2`.
This paired sample motivates the existing lazy flag; it does not establish the
cause of the prior failure or guarantee future latency.

## Durable controls

- Keep stdin open until the matching MCP reply. Use the actual discovered tool
  definition to prevent SDK header-mismatch mutation resend. The reusable shell
  is `scripts/integration-mcp-call.ts`; real stdio tests are in
  `test/scripts/integration-mcp-call.test.ts`. Missing replies require independent
  read-only reconciliation, never an automatic movement retry.
- Test the actual bundled CJS entrypoint. `scripts/integration-mcp-call-main.ts`
  starts unconditionally; the reusable helper remains importable. Its zero-network
  bundled invalid-input test catches entrypoint guards that silently skip execution.
- Compose whole-phase connection/discovery/call deadlines of 10/10/45 seconds
  beneath the named 80-second tree transport envelope. Abort SDK requests and
  await transport, pending negotiation sibling, and client cleanup. SDK discovery
  can own a disposable sibling process. Keep initial/preallocation inspection at
  ten seconds and fresh cross-project pre-send inspection within the remaining
  shared 30-second execution budget; never reset that budget after allocation.
  See `INTEGRATION_TESTING.md`, the helper tests, and
  `test/huly/operations/issue-transfer-tree-admission.test.ts`.
- Use supported `LAZY_ENVS=true` in the schema-parsed/redacted child environment
  so discovery avoids eager Huly initialization. Normal process-owned clients
  still resolve on the first tool call; configuration/authentication failure remains
  a tool failure. Native registration and domain guards are unchanged. This moves
  initialization to its truthful phase, not out of the budget or out of verification.
- Bind jq's outer after-state before per-task iteration. Compare derived childInfo
  semantically only with exact duplicate-free descendant entries, estimation,
  reported time and direct counts on every observed owner. Preserve all other
  protected equality. `scripts/issue-tree-aggregates.jq` and its real jq tests own
  this oracle; `scripts/issue-tree-completion.test.mjs` checks sanitized nonzero
  completion diagnostics. Register both in `test:movement-process`.
- Bound real synchronous subprocesses locally: ten-second SIGKILL execution and
  fifteen-second per-test allowance in `test/scripts/run-bundled.test.ts` and
  `test/cli/full-integration-adapter.test.ts`. Preserve status, signal, error,
  generated-bundle cleanup and image assertions. These are not global test or
  product deadline increases. Parent death alone does not prove descendant custody.

The user later removed the total twenty-minute campaign cap. Do not restore it by
assumption. Technical stage/transport guards, custody proof, safe diagnostics,
source/input fingerprints and no-resend rules remain in force. Report actual
elapsed work from the original start; restarting an attempt does not erase history.

## Completion discipline

Run the cheap registered process/preflight regressions before a coherent full gate.
Pin source and input fingerprints; retain terminal exit, log hash, clean/custody
status and each scenario assertion. A reviewed successor is not an executed
predecessor. A private rich single-write diagnostic is characterization, not five-suite
qualification. Labels such as “final” add no evidence.

The tree cleanup repair is authored and source-reviewed in
`scripts/issue-tree-cleanup.ts`, `scripts/integration-issue-tree-cleanup.ts` and
`test/scripts/issue-tree-cleanup.test.ts`. It captures stable project identities,
checks every destructive scope, uses typed unavailable observations, and reports
deletion acknowledgements separately from fresh complete absence queries under
one 120-second process-group bound. Fourteen controlled tests pass; deployed
cleanup qualification remains pending. Unknown partial setup IDs remain
unresolved and the original scenario failure is preserved.
Final acceptance still needs the five deployed suite receipts, the
71-criterion audit, deployment/permission evidence and explicit inside-server
interruption/global-isolation limitations. Do not infer these from a gate pass.

Serialize owned heavy verification jobs. A reviewer can inspect source while a
check runs, but do not launch another compiler, coverage run, bundler process test
or live suite until the current owner reports its terminal handle and releases
the slot. Record the handle and result before admitting the next job. A timeout
during overlapping work is still a failed check; it does not justify increasing
its deadline or claiming that contention caused it.

The user's anti-churn retrospective request must remain part of handoff. Apply the
Dalph-derived finite-work, discriminating-experiment and immutable-evidence
techniques to future attempts without restarting Dalph. Judge them by recorded
attempts and outcomes, not policy text alone.
