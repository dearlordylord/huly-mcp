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

const HrReportStaffScopeRecordSchema = Schema.Struct({ _id: PersonId, department: Schema.optionalKey(DepartmentId) })

export const parseHrReportStaffScopeRecord = Effect.fn("HrReportBoundary.parseStaffScopeRecord")(function* (
  input: unknown
) {
  return yield* Schema.decodeUnknownEffect(HrReportStaffScopeRecordSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "readHrReportStaffScope", entity: "Staff scope", cause })
    )
  )
})

export const parseHrReportStaffRecord = Effect.fn("HrReportBoundary.parseStaffRecord")(function* (
  input: unknown
): Effect.fn.Return<HrReportStaffRecord, HulyDataInvalidError> {
  return yield* Schema.decodeUnknownEffect(HrReportStaffRecordSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "readHrReportStaff", entity: "Staff record", cause })
    )
  )
})
