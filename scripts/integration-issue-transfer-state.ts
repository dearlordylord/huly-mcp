import type { ActivityReference } from "@hcengineering/activity"
import type { Issue, Project } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import { MovementIssueSchema } from "../src/domain/schemas/issue-movement-state.js"
import { TransferIssueSchema, TransferProjectSchema } from "../src/domain/schemas/issue-transfer.js"
import { DocId, IssueId, ProjectIdentifier, Count } from "../src/domain/schemas/shared.js"
import { activity, tracker } from "../src/huly/huly-plugins.js"
import { inspectTransferForest } from "../src/huly/issue-transfer-forest.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const INCOMING_REFERENCE_PROBE_LIMIT = 10_001

const Arguments = Schema.fromJsonString(
  Schema.Struct({ issues: Schema.Array(IssueId), projects: Schema.Array(ProjectIdentifier) })
)
const IssueSnapshot = Schema.Struct({ ...MovementIssueSchema.fields, ...TransferIssueSchema.fields })
const ProjectSnapshot = Schema.Struct({
  ...TransferProjectSchema.fields,
  _id: DocId,
  identifier: ProjectIdentifier,
  sequence: Count
})
const parseSnapshot = <A>(schema: Schema.ConstraintDecoder<A>, input: unknown): A =>
  Schema.decodeUnknownSync(schema)(input)

const run = async () => {
  const args = Schema.decodeUnknownSync(Arguments)(process.argv[2])
  const { client } = await connectIntegrationHuly()
  try {
    const rawIssues = await Promise.all(
      args.issues.map((id) => client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(id) })))
    )
    const inspectedTree = rawIssues.map((raw) => parseSnapshot(MovementIssueSchema, raw))
    const forest = await Effect.runPromise(inspectTransferForest(client, args.issues, inspectedTree))
    const issues = await Promise.all(
      args.issues.map(async (id, index) => {
        const raw = rawIssues[index]
        const issue = parseSnapshot(IssueSnapshot, raw)
        const entry = forest.find((observation) => observation.ownerId === id)
        if (entry === undefined || entry.status !== "observed")
          throw new Error(`Owned-record snapshot unavailable for ${id}`)
        // Preserve incomplete observations as incomplete, including their blockers and known records.
        const owned = entry.inspection
        const references = await client.findAll<ActivityReference>(
          activity.class.ActivityReference,
          hulyQuery<ActivityReference>({ attachedTo: toRef(id) }),
          { limit: INCOMING_REFERENCE_PROBE_LIMIT, total: true }
        )
        if (references.total !== references.length || references.length >= INCOMING_REFERENCE_PROBE_LIMIT)
          throw new Error("Incomplete incoming reference snapshot")
        const incomingReferences = references
          .filter((reference) => reference.srcDocId !== toRef(id))
          .map((reference) => parseSnapshot(Schema.Json, reference))
        return { issue, owned, incomingReferences }
      })
    )
    const projects = await Promise.all(
      args.projects.map(async (identifier) =>
        parseSnapshot(
          ProjectSnapshot,
          await client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ identifier }))
        )
      )
    )
    process.stdout.write(`${JSON.stringify({ issues, projects })}\n`)
  } finally {
    await client.close()
  }
}
void run().catch((cause: unknown) => {
  process.stderr.write(`${String(cause)}\n`)
  process.exitCode = 1
})
