import {
  createRecurringEventParamsJsonSchema,
  listEventInstancesParamsJsonSchema,
  listRecurringEventsParamsJsonSchema,
  parseCreateRecurringEventParams,
  parseListEventInstancesParams,
  parseListRecurringEventsParams
} from "../../domain/schemas/calendar-recurring.js"
import {
  createScheduleParamsJsonSchema,
  deleteScheduleParamsJsonSchema,
  getScheduleParamsJsonSchema,
  listSchedulesParamsJsonSchema,
  parseCreateScheduleParams,
  parseDeleteScheduleParams,
  parseGetScheduleParams,
  parseListSchedulesParams,
  parseUpdateScheduleParams,
  updateScheduleParamsJsonSchema
} from "../../domain/schemas/calendar-schedules.js"
import {
  createEventParamsJsonSchema,
  deleteEventParamsJsonSchema,
  getEventParamsJsonSchema,
  listCalendarsParamsJsonSchema,
  listEventsParamsJsonSchema,
  parseCreateEventParams,
  parseDeleteEventParams,
  parseGetEventParams,
  parseListCalendarsParams,
  parseListEventsParams,
  parseUpdateEventParams,
  updateEventParamsJsonSchema
} from "../../domain/schemas/calendar.js"
import {
  createEvent,
  createRecurringEvent,
  createSchedule,
  deleteEvent,
  deleteSchedule,
  getEvent,
  getSchedule,
  listCalendars,
  listEventInstances,
  listEvents,
  listRecurringEvents,
  listSchedules,
  updateEvent,
  updateSchedule
} from "../../huly/operations/calendar.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "calendar" as const

export const calendarTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_events",
    description: "List calendar events. Returns events sorted by date. Supports filtering by date range.",
    category: CATEGORY,
    inputSchema: listEventsParamsJsonSchema,
    handler: createToolHandler(
      "list_events",
      parseListEventsParams,
      listEvents
    )
  },
  {
    name: "list_calendars",
    description:
      "List writable, non-hidden calendars that can be used as create_event or create_recurring_event targets. Use this before creating events when you need to choose a target calendarId explicitly.",
    category: CATEGORY,
    inputSchema: listCalendarsParamsJsonSchema,
    handler: createToolHandler(
      "list_calendars",
      parseListCalendarsParams,
      listCalendars
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
      "Create a new calendar event. Description supports markdown formatting. Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID.",
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
    name: "list_schedules",
    description:
      "List calendar scheduling links/availability schedules. Optional owner accepts an employee/person ID, exact name, or email.",
    category: CATEGORY,
    inputSchema: listSchedulesParamsJsonSchema,
    handler: createToolHandler(
      "list_schedules",
      parseListSchedulesParams,
      listSchedules
    )
  },
  {
    name: "get_schedule",
    description:
      "Retrieve one calendar schedule including owner, availability, calendar target, time zone, and room information when it is a meeting schedule.",
    category: CATEGORY,
    inputSchema: getScheduleParamsJsonSchema,
    handler: createToolHandler(
      "get_schedule",
      parseGetScheduleParams,
      getSchedule
    )
  },
  {
    name: "create_schedule",
    description:
      "Create a calendar schedule. Owner accepts an employee/person ID, exact name, or email; calendar can be targeted by calendarId or calendarName.",
    category: CATEGORY,
    inputSchema: createScheduleParamsJsonSchema,
    handler: createToolHandler(
      "create_schedule",
      parseCreateScheduleParams,
      createSchedule
    )
  },
  {
    name: "update_schedule",
    description:
      "Update a calendar schedule. Supports owner, title, description, duration, interval, availability, timeZone, and calendar move by calendarId or calendarName.",
    category: CATEGORY,
    inputSchema: updateScheduleParamsJsonSchema,
    handler: createToolHandler(
      "update_schedule",
      parseUpdateScheduleParams,
      updateSchedule
    )
  },
  {
    name: "delete_schedule",
    description: "Delete a calendar schedule by scheduleId.",
    category: CATEGORY,
    inputSchema: deleteScheduleParamsJsonSchema,
    handler: createToolHandler(
      "delete_schedule",
      parseDeleteScheduleParams,
      deleteSchedule
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
      "Create a new recurring calendar event with RFC5545 RRULE rules. Description supports markdown. Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID.",
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
