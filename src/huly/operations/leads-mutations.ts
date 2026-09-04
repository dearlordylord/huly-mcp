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
import { funnelSpace, type FunnelWorkflowTaskType, type HulyFunnel } from "./funnels-shared.js"
import { customerMixinWriteAttributes } from "./leads-mutations-boundary.js"
import {
  currentStatus,
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

type LeadUpdateOperations = { readonly operations: LeadDocumentUpdate; readonly changed: boolean }

const rejectArchivedLeadUpdate = Effect.fn("Lead.rejectArchivedLeadUpdate")(function* (
  params: UpdateLeadParams,
  funnel: HulyFunnel
): Effect.fn.Return<void, LeadUpdateConflictError> {
  if (!funnel.archived) return
  return yield* new LeadUpdateConflictError({
    identifier: params.identifier,
    funnel: FunnelIdentifier.make(funnel._id),
    reason: NonEmptyString.make("funnel is archived and cannot accept lead updates")
  })
})

const assigneeUpdate = Effect.fn("Lead.assigneeUpdate")(function* (
  client: HulyClient["Service"],
  params: UpdateLeadParams,
  lead: HulyLead
): Effect.fn.Return<LeadUpdateOperations, LeadMutationError> {
  if (params.assignee === undefined) return { operations: {}, changed: false }
  const assignee = params.assignee === null ? null : yield* resolveEmployee(client, params.assignee)
  const changed = String(assignee) !== String(lead.assignee)
  return { operations: changed ? { assignee } : {}, changed }
})

const statusUpdate = Effect.fn("Lead.statusUpdate")(function* (
  workflow: ReadonlyArray<FunnelWorkflowTaskType>,
  lead: HulyLead,
  funnel: HulyFunnel,
  params: UpdateLeadParams
): Effect.fn.Return<LeadUpdateOperations, LeadMutationError> {
  if (params.status === undefined) return { operations: {}, changed: false }
  const status = yield* statusForLead(workflow, lead, funnel, params.status, params.funnel)
  const changed = String(status) !== String(lead.status)
  return { operations: changed ? { status } : {}, changed }
})

const titleUpdate = (requested: UpdateLeadParams["title"], current: HulyLead["title"]): LeadDocumentUpdate =>
  requested === undefined || requested === current ? {} : { title: requested }

const startDateUpdate = (
  requested: UpdateLeadParams["startDate"],
  current: HulyLead["startDate"]
): LeadDocumentUpdate => (requested === undefined || requested === current ? {} : { startDate: requested })

const dueDateUpdate = (requested: UpdateLeadParams["dueDate"], current: HulyLead["dueDate"]): LeadDocumentUpdate =>
  requested === undefined || requested === current ? {} : { dueDate: requested }

const leadFieldUpdates = (params: UpdateLeadParams, lead: HulyLead): LeadDocumentUpdate => ({
  ...titleUpdate(params.title, lead.title),
  ...startDateUpdate(params.startDate, lead.startDate),
  ...dueDateUpdate(params.dueDate, lead.dueDate)
})

const descriptionUpdate = Effect.fn("Lead.descriptionUpdate")(function* (
  client: HulyClient["Service"],
  params: UpdateLeadParams,
  lead: HulyLead
): Effect.fn.Return<LeadUpdateOperations, HulyClientError | HulyError> {
  return params.description === undefined
    ? { operations: {}, changed: false }
    : yield* updateLeadDescription(client, lead, params.description)
})

const customerDescriptionUpdate = Effect.fn("Lead.customerDescriptionUpdate")(function* (
  client: HulyClient["Service"],
  params: UpdateLeadParams,
  lead: HulyLead
): Effect.fn.Return<boolean, LeadMutationError> {
  return params.customerDescription === undefined
    ? false
    : yield* updateLeadCustomerDescription(client, lead, params.customerDescription)
})

const persistLeadUpdate = Effect.fn("Lead.persistLeadUpdate")(function* (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  lead: HulyLead,
  operations: LeadDocumentUpdate
): Effect.fn.Return<void, HulyClientError> {
  if (Object.keys(operations).length === 0) return
  yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(funnel), toRef<Doc>(lead._id), operations)
})

export const updateLead = Effect.fn("Lead.updateLead")(function* (
  params: UpdateLeadParams
): Effect.fn.Return<LeadMutationResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* validatedFunnel(client, params.funnel)
  yield* rejectArchivedLeadUpdate(params, source.funnel)
  const lead = yield* findLead(client, source.funnel, params.identifier)

  const assignee = yield* assigneeUpdate(client, params, lead)
  const status = yield* statusUpdate(source.workflow, lead, source.funnel, params)
  const description = yield* descriptionUpdate(client, params, lead)
  const customerChanged = yield* customerDescriptionUpdate(client, params, lead)

  const operations: LeadDocumentUpdate = {
    ...leadFieldUpdates(params, lead),
    ...assignee.operations,
    ...status.operations,
    ...description.operations
  }
  const changed = Object.keys(operations).length > 0 || description.changed || customerChanged
  yield* persistLeadUpdate(client, source.funnel, lead, operations)
  return { identifier: LeadIdentifier.make(lead.identifier), updated: changed }
})

const rejectInactiveMoveFunnels = Effect.fn("Lead.rejectInactiveMoveFunnels")(function* (
  identifier: LeadIdentifier,
  source: HulyFunnel,
  destination: HulyFunnel
): Effect.fn.Return<void, LeadMoveConflictError> {
  if (!source.archived && !destination.archived) return
  return yield* new LeadMoveConflictError({
    identifier,
    sourceFunnel: FunnelIdentifier.make(source._id),
    destinationFunnel: FunnelIdentifier.make(destination._id),
    reason: NonEmptyString.make("source and destination funnels must both be active")
  })
})

const compatibleDestinationWorkflow = (
  workflow: ReadonlyArray<FunnelWorkflowTaskType>,
  lead: HulyLead
): FunnelWorkflowTaskType | undefined =>
  workflow.find((candidate) => String(candidate.taskType._id) === String(lead.kind)) ??
  (workflow.length === 1 ? workflow[0] : undefined)

const requireDestinationWorkflow = Effect.fn("Lead.requireDestinationWorkflow")(function* (
  workflow: FunnelWorkflowTaskType | undefined,
  identifier: LeadIdentifier,
  sourceFunnel: FunnelIdentifier,
  destinationFunnel: FunnelIdentifier
): Effect.fn.Return<FunnelWorkflowTaskType, LeadMoveConflictError> {
  if (workflow !== undefined) return workflow
  return yield* new LeadMoveConflictError({
    identifier,
    sourceFunnel,
    destinationFunnel,
    reason: NonEmptyString.make("the destination has no unambiguous compatible Lead task type")
  })
})

const destinationStatusReason = (requested: MoveLeadParams["status"], current: StatusName): NonEmptyString =>
  NonEmptyString.make(
    requested === undefined
      ? `current status '${current}' has no compatible destination mapping`
      : `requested status '${requested}' is not valid in the destination workflow`
  )

const destinationStatus = Effect.fn("Lead.destinationStatus")(function* (
  workflow: FunnelWorkflowTaskType,
  params: MoveLeadParams,
  current: StatusName,
  identifier: LeadIdentifier,
  sourceFunnel: FunnelIdentifier,
  destinationFunnel: FunnelIdentifier
): Effect.fn.Return<Ref<Status>, LeadMoveConflictError> {
  const requestedStatus = params.status ?? current
  return yield* statusByName(workflow.statuses, requestedStatus, params.destinationFunnel).pipe(
    Effect.mapError(
      () =>
        new LeadMoveConflictError({
          identifier,
          sourceFunnel,
          destinationFunnel,
          reason: destinationStatusReason(params.status, current)
        })
    )
  )
})

const moveRequired = (
  source: HulyFunnel,
  destination: HulyFunnel,
  destinationStatusId: Ref<Status>,
  lead: HulyLead,
  taskTypeChanged: boolean
): boolean =>
  String(source._id) !== String(destination._id) ||
  String(destinationStatusId) !== String(lead.status) ||
  taskTypeChanged

const moveOperations = (
  destination: HulyFunnel,
  destinationStatusId: Ref<Status>,
  destinationWorkflow: FunnelWorkflowTaskType,
  taskTypeChanged: boolean
): LeadDocumentUpdate => ({
  space: funnelSpace(destination),
  status: destinationStatusId,
  ...(taskTypeChanged ? { kind: destinationWorkflow.taskType._id } : {})
})

const persistLeadMove = Effect.fn("Lead.persistLeadMove")(function* (
  client: HulyClient["Service"],
  source: HulyFunnel,
  lead: HulyLead,
  operations: LeadDocumentUpdate,
  moved: boolean
): Effect.fn.Return<void, HulyClientError> {
  if (!moved) return
  yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(source), toRef<Doc>(lead._id), operations)
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
  yield* rejectInactiveMoveFunnels(identifier, source.funnel, destination.funnel)

  const sourceWorkflow = yield* workflowForLead(source.workflow, lead, source.funnel)
  const current = yield* currentStatus(sourceWorkflow, lead, source.funnel)
  const destinationWorkflow = yield* requireDestinationWorkflow(
    compatibleDestinationWorkflow(destination.workflow, lead),
    identifier,
    sourceFunnel,
    destinationFunnel
  )
  const destinationStatusId = yield* destinationStatus(
    destinationWorkflow,
    params,
    current.name,
    identifier,
    sourceFunnel,
    destinationFunnel
  )
  const taskTypeChanged = String(destinationWorkflow.taskType._id) !== String(lead.kind)
  const moved = moveRequired(source.funnel, destination.funnel, destinationStatusId, lead, taskTypeChanged)
  const operations = moveOperations(destination.funnel, destinationStatusId, destinationWorkflow, taskTypeChanged)
  yield* persistLeadMove(client, source.funnel, lead, operations, moved)
  const statusName = destinationWorkflow.statuses.find(
    (status) => String(status.id) === String(destinationStatusId)
  )?.name
  return {
    identifier,
    sourceFunnel,
    destinationFunnel,
    status: StatusName.make(statusName ?? params.status ?? current.name),
    moved
  }
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
