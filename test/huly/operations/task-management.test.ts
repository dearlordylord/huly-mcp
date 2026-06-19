import { describe, it } from "@effect/vitest"
import type { Doc, FindResult, PersonId, Ref, Status } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { ProjectTypeRefSchema, TaskTypeRefSchema } from "../../../src/domain/schemas.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { core, task, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createIssueStatus,
  createTaskType,
  getProjectType,
  listProjectTypes,
  listTaskTypes
} from "../../../src/huly/operations/task-management.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

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
// Huly Ref brands are erased at runtime; these tests build fixture refs from stable string ids.
const statusRef = (value: string): Ref<Status> => value as Ref<Status>

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
  readonly failStatusLookup?: boolean
  readonly modelStatuses?: ReadonlyArray<Status>
  readonly captures?: Captures
  readonly failRecoverableStatusLookup?: boolean
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
  const modelStatuses = config?.modelStatuses ?? []

  const findAllImpl = (<T extends Doc>(_class: Ref<Doc>, query: unknown) => {
    const q = query as { _id?: { $in?: ReadonlyArray<unknown> }; ofAttribute?: unknown }
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
    if (_class === core.class.Status && q._id?.$in !== undefined && config?.failStatusLookup === true) {
      return Effect.fail(new HulyConnectionError({ message: "findAll failed: null status index" }))
    }
    if (_class === core.class.Status && q.ofAttribute !== undefined && config?.failRecoverableStatusLookup === true) {
      return Effect.fail(new HulyConnectionError({ message: "findAll failed: null status index" }))
    }
    if (_class === core.class.Status || _class === tracker.class.IssueStatus) return findResult(filterByIds(statuses))
    return findResult([])
  }) satisfies HulyClientOperations["findAll"]

  const findAllInModelImpl = (<T extends Doc>(_class: Ref<Doc>, query: unknown) => {
    const q = query as { _id?: { $in?: ReadonlyArray<unknown> } }
    const filterByIds = <D extends { readonly _id: unknown }>(items: ReadonlyArray<D>): ReadonlyArray<D> =>
      q._id?.$in === undefined ? items : items.filter((item) => q._id?.$in?.includes(item._id) ?? false)
    const findResult = <D extends Doc>(items: ReadonlyArray<D>) =>
      // HulyClient.findAllInModel is generic by requested class; this fixture mirrors findAll above.
      // eslint-disable-next-line no-restricted-syntax -- see above
      Effect.succeed(toFindResult([...items])) as unknown as Effect.Effect<FindResult<T>>

    if (_class === core.class.Status) {
      return findResult(filterByIds(modelStatuses))
    }
    return findResult([])
  }) satisfies HulyClientOperations["findAllInModel"]

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
    findAllInModel: findAllInModelImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    createMixin: createMixinImpl
  })
}

describe("task management operations", () => {
  it.effect("lists project types with concise workflow counts", () =>
    Effect.gen(function*() {
      const result = yield* listProjectTypes({}).pipe(Effect.provide(createLayer()), withDiagnostics)

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

  it.effect("gets project type details with Huly status category keys", () =>
    Effect.gen(function*() {
      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer()),
        withDiagnostics
      )

      expect(result.statuses.map((status) => [status.name, status.category])).toEqual([
        ["Todo", "ToDo"],
        ["Done", "Won"]
      ])
      expect(result.taskTypeStatuses).toEqual([
        { taskTypeId, taskTypeName: "Issue", statusIds: [openStatusId, doneStatusId] },
        { taskTypeId: subTaskTypeId, taskTypeName: "Sub-issue", statusIds: [openStatusId] }
      ])
    }))

  it.effect("resolves project type status details from the local model when status lookup fails", () =>
    Effect.gen(function*() {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer({
          failStatusLookup: true,
          modelStatuses: [
            makeStatus({ _id: openStatusId, name: "Todo", category: task.statusCategory.ToDo }),
            makeStatus({ _id: doneStatusId, name: "Done", category: task.statusCategory.Won })
          ]
        })),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.statuses.map((status) => [status.name, status.category])).toEqual([
        ["Todo", "ToDo"],
        ["Done", "Won"]
      ])
      expect(warnings).toEqual([])
    }))

  it.effect("synthesizes unresolved project type statuses without dangling task type status ids", () =>
    Effect.gen(function*() {
      const unresolvedStatusId = statusRef("plainstatus")
      const projectType = makeProjectType({
        statuses: [
          { _id: openStatusId, taskType: taskTypeId },
          { _id: unresolvedStatusId, taskType: taskTypeId }
        ]
      })
      const taskType = makeTaskType({ statuses: [openStatusId, unresolvedStatusId] })
      const diagnostics = yield* makeDiagnosticsScope

      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(
          createLayer({
            failStatusLookup: true,
            projectTypes: [projectType],
            statuses: [],
            taskTypes: [taskType]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings
      const statusIds = result.statuses.map((status) => status.id)

      expect(result.statusCount).toBe(2)
      expect(result.statuses.map((status) => [status.id, status.name, status.category])).toEqual([
        [openStatusId, "Todo", "unknown"],
        [unresolvedStatusId, "plainstatus", "unknown"]
      ])
      expect(assertAt(result.taskTypeStatuses, 0).statusIds.every((statusId) => statusIds.includes(statusId))).toBe(
        true
      )
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("status_metadata_unresolved")
    }))

  it.effect("returns an existing task type by normalized name without writing", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createTaskType({ name: "issue" }).pipe(
        Effect.provide(createLayer({ captures })),
        withDiagnostics
      )

      expect(result.created).toBe(false)
      expect(result.taskType.id).toBe(taskTypeId)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([])
      expect(captures.mixins).toEqual([])
    }))

  it.effect("repairs duplicate statuses on an existing task type matched by normalized name", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createTaskType({ name: "issue" }).pipe(
        Effect.provide(createLayer({
          taskTypes: [
            makeTaskType({ statuses: [openStatusId, openStatusId, doneStatusId] }),
            makeTaskType({ _id: subTaskTypeId, name: "Sub-issue", kind: "subtask", statuses: [openStatusId] })
          ],
          captures
        })),
        withDiagnostics
      )

      expect(result.created).toBe(true)
      expect(result.taskType.id).toBe(taskTypeId)
      expect(result.taskType.statusCount).toBe(2)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([
        {
          classId: String(task.class.TaskType),
          objectId: taskTypeId,
          operations: { statuses: [openStatusId, doneStatusId] }
        }
      ])
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
        })),
        withDiagnostics
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
        Effect.provide(createLayer({ captures })),
        withDiagnostics
      )

      expect(result.created).toBe(true)
      expect(result.taskType.name).toBe("Bug")
      expect(captures.createDocs.map((call) => call.classId)).toEqual([
        String(core.class.Mixin),
        String(task.class.TaskType)
      ])
      expect(captures.mixins).toHaveLength(1)
      expect(captures.updates).toHaveLength(1)
      expect(assertAt(captures.updates, 0).classId).toBe(String(task.class.ProjectType))
    }))

  it.effect("creates an issue status and attaches it to all task types", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createIssueStatus({ name: "QA", category: "Active" }).pipe(
        Effect.provide(createLayer({ captures })),
        withDiagnostics
      )

      expect(result.created).toBe(true)
      expect(result.status.name).toBe("QA")
      expect(result.status.category).toBe("Active")
      expect(result.affectedTaskTypeIds).toEqual([taskTypeId, subTaskTypeId])
      expect(assertAt(captures.createDocs, 0).classId).toBe(String(tracker.class.IssueStatus))
      expect(captures.updates.map((call) => call.classId)).toEqual([
        String(task.class.TaskType),
        String(task.class.TaskType),
        String(task.class.ProjectType)
      ])
    }))

  it.effect("deduplicates project type status links while attaching a new issue status", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const projectType = makeProjectType({
        statuses: [
          { _id: openStatusId, taskType: taskTypeId },
          { _id: openStatusId, taskType: taskTypeId },
          { _id: doneStatusId, taskType: taskTypeId },
          { _id: openStatusId, taskType: subTaskTypeId },
          { _id: openStatusId, taskType: subTaskTypeId }
        ]
      })

      const result = yield* createIssueStatus({ name: "QA", category: "Active" }).pipe(
        Effect.provide(createLayer({ projectTypes: [projectType], captures })),
        withDiagnostics
      )

      const projectTypeUpdate = captures.updates.find((call) => call.classId === String(task.class.ProjectType))
      expect(projectTypeUpdate?.operations).toEqual({
        statuses: [
          { _id: openStatusId, taskType: taskTypeId },
          { _id: doneStatusId, taskType: taskTypeId },
          { _id: openStatusId, taskType: subTaskTypeId },
          { _id: result.status.id, taskType: taskTypeId },
          { _id: result.status.id, taskType: subTaskTypeId }
        ]
      })
    }))

  it.effect("preserves same-name statuses with different ids while normalizing workflow links", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const alternateDoneStatusId = statusRef("status-done-secondary")
      const projectType = makeProjectType({
        statuses: [
          { _id: openStatusId, taskType: taskTypeId },
          { _id: doneStatusId, taskType: taskTypeId },
          { _id: alternateDoneStatusId, taskType: taskTypeId },
          { _id: alternateDoneStatusId, taskType: taskTypeId },
          { _id: openStatusId, taskType: subTaskTypeId }
        ]
      })
      const issueTaskType = makeTaskType({ statuses: [openStatusId, doneStatusId, alternateDoneStatusId] })

      const result = yield* createIssueStatus({ name: "QA", category: "Active" }).pipe(
        Effect.provide(createLayer({
          projectTypes: [projectType],
          taskTypes: [
            issueTaskType,
            makeTaskType({ _id: subTaskTypeId, name: "Sub-issue", kind: "subtask", statuses: [openStatusId] })
          ],
          statuses: [
            makeStatus(),
            makeStatus({ _id: doneStatusId, name: "Done", category: task.statusCategory.Won }),
            makeStatus({ _id: alternateDoneStatusId, name: "Done", category: task.statusCategory.Won })
          ],
          captures
        })),
        withDiagnostics
      )

      const issueTaskTypeUpdate = captures.updates.find((call) => call.objectId === taskTypeId)
      const projectTypeUpdate = captures.updates.find((call) => call.classId === String(task.class.ProjectType))
      expect(issueTaskTypeUpdate?.operations).toEqual({
        statuses: [openStatusId, doneStatusId, alternateDoneStatusId, result.status.id]
      })
      expect(projectTypeUpdate?.operations).toEqual({
        statuses: [
          { _id: openStatusId, taskType: taskTypeId },
          { _id: doneStatusId, taskType: taskTypeId },
          { _id: alternateDoneStatusId, taskType: taskTypeId },
          { _id: openStatusId, taskType: subTaskTypeId },
          { _id: result.status.id, taskType: taskTypeId },
          { _id: result.status.id, taskType: subTaskTypeId }
        ]
      })
    }))

  it.effect("deduplicates task type statuses when the target status is already present", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const duplicatedTaskType = makeTaskType({ statuses: [openStatusId, openStatusId, doneStatusId] })

      const result = yield* createIssueStatus({
        name: "todo",
        category: "ToDo",
        taskType: TaskTypeRefSchema.make("Issue")
      }).pipe(
        Effect.provide(createLayer({ taskTypes: [duplicatedTaskType], captures })),
        withDiagnostics
      )

      expect(result.created).toBe(true)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toHaveLength(1)
      expect(assertAt(captures.updates, 0).classId).toBe(String(task.class.TaskType))
      expect(assertAt(captures.updates, 0).operations).toEqual({ statuses: [openStatusId, doneStatusId] })
    }))

  it.effect("deduplicates template statuses when creating a task type", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const template = makeTaskType({ statuses: [openStatusId, doneStatusId, openStatusId] })

      const result = yield* createTaskType({ name: "Bug", templateTaskType: TaskTypeRefSchema.make("Issue") }).pipe(
        Effect.provide(createLayer({ taskTypes: [template], captures })),
        withDiagnostics
      )

      const taskTypeCreate = captures.createDocs.find((call) => call.classId === String(task.class.TaskType))
      const projectTypeUpdate = captures.updates.find((call) => call.classId === String(task.class.ProjectType))
      expect(result.taskType.statusCount).toBe(2)
      expect(taskTypeCreate?.attributes).toMatchObject({ statuses: [openStatusId, doneStatusId] })
      expect(projectTypeUpdate?.operations).toEqual({
        tasks: [taskTypeId, subTaskTypeId, result.taskType.id],
        statuses: [
          { _id: openStatusId, taskType: taskTypeId },
          { _id: doneStatusId, taskType: taskTypeId },
          { _id: openStatusId, taskType: subTaskTypeId },
          { _id: openStatusId, taskType: result.taskType.id },
          { _id: doneStatusId, taskType: result.taskType.id }
        ]
      })
    }))

  it.effect("creates an issue status when the broad recovery lookup fails", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createIssueStatus({ name: "QA", category: "Active" }).pipe(
        Effect.provide(createLayer({ captures, failRecoverableStatusLookup: true })),
        withDiagnostics
      )

      expect(result.created).toBe(true)
      expect(result.status.name).toBe("QA")
      expect(result.status.category).toBe("Active")
      expect(assertAt(captures.createDocs, 0).classId).toBe(String(tracker.class.IssueStatus))
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
        createIssueStatus({ name: "Todo", category: "Active" }).pipe(
          Effect.provide(createLayer({ captures })),
          withDiagnostics
        )
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("already exists with category 'ToDo'")
      }
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("recovers an existing status missing from project type links", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const statusId = "status-qa" as Ref<Status>
      const result = yield* createIssueStatus({ name: "QA", category: "Active" }).pipe(
        Effect.provide(createLayer({
          statuses: [
            makeStatus(),
            makeStatus({ _id: doneStatusId, name: "Done", category: task.statusCategory.Won }),
            makeStatus({ _id: statusId, name: "QA", category: task.statusCategory.Active })
          ],
          captures
        })),
        withDiagnostics
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
        category: "ToDo",
        taskType: TaskTypeRefSchema.make("Issue")
      }).pipe(
        Effect.provide(createLayer({ captures })),
        withDiagnostics
      )

      expect(result.created).toBe(false)
      expect(result.status.id).toBe(openStatusId)
      expect(captures.createDocs).toEqual([])
      expect(captures.updates).toEqual([])
    }))
})

describe("listTaskTypes", () => {
  it.effect("lists task types across all project types by default", () =>
    Effect.gen(function*() {
      const result = yield* listTaskTypes({}).pipe(Effect.provide(createLayer()), withDiagnostics)
      expect(result.total).toBe(result.taskTypes.length)
      expect(result.taskTypes.length).toBeGreaterThan(0)
    }))

  it.effect("lists task types for a specific project type", () =>
    Effect.gen(function*() {
      const result = yield* listTaskTypes({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer()),
        withDiagnostics
      )
      expect(result.total).toBe(result.taskTypes.length)
    }))
})

describe("task management branch coverage", () => {
  it.effect("maps missing and unrecognized status categories to 'unknown'", () =>
    Effect.gen(function*() {
      const noCategory = asStatus({ ...makeStatus(), category: undefined })
      const unknownCategory = asStatus({
        ...makeStatus(),
        _id: doneStatusId,
        name: "Done",
        category: "category:custom:Mystery"
      })

      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer({ statuses: [noCategory, unknownCategory] })),
        withDiagnostics
      )

      expect(result.statuses.map((status) => status.category)).toEqual(["unknown", "unknown"])
    }))

  it.effect("recognizes a non-default-id classic project type by its classic flag", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ _id: "pt-custom" as Ref<ProjectType>, name: "Engineering", classic: true })
      const result = yield* listProjectTypes({}).pipe(
        Effect.provide(createLayer({ projectTypes: [projectType] })),
        withDiagnostics
      )
      expect(result.projectTypes[0]?.isDefaultClassic).toBe(true)
    }))

  it.effect("recognizes a classic project type by its normalized name", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ _id: "pt-named" as Ref<ProjectType>, name: "Classic", classic: false })
      const result = yield* listProjectTypes({}).pipe(
        Effect.provide(createLayer({ projectTypes: [projectType] })),
        withDiagnostics
      )
      expect(result.projectTypes[0]?.isDefaultClassic).toBe(true)
    }))

  it.effect("omits an empty project type description in details", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ description: "" })
      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer({ projectTypes: [projectType] })),
        withDiagnostics
      )
      expect(result.description).toBeUndefined()
    }))

  it.effect("loads a project type with no task types or statuses", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ tasks: [], statuses: [] })
      const result = yield* getProjectType({ projectType: ProjectTypeRefSchema.make("classic") }).pipe(
        Effect.provide(createLayer({ projectTypes: [projectType], taskTypes: [], statuses: [] })),
        withDiagnostics
      )
      expect(result.taskTypes).toEqual([])
      expect(result.statuses).toEqual([])
    }))

  it.effect("fails when no default classic project type can be selected", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ _id: "pt-x" as Ref<ProjectType>, name: "Engineering", classic: false })
      const error = yield* Effect.flip(
        getProjectType({}).pipe(Effect.provide(createLayer({ projectTypes: [projectType] })), withDiagnostics)
      )
      expect(error.message).toContain("Could not select a default Classic project type")
    }))

  it.effect("fails when a named project type does not resolve uniquely", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        getProjectType({ projectType: ProjectTypeRefSchema.make("nonexistent") }).pipe(
          Effect.provide(createLayer()),
          withDiagnostics
        )
      )
      expect(error.message).toContain("did not resolve to exactly one project type")
    }))

  it.effect("fails task type creation when the template reference does not resolve", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createTaskType({ name: "Bug", templateTaskType: TaskTypeRefSchema.make("nonexistent") }).pipe(
          Effect.provide(createLayer()),
          withDiagnostics
        )
      )
      expect(error.message).toContain("did not resolve to exactly one task type")
    }))

  it.effect("fails task type creation when the project type has no template to copy", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ tasks: [], statuses: [] })
      const error = yield* Effect.flip(
        createTaskType({ name: "Bug" }).pipe(
          Effect.provide(createLayer({ projectTypes: [projectType], taskTypes: [] })),
          withDiagnostics
        )
      )
      expect(error.message).toContain("has no task type to copy")
    }))

  it.effect("creates a task type from the default first template when none is named", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const result = yield* createTaskType({ name: "Brand New Type" }).pipe(
        Effect.provide(createLayer({ captures })),
        withDiagnostics
      )
      expect(result.created).toBe(true)
      expect(result.taskType.name).toBe("Brand New Type")
      expect(captures.createDocs.map((call) => call.classId)).toContain(String(task.class.TaskType))
    }))

  it.effect("copies template icon, color, and allowedAsChildOf onto the new task type", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDocs: [], updates: [], mixins: [] }
      const template = makeTaskType({
        icon: "icon:Bug" as NonNullable<TaskType["icon"]>,
        color: 7,
        allowedAsChildOf: [subTaskTypeId]
      })
      yield* createTaskType({ name: "Bug", templateTaskType: TaskTypeRefSchema.make("Issue") }).pipe(
        Effect.provide(createLayer({ taskTypes: [template], captures })),
        withDiagnostics
      )

      const mixinCreate = captures.createDocs.find((call) => call.classId === String(core.class.Mixin))
      const taskTypeCreate = captures.createDocs.find((call) => call.classId === String(task.class.TaskType))
      expect(mixinCreate?.attributes).toMatchObject({ icon: "icon:Bug" })
      expect(taskTypeCreate?.attributes).toMatchObject({
        icon: "icon:Bug",
        color: 7,
        allowedAsChildOf: [subTaskTypeId]
      })
    }))

  it.effect("fails issue status creation when target task types do not share a status class", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createIssueStatus({ name: "QA", category: "Active" }).pipe(
          Effect.provide(createLayer({
            taskTypes: [
              makeTaskType({ statusClass: tracker.class.IssueStatus }),
              makeTaskType({
                _id: subTaskTypeId,
                name: "Sub-issue",
                statuses: [openStatusId],
                statusClass: core.class.Status
              })
            ]
          })),
          withDiagnostics
        )
      )
      expect(error.message).toContain("do not share one issue status class")
    }))

  it.effect("reports a connection error when the result fails output schema validation", () =>
    Effect.gen(function*() {
      const projectType = makeProjectType({ name: "" as ProjectType["name"] })
      const error = yield* Effect.flip(
        listProjectTypes({}).pipe(Effect.provide(createLayer({ projectTypes: [projectType] })), withDiagnostics)
      )
      expect(error._tag).toBe("HulyConnectionError")
      expect(error.message).toContain("response failed schema validation")
    }))
})
