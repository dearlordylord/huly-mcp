import { Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { CreateFunnelParamsSchema, UpdateFunnelParamsSchema } from "../../src/domain/schemas/funnels.js"
import { propertyTestParameters } from "../helpers/property.js"

const accountUuidArbitrary = fc.uuid({ version: 4 })
const outsideOwner = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const memberSetArbitrary = fc
  .uniqueArray(accountUuidArbitrary, { minLength: 1, maxLength: 12 })
  .filter((members) => !members.includes(outsideOwner))

describe("funnel administration schema properties", () => {
  it("accepts non-empty memberships exactly when every generated owner is a member", () => {
    fc.assert(
      fc.property(memberSetArbitrary, (members) => {
        const owners = members.filter((_member, index) => index % 2 === 0)
        const result = Schema.decodeUnknownResult(CreateFunnelParamsSchema)({ name: "Generated", members, owners })
        expect(result._tag).toBe("Success")
      }),
      propertyTestParameters
    )
  })

  it("rejects every generated owner that is outside the generated member set", () => {
    fc.assert(
      fc.property(memberSetArbitrary, (members) => {
        const result = Schema.decodeUnknownResult(UpdateFunnelParamsSchema)({
          funnel: "funnel-1",
          members,
          owners: [outsideOwner]
        })
        expect(result._tag).toBe("Failure")
      }),
      propertyTestParameters
    )
  })
})
