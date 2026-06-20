import { JSONSchema, Schema } from "effect"

import { CalendarName as CalendarNameSchema, ParticipantSchema, RoomReferenceSchema } from "./calendar.js"
import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  CalendarId,
  DEFAULT_LIMIT,
  DurationMinutes,
  hasAtLeastOneDefined,
  hasMutuallyExclusiveFields,
  LimitParam,
  MinuteOfDay,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  PositiveDurationMinutes,
  ScheduleId,
  Timestamp,
  TimeZoneId,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"

export const ScheduleTitle = NonEmptyString.pipe(Schema.brand("ScheduleTitle")).annotations({
  identifier: "ScheduleTitle",
  title: "ScheduleTitle",
  description: "Non-empty calendar schedule title."
})
export type ScheduleTitle = Schema.Schema.Type<typeof ScheduleTitle>

export const ScheduleWeekdayValues = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const
const ScheduleWeekdaySchema = Schema.Literal(...ScheduleWeekdayValues)
export type ScheduleWeekday = typeof ScheduleWeekdayValues[number]
const isScheduleWeekday = Schema.is(ScheduleWeekdaySchema)

// Huly SDK models schedule availability as Record<number, ...>, where 0 is Sunday.
export const HulyScheduleWeekdayKeyValues = ["0", "1", "2", "3", "4", "5", "6"] as const
const HulyScheduleWeekdayKeySchema = Schema.Literal(...HulyScheduleWeekdayKeyValues)
export type HulyScheduleWeekdayKey = typeof HulyScheduleWeekdayKeyValues[number]
const isHulyScheduleWeekdayKey = Schema.is(HulyScheduleWeekdayKeySchema)

export type ScheduleAvailability = Readonly<
  Partial<Record<ScheduleWeekday, ReadonlyArray<ScheduleAvailabilitySlot>>>
>

export type HulyDecodedScheduleAvailability = Readonly<
  Partial<Record<HulyScheduleWeekdayKey, ReadonlyArray<ScheduleAvailabilitySlot>>>
>

const CALENDAR_TARGET_FIELDS = ["calendarId", "calendarName"] as const
const calendarTargetConflictMessage = mutuallyExclusiveFieldsMessage(CALENDAR_TARGET_FIELDS)

const hasCalendarTargetConflict = (params: {
  readonly calendarId?: unknown
  readonly calendarName?: unknown
}): boolean => hasMutuallyExclusiveFields(params, CALENDAR_TARGET_FIELDS)

export const ScheduleAvailabilitySlotSchema = Schema.Struct({
  start: MinuteOfDay.annotations({
    description: "Start minute within the day."
  }),
  end: MinuteOfDay.annotations({
    description: "End minute within the day."
  })
}).pipe(
  Schema.filter((slot) => slot.start < slot.end ? undefined : "Availability slot start must be before end.")
).annotations({
  title: "ScheduleAvailabilitySlot",
  description: "Availability window expressed as minutes within a weekday."
})
export type ScheduleAvailabilitySlot = Schema.Schema.Type<typeof ScheduleAvailabilitySlotSchema>

const ScheduleAvailabilityValueSchema = Schema.Array(ScheduleAvailabilitySlotSchema)

const ScheduleAvailabilitySchema = Schema.Record({
  key: Schema.String,
  value: ScheduleAvailabilityValueSchema
}).pipe(
  Schema.filter((availability) =>
    Object.keys(availability).every(isScheduleWeekday)
      ? undefined
      : `Day key must be one of: ${ScheduleWeekdayValues.join(", ")}.`
  )
).annotations({
  title: "ScheduleAvailability",
  description: "Weekly availability by weekday name. Slot start/end are minutes within the day.",
  jsonSchema: {
    type: "object",
    propertyNames: { enum: [...ScheduleWeekdayValues] },
    additionalProperties: JSONSchema.make(ScheduleAvailabilityValueSchema)
  }
})

export const ScheduleSummarySchema = Schema.Struct({
  scheduleId: ScheduleId,
  title: ScheduleTitle,
  owner: ParticipantSchema,
  meetingDuration: PositiveDurationMinutes,
  meetingInterval: DurationMinutes,
  timeZone: TimeZoneId,
  calendarId: Schema.optional(CalendarId),
  meetingRoom: Schema.optional(RoomReferenceSchema),
  modifiedOn: Schema.optional(Timestamp)
})
export type ScheduleSummary = Schema.Schema.Type<typeof ScheduleSummarySchema>

export const ScheduleDetailsSchema = Schema.Struct({
  scheduleId: ScheduleId,
  title: ScheduleTitle,
  owner: ParticipantSchema,
  meetingDuration: PositiveDurationMinutes,
  meetingInterval: DurationMinutes,
  timeZone: TimeZoneId,
  calendarId: Schema.optional(CalendarId),
  meetingRoom: Schema.optional(RoomReferenceSchema),
  modifiedOn: Schema.optional(Timestamp),
  description: Schema.optional(Schema.String),
  availability: ScheduleAvailabilitySchema,
  createdOn: Schema.optional(Timestamp)
})
export type ScheduleDetails = Schema.Schema.Type<typeof ScheduleDetailsSchema>

const HulyScheduleAvailabilitySchema = Schema.Record({
  key: Schema.String,
  value: ScheduleAvailabilityValueSchema
}).pipe(
  Schema.filter((availability) =>
    Object.keys(availability).every(isHulyScheduleWeekdayKey) ? undefined : "Huly day key must be 0-6."
  )
).annotations({
  title: "HulyScheduleAvailability",
  description: "Decoded Huly calendar schedule availability by numeric weekday key, where 0 is Sunday."
})

export const ListSchedulesParamsSchema = Schema.Struct({
  owner: Schema.optional(NonEmptyString.annotations({
    description:
      "Optional schedule owner locator: employee/person ID, exact display name, or email. Omit to list schedules for all readable owners."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of schedules to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListSchedulesParams",
  description: "List calendar schedules."
})

export type ListSchedulesParams = Schema.Schema.Type<typeof ListSchedulesParamsSchema>

export const GetScheduleParamsSchema = Schema.Struct({
  scheduleId: ScheduleId.annotations({
    description: "Schedule ID."
  })
}).annotations({
  title: "GetScheduleParams",
  description: "Get one calendar schedule by ID."
})

export type GetScheduleParams = Schema.Schema.Type<typeof GetScheduleParamsSchema>

export const CreateScheduleParamsSchema = Schema.Struct({
  owner: Schema.optional(NonEmptyString.annotations({
    description:
      "Schedule owner locator: employee/person ID, exact display name, or email. Omit to use the authenticated user."
  })),
  title: ScheduleTitle.annotations({
    description: "Schedule title."
  }),
  description: Schema.optional(Schema.String.annotations({
    description: "Schedule description."
  })),
  meetingDuration: PositiveDurationMinutes.annotations({
    description: "Default meeting duration in minutes."
  }),
  meetingInterval: DurationMinutes.annotations({
    description: "Minimum interval between meetings in minutes."
  }),
  availability: ScheduleAvailabilitySchema.annotations({
    description: "Weekly schedule availability."
  }),
  timeZone: TimeZoneId.annotations({
    description: "IANA time zone for this schedule."
  }),
  calendarId: Schema.optional(CalendarId.annotations({
    description: "Optional target calendar ID for booked events. Do not provide with calendarName."
  })),
  calendarName: Schema.optional(CalendarNameSchema.annotations({
    description: "Optional target calendar name for booked events. Do not provide with calendarId."
  }))
}).pipe(
  Schema.filter((params) => hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined)
).annotations({
  title: "CreateScheduleParams",
  description: "Create a calendar schedule."
})

export type CreateScheduleParams = Schema.Schema.Type<typeof CreateScheduleParamsSchema>

export const UPDATE_SCHEDULE_FIELDS = [
  "owner",
  "title",
  "description",
  "meetingDuration",
  "meetingInterval",
  "availability",
  "timeZone",
  "calendarId",
  "calendarName"
] as const satisfies ReadonlyArray<
  | "owner"
  | "title"
  | "description"
  | "meetingDuration"
  | "meetingInterval"
  | "availability"
  | "timeZone"
  | "calendarId"
  | "calendarName"
>

export const UpdateScheduleParamsSchema = Schema.Struct({
  scheduleId: ScheduleId.annotations({
    description: "Schedule ID."
  }),
  owner: Schema.optional(NonEmptyString.annotations({
    description: "New schedule owner locator: employee/person ID, exact display name, or email."
  })),
  title: Schema.optional(ScheduleTitle.annotations({
    description: "New schedule title."
  })),
  description: Schema.optional(clearableText("New schedule description.")),
  meetingDuration: Schema.optional(
    PositiveDurationMinutes.annotations({
      description: "New default meeting duration in minutes."
    })
  ),
  meetingInterval: Schema.optional(
    DurationMinutes.annotations({
      description: "New minimum interval between meetings in minutes."
    })
  ),
  availability: Schema.optional(ScheduleAvailabilitySchema.annotations({
    description: "New weekly schedule availability."
  })),
  timeZone: Schema.optional(TimeZoneId.annotations({
    description: "New IANA time zone for this schedule."
  })),
  calendarId: Schema.optional(CalendarId.annotations({
    description: "Move schedule booking target to this calendar ID. Do not provide with calendarName."
  })),
  calendarName: Schema.optional(CalendarNameSchema.annotations({
    description: "Move schedule booking target to this calendar name. Do not provide with calendarId."
  }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_SCHEDULE_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_SCHEDULE_FIELDS)
  ),
  Schema.filter((params) => hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined)
).annotations({
  title: "UpdateScheduleParams",
  description: `Update a calendar schedule. ${atLeastOneUpdateFieldMessage(UPDATE_SCHEDULE_FIELDS)}`
})

export type UpdateScheduleParams = Schema.Schema.Type<typeof UpdateScheduleParamsSchema>
assertUpdateFields<UpdateScheduleParams>()(["scheduleId"], UPDATE_SCHEDULE_FIELDS)

const DeleteScheduleParamsSchema = Schema.Struct({
  scheduleId: ScheduleId.annotations({
    description: "Schedule ID."
  })
}).annotations({
  title: "DeleteScheduleParams",
  description: "Delete a calendar schedule."
})

export type DeleteScheduleParams = Schema.Schema.Type<typeof DeleteScheduleParamsSchema>

export const listSchedulesParamsJsonSchema = JSONSchema.make(ListSchedulesParamsSchema)
export const getScheduleParamsJsonSchema = JSONSchema.make(GetScheduleParamsSchema)
export const createScheduleParamsJsonSchema = withMutuallyExclusiveFields(
  JSONSchema.make(CreateScheduleParamsSchema),
  CALENDAR_TARGET_FIELDS
)
export const updateScheduleParamsJsonSchema = withMutuallyExclusiveFields(
  withAtLeastOneRequired(
    JSONSchema.make(UpdateScheduleParamsSchema),
    UPDATE_SCHEDULE_FIELDS
  ),
  CALENDAR_TARGET_FIELDS
)
export const deleteScheduleParamsJsonSchema = JSONSchema.make(DeleteScheduleParamsSchema)

export const parseListSchedulesParams = Schema.decodeUnknown(ListSchedulesParamsSchema)
export const parseGetScheduleParams = Schema.decodeUnknown(GetScheduleParamsSchema)
export const parseCreateScheduleParams = Schema.decodeUnknown(CreateScheduleParamsSchema)
export const parseUpdateScheduleParams = Schema.decodeUnknown(UpdateScheduleParamsSchema)
export const parseDeleteScheduleParams = Schema.decodeUnknown(DeleteScheduleParamsSchema)
export const parseHulyScheduleAvailability = Schema.decodeUnknown(HulyScheduleAvailabilitySchema, {
  onExcessProperty: "error"
})

export const CreateScheduleResultSchema = Schema.Struct({
  scheduleId: ScheduleId
})
export type CreateScheduleResult = Schema.Schema.Type<typeof CreateScheduleResultSchema>

export const UpdateScheduleResultSchema = Schema.Struct({
  scheduleId: ScheduleId,
  updated: Schema.Boolean
})
export type UpdateScheduleResult = Schema.Schema.Type<typeof UpdateScheduleResultSchema>

export const DeleteScheduleResultSchema = Schema.Struct({
  scheduleId: ScheduleId,
  deleted: Schema.Boolean
})
export type DeleteScheduleResult = Schema.Schema.Type<typeof DeleteScheduleResultSchema>

export const ListSchedulesResultSchema = Schema.Array(ScheduleSummarySchema)
export const GetScheduleResultSchema = ScheduleDetailsSchema
