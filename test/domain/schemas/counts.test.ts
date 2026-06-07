import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { OrganizationSummarySchema } from "../../../src/domain/schemas/contact-organizations.js"
import { Count, ListTotal, UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { SpaceSummarySchema, SpaceTypeSummarySchema } from "../../../src/domain/schemas/spaces.js"

describe("Count schemas", () => {
  it("accepts non-negative integers", () => {
    expect(Schema.decodeUnknownSync(Count)(0)).toBe(0)
    expect(Schema.decodeUnknownSync(Count)(12)).toBe(12)
    expect(Schema.decodeUnknownSync(ListTotal)(3)).toBe(3)
  })

  it("rejects negative and fractional values", () => {
    expect(() => Schema.decodeUnknownSync(Count)(-1)).toThrow()
    expect(() => Schema.decodeUnknownSync(Count)(1.5)).toThrow()
    expect(() => Schema.decodeUnknownSync(ListTotal)(-2)).toThrow()
    expect(() => Schema.decodeUnknownSync(ListTotal)(1.5)).toThrow()
  })

  it("allows the unknown total sentinel only for list totals", () => {
    expect(Schema.decodeUnknownSync(ListTotal)(UNKNOWN_TOTAL)).toBe(UNKNOWN_TOTAL)
    expect(() => Schema.decodeUnknownSync(Count)(UNKNOWN_TOTAL)).toThrow()
  })

  it("validates organization member counts", () => {
    const organization = {
      id: "org-1",
      name: "Acme",
      members: 0,
      url: "https://example.com"
    }

    expect(Schema.decodeUnknownSync(OrganizationSummarySchema)(organization).members).toBe(0)
    expect(() => Schema.decodeUnknownSync(OrganizationSummarySchema)({ ...organization, members: -1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(OrganizationSummarySchema)({ ...organization, members: 2.5 })).toThrow()
  })

  it("validates space summary counts", () => {
    const space = {
      id: "space-1",
      name: "Roadmap",
      class: "tracker:class:Project",
      private: false,
      archived: false,
      membersCount: 1,
      ownersCount: 0
    }

    expect(Schema.decodeUnknownSync(SpaceSummarySchema)(space).membersCount).toBe(1)
    expect(() => Schema.decodeUnknownSync(SpaceSummarySchema)({ ...space, membersCount: -1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(SpaceSummarySchema)({ ...space, ownersCount: 0.5 })).toThrow()
  })

  it("validates space type role counts", () => {
    const spaceType = {
      id: "space-type-1",
      name: "Project",
      descriptor: "tracker:class:ProjectTypeDescriptor",
      targetClass: "tracker:class:Project",
      defaultMembers: [],
      rolesCount: 0
    }

    expect(Schema.decodeUnknownSync(SpaceTypeSummarySchema)(spaceType).rolesCount).toBe(0)
    expect(() => Schema.decodeUnknownSync(SpaceTypeSummarySchema)({ ...spaceType, rolesCount: -1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(SpaceTypeSummarySchema)({ ...spaceType, rolesCount: 1.25 })).toThrow()
  })
})
