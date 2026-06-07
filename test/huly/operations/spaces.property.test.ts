import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { toAccountUuid } from "../../../src/huly/operations/sdk-boundary.js"
import { mergeUniqueSortedAccountUuids, removeAccountUuids } from "../../../src/huly/operations/spaces.js"
import { propertyTestParameters } from "../../helpers/property.js"

const accountUuidValue = fc.uuid().map(toAccountUuid)

describe("space member set helper properties", () => {
  it("mergeUniqueSortedAccountUuids is idempotent and sorted", () => {
    fc.assert(
      fc.property(fc.array(accountUuidValue), fc.array(accountUuidValue), (current, additions) => {
        const merged = mergeUniqueSortedAccountUuids(current, additions)
        expect(merged).toEqual([...new Set(merged)].sort())
        expect(mergeUniqueSortedAccountUuids(merged, additions)).toEqual(merged)
      }),
      propertyTestParameters
    )
  })

  it("removeAccountUuids removes only requested values and is idempotent", () => {
    fc.assert(
      fc.property(fc.array(accountUuidValue), fc.array(accountUuidValue), (current, removals) => {
        const removed = removeAccountUuids(current, removals)
        const removalSet = new Set(removals)
        expect(removed.every((value) => !removalSet.has(value))).toBe(true)
        expect(removeAccountUuids(removed, removals)).toEqual(removed)
      }),
      propertyTestParameters
    )
  })
})
