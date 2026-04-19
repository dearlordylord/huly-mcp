/**
 * Lead operations: list funnels, list leads, get lead.
 *
 * Upstream Huly references:
 * - .reference/huly-platform/plugins/lead/src/index.ts
 * - .reference/huly-platform/models/lead/src/types.ts
 *
 * `@hcengineering/lead` is not available in this project, so these shapes are
 * mirrored from the upstream Huly lead package and model definitions.
 *
 * @module
 */
import type { MarkupRef } from "@hcengineering/api-client"
import type { Contact, Person } from "@hcengineering/contact"
import type { Doc, DocumentQuery, MarkupBlobRef, Ref, Space, Status, WithLookup } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
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

/* eslint-disable no-restricted-syntax -- SDK boundary: upstream lead plugin refs are mirrored locally */

const funnelAsSpace = (funnel: HulyFunnel): Ref<Space> => funnel._id as unknown as Ref<Space>

const normalizeLeadIdentifier = (identifier: string): LeadIdentifier => {
  const trimmed = identifier.trim()
  const normalized = trimmed.toUpperCase()
  return LeadIdentifier.make(
    normalized.startsWith("LEAD-")
      ? normalized
      : `LEAD-${normalized}`
  )
}

const findFunnel = (
  client: HulyClient["Type"],
  funnelIdentifier: string
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
    // Reference: .reference/huly-platform/models/lead/src/types.ts
    const allFunnels = yield* client.findAll<HulyFunnel>(leadClassIds.class.Funnel, {})
    const normalized = normalizeForComparison(funnelIdentifier)
    const funnel = allFunnels.find((candidate) => normalizeForComparison(candidate.name) === normalized)
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
      $lookup?: { assignee?: Person; attachedTo?: Contact }
    }

    const leads = yield* client.findAll<LeadWithLookup>(
      leadClassIds.class.Lead,
      query,
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending },
        // Upstream lead views resolve attachedTo through the Customer mixin.
        // Reference: .reference/huly-platform/models/lead/src/index.ts
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
          identifier: normalizeLeadIdentifier(lead.identifier),
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
    const leadIdentifier = normalizeLeadIdentifier(params.identifier)

    const lead = yield* client.findOne<HulyLead>(
      leadClassIds.class.Lead,
      { space: funnelAsSpace(funnel), identifier: leadIdentifier }
    )

    if (lead === undefined) {
      return yield* new LeadNotFoundError({ identifier: params.identifier, funnel: params.funnel })
    }

    const status = yield* resolveStatusName(statuses, lead.status)

    const person = lead.assignee !== null
      ? yield* client.findOne<Person>(contact.class.Person, { _id: lead.assignee })
      : undefined

    const customer = yield* client.findOne<Contact>(
      contact.class.Contact,
      { _id: toRef<Contact>(lead.attachedTo) }
    )

    const description = lead.description
      ? yield* client.fetchMarkup(
        leadClassIds.class.Lead,
        lead._id,
        "description",
        lead.description as unknown as MarkupRef,
        "markdown"
      )
      : undefined

    return yield* parseLeadDetailSchema({
      identifier: normalizeLeadIdentifier(lead.identifier),
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

/* eslint-enable no-restricted-syntax */
