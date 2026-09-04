import { Effect, Schema } from "effect"

import {
  DepartmentId,
  NonEmptyString,
  ObjectClassName,
  PublicHolidayId,
  SpaceId,
  Timestamp
} from "../../domain/schemas.js"
import { HulyDataInvalidError } from "../errors.js"
import { HrTzDateRecordSchema } from "./hr-request-sdk-boundary.js"

export const PublicHolidayRecordSchema = Schema.Struct({
  _id: PublicHolidayId,
  _class: ObjectClassName,
  space: SpaceId,
  title: NonEmptyString,
  description: Schema.String,
  date: HrTzDateRecordSchema,
  department: DepartmentId,
  modifiedOn: Schema.optional(Timestamp)
})
export type PublicHolidayRecord = Schema.Schema.Type<typeof PublicHolidayRecordSchema>

export const parsePublicHolidayRecord = Effect.fn("HrHolidayBoundary.parsePublicHolidayRecord")(function* (
  input: unknown
): Effect.fn.Return<PublicHolidayRecord, HulyDataInvalidError> {
  return yield* Schema.decodeUnknownEffect(PublicHolidayRecordSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "readPublicHoliday", entity: "public holiday", cause })
    )
  )
})
