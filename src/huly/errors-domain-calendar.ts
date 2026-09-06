import { Schema } from "effect"

import {
  CalendarNotAccessibleError,
  CalendarSettingsIdentifierAmbiguousError,
  CalendarSettingsInternalCalendarHideError,
  CalendarSettingsTargetNotAccessibleError,
  CalendarSettingsTargetNotWritableError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ScheduleNotFoundError
} from "./errors-calendar.js"
import { CalendarMeetingDomainError } from "./errors-domain-calendar-meetings.js"

export const CalendarDomainError = Schema.Union([
  CalendarNotAccessibleError,
  CalendarSettingsIdentifierAmbiguousError,
  CalendarSettingsInternalCalendarHideError,
  CalendarSettingsTargetNotAccessibleError,
  CalendarSettingsTargetNotWritableError,
  CalendarMeetingDomainError,
  EventNotFoundError,
  RecurringEventNotFoundError,
  ScheduleNotFoundError
])
export type CalendarDomainError = Schema.Schema.Type<typeof CalendarDomainError>
