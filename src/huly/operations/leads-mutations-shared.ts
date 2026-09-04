import type { MarkupFormat } from "@hcengineering/api-client"
import type { Contact, Employee, Organization, Person } from "@hcengineering/contact"
import type { Blob, Class, Doc, DocumentUpdate, MarkupBlobRef, Ref, Status } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect, Option, Schema } from "effect"

import {
  FunnelIdentifier,
  LeadMutationDocumentSchema,
  type LeadMutationDocument,
  type FunnelReference,
  type LeadIdentifier,
  type UpdateLeadParams
} from "../../domain/schemas/leads.js"
import type { PersonLocator } from "../../domain/schemas/hr-departments.js"
import {
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
// the only extra field is constructed from a validated native markup reference.
export type CustomerMixinWrite = Contact & { readonly customerDescription: MarkupBlobRef | null }

export type HulyCustomer = Person | Organization
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
  customer._class === contact.class.Organization
    ? toClassRef<Contact>(contact.class.Organization)
    : toClassRef<Contact>(contact.class.Person)

export const hasCustomerMixin = (customer: HulyCustomer): boolean =>
  Object.hasOwn(customer, String(leadClassIds.mixin.Customer))

export const uniquePersonMatch = Effect.fn("Lead.uniquePersonMatch")((
  identifier: string,
  candidates: ReadonlyArray<Person | undefined>
): Effect.Effect<Person, PersonIdentifierAmbiguousError | PersonNotFoundError> => {
  const uniqueMatches = [
    ...new Map(
      candidates
        .filter((person): person is Person => person !== undefined)
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
): Effect.fn.Return<Person, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> {
  const byEmail = Option.match(Schema.decodeUnknownOption(Email)(identifier), {
    onNone: () => Effect.succeed<Person | undefined>(undefined),
    onSome: (email) => findPersonByExactEmail(client, email)
  })
  const [byId, byEmailPerson, byName] = yield* Effect.all([
    findPersonById(client, identifier),
    byEmail,
    findPersonByExactName(client, PersonName.make(identifier))
  ])
  return yield* uniquePersonMatch(identifier, [byId, byEmailPerson, byName])
})

export const resolveEmployee = Effect.fn("Lead.resolveEmployee")(function* (
  client: HulyClient["Service"],
  identifier: PersonRefInput
): Effect.fn.Return<
  Ref<Person>,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | PersonNotAnEmployeeError
> {
  const person = yield* resolveExactPerson(client, identifier)
  const employee = yield* client.findOne<Employee>(
    contact.mixin.Employee,
    hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
  )
  return employee === undefined ? yield* new PersonNotAnEmployeeError({ identifier }) : toRef<Person>(employee._id)
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
  field: string
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
  if (lead.attachedTo === undefined) {
    return yield* new HulyDataInvalidError({
      operation: "updateLead",
      entity: `Lead '${lead.identifier}' customer reference`
    })
  }
  const customerId = toRef<Contact>(lead.attachedTo)
  const person = yield* client.findOne<Person>(contact.class.Person, hulyQuery<Person>({ _id: customerId }))
  if (person !== undefined) return person
  const organization = yield* client.findOne<Organization>(
    contact.class.Organization,
    hulyQuery<Organization>({ _id: toRef<Organization>(customerId) })
  )
  return organization === undefined
    ? yield* new HulyError({ message: `Lead '${lead.identifier}' references a missing customer` })
    : organization
})

const updateCustomerDescription = Effect.fn("Lead.updateCustomerDescription")(function* (
  client: HulyClient["Service"],
  customer: HulyCustomer,
  content: string | null
): Effect.fn.Return<boolean, HulyClientError | HulyError> {
  if (content === null && !hasCustomerMixin(customer)) return false
  if (content === null) {
    yield* client.updateMixin<Contact, CustomerMixinWrite>(
      toRef<Contact>(customer._id),
      customerClass(customer),
      customer.space,
      toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
      { customerDescription: null }
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
  const attributes = { customerDescription: toMarkupBlobRef(NonEmptyString.make(uploaded)) }
  if (hasCustomerMixin(customer)) {
    yield* client.updateMixin<Contact, CustomerMixinWrite>(
      toRef<Contact>(customer._id),
      customerClass(customer),
      customer.space,
      toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
      attributes
    )
  } else {
    yield* client.createMixin<Contact, CustomerMixinWrite>(
      toRef<Contact>(customer._id),
      customerClass(customer),
      customer.space,
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
