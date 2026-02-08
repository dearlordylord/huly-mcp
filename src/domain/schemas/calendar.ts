import { Schema } from "effect"

import {
  Email,
  EventId,
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  PersonId,
  PersonName,
  Timestamp
} from "./shared.js"

export const VisibilityValues = ["public", "freeBusy", "private"] as const

export const VisibilitySchema = Schema.Literal(...VisibilityValues).annotations({
  title: "Visibility",
  description: "Event visibility level"
})

export type Visibility = Schema.Schema.Type<typeof VisibilitySchema>

export const RecurringFrequencyValues = [
  "SECONDLY",
  "MINUTELY",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY"
] as const

export const RecurringFrequencySchema = Schema.Literal(...RecurringFrequencyValues).annotations({
  title: "RecurringFrequency",
  description: "Recurring event frequency (RFC5545)"
})

export type RecurringFrequency = Schema.Schema.Type<typeof RecurringFrequencySchema>

export const WeekdayValues = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const

export const WeekdaySchema = Schema.Literal(...WeekdayValues).annotations({
  title: "Weekday",
  description: "Day of week abbreviation"
})

export type Weekday = Schema.Schema.Type<typeof WeekdaySchema>

export const RecurringRuleSchema = Schema.Struct({
  freq: RecurringFrequencySchema.annotations({
    description: "Frequency (DAILY, WEEKLY, MONTHLY, YEARLY, etc.)"
  }),
  endDate: Schema.optional(Timestamp.annotations({
    description: "End date for recurrence (timestamp)"
  })),
  count: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.positive()).annotations({
      description: "Number of occurrences"
    })
  ),
  interval: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.positive()).annotations({
      description: "Interval between occurrences"
    })
  ),
  byDay: Schema.optional(
    Schema.Array(Schema.String).annotations({
      description: "Days of week (e.g., ['MO', 'WE', 'FR'] or ['1MO', '-1FR'])"
    })
  ),
  byMonthDay: Schema.optional(
    Schema.Array(Schema.Number.pipe(Schema.int())).annotations({
      description: "Days of month (1-31 or -31 to -1)"
    })
  ),
  byMonth: Schema.optional(
    Schema.Array(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(12))) // eslint-disable-line no-magic-numbers
      .annotations({
        description: "Months (1-12)"
      })
  ),
  bySetPos: Schema.optional(
    Schema.Array(Schema.Number.pipe(Schema.int())).annotations({
      description: "Position within set (e.g., -1 for last)"
    })
  ),
  wkst: Schema.optional(WeekdaySchema.annotations({
    description: "Week start day"
  }))
}).annotations({
  title: "RecurringRule",
  description: "RFC5545 recurring rule"
})

export type RecurringRule = Schema.Schema.Type<typeof RecurringRuleSchema>

export const ParticipantSchema = Schema.Struct({
  id: PersonId,
  name: Schema.optional(PersonName),
  email: Schema.optional(Email)
}).annotations({
  title: "Participant",
  description: "Event participant"
})

export type Participant = Schema.Schema.Type<typeof ParticipantSchema>

export const EventSummarySchema = Schema.Struct({
  eventId: EventId,
  title: Schema.String,
  date: Timestamp,
  dueDate: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "EventSummary",
  description: "Event summary for list operations"
})

export type EventSummary = Schema.Schema.Type<typeof EventSummarySchema>

export const EventSchema = Schema.Struct({
  eventId: EventId,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  date: Timestamp,
  dueDate: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  visibility: Schema.optional(VisibilitySchema),
  participants: Schema.optional(Schema.Array(ParticipantSchema)),
  externalParticipants: Schema.optional(Schema.Array(Email)),
  calendarId: Schema.optional(NonEmptyString),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Event",
  description: "Full calendar event with all fields"
})

export type Event = Schema.Schema.Type<typeof EventSchema>

export const RecurringEventSummarySchema = Schema.Struct({
  eventId: EventId,
  title: Schema.String,
  originalStartTime: Timestamp,
  rules: Schema.Array(RecurringRuleSchema),
  timeZone: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "RecurringEventSummary",
  description: "Recurring event summary for list operations"
})

export type RecurringEventSummary = Schema.Schema.Type<typeof RecurringEventSummarySchema>

export const RecurringEventSchema = Schema.Struct({
  eventId: EventId,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  originalStartTime: Timestamp,
  rules: Schema.Array(RecurringRuleSchema),
  exdate: Schema.optional(Schema.Array(Timestamp)),
  rdate: Schema.optional(Schema.Array(Timestamp)),
  timeZone: Schema.optional(Schema.String),
  dueDate: Timestamp,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  visibility: Schema.optional(VisibilitySchema),
  participants: Schema.optional(Schema.Array(ParticipantSchema)),
  externalParticipants: Schema.optional(Schema.Array(Email)),
  calendarId: Schema.optional(NonEmptyString),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "RecurringEvent",
  description: "Full recurring calendar event with all fields"
})

export type RecurringEvent = Schema.Schema.Type<typeof RecurringEventSchema>

export const EventInstanceSchema = Schema.Struct({
  eventId: EventId,
  recurringEventId: EventId,
  title: Schema.String,
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
}).annotations({
  title: "EventInstance",
  description: "Instance of a recurring event"
})

export type EventInstance = Schema.Schema.Type<typeof EventInstanceSchema>

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

export const CreateEventParamsSchema = Schema.Struct({
  title: NonEmptyString.annotations({
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
    Schema.Array(Email).annotations({
      description: "Participant emails"
    })
  ),
  visibility: Schema.optional(VisibilitySchema.annotations({
    description: "Event visibility (public, freeBusy, private)"
  }))
}).annotations({
  title: "CreateEventParams",
  description: "Parameters for creating an event"
})

export type CreateEventParams = Schema.Schema.Type<typeof CreateEventParamsSchema>

export const UpdateEventParamsSchema = Schema.Struct({
  eventId: EventId.annotations({
    description: "Event ID"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New event title"
  })),
  description: Schema.optional(Schema.String.annotations({
    description: "New event description (markdown supported)"
  })),
  date: Schema.optional(Timestamp.annotations({
    description: "New start date/time (timestamp)"
  })),
  dueDate: Schema.optional(Timestamp.annotations({
    description: "New end date/time (timestamp)"
  })),
  allDay: Schema.optional(Schema.Boolean.annotations({
    description: "All-day event"
  })),
  location: Schema.optional(Schema.String.annotations({
    description: "New event location"
  })),
  visibility: Schema.optional(VisibilitySchema.annotations({
    description: "New event visibility"
  }))
}).annotations({
  title: "UpdateEventParams",
  description: "Parameters for updating an event"
})

export type UpdateEventParams = Schema.Schema.Type<typeof UpdateEventParamsSchema>

export const DeleteEventParamsSchema = Schema.Struct({
  eventId: EventId.annotations({
    description: "Event ID"
  })
}).annotations({
  title: "DeleteEventParams",
  description: "Parameters for deleting an event"
})

export type DeleteEventParams = Schema.Schema.Type<typeof DeleteEventParamsSchema>

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
  title: NonEmptyString.annotations({
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
  rules: Schema.Array(RecurringRuleSchema).annotations({
    description: "Recurring rules (RFC5545 RRULE format)"
  }),
  allDay: Schema.optional(Schema.Boolean.annotations({
    description: "All-day event (default: false)"
  })),
  location: Schema.optional(Schema.String.annotations({
    description: "Event location"
  })),
  participants: Schema.optional(
    Schema.Array(Email).annotations({
      description: "Participant emails"
    })
  ),
  timeZone: Schema.optional(Schema.String.annotations({
    description: "Time zone (e.g., 'America/New_York')"
  })),
  visibility: Schema.optional(VisibilitySchema.annotations({
    description: "Event visibility (public, freeBusy, private)"
  }))
}).annotations({
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

// --- JSON schemas for MCP ---

export const listEventsParamsJsonSchema = makeJsonSchema(ListEventsParamsSchema)
export const getEventParamsJsonSchema = makeJsonSchema(GetEventParamsSchema)
export const createEventParamsJsonSchema = makeJsonSchema(CreateEventParamsSchema)
export const updateEventParamsJsonSchema = makeJsonSchema(UpdateEventParamsSchema)
export const deleteEventParamsJsonSchema = makeJsonSchema(DeleteEventParamsSchema)
export const listRecurringEventsParamsJsonSchema = makeJsonSchema(ListRecurringEventsParamsSchema)
export const createRecurringEventParamsJsonSchema = makeJsonSchema(CreateRecurringEventParamsSchema)
export const listEventInstancesParamsJsonSchema = makeJsonSchema(ListEventInstancesParamsSchema)

// --- Parsers ---

export const parseListEventsParams = Schema.decodeUnknown(ListEventsParamsSchema)
export const parseGetEventParams = Schema.decodeUnknown(GetEventParamsSchema)
export const parseCreateEventParams = Schema.decodeUnknown(CreateEventParamsSchema)
export const parseUpdateEventParams = Schema.decodeUnknown(UpdateEventParamsSchema)
export const parseDeleteEventParams = Schema.decodeUnknown(DeleteEventParamsSchema)
export const parseListRecurringEventsParams = Schema.decodeUnknown(ListRecurringEventsParamsSchema)
export const parseCreateRecurringEventParams = Schema.decodeUnknown(CreateRecurringEventParamsSchema)
export const parseListEventInstancesParams = Schema.decodeUnknown(ListEventInstancesParamsSchema)

// --- Result Schemas ---

export const CreateEventResultSchema = Schema.Struct({
  eventId: EventId
}).annotations({ title: "CreateEventResult", description: "Result of create event operation" })
export type CreateEventResult = Schema.Schema.Type<typeof CreateEventResultSchema>

export const UpdateEventResultSchema = Schema.Struct({
  eventId: EventId,
  updated: Schema.Boolean
}).annotations({ title: "UpdateEventResult", description: "Result of update event operation" })
export type UpdateEventResult = Schema.Schema.Type<typeof UpdateEventResultSchema>

export const DeleteEventResultSchema = Schema.Struct({
  eventId: EventId,
  deleted: Schema.Boolean
}).annotations({ title: "DeleteEventResult", description: "Result of delete event operation" })
export type DeleteEventResult = Schema.Schema.Type<typeof DeleteEventResultSchema>

export const CreateRecurringEventResultSchema = Schema.Struct({
  eventId: EventId
}).annotations({ title: "CreateRecurringEventResult", description: "Result of create recurring event operation" })
export type CreateRecurringEventResult = Schema.Schema.Type<typeof CreateRecurringEventResultSchema>
