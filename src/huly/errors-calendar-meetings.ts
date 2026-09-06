import { Schema } from "effect"

import {
  MeetingCompositionFailedStepSchema,
  MeetingCompositionRecoverySchema,
  MeetingRoomLocatorSchema
} from "../domain/schemas/calendar-meeting-rooms.js"
import type {
  MeetingCompositionFailedStep,
  MeetingCompositionOperation,
  MeetingCompositionTarget
} from "../domain/schemas/calendar-meeting-rooms.js"
import { Count, DocId, EventId, NonEmptyString, RoomId, ScheduleId } from "../domain/schemas/shared.js"
import { HulyConnectionDiagnostic } from "./errors-base.js"

export class MeetingRoomNotFoundError extends Schema.TaggedError<MeetingRoomNotFoundError>()(
  "MeetingRoomNotFoundError",
  { locator: MeetingRoomLocatorSchema }
) {
  override get message(): string {
    const floor = this.locator.floor === undefined ? "" : ` on floor '${this.locator.floor}'`
    return `Meeting room '${this.locator.room}'${floor} was not found or is not readable`
  }
}

export class MeetingRoomIdentifierAmbiguousError extends Schema.TaggedError<MeetingRoomIdentifierAmbiguousError>()(
  "MeetingRoomIdentifierAmbiguousError",
  { field: Schema.Literals(["room", "floor"]), identifier: NonEmptyString, matches: Count }
) {
  override get message(): string {
    return `Meeting-room ${this.field} identifier '${this.identifier}' matched ${this.matches} records; use an exact ID${this.field === "room" ? " or add a floor qualifier" : ""}`
  }
}

export class MeetingRoomAssignmentUnsupportedError extends Schema.TaggedError<MeetingRoomAssignmentUnsupportedError>()(
  "MeetingRoomAssignmentUnsupportedError",
  { roomId: RoomId, reason: Schema.Literals(["reception", "office-not-owned-by-caller"]) }
) {
  override get message(): string {
    return this.reason === "reception"
      ? `Room '${this.roomId}' is Reception and cannot be assigned as a meeting room`
      : `Room '${this.roomId}' is a personal office not assigned to the authenticated caller`
  }
}

const CalendarMeetingWritableTargetFailureSchema = Schema.TaggedUnion({
  Event: {
    targetId: DocId,
    reason: Schema.Literals(["caller-owned-writable-event-not-found", "prospective-event-not-writable"])
  },
  Schedule: { targetId: DocId, reason: Schema.Literal("schedule-owned-by-another-employee") }
})
type CalendarMeetingWritableTargetFailure = typeof CalendarMeetingWritableTargetFailureSchema.Type

export class CalendarMeetingTargetNotWritableError extends Schema.TaggedError<CalendarMeetingTargetNotWritableError>()(
  "CalendarMeetingTargetNotWritableError",
  { failure: CalendarMeetingWritableTargetFailureSchema }
) {
  get target(): MeetingCompositionTarget {
    return this.failure._tag === "Event" ? "event" : "schedule"
  }

  get targetId(): CalendarMeetingWritableTargetFailure["targetId"] {
    return this.failure.targetId
  }

  get reason(): CalendarMeetingWritableTargetFailure["reason"] {
    return this.failure.reason
  }

  override get message(): string {
    if (this.failure._tag === "Schedule") {
      return `Schedule '${this.failure.targetId}' is owned by another employee and cannot be composed with a meeting room`
    }
    return this.failure.reason === "prospective-event-not-writable"
      ? `New Event '${this.failure.targetId}' must use Writer or Owner access to be composed with a meeting room`
      : `Event '${this.failure.targetId}' has no caller-owned Event sibling with Writer or Owner access`
  }
}

export class EventMeetingMixinMissingError extends Schema.TaggedError<EventMeetingMixinMissingError>()(
  "EventMeetingMixinMissingError",
  { eventId: EventId, eventDocumentIds: Schema.Array(DocId) }
) {
  override get message(): string {
    return `Event '${this.eventId}' is not a complete meeting: ${this.eventDocumentIds.length} sibling(s) lack the Meeting assignment`
  }
}

export class ScheduleMeetingMixinMissingError extends Schema.TaggedError<ScheduleMeetingMixinMissingError>()(
  "ScheduleMeetingMixinMissingError",
  { scheduleId: ScheduleId }
) {
  override get message(): string {
    return `Schedule '${this.scheduleId}' is not a MeetingSchedule and its room cannot be changed`
  }
}

export class EventSiblingConvergenceError extends Schema.TaggedError<EventSiblingConvergenceError>()(
  "EventSiblingConvergenceError",
  { eventId: EventId, reads: Count }
) {
  override get message(): string {
    return `Event '${this.eventId}' sibling membership did not converge after ${this.reads} bounded reads`
  }
}

export const MeetingCompositionOriginDiagnosticSchema = Schema.TaggedUnion({
  HulyConnection: { diagnostic: HulyConnectionDiagnostic },
  TypedFailure: { errorTag: NonEmptyString },
  Defect: {},
  Interruption: {},
  UnknownFailure: {}
})
export type MeetingCompositionOriginDiagnostic = typeof MeetingCompositionOriginDiagnosticSchema.Type

const FAILED_STEP_LABELS: Record<MeetingCompositionFailedStep["_tag"], string> = {
  CreateEventDescription: "uploading Event description markup",
  CreateEventBase: "creating base Calendar Event",
  CreateEventOwnerMeeting: "creating owner Meeting mixin",
  CreateEventSiblingMeetings: "reconciling created Event Meeting siblings",
  CreateScheduleBase: "creating base Calendar Schedule",
  CreateScheduleMeeting: "creating MeetingSchedule mixin",
  UpdateEventRoom: "updating Meeting room assignment",
  UpdateEventBase: "updating base Calendar Event",
  UpdateEventSiblings: "reconciling recurring Event siblings",
  UpdateEventMarkup: "updating Event description markup",
  UpdateScheduleRoom: "updating MeetingSchedule room",
  UpdateScheduleBase: "updating base Calendar Schedule"
}

export class MeetingCompositionMutationError extends Schema.TaggedError<MeetingCompositionMutationError>()(
  "MeetingCompositionMutationError",
  {
    failedStep: MeetingCompositionFailedStepSchema,
    diagnostics: Schema.NonEmptyArray(MeetingCompositionOriginDiagnosticSchema),
    recovery: MeetingCompositionRecoverySchema
  }
) {
  get operation(): MeetingCompositionOperation {
    return this.failedStep.operation
  }

  override get message(): string {
    const failedStep = FAILED_STEP_LABELS[this.failedStep._tag]
    return this.recovery._tag === "Recovered"
      ? `${this.operation} failed during ${failedStep}; every attempted mutation was compensated`
      : `${this.operation} failed during ${failedStep}; recovery is unconfirmed for ${this.recovery.residuals.length} state item(s). Inspect the residuals before retrying.`
  }
}
