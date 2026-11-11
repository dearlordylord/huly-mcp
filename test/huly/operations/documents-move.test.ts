import { describe, it } from "@effect/vitest"
import { type Doc, type Ref, SortingOrder } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import { makeRank } from "@hcengineering/rank"
import { Deferred, Effect, Fiber } from "effect"
import { expect } from "vitest"

import { NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { documentMoveEdges, documentMoveParent } from "../../../src/huly/document-move-adapter.js"
import { DocumentMoveCycleError } from "../../../src/huly/errors.js"
import { MovementTransportError } from "../../../src/huly/movement-transaction-transport.js"
import { moveDocument } from "../../../src/huly/operations/documents.js"
import { documentIdentifier, teamspaceIdentifier } from "../../helpers/brands.js"
import { corePersonId, docRef, documentForTestClass, findResultForTestClass, spaceRef } from "../../helpers/huly-sdk.js"

import { documentPlugin } from "../../../src/huly/huly-plugins.js"

const teamspace: HulyTeamspace = {
  _id: docRef<HulyTeamspace>("ts-1"),
  _class: documentPlugin.class.Teamspace,
  space: spaceRef("space-1"),
  name: "Docs",
  description: "Document move fixtures",
  members: [],
  type: documentPlugin.spaceType.DefaultTeamspaceType,
  archived: false,
  private: false,
  modifiedBy: corePersonId("user-1"),
  modifiedOn: 0,
  createdBy: corePersonId("user-1"),
  createdOn: 0
}

const makeDocument = (id: string, parent: Ref<HulyDocument>, rank: string): HulyDocument => ({
  _id: docRef<HulyDocument>(id),
  _class: documentPlugin.class.Document,
  space: teamspace._id,
  title: id,
  content: null,
  parent,
  rank,
  modifiedBy: corePersonId("user-1"),
  modifiedOn: 0,
  createdBy: corePersonId("user-1"),
  createdOn: 0
})

const NoParent = documentPlugin.ids.NoParent
const guide = makeDocument("guide", NoParent, makeRank(undefined, undefined))
const setup = makeDocument("setup", guide._id, makeRank(guide.rank, undefined))
const install = makeDocument("install", setup._id, makeRank(setup.rank, undefined))
const faq = makeDocument("faq", NoParent, makeRank(install.rank, undefined))
const billing = makeDocument("billing", faq._id, makeRank(faq.rank, undefined))
const documents = [guide, setup, install, faq, billing]

interface Update {
  readonly objectId: Ref<HulyDocument>
  readonly parent: Ref<HulyDocument>
  readonly rank: HulyDocument["rank"]
}

type MoveAttempt = Parameters<HulyClientOperations["commitDocumentMove"]>[0]

interface Fixtures {
  readonly docs?: ReadonlyArray<HulyDocument>
  readonly teamspaces?: ReadonlyArray<HulyTeamspace>
  readonly updates?: Array<Update>
  readonly attempts?: Array<MoveAttempt>
  readonly beforeCommit?: (objectId: Ref<HulyDocument>) => Effect.Effect<void, MovementTransportError>
}

const matchesTeamspace = (space: HulyTeamspace, query: Record<string, unknown>) =>
  (query._id === undefined || query._id === space._id) &&
  (query.name === undefined || query.name === space.name) &&
  (query.archived === undefined || query.archived === space.archived)

const matchesDocument = (doc: HulyDocument, query: Record<string, unknown>) =>
  (query._id === undefined || query._id === doc._id) &&
  (query.space === undefined || query.space === doc.space) &&
  (query.title === undefined || query.title === doc.title) &&
  (query.parent === undefined || query.parent === doc.parent)

const makeLayer = ({ attempts, beforeCommit, docs = documents, teamspaces = [teamspace], updates }: Fixtures) => {
  const documentsById = new Map(docs.map((doc) => [doc._id, doc]))

  const matching = (classId: Ref<Doc>, query: Record<string, unknown>, rankOrder: unknown): ReadonlyArray<Doc> => {
    if (classId === documentPlugin.class.Teamspace) return teamspaces.filter((space) => matchesTeamspace(space, query))
    if (classId !== documentPlugin.class.Document) return []
    const matches = Array.from(documentsById.values()).filter((doc) => matchesDocument(doc, query))
    return rankOrder === SortingOrder.Descending ? matches.sort((a, b) => b.rank.localeCompare(a.rank)) : matches
  }

  const findOne: HulyClientOperations["findOne"] = (classId, query, options) =>
    Effect.sync(() => documentForTestClass(matching(classId, query, options?.sort?.rank)[0]))
  const findAll: HulyClientOperations["findAll"] = (classId, query, options) =>
    Effect.sync(() => findResultForTestClass(matching(classId, query, options?.sort?.rank)))
  const commitDocumentMove: HulyClientOperations["commitDocumentMove"] = (write) =>
    Effect.gen(function* () {
      attempts?.push(write)
      yield* beforeCommit?.(write.source._id) ?? Effect.void

      const parent = documentMoveParent(write.destination)
      const hasExpectedParent = (expected: Pick<HulyDocument, "_id" | "parent">) => {
        const actual = documentsById.get(expected._id)
        return actual?.space === write.space && actual.parent === expected.parent
      }
      const hasConflictingRank = Array.from(documentsById.values()).some(
        (doc) => doc.space === write.space && doc.parent === parent && doc.rank >= write.rank
      )
      const doc = documentsById.get(write.source._id)
      if (
        doc?.space !== write.space ||
        doc.parent !== write.source.parent ||
        !documentMoveEdges(write.destination).every(hasExpectedParent) ||
        hasConflictingRank
      ) {
        return "condition-not-met"
      }

      updates?.push({ objectId: doc._id, parent, rank: write.rank })
      documentsById.set(doc._id, { ...doc, parent, rank: write.rank })
      return "applied"
    })

  return HulyClient.testLayer({ findOne, findAll, commitDocumentMove })
}

const params = (document: string, parent: string | null, space = "Docs") => ({
  teamspace: teamspaceIdentifier(space),
  document: documentIdentifier(document),
  parent: parent === null ? null : documentIdentifier(parent)
})

const move = (document: string, parent: string | null, fixtures: Fixtures = {}, space = "Docs") => {
  const updates = fixtures.updates ?? []
  return moveDocument(params(document, parent, space)).pipe(
    Effect.map((result) => ({ result, updates })),
    Effect.provide(makeLayer({ ...fixtures, updates }))
  )
}

const runConcurrentMoves = Effect.fnUntraced(function* (
  first: { readonly document: HulyDocument; readonly parent: HulyDocument },
  second: { readonly document: HulyDocument; readonly parent: HulyDocument }
) {
  const firstAtCommit = yield* Deferred.make<void>()
  const releaseFirst = yield* Deferred.make<void>()
  const updates: Array<Update> = []
  const layer = makeLayer({
    updates,
    beforeCommit: (objectId) =>
      objectId === first.document._id
        ? Deferred.succeed(firstAtCommit, undefined).pipe(Effect.andThen(Deferred.await(releaseFirst)))
        : Effect.void
  })
  return yield* Effect.gen(function* () {
    const firstCall = moveDocument(params(first.document._id, first.parent._id))
    const firstFiber = yield* Effect.forkChild(Effect.flip(firstCall))
    yield* Deferred.await(firstAtCommit)
    const result = yield* moveDocument(params(second.document._id, second.parent._id))
    yield* Deferred.succeed(releaseFirst, undefined)
    const conflict = yield* Fiber.join(firstFiber)

    return { result, conflict, updates }
  }).pipe(Effect.provide(layer))
})

describe("moveDocument", () => {
  it.effect("moves a document under a new parent, ranked after its new siblings", () =>
    Effect.gen(function* () {
      const { result, updates } = yield* move("install", "guide")

      expect(result).toMatchObject({ id: "install", parent: "guide", moved: true })
      expect(updates).toEqual([{ objectId: "install", parent: "guide", rank: makeRank(setup.rank, undefined) }])
    })
  )

  it.effect("passes the source and all destination ancestors to the guarded write", () =>
    Effect.gen(function* () {
      const attempts: Array<MoveAttempt> = []
      yield* move("install", "billing", { attempts })

      expect(attempts).toEqual([
        {
          space: teamspace._id,
          source: { _id: install._id, parent: setup._id },
          rank: makeRank(undefined, undefined),
          destination: {
            type: "nested",
            id: billing._id,
            parent: { type: "nested", id: faq._id, parent: { type: "root" } }
          }
        }
      ])
    })
  )

  it.effect("rejects a stale move after a concurrent request changes a destination ancestor", () =>
    Effect.gen(function* () {
      const { conflict, result, updates } = yield* runConcurrentMoves(
        { document: guide, parent: billing },
        { document: faq, parent: guide }
      )

      expect(result).toMatchObject({ id: "faq", parent: "guide", moved: true })
      expect(conflict._tag).toBe("DocumentMoveConflictError")
      expect(updates).toEqual([{ objectId: "faq", parent: "guide", rank: makeRank(setup.rank, undefined) }])
    })
  )

  it.effect("rejects a stale sibling rank after a concurrent move to the same parent", () =>
    Effect.gen(function* () {
      const { conflict, result, updates } = yield* runConcurrentMoves(
        { document: install, parent: guide },
        { document: faq, parent: guide }
      )

      expect(result).toMatchObject({ id: "faq", parent: "guide", moved: true })
      expect(conflict._tag).toBe("DocumentMoveConflictError")
      expect(updates).toEqual([{ objectId: "faq", parent: "guide", rank: makeRank(setup.rank, undefined) }])
    })
  )

  it.effect("does not assign a second rank when a completed move is retried", () =>
    Effect.gen(function* () {
      const updates: Array<Update> = []
      const call = moveDocument(params("install", "guide"))
      const results = yield* Effect.all([call, call]).pipe(Effect.provide(makeLayer({ updates })))

      expect(results.map(({ moved }) => moved)).toEqual([true, false])
      expect(updates).toEqual([{ objectId: "install", parent: "guide", rank: makeRank(setup.rank, undefined) }])
    })
  )

  it.effect("moves a document to the teamspace root when parent is null", () =>
    Effect.gen(function* () {
      const { result, updates } = yield* move("setup", null)

      expect(result).toMatchObject({ id: "setup", parent: null, moved: true })
      expect(updates).toEqual([{ objectId: "setup", parent: NoParent, rank: makeRank(faq.rank, undefined) }])
    })
  )

  it.effect("resolves the parent by ID", () =>
    Effect.gen(function* () {
      const docs = documents.map((doc) => (doc._id === "faq" ? { ...doc, title: "FAQ" } : doc))
      const { result } = yield* move("install", "faq", { docs })

      expect(result.parent).toBe("faq")
    })
  )

  it.effect("prefers the exact ID when another document has that title", () =>
    Effect.gen(function* () {
      const docs = [{ ...guide, title: "install" }, { ...setup, title: "faq" }, install, faq, billing]
      const { result } = yield* move("install", "faq", { docs })

      expect(result).toMatchObject({ id: "install", parent: "faq", moved: true })
    })
  )

  it.effect("prefers the exact teamspace ID when another teamspace has that name", () =>
    Effect.gen(function* () {
      const namesake = { ...teamspace, _id: docRef<HulyTeamspace>("ts-2"), name: teamspace._id }
      const { result } = yield* move("install", "faq", { teamspaces: [namesake, teamspace] }, teamspace._id)

      expect(result).toMatchObject({ id: "install", parent: "faq", moved: true })
    })
  )

  it.effect("rejects ambiguous teamspace names without writing", () =>
    Effect.gen(function* () {
      const updates: Array<Update> = []
      const namesake = { ...teamspace, _id: docRef<HulyTeamspace>("ts-2") }
      const error = yield* Effect.flip(move("install", "faq", { teamspaces: [namesake, teamspace], updates }))

      expect(error).toMatchObject({
        _tag: "DocumentMoveTargetAmbiguousError",
        target: { type: "teamspace", identifier: "Docs" }
      })
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("rejects ambiguous document titles without writing", () =>
    Effect.gen(function* () {
      const updates: Array<Update> = []
      const docs = [guide, { ...setup, title: "Setup" }, install, faq, { ...billing, title: "Setup" }]
      const error = yield* Effect.flip(move("Setup", "faq", { docs, updates }))

      expect(error).toMatchObject({
        _tag: "DocumentMoveTargetAmbiguousError",
        target: { type: "document", identifier: "Setup" }
      })
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("rejects ambiguous parent titles without writing", () =>
    Effect.gen(function* () {
      const updates: Array<Update> = []
      const docs = [{ ...guide, title: "Section" }, setup, install, { ...faq, title: "Section" }, billing]
      const error = yield* Effect.flip(move("install", "Section", { docs, updates }))

      expect(error).toMatchObject({
        _tag: "DocumentMoveTargetAmbiguousError",
        target: { type: "parent", identifier: "Section" }
      })
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("does not write when the document already has the requested parent", () =>
    Effect.gen(function* () {
      const { result, updates } = yield* move("billing", "faq")

      expect(result).toMatchObject({ id: "billing", parent: "faq", moved: false })
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("does not walk a damaged chain when the parent already matches", () =>
    Effect.gen(function* () {
      const docs = [{ ...faq, parent: docRef<HulyDocument>("missing") }, billing]
      const { result, updates } = yield* move("billing", "faq", { docs })
      expect(result.moved).toBe(false)
      expect(updates).toEqual([])
    })
  )

  it.effect("reports rank exhaustion before submitting a write", () =>
    Effect.gen(function* () {
      const attempts: Array<MoveAttempt> = []
      const docs = [install, faq, { ...billing, rank: "0|zzzzzz:" }]
      const error = yield* Effect.flip(move("install", "faq", { docs, attempts }))
      expect(error).toMatchObject({ _tag: "HulyError", message: expect.stringContaining("maximum rank") })
      expect(attempts).toEqual([])
    })
  )

  it.effect("reports an unknown transport outcome without repeating the write", () =>
    Effect.gen(function* () {
      const attempts: Array<MoveAttempt> = []
      const reason = NonEmptyString.make(
        "Movement write response timed out; effects require inspection. No retry attempted."
      )
      const beforeCommit = () => Effect.fail(new MovementTransportError({ phase: "after-send", reason }))
      const error = yield* Effect.flip(move("install", "guide", { attempts, beforeCommit }))

      expect(error).toMatchObject({ _tag: "HulyError", message: reason })
      expect(attempts).toHaveLength(1)
    })
  )

  it.effect("rejects a self-parent even when the requested parent already matches", () =>
    Effect.gen(function* () {
      const docs = documents.map((doc) => (doc._id === setup._id ? { ...doc, parent: doc._id } : doc))
      const attempts: Array<MoveAttempt> = []
      const error = yield* Effect.flip(move("setup", "setup", { attempts, docs }))

      expect(error).toBeInstanceOf(DocumentMoveCycleError)
      expect(attempts).toHaveLength(0)
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
      const updates: Array<Update> = []
      const error = yield* Effect.flip(move("guide", "install", { updates }))

      expect(error).toBeInstanceOf(DocumentMoveCycleError)
      expect(error.message).toBe(
        "Cannot move document 'guide' under 'install' in teamspace 'Docs': a document cannot be moved under itself or one of its descendants"
      )
      expect(updates).toHaveLength(0)
    })
  )

  it.effect("rejects placing a document beneath a pre-existing parent cycle", () =>
    Effect.gen(function* () {
      const docs = [
        makeDocument("loop-a", docRef<HulyDocument>("loop-b"), "0|a"),
        makeDocument("loop-b", docRef<HulyDocument>("loop-a"), "0|b"),
        makeDocument("other", NoParent, "0|c")
      ]
      const error = yield* Effect.flip(move("other", "loop-a", { docs }))

      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("rejects placing a document beneath a missing ancestor", () =>
    Effect.gen(function* () {
      const docs = [
        makeDocument("orphan", docRef<HulyDocument>("deleted"), "0|a"),
        makeDocument("other", NoParent, "0|b")
      ]
      const error = yield* Effect.flip(move("other", "orphan", { docs }))

      expect(error._tag).toBe("HulyDataInvalidError")
    })
  )

  it.effect("fails when the parent does not exist", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(move("setup", "missing"))

      expect(error._tag).toBe("DocumentNotFoundError")
    })
  )
})
