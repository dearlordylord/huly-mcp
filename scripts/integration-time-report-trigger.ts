import type { SocialIdentity } from "@hcengineering/contact"
import type { TxOperations } from "@hcengineering/core"
import type { Issue as HulyIssue, Project as HulyProject, TimeSpendReport } from "@hcengineering/tracker"
import { Console, Effect, Schema } from "effect"
import { setTimeout } from "node:timers/promises"
import { parseArgs } from "node:util"

import { Count, IssueIdentifier, PersonId, ProjectIdentifier, TimeSpendReportId } from "../src/domain/schemas/shared.js"
import { PositiveTimeHours, TimeHours } from "../src/domain/schemas/time.js"
import { contact, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef, toSocialIdentityRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const CliArgsSchema = Schema.Struct({
  project: ProjectIdentifier,
  issue: IssueIdentifier,
  report: TimeSpendReportId,
  estimateHours: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveTimeHours)),
  reportHours: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveTimeHours))
})
const TimeAggregateStateSchema = Schema.Struct({ reportedTime: TimeHours, remainingTime: TimeHours, reports: Count })
const TimeReportStateSchema = Schema.Struct({ ...TimeAggregateStateSchema.fields, employee: Schema.NullOr(PersonId) })
const TriggerCheckResultSchema = Schema.Struct({
  employee: PersonId,
  afterCreate: TimeAggregateStateSchema,
  afterDelete: TimeAggregateStateSchema
})

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type TimeAggregateState = Schema.Schema.Type<typeof TimeAggregateStateSchema>
type TimeReportState = Schema.Schema.Type<typeof TimeReportStateSchema>

const FLOAT_TOLERANCE_MULTIPLIER = 10
const MAX_POLL_ATTEMPTS = 30
const NODE_ARGV_OFFSET = 2
const POLL_INTERVAL_MS = 250

const parseCliArgs = (): CliArgs =>
  Schema.decodeUnknownSync(CliArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGV_OFFSET),
      options: {
        project: { type: "string" },
        issue: { type: "string" },
        report: { type: "string" },
        estimateHours: { type: "string" },
        reportHours: { type: "string" }
      }
    }).values
  )

const findIssue = async (client: TxOperations, args: CliArgs): Promise<HulyIssue> => {
  const project = await client.findOne<HulyProject>(
    tracker.class.Project,
    hulyQuery<HulyProject>({ identifier: args.project })
  )
  if (project === undefined) throw new Error(`Project '${args.project}' not found.`)

  const issue = await client.findOne<HulyIssue>(
    tracker.class.Issue,
    hulyQuery<HulyIssue>({ space: project._id, identifier: args.issue })
  )
  if (issue === undefined) throw new Error(`Issue '${args.issue}' not found.`)
  return issue
}

const readState = async (args: CliArgs): Promise<TimeReportState> => {
  const { client } = await connectIntegrationHuly()
  try {
    const issue = await findIssue(client, args)
    const report = await client.findOne<TimeSpendReport>(
      tracker.class.TimeSpendReport,
      hulyQuery<TimeSpendReport>({ _id: toRef<TimeSpendReport>(args.report) })
    )
    return Schema.decodeUnknownSync(TimeReportStateSchema)({
      employee: report?.employee == null ? null : PersonId.make(report.employee),
      reportedTime: TimeHours.make(issue.reportedTime),
      remainingTime: TimeHours.make(issue.remainingTime),
      reports: Count.make(issue.reports)
    })
  } finally {
    await client.close()
  }
}

const closeEnough = (actual: TimeHours, expected: TimeHours): boolean =>
  Math.abs(actual - expected) < Number.EPSILON * FLOAT_TOLERANCE_MULTIPLIER

const waitForState = async (args: CliArgs, expected: TimeAggregateState): Promise<TimeReportState> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const state = await readState(args)
    if (
      closeEnough(state.reportedTime, expected.reportedTime) &&
      closeEnough(state.remainingTime, expected.remainingTime) &&
      state.reports === expected.reports
    ) {
      return state
    }
    await setTimeout(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for Huly time aggregates: ${JSON.stringify(expected)}.`)
}

const removeReport = async (args: CliArgs): Promise<void> => {
  const { client } = await connectIntegrationHuly()
  try {
    const issue = await findIssue(client, args)
    const socialIdentity = await client.findOne<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(client.user) })
    )
    if (socialIdentity === undefined) throw new Error("Authenticated social identity not found.")

    const report = await client.findOne<TimeSpendReport>(
      tracker.class.TimeSpendReport,
      hulyQuery<TimeSpendReport>({ _id: toRef<TimeSpendReport>(args.report) })
    )
    if (report === undefined) throw new Error(`Time report '${args.report}' not found.`)
    if (report.employee !== socialIdentity.attachedTo) {
      throw new Error("Time report is not attributed to the authenticated employee.")
    }

    await client.removeCollection(
      tracker.class.TimeSpendReport,
      report.space,
      report._id,
      issue._id,
      tracker.class.Issue,
      "reports"
    )
  } finally {
    await client.close()
  }
}

const main = async (): Promise<void> => {
  const args = parseCliArgs()
  const estimateHours = TimeHours.make(args.estimateHours)
  const reportHours = TimeHours.make(args.reportHours)
  const expectedRemainingHours = TimeHours.make(estimateHours - reportHours)
  const afterCreate = await waitForState(args, {
    reportedTime: reportHours,
    remainingTime: expectedRemainingHours,
    reports: Count.make(1)
  })
  if (afterCreate.employee === null) throw new Error("Time report has no employee attribution.")

  await removeReport(args)
  const afterDelete = await waitForState(args, {
    reportedTime: TimeHours.make(0),
    remainingTime: estimateHours,
    reports: Count.make(0)
  })
  const toAggregateState = (state: TimeReportState): TimeAggregateState => ({
    reportedTime: state.reportedTime,
    remainingTime: state.remainingTime,
    reports: state.reports
  })
  const result = Schema.encodeSync(TriggerCheckResultSchema)({
    employee: afterCreate.employee,
    afterCreate: toAggregateState(afterCreate),
    afterDelete: toAggregateState(afterDelete)
  })
  await Effect.runPromise(Console.log(JSON.stringify(result)))
}

main().catch(async (error: unknown) => {
  await Effect.runPromise(Console.error(error instanceof Error ? (error.stack ?? error.message) : String(error)))
  process.exit(1)
})
