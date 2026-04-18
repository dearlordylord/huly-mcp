/**
 * Lead operations: list funnels, list leads, get lead.
 *
 * Since @hcengineering/lead is not published on npm, we use string literal
 * class IDs and generic Doc queries. Lead extends Task; Funnel extends Project.
 *
 * @module
 */
import type { MarkupRef } from "@hcengineering/api-client"
import type { Person } from "@hcengineering/contact"
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
  LeadSummarySchema,
  parseLeadDetail as parseLeadDetailSchema
} from "../../domain/schemas/leads.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { FunnelNotFoundError, LeadNotFoundError } from "../errors-leads.js"
import { HulyConnectionError, InvalidStatusError } from "../errors.js"
import { contact, core, task } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { escapeLikeWildcards } from "./query-helpers.js"
import { clampLimit, findPersonByEmailOrName, toRef } from "./shared.js"

// --- Huly Lead/Funnel shapes (runtime, not type-checked against SDK) ---

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
  attachedTo: Ref<Doc> // Customer contact
  parents: ReadonlyArray<{ parentId: Ref<Doc>; identifier: string; parentTitle: string }>
  modifiedOn: number
  createdOn: number
}

type StatusInfo = {
  _id: Ref<Status>
  name: string
}

/* eslint-disable no-restricted-syntax -- SDK boundary: lead plugin refs are untyped strings, casts are unavoidable */

// --- Helpers ---

const funnelAsSpace = (funnel: HulyFunnel): Ref<Space> => funnel._id as unknown as Ref<Space>

const findFunnel = (
  client: HulyClient["Type"],
  funnelIdentifier: string
): Effect.Effect<HulyFunnel, FunnelNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    // Funnels don't have a short identifier like tracker projects.
    // Look up by name (case-insensitive via normalized comparison).
    const allFunnels = yield* client.findAll<HulyFunnel>(
      leadClassIds.class.Funnel,
      {}
    )
    const normalized = normalizeForComparison(funnelIdentifier)
    const funnel = allFunnels.find(f => normalizeForComparison(f.name) === normalized)
      ?? allFunnels.find(f => f._id === funnelIdentifier)
    if (funnel === undefined) {
      return yield* new FunnelNotFoundError({ identifier: funnelIdentifier })
    }
    return funnel
  })

const getFunnelStatuses = (
  client: HulyClient["Type"],
  funnel: HulyFunnel
): Effect.Effect<ReadonlyArray<StatusInfo>, HulyClientError> =>
  Effect.gen(function*() {
    if (!funnel.type) return []

    const projectType = yield* client.findOne<Doc & { statuses?: ReadonlyArray<{ _id: Ref<Status> }> }>(
      task.class.ProjectType,
      { _id: toRef(funnel.type as string) }
    )

    if (!projectType?.statuses) return []

    const statusRefs = projectType.statuses.map(s => s._id)
    if (statusRefs.length === 0) return []

    const statusDocsResult = yield* Effect.either(
      client.findAll<Status>(
        core.class.Status,
        { _id: { $in: [...statusRefs] } }
      )
    )

    if (statusDocsResult._tag === "Left") return []

    return statusDocsResult.right.map((doc) => ({
      _id: doc._id,
      name: doc.name
    }))
  })

const resolveStatusName = (
  statuses: ReadonlyArray<StatusInfo>,
  statusId: Ref<Status>
): string => {
  const statusDoc = statuses.find(s => s._id === statusId)
  return statusDoc?.name ?? "Unknown"
}

const resolveStatusByName = (
  statuses: ReadonlyArray<StatusInfo>,
  statusName: string,
  funnel: string
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const normalizedInput = normalizeForComparison(statusName)
  const matchingStatus = statuses.find(
    s => normalizeForComparison(s.name) === normalizedInput
  )
  if (matchingStatus === undefined) {
    return Effect.fail(new InvalidStatusError({ status: statusName, project: funnel }))
  }
  return Effect.succeed(matchingStatus._id)
}

// --- Operations ---

type ListFunnelsError = HulyClientError

const listFunnelsUnsafe = (
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

    const summaries: ReadonlyArray<FunnelSummary> = funnels.map((f) => ({
      identifier: FunnelIdentifier.make(f.name),
      name: f.name,
      description: f.description,
      archived: f.archived
    }))

    return { funnels: summaries, total: funnels.length }
  })

export const listFunnels = (
  params: ListFunnelsParams
): Effect.Effect<ListFunnelsResult, ListFunnelsError, HulyClient> =>
  listFunnelsUnsafe(params).pipe(
    Effect.catchAllDefect(() => Effect.succeed({ funnels: [], total: 0 } satisfies ListFunnelsResult))
  )

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

    let assigneeFilter: DocumentQuery<HulyLead> = {}
    if (params.assignee !== undefined) {
      const assigneePerson = yield* findPersonByEmailOrName(client, params.assignee)
      if (assigneePerson !== undefined) {
        assigneeFilter = { assignee: assigneePerson._id }
      } else {
        return []
      }
    }

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
      $lookup?: { assignee?: Person }
    }

    const leads = yield* client.findAll<LeadWithLookup>(
      leadClassIds.class.Lead,
      query,
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending },
        lookup: { assignee: contact.class.Person }
      }
    )

    // Resolve customer names for each lead
    const customerIds = [...new Set(leads.map(l => l.attachedTo).filter(Boolean))]
    const customers = customerIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: customerIds as Array<Ref<Person>> } }
      )
      : []
    const customerMap = new Map(customers.map(c => [c._id, c.name]))

    const rawSummaries = leads.map((lead) => {
      const statusName = resolveStatusName(statuses, lead.status)
      const assigneeName = lead.$lookup?.assignee?.name
      const customerName = customerMap.get(lead.attachedTo as Ref<Person>)

      return {
        identifier: lead.identifier,
        title: lead.title,
        status: statusName,
        assignee: assigneeName,
        customer: customerName,
        modifiedOn: lead.modifiedOn
      }
    })

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

    const { fullIdentifier, number } = parseLeadIdentifier(params.identifier, params.funnel)

    const lead = (yield* client.findOne<HulyLead>(
      leadClassIds.class.Lead,
      { space: funnelAsSpace(funnel), identifier: fullIdentifier }
    )) ?? (number !== null
      ? yield* client.findOne<HulyLead>(
        leadClassIds.class.Lead,
        { space: funnelAsSpace(funnel), number }
      )
      : undefined)

    if (lead === undefined) {
      return yield* new LeadNotFoundError({ identifier: params.identifier, funnel: params.funnel })
    }

    const statusName = resolveStatusName(statuses, lead.status)

    const person = lead.assignee !== null
      ? yield* client.findOne<Person>(contact.class.Person, { _id: lead.assignee })
      : undefined

    const customer = lead.attachedTo
      ? yield* client.findOne<Person>(contact.class.Person, { _id: toRef<Person>(lead.attachedTo) })
      : undefined

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
      identifier: lead.identifier,
      title: lead.title,
      description,
      status: statusName,
      assignee: person?.name,
      customer: customer?.name,
      funnel: funnel.name,
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

// --- Lead Identifier Helpers ---

const parseLeadIdentifier = (
  identifier: string | number,
  funnelIdentifier: string
): { fullIdentifier: string; number: number | null } => {
  const idStr = String(identifier).trim()

  const match = idStr.match(/^([A-Z]+)-(\d+)$/i)
  if (match) {
    return {
      fullIdentifier: `${match[1].toUpperCase()}-${match[2]}`,
      number: parseInt(match[2], 10)
    }
  }

  const numMatch = idStr.match(/^\d+$/)
  if (numMatch) {
    const num = parseInt(idStr, 10)
    return {
      fullIdentifier: `${funnelIdentifier.toUpperCase()}-${num}`,
      number: num
    }
  }

  return { fullIdentifier: idStr, number: null }
}
