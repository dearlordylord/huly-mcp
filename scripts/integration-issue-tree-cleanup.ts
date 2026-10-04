import type { Doc, AttachedDoc } from "@hcengineering/core"
import type { Project } from "@hcengineering/tracker"
import { Schema } from "effect"
import { activity, documentPlugin, time, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef, toClassRef } from "../src/huly/operations/sdk-boundary.js"
import { ObjectClassName } from "../src/domain/schemas/shared.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"
import { cleanupTree, CleanupRows, TreeCleanupInput, type TreeCleanupPorts } from "./issue-tree-cleanup.js"

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
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(TreeCleanupInput))(process.argv[2])
  const { client } = await connectIntegrationHuly()
  const ports: TreeCleanupPorts = {
    read: async (kind, args, projectIds) => {
      const objectClass = toClassRef<Doc>(ObjectClassName.make(classes[kind]))
      const ids =
        kind === "issue"
          ? args.issueIds
          : kind === "document"
            ? args.documentIds
            : kind === "teamspace"
              ? args.teamspaceIds
              : args.recordIds
      const result =
        kind === "project"
          ? await client.findAll<Project>(
              tracker.class.Project,
              hulyQuery<Project>({ identifier: { $in: [...args.projects] } }),
              { total: true, limit: cleanupQueryLimit }
            )
          : await client.findAll<Doc>(
              objectClass,
              hulyQuery<Doc>(
                kind === "component" || kind === "milestone"
                  ? { space: { $in: projectIds.map((id) => toRef(id)) } }
                  : { _id: { $in: ids.map((id) => toRef<Doc>(id)) } }
              ),
              { total: true, limit: cleanupQueryLimit }
            )
      const raw: unknown = { rows: [...result], total: result.total }
      const parsed = Schema.decodeUnknownSync(CleanupRows)(raw)
      if (parsed.rows.some((row) => row._class !== ObjectClassName.make(classes[kind])))
        throw new Error("Unexpected cleanup class")
      return parsed
    },
    remove: async (kind, row) => {
      if (kind === "reference" || kind === "todo") {
        if (row.attachedTo === undefined || row.attachedToClass === undefined || row.collection === undefined)
          throw new Error("Missing cleanup attachment")
        await client.removeCollection<Doc, AttachedDoc>(
          toClassRef<AttachedDoc>(row._class),
          toRef(row.space),
          toRef<AttachedDoc>(row._id),
          toRef<Doc>(row.attachedTo),
          toClassRef<Doc>(row.attachedToClass),
          row.collection
        )
      } else await client.removeDoc(toClassRef<Doc>(row._class), toRef(row.space), toRef<Doc>(row._id))
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
