import { Effect, Schema } from "effect"

import { DepartmentId, ObjectClassName, PersonId } from "../../domain/schemas.js"
import { PersonName } from "../../domain/schemas/shared.js"
import { HulyDataInvalidError } from "../errors.js"

export const HrReportStaffRecordSchema = Schema.Struct({
  _id: PersonId,
  _class: ObjectClassName,
  name: PersonName,
  department: DepartmentId
})
export type HrReportStaffRecord = Schema.Schema.Type<typeof HrReportStaffRecordSchema>

export const parseHrReportStaffRecord = Effect.fn("HrReportBoundary.parseStaffRecord")(function* (
  input: unknown
): Effect.fn.Return<HrReportStaffRecord, HulyDataInvalidError> {
  return yield* Schema.decodeUnknownEffect(HrReportStaffRecordSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "readHrReportStaff", entity: "Staff record", cause })
    )
  )
})
