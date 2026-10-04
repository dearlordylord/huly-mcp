import { Schema } from "effect"
import { NonEmptyString } from "../../src/domain/schemas/shared.js"

// Fixture failures retain the boundary phase, never raw subprocess output or credentials.
export class FixtureBoundaryError extends Schema.TaggedError<FixtureBoundaryError>()("FixtureBoundaryError", {
  stage: Schema.Literals(["scenario", "version-read", "version-parse"]),
  reason: NonEmptyString
}) {}
