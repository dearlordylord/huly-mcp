import type { Visibility as HulyVisibility } from "@hcengineering/calendar"
import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import { clearableText } from "./clearable.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { MeetingRoomLocatorSchema } from "./calendar-meeting-rooms.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  CalendarId,
  DEFAULT_LIMIT,
  Email,
  EmptyParamsSchema,
  enumValuesDescription,
  EventId,
  hasAtLeastOneDefined,
  hasMutuallyExclusiveFields,
  LimitParam,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  PersonId,
  PersonName,
  RoomId,
  RoomName,
  Timestamp,
  TimeZoneId,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"
import type { PersonId as PersonIdType } from "./shared.js"

export const CalendarEventTitle = NonEmptyString.pipe(Schema.brand("CalendarEventTitle")).annotate({
  identifier: "CalendarEventTitle",
  title: "CalendarEventTitle",
  description: "Non-empty calendar event title."
})
export type CalendarEventTitle = Schema.Schema.Type<typeof CalendarEventTitle>

export const CalendarName = NonEmptyString.pipe(Schema.brand("CalendarName")).annotate({
  identifier: "CalendarName",
  title: "CalendarName",
  description: "Non-empty calendar name."
})
export type CalendarName = Schema.Schema.Type<typeof CalendarName>

export const VisibilityValues = ["public", "freeBusy", "private"] as const
type VisibilityValue = (typeof VisibilityValues)[number]
type ExactVisibilityValues = [HulyVisibility] extends [VisibilityValue]
  ? [VisibilityValue] extends [HulyVisibility]
    ? true
    : never
  : never
const exactVisibilityValues = <T extends true>(value: T): T => value
exactVisibilityValues<ExactVisibilityValues>(true)

export const VisibilitySchema = Schema.Literals(VisibilityValues).annotate({
  title: "Visibility",
  description: `Event visibility level: ${enumValuesDescription(VisibilityValues)}`
})

export type Visibility = Schema.Schema.Type<typeof VisibilitySchema>

export type WritableCalendarAccess = "writer" | "owner"
export const DEFAULT_EVENT_ALL_DAY = false
export const DEFAULT_EVENT_DURATION_DESCRIPTION = "1 hour"
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_PER_SECOND = 1000
export const DEFAULT_EVENT_DURATION_MS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * MS_PER_SECOND

const CalendarAccessValues = ["freeBusyReader", "reader", "writer", "owner"] as const
export type CalendarAccess = (typeof CalendarAccessValues)[number]

export const CalendarAccessSchema = Schema.Literals(CalendarAccessValues).annotate({
  title: "CalendarAccess",
  description: `Calendar access level: ${enumValuesDescription(CalendarAccessValues)}`
})

const CALENDAR_TARGET_FIELDS = ["calendarId", "calendarName"] as const
const calendarTargetConflictMessage = mutuallyExclusiveFieldsMessage(CALENDAR_TARGET_FIELDS)

const hasCalendarTargetConflict = (params: {
  readonly calendarId?: unknown
  readonly calendarName?: unknown
}): boolean => hasMutuallyExclusiveFields(params, CALENDAR_TARGET_FIELDS)

const countDefinedParticipantLocatorFields = (locator: {
  readonly email?: Email | undefined
  readonly name?: PersonName | undefined
  readonly personId?: PersonIdType | undefined
}): number =>
  (locator.email === undefined ? 0 : 1) +
  (locator.name === undefined ? 0 : 1) +
  (locator.personId === undefined ? 0 : 1)

const EventParticipantLocatorObjectSchema = Schema.Struct({
  email: Schema.optional(Email.annotate({ description: "Participant email address." })),
  name: Schema.optional(PersonName.annotate({ description: "Exact participant display name." })),
  personId: Schema.optional(PersonId.annotate({ description: "Huly Person ID." }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((locator) =>
        countDefinedParticipantLocatorFields(locator) === 1
          ? undefined
          : "Provide exactly one participant locator field: email, name, or personId."
      )
    )
  )
  .annotate({
    title: "EventParticipantLocator",
    description:
      "Participant locator. Use a plain email string, or an object with exactly one of email, exact name, or personId."
  })

export const EventParticipantLocatorSchema = Schema.Union([Email, EventParticipantLocatorObjectSchema]).annotate({
  title: "EventParticipant",
  description: "Participant locator. Plain email strings are accepted for concise calls."
})

export type EventParticipantLocator = Schema.Schema.Type<typeof EventParticipantLocatorSchema>

export const ParticipantSchema = Schema.Struct({
  id: PersonId,
  name: Schema.optional(PersonName),
  email: Schema.optional(Email)
})
export type Participant = Schema.Schema.Type<typeof ParticipantSchema>

export const RoomReferenceSchema = Schema.Struct({ roomId: RoomId, name: Schema.optional(RoomName) })
export type RoomReference = Schema.Schema.Type<typeof RoomReferenceSchema>

const WritableCalendarAccessSchema = Schema.Literals(["writer", "owner"])

export const EventSummarySchema = Schema.Struct({
  eventId: EventId,
  title: CalendarEventTitle,
  date: Timestamp,
  dueDate: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  calendarId: Schema.optional(CalendarId),
  timeZone: Schema.optional(TimeZoneId),
  blockTime: Schema.optional(Schema.Boolean),
  meetingRoom: Schema.optional(RoomReferenceSchema),
  modifiedOn: Schema.optional(Timestamp)
})
export type EventSummary = Schema.Schema.Type<typeof EventSummarySchema>

export const CalendarSummarySchema = Schema.Struct({
  calendarId: CalendarId,
  name: CalendarName,
  hidden: Schema.Boolean,
  visibility: VisibilitySchema,
  user: PersonId,
  access: WritableCalendarAccessSchema,
  isPrimary: Schema.Boolean
})
export type CalendarSummary = Schema.Schema.Type<typeof CalendarSummarySchema>

export const EventSchema = Schema.Struct({
  eventId: EventId,
  title: CalendarEventTitle,
  description: Schema.optional(Schema.String),
  date: Timestamp,
  dueDate: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  visibility: Schema.optional(VisibilitySchema),
  participants: Schema.optional(Schema.Array(ParticipantSchema)),
  externalParticipants: Schema.optional(Schema.Array(Email)),
  reminders: Schema.optional(Schema.Array(Timestamp)),
  access: Schema.optional(CalendarAccessSchema),
  timeZone: Schema.optional(TimeZoneId),
  blockTime: Schema.optional(Schema.Boolean),
  calendarId: Schema.optional(CalendarId),
  meetingRoom: Schema.optional(RoomReferenceSchema),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type Event = Schema.Schema.Type<typeof EventSchema>

// --- Params schemas ---

export const ListEventsParamsSchema = Schema.Struct({
  from: Schema.optional(Timestamp.annotate({ description: "Start date filter (timestamp)" })),
  to: Schema.optional(Timestamp.annotate({ description: "End date filter (timestamp)" })),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of events to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListEventsParams", description: "Parameters for listing events" })

export type ListEventsParams = Schema.Schema.Type<typeof ListEventsParamsSchema>

export const GetEventParamsSchema = Schema.Struct({ eventId: EventId.annotate({ description: "Event ID" }) }).annotate({
  title: "GetEventParams",
  description: "Parameters for getting a single event"
})

export type GetEventParams = Schema.Schema.Type<typeof GetEventParamsSchema>

export const ListCalendarsParamsSchema = EmptyParamsSchema.annotate({
  title: "ListCalendarsParams",
  description: "Parameters for listing writable calendar targets"
})

export type ListCalendarsParams = Schema.Schema.Type<typeof ListCalendarsParamsSchema>

export const CreateEventParamsSchema = Schema.Struct({
  title: CalendarEventTitle.annotate({ description: "Event title" }),
  description: Schema.optional(
    Schema.String.annotate({ description: `Event description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
  ),
  date: Timestamp.annotate({ description: "Start date/time (timestamp)" }),
  dueDate: Schema.optional(
    Timestamp.annotate({
      description: `End date/time (timestamp). If omitted, Huly MCP uses date + ${DEFAULT_EVENT_DURATION_DESCRIPTION}.`
    })
  ),
  allDay: Schema.optional(
    Schema.Boolean.annotate({ description: `All-day event (default: ${DEFAULT_EVENT_ALL_DAY})` })
  ),
  location: Schema.optional(Schema.String.annotate({ description: "Event location" })),
  participants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotate({
      description:
        "Participants to invite. Each entry may be a plain email string or an object with email, exact name, or personId."
    })
  ),
  externalParticipants: Schema.optional(
    Schema.Array(Email).annotate({
      description: "External participant email addresses that are not resolvable workspace contacts."
    })
  ),
  reminders: Schema.optional(Schema.Array(Timestamp).annotate({ description: "Reminder timestamps in milliseconds." })),
  access: Schema.optional(CalendarAccessSchema.annotate({ description: "Event access level." })),
  timeZone: Schema.optional(
    TimeZoneId.annotate({ description: "IANA time zone for the event, for example 'America/New_York'." })
  ),
  blockTime: Schema.optional(
    Schema.Boolean.annotate({ description: "Whether this event blocks the user's time on the calendar." })
  ),
  visibility: Schema.optional(
    VisibilitySchema.annotate({ description: "Event visibility (public, freeBusy, private)" })
  ),
  calendarId: Schema.optional(
    CalendarId.annotate({
      description:
        "Target writable calendar ID. If omitted, uses the authenticated user's primary personal calendar. Use list_calendars to discover valid calendar IDs."
    })
  ),
  calendarName: Schema.optional(
    CalendarName.annotate({
      description:
        "Target writable calendar name. Use when you know the calendar's displayed name but not its ID. Do not provide with calendarId."
    })
  ),
  meetingRoom: Schema.optionalKey(
    MeetingRoomLocatorSchema.annotateKey({
      description:
        "Optional virtual-office meeting room. Room resolution tries ID first, then exact name; use floor to disambiguate duplicate names."
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) => (hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined))
    )
  )
  .annotate({ title: "CreateEventParams", description: "Parameters for creating an event" })

export type CreateEventParams = Schema.Schema.Type<typeof CreateEventParamsSchema>

export const UPDATE_EVENT_FIELDS = [
  "title",
  "description",
  "date",
  "dueDate",
  "allDay",
  "location",
  "visibility",
  "participants",
  "addParticipants",
  "removeParticipants",
  "externalParticipants",
  "addExternalParticipants",
  "removeExternalParticipants",
  "reminders",
  "access",
  "timeZone",
  "blockTime",
  "calendarId",
  "calendarName",
  "meetingRoom"
] as const satisfies ReadonlyArray<
  | "title"
  | "description"
  | "date"
  | "dueDate"
  | "allDay"
  | "location"
  | "visibility"
  | "participants"
  | "addParticipants"
  | "removeParticipants"
  | "externalParticipants"
  | "addExternalParticipants"
  | "removeExternalParticipants"
  | "reminders"
  | "access"
  | "timeZone"
  | "blockTime"
  | "calendarId"
  | "calendarName"
  | "meetingRoom"
>

export const UpdateEventParamsSchema = Schema.Struct({
  eventId: EventId.annotate({ description: "Event ID" }),
  title: Schema.optional(CalendarEventTitle.annotate({ description: "New event title" })),
  description: Schema.optional(
    clearableText(`New event description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`)
  ),
  date: Schema.optional(Timestamp.annotate({ description: "New start date/time (timestamp)" })),
  dueDate: Schema.optional(Timestamp.annotate({ description: "New end date/time (timestamp)" })),
  allDay: Schema.optional(Schema.Boolean.annotate({ description: "All-day event" })),
  location: Schema.optional(clearableText("New event location.")),
  visibility: Schema.optional(VisibilitySchema.annotate({ description: "New event visibility" })),
  participants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotate({
      description: "Replace all workspace participants with these resolved participants."
    })
  ),
  addParticipants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotate({
      description: "Resolve and add these workspace participants, preserving existing participants."
    })
  ),
  removeParticipants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotate({
      description: "Resolve and remove these workspace participants, preserving other participants."
    })
  ),
  externalParticipants: Schema.optional(
    Schema.Array(Email).annotate({ description: "Replace all external participant email addresses." })
  ),
  addExternalParticipants: Schema.optional(
    Schema.Array(Email).annotate({
      description: "Add external participant email addresses, preserving existing external participants."
    })
  ),
  removeExternalParticipants: Schema.optional(
    Schema.Array(Email).annotate({
      description: "Remove external participant email addresses, preserving other external participants."
    })
  ),
  reminders: Schema.optional(
    Schema.Array(Timestamp).annotate({ description: "Replace event reminders with these reminder timestamps." })
  ),
  access: Schema.optional(CalendarAccessSchema.annotate({ description: "New event access level." })),
  timeZone: Schema.optional(TimeZoneId.annotate({ description: "New IANA time zone for the event." })),
  blockTime: Schema.optional(Schema.Boolean.annotate({ description: "Whether this event blocks time." })),
  calendarId: Schema.optional(
    CalendarId.annotate({
      description: "Move the event to this writable calendar ID. Do not provide with calendarName."
    })
  ),
  calendarName: Schema.optional(
    CalendarName.annotate({
      description: "Move the event to this writable calendar name. Do not provide with calendarId."
    })
  ),
  meetingRoom: Schema.optionalKey(
    MeetingRoomLocatorSchema.annotateKey({
      description:
        "Assign a different virtual-office room to an existing meeting. Ordinary events without Meeting composition are rejected; omission preserves the current assignment and null is not accepted."
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_EVENT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_EVENT_FIELDS)
      )
    ),
    Schema.check(
      Schema.makeFilter((params) => (hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined))
    )
  )
  .annotate({
    title: "UpdateEventParams",
    description: `Parameters for updating an event. ${atLeastOneUpdateFieldMessage(UPDATE_EVENT_FIELDS)}`
  })

export type UpdateEventParams = Schema.Schema.Type<typeof UpdateEventParamsSchema>
assertUpdateFields<UpdateEventParams>()(["eventId"], UPDATE_EVENT_FIELDS)

export const DeleteEventParamsSchema = Schema.Struct({
  eventId: EventId.annotate({ description: "Event ID" })
}).annotate({ title: "DeleteEventParams", description: "Parameters for deleting an event" })

export type DeleteEventParams = Schema.Schema.Type<typeof DeleteEventParamsSchema>

// --- JSON schemas for MCP ---

export const listEventsParamsJsonSchema = toDraft07JsonSchema(ListEventsParamsSchema)
export const getEventParamsJsonSchema = toDraft07JsonSchema(GetEventParamsSchema)
export const listCalendarsParamsJsonSchema = toDraft07JsonSchema(ListCalendarsParamsSchema)
export const createEventParamsJsonSchema = withMutuallyExclusiveFields(
  toDraft07JsonSchema(CreateEventParamsSchema),
  CALENDAR_TARGET_FIELDS
)
export const updateEventParamsJsonSchema = withMutuallyExclusiveFields(
  withAtLeastOneRequired(toDraft07JsonSchema(UpdateEventParamsSchema), UPDATE_EVENT_FIELDS),
  CALENDAR_TARGET_FIELDS
)
export const deleteEventParamsJsonSchema = toDraft07JsonSchema(DeleteEventParamsSchema)

// --- Parsers ---

export const parseListEventsParams = Schema.decodeUnknownEffect(ListEventsParamsSchema)
export const parseGetEventParams = Schema.decodeUnknownEffect(GetEventParamsSchema)
export const parseListCalendarsParams = Schema.decodeUnknownEffect(ListCalendarsParamsSchema)
export const parseCreateEventParams = Schema.decodeUnknownEffect(CreateEventParamsSchema)
export const parseUpdateEventParams = Schema.decodeUnknownEffect(UpdateEventParamsSchema)
export const parseDeleteEventParams = Schema.decodeUnknownEffect(DeleteEventParamsSchema)
