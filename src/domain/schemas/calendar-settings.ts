import { Schema } from "effect"

import { parseJsonSchemaRecord, toDraft07EmptyObjectJsonSchema, toDraft07JsonSchema } from "./json-schema.js"

import { CalendarAccessSchema, CalendarName, VisibilitySchema } from "./calendar.js"
import { CalendarId, EmptyParamsSchema, hasAtLeastOneDefined, PersonId, withAtLeastOneRequired } from "./shared.js"

export const CalendarSettingsKindValues = ["internal", "external"] as const
export const CalendarSettingsKindSchema = Schema.Literals(CalendarSettingsKindValues).annotate({
  title: "CalendarSettingsKind",
  description: "Calendar class kind: internal or external provider calendar."
})
export type CalendarSettingsKind = Schema.Schema.Type<typeof CalendarSettingsKindSchema>

export const CalendarSettingsSummarySchema = Schema.Struct({
  calendarId: CalendarId,
  name: CalendarName,
  kind: CalendarSettingsKindSchema,
  hidden: Schema.Boolean,
  visibility: VisibilitySchema,
  user: PersonId,
  access: CalendarAccessSchema,
  isPrimary: Schema.Boolean
}).annotate({
  title: "CalendarSettingsSummary",
  description:
    "Caller-owned Calendar settings, including hidden and read-only rows, without provider-owned identifiers or defaults."
})
export type CalendarSettingsSummary = Schema.Schema.Type<typeof CalendarSettingsSummarySchema>

const StrictEmptyCalendarSettingsParamsSchema = EmptyParamsSchema.pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      Object.keys(params).length === 0 ? undefined : "Calendar settings listing does not accept parameters."
    )
  )
)

export const ListCalendarSettingsParamsSchema = StrictEmptyCalendarSettingsParamsSchema.annotate({
  title: "ListCalendarSettingsParams",
  description: "Parameters for listing the authenticated caller's Calendar settings."
})
export type ListCalendarSettingsParams = Schema.Schema.Type<typeof ListCalendarSettingsParamsSchema>

const CalendarIdTargetSchema = Schema.Struct({
  calendarId: CalendarId.annotate({ description: "Caller-owned calendar ID." }),
  calendarName: Schema.optionalKey(Schema.Never)
})

const CalendarNameTargetSchema = Schema.Struct({
  calendarId: Schema.optionalKey(Schema.Never),
  calendarName: CalendarName.annotate({ description: "Exact caller-owned calendar name; must resolve unambiguously." })
})

export const CalendarSettingsTargetSchema = Schema.Union([CalendarIdTargetSchema, CalendarNameTargetSchema]).annotate({
  title: "CalendarSettingsTarget",
  description: "Identify one caller-owned calendar by ID or exact unambiguous name, but never both.",
  jsonSchema: {
    oneOf: [
      { type: "object", required: ["calendarId"] },
      { type: "object", required: ["calendarName"] }
    ]
  }
})
export type CalendarSettingsTarget = Schema.Schema.Type<typeof CalendarSettingsTargetSchema>

export const SetPrimaryCalendarParamsSchema = CalendarSettingsTargetSchema.annotate({
  title: "SetPrimaryCalendarParams",
  description: "Select one visible, caller-owned, writable calendar as the primary calendar."
})
export type SetPrimaryCalendarParams = Schema.Schema.Type<typeof SetPrimaryCalendarParamsSchema>

export const UPDATE_CALENDAR_SETTINGS_FIELDS = ["visibility", "hidden"] as const

const CalendarSettingsUpdateFields = {
  visibility: Schema.optionalKey(
    VisibilitySchema.annotate({ description: "Local event visibility: public, freeBusy, or private." })
  ),
  hidden: Schema.optionalKey(
    Schema.Boolean.annotate({ description: "Hide or show this calendar. Internal Calendar rows cannot be hidden." })
  )
}

const UpdateCalendarSettingsByIdSchema = Schema.Struct({
  ...CalendarIdTargetSchema.fields,
  ...CalendarSettingsUpdateFields
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_CALENDAR_SETTINGS_FIELDS)
        ? undefined
        : "Provide at least one of visibility or hidden."
    )
  )
)

const UpdateCalendarSettingsByNameSchema = Schema.Struct({
  ...CalendarNameTargetSchema.fields,
  ...CalendarSettingsUpdateFields
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_CALENDAR_SETTINGS_FIELDS)
        ? undefined
        : "Provide at least one of visibility or hidden."
    )
  )
)

export const UpdateCalendarSettingsParamsSchema = Schema.Union([
  UpdateCalendarSettingsByIdSchema,
  UpdateCalendarSettingsByNameSchema
]).annotate({
  title: "UpdateCalendarSettingsParams",
  description: "Update local visibility and hidden settings on one caller-owned calendar."
})
export type UpdateCalendarSettingsParams = Schema.Schema.Type<typeof UpdateCalendarSettingsParamsSchema>

export const listCalendarSettingsParamsJsonSchema = toDraft07EmptyObjectJsonSchema(ListCalendarSettingsParamsSchema)
export const setPrimaryCalendarParamsJsonSchema = toDraft07JsonSchema(SetPrimaryCalendarParamsSchema)
const updateCalendarSettingsJsonSchema = toDraft07JsonSchema(UpdateCalendarSettingsParamsSchema)
const updateCalendarSettingsJsonSchemaRecord = parseJsonSchemaRecord(updateCalendarSettingsJsonSchema)
const updateCalendarSettingsVariants = updateCalendarSettingsJsonSchemaRecord?.anyOf
export const updateCalendarSettingsParamsJsonSchema =
  updateCalendarSettingsVariants === undefined || !Array.isArray(updateCalendarSettingsVariants)
    ? updateCalendarSettingsJsonSchema
    : {
        ...updateCalendarSettingsJsonSchemaRecord,
        anyOf: updateCalendarSettingsVariants.map((variant) =>
          withAtLeastOneRequired(parseJsonSchemaRecord(variant) ?? {}, UPDATE_CALENDAR_SETTINGS_FIELDS)
        )
      }

export const parseListCalendarSettingsParams = Schema.decodeUnknownEffect(ListCalendarSettingsParamsSchema, {
  onExcessProperty: "error"
})
export const parseSetPrimaryCalendarParams = Schema.decodeUnknownEffect(SetPrimaryCalendarParamsSchema, {
  onExcessProperty: "error"
})
export const parseUpdateCalendarSettingsParams = Schema.decodeUnknownEffect(UpdateCalendarSettingsParamsSchema, {
  onExcessProperty: "error"
})
