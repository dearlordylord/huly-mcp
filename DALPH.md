# Dalph feedback: issues 306–311

## Run preparation (2026-10-03)

- Selected delivery graph: GitHub parent #305 and child implementation issues #306–311. Native dependencies permit #308 and #309 concurrently after #307.
- No pre-existing live Dalph process or run for this delivery was found.
- Canonical huly-mcp dependencies contain Darwin native binaries. An isolated clone with Linux-local dependencies is required; the canonical bootstrap helper otherwise links platform-incompatible node_modules.
- Dalph checkout has concurrent uncommitted edits. A clean local clone pinned to e7b7f34aa5668bd97d04f599ba3f5324a478d0c0 isolates this run from those edits.
- The default Codex task instruction requests a fresh reviewer but does not specify the requested code-review skill’s separate Standards and Spec axes. Delivery-local repository instructions supply that requirement and the missing docs/agents/issue-tracker.md.
- Executor profile worktree preparation currently supports only dalph-worktree. For this external project, generated worktrees must run the project bootstrap helper explicitly; the helper must target the isolated repository for platform-local dependencies.

Run artifacts are retained at /tmp/hulymcp-dalph-306-311. Implementation, review, integration, and final verification are pending.

## Verified configuration feedback

The first invocation was refused before Run allocation: claimOwner exceeds Dalph’s 24-character limit. The failure identified the field and GitHub label-description constraint accurately. Shortened it to dalph:huly306-311; retained the failure record in preflight-failure-claim-owner.ndjson. The copyable walkthrough does not mention this limit next to claimOwner, so an operator can encounter it only at validation.

A second pre-allocation refusal constrained codexToolEffectPolicy.defaultLimitMilliseconds to at most 600000. Set the supported ten-minute item bound. The public failure names the enclosing policy field rather than the nested limit; reporting the full nested path would improve correction. Long gates must use yielding/polling calls within this bound.

## Silent startup failure

After valid configuration, the shipped CLI exited 1 with empty stdout and stderr, leaving a migrated journal with zero records and no task worktrees. A redacted diagnostic invocation of the same application identified CodexAttemptStoreFailure at configure. The private directory was created with default permissions; changed it to owner-only mode 0700 as required by the walkthrough and private-store code. The CLI suppresses ordinary Effect failure reporting and its known-production-failure mapper does not present this store failure, leaving operators without an actionable error. This is a verified observability problem before Run allocation.

## Graph admission and exit observations

- The first allocated graph run admitted both parent specification #305 and first slice #306 concurrently. Native sub-issue containment does not imply “implement children before parent.” This is dangerous for a normal epic-plus-slices graph: the parent contains the full specification and starts overlapping implementation. Added the native GitHub blocker #305 ← #311 so the parent is eligible only after the requested slices. Dalph should document or expose explicit container-task semantics rather than silently treating the epic as independent runnable work.
- Requested SIGTERM application Exit after observing the two allocated worktrees. Dalph reported ApplicationExitDisposition TimedOut (requestedStatus 1), process status 130, and an owned-descendant suspension failure. Independently confirmed the run app-server process was absent afterward. This is not successful graceful exit or Run completion; preserved all journal/private state/worktrees for ordinary same-Run recovery.
- Public stdout contained an Effect ERROR log line among version-1 JSON records. This violates the advertised newline-delimited JSON stream and breaks a strict JSON-lines reader. Preserved first-run-public.ndjson and first-run-stderr.log.
- Run id retained in the first RunSelected record and journal; target base f072f3a2fbee27287097ed4c496e5c7c70bdbb1e. Recovery uses the same config and journal, not a competing new coordinator.

## Recovery and cancellation

Ordinary restart selected Recovered with the same RunId, but its latest delivery status reported TrackerFactWait (GraphNotEstablished) and EvidenceUnavailable (ResponsibilityFacts) instead of resuming implementation. No task edits existed. Its subsequent application Exit also returned TimedOut and lifecycle.exit_timed_out.

The supported cancellation invocation released GitHub claims (journal evidence proves release of the #306 claim; issue-label inspection was not a valid claim-authority check), then exited 1 with cancellation.blocked: “cancellation could not prove UnsettledResponsibility.” Historical evidence includes RunCancellationApplied, CancelledAttemptImplementationAbandoned, and TaskClaimReleased, but no Run termination. Both allocated worktrees remain clean, and no run-owned Dalph/app-server process remained. Retrying the supported cancellation command after these tracker observations; no manual store/journal edits or force cleanup performed.

The cancellation retry returned the same cancellation.blocked result. Preserve that stopped Run as incomplete cancellation evidence. To continue the user’s delivery without altering its retained state, use a separate clone/common directory and disjoint Journal/private stores, targeting #311’s prerequisite closure (#306–311) instead of parent #305. All old executor processes are absent, the #306 claim was released, and worktrees are clean; the old #305 claim remains retained outside the new target closure; no concurrent coordinator or work is being displaced. The unresolved old cancellation remains a tool defect, not successful cleanup.

## Active slice delivery

The isolated #311 target allocated a new Run and exactly one initial task worktree for #306. Dalph’s executor reports ExecutorWorkExecuting; later slices remain dependency waits. Artifacts: /tmp/hulymcp-dalph-306-311/slices-run (production.json, journal.sqlite, public.ndjson, stderr.log, private stores, overseer-handoff.json). Target clone: /tmp/hulymcp-dalph-306-311/slices-repository. Live command session: 39325. No implementation slice, reviewer acceptance, integration candidate, or final verification is yet complete.

## Slice 306 implementation observed

The #311 closure Run is live. The #306 task executor bootstrapped Linux-local resources, ran the required quality gate, started the full local-Huly integration suite, and produced two real-server hierarchy trigger probes. Source edits now cover movement schemas, the shared operation, MCP description, and CLI catalog, with new dedicated hierarchy/application modules. In-flight typecheck/lint/complexity failures remain and are being addressed; no accepted candidate or review outcome exists.

The overseer captured all 71 acceptance criteria from #306–311 into slices-run/acceptance-audit.json (10/12/11/14/12/12 per slice), all initially unverified. Final completion requires concrete evidence for every criterion and the full quality/integration gates.

At roughly nine minutes into this Run, public.ndjson exceeded 10 MB while one task was still executing. Current status repeatedly carries large reversible identifiers and action identities containing entire serialized task facts/specification revisions. This makes routine supervision noisy and expensive; a compact status summary with references to separately retrievable immutable details would improve operator usability without dropping authority facts.

## Interrupted executor reported as executing

The #306 Codex rollout contains a terminal turn_aborted event for turn 01a1033b-dcfb-7982-a4af-fba291ed7aaf at 2026-10-03T19:34:27.952Z (duration 450666 ms, reason interrupted), with no later executor events or source edits for several minutes. All retained tool-effect records were Completed. Nevertheless Dalph continued emitting exact ExecutorWorkExecuting reports. Source inspection identifies the same-incarnation exact-notification policy path returning the durable Running projection before lifecycle reconciliation when no completion hint is authorized. This is a verified operator-visible liveness gap for an interrupted provider turn, not evidence of ongoing implementation. Requesting supported application Exit then ordinary same-Run recovery to refresh the provider incarnation while preserving all edits and ownership.

Supported application Exit for the interrupted #306 turn succeeded (ApplicationExitDisposition Succeeded, requestedStatus 0; process exit 0). Ordinary restart selected Recovered with the same RunId and established new executor turn 01a10349-f43e-7660-a0b3-c144e2d1b2b5 in the retained task thread. This verifies a workable manual recovery path without altering stores or discarding partial edits. Live session is now 81951. The interruption’s initiating cause has not been established; do not attribute it to a tool deadline without evidence.

## Claim-authority correction

The overseer initially treated issue-attached labels as claim evidence. That was wrong: Dalph represents claims as repository-wide labels, not labels attached to the issue. Direct repository-label reads and focused tracker facts prove the current #306 claim is active (owner dalph:huly-slices; journal acquisition at position 9, focused reconfirmation at position 653). The stopped first parent Run still retains its #305 claim; cancellation did not release every responsibility. Its #306 claim was released, so the #311 prerequisite closure uses a disjoint active task set. Earlier wording has been corrected accordingly.

A second successful application Exit was used to inspect the journal because the recovered CLI emits HistoryAdvanced once whole snapshots exceed its output limits, and the live Journal is exclusively locked against a separate read-only SQLite connection. The journal shows no current claim release or completion, and repeated complete tracker/Git observations. No claim-loss diagnosis is supported. Resume the same Run and preserve its active claim/partial work.

## Slice 306 verification progress

The live retained executor produced a successful dedicated local-Huly movement run (/tmp/issue-306-live.log): MCP destination discovery, three-level reparenting with identity/content/attribute/relation preservation and actual ancestry/count/aggregate assertions, agreeing stable-ID destination no-op, same-project resolution refusal without writes, and CLI destination/cycle checks. The build passed, and focused tests reached 43 passes across two files. These are in-flight results, not accepted delivery or final gate evidence. Full pnpm check-all and the required two-axis code review remain pending; all later slices remain unimplemented/unaccepted.

## Candidate and parallel review progress

The #306 executor committed candidate 60da4b11 (Implement destination-based same-project issue movement), with a clean task worktree. Its report is docs/implementation/issue-306.md and identifies ordinary server 0.7.409/model 0.7.343, observed immediate-parent-first ordering, selective attachment writes to invoke ancestry triggers, and manual direct-count responsibility. It marks full gate and both review axes pending.

The executor spawned standards_round1 and spec_round1 reviewers at 20:09:52Z and 20:10:09Z, using medium reasoning; their lifetimes overlapped. This verifies that Dalph’s implementer applied the requested separate review axes. The main turn then records turn_aborted at 20:11:20Z (970487 ms). Dalph this time reports ExecutorWorkSafelySuspended, but no automatic resumed main turn appeared during subsequent observation. Supported application Exit succeeded again; ordinary same-Run recovery will preserve the candidate and review context.

An overseer-owned untouched-base Effect diagnostics run completed successfully: 1033 files, zero errors/warnings/messages, exit 0 (/tmp/issue-306-overseer-baseline-effect.log). The candidate full gate exceeded its 120-second TypeScript/Effect stage bound; baseline success does not satisfy the candidate gate. The required gate is still pending and must not be waived.

## Gate timing evidence

The untouched-base Effect diagnostics run took approximately 128 seconds from its first log-file creation to completion (filesystem timestamps 1791058141 → 1791058269), then exited 0 with 1033 files and no diagnostics. The current quality harness bounds the entire TypeScript-plus-Effect stage at 120 seconds. Thus the same Linux environment can exceed that stage bound even on the untouched base; the candidate timeout alone does not prove a source regression. The candidate still needs an actual successful full gate—no timer, coverage, lint, complexity, or diagnostic check was waived by the overseer.

## Validation interruption and unreadable lifecycle

Candidate de6098aa records fresh Standards and Spec round-2 reviews with no blocking findings. Dedicated ordinary-Huly movement validation passed again. The latest full quality gate reached its test stage: 4796 passed and one stdio ownership-signal test timed out; that test file then passed all 10 tests in an isolated rerun. Broader CLI integration continued through attachment download/cleanup. These results do not yet prove a successful full gate or accepted delivery.

The retained main executor turn 01a10369-aaf7-7d90-bad6-0977542a8f8b ended with turn_aborted at 2026-10-03T20:42:11.510Z, reason interrupted, duration 1512368 ms. Dalph consumed the exact completion hint but then emitted an Unreadable lifecycle projection and EvidenceUnavailable/Blocked delivery status. Supported application Exit returned Failed with requestedStatus 1 and process exit 1, without an explanatory public failure reason. Logs are preserved as slices-run/validation-interruption-*. Ordinary same-config recovery was requested without editing private stores or replacing the task worktree.

The retained tool-effect evidence identifies the latest interruption cause: item exec-11ff0fa3-f615-4574-bde0-56ecd4d7c0ef has StopIntended, reason Elapsed, startedAtMilliseconds 1791059530192, deadlineMilliseconds 1791060130192, stopIntentAtMilliseconds 1791060131178. This is the configured 600000 ms tool limit, reached while the broad CLI suite was still making visible progress. The pinned executor projectStoredRecord first attempts to finish that stop, then returns Unreadable; any retained LimitReached likewise permanently projects Unreadable. Ordinary restart recovered the same Run but remained EvidenceUnavailable/ResponsibilityFacts and did not establish a new executor turn. Thus this is not merely another missing completion hint: tool-limit handling can strand retained partial work instead of offering a supported resume/fresh bounded validation step. The private state is preserved unchanged.

## Supported cancellation unstrands the deadline-limited Run

Ordinary restart did not resume the limited attempt, but supported production cancellation subsequently succeeded (exit 0, RunDisposition Cancelled). The journal ends with TaskClaimReleaseIntended, TaskClaimReleased, and WorkflowRunTerminated, proving ownership was settled rather than manually erased. Task worktree de6098aa remains available.

A fresh disjoint Run targets the same #311 prerequisite closure from retry-repository (documentation-only setup base 324e98b6), with all #306–311 criteria retained. Its instructions require task #306 to cherry-pick 60da4b11/96d16437/de6098aa, complete missing gate/integration evidence, and perform the requested two-axis reviews. The initial recovery instructions proposed returning a process/session promptly and polling it in separate bounded tool calls. The next section records why that workaround failed. Run artifacts are retry-run; integration publication remains a local bare repository retry-publication.git. This is a supported cancellation/fresh-Run recovery, not an accepted feature delivery or waiver.

## Opaque tool sessions remain limited after yielding

The fresh retry reached another tool deadline: item exec-1e09e46c-90a4-45c8-8111-232d08003e8b started 1791060835906, deadline 1791061435906, Elapsed stop intent 1791061436847. Main turn aborted 21:03:56.967Z. Its launch call used functions.exec around exec_command with yield_time_ms 1000 and returned promptly, but Dalph continued tracking the nested command session for its full lifetime. Thus the overseer's proposed bounded polling workaround was insufficient; that earlier assumption is corrected here. The second full gate passed all 4797 tests but branch coverage 98.87% was below 99%;14 new safety tests passed, then the next typecheck caught a test-only Ref<Issue>/Ref<Project> mismatch. Broad MCP reached leads and a lead-comment timeout before interruption. All results remain unaccepted.

Pinned CodexToolEffectPolicy supports exact command/cwd allowances up to 90 minutes, but only for decoded commandExecution items. Its own-repository-dogfood guide explicitly says opaque functions.exec calls do not expose nested shell commands for exact matching. A larger allowance alone cannot fix this observed launcher shape. Supported cancellation succeeded again (exit 0, RunDisposition Cancelled). New tests/report/helper edits were preserved in verification-run/retained-tests.patch; no private state was edited.

The overseer now facilitates long-running unchanged broad MCP/CLI verification through an external process handle, separate from Dalph's executor. Dalph retains all implementation/reviewer/integrator/worktree ownership. Fresh verification-run targets the full #311 closure, base 204caecf (documentation-only recovery instructions), and requires recovered #306 candidate, preserved safety tests/type fix, full gate with 99% coverage gate and successful integration results before acceptance. External suite logs/status live in verification-run, and must be rerun if final built behavior changes. This avoids repeated tool-limit destruction while retaining the required checks.

## Dependent task base selection to verify

Source inspection of productionPlannedTaskAttemptPlanner (production-configuration.ts, plan) proves ordinary attempts always use configuration.plannedAttemptBaseSha; only ExactReplacement requests supply a different base. The current closure has several dependent feature slices, so later attempts will not automatically inherit newly promoted prerequisite code through this planner. This has not yet been exercised: #306 is still unaccepted and #307 has not started. The overseer must verify actual prerequisite availability and integration lineage before accepting later slices, rather than assume GitHub dependency ordering also updates their base.

## Interrupted ordinary turn recovery remains unreliable

Verification-run main turn 01a10399-157e-7e13-9a40-a11c44943fb9 records turn_aborted at 21:13:18.254Z, duration 271658 ms. All 23 retained tool effects were Completed; no StopIntended/LimitReached record was present. Dalph still emitted ExecutorWorkExecuting after that terminal provider event. Supported Exit again returned Failed/requestedStatus 1; same-Run restart reports EvidenceUnavailable/ResponsibilityFacts without a new executor turn. Thus not every interruption here is the known 600000 ms tool deadline. The initiating cause of this one remains unproved. Source edits, logs and private history are preserved; external overseer-owned integration keeps running independently. The latest full gate finished with 4809 passed and one failed, so acceptance remains unproved.

## Cancellation finality and process exit disagree

Supported cancellation of verification-run emitted RunDisposition Cancelled, but the CLI process exited 1. Its redacted NodeMainExit diagnostic reports a Defect/CodexAppServerFailure with operation close and category Ownership. This distinguishes successful domain cancellation from failed resource finalization; a consumer must not infer Run cancellation failure from process exit alone. The journal subsequently confirmed TaskClaimReleased at position 229 and WorkflowRunTerminated at position 232, proving ownership was settled despite the close error. Independent root-owned pnpm check-all and broad integration remain live; no feature acceptance is claimed.

## First successful full candidate gate

Finalization executor committed 53e02d93 (Bound coverage worker contention and recover movement safety tests), leaving its task worktree clean. It recovered the feature candidate, typed safety tests and a four-worker Vitest cap. The actual full pnpm check-all completed successfully: 342 test files/4810 tests pass; statements 99.47%,branches 99.00%,functions 99.01%,lines 99.56%;277 of 300 successful output lines. No coverage threshold, test timeout, inventory or stage deadline changed. Fresh Standards, Spec and medium task-model reviews report no blockers and include safety tests/worker cap. Focused ordinary-Huly MCP/CLI movement passed again. Broad external integration remains live; candidate acceptance/integration and later #306–311 delivery are not yet proved.

## Finalization Run cancellation and prerequisite handoff

The retained #306 candidate1654ff15 passed the full quality gate (4810 tests, all coverage metrics at least99%) and fresh reviews. The implementer returned Failed honestly because broad external verification had one missing MCP response; neither a focused diagnostic pass nor the quality gate established acceptance. The supported cancel command then exited0 with RunDispositionCancelled. Offline journal inspection confirms TaskClaimReleased at position630 and WorkflowRunTerminated at635. No active executor remains for that Run. All six requested issues remain unaccepted.

To mitigate the previously inspected fixed planner base, the isolated project's current instructions require dependent workers to merge the accepted integration head into their Dalph-owned worktree before implementing their slice, while retaining the immutable planned base in review evidence. This is an overseer handoff mitigation, not proof that Dalph automatically advances attempt bases. Older recovery directions were consolidated into one current five-commit candidate handoff so workers cannot accidentally omit the final coverage-worker cap.

## User-directed integration cadence correction

Measured broad verification on306 took71minutes for MCP full and11minutes for CLI smoke; full CLI was still running after22minutes. The broad MCP result was1441passes and one document-edit missing-response failure; the unchanged focused diagnostic passed27cases, so no production defect was established by that failure. The useful movement integration evidence separately established ordinary-Huly trigger behavior and remains recorded.

The user explicitly requested integration suites only at the end of the six-task delivery. The overseer updated the isolated worker instructions to defer all new live integration until final combined certification, while preserving per-slice check-all and parallel reviews, authored live cases and every issue criterion. Intermediate code acceptance must not claim final live certification. The pending rerun/conditional launcher were stopped before any execution. The active CLI suite was interrupted through its existing EXIT cleanup path; its incomplete result cannot be counted as a pass. The short-lived delivery Run was cancelled through the supported command (exit0; journal TaskClaimReleased53 and WorkflowRunTerminated58), then replaced by a fresh final-only-run from documentation baseb0d90d49. This cadence change is user direction and an orchestration correction, not a Dalph code defect.

## Local GitHub circuit interrupts a healthy worker

The end-only integration Run hit Dalph's local GitHub request circuit while306was running check-all and three fresh reviewers had reported no blockers. After stopping the coordinator for read-only journal inspection, position96 records FocusedTaskClaimFactsUnreadable; positions98 and103 record TrackerAdapterReadError/CircuitOpen with the exact explanation: “GitHub request circuit is open after120requests in60seconds; retrying is locally deferred for30seconds.” Position101 records ExecutorWorkSafelySuspended, and the provider transcript records an intentional interrupted turn at23:04:59UTC. This is evidence of a local host admission limit, not remote GitHub quota exhaustion or a10-minute tool timeout. The public view then waited on an unestablished graph rather than resuming automatically.

Supported same-Run restart recovered the existing worker thread and began turn01a10408-959c-74f2-a7b6-0a14bc9f26a0, preserving the five recovered commits and report edits. Production configuration exposes activationInterval/failureCooldown, but the GitHub circuit's default120-request budget is not exposed in the public JSON configuration; its host adapter override is an internal seam. The overseer prepared a slower2-minute activation/30-second failure cadence for the next supported recovery. That mitigation has not yet been applied by the live host or proven effective. A circuit-open observation should delay reconfirmation without generating a repeated read burst or permanently stranding safely suspended work.

## Integrator thread census scans large Codex history

Dalph accepted306candidate76d94c4b and recorded IntegrationStarted245/IntegratorRunStarted265, but the provider remained CandidateReady with no thread. Tracker reads were healthy after slower-cadence recovery. The adapter next calls scoped thread/list. Installed Codex0.160.0's generated ThreadListParams schema confirms the request is valid and documents useStateDbOnly: the default may scan JSONL rollouts to repair metadata. A real read-only probe observed no default response after180seconds; the supported DB-only request returned in0.03seconds. This home contains16195rollouts totaling about64GB. A complete first-record census found zero unreadable metadata and no thread matching the exact integrator directory, agreeing with the DB result. The costly default scan is the identified provider boundary; no product-code failure or GitHub-limit failure explains this state.

The overseer selected an external scoped transport through the public codexExecutable configuration. It adds useStateDbOnly only for the one verified candidate directory; forwards real provider responses unchanged; preserves pagination, loaded-thread census and all Dalph ownership guards; and execs the real native leader so its PID/process group remain authoritative. The standalone probe passes with Dalph's actual global policy flags. An initial wrapper missed global flags preceding app-server and was corrected before the final native-leader version was applied. This is a narrowly recorded compatibility workaround, not a change to Dalph source or a synthetic provider response. Future scopes require separate evidence before being admitted.

The old host's shutdown eventually reported ApplicationExitDisposition TimedOut and processexit1. A prematurely started recovery was rejected with startup.ownership_conflict; the overseer waited for terminal exit before starting the corrected recovery. Successful integrator progression is still unproven and must be inspected before claiming the workaround resolved the workflow.

## First promoted slice and task identity ambiguity

The scoped provider workaround did unblock integration: Dalph promoted accepted306 candidate76d94c4b through merge200075a4e86c21791130d57277bb252203b403a6, published to the isolated local bare master, removed its integrator resource, and closed GitHub306 at2026-10-03T23:50:18Z. This is intermediate code acceptance; final combined live certification remains pending. The canonical checkout has not yet received the six-slice feature integration.

The next worker received the complete307 specification headed “Move a compatible leaf issue across projects with verifiable outcomes” and fast-forwarded its worktree to200075a4. Nevertheless, its terminal report interpreted immutable RunTarget311 as its assigned issue and demanded accepted307–310 prerequisites. It made no implementation changes. The overall target URL and actual per-task body are insufficiently distinguished for an LLM consumer, aggravated by stale recovery instructions in the project handoff. The overseer removed those obsolete instructions and added an explicit title-to-issue/prerequisite table:307 needs306 only. This is both a task-envelope usability failure and a corrected overseer instruction defect; it does not prove missing307 prerequisites.

GitHub's GraphQL rateLimit query separately reported remaining0/used5000 with reset23:55:07UTC, while REST rate-limit information reported ample quota. REST issue reads still worked. GraphQL's own counter later reset, showing remaining4733 and next reset00:55:15UTC. The discrepancy and consumption require investigation; these observations do not establish that this Run alone spent all5000 points. Cached issue bodies and REST reads are now documented for worker specification access.

The old coordinator was stopped and confirmed terminal before supported cancellation. Cancellation initially rejected concurrent coordinator ownership as expected. After the host exited, cancellation emitted RunDispositionCancelled; the offline journal proves TaskClaimReleased553 and WorkflowRunTerminated558. Process exit1 again reflected a CodexAppServerFailure during close after domain cancellation. The isolated master checkout's index/worktree still matched old planned baseb0d90d49 exactly despite its master ref having advanced to200075a4; the overseer confirmed identical tree hashes before refreshing that checkout from the accepted head. Dalph should refresh or clearly document a checked-out integration ref after promotion so stale files are not mistaken for uncommitted reversions.

Documentation-only setup3377a1b5 preserves306 and removes task ambiguity. A fresh assigned-task-run uses that immutable base, capacity2 and the slower2-minute activation cadence; Dalph retains all worker/reviewer/integrator ownership. No new live Huly suite was started. Documentation-only commits bypass hooks because canonical dependencies are Darwin-native; feature validation remains the Linux-local check-all gate.
