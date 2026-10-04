import type { Project } from "@hcengineering/tracker"
import type { Doc, AttachedDoc } from "@hcengineering/core"
import { Schema } from "effect"
import { activity, documentPlugin, time, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef, toClassRef } from "../src/huly/operations/sdk-boundary.js"
import { DocId, ProjectIdentifier, ObjectClassName } from "../src/domain/schemas/shared.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"
import {
  cleanupTree,
  CleanupRows,
  TreeCleanupInput,
  requestedIds,
  type TreeCleanupPorts
} from "./issue-tree-cleanup.js"

const cleanupQueryLimit = 1001
const classes = {
  issue: tracker.class.Issue,
  project: tracker.class.Project,
  component: tracker.class.Component,
  milestone: tracker.class.Milestone,
  document: documentPlugin.class.Document,
  teamspace: documentPlugin.class.Teamspace,
  reference: activity.class.ActivityReference,
  todo: time.class.ToDo
}
const CaptureArguments = Schema.Struct({
  mode: Schema.Literal("capture-project"),
  identifier: ProjectIdentifier,
  name: Schema.String
})
const Arguments = Schema.Union([
  CaptureArguments,
  Schema.Struct({ mode: Schema.Literal("cleanup"), input: TreeCleanupInput })
])
const ProjectIdentity = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  identifier: ProjectIdentifier,
  name: Schema.String
})
const ProjectObservation = Schema.Struct({ total: Schema.Int, projects: Schema.Array(ProjectIdentity) })
const capturedIdentityMatches = (
  observation: Schema.Schema.Type<typeof ProjectObservation>,
  args: Schema.Schema.Type<typeof CaptureArguments>
) => {
  const project = observation.projects[0]
  return (
    project !== undefined &&
    observation.total === 1 &&
    observation.projects.length === 1 &&
    project.identifier === args.identifier &&
    project.name === args.name &&
    project._class === ObjectClassName.make(tracker.class.Project)
  )
}
const main = async () => {
  const args = Schema.decodeUnknownSync(Schema.fromJsonString(Arguments))(process.argv[2])
  const { client } = await connectIntegrationHuly()
  if (args.mode === "capture-project") {
    try {
      const rows = await client.findAll<Project>(
        tracker.class.Project,
        hulyQuery<Project>({ identifier: args.identifier }),
        { total: true, limit: 2 }
      )
      const raw: unknown = { total: rows.total, projects: [...rows] }
      const observation = Schema.decodeUnknownSync(ProjectObservation)(raw)
      const project = observation.projects[0]
      if (!capturedIdentityMatches(observation, args) || project === undefined) {
        process.stderr.write("Fixture project identity unresolved\n")
        process.exitCode = 1
      } else process.stdout.write(JSON.stringify({ projectId: project._id }) + "\n")
    } finally {
      await client.close()
    }
    return
  }
  const input = args.input
  const ports: TreeCleanupPorts = {
    read: async (kind, args) => {
      try {
        const objectClass = toClassRef<Doc>(ObjectClassName.make(classes[kind]))
        const ids = requestedIds(kind, args)
        const result = await client.findAll<Doc>(
          objectClass,
          hulyQuery<Doc>(
            kind === "component" || kind === "milestone"
              ? { space: { $in: args.projectIds.map((id) => toRef(id)) } }
              : { _id: { $in: ids.map((id) => toRef<Doc>(id)) } }
          ),
          { total: true, limit: cleanupQueryLimit }
        )
        const raw: unknown = { status: "observed", rows: [...result], total: result.total }
        const parsed = Schema.decodeUnknownSync(CleanupRows)(raw)
        if (parsed.status !== "observed") return { status: "unavailable" }
        if (parsed.rows.some((row) => row._class !== ObjectClassName.make(classes[kind])))
          return { status: "unavailable" }
        return parsed
      } catch {
        return { status: "unavailable" }
      }
    },
    remove: async (kind, row) => {
      try {
        if (kind === "reference" || kind === "todo") {
          if (row.attachedTo === undefined || row.attachedToClass === undefined || row.collection === undefined)
            return { status: "unavailable" }
          await client.removeCollection<Doc, AttachedDoc>(
            toClassRef<AttachedDoc>(row._class),
            toRef(row.space),
            toRef<AttachedDoc>(row._id),
            toRef<Doc>(row.attachedTo),
            toClassRef<Doc>(row.attachedToClass),
            row.collection
          )
        } else await client.removeDoc(toClassRef<Doc>(row._class), toRef(row.space), toRef<Doc>(row._id))
        return { status: "acknowledged" }
      } catch {
        return { status: "unavailable" }
      }
    }
  }
  try {
    const receipt = await cleanupTree(input, ports)
    process.stdout.write(JSON.stringify(receipt) + "\n")
    if (!receipt.complete) process.exitCode = 1
  } finally {
    await client.close()
  }
}
main().catch(() => {
  process.stderr.write("Fixture cleanup unresolved: connection-or-boundary\n")
  process.exitCode = 1
})
