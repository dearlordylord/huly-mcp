import { describe, it } from "@effect/vitest"
import { type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core } from "../../../src/huly/huly-plugins.js"
import { fulltextSearch } from "../../../src/huly/operations/search.js"

const asDoc = (v: unknown) => v as Doc
const makeDoc = (overrides: { _id: string; _class: string; space?: string; modifiedOn: number }): Doc =>
  asDoc({
    _id: overrides._id as Ref<Doc>,
    // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast
    _class: overrides._class as Ref<Doc> as Doc["_class"],
    space: (overrides.space ?? "space-1") as Ref<Space>,
    modifiedOn: overrides.modifiedOn,
    modifiedBy: "user-1" as PersonId,
    createdBy: "user-1" as PersonId,
    createdOn: Date.now()
  })

const createTestLayer = (docs: Array<Doc>, captureQuery?: { query?: unknown; options?: unknown }) => {
  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (captureQuery) {
      captureQuery.query = query
      captureQuery.options = options
    }
    return Effect.succeed(toFindResult(docs, docs.length))
  }) as HulyClientOperations["findAll"]

  return HulyClient.testLayer({ findAll: findAllImpl })
}

describe("fulltextSearch", () => {
  // test-revizorro: approved
  it.effect("returns mapped results with correct fields", () =>
    Effect.gen(function*() {
      const docs = [
        makeDoc({ _id: "doc-1", _class: "core:class:Doc", space: "space-a", modifiedOn: 2000 }),
        makeDoc({ _id: "doc-2", _class: "tracker:class:Issue", space: "space-b", modifiedOn: 1000 })
      ]

      const testLayer = createTestLayer(docs)

      const result = yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(result.items).toHaveLength(2)
      expect(result.query).toBe("test")
      expect(result.total).toBe(2)

      expect(result.items[0].id).toBe("doc-1")
      expect(result.items[0].class).toBe("core:class:Doc")
      expect(result.items[0].space).toBe("space-a")
      expect(result.items[0].modifiedOn).toBe(2000)

      expect(result.items[1].id).toBe("doc-2")
      expect(result.items[1].class).toBe("tracker:class:Issue")
      expect(result.items[1].space).toBe("space-b")
      expect(result.items[1].modifiedOn).toBe(1000)
    }))

  // test-revizorro: approved
  it.effect("passes $search query to client.findAll", () =>
    Effect.gen(function*() {
      const captured: { query?: unknown; options?: unknown } = {}
      const testLayer = createTestLayer([], captured)

      yield* fulltextSearch({ query: "hello world" }).pipe(Effect.provide(testLayer))

      expect(captured.query).toEqual({ $search: "hello world" })
    }))

  // test-revizorro: approved
  it.effect("uses default limit of 50", () =>
    Effect.gen(function*() {
      const captured: { query?: unknown; options?: unknown } = {}
      const testLayer = createTestLayer([], captured)

      yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      const opts = captured.options as { limit?: number }
      expect(opts.limit).toBe(50)
    }))

  // test-revizorro: approved
  it.effect("enforces max limit of 200", () =>
    Effect.gen(function*() {
      const captured: { query?: unknown; options?: unknown } = {}
      const testLayer = createTestLayer([], captured)

      yield* fulltextSearch({ query: "test", limit: 500 }).pipe(Effect.provide(testLayer))

      const opts = captured.options as { limit?: number }
      expect(opts.limit).toBe(200)
    }))

  // test-revizorro: suspect | assertion only checks existence (toBeDefined), not actual sort order value
  it.effect("sorts by modifiedOn descending", () =>
    Effect.gen(function*() {
      const captured: { query?: unknown; options?: unknown } = {}
      const testLayer = createTestLayer([], captured)

      yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      const opts = captured.options as { sort?: Record<string, number> }
      expect(opts.sort?.modifiedOn).toBeDefined()
    }))

  // test-revizorro: approved
  it.effect("returns empty results for no matches", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayer([])

      const result = yield* fulltextSearch({ query: "nonexistent" }).pipe(Effect.provide(testLayer))

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.query).toBe("nonexistent")
    }))

  // test-revizorro: approved
  it.effect("handles doc without space", () =>
    Effect.gen(function*() {
      const doc = makeDoc({ _id: "doc-no-space", _class: "core:class:Doc", modifiedOn: 1000 })
      // Simulate a doc where space is falsy
      Object.defineProperty(doc, "space", { value: "", writable: true })

      const testLayer = createTestLayer([doc])

      const result = yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(result.items[0].space).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("searches against core.class.Doc", () =>
    Effect.gen(function*() {
      let calledClass: unknown
      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, _query: unknown) => {
        calledClass = _class
        return Effect.succeed(toFindResult([] as Array<Doc>, 0))
      }) as HulyClientOperations["findAll"]

      const testLayer = HulyClient.testLayer({ findAll: findAllImpl })

      yield* fulltextSearch({ query: "test" }).pipe(Effect.provide(testLayer))

      expect(calledClass).toBe(core.class.Doc)
    }))
})
