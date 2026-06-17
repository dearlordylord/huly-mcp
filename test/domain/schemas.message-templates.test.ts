import { describe, it } from "@effect/vitest"
import { Effect, Either, Predicate } from "effect"
import { expect } from "vitest"

import {
  getMessageTemplateParamsJsonSchema,
  listMessageTemplateFieldsParamsJsonSchema,
  listMessageTemplatesParamsJsonSchema,
  parseGetMessageTemplateParams,
  parseListMessageTemplateCategoriesParams,
  parseListMessageTemplateFieldsParams,
  parseListMessageTemplatesParams
} from "../../src/domain/schemas/message-templates.js"

const schemaPropertyDescription = (schema: unknown, name: string): string | undefined => {
  const properties = Predicate.isRecord(schema) ? schema.properties : undefined
  const property = Predicate.isRecord(properties) ? properties[name] : undefined
  if (!Predicate.isRecord(property)) {
    throw new Error(`Missing JSON Schema property: ${name}`)
  }
  return typeof property.description === "string" ? property.description : undefined
}

describe("message template schemas", () => {
  it.effect("accepts valid list/get params and locators", () =>
    Effect.gen(function*() {
      const categories = yield* parseListMessageTemplateCategoriesParams({ limit: 10 })
      const templates = yield* parseListMessageTemplatesParams({
        category: "Sales",
        search: "welcome",
        limit: 5
      })
      const template = yield* parseGetMessageTemplateParams({
        template: "Welcome",
        category: "Sales"
      })
      const fields = yield* parseListMessageTemplateFieldsParams({
        category: "Contact",
        search: "owner",
        limit: 5
      })

      expect(categories.limit).toBe(10)
      expect(templates.category).toBe("Sales")
      expect(template.template).toBe("Welcome")
      expect(fields.search).toBe("owner")
    }))

  it.effect("rejects empty template, category, and field-category locators", () =>
    Effect.gen(function*() {
      const emptyTemplate = yield* Effect.either(parseGetMessageTemplateParams({ template: "  " }))
      const emptyTemplateCategory = yield* Effect.either(
        parseListMessageTemplatesParams({ category: "  " })
      )
      const emptyFieldCategory = yield* Effect.either(
        parseListMessageTemplateFieldsParams({ category: "  " })
      )

      expect(Either.isLeft(emptyTemplate)).toBe(true)
      expect(Either.isLeft(emptyTemplateCategory)).toBe(true)
      expect(Either.isLeft(emptyFieldCategory)).toBe(true)
    }))

  it("emits LLM-useful JSON Schema descriptions for locator fields", () => {
    expect(schemaPropertyDescription(listMessageTemplatesParamsJsonSchema, "category")).toContain(
      "category ID or exact category name"
    )
    expect(schemaPropertyDescription(getMessageTemplateParamsJsonSchema, "template")).toContain(
      "Template ID or exact template title"
    )
    expect(schemaPropertyDescription(listMessageTemplateFieldsParamsJsonSchema, "category")).toContain(
      "field category ID or exact raw label string"
    )
  })
})
