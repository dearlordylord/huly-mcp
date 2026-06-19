import { describe, it } from "@effect/vitest"
import type { Class, Doc, DocumentUpdate, FindResult, PersonId, Ref, Space, Status } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import {
  type Issue as HulyIssue,
  IssuePriority,
  type Project as HulyProject,
  TimeReportDayType
} from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { TaskTypeRefSchema } from "../../../src/domain/schemas.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { core, task, tracker } from "../../../src/huly/huly-plugins.js"
import { createIssue, updateIssue } from "../../../src/huly/operations/issues.js"
import { email, issueIdentifier, projectIdentifier, statusName } from "../../helpers/brands.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

const projectTypeId = tracker.ids.ClassingProjectType
const issueTaskTypeId = tracker.taskTypes.Issue
const bugTaskTypeId = ref<TaskType>("task-type-bug")
const externalBugTaskTypeId = ref<TaskType>("task-type-external-bug")
const noStatusTaskTypeId = ref<TaskType>("task-type-no-status")
const issueOpenStatusId = ref<Status>("status-issue-open")
const issueReviewStatusId = ref<Status>("status-issue-review")
const bugOpenStatusId = ref<Status>("status-bug-open")
const bugReviewStatusId = ref<Status>("status-bug-review")

// Huly SDK refs and fixture documents are branded at compile time only. Tests use
// stable string IDs, and brands are erased at runtime.
function ref<T extends Doc>(value: string): Ref<T> {
  return value as Ref<T>
}

// PersonId is also a compile-time brand; fixture IDs are plain strings at runtime.
function personId(value: string): PersonId {
  return value as PersonId
}

// Huly SDK fixtures require many branded refs. This helper confines those casts to
// one boundary where tests construct in-memory SDK-shaped documents.
function sdkFixture<T>(value: unknown): T {
  return value as T
}

const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
  sdkFixture<HulyProject>({
    _id: ref<HulyProject>("project-1"),
    _class: tracker.class.Project,
    space: ref<Space>("space-1"),
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: issueOpenStatusId,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    type: projectTypeId,
    modifiedBy: personId("user-1"),
    modifiedOn: 0,
    createdBy: personId("user-1"),
    createdOn: 0,
    ...overrides
  })

const makeProjectType = (overrides?: Partial<ProjectType>): ProjectType =>
  sdkFixture<ProjectType>({
    _id: projectTypeId,
    _class: task.class.ProjectType,
    space: core.space.Model,
    modifiedBy: personId("user-1"),
    modifiedOn: 0,
    createdBy: personId("user-1"),
    createdOn: 0,
    name: "Classic",
    descriptor: tracker.descriptors.ProjectType,
    roles: 0,
    description: "Classic tracker workflow",
    tasks: [issueTaskTypeId, bugTaskTypeId],
    statuses: [
      { _id: issueOpenStatusId, taskType: issueTaskTypeId },
      { _id: issueReviewStatusId, taskType: issueTaskTypeId },
      { _id: bugOpenStatusId, taskType: bugTaskTypeId },
      { _id: bugReviewStatusId, taskType: bugTaskTypeId }
    ],
    targetClass: tracker.mixin.ClassicProjectTypeData,
    classic: true,
    ...overrides
  })

const makeTaskType = (overrides?: Partial<TaskType>): TaskType =>
  sdkFixture<TaskType>({
    _id: issueTaskTypeId,
    _class: task.class.TaskType,
    space: core.space.Model,
    modifiedBy: personId("user-1"),
    modifiedOn: 0,
    createdBy: personId("user-1"),
    createdOn: 0,
    parent: projectTypeId,
    descriptor: tracker.descriptors.Issue,
    name: "Issue",
    kind: "task",
    ofClass: tracker.class.Issue,
    targetClass: tracker.mixin.IssueTypeData,
    statuses: [issueOpenStatusId, issueReviewStatusId],
    statusClass: tracker.class.IssueStatus,
    statusCategories: [task.statusCategory.ToDo, task.statusCategory.Active],
    ...overrides
  })

const makeStatus = (overrides?: Partial<Status>): Status =>
  sdkFixture<Status>({
    _id: issueOpenStatusId,
    _class: core.class.Status,
    space: core.space.Model,
    modifiedBy: personId("user-1"),
    modifiedOn: 0,
    createdBy: personId("user-1"),
    createdOn: 0,
    ofAttribute: tracker.attribute.IssueStatus,
    name: "Open",
    category: task.statusCategory.ToDo,
    ...overrides
  })

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue =>
  sdkFixture<HulyIssue>({
    _id: ref<HulyIssue>("issue-1"),
    _class: tracker.class.Issue,
    space: ref<HulyProject>("project-1"),
    identifier: "TEST-1",
    title: "Test Issue",
    description: null,
    status: issueOpenStatusId,
    priority: IssuePriority.Medium,
    assignee: null,
    kind: issueTaskTypeId,
    number: 1,
    dueDate: null,
    rank: "0|aaa",
    attachedTo: ref<HulyIssue>("no-parent"),
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    component: null,
    subIssues: 0,
    parents: [],
    estimation: 0,
    remainingTime: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    modifiedBy: personId("user-1"),
    modifiedOn: 0,
    createdBy: personId("user-1"),
    createdOn: 0,
    ...overrides
  })

interface Captures {
  readonly addCollections: Array<{ readonly attributes: Record<string, unknown> }>
  readonly updates: Array<{ readonly classId: string; readonly operations: DocumentUpdate<Doc> }>
}

const defaultTaskTypes = (): ReadonlyArray<TaskType> => [
  makeTaskType(),
  makeTaskType({
    _id: bugTaskTypeId,
    name: "Bug",
    statuses: [bugOpenStatusId, bugReviewStatusId],
    statusCategories: [task.statusCategory.ToDo, task.statusCategory.Active]
  }),
  makeTaskType({
    _id: externalBugTaskTypeId,
    parent: ref<ProjectType>("other-project-type"),
    name: "Bug",
    statuses: [ref<Status>("external-status")]
  })
]

const defaultStatuses = (): ReadonlyArray<Status> => [
  makeStatus({ _id: issueOpenStatusId, name: "Open" }),
  makeStatus({ _id: issueReviewStatusId, name: "Review", category: task.statusCategory.Active }),
  makeStatus({ _id: bugOpenStatusId, name: "Triage" }),
  makeStatus({ _id: bugReviewStatusId, name: "Confirm", category: task.statusCategory.Active })
]

const findResult = <T extends Doc>(docs: ReadonlyArray<T>): FindResult<T> => toFindResult([...docs])

const createLayer = (config?: {
  readonly project?: HulyProject
  readonly projectType?: ProjectType | null
  readonly taskTypes?: ReadonlyArray<TaskType>
  readonly statuses?: ReadonlyArray<Status>
  readonly failStatusLookup?: boolean
  readonly modelStatuses?: ReadonlyArray<Status>
  readonly issues?: ReadonlyArray<HulyIssue>
  readonly captures?: Captures
}) => {
  const project = config?.project ?? makeProject()
  const projectType = config?.projectType === null ? undefined : config?.projectType ?? makeProjectType()
  const taskTypes = config?.taskTypes ?? defaultTaskTypes()
  const statuses = config?.statuses ?? defaultStatuses()
  const modelStatuses = config?.modelStatuses ?? []
  const issues = config?.issues ?? []

  const findAllImpl = (<T extends Doc>(_class: Ref<Class<T>>, query: unknown) => {
    const q = query as { _id?: { $in?: ReadonlyArray<unknown> }; parent?: unknown }
    const byIds = <D extends { readonly _id: unknown }>(items: ReadonlyArray<D>): ReadonlyArray<D> =>
      q._id?.$in === undefined ? items : items.filter((item) => q._id?.$in?.includes(item._id) ?? false)
    const byParent = <D extends { readonly parent?: unknown }>(items: ReadonlyArray<D>): ReadonlyArray<D> =>
      q.parent === undefined ? items : items.filter((item) => item.parent === q.parent)

    if (_class === task.class.TaskType) {
      return Effect.succeed(findResult(byParent(byIds(taskTypes))))
    }
    if (_class === core.class.Status) {
      if (config?.failStatusLookup === true) {
        return Effect.fail(new HulyConnectionError({ message: "status lookup failed" }))
      }
      return Effect.succeed(findResult(byIds(statuses)))
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(findResult(issues))
    }
    return Effect.succeed(findResult([]))
  }) as HulyClientOperations["findAll"]

  const findAllInModelImpl = (<T extends Doc>(_class: Ref<Class<T>>, query: unknown) => {
    const q = query as { _id?: { $in?: ReadonlyArray<unknown> } }
    const byIds = <D extends { readonly _id: unknown }>(items: ReadonlyArray<D>): ReadonlyArray<D> =>
      q._id?.$in === undefined ? items : items.filter((item) => q._id?.$in?.includes(item._id) ?? false)

    if (_class === core.class.Status) {
      return Effect.succeed(findResult(byIds(modelStatuses)))
    }
    return Effect.succeed(findResult([]))
  }) as HulyClientOperations["findAllInModel"]

  const findOneImpl = (<T extends Doc>(_class: Ref<Class<T>>, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as { readonly identifier?: string }).identifier
      const projectMatch = identifier === project.identifier ? project : undefined
      const opts = options as { readonly lookup?: { readonly type?: unknown } } | undefined
      const projectResult = projectMatch !== undefined && opts?.lookup?.type !== undefined
        ? { ...projectMatch, $lookup: { type: projectType } }
        : projectMatch
      return Effect.succeed(projectResult)
    }
    if (_class === task.class.ProjectType) {
      const id = (query as { readonly _id?: unknown })._id
      return Effect.succeed(id === projectType?._id ? projectType : undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as { readonly identifier?: string; readonly number?: number; readonly space?: unknown }
      const issue = issues.find((candidate) =>
        (q.identifier !== undefined && candidate.identifier === q.identifier)
        || (q.number !== undefined && candidate.number === q.number)
        || (
          q.space !== undefined
          && candidate.space === q.space
          && q.identifier === undefined
          && q.number === undefined
        )
      )
      return Effect.succeed(issue)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const updateDocImpl = ((_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
    config?.captures?.updates.push({ classId: String(_class), operations: operations as DocumentUpdate<Doc> })
    return Effect.succeed({ object: { sequence: 2 } })
  }) as HulyClientOperations["updateDoc"]

  const addCollectionImpl = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown
  ) => {
    config?.captures?.addCollections.push({ attributes: attributes as Record<string, unknown> })
    return Effect.succeed(ref<Doc>("new-issue-id"))
  }) as HulyClientOperations["addCollection"]

  return HulyClient.testLayer({
    addCollection: addCollectionImpl,
    findAll: findAllImpl,
    findAllInModel: findAllInModelImpl,
    findOne: findOneImpl,
    updateDoc: updateDocImpl
  })
}

describe("issue write task type support", () => {
  it.effect("creates an issue with a custom task type and status from that task type workflow", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }

      const result = yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Custom bug",
        taskType: TaskTypeRefSchema.make("Bug"),
        status: statusName("Confirm")
      }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)

      expect(result.identifier).toBe("TEST-2")
      expect(assertAt(captures.addCollections, 0).attributes.kind).toBe(bugTaskTypeId)
      expect(assertAt(captures.addCollections, 0).attributes.status).toBe(bugReviewStatusId)
    }))

  it.effect("uses model-resolved status names for task type status validation when status lookup fails", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const diagnostics = yield* makeDiagnosticsScope

      yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Bug from model status metadata",
        taskType: TaskTypeRefSchema.make("Bug"),
        status: statusName("Confirm")
      }).pipe(
        Effect.provide(
          createLayer({
            captures,
            failStatusLookup: true,
            modelStatuses: defaultStatuses()
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(assertAt(captures.addCollections, 0).attributes.kind).toBe(bugTaskTypeId)
      expect(assertAt(captures.addCollections, 0).attributes.status).toBe(bugReviewStatusId)
      expect(warnings).toEqual([])
    }))

  it.effect("resolves a task type linked by project type parent even when missing from the tasks list", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }

      yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Parent-linked bug",
        taskType: TaskTypeRefSchema.make("Bug")
      }).pipe(
        Effect.provide(createLayer({
          captures,
          projectType: makeProjectType({ tasks: [issueTaskTypeId] })
        })),
        withDiagnostics
      )

      expect(assertAt(captures.addCollections, 0).attributes.kind).toBe(bugTaskTypeId)
      expect(assertAt(captures.addCollections, 0).attributes.status).toBe(bugOpenStatusId)
    }))

  it.effect("uses the task type default status when the project default belongs to another task type", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }

      yield* createIssue({
        project: projectIdentifier("TEST"),
        title: "Bug without explicit status",
        taskType: TaskTypeRefSchema.make("Bug")
      }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)

      expect(assertAt(captures.addCollections, 0).attributes.kind).toBe(bugTaskTypeId)
      expect(assertAt(captures.addCollections, 0).attributes.status).toBe(bugOpenStatusId)
    }))

  it.effect("rejects a status that exists in the project but not on the selected task type", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Bug with issue-only status",
          taskType: TaskTypeRefSchema.make("Bug"),
          status: statusName("Review")
        }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("not valid for task type 'Bug'")
        expect(result.left.message).toContain("list_task_types")
      }
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects an unknown task type before incrementing the project sequence", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Unknown task type",
          taskType: TaskTypeRefSchema.make("Story")
        }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("Task type 'Story' was not found")
        expect(result.left.message).toContain("Available task types: Issue")
        expect(result.left.message).toContain("Bug")
      }
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects task type when the project does not expose workflow data", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "No workflow",
          taskType: TaskTypeRefSchema.make("Bug")
        }).pipe(Effect.provide(createLayer({ captures, projectType: null })), withDiagnostics)
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("does not expose a project type/workflow")
      }
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects ambiguous task type names within the project workflow", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Ambiguous task type",
          taskType: TaskTypeRefSchema.make("Bug")
        }).pipe(
          Effect.provide(
            createLayer({
              captures,
              projectType: makeProjectType({ tasks: [bugTaskTypeId, externalBugTaskTypeId] })
            })
          ),
          withDiagnostics
        )
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("matched more than one task type")
      }
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects task type when the project workflow has no configured task types", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "No configured task types",
          taskType: TaskTypeRefSchema.make("Bug")
        }).pipe(
          Effect.provide(createLayer({ captures, projectType: makeProjectType({ tasks: [] }), taskTypes: [] })),
          withDiagnostics
        )
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("No task types are configured")
      }
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects task type when neither current nor default status can be chosen", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "No task type status",
          taskType: TaskTypeRefSchema.make("No Status")
        }).pipe(
          Effect.provide(
            createLayer({
              captures,
              projectType: makeProjectType({ tasks: [noStatusTaskTypeId] }),
              taskTypes: [
                makeTaskType({
                  _id: noStatusTaskTypeId,
                  name: "No Status",
                  statuses: []
                })
              ]
            })
          ),
          withDiagnostics
        )
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toContain("has no valid status")
      }
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects a project status before incrementing the project sequence", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Unknown status",
          status: statusName("Not a real status")
        }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)
      )

      expect(result._tag).toBe("Left")
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects an unknown parent issue before incrementing the project sequence", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Child issue",
          parentIssue: issueIdentifier("TEST-404")
        }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)
      )

      expect(result._tag).toBe("Left")
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("rejects an unknown assignee before incrementing the project sequence", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const result = yield* Effect.either(
        createIssue({
          project: projectIdentifier("TEST"),
          title: "Assigned issue",
          assignee: email("missing@example.com")
        }).pipe(Effect.provide(createLayer({ captures })), withDiagnostics)
      )

      expect(result._tag).toBe("Left")
      expect(captures.addCollections).toEqual([])
      expect(captures.updates).toEqual([])
    }))

  it.effect("updates task type and preserves the current status when it remains valid", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const issue = makeIssue({ kind: issueTaskTypeId, status: bugOpenStatusId })

      const result = yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        taskType: TaskTypeRefSchema.make("Bug")
      }).pipe(Effect.provide(createLayer({ captures, issues: [issue] })), withDiagnostics)

      const issueUpdate = captures.updates.find((update) => update.classId === String(tracker.class.Issue))
      expect(result.updated).toBe(true)
      expect(issueUpdate?.operations).toEqual({ kind: bugTaskTypeId })
    }))

  it.effect("updates task type and chooses a valid default when the current status is invalid", () =>
    Effect.gen(function*() {
      const captures: Captures = { addCollections: [], updates: [] }
      const issue = makeIssue({ kind: issueTaskTypeId, status: issueOpenStatusId })

      yield* updateIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        taskType: TaskTypeRefSchema.make("Bug")
      }).pipe(Effect.provide(createLayer({ captures, issues: [issue] })), withDiagnostics)

      const issueUpdate = captures.updates.find((update) => update.classId === String(tracker.class.Issue))
      expect(issueUpdate?.operations).toEqual({ kind: bugTaskTypeId, status: bugOpenStatusId })
    }))
})
