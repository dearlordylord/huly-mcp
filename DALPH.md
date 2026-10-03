# Dalph feedback: issues 306–311

## Run preparation (2026-10-03)

- Selected delivery graph: GitHub parent #305 and child implementation issues #306–311. Native dependencies permit #308 and #309 concurrently after #307.
- No pre-existing live Dalph process or run for this delivery was found.
- Canonical huly-mcp dependencies contain Darwin native binaries. An isolated clone with Linux-local dependencies is required; the canonical bootstrap helper otherwise links platform-incompatible node_modules.
- Dalph checkout has concurrent uncommitted edits. A clean local clone pinned to e7b7f34aa5668bd97d04f599ba3f5324a478d0c0 isolates this run from those edits.
- The default Codex task instruction requests a fresh reviewer but does not specify the requested code-review skill’s separate Standards and Spec axes. Delivery-local repository instructions supply that requirement and the missing docs/agents/issue-tracker.md.
- Executor profile worktree preparation currently supports only dalph-worktree. For this external project, generated worktrees must run the project bootstrap helper explicitly; the helper must target the isolated repository for platform-local dependencies.

Run artifacts are retained at /tmp/hulymcp-dalph-306-311. Implementation, review, integration, and final verification are pending.
