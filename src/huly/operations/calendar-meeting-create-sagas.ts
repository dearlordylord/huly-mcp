import type { MarkupFormat } from "@hcengineering/api-client"
import { AccessLevel, type Event as HulyEvent, type Schedule as HulySchedule } from "@hcengineering/calendar"
import type { Ref, Space } from "@hcengineering/core"
import type { Meeting as HulyMeeting, MeetingSchedule as HulyMeetingSchedule, Room } from "@hcengineering/love"
import { Effect, Exit } from "effect"

import type {
  MeetingCompositionFailedStep,
  MeetingCompositionResidual
} from "../../domain/schemas/calendar-meeting-rooms.js"
import { DocId, type EventId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { EventSiblingConvergenceError, MeetingCompositionMutationError } from "../errors.js"
import { calendar, love } from "../huly-plugins.js"
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
import { emptyEventDescription, markupRefAsDescription } from "./calendar-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type CreateMeetingCompositionError = MeetingCompositionMutationError
export type CreateEventMeetingCompositionError = MeetingCompositionMutationError

interface PendingEventDescription {
  readonly markup: string
  readonly format: MarkupFormat
}

export interface CreateEventMeetingComposition {
  readonly eventDocumentId: Ref<HulyEvent>
  readonly eventId: EventId
  readonly space: Ref<Space>
  readonly room: Ref<Room>
  readonly description?: PendingEventDescription | undefined
  readonly createBase: (description: HulyEvent["description"]) => Effect.Effect<Ref<HulyEvent>, HulyClientError>
}

export interface CreateScheduleMeetingComposition {
  readonly scheduleId: Ref<HulySchedule>
  readonly space: Ref<Space>
  readonly room: Ref<Room>
  readonly createBase: () => Effect.Effect<Ref<HulySchedule>, HulyClientError>
}

type CreateEventFailedStep = Extract<MeetingCompositionFailedStep, { readonly operation: "create_event" }>
type CreateScheduleFailedStep = Extract<MeetingCompositionFailedStep, { readonly operation: "create_schedule" }>

interface CreateEventExecution {
  failedStep: CreateEventFailedStep
  baseWasAttempted: boolean
  markupWasAttempted: boolean
}

interface CreateScheduleExecution {
  failedStep: CreateScheduleFailedStep
  baseWasAttempted: boolean
}

type CreatedEventRecord = Pick<HulyEvent, "_id" | "space"> & Partial<Pick<HulyEvent, "access">>

const recordResidual = (
  target: "event" | "schedule",
  id: Ref<HulyEvent> | Ref<HulySchedule>
): MeetingCompositionResidual => ({ _tag: "RecordPresence", target, documentId: DocId.make(id), expected: "absent" })

const createdEventDiscoveryResidual = (eventId: EventId): MeetingCompositionResidual => ({
  _tag: "SiblingSet",
  target: "event",
  eventId
})

const eventMarkupResidual = (mutation: CreateEventMeetingComposition): MeetingCompositionResidual => ({
  _tag: "Markup",
  target: "event",
  documentId: DocId.make(mutation.eventDocumentId),
  risk: "uploaded-markup-may-be-orphaned"
})

const removeEvent = Effect.fn("CalendarMeeting.CreateSaga.removeEvent")(function* (
  client: HulyClient["Service"],
  event: CreatedEventRecord
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  return yield* captureCompensation(
    () => client.removeDoc(calendar.class.Event, event.space, event._id),
    [recordResidual("event", event._id)]
  )
})

const cleanupCreatedEvents = Effect.fn("CalendarMeeting.CreateSaga.cleanupEvents")(function* (
  client: HulyClient["Service"],
  mutation: CreateEventMeetingComposition
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  const read = yield* Effect.exit(
    readStableEventSiblings(client, mutation.eventId, [DocId.make(mutation.eventDocumentId)])
  )
  const events: Array<CreatedEventRecord> = Exit.isSuccess(read) ? [...read.value] : []
  if (!events.some((event) => String(event._id) === String(mutation.eventDocumentId))) {
    events.push({ _id: mutation.eventDocumentId, space: mutation.space })
  }
  const ordered = [
    ...events.filter((event) => event.access !== AccessLevel.Owner),
    ...events.filter((event) => event.access === AccessLevel.Owner)
  ]
  const discoveryResidual = createdEventDiscoveryResidual(mutation.eventId)
  const issues = Exit.isSuccess(read)
    ? [unconfirmedCompensation([discoveryResidual])]
    : compensationFailure(read, [discoveryResidual])
  for (const event of ordered) {
    issues.push(...(yield* removeEvent(client, event)))
  }
  return issues
})

const reconcileCreatedEventMeetings = Effect.fn("CalendarMeeting.CreateSaga.reconcileEventMeetings")(function* (
  client: HulyClient["Service"],
  eventId: EventId,
  createdEventId: Ref<HulyEvent>,
  room: Ref<Room>
) {
  const events = yield* readStableEventSiblings(client, eventId, [DocId.make(createdEventId)])
  const meetings = yield* client.findAll<HulyMeeting>(
    love.mixin.Meeting,
    hulyQuery<HulyMeeting>({ _id: { $in: events.map((event) => toRef<HulyMeeting>(event._id)) } })
  )
  const meetingIds = new Set(meetings.map((meeting) => String(meeting._id)))
  for (const event of events) {
    if (!meetingIds.has(String(event._id))) {
      yield* client.createMixin<HulyEvent, HulyMeeting>(event._id, event._class, event.space, love.mixin.Meeting, {
        room
      })
    }
  }
})

const createEventForward = Effect.fn("CalendarMeeting.CreateSaga.eventForward")(function* (
  client: HulyClient["Service"],
  mutation: CreateEventMeetingComposition,
  execution: CreateEventExecution
): Effect.fn.Return<Ref<HulyEvent>, HulyClientError | EventSiblingConvergenceError> {
  const pendingDescription = mutation.description
  const description =
    pendingDescription === undefined
      ? emptyEventDescription
      : yield* Effect.gen(function* () {
          execution.failedStep = { _tag: "CreateEventDescription", operation: "create_event" }
          execution.markupWasAttempted = true
          const ref = yield* client.uploadMarkup(
            calendar.class.Event,
            mutation.eventDocumentId,
            "description",
            pendingDescription.markup,
            pendingDescription.format
          )
          return markupRefAsDescription(ref)
        })
  execution.failedStep = { _tag: "CreateEventBase", operation: "create_event" }
  execution.baseWasAttempted = true
  const created = yield* mutation.createBase(description)
  execution.failedStep = { _tag: "CreateEventOwnerMeeting", operation: "create_event" }
  yield* client.createMixin<HulyEvent, HulyMeeting>(created, calendar.class.Event, mutation.space, love.mixin.Meeting, {
    room: mutation.room
  })
  execution.failedStep = { _tag: "CreateEventSiblingMeetings", operation: "create_event" }
  yield* reconcileCreatedEventMeetings(client, mutation.eventId, created, mutation.room)
  return created
})

const recoverCreatedEvent = Effect.fn("CalendarMeeting.CreateSaga.recoverEvent")(function* (
  client: HulyClient["Service"],
  mutation: CreateEventMeetingComposition,
  execution: CreateEventExecution
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  // createEvent generates both IDs exclusively for this request. The base-attempt
  // gate is therefore the causal boundary for removing rows in that new group.
  const records = execution.baseWasAttempted ? yield* cleanupCreatedEvents(client, mutation) : []
  if (!execution.markupWasAttempted) return records
  return [unconfirmedCompensation([eventMarkupResidual(mutation)]), ...records]
})

const eventRecoveryResiduals = (
  mutation: CreateEventMeetingComposition,
  execution: CreateEventExecution
): readonly [MeetingCompositionResidual, ...Array<MeetingCompositionResidual>] => [
  createdEventDiscoveryResidual(mutation.eventId),
  recordResidual("event", mutation.eventDocumentId),
  ...(execution.markupWasAttempted ? [eventMarkupResidual(mutation)] : [])
]

export const createEventMeetingComposition = Effect.fn("CalendarMeeting.CreateSaga.createEvent")(function* (
  client: HulyClient["Service"],
  mutation: CreateEventMeetingComposition
): Effect.fn.Return<Ref<HulyEvent>, CreateEventMeetingCompositionError> {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const execution: CreateEventExecution = {
        failedStep: { _tag: "CreateEventBase", operation: "create_event" },
        baseWasAttempted: false,
        markupWasAttempted: false
      }
      const outcome = yield* Effect.exit(restore(createEventForward(client, mutation, execution)))
      if (Exit.isSuccess(outcome)) return outcome.value
      const issues = yield* captureCompensationProgram(
        () => recoverCreatedEvent(client, mutation, execution),
        eventRecoveryResiduals(mutation, execution)
      )
      const finished = finishMeetingCompensation(outcome.cause, issues)
      return yield* failMeetingComposition(execution.failedStep, finished.cause, finished.residuals)
    })
  )
})

const createScheduleForward = Effect.fn("CalendarMeeting.CreateSaga.scheduleForward")(function* (
  client: HulyClient["Service"],
  mutation: CreateScheduleMeetingComposition,
  execution: CreateScheduleExecution
): Effect.fn.Return<Ref<HulySchedule>, HulyClientError> {
  execution.failedStep = { _tag: "CreateScheduleBase", operation: "create_schedule" }
  execution.baseWasAttempted = true
  const created = yield* mutation.createBase()
  execution.failedStep = { _tag: "CreateScheduleMeeting", operation: "create_schedule" }
  yield* client.createMixin<HulySchedule, HulyMeetingSchedule>(
    created,
    calendar.class.Schedule,
    mutation.space,
    love.mixin.MeetingSchedule,
    { room: mutation.room }
  )
  return created
})

const removeCreatedSchedule = Effect.fn("CalendarMeeting.CreateSaga.removeSchedule")(function* (
  client: HulyClient["Service"],
  mutation: CreateScheduleMeetingComposition,
  baseWasAttempted: boolean
): Effect.fn.Return<Array<MeetingCompositionCompensationIssue>> {
  if (!baseWasAttempted) return []
  return yield* captureCompensation(
    () => client.removeDoc(calendar.class.Schedule, mutation.space, mutation.scheduleId),
    [recordResidual("schedule", mutation.scheduleId)]
  )
})

export const createScheduleMeetingComposition = Effect.fn("CalendarMeeting.CreateSaga.createSchedule")(function* (
  client: HulyClient["Service"],
  mutation: CreateScheduleMeetingComposition
): Effect.fn.Return<Ref<HulySchedule>, CreateMeetingCompositionError> {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const execution: CreateScheduleExecution = {
        failedStep: { _tag: "CreateScheduleBase", operation: "create_schedule" },
        baseWasAttempted: false
      }
      const outcome = yield* Effect.exit(restore(createScheduleForward(client, mutation, execution)))
      if (Exit.isSuccess(outcome)) return outcome.value
      const issues = yield* captureCompensationProgram(
        () => removeCreatedSchedule(client, mutation, execution.baseWasAttempted),
        [recordResidual("schedule", mutation.scheduleId)]
      )
      const finished = finishMeetingCompensation(outcome.cause, issues)
      return yield* failMeetingComposition(execution.failedStep, finished.cause, finished.residuals)
    })
  )
})
