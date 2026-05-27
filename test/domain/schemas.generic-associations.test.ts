import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  createAssociationParamsJsonSchema,
  deleteAssociationParamsJsonSchema,
  deleteRelationParamsJsonSchema,
  listRelationsParamsJsonSchema,
  parseCreateAssociationParams,
  parseCreateRelationParams,
  parseDeleteAssociationParams,
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

  it.effect("emits JSON schema filter alternatives for list_relations", () =>
    Effect.gen(function*() {
      expect(listRelationsParamsJsonSchema).toMatchObject({
        type: "object",
        properties: {
          association: expect.any(Object),
          source: expect.any(Object),
          target: expect.any(Object)
        },
        anyOf: [
          { required: ["association"] },
          { required: ["source"] },
          { required: ["target"] }
        ]
      })
    }))

  it.effect("parses raw, issue, document, and card locators", () =>
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
        target: { kind: "raw", id: "doc-2", class: "document:class:Document" },
        direction: "target-to-source"
      })
      expect(documentParsed.source.kind).toBe("document")
      expect(documentParsed.direction).toBe("target-to-source")

      const cardParsed = yield* parseCreateRelationParams({
        association: "links",
        source: { kind: "card", card: "card-1" },
        target: { kind: "card", card: "Contract", cardSpace: "Contracts" }
      })
      expect(cardParsed.source.kind).toBe("card")
      expect(cardParsed.target.kind).toBe("card")
    }))

  it.effect("parses create_association fields", () =>
    Effect.gen(function*() {
      const parsed = yield* parseCreateAssociationParams({
        sourceClass: "tracker:class:Issue",
        targetClass: "document:class:Document",
        sourceRole: "references",
        targetRole: "referenced by",
        cardinality: "one-to-many",
        automationOnly: false
      })

      expect(parsed.sourceClass).toBe("tracker:class:Issue")
      expect(parsed.cardinality).toBe("one-to-many")
    }))

  it.effect("emits JSON schema for create_association", () =>
    Effect.gen(function*() {
      expect(createAssociationParamsJsonSchema).toMatchObject({
        type: "object",
        required: ["sourceClass", "targetClass", "sourceRole", "targetRole", "cardinality"]
      })
    }))

  it.effect("parses delete_association fields", () =>
    Effect.gen(function*() {
      const parsed = yield* parseDeleteAssociationParams({
        association: "assoc-1"
      })

      expect(parsed.association).toBe("assoc-1")
    }))

  it.effect("emits JSON schema for delete_association", () =>
    Effect.gen(function*() {
      expect(deleteAssociationParamsJsonSchema).toMatchObject({
        type: "object",
        required: ["association"]
      })
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
        target: { kind: "raw", id: "doc-2", class: "document:class:Document" },
        direction: "either"
      })

      if (!("association" in parsed)) {
        throw new Error("expected triple delete params")
      }
      expect(parsed.association).toBe("links")
      expect(parsed.source.kind).toBe("raw")
      expect(parsed.target.kind).toBe("raw")
      expect(parsed.direction).toBe("either")
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
