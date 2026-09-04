import { Effect, Schema } from "effect"

import {
  Count,
  DepartmentId,
  HrRequestId,
  HrRequestTypeLabelResource,
  HrRequestTypeIdentifier,
  HrRequestTypeValue,
  ObjectClassName,
  PersonId,
  SpaceId,
  Timestamp
} from "../../domain/schemas.js"
import { ColorCode, PersonName } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

const boundedInt = (minimum: number, maximum: number, name: string) =>
  Schema.Int.pipe(
    Schema.check(
      Schema.makeFilter(
        (value) => (value >= minimum && value <= maximum) || `${name} must be between ${minimum} and ${maximum}`
      )
    )
  )
const MAX_TZ_YEAR = 9999
const MAX_TZ_MONTH = 11
const MAX_TZ_DAY = 31
const TzYear = boundedInt(0, MAX_TZ_YEAR, "year").pipe(Schema.brand("HrTzYear"))
const TzMonth = boundedInt(0, MAX_TZ_MONTH, "month").pipe(Schema.brand("HrTzMonth"))
const TzDay = boundedInt(1, MAX_TZ_DAY, "day").pipe(Schema.brand("HrTzDay"))
export const HrTzDateRecordSchema = Schema.Struct({
  year: TzYear,
  month: TzMonth,
  day: TzDay,
  offset: Schema.Int
}).pipe(
  Schema.check(
    Schema.makeFilter((value) => {
      const date = new Date(0)
      date.setUTCHours(0, 0, 0, 0)
      date.setUTCFullYear(value.year, value.month, value.day)
      return (
        (date.getUTCFullYear() === value.year &&
          date.getUTCMonth() === value.month &&
          date.getUTCDate() === value.day) ||
        "Expected a real UTC calendar date"
      )
    })
  )
)
export type HrTzDateRecord = Schema.Schema.Type<typeof HrTzDateRecordSchema>

export const HrRequestTypeRecordSchema = Schema.Struct({
  _id: HrRequestTypeIdentifier,
  label: HrRequestTypeLabelResource,
  value: HrRequestTypeValue,
  color: ColorCode
})
export type HrRequestTypeRecord = Schema.Schema.Type<typeof HrRequestTypeRecordSchema>

export const HrStaffRecordSchema = Schema.Struct({
  _id: PersonId,
  _class: ObjectClassName,
  department: Schema.optionalKey(DepartmentId)
})
export type HrStaffRecord = Schema.Schema.Type<typeof HrStaffRecordSchema>

export const HrRequestEmployeeRecordSchema = Schema.Struct({ _id: PersonId, name: PersonName })
export type HrRequestEmployeeRecord = Schema.Schema.Type<typeof HrRequestEmployeeRecordSchema>

export const HrRequestRecordSchema = Schema.Struct({
  _id: HrRequestId,
  space: SpaceId,
  attachedTo: PersonId,
  attachedToClass: ObjectClassName,
  collection: Schema.Literal("requests"),
  department: DepartmentId,
  type: HrRequestTypeIdentifier,
  description: Schema.String,
  tzDate: HrTzDateRecordSchema,
  tzDueDate: HrTzDateRecordSchema,
  comments: Schema.optional(Count),
  attachments: Schema.optional(Count),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type HrRequestRecord = Schema.Schema.Type<typeof HrRequestRecordSchema>

const parseRecord =
  <S extends Schema.Top>(schema: S, operation: string, entity: string) =>
  (input: unknown): Effect.Effect<S["Type"], HulyDataInvalidError, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((cause) => new HulyDataInvalidError({ operation, entity, cause }))
    )

export const parseHrRequestTypeRecord = parseRecord(HrRequestTypeRecordSchema, "readHrRequestType", "request type")
export const parseHrStaffRecord = parseRecord(HrStaffRecordSchema, "readHrStaff", "Staff record")
export const parseHrRequestEmployeeRecord = parseRecord(
  HrRequestEmployeeRecordSchema,
  "readHrRequestEmployee",
  "Employee record"
)
export const parseHrRequestRecord = parseRecord(HrRequestRecordSchema, "readHrRequest", "HR request")
