import { Effect, Schema } from "effect"

import {
  Count,
  DepartmentId,
  HrRequestId,
  HrRequestTypeIdentifier,
  NonEmptyString,
  NonNegativeInteger,
  PersonId,
  SpaceId,
  Timestamp
} from "../../domain/schemas.js"
import { ColorCode } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

const TzDateSchema = Schema.Struct({
  year: NonNegativeInteger,
  month: NonNegativeInteger,
  day: NonNegativeInteger,
  offset: Schema.Int
})

export const HrRequestTypeRecordSchema = Schema.Struct({
  _id: HrRequestTypeIdentifier,
  label: NonEmptyString,
  value: Schema.Number,
  color: ColorCode
})
export type HrRequestTypeRecord = Schema.Schema.Type<typeof HrRequestTypeRecordSchema>

export const HrStaffRecordSchema = Schema.Struct({
  _id: PersonId,
  _class: NonEmptyString,
  department: Schema.optionalKey(DepartmentId)
})
export type HrStaffRecord = Schema.Schema.Type<typeof HrStaffRecordSchema>

export const HrRequestRecordSchema = Schema.Struct({
  _id: HrRequestId,
  space: SpaceId,
  attachedTo: PersonId,
  attachedToClass: NonEmptyString,
  collection: NonEmptyString,
  department: DepartmentId,
  type: HrRequestTypeIdentifier,
  description: Schema.String,
  tzDate: TzDateSchema,
  tzDueDate: TzDateSchema,
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
export const parseHrRequestRecord = parseRecord(HrRequestRecordSchema, "readHrRequest", "HR request")
