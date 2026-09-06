import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "../../domain/schemas.js"
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
  ListCalendarSettingsResultSchema,
  ListCalendarsResultSchema,
  ListEventsResultSchema,
  SetPrimaryCalendarResultSchema,
  UpdateCalendarSettingsResultSchema,
  UpdateEventResultSchema
} from "../../domain/schemas/calendar-results.js"
import {
  listCalendarSettingsParamsJsonSchema,
  parseListCalendarSettingsParams,
  parseSetPrimaryCalendarParams,
  parseUpdateCalendarSettingsParams,
  setPrimaryCalendarParamsJsonSchema,
  updateCalendarSettingsParamsJsonSchema
} from "../../domain/schemas/calendar-settings.js"
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
  listCalendarSettings,
  listEventInstances,
  listEvents,
  listRecurringEvents,
  listSchedules,
  setPrimaryCalendar,
  updateEvent,
  updateCalendarSettings,
  updateSchedule
} from "../../huly/operations/calendar.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "calendar" as const

export const calendarTools = [
  defineTool(
    {
      name: "list_events",
      description:
        "List calendar events sorted by date, with meetingRoom identity when an Event has the native Meeting composition. Supports filtering by date range.",
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
      name: "list_calendar_settings",
      description:
        "List the authenticated caller's Calendar settings, including caller-owned hidden and read-only calendars. Returns each calendar's stable ID, name, kind, hidden state, visibility, access, and computed primary state. Provider identifiers and defaults are omitted. Use list_calendars for writable, non-hidden event targets.",
      category: CATEGORY,
      inputSchema: listCalendarSettingsParamsJsonSchema,
      resultSchema: ListCalendarSettingsResultSchema
    },
    parseListCalendarSettingsParams,
    listCalendarSettings
  ),
  defineTool(
    {
      name: "set_primary_calendar",
      description:
        "Set the authenticated caller's primary personal calendar by calendarId or an unambiguous exact calendarName. The target must be caller-owned, visible, and Writer or Owner. Creates or updates the single PrimaryCalendar preference and never changes provider defaults.",
      category: CATEGORY,
      inputSchema: setPrimaryCalendarParamsJsonSchema,
      resultSchema: SetPrimaryCalendarResultSchema
    },
    parseSetPrimaryCalendarParams,
    setPrimaryCalendar
  ),
  defineTool(
    {
      name: "update_calendar_settings",
      description:
        "Update local visibility and/or hidden settings on one authenticated caller-owned calendar. Visibility accepts public, freeBusy, or private. Hidden changes are allowed only for ExternalCalendar rows and require Writer or Owner access; internal-calendar hiding and provider-owned fields are rejected.",
      category: CATEGORY,
      inputSchema: updateCalendarSettingsParamsJsonSchema,
      resultSchema: UpdateCalendarSettingsResultSchema
    },
    parseUpdateCalendarSettingsParams,
    updateCalendarSettings
  ),
  defineTool(
    {
      name: "get_event",
      description:
        "Retrieve full details for a calendar event, including description and meetingRoom identity when it has the native Meeting composition.",
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
        "Create a new calendar event. Description supports markdown formatting. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT +
        " Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Optional meetingRoom.room resolves an ID first, then an exact unambiguous name; meetingRoom.floor disambiguates names only. It creates the native Meeting assignment for every eventId sibling without replacing location. Returns the created event ID.",
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
        "Update fields on an existing calendar event. Only provided fields are modified. Description updates support markdown. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT +
        " meetingRoom changes an existing native Meeting only (ordinary Events are rejected), resolves room ID first then exact name with optional floor disambiguation, and updates every eventId sibling without replacing location. Room removal is not supported.",
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
        "Create a calendar schedule. Owner accepts an employee/person ID, exact name, or email; calendar can be targeted by calendarId or calendarName. Optional meetingRoom.room resolves an ID first, then an exact unambiguous name; meetingRoom.floor disambiguates names only and creates the native MeetingSchedule composition. Meeting-room schedules must be owned by the authenticated caller.",
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
        "Update a calendar schedule. Supports owner, title, description, duration, interval, availability, timeZone, and calendar move by calendarId or calendarName. meetingRoom changes an existing caller-owned native MeetingSchedule only, using ID-first then exact-name resolution with optional floor disambiguation; room removal is not supported.",
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
        "Create a new recurring calendar event with RFC5545 RRULE rules. Description supports markdown. " +
        HULY_NATIVE_REFERENCE_MARKDOWN_INPUT +
        " Optional calendarId targets a specific calendar; when omitted, the event uses the authenticated user's primary personal calendar. Returns the created event ID.",
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
] as const satisfies ReadonlyArray<RegisteredTool>
