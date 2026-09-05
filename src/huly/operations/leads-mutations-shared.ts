import type { MarkupFormat } from "@hcengineering/api-client"
import type { Contact, Employee, Organization, Person } from "@hcengineering/contact"
import type { Class, Doc, DocumentUpdate, MarkupBlobRef, Ref, Status } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect, Option, Schema } from "effect"

import {
  FunnelIdentifier,
  type FunnelReference,
  type LeadIdentifier,
  type UpdateLeadParams
} from "../../domain/schemas/leads.js"
import {
  type LeadDescriptionField,
  type LeadMutationDocument,
  type LeadOrganizationDocument,
  type LeadPersonDocument,
  type LeadReadDocument
} from "../../domain/schemas/leads-mutations.js"
import {
  Count,
  Email,
  NonEmptyString,
  PersonName,
  type PersonLocator,
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
import { LeadIdentifierAmbiguousError, LeadNotFoundError } from "../errors-leads.js"
import {
  HulyDataInvalidError,
  HulyError,
  InvalidStatusError,
  type OrganizationIdentifierAmbiguousError,
  type OrganizationNotFoundError,
  type PersonIdentifierAmbiguousError,
  type PersonNotAnEmployeeError,
  type PersonNotFoundError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { findPersonByExactEmail, findPersonByExactName, findPersonById } from "./contacts-shared.js"
import { selectUniquePerson } from "./leads-mutation-decisions.js"
import {
  funnelSpace,
  getFunnelProjectType,
  resolveFunnel,
  resolveFunnelWorkflow,
  type FunnelWorkflowTaskType,
  type HulyFunnel
} from "./funnels-shared.js"
import { renderMarkdownWithNativeReferencesForWrite } from "./native-reference-markup.js"
import { findResultTotal, hulyQuery } from "./query-helpers.js"
import { markupBlobRefAsMarkupRef } from "./recruiting-shared.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import {
  type HulyLead,
  parseLeadPersonDocument,
  parseLeadReadDocument,
  parseOptionalLeadPersonDocument,
  requireEmployee,
  resolveLeadCustomer,
  toMarkupBlobRef
} from "./leads-mutations-boundary.js"

export type { HulyLead } from "./leads-mutations-boundary.js"

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
type ValidatedFunnel = { readonly funnel: HulyFunnel; readonly workflow: ReadonlyArray<FunnelWorkflowTaskType> }

export type LeadMutationError =
  | HulyClientError
  | FunnelNotFoundError
  | FunnelIdentifierAmbiguousError
  | FunnelProjectTypeNotFoundError
  | FunnelWorkflowInvalidError
  | LeadIdentifierAmbiguousError
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

export const customerClass = (customer: HulyCustomer): Ref<Class<Contact>> =>
  String(customer._class) === String(contact.class.Organization)
    ? toClassRef<Contact>(contact.class.Organization)
    : toClassRef<Contact>(contact.class.Person)

export const hasCustomerMixin = (customer: HulyCustomer): boolean =>
  Object.hasOwn(customer, String(leadClassIds.mixin.Customer))

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
  return yield* selectUniquePerson(identifier, [byId, byEmailPerson, byName])
})

export const resolveEmployee = Effect.fn("Lead.resolveEmployee")(function* (
  client: HulyClient["Service"],
  identifier: PersonLocator
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
  return yield* requireEmployee(identifier, employee)
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

export const findLeadReadDocument = Effect.fn("Lead.findLeadReadDocument")(function* (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  identifier: LeadIdentifier
): Effect.fn.Return<
  LeadReadDocument,
  HulyClientError | LeadIdentifierAmbiguousError | LeadNotFoundError | HulyDataInvalidError
> {
  const leads = yield* client.findAll<LeadMutationQueryDocument>(
    leadClassIds.class.Lead,
    hulyQuery<LeadMutationQueryDocument>({ space: funnelSpace(funnel), identifier }),
    { limit: 2, total: true }
  )
  const funnelId = FunnelIdentifier.make(funnel._id)
  if (leads.length > 1) {
    return yield* new LeadIdentifierAmbiguousError({
      identifier,
      funnel: funnelId,
      matches: Count.make(findResultTotal(leads))
    })
  }
  if (leads[0] === undefined) return yield* new LeadNotFoundError({ identifier, funnel: funnelId })
  return yield* parseLeadReadDocument(leads[0])
})

export const findLead = Effect.fn("Lead.findLead")(
  (
    client: HulyClient["Service"],
    funnel: HulyFunnel,
    identifier: LeadIdentifier
  ): Effect.Effect<
    HulyLead,
    HulyClientError | LeadIdentifierAmbiguousError | LeadNotFoundError | HulyDataInvalidError
  > => findLeadReadDocument(client, funnel, identifier)
)

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

export const renderLeadMutationMarkup = Effect.fn("Lead.renderMarkup")((
  client: HulyClient["Service"],
  content: string,
  field: LeadDescriptionField
): Effect.Effect<{ readonly markup: string; readonly format: MarkupFormat }, HulyError> => {
  const rendered = renderMarkdownWithNativeReferencesForWrite(content, client.markupUrlConfig, field)
  return rendered._tag === "success"
    ? Effect.succeed(rendered.rendered)
    : Effect.fail(new HulyError({ message: rendered.reason }))
})

type PreparedLeadDescription =
  | { readonly _tag: "unchanged" }
  | { readonly _tag: "clear" }
  | { readonly _tag: "upload"; readonly markup: string; readonly format: MarkupFormat }
  | { readonly _tag: "update"; readonly markup: string; readonly format: MarkupFormat }

export const prepareLeadDescription = Effect.fn("Lead.prepareLeadDescription")(function* (
  client: HulyClient["Service"],
  lead: HulyLead,
  content: string | null | undefined
): Effect.fn.Return<PreparedLeadDescription, HulyClientError | HulyError> {
  if (content === undefined || (content === null && lead.description === null)) return { _tag: "unchanged" }
  if (content === null) return { _tag: "clear" }
  const rendered = yield* renderLeadMutationMarkup(client, content, "description")
  if (lead.description === null) return { _tag: "upload", ...rendered }
  const currentMarkup = yield* client.fetchMarkup(
    leadClassIds.class.Lead,
    toRef<Doc>(lead._id),
    "description",
    markupBlobRefAsMarkupRef(toMarkupBlobRef(lead.description)),
    rendered.format
  )
  return currentMarkup === rendered.markup ? { _tag: "unchanged" } : { _tag: "update", ...rendered }
})

export const executeLeadDescription = Effect.fn("Lead.executeLeadDescription")(function* (
  client: HulyClient["Service"],
  lead: HulyLead,
  plan: PreparedLeadDescription
): Effect.fn.Return<{ readonly operations: LeadDocumentUpdate; readonly changed: boolean }, HulyClientError> {
  switch (plan._tag) {
    case "unchanged":
      return { operations: {}, changed: false }
    case "clear":
      return { operations: { description: null }, changed: true }
    case "upload": {
      const uploaded = yield* client.uploadMarkup(
        leadClassIds.class.Lead,
        toRef<Doc>(lead._id),
        "description",
        plan.markup,
        plan.format
      )
      return { operations: { description: toMarkupBlobRef(NonEmptyString.make(uploaded)) }, changed: true }
    }
    case "update":
      yield* client.updateMarkup(leadClassIds.class.Lead, toRef<Doc>(lead._id), "description", plan.markup, plan.format)
      return { operations: {}, changed: true }
  }
})

export const findLeadCustomer = Effect.fn("Lead.findLeadCustomer")(function* (
  client: HulyClient["Service"],
  lead: HulyLead
): Effect.fn.Return<HulyCustomer, HulyClientError | HulyError | HulyDataInvalidError> {
  const customerId = toRef<Contact>(lead.attachedTo)
  const customer = yield* client.findOne<Contact>(contact.class.Contact, hulyQuery<Contact>({ _id: customerId }))
  if (customer === undefined) {
    const organization = yield* client.findOne<Organization>(
      contact.class.Organization,
      hulyQuery<Organization>({ _id: toRef<Organization>(customerId) })
    )
    return yield* resolveLeadCustomer(undefined, organization, lead)
  }
  if (String(customer._class) === String(contact.class.Person)) return yield* parseLeadPersonDocument(customer)
  if (String(customer._class) === String(contact.class.Organization)) {
    return yield* resolveLeadCustomer(undefined, customer, lead)
  }
  return yield* new HulyDataInvalidError({
    operation: "leadMutation",
    entity: `Lead '${lead.identifier}' customer`,
    cause: customer
  })
})
