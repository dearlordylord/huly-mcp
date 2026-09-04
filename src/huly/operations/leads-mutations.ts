import type { Contact } from "@hcengineering/contact"
import type { Attachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import type { AttachedDoc, Doc, Ref, Space, Status } from "@hcengineering/core"
import type { TagReference } from "@hcengineering/tags"
import { Effect } from "effect"

import type {
  DeleteLeadParams,
  FunnelReference,
  MakePersonCustomerParams,
  MoveLeadParams,
  UpdateLeadParams
} from "../../domain/schemas/leads.js"
import { FunnelIdentifier, LeadIdentifier } from "../../domain/schemas/leads.js"
import type {
  DeleteLeadResult,
  LeadImpact,
  LeadMutationResult,
  LeadRelationCollection,
  MakePersonCustomerResult,
  MoveLeadResult
} from "../../domain/schemas/leads-mutations.js"
import { Count, NonEmptyString, PersonId, StatusName } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import type { HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { LeadDeleteConflictError, LeadMoveConflictError, LeadUpdateConflictError } from "../errors-leads.js"
import { HulyDataInvalidError } from "../errors.js"
import type { HulyError, InvalidStatusError, PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { attachment, chunter, tags } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { funnelSpace } from "./funnels-shared.js"
import {
  currentStatus,
  customerMixinWriteAttributes,
  type HulyLead,
  type LeadDocumentUpdate,
  findLead,
  hasCustomerMixin,
  type CustomerMixinWrite,
  resolveExactPerson,
  resolveEmployee,
  type LeadMutationError,
  updateLeadCustomerDescription,
  updateLeadDescription,
  validatedFunnel,
  workflowForLead,
  statusByName
} from "./leads-mutations-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

const statusForLead = Effect.fn("Lead.statusForLead")(function* (
  workflow: Parameters<typeof workflowForLead>[0],
  lead: HulyLead,
  funnel: Parameters<typeof workflowForLead>[2],
  name: StatusName,
  project: FunnelReference
): Effect.fn.Return<Ref<Status>, HulyError | InvalidStatusError> {
  const leadWorkflow = yield* workflowForLead(workflow, lead, funnel)
  return yield* statusByName(leadWorkflow.statuses, name, project)
})

export const updateLead = Effect.fn("Lead.updateLead")(function* (
  params: UpdateLeadParams
): Effect.fn.Return<LeadMutationResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* validatedFunnel(client, params.funnel)
  if (source.funnel.archived) {
    return yield* new LeadUpdateConflictError({
      identifier: params.identifier,
      funnel: FunnelIdentifier.make(source.funnel._id),
      reason: NonEmptyString.make("funnel is archived and cannot accept lead updates")
    })
  }
  const lead = yield* findLead(client, source.funnel, params.identifier)

  const assignee =
    params.assignee === undefined
      ? undefined
      : params.assignee === null
        ? null
        : yield* resolveEmployee(client, params.assignee)
  const assigneeChanged = params.assignee !== undefined && String(assignee) !== String(lead.assignee)

  const status =
    params.status === undefined
      ? undefined
      : yield* statusForLead(source.workflow, lead, source.funnel, params.status, params.funnel)
  const statusChanged = status !== undefined && String(status) !== String(lead.status)
  const assigneeOperation = assigneeChanged && assignee !== undefined ? { assignee } : {}
  const statusOperation = statusChanged && status !== undefined ? { status } : {}
  const description =
    params.description === undefined
      ? { operations: {}, changed: false }
      : yield* updateLeadDescription(client, lead, params.description)
  const customerChanged =
    params.customerDescription === undefined
      ? false
      : yield* updateLeadCustomerDescription(client, lead, params.customerDescription)

  const operations: LeadDocumentUpdate = {
    ...(params.title !== undefined && params.title !== lead.title ? { title: params.title } : {}),
    ...(params.startDate !== undefined && params.startDate !== lead.startDate ? { startDate: params.startDate } : {}),
    ...(params.dueDate !== undefined && params.dueDate !== lead.dueDate ? { dueDate: params.dueDate } : {}),
    ...assigneeOperation,
    ...statusOperation,
    ...description.operations
  }
  const changed = Object.keys(operations).length > 0 || description.changed || customerChanged
  if (Object.keys(operations).length > 0) {
    yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(source.funnel), toRef<Doc>(lead._id), operations)
  }
  return { identifier: LeadIdentifier.make(lead.identifier), updated: changed }
})

export const moveLead = Effect.fn("Lead.moveLead")(function* (
  params: MoveLeadParams
): Effect.fn.Return<MoveLeadResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* validatedFunnel(client, params.funnel)
  const destination = yield* validatedFunnel(client, params.destinationFunnel)
  const lead = yield* findLead(client, source.funnel, params.identifier)
  const sourceFunnel = FunnelIdentifier.make(source.funnel._id)
  const destinationFunnel = FunnelIdentifier.make(destination.funnel._id)
  const identifier = LeadIdentifier.make(lead.identifier)
  if (source.funnel.archived || destination.funnel.archived) {
    return yield* new LeadMoveConflictError({
      identifier,
      sourceFunnel,
      destinationFunnel,
      reason: NonEmptyString.make("source and destination funnels must both be active")
    })
  }

  const sourceWorkflow = yield* workflowForLead(source.workflow, lead, source.funnel)
  const current = yield* currentStatus(sourceWorkflow, lead, source.funnel)
  const destinationWorkflow =
    destination.workflow.find((candidate) => String(candidate.taskType._id) === String(lead.kind)) ??
    (destination.workflow.length === 1 ? destination.workflow[0] : undefined)
  if (destinationWorkflow === undefined) {
    return yield* new LeadMoveConflictError({
      identifier,
      sourceFunnel,
      destinationFunnel,
      reason: NonEmptyString.make("the destination has no unambiguous compatible Lead task type")
    })
  }

  const requestedStatus = params.status ?? current.name
  const destinationStatus = yield* statusByName(
    destinationWorkflow.statuses,
    requestedStatus,
    params.destinationFunnel
  ).pipe(
    Effect.mapError(
      () =>
        new LeadMoveConflictError({
          identifier,
          sourceFunnel,
          destinationFunnel,
          reason: NonEmptyString.make(
            params.status === undefined
              ? `current status '${current.name}' has no compatible destination mapping`
              : `requested status '${params.status}' is not valid in the destination workflow`
          )
        })
    )
  )
  const taskTypeChanged = String(destinationWorkflow.taskType._id) !== String(lead.kind)
  const moved =
    String(source.funnel._id) !== String(destination.funnel._id) ||
    String(destinationStatus) !== String(lead.status) ||
    taskTypeChanged
  if (moved) {
    const operations: LeadDocumentUpdate = {
      space: funnelSpace(destination.funnel),
      status: destinationStatus,
      ...(taskTypeChanged ? { kind: destinationWorkflow.taskType._id } : {})
    }
    yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(source.funnel), toRef<Doc>(lead._id), operations)
  }
  const statusName = destinationWorkflow.statuses.find(
    (status) => String(status.id) === String(destinationStatus)
  )?.name
  return { identifier, sourceFunnel, destinationFunnel, status: StatusName.make(statusName ?? requestedStatus), moved }
})

const authoritativeRelationCount = Effect.fn("Lead.authoritativeRelationCount")((
  relation: LeadRelationCollection,
  result: { readonly total: number }
): Effect.Effect<Count, HulyDataInvalidError> => {
  if (!Number.isSafeInteger(result.total) || result.total < 0) {
    return Effect.fail(
      new HulyDataInvalidError({
        operation: "deleteLead",
        entity: `Lead ${relation} relation count`,
        cause: result.total
      })
    )
  }
  return Effect.succeed(Count.make(result.total))
})

export const deletionImpact = Effect.fn("Lead.deletionImpact")(function* (
  client: HulyClient["Service"],
  lead: HulyLead
): Effect.fn.Return<LeadImpact, HulyClientError | HulyDataInvalidError> {
  const objectId = toRef<Doc>(lead._id)
  const objectClass = toClassRef<Doc>(lead._class)
  const objectSpace = toRef<Space>(lead.space)
  const [comments, attachments] = yield* Effect.all([
    client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        attachedTo: objectId,
        attachedToClass: objectClass,
        space: objectSpace,
        collection: "comments"
      }),
      { limit: 1, total: true }
    ),
    client.findAll<Attachment>(
      attachment.class.Attachment,
      hulyQuery<Attachment>({
        attachedTo: objectId,
        attachedToClass: objectClass,
        space: objectSpace,
        collection: "attachments"
      }),
      { limit: 1, total: true }
    )
  ])
  const labels = yield* client.findAll<TagReference>(
    tags.class.TagReference,
    hulyQuery<TagReference>({
      attachedTo: objectId,
      attachedToClass: objectClass,
      space: objectSpace,
      collection: "labels"
    }),
    { limit: 1, total: true }
  )
  const commentsCount = yield* authoritativeRelationCount("comments", comments)
  const attachmentsCount = yield* authoritativeRelationCount("attachments", attachments)
  const labelsCount = yield* authoritativeRelationCount("labels", labels)
  return {
    comments: commentsCount,
    attachments: attachmentsCount,
    labels: labelsCount,
    totalAffected: Count.make(commentsCount + attachmentsCount + labelsCount)
  }
})

export const deleteLead = Effect.fn("Lead.deleteLead")(function* (
  params: DeleteLeadParams
): Effect.fn.Return<DeleteLeadResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* validatedFunnel(client, params.funnel)
  const lead = yield* findLead(client, source.funnel, params.identifier)
  const identifier = LeadIdentifier.make(lead.identifier)
  const funnel = FunnelIdentifier.make(source.funnel._id)
  const impact = yield* deletionImpact(client, lead)
  if (params.execute !== true) return { identifier, funnel, impact, deleted: false }
  if (
    params.expectedComments !== impact.comments ||
    params.expectedAttachments !== impact.attachments ||
    params.expectedLabels !== impact.labels
  ) {
    return yield* new LeadDeleteConflictError({
      identifier,
      funnel,
      reason: NonEmptyString.make(
        `deletion impact changed; expected comments=${params.expectedComments}, attachments=${params.expectedAttachments}, labels=${params.expectedLabels}, current comments=${impact.comments}, attachments=${impact.attachments}, labels=${impact.labels}`
      )
    })
  }
  if (client.removeCollection === undefined) {
    return yield* new HulyDataInvalidError({ operation: "deleteLead", entity: "Huly Lead collection remover" })
  }
  yield* client.removeCollection(
    toClassRef<AttachedDoc>(String(leadClassIds.class.Lead)),
    funnelSpace(source.funnel),
    toRef<AttachedDoc>(lead._id),
    toRef<Doc>(lead.attachedTo),
    toClassRef<Doc>(lead.attachedToClass),
    lead.collection
  )
  return { identifier, funnel, impact, deleted: true }
})

export const makePersonCustomer = Effect.fn("Lead.makePersonCustomer")(function* (
  params: MakePersonCustomerParams
): Effect.fn.Return<
  MakePersonCustomerResult,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | HulyDataInvalidError,
  HulyClient
> {
  const client = yield* HulyClient
  const person = yield* resolveExactPerson(client, params.identifier)
  if (hasCustomerMixin(person)) return { id: PersonId.make(person._id), applied: false }
  const attributes = yield* customerMixinWriteAttributes({ customerDescription: null })
  yield* client.createMixin<Contact, CustomerMixinWrite>(
    toRef<Contact>(person._id),
    toClassRef<Contact>(person._class),
    toRef<Space>(person.space),
    toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
    attributes
  )
  return { id: PersonId.make(person._id), applied: true }
})
