import { Effect } from "effect"
import { it } from "@effect/vitest"
import { describe, expect } from "vitest"

import {
  parseHrReportStaffRecord,
  parseHrReportStaffScopeRecord
} from "../../../src/huly/operations/hr-report-sdk-boundary.js"

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
})
