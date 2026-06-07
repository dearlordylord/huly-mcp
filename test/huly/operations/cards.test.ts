/* eslint-disable no-restricted-syntax -- test fixtures build Huly SDK docs whose nominal types are not structurally compatible with plain object literals, and branded refs have no runtime constructors */
import { describe, it } from "@effect/vitest"
import type { Card as HulyCard, CardSpace as HulyCardSpace, MasterTag as HulyMasterTag } from "@hcengineering/card"
import { ClassifierKind, type Doc, type Ref, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { CardIdentifier, CardSpaceIdentifier, MasterTagIdentifier } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { cardPlugin, core } from "../../../src/huly/huly-plugins.js"
import {
  createCard,
  deleteCard,
  getCard,
  listCards,
  listCardSpaces,
  listMasterTags,
  updateCard
} from "../../../src/huly/operations/cards.js"

const SPACE_ID = "space-1" as Ref<HulyCardSpace>
const TAG_ID = "tag-1" as Ref<HulyMasterTag>
const CHILD_TAG_ID = "tag-child-1" as Ref<HulyMasterTag>
const OTHER_TAG_ID = "tag-other-1" as Ref<HulyMasterTag>

const tagLabel = (value: string): HulyMasterTag["label"] => value as HulyMasterTag["label"]

const makeSpace = (overrides?: Partial<HulyCardSpace>): HulyCardSpace =>
  ({
    _id: SPACE_ID,
    _class: cardPlugin.class.CardSpace,
    name: "Cards",
    description: "Card space",
    archived: false,
    private: false,
    members: [],
    types: [TAG_ID],
    modifiedOn: 100,
    createdOn: 50,
    ...overrides
  }) as unknown as HulyCardSpace

const makeTag = (overrides?: Partial<HulyMasterTag>): HulyMasterTag =>
  ({
    _id: TAG_ID,
    _class: cardPlugin.class.MasterTag,
    label: "Document",
    kind: ClassifierKind.CLASS,
    extends: cardPlugin.class.Card,
    ...overrides
  }) as unknown as HulyMasterTag

const makeCard = (overrides?: Partial<HulyCard>): HulyCard =>
  ({
    _id: "card-1" as Ref<HulyCard>,
    _class: TAG_ID,
    space: SPACE_ID,
    title: "Roadmap",
    content: "content-blob",
    parent: null,
    parentInfo: [],
    children: 0,
    blobs: {},
    modifiedOn: 200,
    createdOn: 150,
    ...overrides
  }) as unknown as HulyCard

const idMatches = (actual: unknown, query: unknown): boolean => {
  if (query === undefined) return true
  if (typeof query === "object" && query !== null && "$in" in query) {
    return Array.isArray(query.$in) && query.$in.includes(actual)
  }
  return actual === query
}

const docMatches = (doc: object, query: Record<string, unknown>): boolean =>
  Object.entries(query).every(([key, value]) => idMatches(Reflect.get(doc, key), value))

interface Captures {
  findAll?: { class?: unknown; query?: Record<string, unknown> }
  createDoc?: { class?: unknown; space?: unknown; attributes?: Record<string, unknown>; id?: unknown }
  updateDoc?: { called?: boolean; operations?: Record<string, unknown> }
  removeDoc?: { called?: boolean; id?: unknown }
  uploadMarkup?: { called?: boolean; value?: string }
  updateMarkup?: { called?: boolean; value?: string }
}

interface CardsMock {
  spaces?: ReadonlyArray<HulyCardSpace>
  cards?: ReadonlyArray<HulyCard>
  masterTags?: ReadonlyArray<HulyMasterTag>
  fetchMarkupResult?: string
  captures?: Captures
}

const buildLayer = (m: CardsMock) => {
  const spaces = m.spaces ?? []
  const cards = m.cards ?? []
  const masterTags = m.masterTags ?? []
  const cap = m.captures

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (cap?.findAll) {
      cap.findAll.class = _class
      cap.findAll.query = q
    }
    if (_class === cardPlugin.class.CardSpace) {
      return Effect.succeed(toFindResult(spaces.filter((space) => docMatches(space, q))))
    }
    if (_class === cardPlugin.class.MasterTag || _class === core.class.Class) {
      return Effect.succeed(toFindResult(masterTags.filter((tag) => docMatches(tag, q))))
    }
    if (_class === cardPlugin.class.Card) {
      return Effect.succeed(toFindResult(cards.filter((card) => docMatches(card, q))))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === cardPlugin.class.CardSpace) {
      return Effect.succeed(
        spaces.find((s) => (q.name !== undefined && s.name === q.name) || (q._id !== undefined && s._id === q._id))
      )
    }
    if (_class === cardPlugin.class.Card) {
      if (q.title !== undefined) return Effect.succeed(cards.find((c) => c.space === q.space && c.title === q.title))
      if (q._id !== undefined) return Effect.succeed(cards.find((c) => c.space === q.space && c._id === q._id))
      // lastCard lookup (space only, ordered by rank)
      return Effect.succeed(cards.find((c) => c.space === q.space))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _c: unknown,
    _s: unknown,
    attrs: unknown,
    id?: unknown
  ) => {
    if (cap?.createDoc) {
      cap.createDoc.class = _c
      cap.createDoc.space = _s
      cap.createDoc.attributes = attrs as Record<string, unknown>
      cap.createDoc.id = id
    }
    return Effect.succeed((id ?? "new-card-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _c: unknown,
    _s: unknown,
    _id: unknown,
    ops: unknown
  ) => {
    if (cap?.updateDoc) {
      cap.updateDoc.called = true
      cap.updateDoc.operations = ops as Record<string, unknown>
    }
    return Effect.succeed({} as never)
  }) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((_c: unknown, _s: unknown, id: unknown) => {
    if (cap?.removeDoc) {
      cap.removeDoc.called = true
      cap.removeDoc.id = id
    }
    return Effect.succeed({} as never)
  }) as HulyClientOperations["removeDoc"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
    _c: unknown,
    _id: unknown,
    _attr: unknown,
    markup: unknown
  ) => {
    if (cap?.uploadMarkup) {
      cap.uploadMarkup.called = true
      cap.uploadMarkup.value = markup as string
    }
    return Effect.succeed("markup-ref" as never)
  }) as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = ((
    _c: unknown,
    _id: unknown,
    _attr: unknown,
    markup: unknown
  ) => {
    if (cap?.updateMarkup) {
      cap.updateMarkup.called = true
      cap.updateMarkup.value = markup as string
    }
    return Effect.succeed(undefined as never)
  }) as HulyClientOperations["updateMarkup"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] =
    (() => Effect.succeed(m.fetchMarkupResult ?? "rendered content")) as HulyClientOperations["fetchMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl,
    fetchMarkup: fetchMarkupImpl
  })
}

const SPACE = CardSpaceIdentifier.make("Cards")

describe("listCardSpaces", () => {
  it.effect("lists active spaces and maps blank descriptions to undefined", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      const result = yield* listCardSpaces({}).pipe(
        Effect.provide(buildLayer({
          spaces: [makeSpace(), makeSpace({ _id: "space-2" as Ref<HulyCardSpace>, name: "Empty", description: "" })],
          captures
        }))
      )

      expect(result.total).toBe(2)
      expect(result.cardSpaces[0].name).toBe("Cards")
      expect(result.cardSpaces[0].description).toBe("Card space")
      expect(result.cardSpaces[0].types).toEqual(["tag-1"])
      expect(result.cardSpaces[1].description).toBeUndefined()
      // default excludes archived
      expect(captures.findAll?.query?.archived).toBe(false)
    }))

  it.effect("includes archived spaces when requested", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCardSpaces({ includeArchived: true }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], captures }))
      )

      expect(captures.findAll?.query).toEqual({})
    }))
})

describe("listMasterTags", () => {
  it.effect("fails when the card space is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        listMasterTags({ cardSpace: SPACE }).pipe(Effect.provide(buildLayer({ spaces: [] })))
      )
      expect(err._tag).toBe("CardSpaceNotFoundError")
    }))

  it.effect("returns empty when the space has no types", () =>
    Effect.gen(function*() {
      const result = yield* listMasterTags({ cardSpace: SPACE }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace({ types: [] })] }))
      )
      expect(result).toEqual({ masterTags: [], total: 0 })
    }))

  it.effect("maps master tags for a space", () =>
    Effect.gen(function*() {
      const result = yield* listMasterTags({ cardSpace: SPACE }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()] }))
      )
      expect(result.total).toBe(1)
      expect(result.masterTags[0]).toEqual({ id: "tag-1", name: "Document" })
    }))

  it.effect("includes master tags derived from the space's top-level types", () =>
    Effect.gen(function*() {
      const result = yield* listMasterTags({ cardSpace: SPACE }).pipe(
        Effect.provide(buildLayer({
          spaces: [makeSpace()],
          masterTags: [
            makeTag(),
            makeTag({ _id: CHILD_TAG_ID, label: tagLabel("Character"), extends: TAG_ID })
          ]
        }))
      )

      expect(result.masterTags).toContainEqual({ id: "tag-child-1", name: "Character" })
      expect(result.total).toBe(2)
    }))

  it.effect("falls back to the raw master tag label when the display label is empty", () =>
    Effect.gen(function*() {
      const result = yield* listMasterTags({ cardSpace: SPACE }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag({ label: tagLabel("") })] }))
      )

      expect(result.masterTags[0]).toEqual({ id: "tag-1", name: "" })
    }))

  it.effect("excludes classes outside the space type ancestry", () =>
    Effect.gen(function*() {
      const cycleA = "cycle-a" as Ref<HulyMasterTag>
      const cycleB = "cycle-b" as Ref<HulyMasterTag>
      const result = yield* listMasterTags({ cardSpace: SPACE }).pipe(
        Effect.provide(buildLayer({
          spaces: [makeSpace()],
          masterTags: [
            makeTag(),
            makeTag({ _id: OTHER_TAG_ID, label: tagLabel("Other"), extends: cardPlugin.class.Card }),
            makeTag({
              _id: "missing-parent" as Ref<HulyMasterTag>,
              label: tagLabel("Missing"),
              extends: "missing" as never
            }),
            makeTag({ _id: cycleA, label: tagLabel("Cycle A"), extends: cycleB }),
            makeTag({ _id: cycleB, label: tagLabel("Cycle B"), extends: cycleA })
          ]
        }))
      )

      expect(result.masterTags).toEqual([{ id: "tag-1", name: "Document" }])
    }))
})

describe("listCards", () => {
  it.effect("fails when the card space is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        listCards({ cardSpace: SPACE }).pipe(Effect.provide(buildLayer({ spaces: [] })))
      )
      expect(err._tag).toBe("CardSpaceNotFoundError")
    }))

  it.effect("lists cards in a space (no filters)", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      const result = yield* listCards({ cardSpace: SPACE }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [makeCard()], captures }))
      )
      expect(result.total).toBe(1)
      expect(result.cards[0]).toEqual({ id: "card-1", title: "Roadmap", type: "tag-1", modifiedOn: 200 })
      // only the space filter is present
      expect(captures.findAll?.query).toEqual({ space: SPACE_ID })
    }))

  it.effect("applies a master tag type filter", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, type: MasterTagIdentifier.make("Document") }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()], cards: [makeCard()], captures }))
      )
      expect(captures.findAll?.query?._class).toBe(TAG_ID)
    }))

  it.effect("fails when the type filter does not match a master tag", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        listCards({ cardSpace: SPACE, type: MasterTagIdentifier.make("Missing") }).pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()] }))
        )
      )
      expect(err._tag).toBe("MasterTagNotFoundError")
    }))

  it.effect("fails the type filter when the space has no master tags at all", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        listCards({ cardSpace: SPACE, type: MasterTagIdentifier.make("Document") }).pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace({ types: [] })] }))
        )
      )
      expect(err._tag).toBe("MasterTagNotFoundError")
    }))

  it.effect("resolves the type filter by master tag id", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, type: MasterTagIdentifier.make("tag-1") }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()], cards: [makeCard()], captures }))
      )
      expect(captures.findAll?.query?._class).toBe(TAG_ID)
    }))

  it.effect("resolves the type filter by a derived master tag label", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, type: MasterTagIdentifier.make("Character") }).pipe(
        Effect.provide(buildLayer({
          spaces: [makeSpace()],
          masterTags: [
            makeTag(),
            makeTag({ _id: CHILD_TAG_ID, label: tagLabel("Character"), extends: TAG_ID })
          ],
          cards: [makeCard({ _class: CHILD_TAG_ID })],
          captures
        }))
      )
      expect(captures.findAll?.query?._class).toBe(CHILD_TAG_ID)
    }))

  it.effect("applies a titleSearch (LIKE) filter, escaping wildcards", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, titleSearch: "Road" }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], captures }))
      )
      expect(captures.findAll?.query?.title).toEqual({ $like: "%Road%" })
    }))

  it.effect("ignores a whitespace-only titleSearch", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, titleSearch: "   " }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], captures }))
      )
      expect(captures.findAll?.query?.title).toBeUndefined()
    }))

  it.effect("applies a titleRegex filter", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, titleRegex: "^TODO" }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], captures }))
      )
      expect(captures.findAll?.query?.title).toEqual({ $regex: "^TODO" })
    }))

  it.effect("applies a contentSearch (fulltext) filter", () =>
    Effect.gen(function*() {
      const captures: Captures = { findAll: {} }
      yield* listCards({ cardSpace: SPACE, contentSearch: "design" }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], captures }))
      )
      expect(captures.findAll?.query?.$search).toBe("design")
    }))
})

describe("getCard", () => {
  it.effect("returns card detail with rendered content", () =>
    Effect.gen(function*() {
      const result = yield* getCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap") }).pipe(
        Effect.provide(buildLayer({
          spaces: [makeSpace()],
          cards: [makeCard({ parent: "parent-1" as Ref<HulyCard>, children: 2 })],
          fetchMarkupResult: "# Roadmap"
        }))
      )
      expect(result.id).toBe("card-1")
      expect(result.title).toBe("Roadmap")
      expect(result.content).toBe("# Roadmap")
      expect(result.parent).toBe("parent-1")
      expect(result.children).toBe(2)
      expect(result.cardSpace).toBe("Cards")
    }))

  it.effect("omits content when the card has no content blob", () =>
    Effect.gen(function*() {
      const result = yield* getCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap") }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [makeCard({ content: "" as never, parent: null })] }))
      )
      expect(result.content).toBeUndefined()
      expect(result.parent).toBeUndefined()
    }))

  it.effect("fails when the card is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        getCard({ cardSpace: SPACE, card: CardIdentifier.make("Ghost") }).pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [] }))
        )
      )
      expect(err._tag).toBe("CardNotFoundError")
    }))
})

describe("createCard", () => {
  it.effect("fails when the master tag type is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        createCard({ cardSpace: SPACE, type: MasterTagIdentifier.make("Missing"), title: "New card" }).pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()] }))
        )
      )
      expect(err._tag).toBe("MasterTagNotFoundError")
    }))

  it.effect("creates a top-level card (no parent)", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDoc: {}, uploadMarkup: {} }
      const result = yield* createCard({
        cardSpace: SPACE,
        type: MasterTagIdentifier.make("Document"),
        title: "New card",
        content: "hello"
      }).pipe(Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()], captures })))

      expect(result.title).toBe("New card")
      expect(typeof result.id).toBe("string")
      expect(captures.createDoc?.class).toBe(TAG_ID)
      expect(captures.createDoc?.space).toBe(SPACE_ID)
      expect(captures.createDoc?.attributes?.title).toBe("New card")
      expect(captures.createDoc?.attributes?.parent).toBeNull()
      expect(captures.createDoc?.attributes?.parentInfo).toEqual([])
      expect(captures.uploadMarkup?.value).toBe("hello")
    }))

  it.effect("creates a card using a derived master tag id", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDoc: {}, uploadMarkup: {} }
      yield* createCard({
        cardSpace: SPACE,
        type: MasterTagIdentifier.make("tag-child-1"),
        title: "New character"
      }).pipe(Effect.provide(buildLayer({
        spaces: [makeSpace()],
        masterTags: [
          makeTag(),
          makeTag({ _id: CHILD_TAG_ID, label: tagLabel("Character"), extends: TAG_ID })
        ],
        captures
      })))

      expect(captures.createDoc?.class).toBe(CHILD_TAG_ID)
      expect(captures.uploadMarkup?.value).toBe("")
    }))

  it.effect("creates a child card under a parent, threading parentInfo", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDoc: {} }
      const parent = makeCard({ _id: "parent-1" as Ref<HulyCard>, title: "Parent", parentInfo: [] })
      yield* createCard({
        cardSpace: SPACE,
        type: MasterTagIdentifier.make("Document"),
        title: "Child",
        parent: CardIdentifier.make("Parent")
      }).pipe(Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()], cards: [parent], captures })))

      expect(captures.createDoc?.attributes?.parent).toBe("parent-1")
      expect(captures.createDoc?.attributes?.parentInfo).toEqual([
        { _id: "parent-1", _class: TAG_ID, title: "Parent" }
      ])
    }))

  it.effect("fails when the named parent card is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        createCard({
          cardSpace: SPACE,
          type: MasterTagIdentifier.make("Document"),
          title: "Child",
          parent: CardIdentifier.make("Ghost parent")
        }).pipe(Effect.provide(buildLayer({ spaces: [makeSpace()], masterTags: [makeTag()], cards: [] })))
      )
      expect(err._tag).toBe("CardNotFoundError")
    }))
})

describe("updateCard", () => {
  it.effect("fails when no update fields are provided", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        updateCard({
          cardSpace: SPACE,
          card: CardIdentifier.make("Roadmap")
        }).pipe(Effect.provide(HulyClient.testLayer({})))
      )

      expect(err._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("updates the title via updateDoc", () =>
    Effect.gen(function*() {
      const captures: Captures = { updateDoc: {} }
      const result = yield* updateCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap"), title: "Renamed" })
        .pipe(Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [makeCard()], captures })))

      expect(result).toEqual({ id: "card-1", updated: true })
      expect(captures.updateDoc?.operations).toEqual({ title: "Renamed" })
    }))

  it.effect("updates existing content in place via updateMarkup (no updateDoc)", () =>
    Effect.gen(function*() {
      const captures: Captures = { updateDoc: {}, updateMarkup: {}, uploadMarkup: {} }
      yield* updateCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap"), content: "new body" })
        .pipe(
          Effect.provide(
            buildLayer({ spaces: [makeSpace()], cards: [makeCard({ content: "existing" as never })], captures })
          )
        )

      expect(captures.updateMarkup?.value).toBe("new body")
      expect(captures.uploadMarkup?.called).toBeUndefined()
      // content edits go through updateMarkup, leaving no DocumentUpdate ops
      expect(captures.updateDoc?.called).toBeUndefined()
    }))

  it.effect("clears existing content in place when content is null", () =>
    Effect.gen(function*() {
      const captures: Captures = { updateDoc: {}, updateMarkup: {}, uploadMarkup: {} }

      yield* updateCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap"), content: null }).pipe(
        Effect.provide(
          buildLayer({ spaces: [makeSpace()], cards: [makeCard({ content: "existing" as never })], captures })
        )
      )

      expect(captures.updateMarkup?.value).toBe("")
      expect(captures.uploadMarkup?.called).toBeUndefined()
      expect(captures.updateDoc?.called).toBeUndefined()
    }))

  it.effect("uploads content when the card had no content blob", () =>
    Effect.gen(function*() {
      const captures: Captures = { updateDoc: {}, updateMarkup: {}, uploadMarkup: {} }
      yield* updateCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap"), content: "first body" })
        .pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [makeCard({ content: "" as never })], captures }))
        )

      expect(captures.uploadMarkup?.value).toBe("first body")
      expect(captures.updateMarkup?.called).toBeUndefined()
      expect(captures.updateDoc?.operations).toEqual({ content: "markup-ref" })
    }))

  it.effect("uploads empty content when a card without content is cleared with null", () =>
    Effect.gen(function*() {
      const captures: Captures = { updateDoc: {}, updateMarkup: {}, uploadMarkup: {} }

      yield* updateCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap"), content: null }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [makeCard({ content: "" as never })], captures }))
      )

      expect(captures.uploadMarkup?.value).toBe("")
      expect(captures.updateMarkup?.called).toBeUndefined()
      expect(captures.updateDoc?.operations).toEqual({ content: "markup-ref" })
    }))

  it.effect("fails when the card is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        updateCard({ cardSpace: SPACE, card: CardIdentifier.make("Ghost"), title: "x" }).pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [] }))
        )
      )
      expect(err._tag).toBe("CardNotFoundError")
    }))
})

describe("deleteCard", () => {
  it.effect("removes the card", () =>
    Effect.gen(function*() {
      const captures: Captures = { removeDoc: {} }
      const result = yield* deleteCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap") }).pipe(
        Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [makeCard()], captures }))
      )
      expect(result).toEqual({ id: "card-1", deleted: true })
      expect(captures.removeDoc?.called).toBe(true)
      expect(captures.removeDoc?.id).toBe("card-1")
    }))

  it.effect("fails when the card is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        deleteCard({ cardSpace: SPACE, card: CardIdentifier.make("Ghost") }).pipe(
          Effect.provide(buildLayer({ spaces: [makeSpace()], cards: [] }))
        )
      )
      expect(err._tag).toBe("CardNotFoundError")
    }))

  it.effect("fails when the card space is not found", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        deleteCard({ cardSpace: SPACE, card: CardIdentifier.make("Roadmap") }).pipe(
          Effect.provide(buildLayer({ spaces: [] }))
        )
      )
      expect(err._tag).toBe("CardSpaceNotFoundError")
    }))
})
