import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { MAX_COLOR_INDEX } from "../../src/domain/schemas/shared.js"
import {
  attachTagParamsJsonSchema,
  createTagParamsJsonSchema,
  parseAttachTagParams,
  parseCreateTagParams,
  TAG_WEIGHT_VALUES,
  UPDATE_TAG_FIELDS,
  updateTagParamsJsonSchema
} from "../../src/domain/schemas/tags.js"
import type { TagWeightSdkParity } from "../../src/domain/schemas/tags.js"

const tagWeightSdkParity: TagWeightSdkParity = true

interface JsonSchemaProperty {
  readonly enum?: ReadonlyArray<unknown>
  readonly maximum?: unknown
}

interface JsonSchemaObject {
  readonly anyOf?: ReadonlyArray<{ readonly required?: ReadonlyArray<string> }>
  readonly properties?: Readonly<Record<string, JsonSchemaProperty>>
}

const isJsonSchemaObject = (value: unknown): value is JsonSchemaObject => typeof value === "object" && value !== null

const schemaProperty = (schema: unknown, name: string): JsonSchemaProperty => {
  if (!isJsonSchemaObject(schema)) {
    throw new Error("Expected JSON schema object")
  }
  const property = schema.properties?.[name]
  if (property === undefined) {
    throw new Error(`Expected JSON schema property ${name}`)
  }
  return property
}

describe("tag schemas", () => {
  it.effect("exposes the SDK tag weight values in JSON schema", () =>
    Effect.sync(() => {
      expect(tagWeightSdkParity).toBe(true)
      expect(schemaProperty(attachTagParamsJsonSchema, "weight").enum).toEqual([...TAG_WEIGHT_VALUES])
    }))

  it.effect("rejects a tag weight outside the current SDK union", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        parseAttachTagParams({
          object: {
            collection: "skills",
            objectClass: "recruit:mixin:Candidate",
            objectId: "candidate-1",
            space: "recruit-space"
          },
          tag: "TypeScript",
          targetClass: "recruit:mixin:Candidate",
          weight: 9
        })
      )

      expect(error._tag).toBe("ParseError")
    }))

  it.effect("accepts the highest Huly palette color index", () =>
    Effect.gen(function*() {
      const parsed = yield* parseCreateTagParams({
        color: MAX_COLOR_INDEX,
        targetClass: "tracker:class:Issue",
        title: "palette-end"
      })

      expect(parsed.color).toBe(MAX_COLOR_INDEX)
      expect(schemaProperty(createTagParamsJsonSchema, "color").maximum).toBe(MAX_COLOR_INDEX)
    }))

  it.effect("rejects color indexes outside the Huly palette", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        parseCreateTagParams({
          color: MAX_COLOR_INDEX + 1,
          targetClass: "tracker:class:Issue",
          title: "outside-palette"
        })
      )

      expect(error._tag).toBe("ParseError")
    }))

  it.effect("rejects negative color indexes", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        parseCreateTagParams({
          color: -1,
          targetClass: "tracker:class:Issue",
          title: "negative-color"
        })
      )

      expect(error._tag).toBe("ParseError")
    }))

  it.effect("derives update-tag at-least-one fields from the update field schema", () =>
    Effect.sync(() => {
      if (!isJsonSchemaObject(updateTagParamsJsonSchema)) {
        throw new Error("Expected update tag JSON schema object")
      }

      expect(updateTagParamsJsonSchema.anyOf?.map((entry) => entry.required?.[0])).toEqual(UPDATE_TAG_FIELDS)
      for (const field of UPDATE_TAG_FIELDS) {
        expect(updateTagParamsJsonSchema.properties?.[field]).toBeDefined()
      }
    }))
})
