import { Schema } from "effect"
import { DocId, ObjectClassName, ProjectIdentifier } from "../src/domain/schemas/shared.js"

export const TreeCleanupInput = Schema.Struct({
  issueIds: Schema.Array(DocId),
  projects: Schema.Array(ProjectIdentifier),
  documentIds: Schema.Array(DocId),
  teamspaceIds: Schema.Array(DocId),
  recordIds: Schema.Array(DocId)
})
export type TreeCleanupInput = Schema.Schema.Type<typeof TreeCleanupInput>
export const CleanupLocation = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  space: DocId,
  attachedTo: Schema.optionalKey(DocId),
  attachedToClass: Schema.optionalKey(ObjectClassName),
  collection: Schema.optionalKey(Schema.String)
})
export type CleanupLocation = Schema.Schema.Type<typeof CleanupLocation>
export const CleanupRows = Schema.Struct({ rows: Schema.Array(CleanupLocation), total: Schema.Int })
export const CleanupKind = Schema.Literals([
  "issue",
  "component",
  "milestone",
  "document",
  "teamspace",
  "reference",
  "todo",
  "project"
])
export type CleanupKind = Schema.Schema.Type<typeof CleanupKind>
export const CleanupReceipt = Schema.Struct({
  kind: CleanupKind,
  acknowledged: Schema.Int,
  absenceConfirmed: Schema.Boolean,
  status: Schema.Literals(["absence-confirmed", "unresolved"])
})
export const CleanupResult = Schema.Struct({ complete: Schema.Boolean, receipts: Schema.Array(CleanupReceipt) })
// Internal injected operations; all SDK rows are parsed by the adapter before crossing this port.
export interface TreeCleanupPorts {
  readonly read: (
    kind: CleanupKind,
    input: TreeCleanupInput,
    projectIds: ReadonlyArray<DocId>
  ) => Promise<Schema.Schema.Type<typeof CleanupRows>>
  readonly remove: (kind: CleanupKind, record: CleanupLocation) => Promise<void>
}
const kinds: ReadonlyArray<CleanupKind> = [
  "reference",
  "todo",
  "issue",
  "component",
  "milestone",
  "document",
  "teamspace",
  "project"
]
const completeRows = (result: Schema.Schema.Type<typeof CleanupRows>) => result.total === result.rows.length

const cleanupGroup = async (
  kind: CleanupKind,
  input: TreeCleanupInput,
  projectIds: ReadonlyArray<DocId>,
  ports: TreeCleanupPorts
) => {
  let acknowledged = 0
  try {
    const before = await ports.read(kind, input, projectIds)
    if (!completeRows(before)) return { kind, acknowledged, absenceConfirmed: false, status: "unresolved" }
    const seen = new Set<DocId>()
    for (const record of before.rows) {
      if (seen.has(record._id)) return { kind, acknowledged, absenceConfirmed: false, status: "unresolved" }
      seen.add(record._id)
      try {
        await ports.remove(kind, record)
        acknowledged++
      } catch {
        /* Final independent observation decides absence. */
      }
    }
    const after = await ports.read(kind, input, projectIds)
    const absent = completeRows(after) && after.rows.length === 0
    return { kind, acknowledged, absenceConfirmed: absent, status: absent ? "absence-confirmed" : "unresolved" }
  } catch {
    return { kind, acknowledged, absenceConfirmed: false, status: "unresolved" }
  }
}

export const cleanupTree = async (input: TreeCleanupInput, ports: TreeCleanupPorts) => {
  const projects = await ports.read("project", input, [])
  if (!completeRows(projects) || projects.rows.length !== new Set(input.projects).size)
    return Schema.decodeUnknownSync(CleanupResult)({ complete: false, receipts: [] })
  const receipts = []
  for (const kind of kinds)
    receipts.push(
      await cleanupGroup(
        kind,
        input,
        projects.rows.map((row) => row._id),
        ports
      )
    )
  return Schema.decodeUnknownSync(CleanupResult)({ complete: receipts.every((row) => row.absenceConfirmed), receipts })
}
