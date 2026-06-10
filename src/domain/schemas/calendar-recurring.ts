import type { RecurringRule as HulyRecurringRule } from "@hcengineering/calendar"
import { JSONSchema, Schema } from "effect"

import type { Participant, Visibility } from "./calendar.js"
import {
  CalendarAccessSchema,
  CalendarEventTitle,
  CalendarName,
  EventParticipantLocatorSchema,
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
import type { Timestamp as TimestampType } from "./shared.js"

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

export interface RecurringEventSummary {
  readonly eventId: EventId
  readonly title: CalendarEventTitle
  readonly originalStartTime: TimestampType
  readonly rules: ReadonlyArray<RecurringRule>
  readonly timeZone?: TimeZoneId | undefined
  readonly modifiedOn?: TimestampType | undefined
}

export interface RecurringEvent {
  readonly eventId: EventId
  readonly title: CalendarEventTitle
  readonly description?: string | undefined
  readonly originalStartTime: TimestampType
  readonly rules: ReadonlyArray<RecurringRule>
  readonly exdate?: ReadonlyArray<TimestampType> | undefined
  readonly rdate?: ReadonlyArray<TimestampType> | undefined
  readonly timeZone?: TimeZoneId | undefined
  readonly dueDate: TimestampType
  readonly allDay: boolean
  readonly location?: string | undefined
  readonly visibility?: Visibility | undefined
  readonly participants?: ReadonlyArray<Participant> | undefined
  readonly externalParticipants?: ReadonlyArray<Email> | undefined
  readonly calendarId?: CalendarId | undefined
  readonly modifiedOn?: TimestampType | undefined
  readonly createdOn?: TimestampType | undefined
}

export interface EventInstance {
  readonly eventId: EventId
  readonly recurringEventId: EventId
  readonly title: CalendarEventTitle
  readonly description?: string | undefined
  readonly date: TimestampType
  readonly dueDate: TimestampType
  readonly originalStartTime: TimestampType
  readonly allDay: boolean
  readonly location?: string | undefined
  readonly visibility?: Visibility | undefined
  readonly isCancelled?: boolean | undefined
  readonly isVirtual?: boolean | undefined
  readonly participants?: ReadonlyArray<Participant> | undefined
  readonly externalParticipants?: ReadonlyArray<Email> | undefined
}

export const ListRecurringEventsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of recurring events to return (default: 50)"
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
    description: "First occurrence end date/time (timestamp). If not provided, defaults to startDate + 1 hour"
  })),
  rules: Schema.NonEmptyArray(CreatableRecurringRuleSchema).annotations({
    description: "Recurring rules (RFC5545 RRULE format)"
  }),
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
      description: "Maximum number of instances to return (default: 50)"
    })
  ),
  includeParticipants: Schema.optional(Schema.Boolean.annotations({
    description: "Include full participant info (requires extra lookups, default: off)"
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

export interface CreateRecurringEventResult {
  readonly eventId: EventId
}
