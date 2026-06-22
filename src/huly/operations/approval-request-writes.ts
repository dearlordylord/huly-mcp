import type { ChatMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person as HulyPerson, SocialIdentity } from "@hcengineering/contact"
import type { AttachedData, Doc, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Request as HulyApprovalRequest } from "@hcengineering/request"
import { RequestStatus as HulyRequestStatus } from "@hcengineering/request"
import { Effect, Option, Schema } from "effect"

import type {
  AddApprovalRequestCommentParams,
  AddApprovalRequestParams,
  ApprovalRequestMutationResult,
  ApproveApprovalRequestParams,
  CancelApprovalRequestParams,
  RejectApprovalRequestParams
} from "../../domain/schemas/approval-requests.js"
import { ApprovalRequestCollection, ApprovalRequestId } from "../../domain/schemas/approval-requests.js"
import { Count, Email, MessageId, PersonId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError } from "../errors-contacts.js"
import {
  ApprovalRequestApproverNotRequestedError,
  ApprovalRequestCancelUnauthorizedError,
  ApprovalRequestInvalidApprovalThresholdError,
  ApprovalRequestMutationUnsupportedError,
  ApprovalRequestNotActiveError,
  ApprovalRequestNotFoundError,
  ApprovalRequestTargetNotFoundError,
  PersonNotFoundError
} from "../errors.js"
import { chunter, contact, request as requestPlugin } from "../huly-plugins.js"
import { findPersonByExactEmailOrName, findPersonById } from "./contacts-shared.js"
import { markdownToMarkupString } from "./markup.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef, toSocialIdentityRef, toTx } from "./sdk-boundary.js"

const DEFAULT_REQUEST_COLLECTION = ApprovalRequestCollection.make("requests")

type ApprovalRequestWriteError =
  | HulyClientError
  | ApprovalRequestNotFoundError
  | ApprovalRequestTargetNotFoundError
  | ApprovalRequestInvalidApprovalThresholdError
  | ApprovalRequestMutationUnsupportedError
  | ApprovalRequestNotActiveError
  | ApprovalRequestApproverNotRequestedError
  | ApprovalRequestCancelUnauthorizedError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError

const currentEmployeeRef = (
  client: HulyClient["Type"]
): Effect.Effect<Ref<HulyPerson>, HulyClientError | PersonNotFoundError> =>
  Effect.gen(function*() {
    const actor = client.getPrimarySocialId()
    const socialIdentity = yield* client.findOne<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(actor) })
    )

    if (socialIdentity === undefined) {
      return yield* new PersonNotFoundError({ identifier: actor })
    }

    const employee = yield* client.findOne<HulyEmployee>(
      contact.mixin.Employee,
      hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(socialIdentity.attachedTo) })
    )

    if (employee === undefined) {
      return yield* new PersonNotFoundError({ identifier: actor })
    }

    return toRef<HulyPerson>(PersonId.make(String(employee._id)))
  })

const personRefInput = (identifier: string) => {
  const email = Schema.decodeUnknownOption(Email)(identifier)
  return Option.isSome(email) ? email.value : PersonName.make(identifier)
}

const resolveRequestedPerson = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<Ref<HulyPerson>, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function*() {
    const byId = yield* findPersonById(client, identifier)
    if (byId !== undefined) return byId._id

    const byEmailOrName = yield* findPersonByExactEmailOrName(client, personRefInput(identifier))
    if (byEmailOrName !== undefined) return byEmailOrName._id

    return yield* new PersonNotFoundError({ identifier })
  })

const resolveRequestedPeople = (
  client: HulyClient["Type"],
  identifiers: ReadonlyArray<string>
): Effect.Effect<
  Array<Ref<HulyPerson>>,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError
> =>
  Effect.gen(function*() {
    const resolved = yield* Effect.all(identifiers.map((identifier) => resolveRequestedPerson(client, identifier)))
    return [...new Set(resolved)]
  })

const requiredApprovalCount = (
  params: AddApprovalRequestParams,
  requestedCount: number
): Effect.Effect<number, ApprovalRequestInvalidApprovalThresholdError> => {
  const requiredApprovesCount = params.requiredApprovesCount ?? requestedCount
  if (requiredApprovesCount < 1 || requiredApprovesCount > requestedCount) {
    return Effect.fail(
      new ApprovalRequestInvalidApprovalThresholdError({
        requiredApprovesCount: Count.make(requiredApprovesCount),
        requestedCount: Count.make(requestedCount)
      })
    )
  }
  return Effect.succeed(requiredApprovesCount)
}

const targetSpace = (
  client: HulyClient["Type"],
  params: AddApprovalRequestParams
): Effect.Effect<Ref<Space>, HulyClientError | ApprovalRequestTargetNotFoundError> =>
  Effect.gen(function*() {
    if (params.space !== undefined) return toRef<Space>(params.space)

    const target = yield* client.findOne<Doc>(
      toClassRef<Doc>(params.attachedToClass),
      hulyQuery<Doc>({ _id: toRef<Doc>(params.attachedTo) })
    )

    if (target === undefined) {
      return yield* new ApprovalRequestTargetNotFoundError({
        attachedTo: params.attachedTo,
        attachedToClass: params.attachedToClass
      })
    }

    return target.space
  })

const findApprovalRequest = (
  client: HulyClient["Type"],
  request: ApprovalRequestId
): Effect.Effect<HulyApprovalRequest, HulyClientError | ApprovalRequestNotFoundError> =>
  Effect.gen(function*() {
    const item = yield* client.findOne<HulyApprovalRequest>(
      requestPlugin.class.Request,
      hulyQuery<HulyApprovalRequest>({ _id: toRef<HulyApprovalRequest>(request) })
    )

    if (item === undefined) {
      return yield* new ApprovalRequestNotFoundError({ request })
    }

    return item
  })

const requireActive = (
  item: HulyApprovalRequest
): Effect.Effect<void, ApprovalRequestNotActiveError> =>
  item.status === HulyRequestStatus.Active
    ? Effect.void
    : Effect.fail(new ApprovalRequestNotActiveError({ request: item._id, status: item.status }))

const requestedCurrentEmployee = (
  client: HulyClient["Type"],
  item: HulyApprovalRequest
): Effect.Effect<
  Ref<HulyPerson>,
  HulyClientError | PersonNotFoundError | ApprovalRequestApproverNotRequestedError
> =>
  Effect.gen(function*() {
    const employee = yield* currentEmployeeRef(client)
    if (!item.requested.includes(employee)) {
      return yield* new ApprovalRequestApproverNotRequestedError({ request: item._id, person: employee })
    }
    return employee
  })

const updateRequestCollection = (
  client: HulyClient["Type"],
  operation: string,
  item: HulyApprovalRequest,
  operations: DocumentUpdate<HulyApprovalRequest>
): Effect.Effect<Ref<Doc>, HulyClientError | ApprovalRequestMutationUnsupportedError> => {
  if (client.updateCollection === undefined) {
    return Effect.fail(new ApprovalRequestMutationUnsupportedError({ operation, capability: "updateCollection" }))
  }

  return client.updateCollection<Doc, HulyApprovalRequest>(
    requestPlugin.class.Request,
    item.space,
    item._id,
    item.attachedTo,
    item.attachedToClass,
    item.collection,
    operations
  )
}

const addRequestComment = (
  client: HulyClient["Type"],
  item: HulyApprovalRequest,
  body: string,
  decision: boolean
): Effect.Effect<Ref<ChatMessage>, HulyClientError> =>
  Effect.gen(function*() {
    const commentId: Ref<ChatMessage> = generateId()
    const commentData: AttachedData<ChatMessage> = {
      message: markdownToMarkupString(body, client.markupUrlConfig)
    }

    yield* client.addCollection(
      chunter.class.ChatMessage,
      item.space,
      item._id,
      item._class,
      "comments",
      commentData,
      commentId
    )

    if (decision) {
      yield* client.createMixin(
        commentId,
        chunter.class.ChatMessage,
        item.space,
        requestPlugin.mixin.RequestDecisionComment,
        {}
      )
    }

    return commentId
  })

const mutationResult = (
  result: ApprovalRequestMutationResult
): ApprovalRequestMutationResult => result

export const addApprovalRequest = (
  params: AddApprovalRequestParams
): Effect.Effect<ApprovalRequestMutationResult, ApprovalRequestWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const requested = yield* resolveRequestedPeople(client, params.requested)
    const requiredApprovesCount = yield* requiredApprovalCount(params, requested.length)
    const space = yield* targetSpace(client, params)
    const requestId: Ref<HulyApprovalRequest> = generateId()
    const collection = params.collection ?? DEFAULT_REQUEST_COLLECTION
    const requestData: AttachedData<HulyApprovalRequest> = {
      requested,
      approved: [],
      tx: toTx(params.tx),
      ...(params.rejectedTx === undefined ? {} : { rejectedTx: toTx(params.rejectedTx) }),
      status: HulyRequestStatus.Active,
      requiredApprovesCount
    }

    yield* client.addCollection(
      requestPlugin.class.Request,
      space,
      toRef<Doc>(params.attachedTo),
      toClassRef<Doc>(params.attachedToClass),
      collection,
      requestData,
      requestId
    )

    return mutationResult({
      request: ApprovalRequestId.make(requestId),
      action: "created",
      changed: true,
      status: "Active"
    })
  })

export const addApprovalRequestComment = (
  params: AddApprovalRequestCommentParams
): Effect.Effect<ApprovalRequestMutationResult, ApprovalRequestWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const item = yield* findApprovalRequest(client, params.request)
    const commentId = yield* addRequestComment(client, item, params.body, false)

    return mutationResult({
      request: params.request,
      action: "comment_added",
      changed: true,
      comment: MessageId.make(commentId)
    })
  })

export const approveApprovalRequest = (
  params: ApproveApprovalRequestParams
): Effect.Effect<ApprovalRequestMutationResult, ApprovalRequestWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const item = yield* findApprovalRequest(client, params.request)
    yield* requireActive(item)

    const employee = yield* requestedCurrentEmployee(client, item)
    if (item.approved.includes(employee)) {
      return mutationResult({
        request: params.request,
        action: "approved",
        changed: false,
        status: "Active"
      })
    }

    yield* updateRequestCollection(client, "approve_approval_request", item, { $push: { approved: employee } })
    const comment = params.comment === undefined
      ? undefined
      : yield* addRequestComment(client, item, params.comment, true)

    return mutationResult({
      request: params.request,
      action: "approved",
      changed: true,
      ...(comment === undefined ? {} : { comment: MessageId.make(comment) })
    })
  })

export const rejectApprovalRequest = (
  params: RejectApprovalRequestParams
): Effect.Effect<ApprovalRequestMutationResult, ApprovalRequestWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const item = yield* findApprovalRequest(client, params.request)
    yield* requireActive(item)

    const employee = yield* requestedCurrentEmployee(client, item)
    yield* updateRequestCollection(client, "reject_approval_request", item, {
      rejected: employee,
      status: HulyRequestStatus.Rejected
    })
    const comment = yield* addRequestComment(client, item, params.comment, true)

    return mutationResult({
      request: params.request,
      action: "rejected",
      changed: true,
      status: "Rejected",
      comment: MessageId.make(comment)
    })
  })

export const cancelApprovalRequest = (
  params: CancelApprovalRequestParams
): Effect.Effect<ApprovalRequestMutationResult, ApprovalRequestWriteError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const item = yield* findApprovalRequest(client, params.request)
    yield* requireActive(item)

    const actor = String(client.getAccountUuid())
    const primarySocialId = String(client.getPrimarySocialId())
    const socialIds = (client.getSocialIds?.() ?? [client.getPrimarySocialId()]).map(String)
    const creator = item.createdBy === undefined ? undefined : String(item.createdBy)
    const matchesDirectActor = creator === actor || creator === primarySocialId || socialIds.includes(creator ?? "")
    const matchesEmployee = creator === undefined || matchesDirectActor
      ? false
      : String(yield* currentEmployeeRef(client)) === creator
    if (!matchesDirectActor && !matchesEmployee) {
      return yield* new ApprovalRequestCancelUnauthorizedError({
        request: params.request,
        actor,
        ...(creator === undefined ? {} : { creator })
      })
    }

    yield* updateRequestCollection(client, "cancel_approval_request", item, { status: HulyRequestStatus.Cancelled })

    return mutationResult({
      request: params.request,
      action: "cancelled",
      changed: true,
      status: "Cancelled"
    })
  })
