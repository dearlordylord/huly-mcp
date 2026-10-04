import type { Hierarchy } from "@hcengineering/core"
import { Result } from "effect"
import { expect, it } from "vitest"
import { parseMovementHistoryAttributes } from "../../src/huly/issue-movement-history-attributes.js"
import { sdkFixture } from "../helpers/huly-sdk.js"

const hierarchy = (attributes: ReadonlyMap<string, unknown>, unavailable = false) =>
  sdkFixture<Hierarchy>({
    findAttribute: (_class: unknown, key: string) => {
      if (unavailable) throw new Error("Model unavailable")
      return attributes.get(key)
    },
    isDerived: (cls: unknown) => cls === "core:class:ArrOf"
  })

it("captures model-declared reference, array and scalar types while excluding hidden and missing fields", () => {
  const model = hierarchy(
    new Map<string, unknown>([
      ["attachedTo", { type: { _class: "core:class:RefTo", to: "tracker:class:Issue" } }],
      ["parents", { type: { _class: "core:class:ArrOf", of: { _class: "core:class:TypeString" } } }],
      ["nested", { type: { _class: "core:class:Other", of: { to: "tracker:class:Project" } } }],
      ["number", { type: { _class: "core:class:TypeNumber" } }],
      ["hidden", { hidden: true, type: { _class: "core:class:TypeString" } }]
    ])
  )
  const result = parseMovementHistoryAttributes(model, {
    attachedTo: "parent",
    parents: [],
    nested: "project",
    number: 1,
    hidden: "value",
    missing: "value",
    $inc: { subIssues: 1 }
  })
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result))
    expect(result.success).toEqual([
      { attrKey: "attachedTo", attrClass: "tracker:class:Issue" },
      { attrKey: "parents", attrClass: "core:class:TypeString" },
      { attrKey: "nested", attrClass: "tracker:class:Project" },
      { attrKey: "number", attrClass: "core:class:TypeNumber" }
    ])
})

it("matches activity operator key discovery and deduplicates repeated changed fields", () => {
  const model = hierarchy(new Map<string, unknown>([["children", { type: { _class: "core:class:TypeString" } }]]))
  const result = parseMovementHistoryAttributes(model, {
    $push: { children: "a" },
    $pull: { children: "b" },
    $unset: { children: true },
    $set: { ignored: "x" }
  })
  expect(Result.isSuccess(result)).toBe(true)
  if (Result.isSuccess(result))
    expect(result.success).toEqual([{ attrKey: "children", attrClass: "core:class:TypeString" }])
})

for (const type of [{ _class: "core:class:ArrOf" }, { _class: 42 }]) {
  it("refuses malformed declared metadata rather than authenticating with a guessed class", () => {
    const result = parseMovementHistoryAttributes(hierarchy(new Map<string, unknown>([["parents", { type }]])), {
      parents: []
    })
    expect(Result.isFailure(result)).toBe(true)
  })
}

it("returns a typed model failure when hierarchy lookup fails", () => {
  const result = parseMovementHistoryAttributes(hierarchy(new Map<string, unknown>(), true), { attachedTo: "parent" })
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("HulyDataInvalidError")
})
