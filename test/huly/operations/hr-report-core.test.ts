import type { Department } from "@hcengineering/hr"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { DepartmentId } from "../../../src/domain/schemas/hr-departments.js"
import { PublicHolidaySummarySchema } from "../../../src/domain/schemas/hr-holidays.js"
import { HrCalendarDate, HrRequestSummarySchema } from "../../../src/domain/schemas/hr-requests.js"
import { hr } from "../../../src/huly/huly-plugins.js"
import { applicableHolidayDates, hrRequestMeasures, hrTypeTotals } from "../../../src/huly/operations/hr-report-core.js"
import { corePersonId, docRef, spaceRef } from "../../helpers/huly-sdk.js"

const request = (value: number, id = "request-type-1", label = "Leave") =>
  Schema.decodeSync(HrRequestSummarySchema)({
    id: "request-1",
    employee: { id: "employee-1", name: "Alice" },
    department: { id: "department-1", path: "Product" },
    requestType: {
      id,
      label,
      labelLocale: "en",
      labelResource: "embedded:embedded:Leave",
      value,
      color: 1,
      mutationSupported: false,
      mutationReason: "Installed model document"
    },
    startDate: "2026-09-04",
    endDate: "2026-09-07",
    description: "",
    comments: 0,
    attachments: 0
  })

const date = (value: string): HrCalendarDate => Schema.decodeSync(HrCalendarDate)(value)

const department = (id: string, name: string, parent = hr.ids.Head): Department => ({
  _id: docRef<Department>(id),
  _class: hr.class.Department,
  space: spaceRef("core:space:Workspace"),
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1,
  name,
  description: "",
  parent,
  teamLead: null,
  members: [],
  subscribers: [],
  managers: []
})

describe("HR report calendar semantics", () => {
  it("clips ranges and counts negative request types on non-holiday weekdays", () => {
    const result = hrRequestMeasures(
      request(-1),
      date("2026-09-04"),
      date("2026-09-07"),
      new Set<HrCalendarDate>([date("2026-09-04")])
    )
    expect(result).toEqual({ calendarDays: 4, workdays: 1, units: -1 })
  })

  it("counts positive request types on calendar days while still reporting workdays", () => {
    const result = hrRequestMeasures(
      request(2),
      date("2026-09-04"),
      date("2026-09-07"),
      new Set<HrCalendarDate>([date("2026-09-04")])
    )
    expect(result).toEqual({ calendarDays: 4, workdays: 1, units: 8 })
  })

  it("counts only the portion overlapping the requested report range", () => {
    const result = hrRequestMeasures(request(-1), date("2026-09-07"), date("2026-09-08"), new Set<HrCalendarDate>())
    expect(result).toEqual({ calendarDays: 1, workdays: 1, units: -1 })
    expect(hrRequestMeasures(request(-1), date("2026-09-03"), date("2026-09-04"), new Set<HrCalendarDate>())).toEqual({
      calendarDays: 1,
      workdays: 1,
      units: -1
    })
  })

  it("returns zero measures outside the report range and for zero-valued request types", () => {
    expect(hrRequestMeasures(request(-1), date("2026-09-08"), date("2026-09-09"), new Set<HrCalendarDate>())).toEqual({
      calendarDays: 0,
      workdays: 0,
      units: 0
    })
    expect(hrRequestMeasures(request(0), date("2026-09-04"), date("2026-09-07"), new Set<HrCalendarDate>())).toEqual({
      calendarDays: 4,
      workdays: 2,
      units: 0
    })
  })

  it("groups repeated request types and sorts totals by their labels", () => {
    const totals = hrTypeTotals(
      [request(-1), request(-1), request(2, "request-type-2", "Allowance")],
      date("2026-09-04"),
      date("2026-09-07"),
      new Set<HrCalendarDate>([date("2026-09-04")])
    )
    expect(totals).toEqual([
      {
        requestType: { id: "request-type-2", label: "Allowance" },
        requestCount: 1,
        calendarDays: 4,
        workdays: 1,
        units: 8
      },
      {
        requestType: { id: "request-type-1", label: "Leave" },
        requestCount: 2,
        calendarDays: 8,
        workdays: 2,
        units: -2
      }
    ])
  })

  it("inherits holiday dates from every ancestor but never from siblings or descendants", () => {
    const root = department("root", "Root")
    const child = department("child", "Child", root._id)
    const grandchild = department("grandchild", "Grandchild", child._id)
    const sibling = department("sibling", "Sibling", root._id)
    const catalog = new Map([root, child, grandchild, sibling].map((item) => [item._id, item]))
    const holidays = [
      { id: "root-holiday", date: "2026-09-01", owner: root },
      { id: "child-holiday", date: "2026-09-02", owner: child },
      { id: "grandchild-holiday", date: "2026-09-03", owner: grandchild },
      { id: "sibling-holiday", date: "2026-09-04", owner: sibling }
    ].map(({ date: holidayDate, id, owner }) =>
      Schema.decodeSync(PublicHolidaySummarySchema)({
        id,
        title: id,
        description: "",
        date: holidayDate,
        department: { id: owner._id, path: owner.name }
      })
    )

    expect([...applicableHolidayDates(DepartmentId.make(child._id), holidays, catalog, true)]).toEqual([
      "2026-09-01",
      "2026-09-02"
    ])
    expect([...applicableHolidayDates(DepartmentId.make(child._id), holidays, catalog, false)]).toEqual(["2026-09-02"])
  })
})
