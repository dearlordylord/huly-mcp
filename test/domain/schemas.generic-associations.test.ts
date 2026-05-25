import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  deleteRelationParamsJsonSchema,
  parseCreateRelationParams,
  parseDeleteRelationParams,
  parseListAssociationsParams,
  parseListRelationsParams
} from "../../src/domain/schemas/generic-associations.js"

describe("generic association schemas", () => {
  it.effect("parses list_associations filters", () =>
    Effect.gen(function*() {
      const parsed = yield* parseListAssociationsParams({
        association: "issue-links",
        sourceClass: "tracker:class:Issue",
        writableOnly: true,
        limit: 10
      })

      expect(parsed.association).toBe("issue-links")
      expect(parsed.sourceClass).toBe("tracker:class:Issue")
      expect(parsed.writableOnly).toBe(true)
      expect(parsed.limit).toBe(10)
    }))

  it.effect("requires a filter for list_relations", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseListRelationsParams({}))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("parses raw, issue, and document locators", () =>
    Effect.gen(function*() {
      const parsed = yield* parseListRelationsParams({
        association: "links",
        source: { kind: "raw", id: "doc-1", class: "document:class:Document" },
        target: { kind: "issue", issue: "HULY-1" },
        direction: "either"
      })

      expect(parsed.source?.kind).toBe("raw")
      expect(parsed.target?.kind).toBe("issue")

      const documentParsed = yield* parseCreateRelationParams({
        association: "links",
        source: { kind: "document", document: "Spec", teamspace: "Engineering" },
        target: { kind: "raw", id: "doc-2", class: "document:class:Document" }
      })
      expect(documentParsed.source.kind).toBe("document")
    }))

  it.effect("rejects mixed locator shapes", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseListRelationsParams({
        association: "links",
        source: { kind: "raw", id: "doc-1", issue: "HULY-1" }
      }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("rejects partial delete triples", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseDeleteRelationParams({
        association: "links",
        source: { kind: "raw", id: "doc-1", class: "document:class:Document" }
      }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("rejects mixed delete modes", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseDeleteRelationParams({
        relation: "rel-1",
        association: "links",
        source: { kind: "raw", id: "doc-1", class: "document:class:Document" },
        target: { kind: "raw", id: "doc-2", class: "document:class:Document" }
      }))
      expect(error._tag).toBe("ParseError")
    }))

  it.effect("accepts delete by relation ID", () =>
    Effect.gen(function*() {
      const parsed = yield* parseDeleteRelationParams({ relation: "rel-1" })
      if (!("relation" in parsed)) {
        throw new Error("expected relation-id delete params")
      }
      expect(parsed.relation).toBe("rel-1")
    }))

  it.effect("accepts delete by association/source/target triple", () =>
    Effect.gen(function*() {
      const parsed = yield* parseDeleteRelationParams({
        association: "links",
        source: { kind: "raw", id: "doc-1", class: "document:class:Document" },
        target: { kind: "raw", id: "doc-2", class: "document:class:Document" }
      })

      if (!("association" in parsed)) {
        throw new Error("expected triple delete params")
      }
      expect(parsed.association).toBe("links")
      expect(parsed.source.kind).toBe("raw")
      expect(parsed.target.kind).toBe("raw")
    }))

  it.effect("emits JSON schema for delete_relation", () =>
    Effect.gen(function*() {
      expect(deleteRelationParamsJsonSchema).toMatchObject({
        type: "object",
        anyOf: [
          {
            required: ["relation"]
          },
          {
            required: ["association", "source", "target"]
          }
        ]
      })
    }))
})
