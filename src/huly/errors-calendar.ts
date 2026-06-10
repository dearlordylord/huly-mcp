/**
 * Calendar domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { EventId, NonEmptyString, ScheduleId } from "../domain/schemas/shared.js"

/**
 * Calendar event not found.
 */
export class EventNotFoundError extends Schema.TaggedError<EventNotFoundError>()(
  "EventNotFoundError",
  {
    eventId: EventId
  }
) {
  override get message(): string {
    return `Event '${this.eventId}' not found`
  }
}

/**
 * Recurring calendar event not found.
 */
export class RecurringEventNotFoundError extends Schema.TaggedError<RecurringEventNotFoundError>()(
  "RecurringEventNotFoundError",
  {
    eventId: EventId
  }
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
  {
    calendarId: NonEmptyString
  }
) {
  override get message(): string {
    return `Calendar '${this.calendarId}' not found or not accessible`
  }
}

/**
 * Calendar schedule not found.
 */
export class ScheduleNotFoundError extends Schema.TaggedError<ScheduleNotFoundError>()(
  "ScheduleNotFoundError",
  {
    scheduleId: ScheduleId
  }
) {
  override get message(): string {
    return `Schedule '${this.scheduleId}' not found`
  }
}
