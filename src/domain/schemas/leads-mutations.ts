import { Schema } from "effect"

import {
  BlobId,
  Count,
  DocId,
  NonEmptyString,
  OrganizationId,
  PersonId,
  PersonName,
  SpaceId,
  StatusName,
  TaskTypeId,
  Timestamp,
  WorkflowStatusId
} from "./shared.js"
import { FunnelIdentifier, LeadIdentifier } from "./leads.js"

export const LeadRelationCollectionSchema = Schema.Literals(["comments", "attachments", "labels"]).annotate({
  title: "LeadRelationCollection",
  description: "Native Huly relation collection attached to a lead."
})
export type LeadRelationCollection = Schema.Schema.Type<typeof LeadRelationCollectionSchema>

export const LeadDescriptionFieldSchema = Schema.Literals(["description", "customerDescription"]).annotate({
  title: "LeadDescriptionField",
  description: "Native Markdown field that stores a lead or customer description."
})
export type LeadDescriptionField = Schema.Schema.Type<typeof LeadDescriptionFieldSchema>

export const LeadMutationDocumentSchema = Schema.Struct({
  _id: DocId,
  _class: DocId,
  space: SpaceId,
  modifiedBy: PersonId,
  modifiedOn: Timestamp,
  title: NonEmptyString,
  identifier: LeadIdentifier,
  status: WorkflowStatusId,
  kind: TaskTypeId,
  assignee: Schema.NullOr(PersonId),
  description: Schema.NullOr(BlobId),
  startDate: Schema.NullOr(Timestamp),
  dueDate: Schema.NullOr(Timestamp),
  attachedTo: DocId,
  attachedToClass: DocId,
  collection: Schema.Literal("leads"),
  comments: Schema.optional(Count),
  attachments: Schema.optional(Count),
  labels: Schema.optional(Count)
}).annotate({
  title: "LeadMutationDocument",
  description: "Schema-owned native Lead fields used by mutation operations."
})
export type LeadMutationDocument = Schema.Schema.Type<typeof LeadMutationDocumentSchema>

const LeadBoundaryRestSchema = [Schema.Record(Schema.String, Schema.Unknown)]

export const LeadPersonDocumentSchema = Schema.StructWithRest(
  Schema.Struct({ _id: PersonId, _class: DocId, space: SpaceId, name: PersonName }),
  LeadBoundaryRestSchema
).annotate({
  title: "LeadPersonDocument",
  description: "Minimal schema-owned Person fields required by lead mutations."
})
export type LeadPersonDocument = Schema.Schema.Type<typeof LeadPersonDocumentSchema>

export const LeadOrganizationDocumentSchema = Schema.StructWithRest(
  Schema.Struct({ _id: OrganizationId, _class: DocId, space: SpaceId, name: NonEmptyString }),
  LeadBoundaryRestSchema
).annotate({
  title: "LeadOrganizationDocument",
  description: "Minimal schema-owned Organization fields required by lead mutations."
})
export type LeadOrganizationDocument = Schema.Schema.Type<typeof LeadOrganizationDocumentSchema>

export const LeadEmployeeDocumentSchema = Schema.StructWithRest(
  Schema.Struct({
    _id: PersonId,
    _class: DocId,
    space: SpaceId,
    name: PersonName,
    position: Schema.optionalKey(Schema.NullOr(Schema.String))
  }),
  LeadBoundaryRestSchema
).annotate({
  title: "LeadEmployeeDocument",
  description: "Minimal schema-owned Contact Employee fields required by lead mutations."
})
export type LeadEmployeeDocument = Schema.Schema.Type<typeof LeadEmployeeDocumentSchema>

export const LeadCustomerMixinAttributesSchema = Schema.Struct({ customerDescription: Schema.NullOr(BlobId) }).annotate(
  {
    title: "LeadCustomerMixinAttributes",
    description: "Validated native Customer mixin description reference used by lead mutations."
  }
)
export type LeadCustomerMixinAttributes = Schema.Schema.Type<typeof LeadCustomerMixinAttributesSchema>

export const LeadMutationResultSchema = Schema.Struct({ identifier: LeadIdentifier, updated: Schema.Boolean }).annotate(
  { title: "LeadMutationResult", description: "Result of a native lead update." }
)
export type LeadMutationResult = Schema.Schema.Type<typeof LeadMutationResultSchema>

export const MoveLeadResultSchema = Schema.Struct({
  identifier: LeadIdentifier,
  sourceFunnel: FunnelIdentifier,
  destinationFunnel: FunnelIdentifier,
  status: StatusName,
  moved: Schema.Boolean
}).annotate({ title: "MoveLeadResult", description: "Result of moving a native lead between funnels." })
export type MoveLeadResult = Schema.Schema.Type<typeof MoveLeadResultSchema>

export const LeadImpactSchema = Schema.Struct({
  comments: Count,
  attachments: Count,
  labels: Count,
  totalAffected: Count
}).annotate({ title: "LeadImpact", description: "Authoritative native lead content counts affected by deletion." })
export type LeadImpact = Schema.Schema.Type<typeof LeadImpactSchema>

export const DeleteLeadResultSchema = Schema.Struct({
  identifier: LeadIdentifier,
  funnel: FunnelIdentifier,
  impact: LeadImpactSchema,
  deleted: Schema.Boolean
}).annotate({ title: "DeleteLeadResult", description: "Lead deletion preview or execution result." })
export type DeleteLeadResult = Schema.Schema.Type<typeof DeleteLeadResultSchema>

export const MakePersonCustomerResultSchema = Schema.Struct({ id: PersonId, applied: Schema.Boolean }).annotate({
  title: "MakePersonCustomerResult",
  description: "Result of applying the Customer mixin to a person."
})
export type MakePersonCustomerResult = Schema.Schema.Type<typeof MakePersonCustomerResultSchema>
