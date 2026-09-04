/** Shared, typed Lead mutation resolvers and write helpers. */
import type { MarkupFormat, MarkupRef } from "@hcengineering/api-client"
import type { Contact, Employee, Organization, Person } from "@hcengineering/contact"
import type { AttachedDoc, Blob, Class, Doc, DocumentUpdate, MarkupBlobRef, Ref, Status } from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import { Effect, Option, Schema } from "effect"

import type { LeadIdentifier, UpdateLeadParams } from "../../domain/schemas/leads.js"
import { FunnelIdentifier } from "../../domain/schemas/leads.js"
import { Count, Email, NonEmptyString, PersonName, PersonRefInput, StatusName } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import {
  FunnelIdentifierAmbiguousError,
  FunnelNotFoundError,
  FunnelProjectTypeNotFoundError,
  FunnelWorkflowInvalidError,
  LeadDeleteConflictError,
  LeadMoveConflictError,
  LeadNotFoundError,
  LeadUpdateConflictError
} from "../errors-leads.js"
import {
  HulyError,
  InvalidStatusError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
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

export interface HulyLead extends AttachedDoc {
  readonly title: string
  readonly identifier: string
  readonly status: Ref<Status>
  readonly kind: Ref<TaskType>
  readonly assignee: Ref<Person> | null
  readonly description: MarkupBlobRef | null
  readonly startDate: number | null
  readonly dueDate: number | null
  readonly comments?: number
  readonly attachments?: number
}

export interface HulyCustomerMixin extends Contact {
  readonly customerDescription: MarkupBlobRef | null
}

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

const toMarkupBlobRef = (value: MarkupRef): MarkupBlobRef => toRef<Blob>(NonEmptyString.make(value))

const customerClass = (customer: HulyCustomer): Ref<Class<Contact>> =>
  customer._class === contact.class.Organization
    ? toClassRef<Contact>(contact.class.Organization)
    : toClassRef<Contact>(contact.class.Person)

export const hasCustomerMixin = (customer: HulyCustomer): boolean =>
  Object.hasOwn(customer, String(leadClassIds.mixin.Customer))

export const uniquePersonMatch = (
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
}

/** Resolve all exact modalities, so an ID/text collision is ambiguous. */
export const resolveExactPerson = (
  client: HulyClient["Service"],
  identifier: string
): Effect.Effect<Person, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function* () {
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

export const resolveEmployee = (
  client: HulyClient["Service"],
  identifier: PersonRefInput
): Effect.Effect<
  Ref<Person>,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | PersonNotAnEmployeeError
> =>
  Effect.gen(function* () {
    const person = yield* resolveExactPerson(client, identifier)
    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
    )
    return employee === undefined ? yield* new PersonNotAnEmployeeError({ identifier }) : toRef<Person>(employee._id)
  })

export const validatedFunnel = (
  client: HulyClient["Service"],
  identifier: UpdateLeadParams["funnel"]
): Effect.Effect<ValidatedFunnel, LeadMutationError, Diagnostics> =>
  Effect.gen(function* () {
    const funnel = yield* resolveFunnel(client, identifier)
    const projectType = yield* getFunnelProjectType(client, funnel)
    const workflow = yield* resolveFunnelWorkflow(client, projectType)
    return { funnel, workflow }
  })

export const findLead = (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  identifier: LeadIdentifier
): Effect.Effect<HulyLead, HulyClientError | LeadNotFoundError> =>
  Effect.gen(function* () {
    const lead = yield* client.findOne<HulyLead>(
      leadClassIds.class.Lead,
      hulyQuery<HulyLead>({ space: funnelSpace(funnel), identifier })
    )
    return lead === undefined
      ? yield* new LeadNotFoundError({ identifier, funnel: FunnelIdentifier.make(funnel._id) })
      : lead
  })

export const workflowForLead = (
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
}

export const statusByName = (
  statuses: ReadonlyArray<{ readonly id: Ref<Status>; readonly name: string }>,
  name: string,
  funnel: string
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const matches = statuses.filter((status) => normalizeForComparison(status.name) === normalizeForComparison(name))
  return matches.length === 1 && matches[0] !== undefined
    ? Effect.succeed(matches[0].id)
    : Effect.fail(new InvalidStatusError({ status: name, project: funnel }))
}

export const currentStatus = (
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
}

const renderMarkup = (
  client: HulyClient["Service"],
  content: string,
  field: string
): Effect.Effect<{ readonly markup: string; readonly format: MarkupFormat }, HulyError> => {
  const rendered = renderMarkdownWithNativeReferencesForWrite(content, client.markupUrlConfig, field)
  return rendered._tag === "success"
    ? Effect.succeed(rendered.rendered)
    : Effect.fail(new HulyError({ message: rendered.reason }))
}

export const updateLeadDescription = (
  client: HulyClient["Service"],
  lead: HulyLead,
  content: string | null
): Effect.Effect<
  { readonly operations: DocumentUpdate<HulyLead>; readonly changed: boolean },
  HulyClientError | HulyError
> =>
  Effect.gen(function* () {
    if (content === null) {
      return lead.description === null
        ? { operations: {}, changed: false }
        : { operations: { description: null }, changed: true }
    }
    const rendered = yield* renderMarkup(client, content, "description")
    if (lead.description === null) {
      const uploaded = yield* client.uploadMarkup(
        leadClassIds.class.Lead,
        lead._id,
        "description",
        rendered.markup,
        rendered.format
      )
      return { operations: { description: toMarkupBlobRef(uploaded) }, changed: true }
    }
    const currentMarkup = yield* client.fetchMarkup(
      leadClassIds.class.Lead,
      lead._id,
      "description",
      markupBlobRefAsMarkupRef(lead.description),
      rendered.format
    )
    if (currentMarkup === rendered.markup) return { operations: {}, changed: false }
    yield* client.updateMarkup(leadClassIds.class.Lead, lead._id, "description", rendered.markup, rendered.format)
    return { operations: {}, changed: true }
  })

const findLeadCustomer = (
  client: HulyClient["Service"],
  lead: HulyLead
): Effect.Effect<HulyCustomer, HulyClientError | HulyError> =>
  Effect.gen(function* () {
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

const updateCustomerDescription = (
  client: HulyClient["Service"],
  customer: HulyCustomer,
  content: string | null
): Effect.Effect<boolean, HulyClientError | HulyError> =>
  Effect.gen(function* () {
    if (content === null && !hasCustomerMixin(customer)) return false
    if (content === null) {
      yield* client.updateMixin<Contact, HulyCustomerMixin>(
        toRef<Contact>(customer._id),
        customerClass(customer),
        customer.space,
        toMixinRef<HulyCustomerMixin>(leadClassIds.mixin.Customer),
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
    const attributes = { customerDescription: toMarkupBlobRef(uploaded) }
    if (hasCustomerMixin(customer)) {
      yield* client.updateMixin<Contact, HulyCustomerMixin>(
        toRef<Contact>(customer._id),
        customerClass(customer),
        customer.space,
        toMixinRef<HulyCustomerMixin>(leadClassIds.mixin.Customer),
        attributes
      )
    } else {
      yield* client.createMixin<Contact, HulyCustomerMixin>(
        toRef<Contact>(customer._id),
        customerClass(customer),
        customer.space,
        toMixinRef<HulyCustomerMixin>(leadClassIds.mixin.Customer),
        attributes
      )
    }
    return true
  })

export const updateLeadCustomerDescription = (
  client: HulyClient["Service"],
  lead: HulyLead,
  content: string | null
): Effect.Effect<boolean, HulyClientError | HulyError> =>
  Effect.gen(function* () {
    const customer = yield* findLeadCustomer(client, lead)
    return yield* updateCustomerDescription(client, customer, content)
  })
