import type { Issue, Project } from "@hcengineering/tracker"
import { Cause, Console, Effect, Schema } from "effect"

import { MovementIssueSchema } from "../src/domain/schemas/issue-movement-state.js"
import {
  ComponentId,
  DocId,
  IssueIdentifier,
  IssueStatusId,
  MilestoneId,
  ProjectIdentifier
} from "../src/domain/schemas/shared.js"
import { tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const ArgumentsSchema = Schema.fromJsonString(
  Schema.Struct({ project: ProjectIdentifier, issues: Schema.Array(IssueIdentifier) })
)
const SnapshotSchema = Schema.Array(
  Schema.Struct({
    hierarchy: MovementIssueSchema,
    preserved: Schema.Struct({
      _id: DocId,
      space: DocId,
      identifier: IssueIdentifier,
      number: Schema.Number,
      title: Schema.String,
      kind: DocId,
      status: IssueStatusId,
      description: Schema.optionalKey(Schema.String),
      component: Schema.optionalKey(Schema.NullOr(ComponentId)),
      milestone: Schema.optionalKey(Schema.NullOr(MilestoneId))
    })
  })
)
class MovementProbeError extends Schema.TaggedError<MovementProbeError>()("MovementProbeError", {
  operation: Schema.String,
  cause: Schema.Defect()
}) {}
const io = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new MovementProbeError({ operation, cause }) })

const program = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(ArgumentsSchema)(process.argv[2])
  return yield* Effect.acquireUseRelease(
    io("connect", connectIntegrationHuly),
    ({ client }) =>
      Effect.gen(function* () {
        const project = yield* io("find-project", () =>
          client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ identifier: args.project }))
        )
        if (project === undefined)
          return yield* new MovementProbeError({ operation: "find-project", cause: "Project missing" })
        const issues = yield* io("find-issues", () =>
          client.findAll<Issue>(
            tracker.class.Issue,
            hulyQuery<Issue>({ space: project._id, identifier: { $in: [...args.issues] } })
          )
        )
        if (issues.length !== args.issues.length)
          return yield* new MovementProbeError({ operation: "find-issues", cause: "Incomplete issue snapshot" })
        const parsed = yield* Schema.decodeUnknownEffect(SnapshotSchema)(
          issues.map((issue) => ({ hierarchy: issue, preserved: issue }))
        )
        return JSON.stringify(yield* Schema.encodeEffect(SnapshotSchema)(parsed))
      }),
    ({ client }) => io("close", () => client.close()).pipe(Effect.orDie)
  )
})

void Effect.runPromise(
  program.pipe(
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
)
