import { Effect, Schema, SchemaIssue } from "effect"
import { describe, expect, it } from "vitest"

import { formatParseError } from "../../src/mcp/schema-error-format.js"

describe("Schema error formatting", () => {
  it("preserves the Effect 3 path and actual-value contract", async () => {
    const schema = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(schema)({ name: 123, age: "old" }, { errors: "all", reportInput: true }).pipe(
        Effect.flip
      )
    )

    expect(formatParseError(error)).toBe('name: Expected string, actual 123; age: Expected number, actual "old"')
  })

  it("preserves the missing-field wording", async () => {
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))({}).pipe(Effect.flip)
    )

    expect(formatParseError(error)).toBe("name: is missing")
  })

  it("preserves authored messages without rewriting their prose", async () => {
    const schema = Schema.Struct({ name: Schema.String.annotate({ message: "custom, got wording stays authored" }) })
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(schema)({ name: 123 }, { reportInput: true }).pipe(Effect.flip)
    )

    expect(formatParseError(error)).toBe("name: custom, got wording stays authored")
  })

  it("formats root-level issues without inventing a path", async () => {
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(Schema.String)(123, { reportInput: true }).pipe(Effect.flip)
    )

    expect(formatParseError(error)).toBe(": Expected string, actual 123")
  })

  it("omits actual input when schema decoding did not retain it", async () => {
    const error = await Effect.runPromise(Schema.decodeUnknownEffect(Schema.String)(123).pipe(Effect.flip))

    expect(formatParseError(error)).toBe(": Expected string")
  })

  it("delegates non-type leaf issues to Effect's formatter", async () => {
    const error = new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "Expected a refined value" }))

    expect(formatParseError(error)).toBe(": Expected a refined value")
  })
})
