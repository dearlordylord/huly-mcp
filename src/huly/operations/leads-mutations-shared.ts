import type { MarkupFormat } from "@hcengineering/api-client"
import type { Contact, Employee, Organization, Person } from "@hcengineering/contact"
import type { Blob, Class, Doc, DocumentUpdate, MarkupBlobRef, Ref, Space, Status } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect, Option, Schema } from "effect"

import {
  FunnelIdentifier,
  type FunnelReference,
  type LeadIdentifier,
  type UpdateLeadParams
} from "../../domain/schemas/leads.js"
import {
  LeadCustomerMixinAttributesSchema,
  LeadEmployeeDocumentSchema,
  LeadMutationDocumentSchema,
  LeadOrganizationDocumentSchema,
  LeadPersonDocumentSchema,
  type LeadDescriptionField,
  type LeadEmployeeDocument,
  type LeadMutationDocument,
  type LeadOrganizationDocument,
  type LeadPersonDocument
} from "../../domain/schemas/leads-mutations.js"
import type { PersonLocator } from "../../domain/schemas/hr-departments.js"
import {
  BlobId,
  Count,
  Email,
  NonEmptyString,
  PersonName,
  type PersonRefInput,
  StatusName,
  type Timestamp
} from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  FunnelIdentifierAmbiguousError,
  FunnelNotFoundError,
  FunnelProjectTypeNotFoundError,
  FunnelWorkflowInvalidError,
  LeadDeleteConflictError,
  LeadMoveConflictError,
  LeadUpdateConflictError
} from "../errors-leads.js"
import { LeadNotFoundError } from "../errors-leads.js"
import {
  HulyDataInvalidError,
  HulyError,
  InvalidStatusError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import type { OrganizationIdentifierAmbiguousError, OrganizationNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { findPersonByExactEmail, findPersonByExactName, findPersonById } from "./contacts-shared.js"
import {
  funnelSpace,
  getFunnelProjectType,
  resolveFunnel,
  resolveFunnelWorkflow,
  type FunnelWorkflowTaskType,
  type HulyFunnel
} from "./funnels-shared.js"
import { renderMarkdownWithNativeReferencesForWrite } from "./native-reference-markup.js"
import { hulyQuery } from "./query-helpers.js"
import { markupBlobRefAsMarkupRef } from "./recruiting-shared.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

// Parsed native Lead projection. The SDK response is decoded by
// LeadMutationDocumentSchema before this internal representation is created;
// this alias keeps every selected field schema-derived.
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

type LeadMutationQueryDocument = Doc & Pick<LeadMutationDocument, "identifier">

export type LeadDocumentUpdate = DocumentUpdate<Doc> & {
  readonly title?: NonEmptyString
  readonly description?: MarkupBlobRef | null
  readonly status?: Ref<Status>
  readonly assignee?: Ref<Person> | null
  readonly startDate?: Timestamp | null
  readonly dueDate?: Timestamp | null
  readonly kind?: Ref<TaskType>
}

// This is an internal SDK write port. Raw contacts are supplied by the SDK and
// the only extra field is constructed from schema-decoded native markup data.
export type CustomerMixinWrite = Contact & { readonly customerDescription: MarkupBlobRef | null }

export type HulyCustomer = LeadPersonDocument | LeadOrganizationDocument
export type ValidatedFunnel = { readonly funnel: HulyFunnel; readonly workflow: ReadonlyArray<FunnelWorkflowTaskType> }

export type LeadMutationError =
  | HulyClientError
  | FunnelNotFoundError
  | FunnelIdentifierAmbiguousError
  | FunnelProjectTypeNotFoundError
  | FunnelWorkflowInvalidError
  | LeadNotFoundError
  | LeadUpdateConflictError
  | LeadMoveConflictError
  | LeadDeleteConflictError
  | InvalidStatusError
  | HulyError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | HulyDataInvalidError

const toMarkupBlobRef = (value: NonEmptyString): MarkupBlobRef => toRef<Blob>(value)

const parseBoundaryDocument = <S extends Schema.Constraint>(
  schema: S,
  value: unknown,
  entity: string
): Effect.Effect<S["Type"], HulyDataInvalidError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "leadMutation", entity, cause }))
  )

const parseLeadPersonDocument = Effect.fn("Lead.parsePersonDocument")(
  (value: unknown): Effect.Effect<LeadPersonDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadPersonDocumentSchema, value, "Person document")
)

const parseOptionalLeadPersonDocument = Effect.fn("Lead.parseOptionalPersonDocument")(
  (value: Person | undefined): Effect.Effect<LeadPersonDocument | undefined, HulyDataInvalidError> =>
    value === undefined ? Effect.succeed(undefined) : parseLeadPersonDocument(value)
)

const parseLeadEmployeeDocument = Effect.fn("Lead.parseEmployeeDocument")(
  (value: unknown): Effect.Effect<LeadEmployeeDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadEmployeeDocumentSchema, value, "Employee document")
)

const parseLeadOrganizationDocument = Effect.fn("Lead.parseOrganizationDocument")(
  (value: unknown): Effect.Effect<LeadOrganizationDocument, HulyDataInvalidError> =>
    parseBoundaryDocument(LeadOrganizationDocumentSchema, value, "Organization document")
)

export const customerMixinWriteAttributes = Effect.fn("Lead.customerMixinWriteAttributes")(function* (
  value: unknown
): Effect.fn.Return<Pick<CustomerMixinWrite, "customerDescription">, HulyDataInvalidError> {
  const attributes = yield* parseBoundaryDocument<typeof LeadCustomerMixinAttributesSchema>(
    LeadCustomerMixinAttributesSchema,
    value,
    "Customer mixin attributes"
  )
  const customerDescription = attributes.customerDescription
  return { customerDescription: customerDescription === null ? null : toMarkupBlobRef(customerDescription) }
})

const parseLeadMutationDocument = Effect.fn("Lead.parseMutationDocument")(
  (value: unknown): Effect.Effect<HulyLead, HulyDataInvalidError> =>
    Schema.decodeUnknownEffect(LeadMutationDocumentSchema)(value).pipe(
      Effect.mapError(
        (cause) => new HulyDataInvalidError({ operation: "leadMutation", entity: "Lead document", cause })
      ),
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

const customerClass = (customer: HulyCustomer): Ref<Class<Contact>> =>
  String(customer._class) === String(contact.class.Organization)
    ? toClassRef<Contact>(contact.class.Organization)
    : toClassRef<Contact>(contact.class.Person)

export const hasCustomerMixin = (customer: HulyCustomer): boolean =>
  Object.hasOwn(customer, String(leadClassIds.mixin.Customer))

export const uniquePersonMatch = Effect.fn("Lead.uniquePersonMatch")((
  identifier: string,
  candidates: ReadonlyArray<LeadPersonDocument | undefined>
): Effect.Effect<LeadPersonDocument, PersonIdentifierAmbiguousError | PersonNotFoundError> => {
  const uniqueMatches = [
    ...new Map(
      candidates
        .filter((person): person is LeadPersonDocument => person !== undefined)
        .map((person) => [String(person._id), person])
    ).values()
  ]
  if (uniqueMatches.length > 1) {
    return Effect.fail(new PersonIdentifierAmbiguousError({ identifier, matches: Count.make(uniqueMatches.length) }))
  }
  const person = uniqueMatches[0]
  return person === undefined ? Effect.fail(new PersonNotFoundError({ identifier })) : Effect.succeed(person)
})

/** Resolve all exact modalities, so an ID/text collision is ambiguous. */
export const resolveExactPerson = Effect.fn("Lead.resolveExactPerson")(function* (
  client: HulyClient["Service"],
  identifier: PersonLocator
): Effect.fn.Return<
  LeadPersonDocument,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | HulyDataInvalidError
> {
  const byEmail = Option.match(Schema.decodeUnknownOption(Email)(identifier), {
    onNone: () => Effect.succeed<Person | undefined>(undefined),
    onSome: (email) => findPersonByExactEmail(client, email)
  })
  const [byId, byEmailPerson, byName] = yield* Effect.all([
    findPersonById(client, identifier).pipe(Effect.flatMap(parseOptionalLeadPersonDocument)),
    byEmail.pipe(Effect.flatMap(parseOptionalLeadPersonDocument)),
    findPersonByExactName(client, PersonName.make(identifier)).pipe(Effect.flatMap(parseOptionalLeadPersonDocument))
  ])
  return yield* uniquePersonMatch(identifier, [byId, byEmailPerson, byName])
})

export const resolveEmployee = Effect.fn("Lead.resolveEmployee")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
): Effect.fn.Return<
  Ref<Person>,
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | HulyDataInvalidError
> {
  const person = yield* resolveExactPerson(client, identifier)
  const employee = yield* client.findOne<Employee>(
    contact.mixin.Employee,
    hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
  )
  const parsedEmployee = employee === undefined ? undefined : yield* parseLeadEmployeeDocument(employee)
  return parsedEmployee === undefined
    ? yield* new PersonNotAnEmployeeError({ identifier })
    : toRef<Person>(parsedEmployee._id)
})

export const validatedFunnel = Effect.fn("Lead.validatedFunnel")(function* (
  client: HulyClient["Service"],
  identifier: UpdateLeadParams["funnel"]
): Effect.fn.Return<ValidatedFunnel, LeadMutationError, Diagnostics> {
  const funnel = yield* resolveFunnel(client, identifier)
  const projectType = yield* getFunnelProjectType(client, funnel)
  const workflow = yield* resolveFunnelWorkflow(client, projectType)
  return { funnel, workflow }
})

export const findLead = Effect.fn("Lead.findLead")(function* (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  identifier: LeadIdentifier
): Effect.fn.Return<HulyLead, HulyClientError | LeadNotFoundError | HulyDataInvalidError> {
  const lead = yield* client.findOne<LeadMutationQueryDocument>(
    leadClassIds.class.Lead,
    hulyQuery<LeadMutationQueryDocument>({ space: funnelSpace(funnel), identifier })
  )
  return lead === undefined
    ? yield* new LeadNotFoundError({ identifier, funnel: FunnelIdentifier.make(funnel._id) })
    : yield* parseLeadMutationDocument(lead)
})

export const workflowForLead = Effect.fn("Lead.workflowForLead")((
  workflow: ReadonlyArray<FunnelWorkflowTaskType>,
  lead: HulyLead,
  funnel: HulyFunnel
): Effect.Effect<FunnelWorkflowTaskType, HulyError> => {
  const match = workflow.find((candidate) => String(candidate.taskType._id) === String(lead.kind))
  return match === undefined
    ? Effect.fail(
        new HulyError({
          message: `Lead '${lead.identifier}' uses task type '${lead.kind}' which is not configured in funnel '${funnel.name}'`
        })
      )
    : Effect.succeed(match)
})

export const statusByName = Effect.fn("Lead.statusByName")((
  statuses: ReadonlyArray<{ readonly id: Ref<Status>; readonly name: string }>,
  name: StatusName,
  funnel: FunnelReference
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const matches = statuses.filter((status) => normalizeForComparison(status.name) === normalizeForComparison(name))
  return matches.length === 1 && matches[0] !== undefined
    ? Effect.succeed(matches[0].id)
    : Effect.fail(new InvalidStatusError({ status: name, project: funnel }))
})

export const currentStatus = Effect.fn("Lead.currentStatus")((
  workflow: FunnelWorkflowTaskType,
  lead: HulyLead,
  funnel: HulyFunnel
): Effect.Effect<{ readonly id: Ref<Status>; readonly name: StatusName }, HulyError> => {
  const status = workflow.statuses.find((candidate) => String(candidate.id) === String(lead.status))
  return status === undefined
    ? Effect.fail(
        new HulyError({
          message: `Lead '${lead.identifier}' has status '${lead.status}' which is not configured in funnel '${funnel.name}'`
        })
      )
    : Effect.succeed({ id: status.id, name: StatusName.make(status.name) })
})

const renderMarkup = Effect.fn("Lead.renderMarkup")((
  client: HulyClient["Service"],
  content: string,
  field: LeadDescriptionField
): Effect.Effect<{ readonly markup: string; readonly format: MarkupFormat }, HulyError> => {
  const rendered = renderMarkdownWithNativeReferencesForWrite(content, client.markupUrlConfig, field)
  return rendered._tag === "success"
    ? Effect.succeed(rendered.rendered)
    : Effect.fail(new HulyError({ message: rendered.reason }))
})

export const updateLeadDescription = Effect.fn("Lead.updateLeadDescription")(function* (
  client: HulyClient["Service"],
  lead: HulyLead,
  content: string | null
): Effect.fn.Return<
  { readonly operations: LeadDocumentUpdate; readonly changed: boolean },
  HulyClientError | HulyError
> {
  if (content === null) {
    return lead.description === null
      ? { operations: {}, changed: false }
      : { operations: { description: null }, changed: true }
  }
  const rendered = yield* renderMarkup(client, content, "description")
  if (lead.description === null) {
    const uploaded = yield* client.uploadMarkup(
      leadClassIds.class.Lead,
      toRef<Doc>(lead._id),
      "description",
      rendered.markup,
      rendered.format
    )
    return { operations: { description: toMarkupBlobRef(NonEmptyString.make(uploaded)) }, changed: true }
  }
  const currentMarkup = yield* client.fetchMarkup(
    leadClassIds.class.Lead,
    toRef<Doc>(lead._id),
    "description",
    markupBlobRefAsMarkupRef(toMarkupBlobRef(lead.description)),
    rendered.format
  )
  if (currentMarkup === rendered.markup) return { operations: {}, changed: false }
  yield* client.updateMarkup(
    leadClassIds.class.Lead,
    toRef<Doc>(lead._id),
    "description",
    rendered.markup,
    rendered.format
  )
  return { operations: {}, changed: true }
})

const findLeadCustomer = Effect.fn("Lead.findLeadCustomer")(function* (
  client: HulyClient["Service"],
  lead: HulyLead
): Effect.fn.Return<HulyCustomer, HulyClientError | HulyError | HulyDataInvalidError> {
  const customerId = toRef<Contact>(lead.attachedTo)
  const person = yield* client.findOne<Person>(contact.class.Person, hulyQuery<Person>({ _id: customerId }))
  if (person !== undefined) return yield* parseLeadPersonDocument(person)
  const organization = yield* client.findOne<Organization>(
    contact.class.Organization,
    hulyQuery<Organization>({ _id: toRef<Organization>(customerId) })
  )
  return organization === undefined
    ? yield* new HulyError({ message: `Lead '${lead.identifier}' references a missing customer` })
    : yield* parseLeadOrganizationDocument(organization)
})

const updateCustomerDescription = Effect.fn("Lead.updateCustomerDescription")(function* (
  client: HulyClient["Service"],
  customer: HulyCustomer,
  content: string | null
): Effect.fn.Return<boolean, HulyClientError | HulyError | HulyDataInvalidError> {
  if (content === null && !hasCustomerMixin(customer)) return false
  if (content === null) {
    const attributes = yield* customerMixinWriteAttributes({ customerDescription: null })
    yield* client.updateMixin<Contact, CustomerMixinWrite>(
      toRef<Contact>(customer._id),
      customerClass(customer),
      toRef<Space>(customer.space),
      toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
      attributes
    )
    return true
  }

  const rendered = yield* renderMarkup(client, content, "customerDescription")
  const uploaded = yield* client.uploadMarkup(
    toClassRef<Doc>(String(customerClass(customer))),
    toRef<Doc>(customer._id),
    "customerDescription",
    rendered.markup,
    rendered.format
  )
  const attributes = yield* customerMixinWriteAttributes({ customerDescription: BlobId.make(uploaded) })
  if (hasCustomerMixin(customer)) {
    yield* client.updateMixin<Contact, CustomerMixinWrite>(
      toRef<Contact>(customer._id),
      customerClass(customer),
      toRef<Space>(customer.space),
      toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
      attributes
    )
  } else {
    yield* client.createMixin<Contact, CustomerMixinWrite>(
      toRef<Contact>(customer._id),
      customerClass(customer),
      toRef<Space>(customer.space),
      toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
      attributes
    )
  }
  return true
})

export const updateLeadCustomerDescription = Effect.fn("Lead.updateLeadCustomerDescription")(function* (
  client: HulyClient["Service"],
  lead: HulyLead,
  content: string | null
): Effect.fn.Return<boolean, HulyClientError | HulyError | HulyDataInvalidError> {
  const customer = yield* findLeadCustomer(client, lead)
  return yield* updateCustomerDescription(client, customer, content)
})
