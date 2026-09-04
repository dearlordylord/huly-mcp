/**
 * Lead operations: list funnels, list leads, get lead.
 *
 * Upstream Huly references:
 * - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/plugins/lead/src/index.ts#L71-L82
 * - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/types.ts#L55-L57
 *
 * `@hcengineering/lead` is not available in this project, so these shapes are
 * mirrored from the upstream Huly lead package and model definitions.
 *
 * @module
 */
import type { MarkupRef } from "@hcengineering/api-client"
import type { Contact, Organization as HulyOrganization, Person } from "@hcengineering/contact"
import type { Blob, Doc, DocumentQuery, MarkupBlobRef, Ref, Space, Status, WithLookup } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  FunnelReference,
  GetLeadParams,
  LeadDetail,
  LeadSummary,
  ListLeadsParams
} from "../../domain/schemas/leads.js"
import {
  FunnelIdentifier,
  LeadIdentifier,
  LeadSummarySchema,
  parseLeadDetail as parseLeadDetailSchema
} from "../../domain/schemas/leads.js"
import { StatusName } from "../../domain/schemas/shared.js"
import { LeadCustomerMixinAttributesSchema } from "../../domain/schemas/leads-mutations.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { FunnelIdentifierAmbiguousError, FunnelNotFoundError } from "../errors-leads.js"
import { LeadNotFoundError } from "../errors-leads.js"
import { HulyDataInvalidError, InvalidStatusError } from "../errors.js"
import { contact, task } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { findPersonByEmailOrName } from "./contacts-shared.js"
import {
  findStatusDocs,
  resolveByStatusRef,
  type StatusMetadata,
  uniqueStatusRefs,
  workflowStatusFromRef
} from "./issues-shared.js"
import { clampLimit, escapeLikeWildcards } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import { type HulyFunnel, resolveFunnel } from "./funnels-shared.js"

export { listFunnels } from "./funnels.js"

interface HulyLead extends Doc {
  title: string
  identifier: string
  number: number
  status: Ref<Status>
  assignee: Ref<Person> | null
  description: MarkupBlobRef | null
  startDate: number | null
  dueDate: number | null
  attachedTo: Ref<Contact>
  parents: ReadonlyArray<{ parentId: Ref<Doc>; identifier: string; parentTitle: string }>
  modifiedOn: number
  createdOn: number
}

type StatusInfo = { _id: Ref<Status>; name: string }

type HulyCustomer = Contact | HulyOrganization

const funnelAsSpace = (funnel: HulyFunnel): Ref<Space> => toRef<Space>(funnel._id)

const statusInfosWithFallbacks = (
  statusRefs: ReadonlyArray<Ref<Status>>,
  statusDocs: ReadonlyArray<StatusMetadata>
): ReadonlyArray<StatusInfo> =>
  resolveByStatusRef(
    statusRefs,
    statusDocs,
    (statusDoc) => ({ _id: statusDoc._id, name: statusDoc.name }),
    (statusRef) => ({ _id: statusRef, name: workflowStatusFromRef(statusRef).name })
  )

// Huly lead descriptions are stored as blob-backed markup refs. The client
// fetch API accepts the wider MarkupRef shape, so this bridge is safe.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: MarkupBlobRef and MarkupRef are both erased to strings at runtime
const markupBlobRefAsMarkupRef = (value: MarkupBlobRef): MarkupRef => value as MarkupRef

const normalizeLeadIdentifier = (identifier: string): string => {
  const match = /^(?:LEAD-)?(\d+)$/i.exec(identifier.trim())
  /* v8 ignore start -- unreachable: callers pass a validated LeadIdentifier (LEAD-N), always matching the numeric pattern */
  if (match === null) return identifier.trim().toUpperCase()
  /* v8 ignore stop */
  return `LEAD-${match[1]}`
}

const findFunnel = (
  client: HulyClient["Service"],
  funnelIdentifier: FunnelReference
): Effect.Effect<HulyFunnel, FunnelNotFoundError | FunnelIdentifierAmbiguousError | HulyClientError> =>
  resolveFunnel(client, funnelIdentifier)

const getFunnelStatuses = (
  client: HulyClient["Service"],
  funnel: HulyFunnel
): Effect.Effect<ReadonlyArray<StatusInfo>, HulyClientError | HulyDataInvalidError, Diagnostics> =>
  Effect.gen(function* () {
    if (funnel.type === undefined) {
      return yield* Effect.fail(
        new HulyDataInvalidError({ operation: "readFunnel", entity: `funnel '${funnel._id}' ProjectType reference` })
      )
    }

    const projectType = yield* client.findOne<Doc & { statuses?: ReadonlyArray<{ _id: Ref<Status> }> }>(
      task.class.ProjectType,
      { _id: toRef<Doc>(funnel.type) }
    )

    if (projectType?.statuses === undefined) {
      return yield* Effect.fail(
        new HulyDataInvalidError({ operation: "readFunnel", entity: `funnel '${funnel._id}' ProjectType statuses` })
      )
    }

    const statusRefs = uniqueStatusRefs(projectType.statuses.map((status) => status._id))
    if (statusRefs.length === 0) {
      return yield* Effect.fail(
        new HulyDataInvalidError({ operation: "readFunnel", entity: `funnel '${funnel._id}' ProjectType statuses` })
      )
    }

    const statusDocs = yield* findStatusDocs(client, statusRefs)
    return statusInfosWithFallbacks(statusRefs, statusDocs)
  })

const resolveStatusName = (
  statuses: ReadonlyArray<StatusInfo>,
  statusId: Ref<Status>
): Effect.Effect<StatusName, HulyDataInvalidError> => {
  const statusDoc = statuses.find((status) => status._id === statusId)
  return statusDoc !== undefined
    ? Effect.succeed(StatusName.make(statusDoc.name))
    : Effect.fail(
        new HulyDataInvalidError({
          operation: "readLead",
          entity: `lead status '${statusId}' not defined on the funnel ProjectType`
        })
      )
}

const resolveStatusByName = (
  statuses: ReadonlyArray<StatusInfo>,
  statusName: string,
  funnel: string
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const normalizedInput = normalizeForComparison(statusName)
  const matchingStatus = statuses.find((status) => normalizeForComparison(status.name) === normalizedInput)
  if (matchingStatus === undefined) {
    return Effect.fail(new InvalidStatusError({ status: statusName, project: funnel }))
  }
  return Effect.succeed(matchingStatus._id)
}

const findCustomer = (
  client: HulyClient["Service"],
  customerId: Ref<Contact>
): Effect.Effect<HulyCustomer | undefined, HulyClientError> =>
  Effect.gen(function* () {
    const contactCustomer = yield* client.findOne<Contact>(contact.class.Contact, { _id: customerId })
    if (contactCustomer !== undefined) {
      return contactCustomer
    }

    return yield* client.findOne<HulyOrganization>(contact.class.Organization, {
      _id: toRef<HulyOrganization>(customerId)
    })
  })

type ListLeadsError =
  | HulyClientError
  | HulyDataInvalidError
  | FunnelNotFoundError
  | FunnelIdentifierAmbiguousError
  | InvalidStatusError

export const listLeads = (
  params: ListLeadsParams
): Effect.Effect<Array<LeadSummary>, ListLeadsError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const funnel = yield* findFunnel(client, params.funnel)
    const statuses = yield* getFunnelStatuses(client, funnel)

    const baseQuery: DocumentQuery<HulyLead> = { space: funnelAsSpace(funnel) }

    const statusFilter =
      params.status !== undefined ? { status: yield* resolveStatusByName(statuses, params.status, params.funnel) } : {}

    const assigneeParam = params.assignee

    const assigneeFilter =
      assigneeParam !== undefined
        ? yield* Effect.gen(function* () {
            const assigneePerson = yield* findPersonByEmailOrName(client, assigneeParam)
            return assigneePerson !== undefined ? { assignee: assigneePerson._id } : undefined
          })
        : {}

    if (assigneeFilter === undefined) return []

    const titleFilter =
      params.titleSearch !== undefined && params.titleSearch.trim() !== ""
        ? { title: { $like: `%${escapeLikeWildcards(params.titleSearch)}%` } }
        : {}

    const query: DocumentQuery<HulyLead> = { ...baseQuery, ...statusFilter, ...assigneeFilter, ...titleFilter }

    const limit = clampLimit(params.limit)

    type LeadWithLookup = WithLookup<HulyLead> & { $lookup?: { assignee?: Person; attachedTo?: HulyCustomer } }

    const leads = yield* client.findAll<LeadWithLookup>(leadClassIds.class.Lead, query, {
      limit,
      sort: { modifiedOn: SortingOrder.Descending },
      // Upstream lead views resolve attachedTo through the Customer mixin.
      // Reference:
      // https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/index.ts#L357-L360
      lookup: { assignee: contact.class.Person, attachedTo: leadClassIds.mixin.Customer }
    })

    const rawSummaries = yield* Effect.forEach(leads, (lead) =>
      Effect.gen(function* () {
        const status = yield* resolveStatusName(statuses, lead.status)

        return {
          identifier: lead.identifier,
          title: lead.title,
          status,
          assignee: lead.$lookup?.assignee?.name,
          customer: lead.$lookup?.attachedTo?.name,
          modifiedOn: lead.modifiedOn
        }
      })
    )

    const parseLeadSummaries = Schema.decodeUnknownEffect(Schema.Array(LeadSummarySchema))
    const validated = yield* parseLeadSummaries(rawSummaries).pipe(
      Effect.mapError(
        (parseError) => new HulyDataInvalidError({ operation: "listLeads", entity: "lead", cause: parseError })
      )
    )

    return [...validated]
  })

type GetLeadError =
  | HulyClientError
  | HulyDataInvalidError
  | FunnelNotFoundError
  | FunnelIdentifierAmbiguousError
  | LeadNotFoundError

const readCustomerDescription = Effect.fn("Lead.readCustomerDescription")(function* (
  client: HulyClient["Service"],
  customer: HulyCustomer | undefined
): Effect.fn.Return<string | null, HulyClientError | HulyDataInvalidError> {
  if (customer === undefined) return null
  const rawMixin = Reflect.get(customer, String(leadClassIds.mixin.Customer))
  if (rawMixin === undefined) return null
  const attributes = yield* Schema.decodeUnknownEffect(LeadCustomerMixinAttributesSchema)(rawMixin).pipe(
    Effect.mapError((cause) => new HulyDataInvalidError({ operation: "getLead", entity: "customer mixin", cause }))
  )
  if (attributes.customerDescription === null) return null
  return yield* client.fetchMarkup(
    toClassRef<Doc>(String(leadClassIds.mixin.Customer)),
    toRef<Doc>(customer._id),
    "customerDescription",
    markupBlobRefAsMarkupRef(toRef<Blob>(attributes.customerDescription)),
    "markdown"
  )
})

export const getLead = (params: GetLeadParams): Effect.Effect<LeadDetail, GetLeadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const funnel = yield* findFunnel(client, params.funnel)
    const statuses = yield* getFunnelStatuses(client, funnel)
    const leadIdentifier = yield* Schema.decodeUnknownEffect(LeadIdentifier)(
      normalizeLeadIdentifier(params.identifier)
    ).pipe(Effect.orDie)

    const lead = yield* client.findOne<HulyLead>(leadClassIds.class.Lead, {
      space: funnelAsSpace(funnel),
      identifier: leadIdentifier
    })

    if (lead === undefined) {
      return yield* new LeadNotFoundError({ identifier: params.identifier, funnel: FunnelIdentifier.make(funnel._id) })
    }

    const status = yield* resolveStatusName(statuses, lead.status)

    const person =
      lead.assignee !== null ? yield* client.findOne<Person>(contact.class.Person, { _id: lead.assignee }) : undefined

    const customer = yield* findCustomer(client, toRef<Contact>(lead.attachedTo))

    const description = lead.description
      ? yield* client.fetchMarkup(
          leadClassIds.class.Lead,
          lead._id,
          "description",
          markupBlobRefAsMarkupRef(lead.description),
          "markdown"
        )
      : undefined

    const customerDescription = yield* readCustomerDescription(client, customer)

    return yield* parseLeadDetailSchema({
      identifier: lead.identifier,
      title: lead.title,
      description,
      customerDescription,
      startDate: lead.startDate,
      dueDate: lead.dueDate,
      status,
      assignee: person?.name,
      customer: customer?.name,
      funnel: funnel._id,
      funnelName: funnel.name,
      modifiedOn: lead.modifiedOn,
      createdOn: lead.createdOn
    }).pipe(
      Effect.mapError(
        (parseError) => new HulyDataInvalidError({ operation: "getLead", entity: "lead", cause: parseError })
      )
    )
  })
