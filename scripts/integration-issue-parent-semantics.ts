import type { DocumentUpdate, TxOperations } from "@hcengineering/core"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Cause, Console, Duration, Effect, Schedule, Schema } from "effect"
import { parseArgs } from "node:util"

import {
  Count,
  DocId,
  IssueId,
  IssueIdentifier,
  ObjectClassName,
  ProjectIdentifier
} from "../src/domain/schemas/shared.js"
import { tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const OptionalCountFromString = Schema.optionalKey(Schema.NumberFromString.pipe(Schema.decodeTo(Count)))
const CommonCliFields = {
  project: ProjectIdentifier,
  issue: IssueIdentifier,
  expectedIssueChildren: OptionalCountFromString,
  expectedParentChildren: OptionalCountFromString
}
const CliArgsSchema = Schema.Union([
  Schema.Struct({ ...CommonCliFields, mode: Schema.Literal("top-level"), parent: Schema.optionalKey(IssueIdentifier) }),
  Schema.Struct({ ...CommonCliFields, mode: Schema.Literal("child"), parent: IssueIdentifier }),
  Schema.Struct({
    ...CommonCliFields,
    mode: Schema.Literal("make-legacy"),
    parent: Schema.optionalKey(IssueIdentifier)
  })
])
const ParentStateSchema = Schema.Struct({
  issueId: IssueId,
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  collection: Schema.Literals(["issues", "subIssues"]),
  parents: Count,
  subIssues: Count,
  parentSubIssues: Schema.optionalKey(Count)
})
const IntegrationOperation = Schema.Literals([
  "close-client",
  "connect-client",
  "find-issue",
  "find-project",
  "repair-legacy"
])

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type IntegrationOperation = Schema.Schema.Type<typeof IntegrationOperation>
type ParentState = Schema.Schema.Type<typeof ParentStateSchema>
const parseCliArgsInput = Schema.decodeUnknownEffect(CliArgsSchema)
const parseParentState = Schema.decodeUnknownEffect(ParentStateSchema)
const encodeParentState = Schema.encodeUnknownEffect(ParentStateSchema)

class CliInputError extends Schema.TaggedError<CliInputError>()("CliInputError", { cause: Schema.Defect() }) {
  override get message(): string {
    return `Invalid integration parent-semantics arguments: ${String(this.cause)}`
  }
}

class IntegrationOperationError extends Schema.TaggedError<IntegrationOperationError>()("IntegrationOperationError", {
  operation: IntegrationOperation,
  cause: Schema.Defect()
}) {
  override get message(): string {
    return `Huly integration operation '${this.operation}' failed: ${String(this.cause)}`
  }
}

class ProjectLookupError extends Schema.TaggedError<ProjectLookupError>()("ProjectLookupError", {
  project: ProjectIdentifier
}) {
  override get message(): string {
    return `Project '${this.project}' not found.`
  }
}

class IssueNotVisibleError extends Schema.TaggedError<IssueNotVisibleError>()("IssueNotVisibleError", {
  issue: IssueIdentifier
}) {
  override get message(): string {
    return `Issue '${this.issue}' is not visible yet.`
  }
}

class ParentStateDecodeError extends Schema.TaggedError<ParentStateDecodeError>()("ParentStateDecodeError", {
  cause: Schema.Defect()
}) {}

class ParentStatePendingError extends Schema.TaggedError<ParentStatePendingError>()("ParentStatePendingError", {
  issue: IssueIdentifier,
  mode: Schema.Literals(["top-level", "child", "make-legacy"])
}) {}

class ParentStateTimeoutError extends Schema.TaggedError<ParentStateTimeoutError>()("ParentStateTimeoutError", {
  issue: IssueIdentifier,
  mode: Schema.Literals(["top-level", "child", "make-legacy"])
}) {
  override get message(): string {
    return `Timed out waiting for '${this.mode}' parent state for issue '${this.issue}'.`
  }
}

const MAX_POLL_ATTEMPTS = 30
const LAST_ITEM_OFFSET = -1
const NODE_ARGV_OFFSET = 2
const POLL_INTERVAL_MS = 250
const POLL_INTERVAL = Duration.millis(POLL_INTERVAL_MS)

const integrationOperation = <A>(
  operation: IntegrationOperation,
  run: () => PromiseLike<A>
): Effect.Effect<A, IntegrationOperationError> =>
  Effect.tryPromise({ try: run, catch: (cause) => new IntegrationOperationError({ operation, cause }) })

const parseCliArgs = (): Effect.Effect<CliArgs, CliInputError> =>
  Effect.try({
    try: () =>
      parseArgs({
        args: process.argv.slice(NODE_ARGV_OFFSET),
        options: {
          project: { type: "string" },
          issue: { type: "string" },
          mode: { type: "string" },
          parent: { type: "string" },
          expectedIssueChildren: { type: "string" },
          expectedParentChildren: { type: "string" }
        }
      }).values,
    catch: (cause) => new CliInputError({ cause })
  }).pipe(
    Effect.flatMap(parseCliArgsInput),
    Effect.mapError((cause) => (cause instanceof CliInputError ? cause : new CliInputError({ cause })))
  )

interface ResolvedIssues {
  readonly issue: HulyIssue
  readonly parent: HulyIssue | undefined
  readonly project: HulyProject
}

const requireIssue = (
  client: TxOperations,
  project: HulyProject,
  identifier: IssueIdentifier
): Effect.Effect<HulyIssue, IntegrationOperationError | IssueNotVisibleError> =>
  integrationOperation("find-issue", () =>
    client.findOne<HulyIssue>(tracker.class.Issue, hulyQuery<HulyIssue>({ space: project._id, identifier }))
  ).pipe(
    Effect.flatMap((issue) =>
      issue === undefined ? Effect.fail(new IssueNotVisibleError({ issue: identifier })) : Effect.succeed(issue)
    )
  )

const resolveIssues = (
  client: TxOperations,
  args: CliArgs
): Effect.Effect<ResolvedIssues, IntegrationOperationError | IssueNotVisibleError | ProjectLookupError> =>
  Effect.gen(function* () {
    const project = yield* integrationOperation("find-project", () =>
      client.findOne<HulyProject>(tracker.class.Project, hulyQuery<HulyProject>({ identifier: args.project }))
    )
    if (project === undefined) return yield* new ProjectLookupError({ project: args.project })
    return {
      project,
      issue: yield* requireIssue(client, project, args.issue),
      parent: args.parent === undefined ? undefined : yield* requireIssue(client, project, args.parent)
    }
  })

const readState = (
  args: CliArgs
): Effect.Effect<
  { readonly resolved: ResolvedIssues; readonly state: ParentState },
  IntegrationOperationError | IssueNotVisibleError | ParentStateDecodeError | ProjectLookupError
> =>
  Effect.acquireUseRelease(
    integrationOperation("connect-client", connectIntegrationHuly),
    ({ client }) =>
      Effect.gen(function* () {
        const resolved = yield* resolveIssues(client, args)
        const state = yield* parseParentState({
          issueId: resolved.issue._id,
          attachedTo: resolved.issue.attachedTo,
          attachedToClass: resolved.issue.attachedToClass,
          collection: resolved.issue.collection,
          parents: resolved.issue.parents.length,
          subIssues: resolved.issue.subIssues,
          ...(resolved.parent === undefined ? {} : { parentSubIssues: resolved.parent.subIssues })
        }).pipe(Effect.mapError((cause) => new ParentStateDecodeError({ cause })))
        return { resolved, state }
      }),
    ({ client }) => integrationOperation("close-client", () => client.close()).pipe(Effect.orDie)
  )

const stateMatches = (args: CliArgs, { resolved, state }: Effect.Success<ReturnType<typeof readState>>): boolean => {
  const countsMatch =
    (args.expectedIssueChildren === undefined || state.subIssues === args.expectedIssueChildren) &&
    (args.expectedParentChildren === undefined || state.parentSubIssues === args.expectedParentChildren)
  if (!countsMatch) return false

  if (args.mode === "child") {
    const parent = resolved.parent
    if (parent === undefined) return false
    return (
      state.attachedTo === DocId.make(parent._id) &&
      state.attachedToClass === ObjectClassName.make(tracker.class.Issue) &&
      state.collection === "subIssues" &&
      resolved.issue.parents.at(LAST_ITEM_OFFSET)?.parentId === parent._id
    )
  }
  if (args.mode === "make-legacy") {
    return (
      state.attachedTo === DocId.make(resolved.project._id) &&
      state.attachedToClass === ObjectClassName.make(tracker.class.Project) &&
      state.collection === "issues" &&
      state.parents === 0
    )
  }
  return (
    state.attachedTo === DocId.make(tracker.ids.NoParent) &&
    state.attachedToClass === ObjectClassName.make(tracker.class.Issue) &&
    state.collection === "subIssues" &&
    state.parents === 0
  )
}

const isRetryablePollingError = (
  error:
    | IntegrationOperationError
    | IssueNotVisibleError
    | ParentStateDecodeError
    | ParentStatePendingError
    | ProjectLookupError
): boolean => error._tag === "IssueNotVisibleError" || error._tag === "ParentStatePendingError"

const waitForState = (
  args: CliArgs
): Effect.Effect<
  ParentState,
  IntegrationOperationError | ParentStateDecodeError | ParentStateTimeoutError | ProjectLookupError
> => {
  const poll = readState(args).pipe(
    Effect.flatMap((snapshot) =>
      stateMatches(args, snapshot)
        ? Effect.succeed(snapshot.state)
        : Effect.fail(new ParentStatePendingError({ issue: args.issue, mode: args.mode }))
    )
  )
  return poll.pipe(
    Effect.retry({
      times: MAX_POLL_ATTEMPTS - 1,
      schedule: Schedule.spaced(POLL_INTERVAL),
      while: isRetryablePollingError
    }),
    Effect.catchTags({
      IssueNotVisibleError: () => Effect.fail(new ParentStateTimeoutError({ issue: args.issue, mode: args.mode })),
      ParentStatePendingError: () => Effect.fail(new ParentStateTimeoutError({ issue: args.issue, mode: args.mode }))
    })
  )
}

const makeLegacy = (
  args: CliArgs
): Effect.Effect<void, IntegrationOperationError | IssueNotVisibleError | ProjectLookupError> =>
  Effect.acquireUseRelease(
    integrationOperation("connect-client", connectIntegrationHuly),
    ({ client }) =>
      Effect.gen(function* () {
        const { issue, project } = yield* resolveIssues(client, args)
        const update: DocumentUpdate<HulyIssue> = {
          attachedTo: toRef<HulyIssue>(project._id),
          attachedToClass: tracker.class.Project,
          collection: "issues",
          parents: []
        }
        yield* integrationOperation("repair-legacy", () =>
          client.updateDoc(tracker.class.Issue, project._id, issue._id, update)
        )
      }),
    ({ client }) => integrationOperation("close-client", () => client.close()).pipe(Effect.orDie)
  )

const program = Effect.gen(function* () {
  const args = yield* parseCliArgs()
  if (args.mode === "make-legacy") yield* makeLegacy(args)
  const encoded = yield* encodeParentState(yield* waitForState(args)).pipe(
    Effect.mapError((cause) => new ParentStateDecodeError({ cause }))
  )
  return JSON.stringify(encoded)
})

const executable = program.pipe(
  Effect.tap(Console.log),
  Effect.catchCause((cause) =>
    Console.error(Cause.pretty(cause)).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1
        })
      )
    )
  )
)

void Effect.runPromise(executable)
