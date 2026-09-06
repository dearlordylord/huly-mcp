/**
 * Calendar domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { CalendarSettingsTargetSchema } from "../domain/schemas/calendar-settings.js"
import { CalendarId, Count, EventId, NonEmptyString, ScheduleId } from "../domain/schemas/shared.js"

/**
 * Calendar event not found.
 */
export class EventNotFoundError extends Schema.TaggedError<EventNotFoundError>()("EventNotFoundError", {
  eventId: EventId
}) {
  override get message(): string {
    return `Event '${this.eventId}' not found`
  }
}

/**
 * Recurring calendar event not found.
 */
export class RecurringEventNotFoundError extends Schema.TaggedError<RecurringEventNotFoundError>()(
  "RecurringEventNotFoundError",
  { eventId: EventId }
) {
  override get message(): string {
    return `Recurring event '${this.eventId}' not found`
  }
}

/**
 * Calendar cannot be used as an event creation target.
 */
export class CalendarNotAccessibleError extends Schema.TaggedError<CalendarNotAccessibleError>()(
  "CalendarNotAccessibleError",
  { calendarId: NonEmptyString }
) {
  override get message(): string {
    return `Calendar '${this.calendarId}' not found or not accessible`
  }
}

/**
 * Calendar settings target is not one of the caller's calendars.
 */
export class CalendarSettingsTargetNotAccessibleError extends Schema.TaggedError<CalendarSettingsTargetNotAccessibleError>()(
  "CalendarSettingsTargetNotAccessibleError",
  { target: CalendarSettingsTargetSchema }
) {
  override get message(): string {
    return "calendarId" in this.target
      ? `Calendar '${this.target.calendarId}' was not found among the caller's calendars`
      : `Calendar named '${this.target.calendarName}' was not found among the caller's calendars`
  }
}

/**
 * Calendar settings identifier matched more than one caller-owned calendar.
 */
export class CalendarSettingsIdentifierAmbiguousError extends Schema.TaggedError<CalendarSettingsIdentifierAmbiguousError>()(
  "CalendarSettingsIdentifierAmbiguousError",
  { calendarName: NonEmptyString, matches: Count }
) {
  get identifier(): NonEmptyString {
    return this.calendarName
  }

  override get message(): string {
    return `Calendar name '${this.calendarName}' matched ${this.matches} caller calendars; use calendarId`
  }
}

/**
 * Calendar settings target cannot be used for a primary or settings mutation.
 */
export class CalendarSettingsTargetNotWritableError extends Schema.TaggedError<CalendarSettingsTargetNotWritableError>()(
  "CalendarSettingsTargetNotWritableError",
  { calendarId: CalendarId, reason: Schema.Literals(["hidden-primary", "insufficient-access"]) }
) {
  override get message(): string {
    return this.reason === "hidden-primary"
      ? `Calendar '${this.calendarId}' is hidden and cannot be selected as the primary calendar`
      : `Calendar '${this.calendarId}' does not grant Writer or Owner access`
  }
}

/**
 * Internal calendars cannot be hidden through the caller settings surface.
 */
export class CalendarSettingsInternalCalendarHideError extends Schema.TaggedError<CalendarSettingsInternalCalendarHideError>()(
  "CalendarSettingsInternalCalendarHideError",
  { calendarId: CalendarId }
) {
  override get message(): string {
    return `Internal calendar '${this.calendarId}' cannot be hidden`
  }
}

/**
 * Calendar schedule not found.
 */
export class ScheduleNotFoundError extends Schema.TaggedError<ScheduleNotFoundError>()("ScheduleNotFoundError", {
  scheduleId: ScheduleId
}) {
  override get message(): string {
    return `Schedule '${this.scheduleId}' not found`
  }
}
