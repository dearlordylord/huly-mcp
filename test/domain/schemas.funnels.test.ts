import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  parseCreateFunnelParams,
  parseDeleteFunnelParams,
  parseFunnelMutationParams,
  parseGetFunnelParams,
  parseUpdateFunnelParams,
  updateFunnelParamsJsonSchema
} from "../../src/domain/schemas/funnels.js"

const member = "00000000-0000-4000-8000-000000000001"
const owner = "00000000-0000-4000-8000-000000000002"

describe("funnel administration schemas", () => {
  it.effect("parses create, exact lookup, and mutation inputs", () =>
    Effect.gen(function* () {
      const created = yield* parseCreateFunnelParams({
        name: "Enterprise Sales",
        members: [member, owner],
        owners: [owner],
        fullDescription:
          "[Native](https://huly.test/browse?workspace=test&_class=contact%3Aclass%3APerson&_id=p1&label=Pat)"
      })
      expect(created.name).toBe("Enterprise Sales")
      expect((yield* parseGetFunnelParams({ funnel: "funnel-1" })).funnel).toBe("funnel-1")
      expect((yield* parseFunnelMutationParams({ funnel: "funnel-1" })).funnel).toBe("funnel-1")
      const deletion = yield* parseDeleteFunnelParams({
        funnel: "funnel-1",
        expectedLeads: 0,
        expectedComments: 0,
        expectedAttachments: 0
      })
      expect(deletion.expectedLeads).toBe(0)
    })
  )

  it.effect("requires a complete non-negative delete impact snapshot", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(parseDeleteFunnelParams({ funnel: "funnel-1", expectedLeads: 0 }))
      const negative = yield* Effect.flip(
        parseDeleteFunnelParams({ funnel: "funnel-1", expectedLeads: -1, expectedComments: 0, expectedAttachments: 0 })
      )
      expect(String(missing)).toContain("expectedComments")
      expect(String(negative)).toContain("greater than or equal to 0")
    })
  )

  it.effect("rejects empty members and owners outside members", () =>
    Effect.gen(function* () {
      const emptyMembers = yield* Effect.flip(parseCreateFunnelParams({ name: "Sales", members: [] }))
      const emptyOwners = yield* Effect.flip(parseCreateFunnelParams({ name: "Sales", members: [member], owners: [] }))
      const ownerOutsideMembers = yield* Effect.flip(
        parseCreateFunnelParams({ name: "Sales", members: [member], owners: [owner] })
      )
      expect(String(emptyMembers)).toContain("members must not be empty")
      expect(String(emptyOwners)).toContain("owners must not be empty")
      expect(String(ownerOutsideMembers)).toContain("every owner must also be a member")
    })
  )

  it.effect("requires an update field and preserves explicit null clears", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(parseUpdateFunnelParams({ funnel: "funnel-1" }))
      expect(String(missing)).toContain("At least one")
      const parsed = yield* parseUpdateFunnelParams({ funnel: "funnel-1", description: null, fullDescription: null })
      expect(parsed.description).toBeNull()
      expect(parsed.fullDescription).toBeNull()
      expect(updateFunnelParamsJsonSchema).toHaveProperty("anyOf")
    })
  )
})
