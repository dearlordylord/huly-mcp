import type { Visibility as HulyVisibility } from "@hcengineering/calendar"
import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  CalendarId,
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
  Timestamp,
  TimeZoneId,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"
import type { PersonId as PersonIdType, RoomId, RoomName, Timestamp as TimestampType } from "./shared.js"

export const CalendarEventTitle = NonEmptyString.pipe(Schema.brand("CalendarEventTitle")).annotations({
  identifier: "CalendarEventTitle",
  title: "CalendarEventTitle",
  description: "Non-empty calendar event title."
})
export type CalendarEventTitle = Schema.Schema.Type<typeof CalendarEventTitle>

export const CalendarName = NonEmptyString.pipe(Schema.brand("CalendarName")).annotations({
  identifier: "CalendarName",
  title: "CalendarName",
  description: "Non-empty calendar name."
})
export type CalendarName = Schema.Schema.Type<typeof CalendarName>

export const VisibilityValues = ["public", "freeBusy", "private"] as const
type VisibilityValue = typeof VisibilityValues[number]
type ExactVisibilityValues = [HulyVisibility] extends [VisibilityValue]
  ? [VisibilityValue] extends [HulyVisibility] ? true : never
  : never
const exactVisibilityValues = <T extends true>(value: T): T => value
exactVisibilityValues<ExactVisibilityValues>(true)

export const VisibilitySchema = Schema.Literal(...VisibilityValues).annotations({
  title: "Visibility",
  description: `Event visibility level: ${enumValuesDescription(VisibilityValues)}`
})

export type Visibility = Schema.Schema.Type<typeof VisibilitySchema>

export type WritableCalendarAccess = "writer" | "owner"

const CalendarAccessValues = ["freeBusyReader", "reader", "writer", "owner"] as const
export type CalendarAccess = typeof CalendarAccessValues[number]

export const CalendarAccessSchema = Schema.Literal(...CalendarAccessValues).annotations({
  title: "CalendarAccess",
  description: `Calendar access level: ${enumValuesDescription(CalendarAccessValues)}`
})

const CALENDAR_TARGET_FIELDS = ["calendarId", "calendarName"] as const
const calendarTargetConflictMessage = mutuallyExclusiveFieldsMessage(CALENDAR_TARGET_FIELDS)

const hasCalendarTargetConflict = (params: {
  readonly calendarId?: unknown
  readonly calendarName?: unknown
}): boolean => hasMutuallyExclusiveFields(params, CALENDAR_TARGET_FIELDS)

const countDefinedParticipantLocatorFields = (
  locator: {
    readonly email?: Email | undefined
    readonly name?: PersonName | undefined
    readonly personId?: PersonIdType | undefined
  }
): number =>
  (locator.email === undefined ? 0 : 1) + (locator.name === undefined ? 0 : 1)
  + (locator.personId === undefined ? 0 : 1)

const EventParticipantLocatorObjectSchema = Schema.Struct({
  email: Schema.optional(Email.annotations({
    description: "Participant email address."
  })),
  name: Schema.optional(PersonName.annotations({
    description: "Exact participant display name."
  })),
  personId: Schema.optional(PersonId.annotations({
    description: "Huly Person ID."
  }))
}).pipe(
  Schema.filter((locator) =>
    countDefinedParticipantLocatorFields(locator) === 1
      ? undefined
      : "Provide exactly one participant locator field: email, name, or personId."
  )
).annotations({
  title: "EventParticipantLocator",
  description:
    "Participant locator. Use a plain email string, or an object with exactly one of email, exact name, or personId."
})

export const EventParticipantLocatorSchema = Schema.Union(Email, EventParticipantLocatorObjectSchema).annotations({
  title: "EventParticipant",
  description: "Participant locator. Plain email strings are accepted for concise calls."
})

export type EventParticipantLocator = Schema.Schema.Type<typeof EventParticipantLocatorSchema>

// No codec needed — internal type, not used for runtime validation
export interface Participant {
  readonly id: PersonIdType
  readonly name?: PersonName | undefined
  readonly email?: Email | undefined
}

export interface EventSummary {
  readonly eventId: EventId
  readonly title: CalendarEventTitle
  readonly date: TimestampType
  readonly dueDate: TimestampType
  readonly allDay: boolean
  readonly location?: string | undefined
  readonly calendarId?: CalendarId | undefined
  readonly timeZone?: TimeZoneId | undefined
  readonly blockTime?: boolean | undefined
  readonly meetingRoom?: RoomReference | undefined
  readonly modifiedOn?: TimestampType | undefined
}

export interface CalendarSummary {
  readonly calendarId: CalendarId
  readonly name: CalendarName
  readonly hidden: boolean
  readonly visibility: Visibility
  readonly user: PersonId
  readonly access: WritableCalendarAccess
  readonly isPrimary: boolean
}

export interface Event {
  readonly eventId: EventId
  readonly title: CalendarEventTitle
  readonly description?: string | undefined
  readonly date: TimestampType
  readonly dueDate: TimestampType
  readonly allDay: boolean
  readonly location?: string | undefined
  readonly visibility?: Visibility | undefined
  readonly participants?: ReadonlyArray<Participant> | undefined
  readonly externalParticipants?: ReadonlyArray<Email> | undefined
  readonly reminders?: ReadonlyArray<TimestampType> | undefined
  readonly access?: CalendarAccess | undefined
  readonly timeZone?: TimeZoneId | undefined
  readonly blockTime?: boolean | undefined
  readonly calendarId?: CalendarId | undefined
  readonly meetingRoom?: RoomReference | undefined
  readonly modifiedOn?: TimestampType | undefined
  readonly createdOn?: TimestampType | undefined
}

export interface RoomReference {
  readonly roomId: RoomId
  readonly name?: RoomName | undefined
}

// --- Params schemas ---

export const ListEventsParamsSchema = Schema.Struct({
  from: Schema.optional(Timestamp.annotations({
    description: "Start date filter (timestamp)"
  })),
  to: Schema.optional(Timestamp.annotations({
    description: "End date filter (timestamp)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of events to return (default: 50)"
    })
  )
}).annotations({
  title: "ListEventsParams",
  description: "Parameters for listing events"
})

export type ListEventsParams = Schema.Schema.Type<typeof ListEventsParamsSchema>

export const GetEventParamsSchema = Schema.Struct({
  eventId: EventId.annotations({
    description: "Event ID"
  })
}).annotations({
  title: "GetEventParams",
  description: "Parameters for getting a single event"
})

export type GetEventParams = Schema.Schema.Type<typeof GetEventParamsSchema>

export const ListCalendarsParamsSchema = EmptyParamsSchema.annotations({
  title: "ListCalendarsParams",
  description: "Parameters for listing writable calendar targets"
})

export type ListCalendarsParams = Schema.Schema.Type<typeof ListCalendarsParamsSchema>

export const CreateEventParamsSchema = Schema.Struct({
  title: CalendarEventTitle.annotations({
    description: "Event title"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Event description (markdown supported)"
  })),
  date: Timestamp.annotations({
    description: "Start date/time (timestamp)"
  }),
  dueDate: Schema.optional(Timestamp.annotations({
    description: "End date/time (timestamp). If not provided, defaults to date + 1 hour"
  })),
  allDay: Schema.optional(Schema.Boolean.annotations({
    description: "All-day event (default: false)"
  })),
  location: Schema.optional(Schema.String.annotations({
    description: "Event location"
  })),
  participants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotations({
      description:
        "Participants to invite. Each entry may be a plain email string or an object with email, exact name, or personId."
    })
  ),
  externalParticipants: Schema.optional(
    Schema.Array(Email).annotations({
      description: "External participant email addresses that are not resolvable workspace contacts."
    })
  ),
  reminders: Schema.optional(
    Schema.Array(Timestamp).annotations({
      description: "Reminder timestamps in milliseconds."
    })
  ),
  access: Schema.optional(CalendarAccessSchema.annotations({
    description: "Event access level."
  })),
  timeZone: Schema.optional(TimeZoneId.annotations({
    description: "IANA time zone for the event, for example 'America/New_York'."
  })),
  blockTime: Schema.optional(Schema.Boolean.annotations({
    description: "Whether this event blocks the user's time on the calendar."
  })),
  visibility: Schema.optional(VisibilitySchema.annotations({
    description: "Event visibility (public, freeBusy, private)"
  })),
  calendarId: Schema.optional(CalendarId.annotations({
    description:
      "Target writable calendar ID. If omitted, uses the authenticated user's primary personal calendar. Use list_calendars to discover valid calendar IDs."
  })),
  calendarName: Schema.optional(CalendarName.annotations({
    description:
      "Target writable calendar name. Use when you know the calendar's displayed name but not its ID. Do not provide with calendarId."
  }))
}).pipe(
  Schema.filter((params) => hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined)
).annotations({
  title: "CreateEventParams",
  description: "Parameters for creating an event"
})

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
  "calendarName"
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
>

export const UpdateEventParamsSchema = Schema.Struct({
  eventId: EventId.annotations({
    description: "Event ID"
  }),
  title: Schema.optional(CalendarEventTitle.annotations({
    description: "New event title"
  })),
  description: Schema.optional(clearableText("New event description (markdown supported).")),
  date: Schema.optional(Timestamp.annotations({
    description: "New start date/time (timestamp)"
  })),
  dueDate: Schema.optional(Timestamp.annotations({
    description: "New end date/time (timestamp)"
  })),
  allDay: Schema.optional(Schema.Boolean.annotations({
    description: "All-day event"
  })),
  location: Schema.optional(clearableText("New event location.")),
  visibility: Schema.optional(VisibilitySchema.annotations({
    description: "New event visibility"
  })),
  participants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotations({
      description: "Replace all workspace participants with these resolved participants."
    })
  ),
  addParticipants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotations({
      description: "Resolve and add these workspace participants, preserving existing participants."
    })
  ),
  removeParticipants: Schema.optional(
    Schema.Array(EventParticipantLocatorSchema).annotations({
      description: "Resolve and remove these workspace participants, preserving other participants."
    })
  ),
  externalParticipants: Schema.optional(
    Schema.Array(Email).annotations({
      description: "Replace all external participant email addresses."
    })
  ),
  addExternalParticipants: Schema.optional(
    Schema.Array(Email).annotations({
      description: "Add external participant email addresses, preserving existing external participants."
    })
  ),
  removeExternalParticipants: Schema.optional(
    Schema.Array(Email).annotations({
      description: "Remove external participant email addresses, preserving other external participants."
    })
  ),
  reminders: Schema.optional(
    Schema.Array(Timestamp).annotations({
      description: "Replace event reminders with these reminder timestamps."
    })
  ),
  access: Schema.optional(CalendarAccessSchema.annotations({
    description: "New event access level."
  })),
  timeZone: Schema.optional(TimeZoneId.annotations({
    description: "New IANA time zone for the event."
  })),
  blockTime: Schema.optional(Schema.Boolean.annotations({
    description: "Whether this event blocks time."
  })),
  calendarId: Schema.optional(CalendarId.annotations({
    description: "Move the event to this writable calendar ID. Do not provide with calendarName."
  })),
  calendarName: Schema.optional(CalendarName.annotations({
    description: "Move the event to this writable calendar name. Do not provide with calendarId."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_EVENT_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_EVENT_FIELDS)
  ),
  Schema.filter((params) => hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined)
).annotations({
  title: "UpdateEventParams",
  description: `Parameters for updating an event. ${atLeastOneUpdateFieldMessage(UPDATE_EVENT_FIELDS)}`
})

export type UpdateEventParams = Schema.Schema.Type<typeof UpdateEventParamsSchema>
assertUpdateFields<UpdateEventParams>()(["eventId"], UPDATE_EVENT_FIELDS)

export const DeleteEventParamsSchema = Schema.Struct({
  eventId: EventId.annotations({
    description: "Event ID"
  })
}).annotations({
  title: "DeleteEventParams",
  description: "Parameters for deleting an event"
})

export type DeleteEventParams = Schema.Schema.Type<typeof DeleteEventParamsSchema>

// --- JSON schemas for MCP ---

export const listEventsParamsJsonSchema = JSONSchema.make(ListEventsParamsSchema)
export const getEventParamsJsonSchema = JSONSchema.make(GetEventParamsSchema)
export const listCalendarsParamsJsonSchema = JSONSchema.make(ListCalendarsParamsSchema)
export const createEventParamsJsonSchema = withMutuallyExclusiveFields(
  JSONSchema.make(CreateEventParamsSchema),
  CALENDAR_TARGET_FIELDS
)
export const updateEventParamsJsonSchema = withMutuallyExclusiveFields(
  withAtLeastOneRequired(
    JSONSchema.make(UpdateEventParamsSchema),
    UPDATE_EVENT_FIELDS
  ),
  CALENDAR_TARGET_FIELDS
)
export const deleteEventParamsJsonSchema = JSONSchema.make(DeleteEventParamsSchema)

// --- Parsers ---

export const parseListEventsParams = Schema.decodeUnknown(ListEventsParamsSchema)
export const parseGetEventParams = Schema.decodeUnknown(GetEventParamsSchema)
export const parseListCalendarsParams = Schema.decodeUnknown(ListCalendarsParamsSchema)
export const parseCreateEventParams = Schema.decodeUnknown(CreateEventParamsSchema)
export const parseUpdateEventParams = Schema.decodeUnknown(UpdateEventParamsSchema)
export const parseDeleteEventParams = Schema.decodeUnknown(DeleteEventParamsSchema)

// No codec needed — internal type, not used for runtime validation
export interface CreateEventResult {
  readonly eventId: EventId
}

export interface UpdateEventResult {
  readonly eventId: EventId
  readonly updated: boolean
}

export interface DeleteEventResult {
  readonly eventId: EventId
  readonly deleted: boolean
}
