#!/usr/bin/env tsx
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { appendFile, lstat, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import * as sandcastle from "@ai-hero/sandcastle"
import { Effect, Layer, Schema } from "effect"

import {
  makeFileBackedRalphPlanStore,
  makeRalphAgentNotes,
  makeRalphBranchName,
  makeRalphCommitSha,
  makeRalphLaneId,
  makeRalphPlanFile,
  makeRalphPromptText,
  makeRalphTaskId,
  makeRalphTaskLoad,
  makeRalphTaskTitle,
  RalphAgent,
  runRalphLanes,
  type RalphCommitSha,
  type RalphLaneSpec,
  type RalphLoopObserver,
  type RalphTaskId
} from "./src/ralph-loop.js"

const experimentRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(experimentRoot, "..")
const sandcastleAnchorPath = join(repoRoot, ".sandcastle")
const sandcastleRuntimeRoot = join(experimentRoot, "sandcastle")
const plansRoot = join(experimentRoot, "plans")
const logsRoot = join(experimentRoot, "logs")
const statusPath = join(experimentRoot, "status.json")
const progressPath = join(experimentRoot, "progress.md")
const eventsPath = join(logsRoot, "events.jsonl")
const execFilePromise = promisify(execFile)

const PlanOutputSchema = Schema.Struct({
  tasks: Schema.Array(Schema.Struct({
    id: Schema.String.pipe(Schema.nonEmptyString()),
    title: Schema.String.pipe(Schema.nonEmptyString()),
    load: Schema.String.pipe(Schema.nonEmptyString())
  }))
})

const ReviewOutputSchema = Schema.Struct({
  ok: Schema.Boolean,
  notes: Schema.String
})

type PlanOutput = Schema.Schema.Type<typeof PlanOutputSchema>
type ReviewOutput = Schema.Schema.Type<typeof ReviewOutputSchema>

const CodexEffortSchema = Schema.Literal("low", "medium", "high", "xhigh")
type CodexEffort = Schema.Schema.Type<typeof CodexEffortSchema>

const ThreadStartedEventSchema = Schema.Struct({
  type: Schema.Literal("thread.started"),
  thread_id: Schema.String.pipe(Schema.nonEmptyString())
})

interface CodexExecRole {
  readonly name: string
  readonly effort: CodexEffort
  readonly ephemeral: boolean
  readonly fullAccess: boolean
  readonly ignoreRules: boolean
  readonly workspace: "experiment" | "lane"
}

interface CodexExecResult {
  readonly stdout: string
  readonly finalMessage: string
  readonly commits: ReadonlyArray<RalphCommitSha>
  readonly sessionId?: string
}

interface ManagedCodexProcess {
  readonly child: ChildProcessWithoutNullStreams
  readonly markExited: () => void
  readonly hasExited: () => boolean
}

type RalphRuntimeStage =
  | "idle"
  | "planning"
  | "planned"
  | "implementing"
  | "reviewing"
  | "cleanup"
  | "task_done"
  | "lane_done"
  | "failed"

interface RalphLaneStatus {
  readonly laneId: string
  readonly branch: string
  readonly planFile: string
  readonly stage: RalphRuntimeStage
  readonly tasksDone: number
  readonly tasksTotal: number
  readonly lastUpdatedAt: string
  readonly currentTaskId?: string
  readonly currentTaskTitle?: string
  readonly attempt?: number
  readonly lastError?: string
}

interface RalphRunStatus {
  readonly startedAt: string
  readonly updatedAt: string
  readonly lanes: Record<string, RalphLaneStatus>
}

const extractTaggedJson = <A, I>(
  stdout: string,
  tag: string,
  schema: Schema.Schema<A, I>
): A => {
  const match = stdout.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (match?.[1] === undefined) {
    throw new Error(`Agent did not emit <${tag}> JSON.\n\n${stdout}`)
  }
  return Schema.decodeUnknownSync(schema)(JSON.parse(match[1]))
}

const isNodeError = (cause: unknown): cause is NodeJS.ErrnoException => cause instanceof Error && "code" in cause

const ensureSandcastleRuntimeAnchor = (): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(sandcastleRuntimeRoot, { recursive: true })

      try {
        const anchor = await lstat(sandcastleAnchorPath)
        if (anchor.isSymbolicLink()) return
        if (!anchor.isDirectory()) {
          throw new Error(`${sandcastleAnchorPath} exists and is not a directory or symlink`)
        }

        const entries = await readdir(sandcastleAnchorPath)
        if (entries.length > 0) {
          throw new Error(`${sandcastleAnchorPath} is not empty; move it aside before running Ralph`)
        }

        await rm(sandcastleAnchorPath, { recursive: true })
      } catch (cause) {
        if (!isNodeError(cause) || cause.code !== "ENOENT") throw cause
      }

      await symlink(".ralph/sandcastle", sandcastleAnchorPath, "dir")
    },
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

const laneSpecs: ReadonlyArray<RalphLaneSpec> = [
  {
    laneId: makeRalphLaneId("core-role-assignment"),
    branch: makeRalphBranchName("ralph/core-role-assignment"),
    planFile: makeRalphPlanFile("core-role-assignment.md"),
    prompt: makeRalphPromptText(
      "Create a documentation-only spike plan for the next SDK parity slice around typed-space role assignment mutations. Do not request production code in this experiment."
    )
  },
  {
    laneId: makeRalphLaneId("chat-message-pin-state"),
    branch: makeRalphBranchName("ralph/chat-message-pin-state"),
    planFile: makeRalphPlanFile("chat-message-pin-state.md"),
    prompt: makeRalphPromptText(
      "Create a documentation-only spike plan for pinned chat message state and related tests. Do not request production code in this experiment."
    )
  },
  {
    laneId: makeRalphLaneId("package-viability-spike"),
    branch: makeRalphBranchName("ralph/package-viability-spike"),
    planFile: makeRalphPlanFile("package-viability-spike.md"),
    prompt: makeRalphPromptText(
      "Create a documentation-only dependency viability spike for package-heavy Huly parity issues. Do not request production code in this experiment."
    )
  }
]

const logName = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, "-")

const readCodexEffort = (name: string, fallback: CodexEffort): CodexEffort => {
  const value = process.env[name]
  return value === undefined ? fallback : Schema.decodeUnknownSync(CodexEffortSchema)(value)
}

const readPositiveInteger = (name: string, fallback: number): number => {
  const value = process.env[name]
  if (value === undefined) return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

const renderPromptFile = (
  promptFile: string,
  promptArgs: Record<string, string>
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const template = await readFile(promptFile, "utf8")
      return Object.entries(promptArgs).reduce(
        (prompt, [key, value]) => prompt.split(`{{${key}}}`).join(value),
        template
      )
    },
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

const parseThreadId = (line: string): string | undefined => {
  try {
    return Schema.decodeUnknownSync(ThreadStartedEventSchema)(JSON.parse(line)).thread_id
  } catch {
    return undefined
  }
}

const gitOutput = async (
  cwd: string,
  args: ReadonlyArray<string>
): Promise<string> => {
  const result = await execFilePromise("git", [...args], {
    cwd,
    encoding: "utf8"
  })
  return result.stdout.trim()
}

const currentCommit = (cwd: string): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: () => gitOutput(cwd, ["rev-parse", "HEAD"]),
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

const collectNewCommits = (
  cwd: string,
  beforeSha: string
): Effect.Effect<ReadonlyArray<RalphCommitSha>, Error> =>
  Effect.tryPromise({
    try: async () => {
      const output = await gitOutput(cwd, ["rev-list", "--reverse", `${beforeSha}..HEAD`])
      return output === ""
        ? []
        : output.split("\n").map((sha) => makeRalphCommitSha(sha))
    },
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

const waitForCodexExit = (
  processInfo: ManagedCodexProcess,
  logPath: string
): Effect.Effect<{ readonly stdout: string; readonly sessionId?: string }, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<{ readonly stdout: string; readonly sessionId?: string }>((resolvePromise, rejectPromise) => {
        let stdout = ""
        let stderr = ""
        let sessionId: string | undefined

        processInfo.child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8")
          stdout = stdout.concat(text)
          for (const line of text.split("\n")) {
            const parsedSessionId = parseThreadId(line)
            if (parsedSessionId !== undefined) {
              sessionId = parsedSessionId
            }
          }
          void appendFile(logPath, text)
        })

        processInfo.child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8")
          stderr = stderr.concat(text)
          void appendFile(logPath, text)
        })

        processInfo.child.once("error", (error) => {
          processInfo.markExited()
          rejectPromise(error)
        })

        processInfo.child.once("close", (code, signal) => {
          processInfo.markExited()
          if (code === 0) {
            resolvePromise({ stdout, ...(sessionId === undefined ? {} : { sessionId }) })
          } else {
            rejectPromise(new Error(`codex exited with code ${code ?? "null"} signal ${signal ?? "null"}\n${stderr}`))
          }
        })
      }),
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

const runCodexExec = (input: {
  readonly lane: RalphLaneSpec
  readonly worktreePath: string
  readonly role: CodexExecRole
  readonly prompt: string
  readonly logFile: string
  readonly finalFile: string
  readonly resumeSession?: string
}): Effect.Effect<CodexExecResult, Error> =>
  Effect.gen(function*() {
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(input.logFile), { recursive: true }),
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
    })
    yield* Effect.tryPromise({
      try: () => writeFile(input.logFile, `--- ${input.role.name} started: ${new Date().toISOString()} ---\n`),
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
    })
    const beforeSha = yield* currentCommit(input.worktreePath)

    return yield* Effect.acquireUseRelease(
      Effect.sync((): ManagedCodexProcess => {
        const baseArgs = input.resumeSession === undefined
          ? ["exec"]
          : ["exec", "resume", input.resumeSession]
        const args = [
          ...baseArgs,
          "--json",
          "-C",
          input.worktreePath,
          "-o",
          input.finalFile,
          "-m",
          process.env["RALPH_CODEX_MODEL"] ?? "gpt-5.5",
          "-c",
          `model_reasoning_effort="${input.role.effort}"`,
          ...(input.role.fullAccess ? ["--dangerously-bypass-approvals-and-sandbox"] : ["-s", "read-only"]),
          ...(input.role.ignoreRules ? ["--ignore-rules"] : []),
          ...(input.role.ephemeral ? ["--ephemeral"] : []),
          "-"
        ]
        const child = spawn("codex", args, {
          cwd: input.worktreePath,
          stdio: "pipe",
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: join(logsRoot, `${logName(String(input.lane.laneId))}.gitconfig`)
          }
        })
        let exited = false
        child.stdin.end(input.prompt)
        return {
          child,
          markExited: () => {
            exited = true
          },
          hasExited: () => exited
        }
      }),
      (processInfo) =>
        Effect.gen(function*() {
          const output = yield* waitForCodexExit(processInfo, input.logFile)
          const finalMessage = yield* Effect.tryPromise({
            try: () => readFile(input.finalFile, "utf8"),
            catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
          })
          const commits = yield* collectNewCommits(input.worktreePath, beforeSha)
          return {
            stdout: output.stdout.concat("\n", finalMessage),
            finalMessage,
            commits,
            ...(output.sessionId === undefined ? {} : { sessionId: output.sessionId })
          }
        }),
      (processInfo) =>
        Effect.sync(() => {
          if (!processInfo.hasExited()) {
            processInfo.child.kill("SIGTERM")
          }
        })
    )
  })

const clearTask = (status: RalphLaneStatus): RalphLaneStatus => {
  const {
    currentTaskId: _currentTaskId,
    currentTaskTitle: _currentTaskTitle,
    attempt: _attempt,
    ...rest
  } = status
  return rest
}

const renderProgressMarkdown = (status: RalphRunStatus): string => {
  const rows = Object.values(status.lanes).map((lane) => {
    const task = lane.currentTaskId === undefined ? "" : `\`${lane.currentTaskId}\` ${lane.currentTaskTitle ?? ""}`
    return `| \`${lane.laneId}\` | \`${lane.branch}\` | ${lane.stage} | ${task} | ${lane.tasksDone}/${lane.tasksTotal} | \`${lane.planFile}\` |`
  })

  return [
    "# Ralph Loop Progress",
    "",
    `Started: \`${status.startedAt}\``,
    `Updated: \`${status.updatedAt}\``,
    "",
    "| Lane | Branch | Stage | Current task | Done | Plan |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...rows,
    ""
  ].join("\n")
}

const makeInitialStatus = (lanes: ReadonlyArray<RalphLaneSpec>): RalphRunStatus => {
  const now = new Date().toISOString()
  const statuses: Record<string, RalphLaneStatus> = {}

  for (const lane of lanes) {
    statuses[String(lane.laneId)] = {
      laneId: String(lane.laneId),
      branch: String(lane.branch),
      planFile: String(lane.planFile),
      stage: "idle",
      tasksDone: 0,
      tasksTotal: 0,
      lastUpdatedAt: now
    }
  }

  return {
    startedAt: now,
    updatedAt: now,
    lanes: statuses
  }
}

const initializeRuntimeFiles = (lanes: ReadonlyArray<RalphLaneSpec>): Effect.Effect<RalphRunStatus, Error> =>
  Effect.tryPromise({
    try: async () => {
      const status = makeInitialStatus(lanes)
      await mkdir(logsRoot, { recursive: true })
      await writeFile(eventsPath, "")
      await writeFile(statusPath, JSON.stringify(status, null, 2).concat("\n"))
      await writeFile(progressPath, renderProgressMarkdown(status))
      return status
    },
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

const makeFileObserver = (initialStatus: RalphRunStatus): RalphLoopObserver => {
  let status = initialStatus
  let queue: Promise<void> = Promise.resolve()

  const persist = async (): Promise<void> => {
    await mkdir(logsRoot, { recursive: true })
    await writeFile(statusPath, JSON.stringify(status, null, 2).concat("\n"))
    await writeFile(progressPath, renderProgressMarkdown(status))
  }

  const update = (
    event: Record<string, string | number | boolean>,
    apply: (current: RalphRunStatus, now: string) => RalphRunStatus
  ): Effect.Effect<void, Error> =>
    Effect.tryPromise({
      try: () => {
        queue = queue.catch(() => undefined).then(async () => {
          const now = new Date().toISOString()
          status = apply(status, now)
          await persist()
          await appendFile(eventsPath, JSON.stringify({ at: now, ...event }).concat("\n"))
        })
        return queue
      },
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
    })

  const updateLane = (
    current: RalphRunStatus,
    lane: RalphLaneSpec,
    now: string,
    apply: (current: RalphLaneStatus) => RalphLaneStatus
  ): RalphRunStatus => {
    const laneId = String(lane.laneId)
    const laneStatus = current.lanes[laneId]
    if (laneStatus === undefined) return current

    const updatedLane = apply(laneStatus)
    const nextLane = updatedLane.lastUpdatedAt === now
      ? updatedLane
      : { ...updatedLane, lastUpdatedAt: now }
    return {
      ...current,
      updatedAt: now,
      lanes: {
        ...current.lanes,
        [laneId]: nextLane
      }
    }
  }

  return {
    laneStage: ({ lane, stage, task, attempt, error }) =>
      update(
        {
          lane: String(lane.laneId),
          stage,
          ...(task === undefined ? {} : { taskId: String(task.id) }),
          ...(attempt === undefined ? {} : { attempt }),
          ...(error === undefined ? {} : { error: `${error.name}: ${error.message}` })
        },
        (current, now) =>
          updateLane(current, lane, now, (laneStatus) => {
            const withTask = task === undefined
              ? laneStatus
              : {
                ...laneStatus,
                currentTaskId: String(task.id),
                currentTaskTitle: String(task.title)
              }
            const withAttempt = attempt === undefined ? withTask : { ...withTask, attempt }
            const withStage = {
              ...withAttempt,
              stage,
              ...(error === undefined ? {} : { lastError: `${error.name}: ${error.message}` })
            }
            return stage === "lane_done" ? clearTask(withStage) : withStage
          })
      ),
    planWritten: (plan) =>
      update(
        { lane: String(plan.laneId), event: "plan_written", tasksTotal: plan.tasks.length },
        (current, now) =>
          updateLane(
            current,
            {
              laneId: plan.laneId,
              branch: plan.branch,
              planFile: plan.planFile,
              prompt: makeRalphPromptText("observer")
            },
            now,
            (laneStatus) => ({
              ...laneStatus,
              tasksTotal: plan.tasks.length,
              tasksDone: plan.tasks.filter((task) => task.status === "done").length
            })
          )
      ),
    taskStatusChanged: ({ lane, task, status: taskStatus }) =>
      update(
        {
          lane: String(lane.laneId),
          taskId: String(task.id),
          taskStatus
        },
        (current, now) =>
          updateLane(current, lane, now, (laneStatus) => ({
            ...laneStatus,
            ...(taskStatus === "done" ? {} : {
              currentTaskId: String(task.id),
              currentTaskTitle: String(task.title)
            }),
            tasksDone: taskStatus === "done" ? laneStatus.tasksDone + 1 : laneStatus.tasksDone
          }))
      )
  }
}

const createWorktrees = async (
  lanes: ReadonlyArray<RalphLaneSpec>
): Promise<Map<string, sandcastle.Worktree>> => {
  const worktrees = new Map<string, sandcastle.Worktree>()

  for (const lane of lanes) {
    const worktree = await sandcastle.createWorktree({
      cwd: repoRoot,
      branchStrategy: {
        type: "branch",
        branch: lane.branch,
        baseBranch: "HEAD"
      }
    })
    worktrees.set(String(lane.laneId), worktree)
  }

  return worktrees
}

const createRalphAgentLayer = (worktrees: Map<string, sandcastle.Worktree>): Layer.Layer<RalphAgent> => {
  const implementerSessions = new Map<string, string>()
  const plannerRole: CodexExecRole = {
    name: "planner",
    ephemeral: true,
    fullAccess: false,
    ignoreRules: true,
    workspace: "experiment",
    effort: readCodexEffort("RALPH_PLANNER_EFFORT", "low")
  }
  const implementerRole: CodexExecRole = {
    name: "implementer",
    ephemeral: false,
    fullAccess: true,
    ignoreRules: false,
    workspace: "lane",
    effort: readCodexEffort("RALPH_IMPLEMENTER_EFFORT", "medium")
  }
  const reviewerRole: CodexExecRole = {
    name: "reviewer",
    ephemeral: true,
    fullAccess: false,
    ignoreRules: false,
    workspace: "lane",
    effort: readCodexEffort("RALPH_REVIEWER_EFFORT", "xhigh")
  }
  const cleanupRole: CodexExecRole = {
    name: "cleanup",
    ephemeral: true,
    fullAccess: true,
    ignoreRules: false,
    workspace: "lane",
    effort: readCodexEffort("RALPH_CLEANUP_EFFORT", "low")
  }

  const getWorktree = (lane: RalphLaneSpec): Effect.Effect<sandcastle.Worktree, Error> => {
    const key = String(lane.laneId)
    const existing = worktrees.get(key)
    if (existing !== undefined) return Effect.succeed(existing)

    return Effect.fail(new Error(`No pre-created worktree for lane ${lane.laneId}`))
  }

  const runInLane = (
    lane: RalphLaneSpec,
    options: {
      readonly name: string
      readonly promptFile: string
      readonly promptArgs: Record<string, string>
      readonly role: CodexExecRole
      readonly resumeSession?: string
    }
  ): Effect.Effect<CodexExecResult, Error> =>
    Effect.gen(function*() {
      const worktree = yield* getWorktree(lane)
      const prompt = yield* renderPromptFile(options.promptFile, options.promptArgs)
      const workspacePath = options.role.workspace === "lane" ? worktree.worktreePath : experimentRoot
      return yield* runCodexExec({
        lane,
        worktreePath: workspacePath,
        role: options.role,
        prompt,
        logFile: join(logsRoot, `${logName(String(lane.laneId))}-${logName(options.name)}.log`),
        finalFile: join(logsRoot, `${logName(String(lane.laneId))}-${logName(options.name)}.final.md`),
        ...(options.resumeSession === undefined ? {} : { resumeSession: options.resumeSession })
      })
    })

  return Layer.succeed(RalphAgent, {
    planLane: (lane) =>
      Effect.gen(function*() {
        const result = yield* runInLane(lane, {
            name: `planner:${lane.laneId}`,
            promptFile: join(experimentRoot, "prompts", "plan.md"),
            promptArgs: {
              LANE_ID: String(lane.laneId),
              LANE_PROMPT: String(lane.prompt)
            },
            role: plannerRole
          })
        const plan = yield* Effect.try({
          try: (): PlanOutput => extractTaggedJson(result.finalMessage, "ralph-plan", PlanOutputSchema),
          catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
        })
        return {
          laneId: lane.laneId,
          branch: lane.branch,
          planFile: lane.planFile,
          tasks: plan.tasks.map((task) => ({
            id: makeRalphTaskId(task.id),
            title: makeRalphTaskTitle(task.title),
            load: makeRalphTaskLoad(task.load),
            status: "todo"
          }))
        }
      }),
    implementTask: ({ lane, task, previousReviewNotes }) =>
      Effect.gen(function*() {
        const sessionKey = String(lane.laneId)
        const resumeSession = implementerSessions.get(sessionKey)
        const result = yield* runInLane(lane, {
            name: `implementer:${lane.laneId}:${task.id}`,
            promptFile: join(experimentRoot, "prompts", "implement.md"),
            promptArgs: {
              LANE_ID: String(lane.laneId),
              TASK_ID: String(task.id),
              TASK_TITLE: String(task.title),
              TASK_LOAD: String(task.load),
              PLAN_FILE: String(lane.planFile),
              REVIEW_NOTES: previousReviewNotes.length === 0
                ? "No prior review notes."
                : previousReviewNotes.map((note) => `- ${note}`).join("\n")
            },
            role: implementerRole,
            ...(resumeSession === undefined ? {} : { resumeSession })
          })
        if (result.sessionId !== undefined) {
          implementerSessions.set(sessionKey, result.sessionId)
        }
        return {
          summary: makeRalphAgentNotes(result.stdout),
          commits: result.commits
        }
      }),
    reviewTask: ({ lane, task }) =>
      Effect.gen(function*() {
        const result = yield* runInLane(lane, {
            name: `reviewer:${lane.laneId}:${task.id}`,
            promptFile: join(experimentRoot, "prompts", "review.md"),
            promptArgs: {
              LANE_ID: String(lane.laneId),
              TASK_ID: String(task.id)
            },
            role: reviewerRole
          })
        const review = yield* Effect.try({
          try: (): ReviewOutput => extractTaggedJson(result.finalMessage, "review", ReviewOutputSchema),
          catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
        })
        return review.ok
          ? { status: "approved", notes: makeRalphAgentNotes(review.notes) }
          : { status: "changes_requested", notes: makeRalphAgentNotes(review.notes) }
      }),
    cleanupTask: ({ lane, task }) =>
      Effect.gen(function*() {
        const result = yield* runInLane(lane, {
            name: `cleanup:${lane.laneId}:${task.id}`,
            promptFile: join(experimentRoot, "prompts", "cleanup.md"),
            promptArgs: {
              LANE_ID: String(lane.laneId),
              TASK_ID: String(task.id)
            },
            role: cleanupRole
          })
        return { commits: result.commits }
      })
  })
}

const scriptedTasks = (lane: RalphLaneSpec): ReadonlyArray<{
  readonly id: string
  readonly title: string
  readonly load: string
}> => [
  {
    id: "task-1",
    title: `Draft ${lane.laneId} spike note`,
    load:
      `Create a documentation-only spike note for ${lane.laneId}. Use the lane prompt as source context: ${lane.prompt}. Keep it under 120 lines, include assumptions, likely files to inspect later, verification expectations, and non-goals.`
  },
  {
    id: "task-2",
    title: `Review ${lane.laneId} follow-up scope`,
    load:
      "Refine the spike note into a short follow-up checklist. This task should only run after task-1 and remains documentation-only."
  }
]

const createScriptedRalphAgentLayer = (worktrees: Map<string, sandcastle.Worktree>): Layer.Layer<RalphAgent> => {
  const getWorktree = (lane: RalphLaneSpec): Effect.Effect<sandcastle.Worktree, Error> => {
    const worktree = worktrees.get(String(lane.laneId))
    return worktree === undefined
      ? Effect.fail(new Error(`No pre-created worktree for lane ${lane.laneId}`))
      : Effect.succeed(worktree)
  }

  const taskDocumentRelativePath = (lane: RalphLaneSpec, taskId: RalphTaskId): string =>
    join("plans", `ralph-${lane.laneId}-${taskId}.md`)

  const taskDocumentPath = (worktreePath: string, lane: RalphLaneSpec, taskId: RalphTaskId): string =>
    join(worktreePath, taskDocumentRelativePath(lane, taskId))

  return Layer.succeed(RalphAgent, {
    planLane: (lane) =>
      Effect.succeed({
        laneId: lane.laneId,
        branch: lane.branch,
        planFile: lane.planFile,
        tasks: scriptedTasks(lane).map((task) => ({
          id: makeRalphTaskId(task.id),
          title: makeRalphTaskTitle(task.title),
          load: makeRalphTaskLoad(task.load),
          status: "todo"
        }))
      }),
    implementTask: ({ lane, task }) =>
      Effect.gen(function*() {
        const worktree = yield* getWorktree(lane)
        const filePath = taskDocumentPath(worktree.worktreePath, lane, task.id)
        yield* Effect.tryPromise({
          try: async () => {
            await mkdir(dirname(filePath), { recursive: true })
            await writeFile(
              filePath,
              [
                `# ${task.title}`,
                "",
                `Lane: \`${lane.laneId}\``,
                `Task: \`${task.id}\``,
                "",
                "## Task Load",
                "",
                task.load,
                "",
                "## Scripted Experiment Output",
                "",
                "- This file was generated by Ralph scripted mode to validate orchestration.",
                "- Production implementation is intentionally deferred.",
                "- A Codex-backed run can be enabled with `RALPH_AGENT_MODE=codex` after context-budget tuning.",
                ""
              ].join("\n")
            )
          },
          catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
        })
        return {
          summary: makeRalphAgentNotes(`Wrote ${filePath}`),
          commits: []
        }
      }),
    reviewTask: () =>
      Effect.succeed({
        status: "approved",
        notes: makeRalphAgentNotes("Scripted review accepted the documentation-only experiment output.")
      }),
    cleanupTask: ({ lane, task }) =>
      Effect.gen(function*() {
        const worktree = yield* getWorktree(lane)
        const relativePath = taskDocumentRelativePath(lane, task.id)
        const status = yield* Effect.tryPromise({
          try: () => gitOutput(worktree.worktreePath, ["status", "--porcelain", "--", relativePath]),
          catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
        })
        if (status === "") {
          return { commits: [] }
        }
        yield* Effect.tryPromise({
          try: async () => {
            await execFilePromise("git", ["add", relativePath], { cwd: worktree.worktreePath })
            await execFilePromise(
              "git",
              [
                "-c",
                "user.name=Ralph",
                "-c",
                "user.email=ralph@example.invalid",
                "commit",
                "-m",
                `ralph: ${lane.laneId} ${task.id}`
              ],
              { cwd: worktree.worktreePath }
            )
          },
          catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
        })
        const sha = yield* currentCommit(worktree.worktreePath)
        return { commits: [makeRalphCommitSha(sha)] }
      })
  })
}

await Effect.runPromise(ensureSandcastleRuntimeAnchor())
const worktrees = await createWorktrees(laneSpecs)
const initialStatus = await Effect.runPromise(initializeRuntimeFiles(laneSpecs))
const agentMode = process.env["RALPH_AGENT_MODE"] ?? "scripted"
const agentLayer = agentMode === "codex"
  ? createRalphAgentLayer(worktrees)
  : createScriptedRalphAgentLayer(worktrees)

const program = runRalphLanes(laneSpecs, {
  maxReviewAttempts: 3,
  maxTasksPerLane: readPositiveInteger("RALPH_MAX_TASKS_PER_LANE", 1),
  observer: makeFileObserver(initialStatus)
})

await Effect.runPromise(
  program.pipe(
    Effect.provide(
      Layer.merge(
        agentLayer,
        makeFileBackedRalphPlanStore(plansRoot)
      )
    )
  )
)
