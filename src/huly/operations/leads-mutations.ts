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
import { isSingle } from "../../utils/assertions.js"
import { normalizeForComparison } from "../../utils/normalize.js"
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
import { executeCustomerDescription, prepareCustomerDescription } from "./leads-customer-description.js"
import {
  currentStatus,
  executeLeadDescription,
  type HulyLead,
  type LeadDocumentUpdate,
  findLead,
  findLeadCustomer,
  resolveExactPerson,
  resolveEmployee,
  prepareLeadDescription,
  type LeadMutationError,
  validatedFunnel,
  workflowForLead,
  statusByName
} from "./leads-mutations-shared.js"
import { toRef } from "./sdk-boundary.js"

interface LeadMutationResolvers {
  readonly validatedFunnel: typeof validatedFunnel
  readonly findLead: typeof findLead
  readonly resolveEmployee: typeof resolveEmployee
  readonly resolveExactPerson: typeof resolveExactPerson
  readonly findLeadCustomer: typeof findLeadCustomer
}

const defaultLeadMutationResolvers: LeadMutationResolvers = {
  validatedFunnel,
  findLead,
  resolveEmployee,
  resolveExactPerson,
  findLeadCustomer
}

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
  lead: HulyLead,
  resolveAssignee: typeof resolveEmployee = resolveEmployee
): Effect.fn.Return<LeadUpdateOperations, LeadMutationError> {
  if (params.assignee === undefined) return { operations: {}, changed: false }
  const assignee = params.assignee === null ? null : yield* resolveAssignee(client, params.assignee)
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

const persistLeadUpdate = Effect.fn("Lead.persistLeadUpdate")(function* (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  lead: HulyLead,
  operations: LeadDocumentUpdate
): Effect.fn.Return<void, HulyClientError> {
  if (Object.keys(operations).length === 0) return
  yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(funnel), toRef<Doc>(lead._id), operations)
})

const leadUpdateChanged = (
  operations: LeadDocumentUpdate,
  descriptionChanged: boolean,
  customerChanged: boolean
): boolean => Object.keys(operations).length > 0 || descriptionChanged || customerChanged

export const updateLead = Effect.fn("Lead.updateLead")(function* (
  params: UpdateLeadParams,
  resolvers: LeadMutationResolvers = defaultLeadMutationResolvers
): Effect.fn.Return<LeadMutationResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* resolvers.validatedFunnel(client, params.funnel)
  yield* rejectArchivedLeadUpdate(params, source.funnel)
  const lead = yield* resolvers.findLead(client, source.funnel, params.identifier)

  const assignee = yield* assigneeUpdate(client, params, lead, resolvers.resolveEmployee)
  const status = yield* statusUpdate(source.workflow, lead, source.funnel, params)
  const descriptionPlan = yield* prepareLeadDescription(client, lead, params.description)
  const customerPlan = yield* prepareCustomerDescription(
    client,
    lead,
    params.customerDescription,
    resolvers.findLeadCustomer
  )

  const description = yield* executeLeadDescription(client, lead, descriptionPlan)
  const customerChanged = yield* executeCustomerDescription(client, customerPlan)

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
): Effect.fn.Return<{ readonly id: Ref<Status>; readonly name: StatusName }, LeadMoveConflictError> {
  const requestedStatus = params.status ?? current
  const matches = workflow.statuses.filter(
    (status) => normalizeForComparison(status.name) === normalizeForComparison(requestedStatus)
  )
  if (isSingle(matches)) return { id: matches[0].id, name: StatusName.make(matches[0].name) }
  return yield* new LeadMoveConflictError({
    identifier,
    sourceFunnel,
    destinationFunnel,
    reason: destinationStatusReason(params.status, current)
  })
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
  params: MoveLeadParams,
  resolvers: LeadMutationResolvers = defaultLeadMutationResolvers
): Effect.fn.Return<MoveLeadResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* resolvers.validatedFunnel(client, params.funnel)
  const destination = yield* resolvers.validatedFunnel(client, params.destinationFunnel)
  const lead = yield* resolvers.findLead(client, source.funnel, params.identifier)
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
  const resolvedDestinationStatus = yield* destinationStatus(
    destinationWorkflow,
    params,
    current.name,
    identifier,
    sourceFunnel,
    destinationFunnel
  )
  const taskTypeChanged = String(destinationWorkflow.taskType._id) !== String(lead.kind)
  const moved = moveRequired(source.funnel, destination.funnel, resolvedDestinationStatus.id, lead, taskTypeChanged)
  const operations = moveOperations(
    destination.funnel,
    resolvedDestinationStatus.id,
    destinationWorkflow,
    taskTypeChanged
  )
  yield* persistLeadMove(client, source.funnel, lead, operations, moved)
  return { identifier, sourceFunnel, destinationFunnel, status: resolvedDestinationStatus.name, moved }
})

export const deleteLead = Effect.fn("Lead.deleteLead")(function* (
  params: DeleteLeadParams,
  resolvers: LeadMutationResolvers = defaultLeadMutationResolvers
): Effect.fn.Return<DeleteLeadResult, LeadMutationError, HulyClient | Diagnostics> {
  const client = yield* HulyClient
  const source = yield* resolvers.validatedFunnel(client, params.funnel)
  const lead = yield* resolvers.findLead(client, source.funnel, params.identifier)
  return yield* deleteResolvedLead(client, source, lead, params)
})

export const makePersonCustomer = Effect.fn("Lead.makePersonCustomer")(function* (
  params: MakePersonCustomerParams,
  resolvers: LeadMutationResolvers = defaultLeadMutationResolvers
): Effect.fn.Return<
  MakePersonCustomerResult,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | HulyDataInvalidError,
  HulyClient
> {
  const client = yield* HulyClient
  const person = yield* resolvers.resolveExactPerson(client, params.identifier)
  return yield* applyPersonCustomer(client, person)
})
