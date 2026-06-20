import {
  createRecurringEventParamsJsonSchema,
  CreateRecurringEventResultSchema,
  listEventInstancesParamsJsonSchema,
  ListEventInstancesResultSchema,
  listRecurringEventsParamsJsonSchema,
  ListRecurringEventsResultSchema,
  parseCreateRecurringEventParams,
  parseListEventInstancesParams,
  parseListRecurringEventsParams
} from "../../domain/schemas/calendar-recurring.js"
import {
  CreateEventResultSchema,
  DeleteEventResultSchema,
  GetEventResultSchema,
  ListCalendarsResultSchema,
  ListEventsResultSchema,
  UpdateEventResultSchema
} from "../../domain/schemas/calendar-results.js"
import {
  createScheduleParamsJsonSchema,
  CreateScheduleResultSchema,
  deleteScheduleParamsJsonSchema,
  DeleteScheduleResultSchema,
  getScheduleParamsJsonSchema,
  GetScheduleResultSchema,
  listSchedulesParamsJsonSchema,
  ListSchedulesResultSchema,
  parseCreateScheduleParams,
  parseDeleteScheduleParams,
  parseGetScheduleParams,
  parseListSchedulesParams,
  parseUpdateScheduleParams,
  updateScheduleParamsJsonSchema,
  UpdateScheduleResultSchema
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
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "calendar" as const

export const calendarTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_events",
      description: "List calendar events. Returns events sorted by date. Supports filtering by date range.",
      category: CATEGORY,
      inputSchema: listEventsParamsJsonSchema,
      resultSchema: ListEventsResultSchema
    },
    parseListEventsParams,
    listEvents
  ),
  defineTool(
    {
      name: "list_calendars",
      description:
        "List writable, non-hidden calendars that can be used as create_event or create_recurring_event targets. Use this before creating events when you need to choose a target calendarId explicitly.",
      category: CATEGORY,
      inputSchema: listCalendarsParamsJsonSchema,
      resultSchema: ListCalendarsResultSchema
    },
    parseListCalendarsParams,
    listCalendars
  ),
  defineTool(
    {
      name: "get_event",
      description:
        "Retrieve full details for a calendar event including description. Use this to view event content and metadata.",
      category: CATEGORY,
      inputSchema: getEventParamsJsonSchema,
      resultSchema: GetEventResultSchema
    },
    parseGetEventParams,
    getEvent
  ),
  defineTool(
    {
      name: "create_event",
      description:
        "Create a new calendar event. Description supports markdown formatting. Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID.",
      category: CATEGORY,
      inputSchema: createEventParamsJsonSchema,
      resultSchema: CreateEventResultSchema
    },
    parseCreateEventParams,
    createEvent
  ),
  defineTool(
    {
      name: "update_event",
      description:
        "Update fields on an existing calendar event. Only provided fields are modified. Description updates support markdown.",
      category: CATEGORY,
      inputSchema: updateEventParamsJsonSchema,
      resultSchema: UpdateEventResultSchema
    },
    parseUpdateEventParams,
    updateEvent
  ),
  defineTool(
    {
      name: "delete_event",
      description: "Permanently delete a calendar event. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteEventParamsJsonSchema,
      resultSchema: DeleteEventResultSchema
    },
    parseDeleteEventParams,
    deleteEvent
  ),
  defineTool(
    {
      name: "list_schedules",
      description:
        "List calendar scheduling links/availability schedules. Optional owner accepts an employee/person ID, exact name, or email.",
      category: CATEGORY,
      inputSchema: listSchedulesParamsJsonSchema,
      resultSchema: ListSchedulesResultSchema
    },
    parseListSchedulesParams,
    listSchedules
  ),
  defineTool(
    {
      name: "get_schedule",
      description:
        "Retrieve one calendar schedule including owner, availability, calendar target, time zone, and room information when it is a meeting schedule.",
      category: CATEGORY,
      inputSchema: getScheduleParamsJsonSchema,
      resultSchema: GetScheduleResultSchema
    },
    parseGetScheduleParams,
    getSchedule
  ),
  defineTool(
    {
      name: "create_schedule",
      description:
        "Create a calendar schedule. Owner accepts an employee/person ID, exact name, or email; calendar can be targeted by calendarId or calendarName.",
      category: CATEGORY,
      inputSchema: createScheduleParamsJsonSchema,
      resultSchema: CreateScheduleResultSchema
    },
    parseCreateScheduleParams,
    createSchedule
  ),
  defineTool(
    {
      name: "update_schedule",
      description:
        "Update a calendar schedule. Supports owner, title, description, duration, interval, availability, timeZone, and calendar move by calendarId or calendarName.",
      category: CATEGORY,
      inputSchema: updateScheduleParamsJsonSchema,
      resultSchema: UpdateScheduleResultSchema
    },
    parseUpdateScheduleParams,
    updateSchedule
  ),
  defineTool(
    {
      name: "delete_schedule",
      description: "Delete a calendar schedule by scheduleId.",
      category: CATEGORY,
      inputSchema: deleteScheduleParamsJsonSchema,
      resultSchema: DeleteScheduleResultSchema
    },
    parseDeleteScheduleParams,
    deleteSchedule
  ),
  defineTool(
    {
      name: "list_recurring_events",
      description:
        "List recurring event definitions. Returns recurring events sorted by modification date (newest first).",
      category: CATEGORY,
      inputSchema: listRecurringEventsParamsJsonSchema,
      resultSchema: ListRecurringEventsResultSchema
    },
    parseListRecurringEventsParams,
    listRecurringEvents
  ),
  defineTool(
    {
      name: "create_recurring_event",
      description:
        "Create a new recurring calendar event with RFC5545 RRULE rules. Description supports markdown. Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID.",
      category: CATEGORY,
      inputSchema: createRecurringEventParamsJsonSchema,
      resultSchema: CreateRecurringEventResultSchema
    },
    parseCreateRecurringEventParams,
    createRecurringEvent
  ),
  defineTool(
    {
      name: "list_event_instances",
      description:
        "List instances of a recurring event. Returns instances sorted by date. Supports filtering by date range. Use includeParticipants=true to fetch full participant info (extra lookups).",
      category: CATEGORY,
      inputSchema: listEventInstancesParamsJsonSchema,
      resultSchema: ListEventInstancesResultSchema
    },
    parseListEventInstancesParams,
    listEventInstances
  )
]
