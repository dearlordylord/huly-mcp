import type { Person } from "@hcengineering/contact"
import type { Blob, MarkupBlobRef } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import {
  LeadCustomerMixinAttributesSchema,
  LeadEmployeeDocumentSchema,
  LeadOrganizationDocumentSchema,
  LeadPersonDocumentSchema,
  type LeadEmployeeDocument,
  type LeadOrganizationDocument,
  type LeadPersonDocument
} from "../../domain/schemas/leads-mutations.js"
import { type NonEmptyString } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"
import { toRef } from "./sdk-boundary.js"

export const toMarkupBlobRef = (value: NonEmptyString): MarkupBlobRef => toRef<Blob>(value)

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

export const customerMixinWriteAttributes = Effect.fn("Lead.customerMixinWriteAttributes")(function* (
  value: unknown
): Effect.fn.Return<{ readonly customerDescription: MarkupBlobRef | null }, HulyDataInvalidError> {
  const attributes = yield* parseBoundaryDocument(LeadCustomerMixinAttributesSchema, value, "Customer mixin attributes")
  const customerDescription = attributes.customerDescription
  return { customerDescription: customerDescription === null ? null : toMarkupBlobRef(customerDescription) }
})
