import { describe, it } from "@effect/vitest"
import { type PersonId, type Ref, type Space, SortingOrder } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { makeRank } from "@hcengineering/rank"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { DocumentMoveCycleError } from "../../../src/huly/errors.js"
import { moveDocument } from "../../../src/huly/operations/documents.js"
import { documentIdentifier, teamspaceIdentifier } from "../../helpers/brands.js"

import { documentPlugin } from "../../../src/huly/huly-plugins.js"

const asTeamspace = (v: unknown) => v as HulyTeamspace
const teamspace = asTeamspace({
  _id: "ts-1" as Ref<HulyTeamspace>,
  _class: documentPlugin.class.Teamspace,
  space: "space-1" as Ref<Space>,
  name: "Docs",
  archived: false,
  private: false,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0
})

const makeDocument = (id: string, parent: Ref<HulyDocument>, rank: string): HulyDocument => ({
  _id: id as Ref<HulyDocument>,
  _class: documentPlugin.class.Document,
  space: teamspace._id,
  title: id,
  content: null,
  parent,
  rank,
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0
})

const NoParent = documentPlugin.ids.NoParent
const ref = (id: string) => id as Ref<HulyDocument>

const ranks = Array.from({ length: 5 }).reduce<Array<string>>((acc) => [...acc, makeRank(acc.at(-1), undefined)], [])
const rankAt = (index: number): string => ranks[index] ?? ""

// Tree: guide (root) > setup > install; faq (root) > billing
const documents = [
  makeDocument("guide", NoParent, rankAt(0)),
  makeDocument("setup", ref("guide"), rankAt(1)),
  makeDocument("install", ref("setup"), rankAt(2)),
  makeDocument("faq", NoParent, rankAt(3)),
  makeDocument("billing", ref("faq"), rankAt(4))
]

type Query = Partial<Record<"name" | "space" | "title" | "_id" | "parent", unknown>>

const matches = (doc: HulyDocument, q: Query): boolean =>
  (q.space === undefined || doc.space === q.space) &&
  (q.title === undefined || doc.title === q.title) &&
  (q._id === undefined || doc._id === q._id) &&
  (q.parent === undefined || doc.parent === q.parent)

const makeLayer = (docs: ReadonlyArray<HulyDocument>, updates: Array<Record<string, unknown>>) => {
  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options: unknown) => {
    const q = query as Query
    if (_class === documentPlugin.class.Teamspace) {
      return Effect.succeed(q.name === teamspace.name || q._id === teamspace._id ? teamspace : undefined)
    }
    const sorted =
      (options as { sort?: { rank?: SortingOrder } } | undefined)?.sort?.rank === SortingOrder.Descending
        ? [...docs].sort((a, b) => b.rank.localeCompare(a.rank))
        : docs
    return Effect.succeed(sorted.find((doc) => matches(doc, q)))
  }) as HulyClientOperations["findOne"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown,
    operations: unknown
  ) => {
    updates.push({ objectId, ...(operations as Record<string, unknown>) })
    return Effect.succeed({} as never)
  }) as HulyClientOperations["updateDoc"]

  return HulyClient.testLayer({ findOne: findOneImpl, updateDoc: updateDocImpl })
}

const move = (
  document: string,
  parent: string | null,
  docs: ReadonlyArray<HulyDocument> = documents,
  updates: Array<Record<string, unknown>> = []
) =>
  moveDocument({
    teamspace: teamspaceIdentifier("Docs"),
    document: documentIdentifier(document),
    parent: parent === null ? null : documentIdentifier(parent)
  }).pipe(
    Effect.map((result) => ({ result, updates })),
    Effect.provide(makeLayer(docs, updates))
  )

describe("moveDocument", () => {
  it.effect("moves a document under a new parent, ranked after its new siblings", () =>
    Effect.gen(function* () {
      const { result, updates } = yield* move("install", "guide")

      expect(result).toMatchObject({ id: "install", parent: "guide", moved: true })
      expect(updates).toEqual([{ objectId: "install", parent: "guide", rank: makeRank(rankAt(1), undefined) }])
    })
  )

  it.effect("moves a document to the teamspace root when parent is null", () =>
    Effect.gen(function* () {
      const { result, updates } = yield* move("setup", null)

      expect(result).toMatchObject({ id: "setup", parent: null, moved: true })
      expect(updates).toEqual([{ objectId: "setup", parent: NoParent, rank: makeRank(rankAt(3), undefined) }])
    })
  )

  it.effect("resolves the parent by ID", () =>
    Effect.gen(function* () {
      const docs = documents.map((doc) => (doc._id === "faq" ? { ...doc, title: "FAQ" } : doc))
      const { result } = yield* move("install", "faq", docs)

      expect(result.parent).toBe("faq")
    })
  )

  it.effect("does not write when the document already has the requested parent", () =>
    Effect.gen(function* () {
      const { result, updates } = yield* move("billing", "faq")

      expect(result).toMatchObject({ id: "billing", parent: "faq", moved: false })
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("rejects moving a document under itself", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(move("setup", "setup"))

      expect(error).toBeInstanceOf(DocumentMoveCycleError)
    })
  )

  it.effect("rejects moving a document under one of its descendants", () =>
    Effect.gen(function* () {
      const updates: Array<Record<string, unknown>> = []
      const error = yield* Effect.flip(move("guide", "install", documents, updates))

      expect(error).toBeInstanceOf(DocumentMoveCycleError)
      expect(error.message).toBe(
        "Cannot move document 'guide' under 'install' in teamspace 'Docs': a document cannot be moved under itself or one of its descendants"
      )
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("stops walking ancestors on a pre-existing parent cycle", () =>
    Effect.gen(function* () {
      const docs = [
        makeDocument("loop-a", ref("loop-b"), "0|a"),
        makeDocument("loop-b", ref("loop-a"), "0|b"),
        makeDocument("other", NoParent, "0|c")
      ]
      const { result } = yield* move("other", "loop-a", docs)

      expect(result.moved).toBe(true)
    })
  )

  it.effect("treats a missing ancestor as the end of the chain", () =>
    Effect.gen(function* () {
      const docs = [makeDocument("orphan", ref("deleted"), "0|a"), makeDocument("other", NoParent, "0|b")]
      const { result } = yield* move("other", "orphan", docs)

      expect(result.moved).toBe(true)
    })
  )

  it.effect("fails when the parent does not exist", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(move("setup", "missing"))

      expect(error._tag).toBe("DocumentNotFoundError")
    })
  )
})
