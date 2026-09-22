import { Effect, Schema } from "effect"

import { HulyDataInvalidError } from "../errors-base.js"

const RawRecordSchema = Schema.Record(Schema.String, Schema.Unknown)

export const parseBoundary = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  operation: string,
  entity: string
): Effect.Effect<S["Type"], HulyDataInvalidError> =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(value),
    catch: (cause) => new HulyDataInvalidError({ operation, entity, cause })
  })

export const parseOptionalBoundary = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  operation: string,
  entity: string
): Effect.Effect<S["Type"] | undefined, HulyDataInvalidError> =>
  value === undefined ? Effect.succeed(undefined) : parseBoundary(schema, value, operation, entity)

export const parseOptionalMixinBoundary = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  mixin: string,
  operation: string,
  entity: string
): Effect.Effect<S["Type"] | undefined, HulyDataInvalidError> =>
  value === undefined
    ? Effect.succeed(undefined)
    : Effect.gen(function* () {
        const record = yield* parseBoundary(RawRecordSchema, value, operation, entity)
        const nested = record[mixin]
        return yield* parseBoundary(schema, nested === undefined ? record : nested, operation, entity)
      })
