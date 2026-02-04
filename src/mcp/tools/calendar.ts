import {
  createEventParamsJsonSchema,
  createRecurringEventParamsJsonSchema,
  deleteEventParamsJsonSchema,
  getEventParamsJsonSchema,
  listEventInstancesParamsJsonSchema,
  listEventsParamsJsonSchema,
  listRecurringEventsParamsJsonSchema,
  parseCreateEventParams,
  parseCreateRecurringEventParams,
  parseDeleteEventParams,
  parseGetEventParams,
  parseListEventInstancesParams,
  parseListEventsParams,
  parseListRecurringEventsParams,
  parseUpdateEventParams,
  updateEventParamsJsonSchema
} from "../../domain/schemas/calendar.js"
import {
  createEvent,
  createRecurringEvent,
  deleteEvent,
  getEvent,
  listEventInstances,
  listEvents,
  listRecurringEvents,
  updateEvent
} from "../../huly/operations/calendar.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Calendar" as const

export const calendarTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_events",
    description:
      "List calendar events. Returns events sorted by date. Supports filtering by date range.",
    category: CATEGORY,
    inputSchema: listEventsParamsJsonSchema,
    handler: createToolHandler(
      "list_events",
      parseListEventsParams,
      listEvents
    )
  },
  {
    name: "get_event",
    description:
      "Retrieve full details for a calendar event including description. Use this to view event content and metadata.",
    category: CATEGORY,
    inputSchema: getEventParamsJsonSchema,
    handler: createToolHandler(
      "get_event",
      parseGetEventParams,
      getEvent
    )
  },
  {
    name: "create_event",
    description:
      "Create a new calendar event. Description supports markdown formatting. Returns the created event ID.",
    category: CATEGORY,
    inputSchema: createEventParamsJsonSchema,
    handler: createToolHandler(
      "create_event",
      parseCreateEventParams,
      createEvent
    )
  },
  {
    name: "update_event",
    description:
      "Update fields on an existing calendar event. Only provided fields are modified. Description updates support markdown.",
    category: CATEGORY,
    inputSchema: updateEventParamsJsonSchema,
    handler: createToolHandler(
      "update_event",
      parseUpdateEventParams,
      updateEvent
    )
  },
  {
    name: "delete_event",
    description: "Permanently delete a calendar event. This action cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteEventParamsJsonSchema,
    handler: createToolHandler(
      "delete_event",
      parseDeleteEventParams,
      deleteEvent
    )
  },
  {
    name: "list_recurring_events",
    description:
      "List recurring event definitions. Returns recurring events sorted by modification date (newest first).",
    category: CATEGORY,
    inputSchema: listRecurringEventsParamsJsonSchema,
    handler: createToolHandler(
      "list_recurring_events",
      parseListRecurringEventsParams,
      listRecurringEvents
    )
  },
  {
    name: "create_recurring_event",
    description:
      "Create a new recurring calendar event with RFC5545 RRULE rules. Description supports markdown. Returns the created event ID.",
    category: CATEGORY,
    inputSchema: createRecurringEventParamsJsonSchema,
    handler: createToolHandler(
      "create_recurring_event",
      parseCreateRecurringEventParams,
      createRecurringEvent
    )
  },
  {
    name: "list_event_instances",
    description:
      "List instances of a recurring event. Returns instances sorted by date. Supports filtering by date range. Use includeParticipants=true to fetch full participant info (extra lookups).",
    category: CATEGORY,
    inputSchema: listEventInstancesParamsJsonSchema,
    handler: createToolHandler(
      "list_event_instances",
      parseListEventInstancesParams,
      listEventInstances
    )
  }
]
