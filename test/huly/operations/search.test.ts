import { describe, it } from "@effect/vitest"
import type { SearchOptions, SearchQuery, SearchResult } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  type ParsedSearchResultDoc,
  SearchResultDocSchema,
  UNKNOWN_SEARCH_TOTAL
} from "../../../src/domain/schemas/search.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { fulltextSearch } from "../../../src/huly/operations/search.js"

const parseSearchResultDoc = Schema.decodeUnknownSync(SearchResultDocSchema)

const makeSearchResultDoc = (overrides: {
  _id: string
  _class: string
  title?: string
  description?: string
  score?: number
  createdOn?: number
}): ParsedSearchResultDoc =>
  parseSearchResultDoc({
    id: overrides._id,
    doc: {
      _id: overrides._id,
      _class: overrides._class,
      createdOn: overrides.createdOn
    },
    ...(overrides.title !== undefined && { title: overrides.title }),
    ...(overrides.description !== undefined && { description: overrides.description }),
    ...(overrides.score !== undefined && { score: overrides.score })
  })

const createTestLayer = (
  docs: ReadonlyArray<ParsedSearchResultDoc>,
  total?: number,
  captureArgs?: { query?: SearchQuery; options?: SearchOptions }
) => {
  // Mock simulates SDK boundary — parsed docs satisfy the schema,
  // cast to SearchResult at the mock seam since SDK uses branded types
  const searchFulltextImpl: HulyClientOperations["searchFulltext"] = ((
    query: SearchQuery,
    options: SearchOptions
  ) => {
    if (captureArgs) {
      captureArgs.query = query
      captureArgs.options = options
    }
    // eslint-disable-next-line no-restricted-syntax -- mock seam: schema-parsed data to branded SDK type
    return Effect.succeed({ docs, total: total ?? docs.length } as unknown as SearchResult)
  }) as HulyClientOperations["searchFulltext"]

  return HulyClient.testLayer({ searchFulltext: searchFulltextImpl })
}

describe("fulltextSearch", () => {
  it.effect("returns mapped results with correct fields", () =>
    Effect.gen(function*() {
      const docs = [
        makeSearchResultDoc({
          _id: "doc-1",
          _class: "core:class:Doc",
          title: "First",
          score: 10,
          createdOn: 2000
        }),
        makeSearchResultDoc({
          _id: "doc-2",
          _class: "tracker:class:Issue",
          title: "Second",
          description: "desc",
          score: 5,
          createdOn: 1000
        })
      ]

      const testLayer = createTestLayer(docs, 2)

      const result = yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(result.items).toHaveLength(2)
      expect(result.query).toBe("test")
      expect(result.total).toBe(2)

      expect(result.items[0].id).toBe("doc-1")
      expect(result.items[0].class).toBe("core:class:Doc")
      expect(result.items[0].title).toBe("First")
      expect(result.items[0].score).toBe(10)
      expect(result.items[0].createdOn).toBe(2000)

      expect(result.items[1].id).toBe("doc-2")
      expect(result.items[1].class).toBe("tracker:class:Issue")
      expect(result.items[1].title).toBe("Second")
      expect(result.items[1].description).toBe("desc")
      expect(result.items[1].score).toBe(5)
      expect(result.items[1].createdOn).toBe(1000)
    }))

  it.effect("passes query string to searchFulltext", () =>
    Effect.gen(function*() {
      const captured: { query?: SearchQuery; options?: SearchOptions } = {}
      const testLayer = createTestLayer([], 0, captured)

      yield* fulltextSearch({ query: "hello world" }).pipe(Effect.provide(testLayer))

      expect(captured.query).toEqual({ query: "hello world" })
    }))

  it.effect("uses default limit of 50", () =>
    Effect.gen(function*() {
      const captured: { query?: SearchQuery; options?: SearchOptions } = {}
      const testLayer = createTestLayer([], 0, captured)

      yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(captured.options?.limit).toBe(50)
    }))

  it.effect("enforces max limit of 200", () =>
    Effect.gen(function*() {
      const captured: { query?: SearchQuery; options?: SearchOptions } = {}
      const testLayer = createTestLayer([], 0, captured)

      yield* fulltextSearch({ query: "test", limit: 500 }).pipe(Effect.provide(testLayer))

      expect(captured.options?.limit).toBe(200)
    }))

  it.effect("returns empty results for no matches", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer([], 0)

      const result = yield* fulltextSearch({ query: "nonexistent" }).pipe(Effect.provide(testLayer))

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.query).toBe("nonexistent")
    }))

  it.effect("handles undefined total as -1", () =>
    Effect.gen(function*() {
      const docs = [makeSearchResultDoc({ _id: "doc-1", _class: "core:class:Doc" })]
      const searchFulltextImpl: HulyClientOperations["searchFulltext"] = (() => {
        // eslint-disable-next-line no-restricted-syntax -- mock seam: schema-parsed data to branded SDK type
        return Effect.succeed({ docs } as unknown as SearchResult)
      }) as HulyClientOperations["searchFulltext"]

      const testLayer = HulyClient.testLayer({ searchFulltext: searchFulltextImpl })

      const result = yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(result.total).toBe(UNKNOWN_SEARCH_TOTAL)
    }))

  it.effect("preserves negative backend total sentinel as -1", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer([], UNKNOWN_SEARCH_TOTAL)

      const result = yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(result.total).toBe(UNKNOWN_SEARCH_TOTAL)
    }))

  it.effect("maps invalid SDK search results to connection errors", () =>
    Effect.gen(function*() {
      const searchFulltextImpl: HulyClientOperations["searchFulltext"] = (() => {
        // eslint-disable-next-line no-restricted-syntax -- malformed SDK boundary fixture
        return Effect.succeed({ docs: [{ id: "doc-1", doc: { _id: "doc-1" } }] } as unknown as SearchResult)
      }) as HulyClientOperations["searchFulltext"]
      const testLayer = HulyClient.testLayer({ searchFulltext: searchFulltextImpl })

      const error = yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer), Effect.flip)

      expect(error).toBeInstanceOf(HulyConnectionError)
      expect(error.message).toContain("searchFulltext response failed schema validation")
    }))
})
