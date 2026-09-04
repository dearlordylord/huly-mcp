import { describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"

import {
  parseAddLeadAttachmentParams,
  parseAddLeadCommentParams,
  parseAddLeadLabelParams,
  AddLeadLabelResultSchema,
  RemoveLeadLabelResultSchema,
  UpdateLeadLabelResultSchema,
  parseUpdateLeadAttachmentParams,
  parseUpdateLeadLabelParams
} from "../../src/domain/schemas/lead-collaboration.js"

describe("lead collaboration schemas", () => {
  it.effect("normalizes exact lead identifiers across collaboration inputs", () =>
    Effect.gen(function* () {
      const comment = yield* parseAddLeadCommentParams({ funnel: "Sales", identifier: "17", body: "hello" })
      const label = yield* parseAddLeadLabelParams({
        funnel: "Sales",
        identifier: "lead-17",
        label: "priority",
        weight: 4
      })
      expect(comment.identifier).toBe("LEAD-17")
      expect(label.identifier).toBe("LEAD-17")
    })
  )

  it.effect("requires one attachment source and one attachment update field", () =>
    Effect.gen(function* () {
      const missingSource = yield* Effect.exit(
        parseAddLeadAttachmentParams({
          funnel: "Sales",
          identifier: "LEAD-1",
          filename: "note.txt",
          contentType: "text/plain"
        })
      )
      expect(Exit.isFailure(missingSource)).toBe(true)
      const multipleSources = yield* Effect.exit(
        parseAddLeadAttachmentParams({
          funnel: "Sales",
          identifier: "LEAD-1",
          filename: "note.txt",
          contentType: "text/plain",
          filePath: "/tmp/note.txt",
          data: "aGVsbG8="
        })
      )
      expect(Exit.isFailure(multipleSources)).toBe(true)
      const update = yield* parseUpdateLeadAttachmentParams({
        funnel: "Sales",
        identifier: "LEAD-1",
        attachmentId: "attachment-1",
        pinned: true
      })
      expect(update.pinned).toBe(true)
    })
  )

  it.effect("accepts every published TagReference weight", () =>
    Effect.gen(function* () {
      for (const weight of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        const parsed = yield* parseUpdateLeadLabelParams({
          funnel: "Sales",
          identifier: "LEAD-1",
          label: "priority",
          weight
        })
        expect(parsed.weight).toBe(weight)
      }
    })
  )

  it.effect("rejects impossible label mutation states", () =>
    Effect.gen(function* () {
      const identity = { identifier: "LEAD-1", id: "reference-1", label: "label-1", title: "priority" }
      expect(
        Exit.isFailure(
          yield* Effect.exit(
            Schema.decodeUnknownEffect(AddLeadLabelResultSchema)({ ...identity, attached: false, labelCreated: true })
          )
        )
      ).toBe(true)
      expect(
        Exit.isFailure(
          yield* Effect.exit(
            Schema.decodeUnknownEffect(UpdateLeadLabelResultSchema)({
              identifier: "LEAD-1",
              updated: false,
              updatedCount: 1
            })
          )
        )
      ).toBe(true)
      expect(
        Exit.isFailure(
          yield* Effect.exit(
            Schema.decodeUnknownEffect(RemoveLeadLabelResultSchema)({
              identifier: "LEAD-1",
              label: "label-1",
              title: "priority",
              detached: true,
              detachedCount: 0
            })
          )
        )
      ).toBe(true)
    })
  )
})
