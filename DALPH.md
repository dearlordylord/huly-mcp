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
