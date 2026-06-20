import { describe, it } from "@effect/vitest"
import type { Board as HulyBoard, Card as HulyBoardCard, CommonBoardPreference, MenuPage } from "@hcengineering/board"
import type { AccountUuid, Class, Doc, DocumentQuery, PersonId, Ref, Space, Status } from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import type { IntlString } from "@hcengineering/platform"
import type { TagCategory, TagElement, TagReference } from "@hcengineering/tags"
import type { ProjectType, TaskType } from "@hcengineering/task"
import type { AnyComponent } from "@hcengineering/ui"
import type { FilteredView, Viewlet, ViewletDescriptor, ViewletPreference } from "@hcengineering/view"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  BoardCardIdentifier,
  BoardIdentifier,
  BoardLabelIdentifier,
  BoardMenuPageIdentifier,
  BoardSavedViewIdentifier,
  BoardViewletIdentifier,
  NonEmptyString
} from "../../../src/domain/schemas.js"
import { ColorCode, TagCategoryIdentifier } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  BoardLabelIdentifierAmbiguousError,
  BoardLabelNotFoundError,
  BoardMenuPageIdentifierAmbiguousError,
  BoardMenuPageNotFoundError,
  BoardSavedViewIdentifierAmbiguousError,
  BoardSavedViewNotFoundError,
  BoardViewletIdentifierAmbiguousError,
  BoardViewletNotFoundError
} from "../../../src/huly/errors.js"
import { board, core, tags, view } from "../../../src/huly/huly-plugins.js"
import {
  addBoardCardLabel,
  createBoardLabel,
  deleteBoardLabel,
  listBoardCardLabels,
  listBoardLabels,
  removeBoardCardLabel,
  updateBoardLabel
} from "../../../src/huly/operations/board-labels.js"
import {
  getBoardCommonPreference,
  getBoardSavedView,
  listBoardMenuPages,
  listBoardSavedViews,
  listBoardViewlets
} from "../../../src/huly/operations/board-views.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"

// Huly SDK IDs, labels, and component handles are compile-time string brands.
// These fixture helpers keep those erased-brand conversions local to the fake SDK layer.

const accountUuid = (value: string): AccountUuid => value as AccountUuid

const personId = (value: string): PersonId => value as PersonId

const intl = (value: string): IntlString => value as IntlString

const component = (value: string): AnyComponent => value as AnyComponent

const boardCardClass = toRef<Class<Doc>>(String(board.class.Card))
const account = accountUuid("00000000-0000-4000-8000-000000000000")
const person = personId("person-1")
const boardId = toRef<HulyBoard>("board-1")
const boardSpaceId = toRef<Space>(boardId)
const cardId = toRef<HulyBoardCard>("card-1")
const labelId = toRef<TagElement>("label-1")
const otherLabelId = toRef<TagElement>("label-2")
const labelRefId = toRef<TagReference>("label-ref-1")
const b = BoardIdentifier.make
const c = BoardCardIdentifier.make
const l = BoardLabelIdentifier.make
const m = BoardMenuPageIdentifier.make
const sv = BoardSavedViewIdentifier.make
const v = BoardViewletIdentifier.make
const text = NonEmptyString.make
const color = ColorCode.make
const category = TagCategoryIdentifier.make

const docBase = <T extends Doc>(_id: Ref<T>, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id,
  _class,
  space,
  modifiedOn: 1,
  modifiedBy: core.account.System
})

const makeBoard = (overrides: Partial<HulyBoard> = {}): HulyBoard => ({
  ...docBase(boardId, board.class.Board, core.space.Space),
  name: "Roadmap",
  description: "",
  private: false,
  archived: false,
  members: [account],
  owners: [account],
  type: toRef<ProjectType>("project-type-board"),
  ...overrides
})

const makeCard = (overrides: Partial<HulyBoardCard> = {}): HulyBoardCard => ({
  ...docBase(cardId, board.class.Card, boardSpaceId),
  attachedTo: boardId,
  attachedToClass: board.class.Board,
  collection: "cards",
  kind: toRef<TaskType>("task-type-card"),
  status: toRef<Status>("status-todo"),
  number: 1,
  identifier: "CARD-1",
  rank: "a",
  title: "Planning",
  description: "",
  assignee: null,
  dueDate: null,
  startDate: null,
  isArchived: false,
  members: [],
  ...overrides
})

const makeCategory = (overrides: Partial<TagCategory> = {}): TagCategory => ({
  ...docBase(board.category.Other, tags.class.TagCategory, core.space.Model),
  icon: tags.icon.Tags,
  label: "Other",
  targetClass: boardCardClass,
  tags: [],
  default: false,
  ...overrides
})

const makeLabel = (overrides: Partial<TagElement> = {}): TagElement => ({
  ...docBase(labelId, tags.class.TagElement, core.space.Workspace),
  title: "Urgent",
  description: "Needs attention",
  targetClass: boardCardClass,
  color: 2,
  category: board.category.Other,
  refCount: 1,
  ...overrides
})

const withoutRefCount = ({ refCount: _refCount, ...label }: TagElement): TagElement => label

const makeTagReference = (overrides: Partial<TagReference> = {}): TagReference => ({
  ...docBase(labelRefId, tags.class.TagReference, boardSpaceId),
  attachedTo: cardId,
  attachedToClass: board.class.Card,
  collection: "labels",
  tag: labelId,
  title: "Urgent",
  color: 2,
  ...overrides
})

const makeMenuPage = (overrides: Partial<MenuPage> = {}): MenuPage => ({
  ...docBase(toRef<MenuPage>("menu-main"), board.class.MenuPage, core.space.Model),
  pageId: board.menuPageId.Main,
  label: intl("board:string:Main"),
  component: component("board:component:Main"),
  ...overrides
})

const makeSavedView = (overrides: Partial<FilteredView> = {}): FilteredView => ({
  ...docBase(toRef<FilteredView>("saved-view-1"), view.class.FilteredView, core.space.Workspace),
  name: "Mine",
  location: { path: ["board"] },
  filters: "[{\"key\":\"status\"}]",
  viewOptions: { groupBy: ["status"], orderBy: ["modifiedOn", SortingOrder.Descending] },
  filterClass: boardCardClass,
  viewletId: toRef<Viewlet>("viewlet-kanban"),
  sharable: false,
  users: [account],
  createdBy: person,
  attachedTo: String(board.app.Board),
  ...overrides
})

const makeViewlet = (overrides: Partial<Viewlet> = {}): Viewlet => ({
  ...docBase(toRef<Viewlet>("viewlet-kanban"), view.class.Viewlet, core.space.Model),
  attachTo: boardCardClass,
  descriptor: toRef<ViewletDescriptor>("descriptor-kanban"),
  config: ["title", { key: "status", props: { compact: true } }],
  title: "Kanban",
  variant: "kanban",
  props: { board: true },
  ...overrides
})

const makeDescriptor = (overrides: Partial<ViewletDescriptor> = {}): ViewletDescriptor => ({
  ...docBase(toRef<ViewletDescriptor>("descriptor-kanban"), view.class.ViewletDescriptor, core.space.Model),
  label: intl("view:string:Kanban"),
  component: component("view:component:Kanban"),
  color: 3,
  ...overrides
})

const makeViewletPreference = (overrides: Partial<ViewletPreference> = {}): ViewletPreference => ({
  ...docBase(toRef<ViewletPreference>("viewlet-pref-1"), view.class.ViewletPreference, core.space.Workspace),
  attachedTo: toRef<Viewlet>("viewlet-kanban"),
  config: ["title"],
  ...overrides
})

const makeCommonPreference = (overrides: Partial<CommonBoardPreference> = {}): CommonBoardPreference => ({
  ...docBase(toRef<CommonBoardPreference>("common-pref-1"), board.class.CommonBoardPreference, core.space.Workspace),
  attachedTo: String(board.app.Board),
  ...overrides
})

interface Fixture {
  readonly boards?: ReadonlyArray<HulyBoard>
  readonly cards?: ReadonlyArray<HulyBoardCard>
  readonly labels?: ReadonlyArray<TagElement>
  readonly tagReferences?: ReadonlyArray<TagReference>
  readonly categories?: ReadonlyArray<TagCategory>
  readonly menuPages?: ReadonlyArray<MenuPage>
  readonly savedViews?: ReadonlyArray<FilteredView>
  readonly viewlets?: ReadonlyArray<Viewlet>
  readonly descriptors?: ReadonlyArray<ViewletDescriptor>
  readonly viewletPreferences?: ReadonlyArray<ViewletPreference>
  readonly commonPreferences?: ReadonlyArray<CommonBoardPreference>
}

const fieldMatches = (actual: unknown, expected: unknown): boolean => {
  if (expected !== null && typeof expected === "object") {
    // Fake SDK query matching must inspect the subset of Huly DocumentQuery operators used by these tests.

    const op = expected as { readonly $in?: ReadonlyArray<unknown>; readonly $like?: string }
    if (op.$in !== undefined) return op.$in.includes(actual)
    if (op.$like !== undefined && typeof actual === "string") {
      return actual.includes(op.$like.replaceAll("%", "").replaceAll("\\", ""))
    }
  }
  return actual === expected
}

const matchesQuery = <T extends Doc>(doc: T, query: DocumentQuery<T>): boolean =>
  // Fake SDK query matching reads dynamic Huly document fields by query key.

  Object.entries(query as Record<string, unknown>).every(([key, expected]) =>
    fieldMatches((doc as Record<string, unknown>)[key], expected)
  )

const createLayer = (fixture: Fixture = {}) => {
  const boards = [...(fixture.boards ?? [makeBoard()])]
  const cards = [...(fixture.cards ?? [makeCard()])]
  const labels = [...(fixture.labels ?? [makeLabel()])]
  const tagReferences = [...(fixture.tagReferences ?? [makeTagReference()])]
  const categories = [...(fixture.categories ?? [makeCategory()])]
  const menuPages = [
    ...(fixture.menuPages ?? [
      makeMenuPage(),
      makeMenuPage({
        _id: toRef<MenuPage>("menu-archive"),
        pageId: board.menuPageId.Archive,
        label: intl("board:string:Archive")
      })
    ])
  ]
  const savedViews = [...(fixture.savedViews ?? [makeSavedView()])]
  const viewlets = [
    ...(fixture.viewlets ?? [
      makeViewlet(),
      makeViewlet({
        _id: toRef<Viewlet>("viewlet-table"),
        descriptor: view.viewlet.Table,
        title: "Table",
        variant: "table"
      })
    ])
  ]
  const descriptors = [
    ...(fixture.descriptors ?? [
      makeDescriptor(),
      makeDescriptor({
        _id: view.viewlet.Table,
        label: intl("view:string:Table"),
        component: component("view:component:Table")
      })
    ])
  ]
  const viewletPreferences = [...(fixture.viewletPreferences ?? [makeViewletPreference()])]
  const commonPreferences = [...(fixture.commonPreferences ?? [makeCommonPreference()])]

  const selectSource = (classId: string): Array<Doc> => {
    if (classId === String(board.class.Board)) return boards
    if (classId === String(board.class.Card)) return cards
    if (classId === String(tags.class.TagElement)) return labels
    if (classId === String(tags.class.TagReference)) return tagReferences
    if (classId === String(tags.class.TagCategory)) return categories
    if (classId === String(view.class.FilteredView)) return savedViews
    if (classId === String(view.class.ViewletPreference)) return viewletPreferences
    if (classId === String(board.class.CommonBoardPreference)) return commonPreferences
    return []
  }
  const selectModelSource = (classId: string): Array<Doc> => {
    if (classId === String(board.class.MenuPage)) return menuPages
    if (classId === String(view.class.Viewlet)) return viewlets
    if (classId === String(view.class.ViewletDescriptor)) return descriptors
    return []
  }
  const makeFindAll =
    (select: (classId: string) => Array<Doc>): HulyClientOperations["findAll"] => (_class, query, options) => {
      // The fake SDK stores heterogeneous docs; each call narrows by class before applying the query.

      const matched = select(String(_class)).filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>))
      const limited = options?.limit === undefined ? matched : matched.slice(0, options.limit)
      // Huly's toFindResult generic is stricter than this class-indexed fake storage can express.

      return Effect.succeed(toFindResult(limited as Array<never>, matched.length))
    }
  const findAll = makeFindAll(selectSource)
  const findAllInModel = makeFindAll(selectModelSource)

  const layer = HulyClient.testLayer({
    getAccountUuid: () => account,
    findAll,
    findAllInModel,
    findOne: (_class, query, options) => Effect.map(findAll(_class, query, options), (result) => result[0]),
    createDoc: (_class, space, attributes, id) => {
      if (String(_class) === String(tags.class.TagElement)) {
        // createDoc attributes are class-specific; this branch has already narrowed to TagElement.

        const attrs = attributes as Partial<TagElement>
        const created = {
          ...docBase(toRef<TagElement>(String(id)), tags.class.TagElement, space),
          title: attrs.title ?? "",
          description: attrs.description ?? "",
          targetClass: attrs.targetClass ?? boardCardClass,
          color: attrs.color ?? 0,
          category: attrs.category ?? board.category.Other
        }
        labels.push(attrs.refCount === undefined ? created : { ...created, refCount: attrs.refCount })
      }
      // The fake client returns the generated SDK ref with the same erased runtime string.

      return Effect.succeed(id as never)
    },
    updateDoc: (_class, _space, objectId, operations) => {
      const target = String(_class) === String(tags.class.TagElement)
        ? labels.find((label) => String(label._id) === String(objectId))
        : undefined
      if (target !== undefined) Object.assign(target, operations)
      return Effect.succeed({})
    },
    removeDoc: (_class, _space, objectId) => {
      if (String(_class) === String(tags.class.TagElement)) {
        const index = labels.findIndex((label) => String(label._id) === String(objectId))
        if (index >= 0) labels.splice(index, 1)
      }
      if (String(_class) === String(tags.class.TagReference)) {
        const index = tagReferences.findIndex((ref) => String(ref._id) === String(objectId))
        if (index >= 0) tagReferences.splice(index, 1)
      }
      return Effect.succeed({})
    },
    addCollection: (_class, space, attachedTo, attachedToClass, collection, attributes) => {
      const id = toRef<TagReference>(`tag-ref-${tagReferences.length + 1}`)
      // addCollection attributes are class-specific; this fake only implements TagReference writes.

      const attrs = attributes as Partial<TagReference>
      const created = {
        ...docBase(id, tags.class.TagReference, space),
        attachedTo,
        attachedToClass,
        collection,
        tag: attrs.tag ?? labelId,
        title: attrs.title ?? "",
        color: attrs.color ?? 0
      }
      tagReferences.push(attrs.weight === undefined ? created : { ...created, weight: attrs.weight })
      // The fake client returns the generated SDK ref with the same erased runtime string.

      return Effect.succeed(id as never)
    }
  })

  return { layer, state: { commonPreferences, labels, tagReferences } }
}

describe("board labels and view discovery operations", () => {
  it.effect("manages board label definitions with board-card tag semantics", () =>
    Effect.gen(function*() {
      const fixture = createLayer()

      const listed = yield* listBoardLabels({ titleSearch: "Urg" }).pipe(Effect.provide(fixture.layer))
      expect(listed.labels[0]?.title).toBe("Urgent")
      expect(listed.labels[0]?.category).toBe(String(board.category.Other))

      expect(yield* createBoardLabel({ title: text("Urgent") }).pipe(Effect.provide(fixture.layer))).toMatchObject({
        created: false
      })
      const created = yield* createBoardLabel({ title: text("Fresh"), color: color(4) }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(created).toMatchObject({ created: true })
      expect(fixture.state.labels.at(-1)?.targetClass).toBe(board.class.Card)
      expect(fixture.state.labels.at(-1)?.category).toBe(board.category.Other)

      yield* updateBoardLabel({ label: l("Fresh"), title: text("Later"), description: null }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(fixture.state.labels.at(-1)?.title).toBe("Later")
      expect(fixture.state.labels.at(-1)?.description).toBe("")

      const deleted = yield* deleteBoardLabel({ label: l("Later") }).pipe(Effect.provide(fixture.layer))
      expect(deleted).toMatchObject({ deleted: true })
      expect(fixture.state.labels.find((label) => label.title === "Later")).toBeUndefined()

      const idConflictFixture = createLayer()
      const idConflictCreated = yield* createBoardLabel({ title: text(String(labelId)) }).pipe(
        Effect.provide(idConflictFixture.layer)
      )
      expect(idConflictCreated).toMatchObject({ created: true })
      expect(idConflictFixture.state.labels.at(-1)?.title).toBe(String(labelId))
    }))

  it.effect("detects duplicate board label titles and missing categories", () =>
    Effect.gen(function*() {
      const duplicateFixture = createLayer({
        labels: [makeLabel(), makeLabel({ _id: otherLabelId })]
      })
      expect(
        yield* Effect.flip(createBoardLabel({ title: text("Urgent") }).pipe(Effect.provide(duplicateFixture.layer)))
      )
        .toBeInstanceOf(BoardLabelIdentifierAmbiguousError)

      const missingCategoryFixture = createLayer({ categories: [] })
      expect(
        yield* Effect.flip(
          createBoardLabel({ title: text("Needs Category"), category: category("Missing") }).pipe(
            Effect.provide(missingCategoryFixture.layer)
          )
        )
      ).toMatchObject({ _tag: "TagCategoryNotFoundError" })
      expect(
        yield* Effect.flip(
          listBoardLabels({ category: category("Missing") }).pipe(Effect.provide(missingCategoryFixture.layer))
        )
      ).toMatchObject({ _tag: "TagCategoryNotFoundError" })
    }))

  it.effect("resolves board labels by id, reports read-locator failures, and omits absent ref counts", () =>
    Effect.gen(function*() {
      const fixture = createLayer({
        labels: [withoutRefCount(makeLabel({ title: "No Count" }))]
      })

      const listed = yield* listBoardLabels({ category: category("Other"), titleSearch: "" }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(listed.labels[0]).toMatchObject({ title: "No Count", category: String(board.category.Other) })
      expect(listed.labels[0]).not.toHaveProperty("refCount")

      const deletedById = yield* deleteBoardLabel({ label: l(String(labelId)) }).pipe(Effect.provide(fixture.layer))
      expect(deletedById).toMatchObject({ deleted: true })

      const duplicateFixture = createLayer({
        labels: [makeLabel(), makeLabel({ _id: otherLabelId })]
      })
      expect(
        yield* Effect.flip(deleteBoardLabel({ label: l("Urgent") }).pipe(Effect.provide(duplicateFixture.layer)))
      ).toBeInstanceOf(BoardLabelIdentifierAmbiguousError)

      expect(yield* Effect.flip(deleteBoardLabel({ label: l("Missing") }).pipe(Effect.provide(createLayer().layer))))
        .toBeInstanceOf(BoardLabelNotFoundError)

      const updateFixture = createLayer()
      yield* updateBoardLabel({ label: l("Urgent"), color: color(6), category: category("Other") }).pipe(
        Effect.provide(updateFixture.layer)
      )
      expect(updateFixture.state.labels[0]).toMatchObject({ color: 6, category: board.category.Other })

      const titleConflictFixture = createLayer({
        labels: [makeLabel(), makeLabel({ _id: otherLabelId, title: "Blocked" })]
      })
      expect(
        yield* Effect.flip(
          updateBoardLabel({ label: l("Urgent"), title: text("Blocked") }).pipe(
            Effect.provide(titleConflictFixture.layer)
          )
        )
      ).toBeInstanceOf(BoardLabelIdentifierAmbiguousError)

      const unfiltered = yield* listBoardLabels({}).pipe(Effect.provide(updateFixture.layer))
      expect(unfiltered.total).toBe(1)
    }))

  it.effect("lists, attaches, idempotently reattaches, and detaches board card labels", () =>
    Effect.gen(function*() {
      const fixture = createLayer()

      expect(
        (yield* listBoardCardLabels({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(fixture.layer)))
          .labels[0]?.title
      ).toBe("Urgent")

      const existing = yield* addBoardCardLabel({ board: b("Roadmap"), card: c("CARD-1"), label: l("Urgent") }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(existing.attached).toBe(false)

      const attached = yield* addBoardCardLabel({
        board: b("Roadmap"),
        card: c("CARD-1"),
        label: l("Fresh"),
        color: color(5)
      }).pipe(Effect.provide(fixture.layer))
      expect(attached.attached).toBe(true)
      expect(attached.labelCreated).toBe(true)
      expect(fixture.state.tagReferences.some((ref) => ref.title === "Fresh")).toBe(true)

      const removedMissing = yield* removeBoardCardLabel({
        board: b("Roadmap"),
        card: c("CARD-1"),
        label: l("Fresh")
      }).pipe(Effect.provide(fixture.layer))
      expect(removedMissing.detached).toBe(true)
      const removedAgain = yield* removeBoardCardLabel({ board: b("Roadmap"), card: c("CARD-1"), label: l("Fresh") })
        .pipe(Effect.provide(fixture.layer))
      expect(removedAgain.detached).toBe(false)
    }))

  it.effect("reads board menu pages, saved views, viewlets, and common preference rows", () =>
    Effect.gen(function*() {
      const fixture = createLayer()

      const pages = yield* listBoardMenuPages({}).pipe(Effect.provide(fixture.layer))
      expect(pages.pages.map((page) => page.pageId)).toEqual([
        String(board.menuPageId.Main),
        String(board.menuPageId.Archive)
      ])
      expect((yield* listBoardMenuPages({ page: m("main") }).pipe(Effect.provide(fixture.layer))).pages[0]?.label)
        .toBe("board:string:Main")

      const savedViews = yield* listBoardSavedViews({ visibility: "own" }).pipe(Effect.provide(fixture.layer))
      expect(savedViews.savedViews[0]?.visibility).toBe("own")
      const savedView = yield* getBoardSavedView({ savedView: sv("Mine") }).pipe(Effect.provide(fixture.layer))
      expect(savedView.attachedTo).toBe(String(board.app.Board))
      expect(savedView.filters).toBe("[{\"key\":\"status\"}]")

      const viewlets = yield* listBoardViewlets({}).pipe(Effect.provide(fixture.layer))
      expect(viewlets.viewlets.map((item) => item.title)).toEqual(["Kanban", "Table"])
      expect(viewlets.viewlets[0]?.descriptorInfo?.label).toBe("view:string:Kanban")
      expect(viewlets.viewlets[0]?.preferences[0]?.config).toEqual(["title"])

      const preference = yield* getBoardCommonPreference().pipe(Effect.provide(fixture.layer))
      expect(preference.present).toBe(true)
      expect(preference.attachedTo).toBe(String(board.app.Board))

      const absent = yield* getBoardCommonPreference().pipe(
        Effect.provide(createLayer({ commonPreferences: [] }).layer)
      )
      expect(absent).toEqual({ present: false, attachedTo: String(board.app.Board) })
    }))

  it.effect("covers board view locator variants, visibility filters, and optional viewlet metadata", () =>
    Effect.gen(function*() {
      const duplicateLabel = intl("board:string:Duplicate")
      const { sharable: _omittedSharable, ...sharedSavedView } = makeSavedView({
        _id: toRef<FilteredView>("saved-view-shared"),
        name: "Shared",
        users: [],
        viewletId: null
      })
      const {
        filterClass: _omittedFilterClass,
        viewOptions: _omittedViewOptions,
        ...minimalSavedView
      } = makeSavedView({
        _id: toRef<FilteredView>("saved-view-minimal"),
        name: "Minimal"
      })
      const {
        color: _omittedDescriptorColor,
        ...blankDescriptor
      } = makeDescriptor({
        _id: toRef<ViewletDescriptor>("descriptor-blank"),
        label: intl(" "),
        component: component("view:component:Blank")
      })
      const {
        props: _omittedProps,
        ...blankViewlet
      } = makeViewlet({
        _id: toRef<Viewlet>("viewlet-blank"),
        descriptor: toRef<ViewletDescriptor>("descriptor-blank"),
        title: " ",
        variant: " "
      })
      const fixture = createLayer({
        menuPages: [
          makeMenuPage(),
          makeMenuPage({
            _id: toRef<MenuPage>("menu-duplicate-a"),
            pageId: "board:menuPageId:DuplicateA",
            label: duplicateLabel
          }),
          makeMenuPage({
            _id: toRef<MenuPage>("menu-duplicate-b"),
            pageId: "board:menuPageId:DuplicateB",
            label: duplicateLabel
          })
        ],
        savedViews: [makeSavedView(), sharedSavedView, minimalSavedView],
        viewlets: [
          makeViewlet({
            baseQuery: { title: "Planning" },
            options: { limit: 1 },
            configOptions: { hiddenKeys: ["status"] },
            viewOptions: { groupBy: ["status"], orderBy: [], other: [], groupDepth: 1 },
            masterDetailOptions: {
              views: [{ class: boardCardClass, view: toRef<ViewletDescriptor>("descriptor-kanban") }]
            }
          }),
          makeViewlet({
            _id: toRef<Viewlet>("viewlet-table"),
            descriptor: view.viewlet.Table,
            title: "Table",
            variant: "table"
          }),
          blankViewlet
        ],
        descriptors: [
          makeDescriptor({ icon: tags.icon.Tags, hidden: true, readonly: true }),
          makeDescriptor({
            _id: view.viewlet.Table,
            label: intl("view:string:Table"),
            component: component("view:component:Table")
          }),
          blankDescriptor
        ],
        viewletPreferences: []
      })

      expect((yield* listBoardMenuPages({ page: m("menu-main") }).pipe(Effect.provide(fixture.layer))).pages[0]?.id)
        .toBe("menu-main")
      expect(
        (yield* listBoardMenuPages({ page: m("board:string:Main") }).pipe(Effect.provide(fixture.layer))).pages[0]
          ?.pageId
      ).toBe(String(board.menuPageId.Main))
      expect(
        yield* Effect.flip(
          listBoardMenuPages({ page: m("board:string:Duplicate") }).pipe(Effect.provide(fixture.layer))
        )
      ).toBeInstanceOf(BoardMenuPageIdentifierAmbiguousError)

      const allSavedViews = yield* listBoardSavedViews({}).pipe(Effect.provide(fixture.layer))
      expect(allSavedViews.total).toBe(3)
      const sharedSavedViews = yield* listBoardSavedViews({ visibility: "shared", nameSearch: "Shared" }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(sharedSavedViews.savedViews).toEqual([
        { id: "saved-view-shared", name: "Shared", visibility: "shared", users: 0 }
      ])
      const limitedSharedSavedViews = yield* listBoardSavedViews({ visibility: "shared", limit: 1 }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(limitedSharedSavedViews).toEqual({
        savedViews: [{ id: "saved-view-shared", name: "Shared", visibility: "shared", users: 0 }],
        total: 1
      })
      const byId = yield* getBoardSavedView({ savedView: sv("saved-view-shared") }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(byId).not.toHaveProperty("viewletId")
      expect(byId).not.toHaveProperty("sharable")
      const minimal = yield* getBoardSavedView({ savedView: sv("saved-view-minimal") }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(minimal).not.toHaveProperty("viewOptions")
      expect(minimal).not.toHaveProperty("filterClass")
      expect(yield* Effect.flip(getBoardSavedView({ savedView: sv("Missing") }).pipe(Effect.provide(fixture.layer))))
        .toBeInstanceOf(BoardSavedViewNotFoundError)

      const viewletById = yield* listBoardViewlets({ viewlet: v("viewlet-kanban") }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(viewletById.viewlets[0]?.baseQuery).toEqual({ title: "Planning" })
      expect(viewletById.viewlets[0]?.descriptorInfo).toMatchObject({ hidden: true, readonly: true })
      expect((yield* listBoardViewlets({ viewlet: v("table") }).pipe(Effect.provide(fixture.layer))).viewlets[0]?.id)
        .toBe("viewlet-table")
      expect(
        (yield* listBoardViewlets({ viewlet: v(String(view.viewlet.Table)) }).pipe(Effect.provide(fixture.layer)))
          .viewlets[0]?.variant
      ).toBe("table")
      const blank = yield* listBoardViewlets({ viewlet: v("viewlet-blank") }).pipe(Effect.provide(fixture.layer))
      expect(blank.viewlets[0]).not.toHaveProperty("title")
      expect(blank.viewlets[0]).not.toHaveProperty("variant")
      expect(blank.viewlets[0]).not.toHaveProperty("props")
      expect(blank.viewlets[0]?.descriptorInfo).not.toHaveProperty("label")
      expect(blank.viewlets[0]?.descriptorInfo).not.toHaveProperty("color")
      expect(yield* Effect.flip(listBoardViewlets({ viewlet: v("Missing") }).pipe(Effect.provide(fixture.layer))))
        .toBeInstanceOf(BoardViewletNotFoundError)

      const empty = yield* listBoardViewlets({}).pipe(
        Effect.provide(createLayer({ viewlets: [], descriptors: [], viewletPreferences: [] }).layer)
      )
      expect(empty).toEqual({ viewlets: [], total: 0 })

      const missingDescriptor = yield* listBoardViewlets({ limit: 1 }).pipe(
        Effect.provide(createLayer({ descriptors: [], viewletPreferences: [] }).layer)
      )
      expect(missingDescriptor.viewlets[0]).not.toHaveProperty("descriptorInfo")
    }))

  it.effect("fails missing or ambiguous read-only board view locators", () =>
    Effect.gen(function*() {
      const ambiguousSavedViewFixture = createLayer({
        savedViews: [makeSavedView(), makeSavedView({ _id: toRef<FilteredView>("saved-view-2") })]
      })
      expect(
        yield* Effect.flip(
          getBoardSavedView({ savedView: sv("Mine") }).pipe(Effect.provide(ambiguousSavedViewFixture.layer))
        )
      ).toBeInstanceOf(BoardSavedViewIdentifierAmbiguousError)

      const ambiguousViewletFixture = createLayer({
        viewlets: [makeViewlet(), makeViewlet({ _id: toRef<Viewlet>("viewlet-kanban-2") })]
      })
      expect(
        yield* Effect.flip(
          listBoardViewlets({ viewlet: v("Kanban") }).pipe(Effect.provide(ambiguousViewletFixture.layer))
        )
      ).toBeInstanceOf(BoardViewletIdentifierAmbiguousError)

      expect(yield* Effect.flip(listBoardMenuPages({ page: m("missing") }).pipe(Effect.provide(createLayer().layer))))
        .toBeInstanceOf(BoardMenuPageNotFoundError)
    }))
})
