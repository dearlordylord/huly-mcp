import { Schema } from "effect"
import { MovementIssueSchema } from "./issue-movement-state.js"
import { TransferIssueSchema, TransferWriteSchema } from "./issue-transfer.js"
import { IssueId } from "./shared.js"

export const TransferTreeTaskWriteSchema = Schema.Struct({
  ...TransferWriteSchema.fields,
  expectedIssue: TransferIssueSchema,
  expectedHierarchy: MovementIssueSchema,
  finalParents: MovementIssueSchema.fields.parents
})
export type TransferTreeTaskWrite = Schema.Schema.Type<typeof TransferTreeTaskWriteSchema>
export const TransferTreeWriteSchema = Schema.Struct({
  rootId: IssueId,
  tasks: Schema.Array(TransferTreeTaskWriteSchema),
  ancestors: Schema.Array(MovementIssueSchema)
})
export type TransferTreeWrite = Schema.Schema.Type<typeof TransferTreeWriteSchema>
