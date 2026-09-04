import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseMergePeopleParams } from "../../src/domain/schemas/person-merge.js"

describe("person merge schemas", () => {
  it.effect("parses preview and token-confirmed execution as distinct states", () =>
    Effect.gen(function* () {
      const preview = yield* parseMergePeopleParams({ source: { id: "source" }, survivor: { email: "to@test.dev" } })
      const execution = yield* parseMergePeopleParams({
        source: { name: "Source" },
        survivor: { id: "survivor" },
        execute: true,
        expectedPreflightToken: "snapshot"
      })
      expect(preview.execute).toBeUndefined()
      expect(execution.execute).toBe(true)
    })
  )

  it.effect("rejects execution without a token and ambiguous locator objects", () =>
    Effect.gen(function* () {
      const missingToken = yield* Effect.result(
        parseMergePeopleParams({ source: { id: "source" }, survivor: { id: "survivor" }, execute: true })
      )
      const ambiguousLocator = yield* Effect.result(
        parseMergePeopleParams({ source: { id: "source", name: "Source" }, survivor: { id: "survivor" } })
      )
      expect(missingToken._tag).toBe("Failure")
      expect(ambiguousLocator._tag).toBe("Failure")
    })
  )
})
