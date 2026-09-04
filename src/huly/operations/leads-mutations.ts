/** Native Lead update, move, deletion preflight, and customer operations. */
import type { Contact } from "@hcengineering/contact"
import type { DocumentUpdate } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  DeleteLeadParams,
  DeleteLeadResult,
  LeadImpact,
  MakePersonCustomerParams,
  MakePersonCustomerResult,
  MoveLeadParams,
  MoveLeadResult,
  UpdateLeadParams,
  LeadMutationResult
} from "../../domain/schemas/leads.js"
import { FunnelIdentifier, LeadIdentifier } from "../../domain/schemas/leads.js"
import { Count, NonEmptyString, PersonId, StatusName } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import type { HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { LeadDeleteConflictError, LeadMoveConflictError, LeadUpdateConflictError } from "../errors-leads.js"
import { HulyError, PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { funnelSpace } from "./funnels-shared.js"
import {
  currentStatus,
  findLead,
  hasCustomerMixin,
  type HulyCustomerMixin,
  resolveExactPerson,
  resolveEmployee,
  type HulyLead,
  type LeadMutationError,
  updateLeadCustomerDescription,
  updateLeadDescription,
  validatedFunnel,
  workflowForLead,
  statusByName
} from "./leads-mutations-shared.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

export const updateLead = (
  params: UpdateLeadParams
): Effect.Effect<LeadMutationResult, LeadMutationError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
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
        : yield* Effect.gen(function* () {
            const workflow = yield* workflowForLead(source.workflow, lead, source.funnel)
            return yield* statusByName(workflow.statuses, params.status, params.funnel)
          })
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

    const operations: DocumentUpdate<HulyLead> = {
      ...(params.title !== undefined && params.title !== lead.title ? { title: params.title } : {}),
      ...(params.startDate !== undefined && params.startDate !== lead.startDate ? { startDate: params.startDate } : {}),
      ...(params.dueDate !== undefined && params.dueDate !== lead.dueDate ? { dueDate: params.dueDate } : {}),
      ...assigneeOperation,
      ...statusOperation,
      ...description.operations
    }
    const changed = Object.keys(operations).length > 0 || description.changed || customerChanged
    if (Object.keys(operations).length > 0) {
      yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(source.funnel), lead._id, operations)
    }
    return { identifier: LeadIdentifier.make(lead.identifier), updated: changed }
  })

export const moveLead = (
  params: MoveLeadParams
): Effect.Effect<MoveLeadResult, LeadMutationError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
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
      const operations: DocumentUpdate<HulyLead> = {
        space: funnelSpace(destination.funnel),
        status: destinationStatus,
        ...(taskTypeChanged ? { kind: destinationWorkflow.taskType._id } : {})
      }
      yield* client.updateDoc(leadClassIds.class.Lead, funnelSpace(source.funnel), lead._id, operations)
    }
    const statusName = destinationWorkflow.statuses.find(
      (status) => String(status.id) === String(destinationStatus)
    )?.name
    return {
      identifier,
      sourceFunnel,
      destinationFunnel,
      status: StatusName.make(statusName ?? requestedStatus),
      moved
    }
  })

export const deletionImpact = (lead: HulyLead): LeadImpact => {
  const comments = Count.make(lead.comments ?? 0)
  const attachments = Count.make(lead.attachments ?? 0)
  return { comments, attachments, totalAffected: Count.make(comments + attachments) }
}

export const deleteLead = (
  params: DeleteLeadParams
): Effect.Effect<DeleteLeadResult, LeadMutationError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const source = yield* validatedFunnel(client, params.funnel)
    const lead = yield* findLead(client, source.funnel, params.identifier)
    const identifier = LeadIdentifier.make(lead.identifier)
    const funnel = FunnelIdentifier.make(source.funnel._id)
    const impact = deletionImpact(lead)
    if (params.execute !== true) return { identifier, funnel, impact, deleted: false }
    if (params.expectedComments !== impact.comments || params.expectedAttachments !== impact.attachments) {
      return yield* new LeadDeleteConflictError({
        identifier,
        funnel,
        reason: NonEmptyString.make(
          `deletion impact changed; expected comments=${params.expectedComments}, attachments=${params.expectedAttachments}, current comments=${impact.comments}, attachments=${impact.attachments}`
        )
      })
    }
    yield* client.removeDoc(leadClassIds.class.Lead, funnelSpace(source.funnel), lead._id)
    return { identifier, funnel, impact, deleted: true }
  })

export const makePersonCustomer = (
  params: MakePersonCustomerParams
): Effect.Effect<
  MakePersonCustomerResult,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const person = yield* resolveExactPerson(client, params.identifier)
    if (hasCustomerMixin(person)) return { id: PersonId.make(person._id), applied: false }
    yield* client.createMixin<Contact, HulyCustomerMixin>(
      toRef<Contact>(person._id),
      toClassRef<Contact>(person._class),
      person.space,
      toMixinRef<HulyCustomerMixin>(leadClassIds.mixin.Customer),
      { customerDescription: null }
    )
    return { id: PersonId.make(person._id), applied: true }
  })
