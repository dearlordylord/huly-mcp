import { Schema } from "effect"
import { NonEmptyString, PositiveInteger } from "../../src/domain/schemas/shared.js"

// Fixture failures retain the boundary phase, never raw subprocess output or credentials.
export class FixtureBoundaryError extends Schema.TaggedError<FixtureBoundaryError>()("FixtureBoundaryError", {
  stage: Schema.Literals(["scenario", "version-read", "version-parse", "config-read", "config-parse"]),
  httpStatus: Schema.optionalKey(PositiveInteger),
  reason: NonEmptyString
}) {}
