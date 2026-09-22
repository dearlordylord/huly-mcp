# Ralph Loop - Complete Guide

## What Ralph Actually Is

**Core insight:** A bash loop that invokes fresh Claude CLI sessions, not a persistent agent.

```bash
while :; do
  echo "$task_prompt" | claude --dangerously-skip-permissions --model opus
  # verify commit + quality gates
  # move to next task
done
```

Each task = **NEW Claude session** with **ZERO prior context**.

Memory = git commits + files, NOT chat history.

## What I Misunderstood (and How I Fixed It)

### Initial Wrong Approach
- **Mistake**: Tried to implement tasks myself in continuous session
- **Why wrong**: Violates Ralph's core principle - accumulates context pollution
- **From RALPH.md**: "claude code plugin approach is accidentally anti-ralph - it keeps pounding the model in a single session until context rots"

### What Ralph Actually Does
- **Bash loop runs outside** as orchestrator
- **Each iteration**:
  1. Build prompt from files (task + guardrails + progress)
  2. Invoke fresh Claude via: `/Users/firfi/.claude/local/claude --dangerously-skip-permissions --model opus`
  3. Fresh Claude reads prompt, implements ONE task, commits, exits
  4. Loop checks git/quality gates
  5. Next task = NEW Claude (rotation = fresh context)

### The Breakthrough
- **Key phrase**: "it's a bash loop that is automatically running Claude at each task"
- **Tool**: `claude` CLI (not external API, not continuous session)
- **Flag**: `--dangerously-skip-permissions` to run without user prompts
- **Path**: `/Users/firfi/.claude/local/claude` (full path needed in subprocess)

## How It Works

### Architecture
```
bash loop (.ralph/ralph-loop.sh)
  ├─ read TASKS.md (extract task N)
  ├─ build focused prompt (task + .ralph/guardrails.md + .ralph/progress.md)
  ├─ pipe to: claude CLI --model opus
  │   └─ FRESH Claude session:
  │       ├─ reads prompt (zero prior context)
  │       ├─ implements ONLY task N
  │       ├─ runs quality gates
  │       ├─ commits changes
  │       └─ exits
  ├─ verify commit exists
  ├─ run quality gates (.ralph/quality-gates.sh)
  ├─ update .ralph/progress.md
  └─ repeat for task N+1 (ROTATION)
```

### State Files
- **TASKS.md**: 13 tasks to complete (source of truth)
- **.ralph/state.json**: `{current_task, failure_count, completed_tasks}`
- **.ralph/progress.md**: Checklist updated after each success
- **.ralph/guardrails.md**: Learned constraints (grows from failures)
- **.ralph/errors.log**: Failure history
- **.ralph/last-prompt.txt**: Last prompt sent (debugging)

### Task Prompts
Each fresh Claude receives:
```markdown
# RALPH TASK EXECUTION - TASK N

You are a fresh Claude session with NO prior context.
Your ONLY job: complete this ONE task.

## Your Task
[Task N extracted from TASKS.md]

## Critical Context
Read these files FIRST:
1. `.ralph/guardrails.md` - learned constraints (MUST follow)
2. `PRD.md` - full requirements (for reference)
3. `.ralph/progress.md` - what's already done

## Success Criteria
1. Implement ONLY this task (nothing more, nothing less)
2. Follow ALL guardrails
3. Write tests (testable + dependency injectable)
4. Commit when done

Start now. Focus. One task only.
```

**Critical**: Prompt emphasizes ONE task only, not whole PRD.

### Gutter Detection
- Tracks consecutive failures per task
- After 3 failures: adds guardrail, resets counter
- Prevents infinite loops on same mistake
- Guardrails accumulate so fresh sessions learn from past failures

### Quality Gates
All must pass before task marked complete:
1. TypeScript type checking (`npm run typecheck`)
2. Tests (`npm test`)
3. Linting (`npm run lint`)

## Prerequisites

```bash
# Install dependencies
npm install

# Disable GPG signing (for auto-commits)
git config --local commit.gpgsign false

# Verify jq installed (state management)
which jq  # Should show: /opt/homebrew/bin/jq

# Verify claude CLI exists
ls -la /Users/firfi/.claude/local/claude
```

## Run Ralph

```bash
./.ralph/ralph-loop.sh
```

**What happens:**
- Loop starts at task 1
- Invokes fresh Claude for task 1
- Claude implements, commits, exits
- Loop validates, marks complete
- Moves to task 2 (ROTATION)
- Fresh Claude for task 2 (zero context from task 1)
- Repeats until all 13 tasks done

## Monitor Progress

Open separate terminals:

```bash
# Terminal 1: Run loop
./.ralph/ralph-loop.sh

# Terminal 2: Watch progress
watch -n 5 cat .ralph/progress.md

# Terminal 3: Watch errors
tail -f .ralph/errors.log

# Terminal 4: Check last prompt (if debugging)
cat .ralph/last-prompt.txt
```

## Manual Intervention

If loop gets stuck:

1. **Stop**: Ctrl+C
2. **Diagnose**:
   ```bash
   cat .ralph/errors.log          # What failed?
   cat .ralph/last-prompt.txt     # What was sent?
   git log --oneline -5           # What committed?
   ```
3. **Fix**: Manually resolve issue
4. **Learn**: Add constraint to `.ralph/guardrails.md`
5. **Resume**: `./.ralph/ralph-loop.sh` (continues from current task)

### Resetting State

```bash
# Reset to task 1
echo '{"current_task": 1, "failure_count": 0, "completed_tasks": []}' > .ralph/state.json

# Reset progress checkboxes
git checkout .ralph/progress.md

# Clear error log
echo -e "# Error Log\n\nFailures logged here.\n\n---\n" > .ralph/errors.log
```

## Key Principles (Why Ralph Works)

### 1. Context Pollution is Inevitable
From RALPH.md: "every ai coding session has a context window... failures accumulate like plaque"

**Symptom cluster:**
- Repeating itself
- "Fixing" same bug in different ways
- Undoing its own previous fix
- Circular reasoning with commit rights

**Ralph's solution:** Don't fight pollution - **rotate before it builds up**.

### 2. Memory = Files, Not Chat
```
Context (bad for state)        Files + Git (good for state)
├─ dies with conversation     ├─ persists forever
├─ polluted by dead ends      ├─ only what you choose to write
├─ can't be deleted           ├─ can be patched/rolled back
└─ memory can drift           └─ git doesn't hallucinate
```

### 3. Progress Persists, Failures Evaporate
- **Committed code** = permanent progress
- **Failed attempts** = logged but don't pollute next attempt
- **Guardrails** = lessons learned (failures → constraints)

### 4. Fresh Context Per Task
Each Claude invocation:
- Reads current state from files
- Implements one task
- Commits changes
- Exits

Next invocation knows nothing about previous session. Only knows what's in files.

### 5. The Loop is NOT the Technique
From RALPH.md: "the loop is not the technique. state hygiene is the technique."

**State hygiene:**
- Task definitions persist (TASKS.md)
- Constraints accumulate (guardrails.md)
- Progress is visible (progress.md, git log)
- Failures are logged but don't pollute (errors.log)
- Each session reconstructs reality from files

## Project-Specific: Effect + Testability

### Guardrails (Already Set)
- ALWAYS follow `docs/mcps/effect.md`; consult the installed rc.117 declarations, `node_modules/effect/AGENTS.md`, and the pinned v4 source before writing Effect code
- No `any` types in src/
- Use `Schema` from `effect` for validation
- Tagged errors throughout (Schema.TaggedError)
- **Service/Layer dependency injection** (critical for testing)

### Testability Requirement
Every implementation MUST be:
- **Dependency injectable** via Effect Context
- **Mockable** via Layer.succeed()
- **Testable** with @effect/vitest

Example:
```typescript
// Service definition with Context.Tag
class HulyClient extends Context.Tag("HulyClient")<HulyClient, {...}>() {
  static readonly layer = Layer.effect(...)      // Production
  static readonly testLayer = Layer.succeed(...) // Tests
}

// Tests inject mock
const program = Effect.gen(function*() {
  const client = yield* HulyClient
  // use client
})

Effect.runPromise(program.pipe(Effect.provide(HulyClient.testLayer)))
```

### Quality Gates Enforce This
- Tests must pass (mocked services via Layers)
- TypeScript must pass (proper types, no `any`)
- If not testable/injectable → quality gates fail → task retries

## Timeline Expectations

- **Per task**: 5-15 minutes (with retries)
- **All 13 tasks**: 2-4 hours
- **Faster if**: No failures, clear task definitions
- **Slower if**: Complex tasks, gutter detection triggered

## Success Indicators

Loop completes when:
- All 13 tasks in `.ralph/progress.md` marked `[x]`
- 13+ commits in git log (one per task minimum)
- All quality gates passing
- MCP server ready for verification (task 13)

## Debugging Common Issues

### "claude: command not found"
**Fixed in loop** - uses full path: `/Users/firfi/.claude/local/claude`

If needed, override:
```bash
CLAUDE_CLI=/custom/path/to/claude ./.ralph/ralph-loop.sh
```

### Quality gates fail immediately
```bash
# Test manually
npm run typecheck  # Should pass
npm test          # Should pass
npm run lint      # Should pass
```

Fix baseline, then restart loop.

### Task keeps retrying
Check `.ralph/last-prompt.txt` - is task definition clear?
Check `.ralph/errors.log` - what's failing?
Add constraint to `.ralph/guardrails.md` if needed.

### Gutter loops forever
- Task might be too large (split into subtasks in TASKS.md)
- Constraint might be unclear (clarify in guardrails.md)
- May need manual intervention

## File Structure Reference

```
.
├── TASKS.md                    # 13 tasks (source of truth)
├── PRD.md                      # Full requirements (reference)
├── CLAUDE.md                   # Project instructions (auto-loaded)
├── RALPH.md                    # Ralph philosophy
├── START_RALPH.md              # This file
│
├── .ralph/
│   ├── ralph-loop.sh           # Main orchestrator (executable)
│   ├── quality-gates.sh        # Validation script (executable)
│   ├── state.json              # Current task, failures, completed
│   ├── progress.md             # Task checklist (auto-updated)
│   ├── guardrails.md           # Learned constraints (grows)
│   ├── errors.log              # Failure history
│   └── last-prompt.txt         # Last prompt sent (debug)
│
├── src/                        # Implementation (grows as tasks complete)
├── test/                       # Tests (grows as tasks complete)
└── package.json                # Dependencies
```

## Final Understanding: The Ralph Insight

**Before understanding Ralph:**
"I'll implement all 13 tasks in this session, maintaining context throughout."

**After understanding Ralph:**
"I'll orchestrate 13 fresh Claude sessions. Each implements one task with zero prior context. Memory lives in git and files, not in any single session's context window."

**Why this matters:**
- **Context pollution is inevitable** in long sessions
- **Rotation prevents pollution** from accumulating
- **State hygiene** (files + git) is the real technique
- **Fresh context** = consistent quality across all tasks

Ralph isn't about smarter agents. It's about **accepting context pollution as inevitable and rotating before it happens**.

---

## Ready to Run

```bash
./.ralph/ralph-loop.sh
```

Watch it grind through all 13 tasks. Each with fresh eyes.
