import type { Person } from "@hcengineering/contact"
import type { Blob, MarkupBlobRef, Ref } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import {
  LeadCustomerMixinAttributesSchema,
  LeadEmployeeDocumentSchema,
  LeadMutationDocumentSchema,
  LeadOrganizationDocumentSchema,
  LeadPersonDocumentSchema,
  type LeadEmployeeDocument,
  type LeadMutationDocument,
  type LeadOrganizationDocument,
  type LeadPersonDocument
} from "../../domain/schemas/leads-mutations.js"
import type { FunnelIdentifier, LeadIdentifier } from "../../domain/schemas/leads.js"
import { type NonEmptyString, type PersonRefInput } from "../../domain/schemas/shared.js"
import { LeadNotFoundError } from "../errors-leads.js"
import { HulyDataInvalidError, HulyError, PersonNotAnEmployeeError } from "../errors.js"
import { toRef } from "./sdk-boundary.js"

export const toMarkupBlobRef = (value: NonEmptyString): MarkupBlobRef => toRef<Blob>(value)

export type HulyLead = Pick<
  LeadMutationDocument,
  | "_id"
  | "_class"
  | "space"
  | "title"
  | "identifier"
  | "status"
  | "kind"
  | "assignee"
  | "description"
  | "startDate"
  | "dueDate"
  | "attachedTo"
  | "attachedToClass"
  | "collection"
>

const parseBoundaryDocument = Effect.fn("Lead.parseBoundaryDocument")(
  <S extends Schema.Constraint>(
    schema: S,
    value: unknown,
    entity: string
  ): Effect.Effect<S["Type"], HulyDataInvalidError, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError((cause) => new HulyDataInvalidError({ operation: "leadMutation", entity, cause }))
    )
)

export const parseLeadPersonDocument = Effect.fn("Lead.parsePersonDocument")(
  (value: unknown): Effect.Effect<LeadPersonDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadPersonDocumentSchema, value, "Person document")
)

export const parseOptionalLeadPersonDocument = Effect.fn("Lead.parseOptionalPersonDocument")(
  (value: Person | undefined): Effect.Effect<LeadPersonDocument | undefined, HulyDataInvalidError> =>
    value === undefined ? Effect.succeed(undefined) : parseLeadPersonDocument(value)
)

export const parseLeadEmployeeDocument = Effect.fn("Lead.parseEmployeeDocument")(
  (value: unknown): Effect.Effect<LeadEmployeeDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadEmployeeDocumentSchema, value, "Employee document")
)

export const parseLeadOrganizationDocument = Effect.fn("Lead.parseOrganizationDocument")(
  (value: unknown): Effect.Effect<LeadOrganizationDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadOrganizationDocumentSchema, value, "Organization document")
)

export const parseLeadMutationDocument = Effect.fn("Lead.parseMutationDocument")(
  (value: unknown): Effect.Effect<HulyLead, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadMutationDocumentSchema, value, "Lead document").pipe(
      Effect.map((lead) => ({
        _id: lead._id,
        _class: lead._class,
        space: lead.space,
        title: lead.title,
        identifier: lead.identifier,
        status: lead.status,
        kind: lead.kind,
        assignee: lead.assignee,
        description: lead.description,
        startDate: lead.startDate,
        dueDate: lead.dueDate,
        attachedTo: lead.attachedTo,
        attachedToClass: lead.attachedToClass,
        collection: lead.collection
      }))
    )
)

export const requireEmployee = Effect.fn("Lead.requireEmployee")(function* (
  identifier: PersonRefInput,
  employee: unknown
): Effect.fn.Return<Ref<Person>, PersonNotAnEmployeeError | HulyDataInvalidError> {
  const parsedEmployee = employee === undefined ? undefined : yield* parseLeadEmployeeDocument(employee)
  return parsedEmployee === undefined
    ? yield* new PersonNotAnEmployeeError({ identifier })
    : toRef<Person>(parsedEmployee._id)
})

export const requireLeadDocument = Effect.fn("Lead.requireLeadDocument")(function* (
  lead: unknown,
  identifier: LeadIdentifier,
  funnel: FunnelIdentifier
): Effect.fn.Return<HulyLead, LeadNotFoundError | HulyDataInvalidError> {
  return lead === undefined
    ? yield* new LeadNotFoundError({ identifier, funnel })
    : yield* parseLeadMutationDocument(lead)
})

export const resolveLeadCustomer = Effect.fn("Lead.resolveLeadCustomer")(function* (
  person: unknown,
  organization: unknown,
  lead: HulyLead
): Effect.fn.Return<LeadPersonDocument | LeadOrganizationDocument, HulyError | HulyDataInvalidError> {
  if (person !== undefined) return yield* parseLeadPersonDocument(person)
  return organization === undefined
    ? yield* new HulyError({ message: `Lead '${lead.identifier}' references a missing customer` })
    : yield* parseLeadOrganizationDocument(organization)
})

export const customerMixinWriteAttributes = Effect.fn("Lead.customerMixinWriteAttributes")(function* (
  value: unknown
): Effect.fn.Return<{ readonly customerDescription: MarkupBlobRef | null }, HulyDataInvalidError> {
  const attributes = yield* parseBoundaryDocument(LeadCustomerMixinAttributesSchema, value, "Customer mixin attributes")
  const customerDescription = attributes.customerDescription
  return { customerDescription: customerDescription === null ? null : toMarkupBlobRef(customerDescription) }
})
