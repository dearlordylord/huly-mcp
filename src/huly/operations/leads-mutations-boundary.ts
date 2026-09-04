import type { Person } from "@hcengineering/contact"
import type { Blob, MarkupBlobRef, Ref } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import {
  LeadCustomerMixinAttributesSchema,
  LeadEmployeeDocumentSchema,
  LeadMutationDocumentSchema,
  LeadOrganizationDocumentSchema,
  LeadPersonDocumentSchema,
  type LeadMutationDocument,
  LeadReadDocumentSchema,
  type LeadReadDocument,
  type LeadOrganizationDocument,
  type LeadPersonDocument
} from "../../domain/schemas/leads-mutations.js"
import type { FunnelIdentifier, LeadIdentifier } from "../../domain/schemas/leads.js"
import { type NonEmptyString, type PersonLocator } from "../../domain/schemas/shared.js"
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

const parseBoundaryDocument = <S extends Schema.Constraint>(
  schema: S,
  value: unknown,
  operation: string,
  entity: string
): Effect.Effect<S["Type"], HulyDataInvalidError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation, entity, cause }))
  )

export const parseLeadPersonDocument = Effect.fn("Lead.parsePersonDocument")(
  (value: unknown): Effect.Effect<LeadPersonDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadPersonDocumentSchema, value, "leadMutation", "Person document")
)

export const parseLeadReadDocument = Effect.fn("Lead.parseReadDocument")(
  (value: unknown): Effect.Effect<LeadReadDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadReadDocumentSchema, value, "getLead", "Lead read document")
)

export const parseOptionalLeadPersonDocument = Effect.fn("Lead.parseOptionalPersonDocument")(
  (value: Person | undefined): Effect.Effect<LeadPersonDocument | undefined, HulyDataInvalidError> =>
    value === undefined ? Effect.succeed(undefined) : parseLeadPersonDocument(value)
)

export const requireEmployee = Effect.fn("Lead.requireEmployee")(function* (
  identifier: PersonLocator,
  employee: unknown
): Effect.fn.Return<Ref<Person>, PersonNotAnEmployeeError | HulyDataInvalidError> {
  const parsedEmployee =
    employee === undefined
      ? undefined
      : yield* parseBoundaryDocument(LeadEmployeeDocumentSchema, employee, "leadMutation", "Employee document")
  return parsedEmployee === undefined
    ? yield* new PersonNotAnEmployeeError({ identifier })
    : toRef<Person>(parsedEmployee._id)
})

export const requireLeadDocument = Effect.fn("Lead.requireLeadDocument")(function* (
  lead: unknown,
  identifier: LeadIdentifier,
  funnel: FunnelIdentifier
): Effect.fn.Return<HulyLead, LeadNotFoundError | HulyDataInvalidError> {
  if (lead === undefined) return yield* new LeadNotFoundError({ identifier, funnel })
  const parsed = yield* parseBoundaryDocument(LeadMutationDocumentSchema, lead, "leadMutation", "Lead document")
  return {
    _id: parsed._id,
    _class: parsed._class,
    space: parsed.space,
    title: parsed.title,
    identifier: parsed.identifier,
    status: parsed.status,
    kind: parsed.kind,
    assignee: parsed.assignee,
    description: parsed.description,
    startDate: parsed.startDate,
    dueDate: parsed.dueDate,
    attachedTo: parsed.attachedTo,
    attachedToClass: parsed.attachedToClass,
    collection: parsed.collection
  }
})

export const resolveLeadCustomer = Effect.fn("Lead.resolveLeadCustomer")(function* (
  person: unknown,
  organization: unknown,
  lead: HulyLead
): Effect.fn.Return<LeadPersonDocument | LeadOrganizationDocument, HulyError | HulyDataInvalidError> {
  if (person !== undefined) return yield* parseLeadPersonDocument(person)
  return organization === undefined
    ? yield* new HulyError({ message: `Lead '${lead.identifier}' references a missing customer` })
    : yield* parseBoundaryDocument(
        LeadOrganizationDocumentSchema,
        organization,
        "leadMutation",
        "Organization document"
      )
})

export const customerMixinWriteAttributes = Effect.fn("Lead.customerMixinWriteAttributes")(function* (
  value: unknown
): Effect.fn.Return<{ readonly customerDescription: MarkupBlobRef | null }, HulyDataInvalidError> {
  const attributes = yield* parseBoundaryDocument(
    LeadCustomerMixinAttributesSchema,
    value,
    "leadMutation",
    "Customer mixin attributes"
  )
  const customerDescription = attributes.customerDescription
  return { customerDescription: customerDescription === null ? null : toMarkupBlobRef(customerDescription) }
})
