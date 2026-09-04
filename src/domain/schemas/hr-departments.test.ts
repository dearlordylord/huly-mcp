import { Effect, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  AssignStaffDepartmentParamsSchema,
  CreateDepartmentParamsSchema,
  DeleteDepartmentParamsSchema,
  DepartmentName,
  parseUpdateDepartmentParams
} from "./hr-departments.js"

describe("HR department schemas", () => {
  it("reserves slash for unambiguous department paths", () => {
    expect(() => Schema.decodeUnknownSync(DepartmentName)("Product/Design")).toThrow()
    expect(Schema.decodeUnknownSync(DepartmentName)("  Product  ")).toBe("Product")
  })

  it("keeps destructive preview and execution states distinct", () => {
    expect(Schema.decodeUnknownSync(DeleteDepartmentParamsSchema)({ department: "Product" })).toEqual({
      department: "Product"
    })
    expect(() =>
      Schema.decodeUnknownSync(DeleteDepartmentParamsSchema)({ department: "Product", execute: true })
    ).toThrow()
    expect(
      Schema.decodeUnknownSync(DeleteDepartmentParamsSchema)({
        department: "Product",
        execute: true,
        expectedSubdepartments: 2,
        expectedAssignedStaff: 3
      })
    ).toMatchObject({ execute: true, expectedSubdepartments: 2, expectedAssignedStaff: 3 })
  })

  it("distinguishes omitted relationship updates from explicit clears", () => {
    expect(Schema.decodeUnknownSync(CreateDepartmentParamsSchema)({ name: "Product", teamLead: null })).toMatchObject({
      teamLead: null
    })
    expect(
      Schema.decodeUnknownSync(AssignStaffDepartmentParamsSchema)({ employee: "Doe,Jane", department: null })
    ).toMatchObject({ department: null })
    const missing = Effect.runSync(Effect.result(parseUpdateDepartmentParams({ department: "Product" })))
    expect(Result.isFailure(missing)).toBe(true)
  })
})
