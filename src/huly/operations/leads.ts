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
import type { Doc, DocumentQuery, MarkupBlobRef, Ref, Space, Status, WithLookup } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  FunnelReference,
  FunnelSummary,
  GetLeadParams,
  LeadDetail,
  LeadSummary,
  ListFunnelsParams,
  ListFunnelsResult,
  ListLeadsParams
} from "../../domain/schemas/leads.js"
import {
  FunnelIdentifier,
  LeadIdentifier,
  LeadSummarySchema,
  parseLeadDetail as parseLeadDetailSchema
} from "../../domain/schemas/leads.js"
import { StatusName } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { FunnelNotFoundError, LeadNotFoundError } from "../errors-leads.js"
import { HulyConnectionError, InvalidStatusError } from "../errors.js"
import { contact, core, task } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { escapeLikeWildcards } from "./query-helpers.js"
import { clampLimit, findPersonByEmailOrName, toRef } from "./shared.js"

interface HulyFunnel extends Doc {
  name: string
  description?: string
  archived: boolean
  type?: Ref<Doc>
}

interface HulyLead extends Doc {
  title: string
  identifier: string
  number: number
  status: Ref<Status>
  assignee: Ref<Person> | null
  description: MarkupBlobRef | null
  attachedTo: Ref<Contact>
  parents: ReadonlyArray<{ parentId: Ref<Doc>; identifier: string; parentTitle: string }>
  modifiedOn: number
  createdOn: number
}

type StatusInfo = {
  _id: Ref<Status>
  name: string
}

type HulyCustomer = Contact | HulyOrganization

const funnelAsSpace = (funnel: HulyFunnel): Ref<Space> => toRef<Space>(funnel._id)

// Huly lead descriptions are stored as blob-backed markup refs. The client
// fetch API accepts the wider MarkupRef shape, so this bridge is safe.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: MarkupBlobRef and MarkupRef are both erased to strings at runtime
const markupBlobRefAsMarkupRef = (value: MarkupBlobRef): MarkupRef => value as MarkupRef

const normalizeLeadIdentifier = (identifier: string): string => {
  const match = /^(?:LEAD-)?(\d+)$/i.exec(identifier.trim())
  return match !== null ? `LEAD-${match[1]}` : identifier.trim().toUpperCase()
}

const SORT_LEFT_BEFORE_RIGHT = -1
const SORT_RIGHT_BEFORE_LEFT = 1

const compareFunnelsByRecency = (left: HulyFunnel, right: HulyFunnel): number => {
  if (left.archived !== right.archived) {
    return left.archived ? SORT_RIGHT_BEFORE_LEFT : SORT_LEFT_BEFORE_RIGHT
  }
  return right.modifiedOn - left.modifiedOn
}

const findFunnel = (
  client: HulyClient["Type"],
  funnelIdentifier: FunnelReference
): Effect.Effect<HulyFunnel, FunnelNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyFunnel>(
      leadClassIds.class.Funnel,
      { _id: toRef<HulyFunnel>(funnelIdentifier) }
    )
    if (byId !== undefined) return byId

    // Upstream Huly Funnel is a Project-derived space without a tracker-style
    // human identifier field. We accept normalized name lookup only as a
    // convenience, but list_funnels returns `_id` as the stable identifier.
    // Reference:
    // https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/types.ts#L55-L57
    const allFunnels = yield* client.findAll<HulyFunnel>(leadClassIds.class.Funnel, {})
    const normalized = normalizeForComparison(funnelIdentifier)
    const matchingFunnels = [...allFunnels]
      .filter((candidate) => normalizeForComparison(candidate.name) === normalized)
      .sort(compareFunnelsByRecency)
    const funnel = matchingFunnels.at(0)
    if (funnel === undefined) {
      return yield* new FunnelNotFoundError({ identifier: funnelIdentifier })
    }
    return funnel
  })

const getFunnelStatuses = (
  client: HulyClient["Type"],
  funnel: HulyFunnel
): Effect.Effect<ReadonlyArray<StatusInfo>, HulyClientError | HulyConnectionError> =>
  Effect.gen(function*() {
    if (funnel.type === undefined) {
      return yield* Effect.fail(
        new HulyConnectionError({
          message: `Funnel '${funnel._id}' is missing its ProjectType reference`
        })
      )
    }

    const projectType = yield* client.findOne<Doc & { statuses?: ReadonlyArray<{ _id: Ref<Status> }> }>(
      task.class.ProjectType,
      { _id: toRef<Doc>(funnel.type) }
    )

    if (projectType?.statuses === undefined) {
      return yield* Effect.fail(
        new HulyConnectionError({
          message: `Funnel '${funnel._id}' references a ProjectType without statuses`
        })
      )
    }

    const statusRefs = projectType.statuses.map((status) => status._id)
    if (statusRefs.length === 0) {
      return yield* Effect.fail(
        new HulyConnectionError({
          message: `Funnel '${funnel._id}' ProjectType has no statuses`
        })
      )
    }

    const statusDocs = yield* client.findAll<Status>(
      core.class.Status,
      { _id: { $in: [...statusRefs] } }
    )

    return statusDocs.map((doc) => ({
      _id: doc._id,
      name: doc.name
    }))
  })

const resolveStatusName = (
  statuses: ReadonlyArray<StatusInfo>,
  statusId: Ref<Status>
): Effect.Effect<StatusName, HulyConnectionError> => {
  const statusDoc = statuses.find((status) => status._id === statusId)
  return statusDoc !== undefined
    ? Effect.succeed(StatusName.make(statusDoc.name))
    : Effect.fail(
      new HulyConnectionError({
        message: `Lead references status '${statusId}', but that status is not defined on the funnel ProjectType`
      })
    )
}

const resolveStatusByName = (
  statuses: ReadonlyArray<StatusInfo>,
  statusName: string,
  funnel: string
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const normalizedInput = normalizeForComparison(statusName)
  const matchingStatus = statuses.find(
    (status) => normalizeForComparison(status.name) === normalizedInput
  )
  if (matchingStatus === undefined) {
    return Effect.fail(new InvalidStatusError({ status: statusName, project: funnel }))
  }
  return Effect.succeed(matchingStatus._id)
}

const findCustomer = (
  client: HulyClient["Type"],
  customerId: Ref<Contact>
): Effect.Effect<HulyCustomer | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const contactCustomer = yield* client.findOne<Contact>(contact.class.Contact, { _id: customerId })
    if (contactCustomer !== undefined) {
      return contactCustomer
    }

    return yield* client.findOne<HulyOrganization>(contact.class.Organization, {
      _id: toRef<HulyOrganization>(customerId)
    })
  })

type ListFunnelsError = HulyClientError

export const listFunnels = (
  params: ListFunnelsParams
): Effect.Effect<ListFunnelsResult, ListFunnelsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: DocumentQuery<HulyFunnel> = params.includeArchived !== true
      ? { archived: false }
      : {}

    const limit = clampLimit(params.limit)

    const funnels = yield* client.findAll<HulyFunnel>(
      leadClassIds.class.Funnel,
      query,
      {
        limit,
        sort: { name: SortingOrder.Ascending }
      }
    )

    const summaries: ReadonlyArray<FunnelSummary> = funnels.map((funnel) => ({
      identifier: FunnelIdentifier.make(funnel._id),
      name: funnel.name,
      description: funnel.description,
      archived: funnel.archived
    }))

    return { funnels: summaries, total: funnels.total }
  })

type ListLeadsError =
  | HulyClientError
  | HulyConnectionError
  | FunnelNotFoundError
  | InvalidStatusError

export const listLeads = (
  params: ListLeadsParams
): Effect.Effect<Array<LeadSummary>, ListLeadsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const funnel = yield* findFunnel(client, params.funnel)
    const statuses = yield* getFunnelStatuses(client, funnel)

    const baseQuery: DocumentQuery<HulyLead> = {
      space: funnelAsSpace(funnel)
    }

    const statusFilter = params.status !== undefined
      ? { status: yield* resolveStatusByName(statuses, params.status, params.funnel) }
      : {}

    const assigneeParam = params.assignee

    const assigneeFilter = assigneeParam !== undefined
      ? yield* Effect.gen(function*() {
        const assigneePerson = yield* findPersonByEmailOrName(client, assigneeParam)
        return assigneePerson !== undefined
          ? { assignee: assigneePerson._id }
          : undefined
      })
      : {}

    if (assigneeFilter === undefined) return []

    const titleFilter = params.titleSearch !== undefined && params.titleSearch.trim() !== ""
      ? { title: { $like: `%${escapeLikeWildcards(params.titleSearch)}%` } }
      : {}

    const query: DocumentQuery<HulyLead> = {
      ...baseQuery,
      ...statusFilter,
      ...assigneeFilter,
      ...titleFilter
    }

    const limit = clampLimit(params.limit)

    type LeadWithLookup = WithLookup<HulyLead> & {
      $lookup?: { assignee?: Person; attachedTo?: HulyCustomer }
    }

    const leads = yield* client.findAll<LeadWithLookup>(
      leadClassIds.class.Lead,
      query,
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending },
        // Upstream lead views resolve attachedTo through the Customer mixin.
        // Reference:
        // https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/index.ts#L357-L360
        lookup: {
          assignee: contact.class.Person,
          attachedTo: leadClassIds.mixin.Customer
        }
      }
    )

    const rawSummaries = yield* Effect.forEach(leads, (lead) =>
      Effect.gen(function*() {
        const status = yield* resolveStatusName(statuses, lead.status)

        return {
          identifier: lead.identifier,
          title: lead.title,
          status,
          assignee: lead.$lookup?.assignee?.name,
          customer: lead.$lookup?.attachedTo?.name,
          modifiedOn: lead.modifiedOn
        }
      }))

    const validated = yield* Schema.decodeUnknown(Schema.Array(LeadSummarySchema))(rawSummaries).pipe(
      Effect.mapError((parseError) =>
        new HulyConnectionError({
          message: `listLeads response failed schema validation: ${parseError.message}`,
          cause: parseError
        })
      )
    )

    return [...validated]
  })

type GetLeadError =
  | HulyClientError
  | HulyConnectionError
  | FunnelNotFoundError
  | LeadNotFoundError

export const getLead = (
  params: GetLeadParams
): Effect.Effect<LeadDetail, GetLeadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const funnel = yield* findFunnel(client, params.funnel)
    const statuses = yield* getFunnelStatuses(client, funnel)
    const leadIdentifier = yield* Schema.decodeUnknown(LeadIdentifier)(normalizeLeadIdentifier(params.identifier)).pipe(
      Effect.orDie
    )

    const lead = yield* client.findOne<HulyLead>(
      leadClassIds.class.Lead,
      { space: funnelAsSpace(funnel), identifier: leadIdentifier }
    )

    if (lead === undefined) {
      return yield* new LeadNotFoundError({
        identifier: params.identifier,
        funnel: FunnelIdentifier.make(funnel._id)
      })
    }

    const status = yield* resolveStatusName(statuses, lead.status)

    const person = lead.assignee !== null
      ? yield* client.findOne<Person>(contact.class.Person, { _id: lead.assignee })
      : undefined

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

    return yield* parseLeadDetailSchema({
      identifier: lead.identifier,
      title: lead.title,
      description,
      status,
      assignee: person?.name,
      customer: customer?.name,
      funnel: funnel._id,
      funnelName: funnel.name,
      modifiedOn: lead.modifiedOn,
      createdOn: lead.createdOn
    }).pipe(
      Effect.mapError((parseError) =>
        new HulyConnectionError({
          message: `getLead response failed schema validation: ${parseError.message}`,
          cause: parseError
        })
      )
    )
  })
