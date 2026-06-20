import { Schema } from "effect"

import { CalendarSummarySchema, EventSchema, EventSummarySchema } from "./calendar.js"
import { EventId } from "./shared.js"

export const CreateEventResultSchema = Schema.Struct({
  eventId: EventId
})
export type CreateEventResult = Schema.Schema.Type<typeof CreateEventResultSchema>

export const UpdateEventResultSchema = Schema.Struct({
  eventId: EventId,
  updated: Schema.Boolean
})
export type UpdateEventResult = Schema.Schema.Type<typeof UpdateEventResultSchema>

export const DeleteEventResultSchema = Schema.Struct({
  eventId: EventId,
  deleted: Schema.Boolean
})
export type DeleteEventResult = Schema.Schema.Type<typeof DeleteEventResultSchema>

export const ListEventsResultSchema = Schema.Array(EventSummarySchema)
export const ListCalendarsResultSchema = Schema.Array(CalendarSummarySchema)
export const GetEventResultSchema = EventSchema
