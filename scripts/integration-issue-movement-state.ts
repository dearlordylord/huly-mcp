import type { Issue, Project } from "@hcengineering/tracker"
import { Console, Effect, Schema } from "effect"

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
const parseSnapshot = Schema.decodeUnknownSync(SnapshotSchema)
const readSnapshot = async (): Promise<string> => {
  const args = Schema.decodeUnknownSync(ArgumentsSchema)(process.argv[2])
  const { client } = await connectIntegrationHuly()
  try {
    const project = await client.findOne<Project>(
      tracker.class.Project,
      hulyQuery<Project>({ identifier: args.project })
    )
    if (project === undefined) throw new Error("Project missing")
    const issues = await client.findAll<Issue>(
      tracker.class.Issue,
      hulyQuery<Issue>({ space: project._id, identifier: { $in: [...args.issues] } })
    )
    if (issues.length !== args.issues.length) throw new Error("Incomplete issue snapshot")
    const parsed = parseSnapshot(issues.map((issue) => ({ hierarchy: issue, preserved: issue })))
    return JSON.stringify(parsed)
  } finally {
    await client.close()
  }
}

void readSnapshot().then(
  (snapshot) => {
    process.stdout.write(`${snapshot}\n`)
  },
  (cause: unknown) => {
    Effect.runSync(Console.error(cause))
    process.exitCode = 1
  }
)
