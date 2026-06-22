import type { Person as HulyPerson } from "@hcengineering/contact"
import type { Doc, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Request as HulyApprovalRequest } from "@hcengineering/request"
import { RequestStatus as HulyRequestStatus } from "@hcengineering/request"
import { Effect } from "effect"

import type {
  ApprovalPersonRef,
  ApprovalRequestDetail,
  ApprovalRequestStatus,
  ApprovalRequestSummary,
  GetApprovalRequestParams,
  GetApprovalRequestResult,
  ListApprovalRequestsParams,
  ListApprovalRequestsResult
} from "../../domain/schemas/approval-requests.js"
import { ApprovalRequestCollection, ApprovalRequestId } from "../../domain/schemas/approval-requests.js"
import {
  Count,
  DocId,
  type Email,
  ObjectClassName,
  PersonId,
  PersonName,
  SpaceId,
  Timestamp
} from "../../domain/schemas/shared.js"
import {
  ApprovalRequestCountMetadataDegradedWarningCode,
  ApprovalRequestPersonMetadataDegradedWarningCode
} from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { ApprovalRequestNotFoundError } from "../errors.js"
import { contact, request as requestPlugin } from "../huly-plugins.js"
import { buildContactUrlFromConfig } from "../url-builders.js"
import { batchGetEmailsForPersons } from "./contacts-shared.js"
import { listTotal } from "./counts.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type ApprovalRequestError = HulyClientError | ApprovalRequestNotFoundError

const toHulyStatus = (status: ApprovalRequestStatus): HulyRequestStatus => {
  switch (status) {
    case "Active":
      return HulyRequestStatus.Active
    case "Completed":
      return HulyRequestStatus.Completed
    case "Rejected":
      return HulyRequestStatus.Rejected
    case "Cancelled":
      return HulyRequestStatus.Cancelled
  }
}

const fromHulyStatus = (status: HulyRequestStatus): ApprovalRequestStatus => {
  switch (status) {
    case HulyRequestStatus.Active:
      return "Active"
    case HulyRequestStatus.Completed:
      return "Completed"
    case HulyRequestStatus.Rejected:
      return "Rejected"
    case HulyRequestStatus.Cancelled:
      return "Cancelled"
  }
}

const listQuery = (params: ListApprovalRequestsParams): StrictDocumentQuery<HulyApprovalRequest> => ({
  ...(params.status === undefined ? {} : { status: toHulyStatus(params.status) }),
  ...(params.attachedTo === undefined ? {} : { attachedTo: toRef<Doc>(params.attachedTo) }),
  ...(params.attachedToClass === undefined
    ? {}
    : { attachedToClass: toClassRef<Doc>(params.attachedToClass) })
})

const uniquePersonIds = (requests: ReadonlyArray<HulyApprovalRequest>): ReadonlyArray<string> =>
  [
    ...new Set(
      requests.flatMap((item) => [
        ...item.requested.map(String),
        ...item.approved.map(String),
        ...(item.rejected === undefined ? [] : [String(item.rejected)])
      ])
    )
  ].sort()

const personRefs = (ids: ReadonlyArray<string>): Array<Ref<HulyPerson>> =>
  ids.map((id) => toRef<HulyPerson>(PersonId.make(id)))

const personSummary = (
  client: HulyClient["Type"],
  emailByPersonId: ReadonlyMap<Ref<HulyPerson>, Email>,
  person: HulyPerson
): ApprovalPersonRef => {
  const id = PersonId.make(person._id)
  const email = emailByPersonId.get(person._id)
  return {
    id,
    name: PersonName.make(person.name),
    ...(email === undefined ? {} : { email }),
    url: buildContactUrlFromConfig(client.workbenchUrlConfig, id)
  }
}

const warnMissingPeople = (
  diagnostics: Diagnostics["Type"],
  personIds: ReadonlyArray<string>,
  peopleById: ReadonlyMap<string, ApprovalPersonRef>
): Effect.Effect<void> => {
  const missingIds = personIds.filter((id) => !peopleById.has(id))
  if (missingIds.length === 0) return Effect.void

  return diagnostics.warnAgent({
    code: ApprovalRequestPersonMetadataDegradedWarningCode,
    message:
      `Some approval request person metadata was omitted because ${missingIds.length} person id(s) could not be resolved: ${
        missingIds.join(", ")
      }. Results still include raw person IDs.`
  })
}

const fetchPeopleById = (
  client: HulyClient["Type"],
  diagnostics: Diagnostics["Type"],
  requests: ReadonlyArray<HulyApprovalRequest>
): Effect.Effect<ReadonlyMap<string, ApprovalPersonRef>, HulyClientError> =>
  Effect.gen(function*() {
    const ids = uniquePersonIds(requests)
    if (ids.length === 0) return new Map<string, ApprovalPersonRef>()

    const refs = personRefs(ids)
    const people = yield* client.findAll<HulyPerson>(
      contact.class.Person,
      hulyQuery<HulyPerson>({ _id: { $in: refs } }),
      { limit: ids.length }
    )
    const emailByPersonId = yield* batchGetEmailsForPersons(client, refs)
    const peopleById = new Map(
      people.map((person) => [String(person._id), personSummary(client, emailByPersonId, person)])
    )
    yield* warnMissingPeople(diagnostics, ids, peopleById)
    return peopleById
  })

const resolvePerson = (
  peopleById: ReadonlyMap<string, ApprovalPersonRef>,
  id: Ref<HulyPerson>
): ApprovalPersonRef => peopleById.get(String(id)) ?? { id: PersonId.make(String(id)) }

type ApprovalCountField = "requiredApprovesCount" | "comments"

const countOrWarn = (
  diagnostics: Diagnostics["Type"],
  requestId: ApprovalRequestId,
  field: ApprovalCountField,
  value: number
): Effect.Effect<Count> =>
  Number.isInteger(value) && value >= 0
    ? Effect.succeed(Count.make(value))
    : diagnostics.warnAgent({
      code: ApprovalRequestCountMetadataDegradedWarningCode,
      message: `Approval request ${requestId} field ${field} contained invalid count ${value}; returned 0 instead.`
    }).pipe(Effect.as(Count.make(0)))

const requestSummary = (
  diagnostics: Diagnostics["Type"],
  item: HulyApprovalRequest,
  peopleById: ReadonlyMap<string, ApprovalPersonRef>
): Effect.Effect<ApprovalRequestSummary> =>
  Effect.gen(function*() {
    const id = ApprovalRequestId.make(item._id)
    const requiredApprovesCount = yield* countOrWarn(
      diagnostics,
      id,
      "requiredApprovesCount",
      item.requiredApprovesCount
    )
    const comments = item.comments === undefined
      ? undefined
      : yield* countOrWarn(diagnostics, id, "comments", item.comments)

    return {
      id,
      class: ObjectClassName.make(item._class),
      status: fromHulyStatus(item.status),
      attachedTo: DocId.make(item.attachedTo),
      attachedToClass: ObjectClassName.make(item.attachedToClass),
      collection: ApprovalRequestCollection.make(item.collection),
      space: SpaceId.make(item.space),
      requiredApprovesCount,
      requested: item.requested.map((personId) => resolvePerson(peopleById, personId)),
      approved: item.approved.map((personId) => resolvePerson(peopleById, personId)),
      ...(item.rejected === undefined ? {} : { rejected: resolvePerson(peopleById, item.rejected) }),
      ...(comments === undefined ? {} : { comments }),
      ...(item.createdOn === undefined ? {} : { createdOn: Timestamp.make(item.createdOn) }),
      modifiedOn: Timestamp.make(item.modifiedOn)
    }
  })

const requestDetail = (
  diagnostics: Diagnostics["Type"],
  item: HulyApprovalRequest,
  peopleById: ReadonlyMap<string, ApprovalPersonRef>
): Effect.Effect<ApprovalRequestDetail> =>
  Effect.gen(function*() {
    const summary = yield* requestSummary(diagnostics, item, peopleById)
    return {
      ...summary,
      ...(item.approvedDates === undefined
        ? {}
        : { approvedDates: item.approvedDates.map((timestamp) => Timestamp.make(timestamp)) }),
      tx: item.tx,
      ...(item.rejectedTx === undefined ? {} : { rejectedTx: item.rejectedTx })
    }
  })

export const listApprovalRequests = (
  params: ListApprovalRequestsParams
): Effect.Effect<ListApprovalRequestsResult, HulyClientError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const requests = yield* client.findAll<HulyApprovalRequest>(
      requestPlugin.class.Request,
      hulyQuery(listQuery(params)),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    const peopleById = yield* fetchPeopleById(client, diagnostics, requests)
    const summaries = yield* Effect.all(requests.map((item) => requestSummary(diagnostics, item, peopleById)))

    return {
      requests: summaries,
      total: listTotal(requests.total)
    }
  })

export const getApprovalRequest = (
  params: GetApprovalRequestParams
): Effect.Effect<GetApprovalRequestResult, ApprovalRequestError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const item = yield* client.findOne<HulyApprovalRequest>(
      requestPlugin.class.Request,
      hulyQuery<HulyApprovalRequest>({ _id: toRef<HulyApprovalRequest>(params.request) })
    )

    if (item === undefined) {
      return yield* new ApprovalRequestNotFoundError({ request: params.request })
    }

    const peopleById = yield* fetchPeopleById(client, diagnostics, [item])
    return yield* requestDetail(diagnostics, item, peopleById)
  })
