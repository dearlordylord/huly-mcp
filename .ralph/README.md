# Ralph Sandcastle Harness

This is the local Ralph/Sandcastle harness for running parallel production
lanes inside this `hulymcp` checkout. It is intentionally small: the pure loop
is an Effect service that can be tested in memory, while `run.ts` is the
Codex/Sandcastle adapter.

The loop is:

1. Planner creates a Markdown plan file with atomic task loads.
2. Implementer picks exactly one next task.
3. Reviewer checks that task against repo review rules and local style.
4. Requested changes return to the same implementer session.
5. Cleanup commits or acknowledges existing commits.
6. The task is marked done, then the lane continues.

The pure loop lives in `src/ralph-loop.ts` and is unit-tested with in-memory
agent/store services. The real Sandcastle adapter lives in `run.ts`.

## Run

```bash
cd .ralph
pnpm install
pnpm check
RALPH_AGENT_MODE=codex \
RALPH_MAX_TASKS_PER_LANE=1 \
RALPH_MAX_REVIEW_ATTEMPTS=12 \
RALPH_LANE_CONCURRENCY=3 \
RALPH_PLANNER_EFFORT=low \
RALPH_IMPLEMENTER_EFFORT=medium \
RALPH_REVIEWER_EFFORT=xhigh \
RALPH_CLEANUP_EFFORT=low \
pnpm run run
```

Runtime knobs:

```bash
RALPH_AGENT_MODE=scripted
RALPH_CODEX_MODEL=gpt-5.5
RALPH_PLANNER_EFFORT=low
RALPH_IMPLEMENTER_EFFORT=medium
RALPH_REVIEWER_EFFORT=xhigh
RALPH_CLEANUP_EFFORT=low
RALPH_MAX_TASKS_PER_LANE=1
RALPH_MAX_REVIEW_ATTEMPTS=12
RALPH_LANE_CONCURRENCY=3
```

`RALPH_AGENT_MODE=scripted` is only a smoke test for orchestration. It must not
be used to judge product scope. Production work uses `RALPH_AGENT_MODE=codex`.
In Codex mode, the planner runs from `.ralph` with low effort and no repository
exploration, implementers run in lane worktrees with write access, reviewers run
with the strongest reasoning setting, and cleanup commits intentional changes.
If a lane exhausts `RALPH_MAX_REVIEW_ATTEMPTS`, Ralph records that lane as
failed but lets sibling lanes finish before the process exits non-zero.
By default, lane concurrency is the number of configured lane specs. Set
`RALPH_LANE_CONCURRENCY` only to intentionally run fewer lanes at a time.

## Current Lanes

Lane specs live in `run.ts` in `laneSpecs`.

- `core-role-assignment`: typed-space role membership mutations.
- `chat-message-pin-state`: external Gmail/Telegram channel message visibility.
- `package-viability-spike`: board/inventory/products package viability
  discovery.

When changing lanes, edit `laneSpecs` and keep prompt text production-accurate.
Do not leave scripted-mode fallback text that contradicts the lane specs;
reviewers may inspect `run.ts`.

## Observe

While the loop is running, inspect:

```bash
cat .ralph/progress.md
cat .ralph/status.json
tail -f .ralph/logs/events.jsonl
ls .ralph/logs
```

Each planner, implementer, reviewer, and cleanup call also writes a dedicated log
file under `.ralph/logs` in Codex mode. The branch worktrees are under:

```bash
.sandcastle/worktrees/ralph-*
```

Useful branch snapshot:

```bash
for d in .sandcastle/worktrees/ralph-*; do
  echo "## $d"
  git -C "$d" status --short
  git -C "$d" log --oneline -5
done
```

## Runtime Layout

The runner uses `@ai-hero/sandcastle` from
https://github.com/mattpocock/sandcastle for one git worktree per lane.
Sandcastle expects a repo-root `.sandcastle` directory, so this checkout uses a
local `.sandcastle -> .ralph/sandcastle` symlink and stores the actual runtime
worktrees under `.ralph/sandcastle/worktrees`.

Codex role execution uses direct `codex exec ... -o <final> -` calls wrapped in
Effect resource management because the installed Sandcastle Codex adapter did not
complete reliably in this container. The worktree is the isolation boundary for
this experiment.

`run.ts` reuses an existing checked-out lane worktree if the branch is already
checked out. This allows a failed/interrupted run to be restarted without
deleting useful product work.

## Recovery

If a run fails:

1. Check `progress.md`, `logs/events.jsonl`, and the newest role log.
2. Check for live hulymcp Ralph/Codex children before restarting:

   ```bash
   ps -eo pid,ppid,stat,etime,cmd | rg 'hulymcp/.ralph|hulymcp/.sandcastle|ralph-'
   ```

3. Do not delete lane worktrees until their `git status` and unmerged commits
   have been inspected.
4. Fix harness bugs on `master`, run `cd .ralph && pnpm check`, commit, push,
   and merge `master` into each lane branch.
5. Restart with `RALPH_AGENT_MODE=codex ... pnpm run run`.

If a reviewer rejects for a contradicted task scope, check the lane plan and
`run.ts` first. The production lane prompt is authoritative; scripted-mode
fallback text is not.

## Branches And PRs

The production branches are ordinary git branches:

- `ralph/core-role-assignment`
- `ralph/chat-message-pin-state`
- `ralph/package-viability-spike`

Before pushing a lane branch or opening a PR, verify that cleanup committed the
final changes, review passed, and the branch does not contain unrelated harness
or failed-review artifacts unless they are intentional.
