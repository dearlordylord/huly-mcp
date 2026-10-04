import { Schema } from "effect"
import { DocId, IssueId, IssueIdentifier, NonEmptyString, ObjectClassName, PositiveInteger } from "./shared.js"

export const MovementObservedTaskSchema = Schema.Struct({
  issueId: IssueId,
  projectId: DocId,
  parentId: Schema.NullOr(IssueId),
  identifier: IssueIdentifier,
  number: PositiveInteger
})
export const MovementObservedRecordSchema = Schema.Struct({
  recordId: DocId,
  objectClass: ObjectClassName,
  projectId: DocId,
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  collection: NonEmptyString
})
export const MovementDiscoveryEvidenceSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("complete") }),
  Schema.Struct({ status: Schema.Literal("incomplete"), reason: NonEmptyString })
])
export const MovementVerificationEvidenceSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("not-attempted") }),
  Schema.Struct({ status: Schema.Literal("unavailable"), reason: NonEmptyString }),
  Schema.Struct({
    status: Schema.Literal("observed"),
    completeness: Schema.Literal("complete"),
    consistency: Schema.Literal("consistent"),
    tasks: Schema.Array(MovementObservedTaskSchema),
    records: Schema.Array(MovementObservedRecordSchema)
  }),
  Schema.Struct({
    status: Schema.Literal("observed"),
    completeness: Schema.Literal("complete"),
    consistency: Schema.Literal("inconsistent"),
    reason: NonEmptyString,
    tasks: Schema.Array(MovementObservedTaskSchema),
    records: Schema.Array(MovementObservedRecordSchema)
  }),
  Schema.Struct({
    status: Schema.Literal("observed"),
    completeness: Schema.Literal("incomplete"),
    consistency: Schema.Literals(["inconsistent", "undetermined"]),
    reason: NonEmptyString,
    tasks: Schema.Array(MovementObservedTaskSchema),
    records: Schema.Array(MovementObservedRecordSchema)
  })
])
export const MovementNumberReservationSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("confirmed"), issueId: IssueId, number: PositiveInteger }),
  Schema.Struct({ status: Schema.Literal("uncertain"), issueId: IssueId })
])
const ExecutionFields = { reservations: Schema.Array(MovementNumberReservationSchema) }
export const MovementExecutionEvidenceSchema = Schema.Union([
  Schema.Struct({ ...ExecutionFields, phase: Schema.Literal("allocation"), commit: Schema.Literal("not-sent") }),
  Schema.Struct({
    ...ExecutionFields,
    phase: Schema.Literal("commit"),
    commit: Schema.Literals(["sent", "refused", "reply-lost"])
  }),
  Schema.Struct({ ...ExecutionFields, phase: Schema.Literal("verification"), commit: Schema.Literal("acknowledged") })
])
export const MovementUncertaintyFields = {
  destination: Schema.Struct({ projectId: DocId, parentId: Schema.NullOr(IssueId) }),
  discovery: MovementDiscoveryEvidenceSchema,
  verification: MovementVerificationEvidenceSchema,
  execution: MovementExecutionEvidenceSchema
}
export const MovementUncertaintyEvidenceSchema = Schema.Struct(MovementUncertaintyFields)
export type MovementUncertaintyEvidence = Schema.Schema.Type<typeof MovementUncertaintyEvidenceSchema>
