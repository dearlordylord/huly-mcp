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
