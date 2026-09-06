import { Schema } from "effect"

import { CalendarSummarySchema, EventSchema, EventSummarySchema } from "./calendar.js"
import { CalendarSettingsSummarySchema } from "./calendar-settings.js"
import { CalendarId, EventId } from "./shared.js"

export const CreateEventResultSchema = Schema.Struct({ eventId: EventId })
export type CreateEventResult = Schema.Schema.Type<typeof CreateEventResultSchema>

export const UpdateEventResultSchema = Schema.Struct({ eventId: EventId, updated: Schema.Boolean })
export type UpdateEventResult = Schema.Schema.Type<typeof UpdateEventResultSchema>

export const DeleteEventResultSchema = Schema.Struct({ eventId: EventId, deleted: Schema.Boolean })
export type DeleteEventResult = Schema.Schema.Type<typeof DeleteEventResultSchema>

export const ListEventsResultSchema = Schema.Array(EventSummarySchema)
export const ListCalendarsResultSchema = Schema.Array(CalendarSummarySchema)
export const ListCalendarSettingsResultSchema = Schema.Array(CalendarSettingsSummarySchema)
const SetPrimaryCalendarCreatedResultSchema = Schema.Struct({
  calendarId: CalendarId,
  action: Schema.Literal("created"),
  created: Schema.Literal(true),
  updated: Schema.Literal(false)
})
const SetPrimaryCalendarUpdatedResultSchema = Schema.Struct({
  calendarId: CalendarId,
  action: Schema.Literal("updated"),
  created: Schema.Literal(false),
  updated: Schema.Literal(true)
})
const SetPrimaryCalendarUnchangedResultSchema = Schema.Struct({
  calendarId: CalendarId,
  action: Schema.Literal("unchanged"),
  created: Schema.Literal(false),
  updated: Schema.Literal(false)
})
export const SetPrimaryCalendarResultSchema = Schema.Union([
  SetPrimaryCalendarCreatedResultSchema,
  SetPrimaryCalendarUpdatedResultSchema,
  SetPrimaryCalendarUnchangedResultSchema
])
export const UpdateCalendarSettingsResultSchema = Schema.Struct({
  calendarId: CalendarId,
  updated: Schema.Literal(true)
})
export const GetEventResultSchema = EventSchema

export type ListCalendarSettingsResult = Schema.Schema.Type<typeof ListCalendarSettingsResultSchema>
export type SetPrimaryCalendarResult = Schema.Schema.Type<typeof SetPrimaryCalendarResultSchema>
export type UpdateCalendarSettingsResult = Schema.Schema.Type<typeof UpdateCalendarSettingsResultSchema>
