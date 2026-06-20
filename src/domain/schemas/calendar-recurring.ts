import type { RecurringRule as HulyRecurringRule } from "@hcengineering/calendar"
import { JSONSchema, Schema } from "effect"

import {
  CalendarAccessSchema,
  CalendarEventTitle,
  CalendarName,
  DEFAULT_EVENT_ALL_DAY,
  DEFAULT_EVENT_DURATION_DESCRIPTION,
  EventParticipantLocatorSchema,
  ParticipantSchema,
  VisibilitySchema
} from "./calendar.js"
import {
  MonthDayOrdinal,
  MonthIndex,
  RecurrenceCount,
  RecurrenceInterval,
  SetPositionOrdinal
} from "./recurrence-primitives.js"
import {
  CalendarId,
  DEFAULT_LIMIT,
  Email,
  enumValuesDescription,
  EventId,
  hasMutuallyExclusiveFields,
  LimitParam,
  mutuallyExclusiveFieldsMessage,
  Timestamp,
  TimeZoneId,
  withMutuallyExclusiveFields
} from "./shared.js"

const DEFAULT_RECURRING_INSTANCE_PARTICIPANTS_INCLUDED = false

export const RecurringFrequencyValues = [
  "SECONDLY",
  "MINUTELY",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY"
] as const

type HulyRecurringFrequency = HulyRecurringRule["freq"]
type RecurringFrequencyValue = typeof RecurringFrequencyValues[number]
type ExactRecurringFrequencyValues = [HulyRecurringFrequency] extends [RecurringFrequencyValue]
  ? [RecurringFrequencyValue] extends [HulyRecurringFrequency] ? true : never
  : never
const exactRecurringFrequencyValues = <T extends true>(value: T): T => value
exactRecurringFrequencyValues<ExactRecurringFrequencyValues>(true)

export const RecurringFrequencySchema = Schema.Literal(...RecurringFrequencyValues).annotations({
  title: "RecurringFrequency",
  description: `Recurring event frequency (RFC5545): ${enumValuesDescription(RecurringFrequencyValues)}`
})

export type RecurringFrequency = Schema.Schema.Type<typeof RecurringFrequencySchema>

export const CreatableRecurringFrequencyValues = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const
type CreatableRecurringFrequencyValue = typeof CreatableRecurringFrequencyValues[number]
type ExactCreatableRecurringFrequencySubset = [CreatableRecurringFrequencyValue] extends [RecurringFrequencyValue]
  ? true
  : never
const exactCreatableRecurringFrequencySubset = <T extends true>(value: T): T => value
exactCreatableRecurringFrequencySubset<ExactCreatableRecurringFrequencySubset>(true)

export const CreatableRecurringFrequencySchema = Schema.Literal(...CreatableRecurringFrequencyValues).annotations({
  title: "CreatableRecurringFrequency",
  description: `Recurring event frequency supported for creation by Huly's recurrence generator: ${
    enumValuesDescription(CreatableRecurringFrequencyValues)
  }`
})

export type CreatableRecurringFrequency = Schema.Schema.Type<typeof CreatableRecurringFrequencySchema>

// Mirrors @hcengineering/calendar RecurringRule.wkst and uses RFC5545 weekday abbreviations.
export const WeekdayValues = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const

type HulyWeekday = NonNullable<HulyRecurringRule["wkst"]>
type WeekdayValue = typeof WeekdayValues[number]
type ExactWeekdayValues = [HulyWeekday] extends [WeekdayValue] ? [WeekdayValue] extends [HulyWeekday] ? true : never
  : never
const exactWeekdayValues = <T extends true>(value: T): T => value
exactWeekdayValues<ExactWeekdayValues>(true)

export const WeekdaySchema = Schema.Literal(...WeekdayValues).annotations({
  title: "Weekday",
  description: `Day of week abbreviation: ${enumValuesDescription(WeekdayValues)}`
})

const CALENDAR_TARGET_FIELDS = ["calendarId", "calendarName"] as const
const calendarTargetConflictMessage = mutuallyExclusiveFieldsMessage(CALENDAR_TARGET_FIELDS)

const hasCalendarTargetConflict = (params: {
  readonly calendarId?: unknown
  readonly calendarName?: unknown
}): boolean => hasMutuallyExclusiveFields(params, CALENDAR_TARGET_FIELDS)

export type Weekday = Schema.Schema.Type<typeof WeekdaySchema>

const RecurringRuleNonFrequencyFields = {
  endDate: Schema.optional(Timestamp.annotations({
    description: "End date for recurrence (timestamp)"
  })),
  count: Schema.optional(
    RecurrenceCount.annotations({
      description: "Number of occurrences"
    })
  ),
  interval: Schema.optional(
    RecurrenceInterval.annotations({
      description: "Interval between occurrences"
    })
  ),
  // Huly stores byDay as string[], but its generator reliably supports weekday abbreviations here.
  byDay: Schema.optional(
    Schema.Array(WeekdaySchema).annotations({
      description:
        "Days of week supported by Huly's recurrence generator (e.g., ['MO', 'WE', 'FR']). Use bySetPos with byDay for first/last weekday patterns."
    })
  ),
  byMonthDay: Schema.optional(
    Schema.Array(MonthDayOrdinal).annotations({
      description: "Days of month (1-31). Negative month days are not supported by Huly's recurrence generator."
    })
  ),
  // Huly's generator compares byMonth against Date#getMonth(), so the MCP schema uses 0-11 indexes.
  byMonth: Schema.optional(
    Schema.Array(MonthIndex).annotations({
      description: "Zero-based months (0=January, 11=December)"
    })
  ),
  bySetPos: Schema.optional(
    Schema.Array(SetPositionOrdinal).annotations({
      description: "Position within set (e.g., -1 for last)"
    })
  ),
  wkst: Schema.optional(WeekdaySchema.annotations({
    description: "Week start day"
  }))
}

export const RecurringRuleSchema = Schema.Struct({
  freq: RecurringFrequencySchema.annotations({
    description: "Frequency (DAILY, WEEKLY, MONTHLY, YEARLY, etc.)"
  }),
  ...RecurringRuleNonFrequencyFields
}).annotations({
  title: "RecurringRule",
  description: "RFC5545 recurring rule"
})

export type RecurringRule = Schema.Schema.Type<typeof RecurringRuleSchema>

export const CreatableRecurringRuleSchema = Schema.Struct({
  freq: CreatableRecurringFrequencySchema.annotations({
    description: "Frequency supported by Huly's recurrence generator."
  }),
  ...RecurringRuleNonFrequencyFields
}).annotations({
  title: "CreatableRecurringRule",
  description: "Recurring rule accepted when creating a recurring event."
})

export type CreatableRecurringRule = Schema.Schema.Type<typeof CreatableRecurringRuleSchema>

export const RecurringEventSummarySchema = Schema.Struct({
  eventId: EventId,
  title: CalendarEventTitle,
  originalStartTime: Timestamp,
  rules: Schema.Array(RecurringRuleSchema),
  timeZone: Schema.optional(TimeZoneId),
  modifiedOn: Schema.optional(Timestamp)
})
export type RecurringEventSummary = Schema.Schema.Type<typeof RecurringEventSummarySchema>

export const RecurringEventSchema = Schema.Struct({
  eventId: EventId,
  title: CalendarEventTitle,
  description: Schema.optional(Schema.String),
  originalStartTime: Timestamp,
  rules: Schema.Array(RecurringRuleSchema),
  exdate: Schema.optional(Schema.Array(Timestamp)),
  rdate: Schema.optional(Schema.Array(Timestamp)),
  timeZone: Schema.optional(TimeZoneId),
  dueDate: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  visibility: Schema.optional(VisibilitySchema),
  participants: Schema.optional(Schema.Array(ParticipantSchema)),
  externalParticipants: Schema.optional(Schema.Array(Email)),
  calendarId: Schema.optional(CalendarId),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type RecurringEvent = Schema.Schema.Type<typeof RecurringEventSchema>

export const EventInstanceSchema = Schema.Struct({
  eventId: EventId,
  recurringEventId: EventId,
  title: CalendarEventTitle,
  description: Schema.optional(Schema.String),
  date: Timestamp,
  dueDate: Timestamp,
  originalStartTime: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  visibility: Schema.optional(VisibilitySchema),
  isCancelled: Schema.optional(Schema.Boolean),
  isVirtual: Schema.optional(Schema.Boolean),
  participants: Schema.optional(Schema.Array(ParticipantSchema)),
  externalParticipants: Schema.optional(Schema.Array(Email))
})
export type EventInstance = Schema.Schema.Type<typeof EventInstanceSchema>

export const ListRecurringEventsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of recurring events to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListRecurringEventsParams",
  description: "Parameters for listing recurring events"
})

export type ListRecurringEventsParams = Schema.Schema.Type<typeof ListRecurringEventsParamsSchema>

export const CreateRecurringEventParamsSchema = Schema.Struct({
  title: CalendarEventTitle.annotations({
    description: "Event title"
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Event description (markdown supported)"
  })),
  startDate: Timestamp.annotations({
    description: "First occurrence start date/time (timestamp)"
  }),
  dueDate: Schema.optional(Timestamp.annotations({
    description:
      `First occurrence end date/time (timestamp). If omitted, Huly MCP uses startDate + ${DEFAULT_EVENT_DURATION_DESCRIPTION}.`
  })),
  rules: Schema.NonEmptyArray(CreatableRecurringRuleSchema).annotations({
    description: "Recurring rules (RFC5545 RRULE format)"
  }),
  allDay: Schema.optional(Schema.Boolean.annotations({
    description: `All-day event (default: ${DEFAULT_EVENT_ALL_DAY})`
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
  timeZone: Schema.optional(TimeZoneId.annotations({
    description: "Time zone (e.g., 'America/New_York')"
  })),
  access: Schema.optional(CalendarAccessSchema.annotations({
    description: "Event access level."
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
  title: "CreateRecurringEventParams",
  description: "Parameters for creating a recurring event"
})

export type CreateRecurringEventParams = Schema.Schema.Type<typeof CreateRecurringEventParamsSchema>

export const ListEventInstancesParamsSchema = Schema.Struct({
  recurringEventId: EventId.annotations({
    description: "Recurring event ID"
  }),
  from: Schema.optional(Timestamp.annotations({
    description: "Start date filter (timestamp)"
  })),
  to: Schema.optional(Timestamp.annotations({
    description: "End date filter (timestamp)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of instances to return (default: ${DEFAULT_LIMIT})`
    })
  ),
  includeParticipants: Schema.optional(Schema.Boolean.annotations({
    description:
      `Include full participant info (requires extra lookups, default: ${DEFAULT_RECURRING_INSTANCE_PARTICIPANTS_INCLUDED})`
  }))
}).annotations({
  title: "ListEventInstancesParams",
  description: "Parameters for listing instances of a recurring event"
})

export type ListEventInstancesParams = Schema.Schema.Type<typeof ListEventInstancesParamsSchema>

export const listRecurringEventsParamsJsonSchema = JSONSchema.make(ListRecurringEventsParamsSchema)
export const createRecurringEventParamsJsonSchema = withMutuallyExclusiveFields(
  JSONSchema.make(CreateRecurringEventParamsSchema),
  CALENDAR_TARGET_FIELDS
)
export const listEventInstancesParamsJsonSchema = JSONSchema.make(ListEventInstancesParamsSchema)

export const parseListRecurringEventsParams = Schema.decodeUnknown(ListRecurringEventsParamsSchema)
export const parseCreateRecurringEventParams = Schema.decodeUnknown(CreateRecurringEventParamsSchema)
export const parseListEventInstancesParams = Schema.decodeUnknown(ListEventInstancesParamsSchema)

export const CreateRecurringEventResultSchema = Schema.Struct({
  eventId: EventId
})
export type CreateRecurringEventResult = Schema.Schema.Type<typeof CreateRecurringEventResultSchema>

export const ListRecurringEventsResultSchema = Schema.Array(RecurringEventSummarySchema)
export const ListEventInstancesResultSchema = Schema.Array(EventInstanceSchema)
