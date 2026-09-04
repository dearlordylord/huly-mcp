import type { Doc, Ref, Status } from "@hcengineering/core"
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
  LeadMutationResult,
  MakePersonCustomerResult,
  MoveLeadResult
} from "../../domain/schemas/leads-mutations.js"
import { NonEmptyString, StatusName } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import type { HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { LeadMoveConflictError, LeadUpdateConflictError } from "../errors-leads.js"
import type {
  HulyDataInvalidError,
  HulyError,
  InvalidStatusError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError
} from "../errors.js"
import { leadClassIds } from "../lead-plugin.js"
import { funnelSpace, type FunnelWorkflowTaskType, type HulyFunnel } from "./funnels-shared.js"
import { applyPersonCustomer, deleteResolvedLead } from "./leads-mutation-actions.js"
import {
  currentStatus,
  type HulyLead,
  type LeadDocumentUpdate,
  findLead,
  resolveExactPerson,
  resolveEmployee,
  type LeadMutationError,
  updateLeadCustomerDescription,
  updateLeadDescription,
  validatedFunnel,
  workflowForLead,
  statusByName
} from "./leads-mutations-shared.js"
import { toRef } from "./sdk-boundary.js"

export { applyPersonCustomer, deleteResolvedLead, deletionImpact } from "./leads-mutation-actions.js"

export const statusForLead = Effect.fn("Lead.statusForLead")(function* (
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

export const rejectArchivedLeadUpdate = Effect.fn("Lead.rejectArchivedLeadUpdate")(function* (
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

export const assigneeUpdate = Effect.fn("Lead.assigneeUpdate")(function* (
  client: HulyClient["Service"],
  params: UpdateLeadParams,
  lead: HulyLead
): Effect.fn.Return<LeadUpdateOperations, LeadMutationError> {
  if (params.assignee === undefined) return { operations: {}, changed: false }
  const assignee = params.assignee === null ? null : yield* resolveEmployee(client, params.assignee)
  const changed = String(assignee) !== String(lead.assignee)
  return { operations: changed ? { assignee } : {}, changed }
})

export const statusUpdate = Effect.fn("Lead.statusUpdate")(function* (
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

export const leadFieldUpdates = (params: UpdateLeadParams, lead: HulyLead): LeadDocumentUpdate => ({
  ...titleUpdate(params.title, lead.title),
  ...startDateUpdate(params.startDate, lead.startDate),
  ...dueDateUpdate(params.dueDate, lead.dueDate)
})

export const descriptionUpdate = Effect.fn("Lead.descriptionUpdate")(function* (
  client: HulyClient["Service"],
  params: UpdateLeadParams,
  lead: HulyLead
): Effect.fn.Return<LeadUpdateOperations, HulyClientError | HulyError> {
  return params.description === undefined
    ? { operations: {}, changed: false }
    : yield* updateLeadDescription(client, lead, params.description)
})

export const customerDescriptionUpdate = Effect.fn("Lead.customerDescriptionUpdate")(function* (
  client: HulyClient["Service"],
  params: UpdateLeadParams,
  lead: HulyLead
): Effect.fn.Return<boolean, LeadMutationError> {
  return params.customerDescription === undefined
    ? false
    : yield* updateLeadCustomerDescription(client, lead, params.customerDescription)
})

export const persistLeadUpdate = Effect.fn("Lead.persistLeadUpdate")(function* (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  lead: HulyLead,
  operations: LeadDocumentUpdate
): Effect.fn.Return<void, HulyClientError> {
  if (Object.keys(operations).length === 0) return
  yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(funnel), toRef<Doc>(lead._id), operations)
})

export const leadUpdateChanged = (
  operations: LeadDocumentUpdate,
  descriptionChanged: boolean,
  customerChanged: boolean
): boolean => Object.keys(operations).length > 0 || descriptionChanged || customerChanged

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
  const changed = leadUpdateChanged(operations, description.changed, customerChanged)
  yield* persistLeadUpdate(client, source.funnel, lead, operations)
  return { identifier: LeadIdentifier.make(lead.identifier), updated: changed }
})

export const rejectInactiveMoveFunnels = Effect.fn("Lead.rejectInactiveMoveFunnels")(function* (
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

export const compatibleDestinationWorkflow = (
  workflow: ReadonlyArray<FunnelWorkflowTaskType>,
  lead: HulyLead
): FunnelWorkflowTaskType | undefined =>
  workflow.find((candidate) => String(candidate.taskType._id) === String(lead.kind)) ??
  (workflow.length === 1 ? workflow[0] : undefined)

export const requireDestinationWorkflow = Effect.fn("Lead.requireDestinationWorkflow")(function* (
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

export const destinationStatusReason = (requested: MoveLeadParams["status"], current: StatusName): NonEmptyString =>
  NonEmptyString.make(
    requested === undefined
      ? `current status '${current}' has no compatible destination mapping`
      : `requested status '${requested}' is not valid in the destination workflow`
  )

export const destinationStatus = Effect.fn("Lead.destinationStatus")(function* (
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

export const moveRequired = (
  source: HulyFunnel,
  destination: HulyFunnel,
  destinationStatusId: Ref<Status>,
  lead: HulyLead,
  taskTypeChanged: boolean
): boolean =>
  String(source._id) !== String(destination._id) ||
  String(destinationStatusId) !== String(lead.status) ||
  taskTypeChanged

export const moveOperations = (
  destination: HulyFunnel,
  destinationStatusId: Ref<Status>,
  destinationWorkflow: FunnelWorkflowTaskType,
  taskTypeChanged: boolean
): LeadDocumentUpdate => ({
  space: funnelSpace(destination),
  status: destinationStatusId,
  ...(taskTypeChanged ? { kind: destinationWorkflow.taskType._id } : {})
})

export const persistLeadMove = Effect.fn("Lead.persistLeadMove")(function* (
  client: HulyClient["Service"],
  source: HulyFunnel,
  lead: HulyLead,
  operations: LeadDocumentUpdate,
  moved: boolean
): Effect.fn.Return<void, HulyClientError> {
  if (!moved) return
  yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(source), toRef<Doc>(lead._id), operations)
})

export const resolvedMoveStatusName = (
  workflow: FunnelWorkflowTaskType,
  destinationStatusId: Ref<Status>,
  requested: MoveLeadParams["status"],
  current: StatusName
): StatusName => {
  const resolved = workflow.statuses.find((status) => String(status.id) === String(destinationStatusId))?.name
  return StatusName.make(resolved ?? requested ?? current)
}

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
  return {
    identifier,
    sourceFunnel,
    destinationFunnel,
    status: resolvedMoveStatusName(destinationWorkflow, destinationStatusId, params.status, current.name),
    moved
  }
})

export const deleteLead = Effect.fn("Lead.deleteLead")(function* (
  params: DeleteLeadParams
): Effect.fn.Return<DeleteLeadResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* validatedFunnel(client, params.funnel)
  const lead = yield* findLead(client, source.funnel, params.identifier)
  return yield* deleteResolvedLead(client, source, lead, params)
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
  return yield* applyPersonCustomer(client, person)
})
