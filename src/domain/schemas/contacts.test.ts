import { Effect, Either, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  CreatePersonParamsSchema,
  GetPersonParamsSchema,
  ListPersonsParamsSchema,
  parseCreatePersonParams,
  parseGetPersonParams,
  parseListPersonsParams,
  UpdatePersonParamsSchema
} from "./contacts.js"

describe("Contact Schemas", () => {
  describe("ListPersonsParamsSchema", () => {
    it("accepts empty object", () => {
      const result = Schema.decodeUnknownSync(ListPersonsParamsSchema)({})
      expect(result).toEqual({})
    })

    it("accepts valid limit", () => {
      const result = Schema.decodeUnknownSync(ListPersonsParamsSchema)({ limit: 50 })
      expect(result).toEqual({ limit: 50 })
    })

    it("rejects limit over 200", () => {
      const result = Effect.runSync(
        Effect.either(parseListPersonsParams({ limit: 201 }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects zero limit", () => {
      const result = Effect.runSync(
        Effect.either(parseListPersonsParams({ limit: 0 }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects negative limit", () => {
      const result = Effect.runSync(
        Effect.either(parseListPersonsParams({ limit: -1 }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("GetPersonParamsSchema", () => {
    it("accepts personId", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({
        personId: "abc123"
      })
      expect(result).toEqual({ personId: "abc123" })
    })

    it("accepts email", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({
        email: "test@example.com"
      })
      expect(result).toEqual({ email: "test@example.com" })
    })

    it("accepts both personId and email", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({
        personId: "abc123",
        email: "test@example.com"
      })
      expect(result).toEqual({ personId: "abc123", email: "test@example.com" })
    })

    it("rejects empty object (requires at least one identifier)", () => {
      const result = Effect.runSync(
        Effect.either(parseGetPersonParams({}))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("trims personId whitespace", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({
        personId: "  abc123  "
      })
      expect(result).toEqual({ personId: "abc123" })
    })

    it("rejects whitespace-only personId", () => {
      const result = Effect.runSync(
        Effect.either(parseGetPersonParams({ personId: "   " }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("CreatePersonParamsSchema", () => {
    it("accepts valid person with required fields", () => {
      const result = Schema.decodeUnknownSync(CreatePersonParamsSchema)({
        firstName: "John",
        lastName: "Doe"
      })
      expect(result).toEqual({ firstName: "John", lastName: "Doe" })
    })

    it("accepts all optional fields", () => {
      const result = Schema.decodeUnknownSync(CreatePersonParamsSchema)({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        city: "NYC"
      })
      expect(result).toEqual({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        city: "NYC"
      })
    })

    it("trims firstName and lastName", () => {
      const result = Schema.decodeUnknownSync(CreatePersonParamsSchema)({
        firstName: "  John  ",
        lastName: "  Doe  "
      })
      expect(result).toEqual({ firstName: "John", lastName: "Doe" })
    })

    it("rejects empty firstName", () => {
      const result = Effect.runSync(
        Effect.either(parseCreatePersonParams({
          firstName: "",
          lastName: "Doe"
        }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects empty lastName", () => {
      const result = Effect.runSync(
        Effect.either(parseCreatePersonParams({
          firstName: "John",
          lastName: ""
        }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects whitespace-only firstName", () => {
      const result = Effect.runSync(
        Effect.either(parseCreatePersonParams({
          firstName: "   ",
          lastName: "Doe"
        }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects missing required fields", () => {
      const result = Effect.runSync(
        Effect.either(parseCreatePersonParams({}))
      )
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("UpdatePersonParamsSchema", () => {
    it("accepts personId only (no updates)", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({
        personId: "abc123"
      })
      expect(result).toEqual({ personId: "abc123" })
    })

    it("accepts city as null (to clear)", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({
        personId: "abc123",
        city: null
      })
      expect(result).toEqual({ personId: "abc123", city: null })
    })

    it("accepts city as string", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({
        personId: "abc123",
        city: "London"
      })
      expect(result).toEqual({ personId: "abc123", city: "London" })
    })

    it("accepts firstName update", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({
        personId: "abc123",
        firstName: "Jane"
      })
      expect(result).toEqual({ personId: "abc123", firstName: "Jane" })
    })

    it("rejects empty firstName in update", () => {
      const result = Effect.runSync(
        Effect.either(
          Schema.decodeUnknown(UpdatePersonParamsSchema)({
            personId: "abc123",
            firstName: ""
          })
        )
      )
      expect(Either.isLeft(result)).toBe(true)
    })
  })
})
