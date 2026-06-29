import { describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"

import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import {
  getSpacePreferenceParamsJsonSchema,
  GetSpacePreferenceResultSchema,
  listSpacePreferencesParamsJsonSchema,
  parseGetSpacePreferenceParams,
  parseListSpacePreferencesParams
} from "../../src/domain/schemas/preferences.js"

describe("preference schemas", () => {
  it.effect("parses list/get SpacePreference params", () =>
    Effect.gen(function*() {
      const listParams = yield* parseListSpacePreferencesParams({
        space: "General",
        includeArchived: true,
        class: "core:class:Space",
        limit: 10
      })
      const getParams = yield* parseGetSpacePreferenceParams({ space: "space-1" })

      expect(listParams).toMatchObject({
        space: "General",
        includeArchived: true,
        class: "core:class:Space",
        limit: 10
      })
      expect(getParams).toMatchObject({ space: "space-1" })
    }))

  it.effect("rejects list resolver options when no space is provided", () =>
    Effect.gen(function*() {
      const rejectedParams = [
        { includeArchived: true },
        { class: "core:class:Space" },
        { type: "space-type-1" }
      ]

      for (const params of rejectedParams) {
        const exit = yield* parseListSpacePreferencesParams(params).pipe(Effect.exit)
        if (Exit.isSuccess(exit)) throw new Error("Expected params to be rejected")
        expect(exit.cause.toString()).toContain(
          "includeArchived, class, and type can only be provided when space is provided."
        )
      }
    }))

  it("emits client-safe JSON Schema for SpacePreference tool inputs", () => {
    expect(parseJsonSchemaRecord(listSpacePreferencesParamsJsonSchema)).toBeDefined()
    expect(parseJsonSchemaRecord(getSpacePreferenceParamsJsonSchema)).toBeDefined()
    expect(listSpacePreferencesParamsJsonSchema).toMatchObject({
      type: "object",
      properties: {
        space: {},
        limit: {}
      }
    })
    expect(getSpacePreferenceParamsJsonSchema).toMatchObject({
      type: "object",
      required: ["space"]
    })
  })

  it("accepts the absent SpacePreference result shape", () => {
    const decoded = Schema.decodeUnknownSync(GetSpacePreferenceResultSchema)({
      present: false,
      attachedTo: "space-1",
      attachedSpace: {
        id: "space-1",
        name: "General",
        class: "core:class:Space",
        private: false,
        archived: false,
        membersCount: 1,
        ownersCount: 0
      }
    })

    expect(decoded.present).toBe(false)
  })
})
