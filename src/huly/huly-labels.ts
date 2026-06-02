import { Either, Schema } from "effect"

import { NonEmptyString } from "../domain/schemas/shared.js"

export const HULY_MODEL_ID_SEPARATOR = ":"
const FINAL_SEGMENT_OFFSET = 1

export const hulyModelLabelTail = (value: string): string => {
  // Huly SDK model labels and IDs are namespaced tokens; for example,
  // tracker.class.Issue currently serializes as "tracker:class:Issue".
  // MCP display labels use the final segment so agents see "Issue".
  const segments = value.split(HULY_MODEL_ID_SEPARATOR)
  return segments[segments.length - FINAL_SEGMENT_OFFSET] ?? value
}

export const decodeHulyModelLabelTail = (value: unknown) =>
  Either.flatMap(
    Schema.decodeUnknownEither(Schema.String)(value),
    (label) => Schema.decodeUnknownEither(NonEmptyString)(hulyModelLabelTail(label))
  )
