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

const projectStaffScope = (input: unknown): unknown => {
  if (typeof input !== "object" || input === null) return input
  const department = Reflect.get(input, "department")
  return department === undefined ? { _id: Reflect.get(input, "_id") } : { _id: Reflect.get(input, "_id"), department }
}

const projectStaffRecord = (input: unknown): unknown =>
  typeof input === "object" && input !== null
    ? {
        _id: Reflect.get(input, "_id"),
        _class: Reflect.get(input, "_class"),
        name: Reflect.get(input, "name"),
        department: Reflect.get(input, "department")
      }
    : input

export const parseHrReportStaffScopeRecord = Effect.fn("HrReportBoundary.parseStaffScopeRecord")(function* (
  input: unknown
) {
  return yield* Schema.decodeUnknownEffect(HrReportStaffScopeRecordSchema)(projectStaffScope(input)).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "readHrReportStaffScope", entity: "Staff scope", cause })
    )
  )
})

export const parseHrReportStaffRecord = Effect.fn("HrReportBoundary.parseStaffRecord")(function* (
  input: unknown
): Effect.fn.Return<HrReportStaffRecord, HulyDataInvalidError> {
  return yield* Schema.decodeUnknownEffect(HrReportStaffRecordSchema)(projectStaffRecord(input)).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "readHrReportStaff", entity: "Staff record", cause })
    )
  )
})
