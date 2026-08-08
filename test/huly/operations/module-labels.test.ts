import { describe, it } from "@effect/vitest"
import { type Class, type Doc, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { ToDo as HulyTodo } from "@hcengineering/time"
import { ToDoPriority } from "@hcengineering/time"
import type { TagElement as HulyTagElement, TagReference } from "@hcengineering/tags"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Count, NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { TagIdentifierAmbiguousError } from "../../../src/huly/errors.js"
import { core, documentPlugin, tags, time } from "../../../src/huly/huly-plugins.js"
import {
  addDocumentLabel,
  addTodoLabel,
  listDocumentLabelDefinitions,
  listDocumentLabels,
  listTodoLabelDefinitions,
  listTodoLabels,
  removeDocumentLabel,
  removeTodoLabel
} from "../../../src/huly/operations/module-labels.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { documentIdentifier, tagIdentifier, teamspaceIdentifier, todoId } from "../../helpers/brands.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

const USER = corePersonId("user-1")
const TEAMSPACE_ID = toRef<HulyTeamspace>("teamspace-1")
const DOCUMENT_ID = toRef<HulyDocument>("document-1")
const TODO_ID = toRef<HulyTodo>("todo-1")

const makeTeamspace = (): HulyTeamspace => ({
  _id: TEAMSPACE_ID,
  _class: documentPlugin.class.Teamspace,
  space: toRef<Space>("workspace"),
  name: "Engineering",
  description: "",
  archived: false,
  private: false,
  members: [],
  type: documentPlugin.spaceType.DefaultTeamspaceType,
  modifiedBy: USER,
  modifiedOn: 1,
  createdBy: USER,
  createdOn: 1
})

const makeDocument = (): HulyDocument => ({
  _id: DOCUMENT_ID,
  _class: documentPlugin.class.Document,
  space: TEAMSPACE_ID,
  title: "Runbook",
  content: null,
  parent: documentPlugin.ids.NoParent,
  rank: "0|aaa",
  modifiedBy: USER,
  modifiedOn: 2,
  createdBy: USER,
  createdOn: 1
})

const makeTodo = (todoClass: Ref<Class<HulyTodo>> = time.class.ProjectToDo): HulyTodo => ({
  _id: TODO_ID,
  _class: todoClass,
  space: time.space.ToDos,
  attachedTo: toRef<Doc>("issue-1"),
  attachedToClass: toRef("tracker:class:Issue"),
  collection: "todos",
  workslots: 0,
  title: "Review runbook",
  description: "",
  priority: ToDoPriority.Medium,
  visibility: "public",
  doneOn: null,
  user: toRef("employee-1"),
  rank: "0|aaa",
  ...(todoClass === time.class.ProjectToDo ? { attachedSpace: toRef<Space>("project-1") } : {}),
  modifiedBy: USER,
  modifiedOn: 2,
  createdBy: USER,
  createdOn: 1
})

const makeTag = (
  targetClass: Ref<Class<Doc>>,
  id: Ref<HulyTagElement>,
  title: NonEmptyString,
  refCount?: Count
): HulyTagElement => ({
  _id: id,
  _class: tags.class.TagElement,
  space: core.space.Workspace,
  title,
  description: `${title} description`,
  targetClass,
  color: 2,
  category: tags.category.NoCategory,
  ...(refCount === undefined ? {} : { refCount }),
  modifiedBy: USER,
  modifiedOn: 3,
  createdBy: USER,
  createdOn: 1
})

const makeReference = (
  object: { readonly id: Ref<Doc>; readonly objectClass: Ref<Class<Doc>>; readonly space: Ref<Space> },
  tag: HulyTagElement,
  id: Ref<TagReference>
): TagReference => ({
  _id: id,
  _class: tags.class.TagReference,
  space: object.space,
  attachedTo: object.id,
  attachedToClass: object.objectClass,
  collection: "labels",
  title: tag.title,
  color: tag.color,
  tag: tag._id,
  modifiedBy: USER,
  modifiedOn: 4,
  createdBy: USER,
  createdOn: 1
})

interface FixtureState {
  readonly tags: Array<HulyTagElement>
  readonly references: Array<TagReference>
  readonly createdTags: Array<unknown>
  readonly addedReferences: Array<unknown>
  readonly removedReferences: Array<Ref<TagReference>>
}

type QueryRecord = Readonly<Record<string, unknown>>

const isQueryRecord = (query: unknown): query is QueryRecord =>
  typeof query === "object" && query !== null && !Array.isArray(query)

const queryRecord = (query: unknown): QueryRecord => (isQueryRecord(query) ? query : {})

const makeLayer = (state: FixtureState, todo: HulyTodo = makeTodo()) => {
  const teamspace = makeTeamspace()
  const document = makeDocument()

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const record = queryRecord(query)
    if (_class === tags.class.TagElement) {
      const matching = state.tags.filter(
        (tag) =>
          tag.targetClass === record.targetClass &&
          (record._id === undefined || tag._id === record._id) &&
          (record.title === undefined || tag.title === record.title)
      )
      return Effect.succeed(toFindResult(matching))
    }
    if (_class === tags.class.TagReference) {
      const matching = state.references.filter(
        (reference) =>
          reference.attachedTo === record.attachedTo &&
          reference.attachedToClass === record.attachedToClass &&
          reference.space === record.space &&
          reference.collection === record.collection
      )
      return Effect.succeed(toFindResult(matching))
    }
    return Effect.succeed(toFindResult([]))
    // The SDK method is generic over every Doc subtype; this fixture deliberately implements only the classes exercised here.
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const record = queryRecord(query)
    if (_class === documentPlugin.class.Teamspace) {
      return Effect.succeed(record._id === teamspace._id || record.name === teamspace.name ? teamspace : undefined)
    }
    if (_class === documentPlugin.class.Document) {
      const found = record.space === document.space && (record._id === document._id || record.title === document.title)
      return Effect.succeed(found ? document : undefined)
    }
    if (_class === time.class.ToDo) {
      return Effect.succeed(record._id === todo._id ? todo : undefined)
    }
    if (_class === tags.class.TagElement) {
      return Effect.succeed(
        state.tags.find(
          (tag) =>
            tag.targetClass === record.targetClass &&
            ((record._id !== undefined && tag._id === record._id) ||
              (record.title !== undefined && tag.title === record.title))
        )
      )
    }
    return Effect.succeed(undefined)
    // The SDK method is generic over every Doc subtype; this fixture deliberately implements only the classes exercised here.
  }) as HulyClientOperations["findOne"]

  const createDoc: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    data: unknown,
    id: unknown
  ) => {
    state.createdTags.push(data)
    return Effect.succeed(typeof id === "string" ? toRef<Doc>(id) : toRef<Doc>("created-tag"))
    // The SDK method is generic over every Doc subtype; this fixture deliberately implements only TagElement creation.
  }) as HulyClientOperations["createDoc"]

  const addCollection: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    space: unknown,
    attachedTo: unknown,
    attachedToClass: unknown,
    collection: unknown,
    data: unknown
  ) => {
    state.addedReferences.push({ space, attachedTo, attachedToClass, collection, data })
    return Effect.succeed(toRef<Doc>("new-reference"))
    // The SDK method is generic over every collection subtype; this fixture deliberately implements only TagReference labels.
  }) as HulyClientOperations["addCollection"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: Ref<TagReference>
  ) => {
    state.removedReferences.push(objectId)
    return Effect.succeed({})
    // The SDK method is generic over every Doc subtype; this fixture deliberately implements only TagReference removal.
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({ addCollection, createDoc, findAll, findOne, removeDoc })
}

const emptyState = (): FixtureState => ({
  tags: [],
  references: [],
  createdTags: [],
  addedReferences: [],
  removedReferences: []
})

const documentLocator = { teamspace: teamspaceIdentifier("Engineering"), document: documentIdentifier("Runbook") }
const todoLocator = { todoId: todoId("todo-1") }

describe("module-specific labels", () => {
  it.effect("lists document and ToDo definitions without exposing target-class inputs", () =>
    Effect.gen(function* () {
      const documentTag = makeTag(
        documentPlugin.class.Document,
        toRef<HulyTagElement>("doc-label"),
        NonEmptyString.make("operations"),
        Count.make(4)
      )
      const todoTag = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label"), NonEmptyString.make("focus"))
      const state = { ...emptyState(), tags: [documentTag, todoTag] }
      const layer = makeLayer(state)

      const documents = yield* listDocumentLabelDefinitions({}).pipe(Effect.provide(layer))
      const todos = yield* listTodoLabelDefinitions({}).pipe(Effect.provide(layer))

      expect(documents).toEqual({
        labels: [{ id: "doc-label", title: "operations", description: "operations description", color: 2, refCount: 4 }]
      })
      expect(todos.labels.map((label) => label.title)).toEqual(["focus"])
    })
  )

  it.effect("lists labels through human document and ToDo locators", () =>
    Effect.gen(function* () {
      const documentTag = makeTag(
        documentPlugin.class.Document,
        toRef<HulyTagElement>("doc-label"),
        NonEmptyString.make("operations")
      )
      const todoTag = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label"), NonEmptyString.make("focus"))
      const state = {
        ...emptyState(),
        tags: [documentTag, todoTag],
        references: [
          makeReference(
            {
              id: toRef<Doc>(DOCUMENT_ID),
              objectClass: documentPlugin.class.Document,
              space: toRef<Space>(TEAMSPACE_ID)
            },
            documentTag,
            toRef<TagReference>("doc-reference")
          ),
          makeReference(
            { id: toRef<Doc>(TODO_ID), objectClass: time.class.ProjectToDo, space: time.space.ToDos },
            todoTag,
            toRef<TagReference>("todo-reference")
          )
        ]
      }
      const layer = makeLayer(state)

      const documents = yield* listDocumentLabels(documentLocator).pipe(Effect.provide(layer))
      const todos = yield* listTodoLabels({ locator: todoLocator }).pipe(Effect.provide(layer))

      expect(documents.labels).toEqual([{ id: "doc-reference", label: "doc-label", title: "operations", color: 2 }])
      expect(todos.labels).toEqual([{ id: "todo-reference", label: "todo-label", title: "focus", color: 2 }])
    })
  )

  it.effect("uses the concrete class for personal ToDo label references", () =>
    Effect.gen(function* () {
      const todo = makeTodo(time.class.ToDo)
      const label = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label"), NonEmptyString.make("focus"))
      const reference = makeReference(
        { id: toRef<Doc>(TODO_ID), objectClass: time.class.ToDo, space: time.space.ToDos },
        label,
        toRef<TagReference>("todo-reference")
      )
      const state = { ...emptyState(), tags: [label], references: [reference] }

      const result = yield* listTodoLabels({ locator: todoLocator }).pipe(Effect.provide(makeLayer(state, todo)))

      expect(result.labels).toEqual([{ id: "todo-reference", label: "todo-label", title: "focus", color: 2 }])
    })
  )

  it.effect("creates and attaches a missing document label", () =>
    Effect.gen(function* () {
      const state = emptyState()
      const result = yield* addDocumentLabel({ ...documentLocator, label: tagIdentifier("new-label") }).pipe(
        Effect.provide(makeLayer(state))
      )

      expect(result).toMatchObject({
        label: expect.any(String),
        title: "new-label",
        attached: true,
        labelCreated: true
      })
      expect(state.createdTags).toHaveLength(1)
      expect(state.addedReferences).toHaveLength(1)
    })
  )

  it.effect("keeps repeated ToDo label attachment idempotent", () =>
    Effect.gen(function* () {
      const label = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label"), NonEmptyString.make("focus"))
      const reference = makeReference(
        { id: toRef<Doc>(TODO_ID), objectClass: time.class.ProjectToDo, space: time.space.ToDos },
        label,
        toRef<TagReference>("todo-reference")
      )
      const state = { ...emptyState(), tags: [label], references: [reference] }

      const result = yield* addTodoLabel({ locator: todoLocator, label: tagIdentifier("focus") }).pipe(
        Effect.provide(makeLayer(state))
      )

      expect(result).toEqual({
        id: "todo-reference",
        label: "todo-label",
        title: "focus",
        attached: false,
        labelCreated: false
      })
      expect(state.addedReferences).toEqual([])
    })
  )

  it.effect("attaches an existing document label resolved directly by ID", () =>
    Effect.gen(function* () {
      const label = makeTag(
        documentPlugin.class.Document,
        toRef<HulyTagElement>("doc-label"),
        NonEmptyString.make("operations")
      )
      const state = { ...emptyState(), tags: [label] }

      const result = yield* addDocumentLabel({ ...documentLocator, label: tagIdentifier("doc-label") }).pipe(
        Effect.provide(makeLayer(state))
      )

      expect(result).toMatchObject({ label: "doc-label", attached: true, labelCreated: false })
      expect(state.createdTags).toEqual([])
      expect(state.addedReferences).toHaveLength(1)
    })
  )

  it.effect("detaches document labels and reports absent ToDo labels idempotently", () =>
    Effect.gen(function* () {
      const documentTag = makeTag(
        documentPlugin.class.Document,
        toRef<HulyTagElement>("doc-label"),
        NonEmptyString.make("operations")
      )
      const todoTag = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label"), NonEmptyString.make("focus"))
      const documentReference = makeReference(
        { id: toRef<Doc>(DOCUMENT_ID), objectClass: documentPlugin.class.Document, space: toRef<Space>(TEAMSPACE_ID) },
        documentTag,
        toRef<TagReference>("doc-reference")
      )
      const state = { ...emptyState(), tags: [documentTag, todoTag], references: [documentReference] }
      const layer = makeLayer(state)

      const documentResult = yield* removeDocumentLabel({
        ...documentLocator,
        label: tagIdentifier("operations")
      }).pipe(Effect.provide(layer))
      const todoResult = yield* removeTodoLabel({ locator: todoLocator, label: tagIdentifier("focus") }).pipe(
        Effect.provide(layer)
      )

      expect(documentResult).toMatchObject({ label: "doc-label", detached: true, detachedCount: 1 })
      expect(todoResult).toMatchObject({ label: "todo-label", detached: false, detachedCount: 0 })
      expect(state.removedReferences).toEqual(["doc-reference"])
    })
  )

  it.effect("returns candidate IDs instead of guessing between duplicate label titles", () =>
    Effect.gen(function* () {
      const first = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label-a"), NonEmptyString.make("focus"))
      const second = makeTag(time.class.ToDo, toRef<HulyTagElement>("todo-label-b"), NonEmptyString.make("focus"))
      const state = { ...emptyState(), tags: [first, second] }

      const error = yield* Effect.flip(
        addTodoLabel({ locator: todoLocator, label: tagIdentifier("focus") }).pipe(Effect.provide(makeLayer(state)))
      )

      expect(error).toBeInstanceOf(TagIdentifierAmbiguousError)
      expect(error).toMatchObject({ identifier: "focus", candidateIds: ["todo-label-a", "todo-label-b"] })
      expect(error.message).toContain("todo-label-a, todo-label-b")
      expect(state.createdTags).toEqual([])
      expect(state.addedReferences).toEqual([])
    })
  )
})
