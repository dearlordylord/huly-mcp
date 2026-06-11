# Ralph Sandcastle Experiment

This is a local experiment for running three Sandcastle lanes inside this
`hulymcp` checkout.

The loop is:

1. Planner creates a Markdown plan file with atomic task loads.
2. Implementer picks exactly one next task.
3. Reviewer checks that task against repo review rules and local style.
4. Requested changes return to the same implementer session.
5. Cleanup commits or acknowledges existing commits.
6. The task is marked done, then the lane continues.

The pure loop lives in `src/ralph-loop.ts` and is unit-tested with in-memory
agent/store services. The real Sandcastle adapter lives in `run.ts`.

```bash
cd .ralph
pnpm install
pnpm check
pnpm run
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
```

The defaults are intentionally bounded for the first experiment: three
documentation/spike lanes in parallel, one task per lane, scripted agents, and a
review loop capped at three attempts. Set `RALPH_AGENT_MODE=codex` to use real
Codex agents. In Codex mode, the planner runs from `.ralph` in read-only/no-rules
mode so it does not spend context exploring the repository, the implementer uses
medium reasoning, and the reviewer gets the strongest reasoning setting by
default.

While the loop is running, inspect:

```bash
cat .ralph/progress.md
cat .ralph/status.json
tail -f .ralph/logs/events.jsonl
ls .ralph/logs
```

Each planner, implementer, reviewer, and cleanup call also writes a dedicated log
file under `.ralph/logs` in Codex mode.

The runner uses `@ai-hero/sandcastle` from
https://github.com/mattpocock/sandcastle for one git worktree per lane.
Sandcastle expects a repo-root `.sandcastle` directory, so this checkout uses a
local `.sandcastle -> .ralph/sandcastle` symlink and stores the actual runtime
worktrees under `.ralph/sandcastle/worktrees`.

Codex role execution uses direct `codex exec ... -o <final> -` calls wrapped in
Effect resource management because the installed Sandcastle Codex adapter did not
complete reliably in this container. The worktree is the isolation boundary for
this experiment.
