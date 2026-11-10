import type { Doc, Ref, TxOperations } from "@hcengineering/core"
import type { Document, Teamspace } from "@hcengineering/document"

import { HulyTransactionScope, type HulyConditionalWriteResult } from "../domain/schemas/shared.js"
import { documentPlugin } from "./huly-plugins.js"
import { hulyQuery } from "./operations/query-helpers.js"

// Internal SDK adapter input, assembled from documents read through the SDK.
type DocumentParentEdge = Pick<Document, "_id" | "parent">

export type DocumentMoveDestination =
  | { readonly type: "root" }
  | { readonly type: "nested"; readonly id: Ref<Document>; readonly parent: DocumentMoveDestination }

export const documentMoveParent = (destination: DocumentMoveDestination): Ref<Document> =>
  destination.type === "root" ? documentPlugin.ids.NoParent : destination.id

export const documentMoveEdges = (destination: DocumentMoveDestination): ReadonlyArray<DocumentParentEdge> => {
  const edges: Array<DocumentParentEdge> = []
  for (let current = destination; current.type === "nested"; current = current.parent) {
    edges.push({ _id: current.id, parent: documentMoveParent(current.parent) })
  }
  return edges
}

export interface DocumentMoveWrite {
  readonly space: Ref<Teamspace>
  readonly source: DocumentParentEdge
  readonly destination: DocumentMoveDestination
  readonly rank: Document["rank"]
}

export const commitDocumentMove = async (
  client: TxOperations,
  write: DocumentMoveWrite
): Promise<HulyConditionalWriteResult> => {
  const apply = client.apply(HulyTransactionScope.make(`document-move:${write.space}`))
  const objectClass = documentPlugin.class.Document
  apply.match(documentPlugin.class.Teamspace, hulyQuery<Teamspace>({ _id: write.space, archived: false }))
  const parent = documentMoveParent(write.destination)
  for (const { _id, parent } of [write.source, ...documentMoveEdges(write.destination)]) {
    apply.match(objectClass, hulyQuery<Document>({ _id, space: write.space, parent }))
  }
  // Huly compares string ranks in storage, although its SDK restricts ordered selectors to numbers.
  apply.notMatch<Doc>(objectClass, {
    ...hulyQuery<Document>({ space: write.space, parent }),
    rank: { $gte: write.rank }
  })
  await apply.updateDoc(objectClass, write.space, write.source._id, { parent, rank: write.rank })
  return (await apply.commit()).result ? "applied" : "condition-not-met"
}
