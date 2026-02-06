import { JSONSchema, Schema } from "effect"

export const NonEmptyString = Schema.Trim.pipe(Schema.nonEmptyString())

export const Timestamp = Schema.NonNegativeInt.annotations({
  identifier: "Timestamp",
  title: "Timestamp",
  description: "Unix timestamp in milliseconds (non-negative integer)"
})

export const LimitParam = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.lessThanOrEqualTo(200)
)

export const makeJsonSchema = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): ReturnType<typeof JSONSchema.make> => JSONSchema.make(schema)

export const EmptyParamsSchema = Schema.Struct({}).annotations({
  jsonSchema: { type: "object", properties: {}, additionalProperties: false }
})

export const emptyParamsJsonSchema = makeJsonSchema(EmptyParamsSchema)
