import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import { CalendarName as CalendarNameSchema, ParticipantSchema, RoomReferenceSchema } from "./calendar.js"
import { MeetingRoomLocatorSchema } from "./calendar-meeting-rooms.js"
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

export const ScheduleTitle = NonEmptyString.pipe(Schema.brand("ScheduleTitle")).annotate({
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
const ScheduleWeekdaySchema = Schema.Literals(ScheduleWeekdayValues)
export type ScheduleWeekday = (typeof ScheduleWeekdayValues)[number]
const isScheduleWeekday = Schema.is(ScheduleWeekdaySchema)

// Huly SDK models schedule availability as Record<number, ...>, where 0 is Sunday.
export const HulyScheduleWeekdayKeyValues = ["0", "1", "2", "3", "4", "5", "6"] as const
const HulyScheduleWeekdayKeySchema = Schema.Literals(HulyScheduleWeekdayKeyValues)
export type HulyScheduleWeekdayKey = (typeof HulyScheduleWeekdayKeyValues)[number]
const isHulyScheduleWeekdayKey = Schema.is(HulyScheduleWeekdayKeySchema)

export type ScheduleAvailability = Readonly<Partial<Record<ScheduleWeekday, ReadonlyArray<ScheduleAvailabilitySlot>>>>

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
  start: MinuteOfDay.annotate({ description: "Start minute within the day." }),
  end: MinuteOfDay.annotate({ description: "End minute within the day." })
})
  .pipe(
    Schema.check(
      Schema.makeFilter((slot) => (slot.start < slot.end ? undefined : "Availability slot start must be before end."))
    )
  )
  .annotate({
    title: "ScheduleAvailabilitySlot",
    description: "Availability window expressed as minutes within a weekday."
  })
export type ScheduleAvailabilitySlot = Schema.Schema.Type<typeof ScheduleAvailabilitySlotSchema>

const ScheduleAvailabilityValueSchema = Schema.Array(ScheduleAvailabilitySlotSchema)

const ScheduleAvailabilitySchema = Schema.Record(Schema.String, ScheduleAvailabilityValueSchema)
  .pipe(
    Schema.check(
      Schema.makeFilter((availability) =>
        Object.keys(availability).every(isScheduleWeekday)
          ? undefined
          : `Day key must be one of: ${ScheduleWeekdayValues.join(", ")}.`
      )
    )
  )
  .annotate({
    title: "ScheduleAvailability",
    description: "Weekly availability by weekday name. Slot start/end are minutes within the day.",
    jsonSchema: {
      type: "object",
      propertyNames: { enum: [...ScheduleWeekdayValues] },
      additionalProperties: toDraft07JsonSchema(ScheduleAvailabilityValueSchema)
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

const HulyScheduleAvailabilitySchema = Schema.Record(Schema.String, ScheduleAvailabilityValueSchema)
  .pipe(
    Schema.check(
      Schema.makeFilter((availability) =>
        Object.keys(availability).every(isHulyScheduleWeekdayKey) ? undefined : "Huly day key must be 0-6."
      )
    )
  )
  .annotate({
    title: "HulyScheduleAvailability",
    description: "Decoded Huly calendar schedule availability by numeric weekday key, where 0 is Sunday."
  })

export const ListSchedulesParamsSchema = Schema.Struct({
  owner: Schema.optional(
    NonEmptyString.annotate({
      description:
        "Optional schedule owner locator: employee/person ID, exact display name, or email. Omit to list schedules for all readable owners."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of schedules to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListSchedulesParams", description: "List calendar schedules." })

export type ListSchedulesParams = Schema.Schema.Type<typeof ListSchedulesParamsSchema>

export const GetScheduleParamsSchema = Schema.Struct({
  scheduleId: ScheduleId.annotate({ description: "Schedule ID." })
}).annotate({ title: "GetScheduleParams", description: "Get one calendar schedule by ID." })

export type GetScheduleParams = Schema.Schema.Type<typeof GetScheduleParamsSchema>

export const CreateScheduleParamsSchema = Schema.Struct({
  owner: Schema.optional(
    NonEmptyString.annotate({
      description:
        "Schedule owner locator: employee/person ID, exact display name, or email. Omit to use the authenticated user."
    })
  ),
  title: ScheduleTitle.annotate({ description: "Schedule title." }),
  description: Schema.optional(Schema.String.annotate({ description: "Schedule description." })),
  meetingDuration: PositiveDurationMinutes.annotate({ description: "Default meeting duration in minutes." }),
  meetingInterval: DurationMinutes.annotate({ description: "Minimum interval between meetings in minutes." }),
  availability: ScheduleAvailabilitySchema.annotate({ description: "Weekly schedule availability." }),
  timeZone: TimeZoneId.annotate({ description: "IANA time zone for this schedule." }),
  calendarId: Schema.optional(
    CalendarId.annotate({
      description: "Optional target calendar ID for booked events. Do not provide with calendarName."
    })
  ),
  calendarName: Schema.optional(
    CalendarNameSchema.annotate({
      description: "Optional target calendar name for booked events. Do not provide with calendarId."
    })
  ),
  meetingRoom: Schema.optionalKey(
    MeetingRoomLocatorSchema.annotateKey({
      description:
        "Optional virtual-office meeting room. Resolution tries ID first, then exact name; use floor to disambiguate duplicate names."
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) => (hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined))
    )
  )
  .annotate({ title: "CreateScheduleParams", description: "Create a calendar schedule." })

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
  "calendarName",
  "meetingRoom"
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
  | "meetingRoom"
>

export const UpdateScheduleParamsSchema = Schema.Struct({
  scheduleId: ScheduleId.annotate({ description: "Schedule ID." }),
  owner: Schema.optional(
    NonEmptyString.annotate({
      description: "New schedule owner locator: employee/person ID, exact display name, or email."
    })
  ),
  title: Schema.optional(ScheduleTitle.annotate({ description: "New schedule title." })),
  description: Schema.optional(clearableText("New schedule description.")),
  meetingDuration: Schema.optional(
    PositiveDurationMinutes.annotate({ description: "New default meeting duration in minutes." })
  ),
  meetingInterval: Schema.optional(
    DurationMinutes.annotate({ description: "New minimum interval between meetings in minutes." })
  ),
  availability: Schema.optional(
    ScheduleAvailabilitySchema.annotate({ description: "New weekly schedule availability." })
  ),
  timeZone: Schema.optional(TimeZoneId.annotate({ description: "New IANA time zone for this schedule." })),
  calendarId: Schema.optional(
    CalendarId.annotate({
      description: "Move schedule booking target to this calendar ID. Do not provide with calendarName."
    })
  ),
  calendarName: Schema.optional(
    CalendarNameSchema.annotate({
      description: "Move schedule booking target to this calendar name. Do not provide with calendarId."
    })
  ),
  meetingRoom: Schema.optionalKey(
    MeetingRoomLocatorSchema.annotateKey({
      description:
        "Assign a different virtual-office room to an existing MeetingSchedule. Ordinary schedules without MeetingSchedule composition are rejected; omission preserves the current assignment and null is not accepted."
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_SCHEDULE_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_SCHEDULE_FIELDS)
      )
    ),
    Schema.check(
      Schema.makeFilter((params) => (hasCalendarTargetConflict(params) ? calendarTargetConflictMessage : undefined))
    )
  )
  .annotate({
    title: "UpdateScheduleParams",
    description: `Update a calendar schedule. ${atLeastOneUpdateFieldMessage(UPDATE_SCHEDULE_FIELDS)}`
  })

export type UpdateScheduleParams = Schema.Schema.Type<typeof UpdateScheduleParamsSchema>
assertUpdateFields<UpdateScheduleParams>()(["scheduleId"], UPDATE_SCHEDULE_FIELDS)

const DeleteScheduleParamsSchema = Schema.Struct({
  scheduleId: ScheduleId.annotate({ description: "Schedule ID." })
}).annotate({ title: "DeleteScheduleParams", description: "Delete a calendar schedule." })

export type DeleteScheduleParams = Schema.Schema.Type<typeof DeleteScheduleParamsSchema>

export const listSchedulesParamsJsonSchema = toDraft07JsonSchema(ListSchedulesParamsSchema)
export const getScheduleParamsJsonSchema = toDraft07JsonSchema(GetScheduleParamsSchema)
export const createScheduleParamsJsonSchema = withMutuallyExclusiveFields(
  toDraft07JsonSchema(CreateScheduleParamsSchema),
  CALENDAR_TARGET_FIELDS
)
export const updateScheduleParamsJsonSchema = withMutuallyExclusiveFields(
  withAtLeastOneRequired(toDraft07JsonSchema(UpdateScheduleParamsSchema), UPDATE_SCHEDULE_FIELDS),
  CALENDAR_TARGET_FIELDS
)
export const deleteScheduleParamsJsonSchema = toDraft07JsonSchema(DeleteScheduleParamsSchema)

export const parseListSchedulesParams = Schema.decodeUnknownEffect(ListSchedulesParamsSchema)
export const parseGetScheduleParams = Schema.decodeUnknownEffect(GetScheduleParamsSchema)
export const parseCreateScheduleParams = Schema.decodeUnknownEffect(CreateScheduleParamsSchema)
export const parseUpdateScheduleParams = Schema.decodeUnknownEffect(UpdateScheduleParamsSchema)
export const parseDeleteScheduleParams = Schema.decodeUnknownEffect(DeleteScheduleParamsSchema)
export const parseHulyScheduleAvailability = Schema.decodeUnknownEffect(HulyScheduleAvailabilitySchema, {
  onExcessProperty: "error"
})

export const CreateScheduleResultSchema = Schema.Struct({ scheduleId: ScheduleId })
export type CreateScheduleResult = Schema.Schema.Type<typeof CreateScheduleResultSchema>

export const UpdateScheduleResultSchema = Schema.Struct({ scheduleId: ScheduleId, updated: Schema.Boolean })
export type UpdateScheduleResult = Schema.Schema.Type<typeof UpdateScheduleResultSchema>

export const DeleteScheduleResultSchema = Schema.Struct({ scheduleId: ScheduleId, deleted: Schema.Boolean })
export type DeleteScheduleResult = Schema.Schema.Type<typeof DeleteScheduleResultSchema>

export const ListSchedulesResultSchema = Schema.Array(ScheduleSummarySchema)
export const GetScheduleResultSchema = ScheduleDetailsSchema
