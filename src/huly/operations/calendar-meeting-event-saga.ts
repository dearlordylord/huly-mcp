import { AccessLevel, type Event as HulyEvent } from "@hcengineering/calendar"
import type { MarkupFormat } from "@hcengineering/api-client"
import type { DocumentUpdate, Ref } from "@hcengineering/core"
import type { Meeting as HulyMeeting, Room } from "@hcengineering/love"
import { Effect, Exit } from "effect"

import type {
  MeetingCompositionFailedStep,
  MeetingCompositionResidual
} from "../../domain/schemas/calendar-meeting-rooms.js"
import { DocId, RoomId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { EventSiblingConvergenceError, MeetingCompositionMutationError } from "../errors.js"
import { calendar, love } from "../huly-plugins.js"
import type { EventMeetingRoomUpdatePlan, EventRoomAssignment } from "./calendar-meeting-resolution.js"
import { descriptionAsMarkupRef } from "./calendar-shared.js"
import { readStableEventSiblings } from "./calendar-meeting-event-read.js"
import {
  captureCompensation,
  captureCompensationProgram,
  compensationFailure,
  failMeetingComposition,
  finishMeetingCompensation,
  type MeetingCompositionCompensationIssue,
  unconfirmedCompensation
} from "./calendar-meeting-saga-failure.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type EventMeetingMutationError = MeetingCompositionMutationError

interface DeferredEventMarkupBase {
  readonly markup: string
  readonly format: MarkupFormat
}

export type DeferredEventMarkup =
  | (DeferredEventMarkupBase & { readonly mode: "upload" })
  | (DeferredEventMarkupBase & { readonly mode: "update"; readonly previousMarkup: string })

export interface EventMeetingMutation {
  readonly plan: EventMeetingRoomUpdatePlan
  readonly update: DocumentUpdate<HulyEvent>
  readonly inverse: DocumentUpdate<HulyEvent>
  readonly deferredMarkup?: DeferredEventMarkup | undefined
}

interface ReconciliationState {
  readonly unattributedEvents: Array<HulyEvent>
}

type UpdateEventFailedStep = Extract<MeetingCompositionFailedStep, { readonly operation: "update_event" }>

type EventMarkupExecution =
  | { readonly _tag: "NotAttempted" }
  | { readonly _tag: "UpdateAttempted"; readonly format: MarkupFormat; readonly previousMarkup: string }
  | { readonly _tag: "UploadAttempted" }
  | { readonly _tag: "ReferenceUpdateAttempted"; readonly previousDescription: HulyEvent["description"] }

interface EventMutationExecution {
  failedStep: UpdateEventFailedStep
  baseWasAttempted: boolean
  markup: EventMarkupExecution
  readonly attemptedRoomAssignments: Array<EventRoomAssignment>
}

type ReconciliationStateError = HulyClientError | EventSiblingConvergenceError

const updateEventRoom = (
  client: HulyClient["Service"],
  assignment: EventRoomAssignment,
  room: Ref<Room>
): Effect.Effect<unknown, HulyClientError> =>
  client.updateMixin<HulyEvent, HulyMeeting>(
    assignment.event._id,
    assignment.event._class,
    assignment.event.space,
    love.mixin.Meeting,
    { room }
  )

const applyOrder = (assignments: ReadonlyArray<EventRoomAssignment>): ReadonlyArray<EventRoomAssignment> => [
  ...assignments.filter((entry) => entry.event.access !== AccessLevel.Owner),
  ...assignments.filter((entry) => entry.event.access === AccessLevel.Owner)
]

const restoreOrder = (assignments: ReadonlyArray<EventRoomAssignment>): ReadonlyArray<EventRoomAssignment> => [
  ...assignments.filter((entry) => entry.event.access === AccessLevel.Owner),
  ...assignments.filter((entry) => entry.event.access !== AccessLevel.Owner)
]

const roomResidual = (assignment: EventRoomAssignment): MeetingCompositionResidual => ({
  _tag: "RoomAssignment",
  target: "event",
  documentId: DocId.make(assignment.event._id),
  expectedRoomId: RoomId.make(assignment.previousRoom)
})

const originalPresenceResidual = (event: HulyEvent): MeetingCompositionResidual => ({
  _tag: "RecordPresence",
  target: "event",
  documentId: DocId.make(event._id),
  expected: "present"
})

const eventSiblingSetResidual = (plan: EventMeetingRoomUpdatePlan): MeetingCompositionResidual => ({
  _tag: "SiblingSet",
  target: "event",
  eventId: plan.eventId
})

const eventBaseResidual = (mutation: EventMeetingMutation): MeetingCompositionResidual => ({
  _tag: "BaseFields",
  target: "event",
  documentId: DocId.make(mutation.plan.baseTarget._id)
})

const eventMarkupResidual = (
  mutation: EventMeetingMutation,
  risk: "content-not-restored" | "uploaded-markup-may-be-orphaned"
): MeetingCompositionResidual => ({
  _tag: "Markup",
  target: "event",
  documentId: DocId.make(mutation.plan.baseTarget._id),
  risk
})

const restoreRooms = Effect.fn("CalendarMeeting.EventSaga.restoreRooms")(function* (
  client: HulyClient["Service"],
  assignments: ReadonlyArray<EventRoomAssignment>
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  const failures: Array<MeetingCompositionCompensationIssue> = []
  for (const assignment of restoreOrder(assignments)) {
    failures.push(
      ...(yield* captureCompensation(
        () => updateEventRoom(client, assignment, assignment.previousRoom),
        [roomResidual(assignment)]
      ))
    )
  }
  return failures
})

const restoreBase = Effect.fn("CalendarMeeting.EventSaga.restoreBase")(function* (
  client: HulyClient["Service"],
  mutation: EventMeetingMutation,
  baseWasAttempted: boolean
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  if (!baseWasAttempted) return []
  return yield* captureCompensation(
    () =>
      client.updateDoc(
        calendar.class.Event,
        mutation.plan.baseTarget.space,
        mutation.plan.baseTarget._id,
        mutation.inverse
      ),
    [eventBaseResidual(mutation)]
  )
})

const restoreMarkup = Effect.fn("CalendarMeeting.EventSaga.restoreMarkup")(function* (
  client: HulyClient["Service"],
  mutation: EventMeetingMutation,
  execution: EventMarkupExecution
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  if (execution._tag === "NotAttempted") return []
  if (execution._tag === "UploadAttempted") {
    return [unconfirmedCompensation([eventMarkupResidual(mutation, "uploaded-markup-may-be-orphaned")])]
  }
  if (execution._tag === "ReferenceUpdateAttempted") {
    const reference = yield* captureCompensation(
      () =>
        client.updateDoc(calendar.class.Event, mutation.plan.baseTarget.space, mutation.plan.baseTarget._id, {
          description: execution.previousDescription
        }),
      [eventMarkupResidual(mutation, "content-not-restored")]
    )
    return [unconfirmedCompensation([eventMarkupResidual(mutation, "uploaded-markup-may-be-orphaned")]), ...reference]
  }
  return yield* captureCompensation(
    () =>
      client.updateMarkup(
        calendar.class.Event,
        mutation.plan.baseTarget._id,
        "description",
        execution.previousMarkup,
        execution.format
      ),
    [eventMarkupResidual(mutation, "content-not-restored")]
  )
})

const recoveredSiblingSetIssues = Effect.fn("CalendarMeeting.EventSaga.checkRecoveredSiblingSet")(function* (
  client: HulyClient["Service"],
  plan: EventMeetingRoomUpdatePlan,
  unattributedEvents: ReadonlyArray<HulyEvent>
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  const expectedDocumentIds = plan.assignments.map((entry) => DocId.make(entry.event._id))
  const read = yield* Effect.exit(readStableEventSiblings(client, plan.eventId, expectedDocumentIds))
  if (Exit.isFailure(read)) {
    const residuals: readonly [MeetingCompositionResidual, ...Array<MeetingCompositionResidual>] = [
      eventSiblingSetResidual(plan),
      ...plan.assignments.map((entry) => originalPresenceResidual(entry.event))
    ]
    return compensationFailure(read, residuals)
  }
  const plannedSiblingIds = new Set(expectedDocumentIds.map(String))
  const observedSiblingIds = new Set(read.value.map((event) => String(event._id)))
  const siblingSetMatchesPlan =
    plannedSiblingIds.size === observedSiblingIds.size &&
    [...plannedSiblingIds].every((documentId) => observedSiblingIds.has(documentId))
  return siblingSetMatchesPlan || unattributedEvents.length > 0
    ? []
    : [unconfirmedCompensation([eventSiblingSetResidual(plan)])]
})

const unattributedSiblingIssues = (
  plan: EventMeetingRoomUpdatePlan,
  events: ReadonlyArray<HulyEvent>
): Array<MeetingCompositionCompensationIssue> =>
  events.length === 0 ? [] : [unconfirmedCompensation([eventSiblingSetResidual(plan)])]

const includesSiblingSetResidual = (issues: ReadonlyArray<MeetingCompositionCompensationIssue>): boolean =>
  issues.some((issue) => issue.residuals.some((residual) => residual._tag === "SiblingSet"))

const recover = Effect.fn("CalendarMeeting.EventSaga.recover")(function* (
  client: HulyClient["Service"],
  mutation: EventMeetingMutation,
  reconciliation: ReconciliationState,
  execution: EventMutationExecution
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  const markup = yield* restoreMarkup(client, mutation, execution.markup)
  const base = yield* restoreBase(client, mutation, execution.baseWasAttempted)
  const presence = yield* recoveredSiblingSetIssues(client, mutation.plan, reconciliation.unattributedEvents)
  const siblings = includesSiblingSetResidual(presence)
    ? []
    : unattributedSiblingIssues(mutation.plan, reconciliation.unattributedEvents)
  const rooms = yield* restoreRooms(client, execution.attemptedRoomAssignments)
  return [...markup, ...base, ...siblings, ...rooms, ...presence]
})

const reconcile = Effect.fn("CalendarMeeting.EventSaga.reconcile")(function* (
  client: HulyClient["Service"],
  plan: EventMeetingRoomUpdatePlan,
  unattributedEvents: Array<HulyEvent>
): Effect.fn.Return<void, ReconciliationStateError> {
  const expectedDocumentIds = plan.assignments.map((entry) => DocId.make(entry.event._id))
  const events = yield* readStableEventSiblings(client, plan.eventId, expectedDocumentIds)
  const original = new Set(plan.assignments.map((entry) => String(entry.event._id)))
  const newEvents = events.filter((event) => !original.has(String(event._id)))
  if (newEvents.length === 0) return
  unattributedEvents.push(...newEvents)
  const meetings = yield* client.findAll<HulyMeeting>(
    love.mixin.Meeting,
    hulyQuery<HulyMeeting>({ _id: { $in: newEvents.map((event) => toRef<HulyMeeting>(event._id)) } })
  )
  const meetingIds = new Set(meetings.map((meeting) => String(meeting._id)))
  for (const event of newEvents) {
    if (meetingIds.has(String(event._id))) {
      yield* client.updateMixin<HulyEvent, HulyMeeting>(event._id, event._class, event.space, love.mixin.Meeting, {
        room: plan.room._id
      })
    } else {
      yield* client.createMixin<HulyEvent, HulyMeeting>(event._id, event._class, event.space, love.mixin.Meeting, {
        room: plan.room._id
      })
    }
  }
})

const applyMarkup = Effect.fn("CalendarMeeting.EventSaga.applyMarkup")(function* (
  client: HulyClient["Service"],
  mutation: EventMeetingMutation,
  deferred: DeferredEventMarkup,
  execution: EventMutationExecution
): Effect.fn.Return<void, HulyClientError> {
  if (deferred.mode === "update") {
    execution.markup = { _tag: "UpdateAttempted", format: deferred.format, previousMarkup: deferred.previousMarkup }
    yield* client.updateMarkup(
      calendar.class.Event,
      mutation.plan.baseTarget._id,
      "description",
      deferred.markup,
      deferred.format
    )
    return
  }
  execution.markup = { _tag: "UploadAttempted" }
  const ref = yield* client.uploadMarkup(
    calendar.class.Event,
    mutation.plan.baseTarget._id,
    "description",
    deferred.markup,
    deferred.format
  )
  execution.markup = { _tag: "ReferenceUpdateAttempted", previousDescription: mutation.plan.baseTarget.description }
  yield* client.updateDoc(calendar.class.Event, mutation.plan.baseTarget.space, mutation.plan.baseTarget._id, {
    description: ref
  })
})

const executeForward = Effect.fn("CalendarMeeting.EventSaga.forward")(function* (
  client: HulyClient["Service"],
  mutation: EventMeetingMutation,
  reconciliation: ReconciliationState,
  execution: EventMutationExecution
) {
  for (const assignment of applyOrder(mutation.plan.assignments)) {
    execution.failedStep = {
      _tag: "UpdateEventRoom",
      operation: "update_event",
      documentId: DocId.make(assignment.event._id)
    }
    execution.attemptedRoomAssignments.push(assignment)
    yield* updateEventRoom(client, assignment, mutation.plan.room._id)
  }
  if (Reflect.ownKeys(mutation.update).length > 0) {
    execution.failedStep = { _tag: "UpdateEventBase", operation: "update_event" }
    execution.baseWasAttempted = true
    yield* client.updateDoc(
      calendar.class.Event,
      mutation.plan.baseTarget.space,
      mutation.plan.baseTarget._id,
      mutation.update
    )
  }
  execution.failedStep = { _tag: "UpdateEventSiblings", operation: "update_event" }
  yield* reconcile(client, mutation.plan, reconciliation.unattributedEvents)
  if (mutation.deferredMarkup !== undefined) {
    execution.failedStep = { _tag: "UpdateEventMarkup", operation: "update_event" }
    yield* applyMarkup(client, mutation, mutation.deferredMarkup, execution)
  }
})

const markupRecoveryFailureResiduals = (
  mutation: EventMeetingMutation,
  execution: EventMarkupExecution
): Array<MeetingCompositionResidual> => {
  if (execution._tag === "NotAttempted") return []
  if (execution._tag === "UpdateAttempted") return [eventMarkupResidual(mutation, "content-not-restored")]
  if (execution._tag === "UploadAttempted") {
    return [eventMarkupResidual(mutation, "uploaded-markup-may-be-orphaned")]
  }
  return [
    eventMarkupResidual(mutation, "uploaded-markup-may-be-orphaned"),
    eventMarkupResidual(mutation, "content-not-restored")
  ]
}

const recoveryFailureResiduals = (
  mutation: EventMeetingMutation,
  execution: EventMutationExecution
): readonly [MeetingCompositionResidual, ...Array<MeetingCompositionResidual>] => [
  eventSiblingSetResidual(mutation.plan),
  ...execution.attemptedRoomAssignments.map((assignment) => roomResidual(assignment)),
  ...mutation.plan.assignments.map((assignment) => originalPresenceResidual(assignment.event)),
  ...(execution.baseWasAttempted ? [eventBaseResidual(mutation)] : []),
  ...markupRecoveryFailureResiduals(mutation, execution.markup)
]

export const snapshotPriorMarkup = Effect.fn("CalendarMeeting.EventSaga.snapshotPriorMarkup")(function* (
  client: HulyClient["Service"],
  event: HulyEvent,
  format: MarkupFormat
): Effect.fn.Return<string | undefined, HulyClientError> {
  if (!event.description) return undefined
  return yield* client.fetchMarkup(
    event._class,
    event._id,
    "description",
    descriptionAsMarkupRef(event.description),
    format
  )
})

export const executeEventMeetingMutation = Effect.fn("CalendarMeeting.EventSaga.execute")(function* (
  client: HulyClient["Service"],
  mutation: EventMeetingMutation
): Effect.fn.Return<void, EventMeetingMutationError> {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const reconciliation: ReconciliationState = { unattributedEvents: [] }
      const execution: EventMutationExecution = {
        failedStep: { _tag: "UpdateEventSiblings", operation: "update_event" },
        baseWasAttempted: false,
        markup: { _tag: "NotAttempted" },
        attemptedRoomAssignments: []
      }
      const outcome = yield* Effect.exit(restore(executeForward(client, mutation, reconciliation, execution)))
      if (Exit.isSuccess(outcome)) return
      const issues = yield* captureCompensationProgram(
        () => recover(client, mutation, reconciliation, execution),
        recoveryFailureResiduals(mutation, execution)
      )
      const finished = finishMeetingCompensation(outcome.cause, issues)
      return yield* failMeetingComposition(execution.failedStep, finished.cause, finished.residuals)
    })
  )
})

export const applyEventMeetingRoomUpdate = Effect.fn("CalendarMeeting.EventSaga.applyRoomsOnly")(function* (
  client: HulyClient["Service"],
  plan: EventMeetingRoomUpdatePlan
): Effect.fn.Return<void, EventMeetingMutationError> {
  yield* executeEventMeetingMutation(client, { plan, update: {}, inverse: {} })
})
