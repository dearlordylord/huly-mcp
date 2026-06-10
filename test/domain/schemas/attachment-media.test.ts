import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseAddAttachmentParams, parseCreateDrawingParams } from "../../../src/domain/schemas.js"

describe("attachment media schemas", () => {
  it.effect("accepts attachment media kinds and rejects unknown kinds", () =>
    Effect.gen(function*() {
      const defaultKind = yield* parseAddAttachmentParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "diagram.png",
        contentType: "image/png",
        data: "aGVsbG8="
      })
      const photo = yield* parseAddAttachmentParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "photo.png",
        contentType: "image/png",
        data: "aGVsbG8=",
        kind: "photo"
      })
      const invalid = yield* Effect.either(parseAddAttachmentParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "photo.png",
        contentType: "image/png",
        data: "aGVsbG8=",
        kind: "video"
      }))

      expect(defaultKind.kind).toBeUndefined()
      expect(photo.kind).toBe("photo")
      expect(invalid._tag).toBe("Left")
    }))

  it.effect("parses drawing content as an opaque payload", () =>
    Effect.gen(function*() {
      const drawing = yield* parseCreateDrawingParams({
        parentId: "issue-1",
        parentClass: "tracker:class:Issue",
        space: "space-1",
        content: "{\"shape\":\"line\"}"
      })

      expect(drawing.content).toBe("{\"shape\":\"line\"}")
    }))
})
