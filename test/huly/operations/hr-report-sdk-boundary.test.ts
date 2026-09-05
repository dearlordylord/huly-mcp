import { Effect } from "effect"
import { it } from "@effect/vitest"
import { describe, expect } from "vitest"

import {
  parseHrReportStaffRecord,
  parseHrReportStaffScopeRecord
} from "../../../src/huly/operations/hr-report-sdk-boundary.js"
import { HulyDataInvalidError } from "../../../src/huly/errors.js"

const inheritedStaff = (): unknown =>
  Object.create({
    _id: "employee-1",
    _class: "contact:mixin:Employee",
    name: "Employee,Fixture",
    department: "department-1"
  })

describe("HR report SDK boundary", () => {
  it.effect("retains inherited Huly mixin fields in the scope projection", () =>
    Effect.gen(function* () {
      const scope = yield* parseHrReportStaffScopeRecord(inheritedStaff())
      expect(scope).toEqual({ _id: "employee-1", department: "department-1" })
    })
  )

  it.effect("retains inherited Huly mixin fields in the complete Staff record", () =>
    Effect.gen(function* () {
      const staff = yield* parseHrReportStaffRecord(inheritedStaff())
      expect(staff).toEqual({
        _id: "employee-1",
        _class: "contact:mixin:Employee",
        name: "Employee,Fixture",
        department: "department-1"
      })
    })
  )

  it.effect("maps a malformed Staff scope projection to the typed boundary failure", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseHrReportStaffScopeRecord(null))
      expect(error).toBeInstanceOf(HulyDataInvalidError)
      expect(error).toMatchObject({ operation: "readHrReportStaffScope", entity: "Staff scope" })
    })
  )

  it.effect("maps a malformed complete Staff projection to its distinct typed boundary failure", () =>
    Effect.gen(function* () {
      const incompleteStaff: unknown = {
        _id: "employee-1",
        _class: "contact:mixin:Employee",
        department: "department-1"
      }
      const scope = yield* parseHrReportStaffScopeRecord(incompleteStaff)
      expect(scope).toEqual({ _id: "employee-1", department: "department-1" })
      const error = yield* Effect.flip(parseHrReportStaffRecord(incompleteStaff))
      expect(error).toBeInstanceOf(HulyDataInvalidError)
      expect(error).toMatchObject({ operation: "readHrReportStaff", entity: "Staff record" })
    })
  )
})
