import {
  getDocumentSnapshotParamsJsonSchema,
  GetDocumentSnapshotResultSchema,
  listDocumentSnapshotsParamsJsonSchema,
  ListDocumentSnapshotsResultSchema,
  parseGetDocumentSnapshotParams,
  parseListDocumentSnapshotsParams
} from "../../domain/schemas/document-snapshots.js"
import { getDocumentSnapshot, listDocumentSnapshots } from "../../huly/operations/document-snapshots.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "documents" as const

export const documentSnapshotTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_document_snapshots",
      description:
        "List version-history snapshots for one Huly document. A snapshot is a saved point-in-time copy from the document's change history. Resolve the document by teamspace plus document title or ID. Returns snapshotId, documentId, teamspaceId, title, parentDocumentId, and timestamps; markdown content is intentionally omitted. Use get_document_snapshot with snapshotId when reading content.",
      category: CATEGORY,
      inputSchema: listDocumentSnapshotsParamsJsonSchema,
      resultSchema: ListDocumentSnapshotsResultSchema
    },
    parseListDocumentSnapshotsParams,
    listDocumentSnapshots
  ),
  defineTool(
    {
      name: "get_document_snapshot",
      description:
        "Get one point-in-time Huly document history snapshot and return markdown content. Resolve the document by teamspace plus document title or ID; resolve the snapshot by snapshotId, exact snapshot title, or exact createdOn timestamp. Prefer snapshotId from list_document_snapshots when titles or dates may collide. Restore is out of scope.",
      category: CATEGORY,
      inputSchema: getDocumentSnapshotParamsJsonSchema,
      resultSchema: GetDocumentSnapshotResultSchema
    },
    parseGetDocumentSnapshotParams,
    getDocumentSnapshot
  )
]
