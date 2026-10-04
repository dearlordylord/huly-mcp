import { Schema } from "effect"
import { DocId, ObjectClassName } from "../src/domain/schemas/shared.js"

export const TreeCleanupInput = Schema.Struct({
  issueIds: Schema.Array(DocId),
  projectIds: Schema.Array(DocId),
  unresolvedCreation: Schema.Boolean,
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
export const CleanupRows = Schema.Union([
  Schema.Struct({ status: Schema.Literal("observed"), rows: Schema.Array(CleanupLocation), total: Schema.Int }),
  Schema.Struct({ status: Schema.Literal("unavailable") })
])
export const CleanupRemoval = Schema.Struct({ status: Schema.Literals(["acknowledged", "unavailable"]) })
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
  status: Schema.Literals(["absence-confirmed", "unresolved"])
})
export const CleanupResult = Schema.Struct({ complete: Schema.Boolean, receipts: Schema.Array(CleanupReceipt) })
// Internal injected operations return schema-owned observations; expected SDK failures never reject.
export interface TreeCleanupPorts {
  readonly read: (kind: CleanupKind, input: TreeCleanupInput) => Promise<Schema.Schema.Type<typeof CleanupRows>>
  readonly remove: (kind: CleanupKind, record: CleanupLocation) => Promise<Schema.Schema.Type<typeof CleanupRemoval>>
}
export const requestedIds = (kind: CleanupKind, input: TreeCleanupInput): ReadonlyArray<DocId> => {
  switch (kind) {
    case "issue":
      return input.issueIds
    case "project":
      return input.projectIds
    case "document":
      return input.documentIds
    case "teamspace":
      return input.teamspaceIds
    default:
      return input.recordIds
  }
}
const inScope = (kind: CleanupKind, input: TreeCleanupInput, row: CleanupLocation) =>
  kind === "component" || kind === "milestone"
    ? input.projectIds.includes(row.space)
    : requestedIds(kind, input).includes(row._id)
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
const admittedRows = (
  kind: CleanupKind,
  input: TreeCleanupInput,
  observation: Schema.Schema.Type<typeof CleanupRows>
) => {
  if (observation.status === "unavailable") return undefined
  return observation.total === observation.rows.length &&
    observation.rows.every((row) => inScope(kind, input, row)) &&
    new Set(observation.rows.map((row) => row._id)).size === observation.rows.length
    ? observation.rows
    : undefined
}
const cleanupGroup = async (kind: CleanupKind, input: TreeCleanupInput, ports: TreeCleanupPorts) => {
  let acknowledged = 0
  const before = await ports.read(kind, input)
  const rows = admittedRows(kind, input, before)
  if (rows === undefined) return { kind, acknowledged, status: "unresolved" }
  for (const row of rows) {
    const removal = await ports.remove(kind, row)
    if (removal.status === "acknowledged") acknowledged++
  }
  const after = await ports.read(kind, input)
  const absent = after.status === "observed" && after.total === 0 && after.rows.length === 0
  return { kind, acknowledged, status: absent ? "absence-confirmed" : "unresolved" }
}
export const cleanupTree = async (input: TreeCleanupInput, ports: TreeCleanupPorts) => {
  const receipts = []
  for (const kind of kinds) receipts.push(await cleanupGroup(kind, input, ports))
  return Schema.decodeUnknownSync(CleanupResult)({
    complete: !input.unresolvedCreation && receipts.every((row) => row.status === "absence-confirmed"),
    receipts
  })
}
