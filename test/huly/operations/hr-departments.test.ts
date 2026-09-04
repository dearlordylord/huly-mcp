import type { Ref } from "@hcengineering/core"
import type { Department as HulyDepartment } from "@hcengineering/hr"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { DepartmentIdentifier, DepartmentPath } from "../../../src/domain/schemas/hr-departments.js"
import { hr } from "../../../src/huly/huly-plugins.js"
import {
  descendantsOf,
  type DepartmentCatalog,
  resolveDepartmentFromCatalog
} from "../../../src/huly/operations/hr-departments-shared.js"
import { corePersonId, docRef, spaceRef } from "../../helpers/huly-sdk.js"

const department = (id: string, name: string, parent?: Ref<HulyDepartment>): HulyDepartment => ({
  _id: docRef<HulyDepartment>(id),
  _class: hr.class.Department,
  space: spaceRef("core:space:Workspace"),
  name,
  description: "",
  ...(parent === undefined ? {} : { parent }),
  teamLead: null,
  managers: [],
  members: [],
  modifiedBy: corePersonId("actor"),
  modifiedOn: 1
})

const root = department("root", "Product", hr.ids.Head)
const child = department("child", "Design", root._id)
const nested = department("nested", "Research", child._id)
const duplicate = department("duplicate", "Design", hr.ids.Head)

const catalog: DepartmentCatalog = {
  departments: [root, child, nested, duplicate],
  byId: new Map([
    [root._id, root],
    [child._id, child],
    [nested._id, nested],
    [duplicate._id, duplicate]
  ]),
  pathById: new Map([
    [root._id, DepartmentPath.make("Product")],
    [child._id, DepartmentPath.make("Product/Design")],
    [nested._id, DepartmentPath.make("Product/Design/Research")],
    [duplicate._id, DepartmentPath.make("Design")]
  ])
}

describe("HR department hierarchy", () => {
  it("resolves an exact full path and stable ID", () => {
    const spacedPath = Schema.decodeUnknownSync(DepartmentIdentifier)(" Product / Design ")
    expect(Effect.runSync(resolveDepartmentFromCatalog(catalog, spacedPath))).toBe(child)
    expect(Effect.runSync(resolveDepartmentFromCatalog(catalog, DepartmentIdentifier.make("nested")))).toBe(nested)
  })

  it("does not select a same-named department outside the requested path", () => {
    expect(Effect.runSync(resolveDepartmentFromCatalog(catalog, DepartmentIdentifier.make("Design")))).toBe(duplicate)
  })

  it("returns every descendant once for destructive impact", () => {
    expect(descendantsOf(catalog, root).map((item) => item._id)).toEqual(["child", "nested"])
  })
})
