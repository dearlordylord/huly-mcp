import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseAddActivityReplyParams, parseListActivityReferencesParams } from "../../../src/domain/schemas.js"

describe("activity message schemas", () => {
  it.effect("parses activity replies and references", () =>
    Effect.gen(function*() {
      const reply = yield* parseAddActivityReplyParams({
        messageId: "msg-1",
        body: "Thanks for the update"
      })
      const references = yield* parseListActivityReferencesParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        direction: "both",
        limit: 5
      })
      const emptyReply = yield* Effect.either(parseAddActivityReplyParams({ messageId: "msg-1", body: "" }))

      expect(reply.body).toBe("Thanks for the update")
      expect(references.direction).toBe("both")
      expect(emptyReply._tag).toBe("Left")
    }))
})
