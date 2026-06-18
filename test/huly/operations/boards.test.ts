import { describe, it } from "@effect/vitest"
import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import { AvatarType, type Employee, type Person } from "@hcengineering/contact"
import type {
  AccountUuid,
  Class,
  Doc,
  DocumentQuery,
  Ref,
  Sequence,
  Space,
  Status,
  TxResult
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { ProjectType, TaskType, TaskTypeDescriptor } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  BoardCardIdentifier,
  BoardCardTitle,
  BoardIdentifier,
  BoardName,
  NonEmptyString,
  Timestamp
} from "../../../src/domain/schemas.js"
import { PersonName } from "../../../src/domain/schemas/shared.js"
import { ProjectTypeRefSchema, TaskTypeRefSchema } from "../../../src/domain/schemas/task-management.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import {
  BoardArchivedCardDeleteError,
  BoardCardIdentifierAmbiguousError,
  BoardCardNotFoundError,
  BoardIdentifierAmbiguousError,
  BoardModelSequenceMissingError,
  BoardMutationUnsupportedError,
  BoardProjectTypeIdentifierAmbiguousError,
  BoardProjectTypeNotFoundError,
  BoardStatusIdentifierAmbiguousError,
  BoardStatusNotFoundError,
  BoardTaskTypeIdentifierAmbiguousError,
  BoardTaskTypeNotFoundError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../../../src/huly/errors.js"
import { board, contact, core, task } from "../../../src/huly/huly-plugins.js"
import { resolveBoardFromContext } from "../../../src/huly/operations/boards-shared.js"
import {
  archiveBoard,
  archiveBoardCard,
  createBoard,
  createBoardCard,
  deleteBoardCard,
  getBoard,
  getBoardCard,
  listBoardCards,
  listBoards,
  unarchiveBoard,
  unarchiveBoardCard,
  updateBoard,
  updateBoardCard
} from "../../../src/huly/operations/boards.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"

const account = "00000000-0000-4000-8000-000000000000" as AccountUuid
const boardId = toRef<HulyBoard>("board-1")
const boardSpaceId = toRef<Space>(boardId)
const cardId = toRef<HulyBoardCard>("card-1")
const projectTypeId = toRef<ProjectType>("project-type-board")
const taskTypeId = toRef<TaskType>("task-type-card")
const todoStatusId = toRef<Status>("status-todo")
const doneStatusId = toRef<Status>("status-done")
const b = BoardIdentifier.make
const c = BoardCardIdentifier.make
const bn = BoardName.make
const ct = BoardCardTitle.make
const n = NonEmptyString.make
const p = PersonName.make
const pt = ProjectTypeRefSchema.make
const t = Timestamp.make
const tt = TaskTypeRefSchema.make

const docBase = <T extends Doc>(_id: Ref<T>, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id,
  _class,
  space,
  modifiedOn: 1,
  modifiedBy: core.account.System
})

const makeProjectType = (overrides: Partial<ProjectType> = {}): ProjectType => {
  const value: ProjectType = {
    ...docBase(projectTypeId, task.class.ProjectType, core.space.Model),
    name: "Board",
    descriptor: board.descriptors.BoardType,
    description: "",
    shortDescription: "",
    members: [],
    roles: 0,
    targetClass: board.class.Board,
    classic: false,
    tasks: [taskTypeId],
    statuses: [
      { _id: todoStatusId, taskType: taskTypeId },
      { _id: doneStatusId, taskType: taskTypeId }
    ],
    ...overrides
  }
  return value
}

const makeTaskType = (overrides: Partial<TaskType> = {}): TaskType => {
  const value: TaskType = {
    ...docBase(taskTypeId, task.class.TaskType, core.space.Model),
    parent: projectTypeId,
    descriptor: toRef<TaskTypeDescriptor>("board:taskTypeDescriptor:Card"),
    name: "Card",
    kind: "task",
    ofClass: board.class.Card,
    targetClass: board.class.Card,
    statuses: [todoStatusId, doneStatusId],
    statusClass: core.class.Status,
    statusCategories: [],
    ...overrides
  }
  return value
}

const makeStatus = (_id: Ref<Status>, name: string): Status => ({
  ...docBase(_id, core.class.Status, core.space.Model),
  ofAttribute: board.attribute.State,
  name
})

const makeBoard = (overrides: Partial<HulyBoard> = {}): HulyBoard => {
  const value: HulyBoard = {
    ...docBase(boardId, board.class.Board, core.space.Space),
    name: "Roadmap",
    description: "Plan",
    private: false,
    archived: false,
    members: [account],
    owners: [account],
    type: projectTypeId,
    ...overrides
  }
  return value
}

const makeCard = (overrides: Partial<HulyBoardCard> = {}): HulyBoardCard => {
  const value: HulyBoardCard = {
    ...docBase(cardId, board.class.Card, boardSpaceId),
    attachedTo: boardId,
    attachedToClass: board.class.Board,
    collection: "cards",
    kind: taskTypeId,
    status: todoStatusId,
    number: 1,
    identifier: "CARD-1",
    rank: "a",
    title: "Planning",
    description: markdownToMarkupString("Initial", testMarkupUrlConfig),
    assignee: null,
    dueDate: null,
    startDate: null,
    isArchived: false,
    members: [],
    ...overrides
  }
  return value
}

const makeCardWithoutMembers = (overrides: Partial<HulyBoardCard> = {}): HulyBoardCard => {
  const { members: _members, ...card } = makeCard(overrides)
  return card
}

const makeEmployee = (id: string, name: string): Employee => {
  const value: Employee = {
    ...docBase(toRef<Employee>(id), contact.mixin.Employee, core.space.Space),
    name,
    avatarType: AvatarType.COLOR,
    active: true
  }
  return value
}

const makePerson = (id: string, name: string): Person => {
  const value: Person = {
    ...docBase(toRef<Person>(id), contact.class.Person, core.space.Space),
    avatarType: AvatarType.COLOR,
    name
  }
  return value
}

interface BoardFixture {
  readonly boards?: ReadonlyArray<HulyBoard>
  readonly cards?: ReadonlyArray<HulyBoardCard>
  readonly projectTypes?: ReadonlyArray<ProjectType>
  readonly taskTypes?: ReadonlyArray<TaskType>
  readonly statuses?: ReadonlyArray<Status>
  readonly employees?: ReadonlyArray<Employee>
  readonly persons?: ReadonlyArray<Person>
  readonly sequences?: ReadonlyArray<Sequence>
  readonly sequenceUpdateResult?: TxResult
  readonly withoutRemoveCollection?: boolean
}

const fieldMatches = (actual: unknown, expected: unknown): boolean => {
  if (expected !== null && typeof expected === "object") {
    const op = expected as { readonly $in?: ReadonlyArray<unknown>; readonly $ne?: unknown; readonly $like?: string }
    if (op.$in !== undefined) return op.$in.includes(actual)
    if (op.$ne !== undefined) return actual !== op.$ne
    if (op.$like !== undefined && typeof actual === "string") {
      return actual.includes(op.$like.replaceAll("%", "").replaceAll("\\", ""))
    }
  }
  return actual === expected
}

const matchesQuery = <T extends Doc>(doc: T, query: DocumentQuery<T>): boolean =>
  Object.entries(query as Record<string, unknown>).every(([key, expected]) =>
    fieldMatches((doc as Record<string, unknown>)[key], expected)
  )

const createLayer = (fixture: BoardFixture = {}) => {
  const boards = [...(fixture.boards ?? [makeBoard()])]
  const cards = [...(fixture.cards ?? [makeCard()])]
  const projectTypes = [...(fixture.projectTypes ?? [makeProjectType()])]
  const taskTypes = [...(fixture.taskTypes ?? [makeTaskType()])]
  const statuses = [...(fixture.statuses ?? [makeStatus(todoStatusId, "Todo"), makeStatus(doneStatusId, "Done")])]
  const employees = [...(fixture.employees ?? [makeEmployee("emp-1", "Alice"), makeEmployee("emp-2", "Bob")])]
  const persons = [...(fixture.persons ?? employees)]
  const sequences = [
    ...(fixture.sequences ?? [{
      ...docBase("seq-board-card" as Ref<Sequence>, core.class.Sequence, core.space.Model),
      attachedTo: board.class.Card,
      sequence: 1
    }])
  ]
  const hasSequenceUpdateResult = Object.prototype.hasOwnProperty.call(fixture, "sequenceUpdateResult")
  const captures: { readonly createdCards: Array<HulyBoardCard>; readonly updates: Array<unknown> } = {
    createdCards: [],
    updates: []
  }

  const findAll: HulyClientOperations["findAll"] = (_class, query, options) => {
    const classId = String(_class)
    const source: Array<Doc> = classId === String(board.class.Board)
      ? boards
      : classId === String(board.class.Card)
      ? cards
      : classId === String(task.class.ProjectType)
      ? projectTypes
      : classId === String(task.class.TaskType)
      ? taskTypes
      : classId === String(core.class.Status)
      ? statuses
      : classId === String(core.class.Sequence)
      ? sequences
      : classId === String(contact.mixin.Employee)
      ? employees
      : classId === String(contact.class.Person)
      ? persons
      : []
    const matched = source.filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>))
    const limited = options?.limit === undefined ? matched : matched.slice(0, options.limit)
    return Effect.succeed(toFindResult(limited as Array<never>, matched.length))
  }

  const removeCollection: Exclude<HulyClientOperations["removeCollection"], undefined> = (_class, _space, objectId) => {
    const index = cards.findIndex((card) => String(card._id) === String(objectId))
    if (index >= 0) cards.splice(index, 1)
    return Effect.succeed(boardId as never)
  }

  const ops: Partial<HulyClientOperations> = {
    markupUrlConfig: testMarkupUrlConfig,
    workbenchUrlConfig: testWorkbenchUrlConfig,
    getAccountUuid: () => account as never,
    findAll,
    findOne: (_class, query, options) =>
      Effect.map(findAll(_class, query, options), (result) => {
        if (options?.sort !== undefined && String(_class) === String(board.class.Card)) {
          return [...result].sort((a, b) =>
            String((b as Record<string, unknown>).rank).localeCompare(String((a as Record<string, unknown>).rank))
          )[0]
        }
        return result[0]
      }),
    createDoc: (_class, _space, attributes, id) => {
      if (String(_class) === String(board.class.Board)) {
        // eslint-disable-next-line no-restricted-syntax -- SDK-shaped fake narrows generic T by runtime class id
        boards.push({
          ...docBase(toRef<HulyBoard>(String(id)), board.class.Board, core.space.Space),
          ...attributes
        } as unknown as HulyBoard)
      }
      return Effect.succeed(id as never)
    },
    updateDoc: (_class, _space, objectId, operations, retrieve) => {
      captures.updates.push(operations)
      const classId = String(_class)
      if (classId === String(core.class.Sequence)) {
        const sequence = sequences.find((s) => String(s._id) === String(objectId))
        if (sequence !== undefined) sequence.sequence += 1
        return Effect.succeed(
          retrieve ? (hasSequenceUpdateResult ? fixture.sequenceUpdateResult ?? {} : { object: sequence }) : {}
        )
      }
      const target = classId === String(board.class.Board)
        ? boards.find((item) => String(item._id) === String(objectId))
        : cards.find((item) => String(item._id) === String(objectId))
      if (target !== undefined) Object.assign(target, operations)
      return Effect.succeed({})
    },
    addCollection: (_class, space, attachedTo, attachedToClass, collection, attributes, id) => {
      // eslint-disable-next-line no-restricted-syntax -- SDK-shaped fake narrows generic P by runtime class id
      const created = {
        ...docBase(toRef<HulyBoardCard>(String(id)), board.class.Card, space),
        attachedTo,
        attachedToClass,
        collection,
        ...attributes
      } as unknown as HulyBoardCard
      cards.push(created)
      captures.createdCards.push(created)
      return Effect.succeed(id as never)
    },
    ...(fixture.withoutRemoveCollection === true ? {} : { removeCollection })
  }

  return {
    captures,
    layer: HulyClient.testLayer(ops),
    state: { boards, cards, employees, projectTypes, statuses, taskTypes }
  }
}

const provideDiagnostics = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  layer: ReturnType<typeof HulyClient.testLayer>
) =>
  Effect.gen(function*() {
    const scope = yield* makeDiagnosticsScope
    return yield* effect.pipe(Effect.provideService(Diagnostics, scope.service), Effect.provide(layer))
  })

describe("board operations", () => {
  it.effect("lists, gets, creates, updates, archives, and unarchives boards", () =>
    Effect.gen(function*() {
      const fixture = createLayer()

      expect((yield* listBoards({}).pipe(Effect.provide(fixture.layer))).boards[0].name).toBe("Roadmap")
      expect((yield* getBoard({ board: b("Roadmap") }).pipe(Effect.provide(fixture.layer))).cards).toBe(1)
      expect((yield* createBoard({ name: bn("Roadmap") }).pipe(Effect.provide(fixture.layer))).created).toBe(false)
      expect((yield* createBoard({ name: bn("New Board") }).pipe(Effect.provide(fixture.layer))).created).toBe(true)
      expect(
        (yield* updateBoard({ board: b("Roadmap"), description: null }).pipe(Effect.provide(fixture.layer))).updated
      )
        .toBe(true)
      expect((yield* archiveBoard({ board: b("Roadmap") }).pipe(Effect.provide(fixture.layer))).updated).toBe(true)
      expect(fixture.state.boards[0].archived).toBe(true)
      expect((yield* unarchiveBoard({ board: b("Roadmap") }).pipe(Effect.provide(fixture.layer))).updated).toBe(true)
      expect(fixture.state.boards[0].archived).toBe(false)
      expect(
        (yield* updateBoard({ board: b("board-1"), name: bn("Roadmap Next"), private: true }).pipe(
          Effect.provide(fixture.layer)
        )).updated
      ).toBe(true)
      expect(fixture.state.boards[0].name).toBe("Roadmap Next")
      expect(fixture.state.boards[0].private).toBe(true)
      expect((yield* resolveBoardFromContext(b("Roadmap Next")).pipe(Effect.provide(fixture.layer))).board._id).toBe(
        boardId
      )
      expect(
        (yield* resolveBoardFromContext(b("Roadmap Next"), { includeArchived: false }).pipe(
          Effect.provide(fixture.layer)
        ))
          .board
          ._id
      ).toBe(boardId)
    }))

  it.effect("lists and gets cards by id, identifier, number, and exact title", () =>
    Effect.gen(function*() {
      const fixture = createLayer()

      const listed = yield* provideDiagnostics(listBoardCards({ board: b("Roadmap") }), fixture.layer)
      expect(listed.cards[0].identifier).toBe("CARD-1")
      expect((yield* provideDiagnostics(getBoardCard({ board: b("Roadmap"), card: c("card-1") }), fixture.layer)).id)
        .toBe("card-1")
      expect(
        (yield* provideDiagnostics(getBoardCard({ board: b("Roadmap"), card: c("CARD-1") }), fixture.layer)).number
      )
        .toBe(1)
      expect((yield* provideDiagnostics(getBoardCard({ board: b("Roadmap"), card: c("1") }), fixture.layer)).number)
        .toBe(1)
      expect(
        (yield* provideDiagnostics(getBoardCard({ board: b("Roadmap"), card: c("Planning") }), fixture.layer)).title
      )
        .toBe("Planning")
    }))

  it.effect("creates a card with default workflow, markup description, people, dates, location, and cover", () =>
    Effect.gen(function*() {
      const fixture = createLayer({ cards: [] })
      const result = yield* provideDiagnostics(
        createBoardCard({
          board: b("Roadmap"),
          title: ct("Build"),
          description: "**Ship**",
          assignee: p("Alice"),
          members: [n("Bob"), n("Bob")],
          startDate: t(1700000000000),
          dueDate: t(1700100000000),
          location: "Remote",
          cover: { color: 2, size: "large" }
        }),
        fixture.layer
      )

      expect(result.identifier).toBe("CARD-2")
      const created = fixture.captures.createdCards[0]
      expect(created.status).toBe(todoStatusId)
      expect(created.kind).toBe(taskTypeId)
      expect(created.assignee).toBe("emp-1")
      expect(created.members).toEqual(["emp-2"])
      expect(created.location).toBe("Remote")
      expect(created.cover).toEqual({ color: 2, size: "large" })
      expect(created.description).toContain("Ship")
    }))

  it.effect("updates card mutable fields and archives, unarchives, then deletes only after archive", () =>
    Effect.gen(function*() {
      const fixture = createLayer()
      yield* provideDiagnostics(
        updateBoardCard({
          board: b("Roadmap"),
          card: c("CARD-1"),
          title: ct("Updated"),
          description: null,
          status: n("Done"),
          assignee: null,
          addMembers: [n("Alice")],
          location: null,
          cover: null,
          startDate: null,
          dueDate: null
        }),
        fixture.layer
      )

      expect(fixture.state.cards[0].title).toBe("Updated")
      expect(fixture.state.cards[0].status).toBe(doneStatusId)
      expect(fixture.state.cards[0].assignee).toBeNull()
      expect(fixture.state.cards[0].members).toEqual(["emp-1"])
      expect(fixture.state.cards[0].cover).toBeNull()

      const activeDelete = yield* Effect.flip(
        deleteBoardCard({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(fixture.layer))
      )
      expect(activeDelete).toBeInstanceOf(BoardArchivedCardDeleteError)
      yield* archiveBoardCard({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(fixture.layer))
      expect(fixture.state.cards[0].isArchived).toBe(true)
      yield* unarchiveBoardCard({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(fixture.layer))
      expect(fixture.state.cards[0].isArchived).toBe(false)
      yield* archiveBoardCard({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(fixture.layer))
      expect(
        (yield* deleteBoardCard({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(fixture.layer))).deleted
      )
        .toBe(true)
      expect(fixture.state.cards).toHaveLength(0)
    }))

  it.effect("fails ambiguous board, card, task type, and status locators with domain errors", () =>
    Effect.gen(function*() {
      const duplicateCard = makeCard({ _id: "card-2" as Ref<HulyBoardCard> })
      const duplicateStatus = makeStatus("status-todo-2" as Ref<Status>, "Todo")
      const duplicateTask = makeTaskType({ _id: "task-type-card-2" as Ref<TaskType> })
      const ambiguousFixture = createLayer({
        boards: [makeBoard(), makeBoard({ _id: "board-2" as Ref<HulyBoard> })],
        cards: [makeCard(), duplicateCard],
        statuses: [makeStatus(todoStatusId, "Todo"), makeStatus(doneStatusId, "Done"), duplicateStatus],
        taskTypes: [makeTaskType(), duplicateTask]
      })
      const statusFixture = createLayer({
        projectTypes: [makeProjectType({
          statuses: [
            { _id: todoStatusId, taskType: taskTypeId },
            { _id: doneStatusId, taskType: taskTypeId },
            { _id: duplicateStatus._id, taskType: taskTypeId }
          ]
        })],
        taskTypes: [makeTaskType({ statuses: [todoStatusId, doneStatusId, duplicateStatus._id] })],
        statuses: [makeStatus(todoStatusId, "Todo"), makeStatus(doneStatusId, "Done"), duplicateStatus]
      })

      expect(yield* Effect.flip(getBoard({ board: b("Roadmap") }).pipe(Effect.provide(ambiguousFixture.layer))))
        .toBeInstanceOf(BoardIdentifierAmbiguousError)
      expect(
        yield* Effect.flip(
          provideDiagnostics(getBoardCard({ board: b("board-1"), card: c("Planning") }), ambiguousFixture.layer)
        )
      )
        .toBeInstanceOf(BoardCardIdentifierAmbiguousError)
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("board-1"), title: ct("X"), kind: tt("Card") }),
            ambiguousFixture.layer
          )
        )
      )
        .toBeInstanceOf(BoardTaskTypeIdentifierAmbiguousError)
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("board-1"), title: ct("X"), status: n("Todo") }),
            statusFixture.layer
          )
        )
      )
        .toBeInstanceOf(BoardStatusIdentifierAmbiguousError)
    }))

  it.effect("filters archived records and projects card metadata with fallbacks", () =>
    Effect.gen(function*() {
      const archivedCard = makeCard({
        _id: "card-2" as Ref<HulyBoardCard>,
        identifier: "CARD-2",
        isArchived: true,
        number: 2,
        title: "Archived Planning"
      })
      const metadataFixture = createLayer({
        boards: [makeBoard(), makeBoard({ _id: "board-archived" as Ref<HulyBoard>, archived: true, name: "Old" })],
        cards: [makeCard({ assignee: toRef<Person>("emp-1") }), archivedCard]
      })
      expect((yield* listBoards({}).pipe(Effect.provide(metadataFixture.layer))).boards).toHaveLength(1)
      expect((yield* listBoards({ includeArchived: true }).pipe(Effect.provide(metadataFixture.layer))).boards)
        .toHaveLength(2)
      expect((yield* provideDiagnostics(listBoardCards({ board: b("Roadmap") }), metadataFixture.layer)).cards)
        .toHaveLength(1)
      expect(
        (yield* provideDiagnostics(listBoardCards({ board: b("Roadmap") }), metadataFixture.layer)).cards[0].assignee
      )
        .toBe("Alice")
      expect(
        (yield* provideDiagnostics(
          listBoardCards({ board: b("Roadmap"), includeArchived: true, titleSearch: "Archived" }),
          metadataFixture.layer
        )).cards[0].identifier
      ).toBe("CARD-2")

      const detailFixture = createLayer({
        cards: [makeCard({
          assignee: toRef<Person>("emp-1"),
          cover: { color: 4, size: "small" },
          createdOn: 1700000000000,
          location: "Office",
          members: [toRef<Employee>("emp-2"), toRef<Employee>("missing-employee")],
          startDate: 1700000100000,
          status: "status-fallback" as Ref<Status>
        })],
        projectTypes: [makeProjectType({ statuses: [] })],
        taskTypes: [makeTaskType({ statuses: [] })]
      })
      const detail = yield* provideDiagnostics(
        getBoardCard({ board: b("Roadmap"), card: c("CARD-1") }),
        detailFixture.layer
      )
      expect(detail.assignee).toBe("Alice")
      expect(detail.members).toEqual(["Bob", "missing-employee"])
      expect(detail.status).toBe("status-fallback")
      expect(detail.cover).toEqual({ color: 4, size: "small" })
      expect(detail.location).toBe("Office")
      expect(detail.startDate).toBe(1700000100000)
      expect(detail.createdOn).toBe(1700000000000)

      const noMembersFixture = createLayer({
        cards: [makeCardWithoutMembers({ kind: "missing-task-type" as Ref<TaskType> })]
      })
      const noMembersDetail = yield* provideDiagnostics(
        getBoardCard({ board: b("Roadmap"), card: c("CARD-1") }),
        noMembersFixture.layer
      )
      expect(noMembersDetail.kind).toBe("missing-task-type")
      expect(noMembersDetail.members).toEqual([])
    }))

  it.effect("creates boards with explicit project type locators and rejects invalid model locators", () =>
    Effect.gen(function*() {
      const byIdFixture = createLayer({ boards: [] })
      expect(
        (yield* createBoard({ name: bn("By ID"), projectType: pt(String(projectTypeId)) }).pipe(
          Effect.provide(byIdFixture.layer)
        )).created
      ).toBe(true)

      const byNameFixture = createLayer({ boards: [] })
      expect(
        (yield* createBoard({ name: bn("By Name"), projectType: pt("Board") }).pipe(
          Effect.provide(byNameFixture.layer)
        ))
          .created
      ).toBe(true)

      const emptyDescriptionFixture = createLayer({ boards: [makeBoard({ description: "" })] })
      expect((yield* getBoard({ board: b("Roadmap") }).pipe(Effect.provide(emptyDescriptionFixture.layer))).description)
        .toBeUndefined()

      const duplicateBoardFixture = createLayer({
        boards: [makeBoard(), makeBoard({ _id: "board-2" as Ref<HulyBoard> })]
      })
      expect(yield* Effect.flip(createBoard({ name: bn("Roadmap") }).pipe(Effect.provide(duplicateBoardFixture.layer))))
        .toBeInstanceOf(BoardIdentifierAmbiguousError)

      const missingProjectFixture = createLayer({ projectTypes: [] })
      expect(yield* Effect.flip(createBoard({ name: bn("No Type") }).pipe(Effect.provide(missingProjectFixture.layer))))
        .toBeInstanceOf(BoardProjectTypeNotFoundError)
      expect(yield* Effect.flip(getBoard({ board: b("board-1") }).pipe(Effect.provide(missingProjectFixture.layer))))
        .toBeInstanceOf(BoardProjectTypeNotFoundError)

      const nonBoardProjectFixture = createLayer({
        projectTypes: [makeProjectType({
          descriptor: toRef("tracker:projectType:Classic"),
          targetClass: task.class.Project
        })]
      })
      expect(
        yield* Effect.flip(
          createBoard({ name: bn("Wrong Type"), projectType: pt(String(projectTypeId)) }).pipe(
            Effect.provide(nonBoardProjectFixture.layer)
          )
        )
      ).toBeInstanceOf(BoardProjectTypeNotFoundError)

      const ambiguousProjectFixture = createLayer({
        projectTypes: [makeProjectType(), makeProjectType({ _id: "project-type-2" as Ref<ProjectType> })]
      })
      expect(
        yield* Effect.flip(
          createBoard({ name: bn("Ambiguous Type"), projectType: pt("Board") }).pipe(
            Effect.provide(ambiguousProjectFixture.layer)
          )
        )
      ).toBeInstanceOf(BoardProjectTypeIdentifierAmbiguousError)
    }))

  it.effect("rejects missing board card model pieces and sequence failures", () =>
    Effect.gen(function*() {
      const parentTaskFixture = createLayer({
        cards: [],
        projectTypes: [makeProjectType({ tasks: [], statuses: [{ _id: todoStatusId, taskType: taskTypeId }] })],
        taskTypes: [makeTaskType({ statuses: [] })]
      })
      yield* provideDiagnostics(
        createBoardCard({ board: b("Roadmap"), title: ct("Parent Kind") }),
        parentTaskFixture.layer
      )
      expect(parentTaskFixture.captures.createdCards[0].kind).toBe(taskTypeId)
      expect(parentTaskFixture.captures.createdCards[0].status).toBe(todoStatusId)

      const fallbackTaskFixture = createLayer({
        cards: [],
        taskTypes: [makeTaskType({ ofClass: task.class.Task, targetClass: task.class.Task })]
      })
      yield* provideDiagnostics(
        createBoardCard({ board: b("Roadmap"), title: ct("Fallback Kind") }),
        fallbackTaskFixture.layer
      )
      expect(fallbackTaskFixture.captures.createdCards[0].kind).toBe(taskTypeId)

      const missingTaskFixture = createLayer({ taskTypes: [] })
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("Roadmap"), kind: tt("Missing"), title: ct("No Kind") }),
            missingTaskFixture.layer
          )
        )
      ).toBeInstanceOf(BoardTaskTypeNotFoundError)
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("Roadmap"), title: ct("No Default Kind") }),
            missingTaskFixture.layer
          )
        )
      ).toBeInstanceOf(BoardTaskTypeNotFoundError)

      const missingStatusFixture = createLayer({
        projectTypes: [makeProjectType({ statuses: [] })],
        statuses: [],
        taskTypes: [makeTaskType({ statuses: [] })]
      })
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("Roadmap"), title: ct("No Status") }),
            missingStatusFixture.layer
          )
        )
      ).toBeInstanceOf(BoardStatusNotFoundError)

      const missingSequenceFixture = createLayer({ sequences: [] })
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("Roadmap"), title: ct("No Sequence") }),
            missingSequenceFixture.layer
          )
        )
      ).toBeInstanceOf(BoardModelSequenceMissingError)

      const malformedSequenceFixture = createLayer({ sequenceUpdateResult: {} })
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            createBoardCard({ board: b("Roadmap"), status: n(String(todoStatusId)), title: ct("Bad Sequence") }),
            malformedSequenceFixture.layer
          )
        )
      ).toBeInstanceOf(BoardModelSequenceMissingError)
    }))

  it.effect("updates optional card fields by replacement, removal, direct employee id, and no member changes", () =>
    Effect.gen(function*() {
      const fixture = createLayer({
        cards: [
          makeCard({ assignee: toRef<Person>("emp-2"), members: [toRef<Employee>("emp-1"), toRef<Employee>("emp-2")] })
        ]
      })

      yield* provideDiagnostics(
        updateBoardCard({ board: b("Roadmap"), card: c("CARD-1"), title: ct("Title Only") }),
        fixture.layer
      )
      expect(fixture.state.cards[0].title).toBe("Title Only")
      expect(fixture.state.cards[0].members).toEqual(["emp-1", "emp-2"])

      yield* provideDiagnostics(
        updateBoardCard({
          assignee: p("emp-1"),
          board: b("Roadmap"),
          card: c("CARD-1"),
          cover: { color: 1, size: "large" },
          description: "New **body**",
          dueDate: t(1700200000000),
          location: "HQ",
          members: [n("Bob")],
          startDate: t(1700100000000)
        }),
        fixture.layer
      )
      expect(fixture.state.cards[0].assignee).toBe("emp-1")
      expect(fixture.state.cards[0].members).toEqual(["emp-2"])
      expect(fixture.state.cards[0].location).toBe("HQ")
      expect(fixture.state.cards[0].cover).toEqual({ color: 1, size: "large" })

      yield* provideDiagnostics(
        updateBoardCard({ board: b("Roadmap"), card: c("CARD-1"), removeMembers: [n("Bob")] }),
        fixture.layer
      )
      expect(fixture.state.cards[0].members).toEqual([])

      const noMembersFixture = createLayer({ cards: [makeCardWithoutMembers()] })
      yield* provideDiagnostics(
        updateBoardCard({ board: b("Roadmap"), card: c("CARD-1"), title: ct("No Member Array") }),
        noMembersFixture.layer
      )
      expect(noMembersFixture.state.cards[0].members).toBeUndefined()

      expect(
        yield* Effect.flip(
          provideDiagnostics(
            updateBoardCard({ assignee: p("Missing"), board: b("Roadmap"), card: c("CARD-1") }),
            fixture.layer
          )
        )
      ).toBeInstanceOf(PersonNotFoundError)

      const nonEmployeeFixture = createLayer({ persons: [makePerson("person-1", "Charlie")] })
      expect(
        yield* Effect.flip(
          provideDiagnostics(
            updateBoardCard({ assignee: p("Charlie"), board: b("Roadmap"), card: c("CARD-1") }),
            nonEmployeeFixture.layer
          )
        )
      ).toBeInstanceOf(PersonNotAnEmployeeError)
    }))

  it.effect("rejects ambiguous numeric card locators and unsupported archived-card deletion", () =>
    Effect.gen(function*() {
      const numberFixture = createLayer({
        cards: [makeCard(), makeCard({ _id: "card-2" as Ref<HulyBoardCard>, title: "Other" })]
      })
      expect(
        yield* Effect.flip(
          provideDiagnostics(getBoardCard({ board: b("Roadmap"), card: c("1") }), numberFixture.layer)
        )
      ).toBeInstanceOf(BoardCardIdentifierAmbiguousError)
      expect(
        yield* Effect.flip(
          provideDiagnostics(getBoardCard({ board: b("Roadmap"), card: c("99") }), numberFixture.layer)
        )
      ).toBeInstanceOf(BoardCardNotFoundError)

      const deleteFixture = createLayer({ cards: [makeCard({ isArchived: true })], withoutRemoveCollection: true })
      expect(
        yield* Effect.flip(
          deleteBoardCard({ board: b("Roadmap"), card: c("CARD-1") }).pipe(Effect.provide(deleteFixture.layer))
        )
      ).toBeInstanceOf(BoardMutationUnsupportedError)
    }))
})
