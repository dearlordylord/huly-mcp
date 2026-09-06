import { Schema } from "effect"

import {
  CalendarMeetingTargetNotWritableError,
  EventMeetingMixinMissingError,
  EventSiblingConvergenceError,
  MeetingCompositionMutationError,
  MeetingRoomAssignmentUnsupportedError,
  MeetingRoomIdentifierAmbiguousError,
  MeetingRoomNotFoundError,
  ScheduleMeetingMixinMissingError
} from "./errors-calendar-meetings.js"

export const CalendarMeetingDomainError = Schema.Union([
  MeetingRoomNotFoundError,
  MeetingRoomIdentifierAmbiguousError,
  MeetingRoomAssignmentUnsupportedError,
  CalendarMeetingTargetNotWritableError,
  EventMeetingMixinMissingError,
  EventSiblingConvergenceError,
  ScheduleMeetingMixinMissingError,
  MeetingCompositionMutationError
])
export type CalendarMeetingDomainError = Schema.Schema.Type<typeof CalendarMeetingDomainError>
