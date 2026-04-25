import { describe, it } from "@effect/vitest"
import type { Doc, FindResult, PersonId, Ref, Status } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"

import { ProjectTypeRefSchema, TaskTypeRefSchema } from "../../../src/domain/schemas.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, task, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createIssueStatus,
  createTaskType,
  getProjectType,
  listProjectTypes
} from "../../../src/huly/operations/task-management.js"

const personId = "person-1" as PersonId
const projectTypeId = tracker.ids.ClassingProjectType
const taskTypeId = tracker.taskTypes.Issue
const subTaskTypeId = tracker.taskTypes.SubIssue
const openStatusId = tracker.status.Todo
const doneStatusId = tracker.status.Done

// Huly SDK fixture objects contain branded Ref fields. Brands are erased at runtime,
// and these tests provide plain object fixtures for service-layer operations.
const asProjectType = (value: unknown): ProjectType => value as ProjectType
// Huly SDK fixture objects contain branded Ref fields. Brands are erased at runtime,
// and these tests provide plain object fixtures for service-layer operations.
const asTaskType = (value: unknown): TaskType => value as TaskType
// Huly SDK fixture objects contain branded Ref fields. Brands are erased at runtime,
// and these tests provide plain object fixtures for service-layer operations.
const asStatus = (value: unknown): Status => value as Status

const makeProjectType = (overrides?: Partial<ProjectType>): ProjectType =>
  asProjectType({
    _id: projectTypeId,
    _class: task.class.ProjectType,
    space: core.space.Model,
    modifiedOn: 0,
    modifiedBy: personId,
    name: "Classic",
    descriptor: tracker.descriptors.ProjectType,
    roles: 0,
    tasks: [taskTypeId, subTaskTypeId],
    description: "Classic tracker workflow",
    statuses: [
      { _id: openStatusId, taskType: taskTypeId },
      { _id: doneStatusId, taskType: taskTypeId },
      { _id: openStatusId, taskType: subTaskTypeId }
    ],
    targetClass: tracker.mixin.ClassicProjectTypeData,
    classic: true,
    ...overrides
  })

const makeTaskType = (overrides?: Partial<TaskType>): TaskType =>
  asTaskType({
    _id: taskTypeId,
    _class: task.class.TaskType,
    space: core.space.Model,
    modifiedOn: 0,
    modifiedBy: personId,
    parent: projectTypeId,
    descriptor: tracker.descriptors.Issue,
    name: "Issue",
    kind: "task",
    ofClass: tracker.class.Issue,
    targetClass: tracker.mixin.IssueTypeData,
    statuses: [openStatusId, doneStatusId],
    statusClass: tracker.class.IssueStatus,
    statusCategories: [task.statusCategory.ToDo, task.statusCategory.Won],
    ...overrides
  })

const makeStatus = (overrides?: Partial<Status>): Status =>
  asStatus({
    _id: openStatusId,
    _class: core.class.Status,
    space: core.space.Model,
    modifiedOn: 0,
    modifiedBy: personId,
    ofAttribute: tracker.attribute.IssueStatus,
    name: "Todo",
    category: task.statusCategory.ToDo,
    ...overrides
  })

interface Captures {
  readonly createDocs: Array<{ readonly classId: string; readonly attributes: unknown; readonly id: unknown }>
  readonly updates: Array<{ readonly classId: string; readonly objectId: unknown; readonly operations: unknown }>
  readonly mixins: Array<{ readonly objectId: unknown; readonly mixin: unknown; readonly attributes: unknown }>
}

const createLayer = (config?: {
  readonly projectTypes?: ReadonlyArray<ProjectType>
  readonly taskTypes?: ReadonlyArray<TaskType>
  readonly statuses?: ReadonlyArray<Status>
  readonly captures?: Captures
}) => {
  const projectTypes = config?.projectTypes ?? [makeProjectType()]
  const taskTypes = config?.taskTypes ?? [
    makeTaskType(),
    makeTaskType({ _id: subTaskTypeId, name: "Sub-issue", kind: "subtask", statuses: [openStatusId] })
  ]
  const statuses = config?.statuses ?? [
    makeStatus(),
    makeStatus({ _id: doneStatusId, name: "Done", category: task.statusCategory.Won })
  ]

  const findAllImpl = (<T extends Doc>(_class: Ref<Doc>, query: unknown) => {
    const q = query as { _id?: { $in?: ReadonlyArray<unknown> } }
    const filterByIds = <D extends { readonly _id: unknown }>(items: ReadonlyArray<D>): ReadonlyArray<D> =>
      q._id?.$in === undefined ? items : items.filter((item) => q._id?.$in?.includes(item._id) ?? false)
    const findResult = <D extends Doc>(items: ReadonlyArray<D>) => {
      // HulyClient.findAll is generic by requested class; this fixture selects a matching in-memory collection
      // from the class ref before returning it through the same generic SDK boundary.
      // eslint-disable-next-line no-restricted-syntax -- see above
      return Effect.succeed(toFindResult([...items])) as unknown as Effect.Effect<FindResult<T>>
    }

    if (_class === task.class.ProjectType) return findResult(projectTypes)
    if (_class === task.class.TaskType) return findResult(filterByIds(taskTypes))
    if (_class === core.class.Status || _class === tracker.class.IssueStatus) return findResult(filterByIds(statuses))
    return findResult([])
  }) satisfies HulyClientOperations["findAll"]

  const createDocImpl: HulyClientOperations["createDoc"] =
    ((_class: unknown, _space: unknown, attributes: unknown, id: unknown) => {
      config?.captures?.createDocs.push({ classId: String(_class), attributes, id })
      // HulyClient.createDoc returns the requested SDK Ref. Brands are erased at runtime;
      // the test captures the id and returns it through the SDK boundary shape.
      return Effect.succeed(id as Ref<Doc>)
    }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] =
    ((_class: unknown, _space: unknown, objectId: unknown, operations: unknown) => {
      config?.captures?.updates.push({ classId: String(_class), objectId, operations })
      // TxResult is opaque to these tests; callers only assert that an update was requested.
      return Effect.succeed({} as never)
    }) as HulyClientOperations["updateDoc"]

  const createMixinImpl: HulyClientOperations["createMixin"] =
    ((objectId: unknown, _objectClass: unknown, _space: unknown, mixin: unknown, attributes: unknown) => {
      config?.captures?.mixins.push({ objectId, mixin, attributes })
      // TxResult is opaque to these tests; callers only assert that a mixin was requested.
      return Effect.succeed({} as never)
    }) as HulyClientOperations["createMixin"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    createMixin: createMixinImpl
  })
}

describe("task management operations", () => {
  it.effect("lists project types with concise workflow counts", () =>
    Effect.gen(function*() {
      const result = yield* listProjectTypes({}).pipe(Effect.provide(createLayer()))

      expect(result).toEqual({
        projectTypes: [{
          id: projectTypeId,
          name: "Classic",
          descriptor: tracker.descriptors.ProjectType,
          taskTypeCount: 2,
          statusCount: 2,
          isDefaultClassic: true
        }],
        total: 1
      })
    }))

  it.effect("gets project type details with business category names and mappings", () =>
    Effect.gen(function*() {
      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer())
      )

      expect(result.statuses.map((status) => [status.name, status.category])).toEqual([
        ["Todo", "todo"],
        ["Done", "done"]
      ])
      expect(result.taskTypeStatuses).toEqual([
        { taskTypeId, taskTypeName: "Issue", statusIds: [openStatusId, doneStatusId] },
        { taskTypeId: subTaskTypeId, taskTypeName: "Sub-issue", statusIds: [openStatusId] }
      ])
    }))

  it.effect("returns an existing task type by normalized name without writing", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createTaskType({ name: "issue" }).pipe(Effect.provide(createLayer({ captures })))

      expect(result.created).toBe(false)
      expect(result.taskType.id).toBe(taskTypeId)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([])
      expect(captures.mixins).toEqual([])
    }))

  it.effect("recovers an existing task type missing from project type links", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const orphanTaskTypeId = "orphan-bug" as Ref<TaskType>
      const projectType = makeProjectType({
        tasks: [taskTypeId],
        statuses: [{ _id: openStatusId, taskType: taskTypeId }]
      })
      const result = yield* createTaskType({ name: "Bug" }).pipe(
        Effect.provide(createLayer({
          projectTypes: [projectType],
          taskTypes: [makeTaskType(), makeTaskType({ _id: orphanTaskTypeId, name: "Bug" })],
          captures
        }))
      )

      expect(result.created).toBe(true)
      expect(result.taskType.id).toBe(orphanTaskTypeId)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toHaveLength(1)
    }))

  it.effect("creates a task type from the template task type and updates the project type", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createTaskType({ name: "Bug", templateTaskType: TaskTypeRefSchema.make("Issue") }).pipe(
        Effect.provide(createLayer({ captures }))
      )

      expect(result.created).toBe(true)
      expect(result.taskType.name).toBe("Bug")
      expect(captures.createDocs.map((call) => call.classId)).toEqual([
        String(core.class.Mixin),
        String(task.class.TaskType)
      ])
      expect(captures.mixins).toHaveLength(1)
      expect(captures.updates).toHaveLength(1)
      expect(captures.updates[0].classId).toBe(String(task.class.ProjectType))
    }))

  it.effect("creates an issue status and attaches it to all task types", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createIssueStatus({ name: "QA", category: "active" }).pipe(
        Effect.provide(createLayer({ captures }))
      )

      expect(result.created).toBe(true)
      expect(result.status.name).toBe("QA")
      expect(result.status.category).toBe("active")
      expect(result.affectedTaskTypeIds).toEqual([taskTypeId, subTaskTypeId])
      expect(captures.createDocs[0].classId).toBe(String(tracker.class.IssueStatus))
      expect(captures.updates.map((call) => call.classId)).toEqual([
        String(task.class.TaskType),
        String(task.class.TaskType),
        String(task.class.ProjectType)
      ])
    }))

  it.effect("rejects an existing status with a different category", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* Effect.either(
        createIssueStatus({ name: "Todo", category: "active" }).pipe(Effect.provide(createLayer({ captures })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("already exists with category 'todo'")
      }
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("recovers an existing status missing from project type links", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const statusId = "status-qa" as Ref<Status>
      const result = yield* createIssueStatus({ name: "QA", category: "active" }).pipe(
        Effect.provide(createLayer({
          statuses: [
            makeStatus(),
            makeStatus({ _id: doneStatusId, name: "Done", category: task.statusCategory.Won }),
            makeStatus({ _id: statusId, name: "QA", category: task.statusCategory.Active })
          ],
          captures
        }))
      )

      expect(result.created).toBe(true)
      expect(result.status.id).toBe(statusId)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates.map((call) => call.classId)).toEqual([
        String(task.class.TaskType),
        String(task.class.TaskType),
        String(task.class.ProjectType)
      ])
    }))

  it.effect("does not rewrite an existing status already in the requested scope", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createIssueStatus({
        name: "todo",
        category: "todo",
        taskType: TaskTypeRefSchema.make("Issue")
      }).pipe(
        Effect.provide(createLayer({ captures }))
      )

      expect(result.created).toBe(false)
      expect(result.status.id).toBe(openStatusId)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([])
    }))
})
