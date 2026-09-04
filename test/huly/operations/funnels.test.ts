import { describe, it } from "@effect/vitest"
import type { Class, Doc, Ref, Space, Status } from "@hcengineering/core"
import { AccountRole, toFindResult } from "@hcengineering/core"
import type {
  Project,
  ProjectType,
  ProjectTypeDescriptor,
  Task,
  TaskType,
  TaskTypeDescriptor
} from "@hcengineering/task"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { FunnelIdentifier, FunnelReference, LeadIdentifier } from "../../../src/domain/schemas/leads.js"
import { AccountUuid, Count, NonEmptyString, UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { ProjectTypeRefSchema } from "../../../src/domain/schemas/task-management.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  FunnelAccountNotFoundError,
  FunnelDeleteConflictError,
  FunnelIdentifierAmbiguousError,
  FunnelNotFoundError,
  FunnelProjectTypeIdentifierAmbiguousError,
  FunnelProjectTypeNotFoundError,
  FunnelWorkflowInvalidError,
  LeadNotFoundError
} from "../../../src/huly/errors-leads.js"
import { WorkspaceClient } from "../../../src/huly/workspace-client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { core, task } from "../../../src/huly/huly-plugins.js"
import { leadClassIds } from "../../../src/huly/lead-plugin.js"
import type { HulyFunnel } from "../../../src/huly/operations/funnels-shared.js"
import {
  archiveFunnel,
  createFunnel,
  deleteFunnel,
  getFunnel,
  listFunnels,
  updateFunnel
} from "../../../src/huly/operations/funnels.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { capturedMarkupReferenceNodes } from "../../helpers/markup-capture.js"

const account = AccountUuid.make("00000000-0000-4000-8000-000000000000")
const funnelId = toRef<HulyFunnel>("funnel-1")
const projectTypeId = toRef<ProjectType>("funnel-project-type")
const taskTypeId = toRef<TaskType>("lead-task-type")
const statusId = toRef<Status>("lead-status-new")
const funnel = (value: string) => FunnelReference.make(value)

const capturedFullDescription = (data: unknown): string | undefined => {
  if (data === null || typeof data !== "object") return undefined
  const value = Reflect.get(data, "fullDescription")
  return typeof value === "string" ? value : undefined
}

const docBase = <T extends Doc>(_id: Ref<T>, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id,
  _class,
  space,
  modifiedOn: 2,
  modifiedBy: core.account.System,
  createdOn: 1,
  createdBy: core.account.System
})

const projectType: ProjectType = {
  ...docBase(projectTypeId, task.class.ProjectType, core.space.Model),
  name: "Default funnel",
  description: "",
  descriptor: leadClassIds.descriptor.FunnelType,
  targetClass: toClassRef<Project>(leadClassIds.mixin.DefaultFunnelTypeData),
  roles: 0,
  classic: false,
  tasks: [taskTypeId],
  statuses: [{ _id: statusId, taskType: taskTypeId }]
}

const taskType: TaskType = {
  ...docBase(taskTypeId, task.class.TaskType, core.space.Model),
  parent: projectTypeId,
  descriptor: toRef<TaskTypeDescriptor>("lead:taskTypeDescriptor:Lead"),
  name: "Lead",
  kind: "task",
  ofClass: toClassRef<Task>(leadClassIds.class.Lead),
  targetClass: toClassRef<Task>("lead:mixin:LeadTypeData"),
  statuses: [statusId],
  statusClass: core.class.Status,
  statusCategories: []
}

const status: Status = {
  ...docBase(statusId, core.class.Status, core.space.Model),
  ofAttribute: toRef("lead:attribute:State"),
  name: "New"
}

describe("mirrored Huly lead model references", () => {
  it("matches the upstream and live default funnel identifiers", () => {
    expect(leadClassIds.descriptor.FunnelType).toBe("lead:descriptors:FunnelType")
    expect(leadClassIds.template.DefaultFunnel).toBe("lead:template:DefaultFunnel")
  })
})

const makeFunnel = (overrides: Partial<HulyFunnel> = {}): HulyFunnel => ({
  ...docBase(funnelId, toClassRef<HulyFunnel>(leadClassIds.class.Funnel), core.space.Space),
  name: "Sales",
  description: "Summary",
  fullDescription: markdownToMarkupString("# Full", testMarkupUrlConfig),
  private: false,
  members: [toAccountUuid(account)],
  owners: [toAccountUuid(account)],
  archived: false,
  autoJoin: false,
  type: projectTypeId,
  comments: 2,
  attachments: 1,
  ...overrides
})

const matches = (doc: Doc, query: object): boolean =>
  Object.entries(query).every(([key, expected]) => {
    const actual = Reflect.get(doc, key)
    if (expected !== null && typeof expected === "object" && "$in" in expected) {
      return expected.$in.includes(actual)
    }
    return actual === expected
  })

interface FixtureOptions {
  readonly funnels?: ReadonlyArray<HulyFunnel>
  readonly projectTypes?: ReadonlyArray<ProjectType>
  readonly taskTypes?: ReadonlyArray<TaskType>
  readonly statuses?: ReadonlyArray<Status>
  readonly modelDocs?: ReadonlyArray<TestModelDoc>
  readonly leadCount?: number
  readonly workspaceAccounts?: ReadonlyArray<AccountUuid>
}

interface TestModelDoc extends Doc {
  readonly extends?: Ref<Class<Doc>>
  readonly projectType?: Ref<ProjectType>
  readonly taskType?: Ref<TaskType>
}

const fixture = (options: FixtureOptions = {}) => {
  const funnels = [...(options.funnels ?? [makeFunnel()])]
  const projectTypes = [...(options.projectTypes ?? [projectType])]
  const taskTypes = [...(options.taskTypes ?? [taskType])]
  const statuses = [...(options.statuses ?? [status])]
  const modelDocs = [...(options.modelDocs ?? [])]
  const updates: Array<unknown> = []
  const created: Array<{ readonly kind: string; readonly data: unknown }> = []
  const removed: Array<string> = []
  const findAll: HulyClientOperations["findAll"] = (_class, query, findOptions) => {
    const className = String(_class)
    const source: Array<Doc> =
      className === String(leadClassIds.class.Funnel)
        ? funnels
        : className === String(task.class.ProjectType)
          ? projectTypes
          : className === String(task.class.TaskType)
            ? taskTypes
            : className === String(core.class.Status)
              ? statuses
              : className === String(core.class.Mixin)
                ? modelDocs.filter((doc) => Reflect.has(doc, "extends"))
                : className === String(task.mixin.ProjectTypeClass)
                  ? modelDocs.filter((doc) => Reflect.has(doc, "projectType") && !Reflect.has(doc, "taskType"))
                  : className === String(task.mixin.TaskTypeClass)
                    ? modelDocs.filter((doc) => Reflect.has(doc, "taskType"))
                    : []
    if (className === String(leadClassIds.class.Lead)) {
      return Effect.succeed(toFindResult([], options.leadCount ?? 0))
    }
    const found = source.filter((candidate) => matches(candidate, query))
    const limited = findOptions?.limit === undefined ? found : found.slice(0, findOptions.limit)
    // Huly's generic class ref is a phantom runtime string, so TypeScript cannot
    // express the class-to-document dependency after the exhaustive route above.
    // A type guard cannot narrow caller-selected generic T. This boundary-only
    // cast mirrors findAll's SDK contract after runtime routing and query matching
    // have selected the requested class.
    return Effect.succeed(toFindResult(limited as Array<never>, found.length))
  }
  const layer = HulyClient.testLayer({
    findAll,
    findAllInModel: findAll,
    findOne: (_class, query, findOptions) => Effect.map(findAll(_class, query, findOptions), (result) => result.at(0)),
    createDoc: (_class, _space, data, id) => {
      created.push({ kind: "doc", data })
      if (id === undefined) return Effect.die(new Error("funnel fixture requires explicit create IDs"))
      return Effect.succeed(id)
    },
    createMixin: (_id, _class, _space, _mixin, data) => {
      created.push({ kind: "mixin", data })
      return Effect.succeed({})
    },
    updateDoc: (_class, _space, id, update) => {
      updates.push(update)
      const target = funnels.find((candidate) => String(candidate._id) === String(id))
      if (target !== undefined) Object.assign(target, update)
      return Effect.succeed({})
    },
    removeDoc: (_class, _space, id) => {
      removed.push(String(id))
      return Effect.succeed({})
    }
  })
  const workspaceLayer = WorkspaceClient.testLayer({
    getWorkspaceMembers: () =>
      Effect.succeed(
        (options.workspaceAccounts ?? [account]).map((person) => ({
          person: toAccountUuid(person),
          role: AccountRole.User
        }))
      )
  })
  return { created, layer, removed, updates, workspaceLayer }
}

const provide = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | WorkspaceClient | Diagnostics>,
  layers: Pick<ReturnType<typeof fixture>, "layer" | "workspaceLayer">
) =>
  Effect.gen(function* () {
    const scope = yield* makeDiagnosticsScope
    return yield* effect.pipe(
      Effect.provideService(Diagnostics, scope.service),
      Effect.provide(Layer.mergeAll(layers.layer, layers.workspaceLayer))
    )
  })

describe("funnel administration operations", () => {
  it.effect("lists active funnels by default and includes archived funnels when requested", () =>
    Effect.gen(function* () {
      const active = makeFunnel({ description: "" })
      const archived = makeFunnel({ _id: toRef<HulyFunnel>("funnel-2"), archived: true })
      const test = fixture({ funnels: [active, archived] })

      const activeResult = yield* provide(listFunnels({}), test)
      const allResult = yield* provide(listFunnels({ includeArchived: true, limit: Count.make(2) }), test)

      expect(activeResult.funnels).toEqual([
        { identifier: "funnel-1", name: "Sales", description: undefined, archived: false }
      ])
      expect(activeResult.total).toBe(1)
      expect(allResult.funnels).toHaveLength(2)
      expect(allResult.total).toBe(2)
    })
  )

  it.effect("projects stable fields, validated workflow, impact, and unsupported classification", () =>
    Effect.gen(function* () {
      const test = fixture({ leadCount: 3 })
      const result = yield* provide(getFunnel({ funnel: funnel("funnel-1") }), test)
      expect(result.fullDescription).toContain("# Full")
      expect(result.workflow[0]?.statuses[0]?.name).toBe("New")
      expect(result.impact).toMatchObject({ leads: 3, comments: 2, attachments: 1, totalAffected: 6 })
      expect(result.unsupportedFields[0]?.field).toBe("roleAssignments")
    })
  )

  it.effect("projects optional roles and unknown lead totals", () =>
    Effect.gen(function* () {
      const test = fixture({
        funnels: [makeFunnel({ autoJoinForRoles: [AccountRole.User], restricted: true })],
        leadCount: UNKNOWN_TOTAL
      })
      const result = yield* provide(getFunnel({ funnel: funnel("funnel-1") }), test)
      expect(result.autoJoinForRoles).toEqual([AccountRole.User])
      expect(result.restricted).toBe(true)
      expect(result.impact.totalAffected).toBe(UNKNOWN_TOTAL)
    })
  )

  it.effect("defaults absent native counters, owners, and auto-join values", () =>
    Effect.gen(function* () {
      const {
        attachments: _attachments,
        autoJoin: _autoJoin,
        comments: _comments,
        owners: _owners,
        ...minimalFunnel
      } = makeFunnel()
      const result = yield* provide(getFunnel({ funnel: funnel("funnel-1") }), fixture({ funnels: [minimalFunnel] }))
      expect(result.owners).toEqual([])
      expect(result.autoJoin).toBe(false)
      expect(result.impact).toMatchObject({ comments: 0, attachments: 0 })
    })
  )

  it.effect("omits unavailable exact-optional projection fields", () =>
    Effect.gen(function* () {
      const {
        createdBy: _createdBy,
        createdOn: _createdOn,
        fullDescription: _fullDescription,
        ...withoutOptionalFields
      } = makeFunnel()
      const test = fixture({ funnels: [withoutOptionalFields] })
      const result = yield* provide(getFunnel({ funnel: funnel("funnel-1") }), test)
      expect(Object.hasOwn(result, "fullDescription")).toBe(false)
      expect(Object.hasOwn(result, "createdOn")).toBe(false)
      expect(Object.hasOwn(result, "createdBy")).toBe(false)
    })
  )

  it.effect("rejects an ambiguous exact name and an invalid workflow before mutation", () =>
    Effect.gen(function* () {
      const duplicate = fixture({ funnels: [makeFunnel(), makeFunnel({ _id: toRef<HulyFunnel>("funnel-2") })] })
      const ambiguous = yield* Effect.flip(provide(getFunnel({ funnel: funnel("Sales") }), duplicate))
      expect(ambiguous._tag).toBe("FunnelIdentifierAmbiguousError")

      const invalid = fixture({ taskTypes: [] })
      const failed = yield* Effect.flip(provide(createFunnel({ name: NonEmptyString.make("New") }), invalid))
      expect(failed._tag).toBe("FunnelWorkflowInvalidError")
      expect(invalid.created).toHaveLength(0)
    })
  )

  it.effect("accepts generated Funnel project mixins and rejects bidirectionally inconsistent workflows", () =>
    Effect.gen(function* () {
      const customTarget = toClassRef<Project>("custom-funnel:type:mixin")
      const customType = { ...projectType, targetClass: customTarget }
      const customMixin = {
        ...docBase(toRef<Doc>(customTarget), core.class.Mixin, core.space.Model),
        extends: leadClassIds.class.Funnel,
        projectType: projectTypeId
      }
      const valid = fixture({ funnels: [], projectTypes: [customType], modelDocs: [customMixin] })
      const created = yield* provide(createFunnel({ name: NonEmptyString.make("Custom") }), valid)
      expect(created.created).toBe(true)

      const missingBinding = fixture({
        funnels: [],
        projectTypes: [customType],
        modelDocs: [
          {
            ...docBase(toRef<Doc>(customTarget), core.class.Mixin, core.space.Model),
            extends: leadClassIds.class.Funnel
          }
        ]
      })
      const bindingError = yield* Effect.flip(
        provide(createFunnel({ name: NonEmptyString.make("Missing binding") }), missingBinding)
      )
      expect(bindingError._tag).toBe("FunnelProjectTypeNotFoundError")

      const foreignTaskType = toRef<TaskType>("foreign-task-type")
      const extraMapping = fixture({
        projectTypes: [
          { ...projectType, statuses: [...projectType.statuses, { _id: statusId, taskType: foreignTaskType }] }
        ]
      })
      const mappingError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), extraMapping))
      expect(mappingError._tag).toBe("FunnelWorkflowInvalidError")

      const extraStatus = toRef<Status>("lead-status-extra")
      const asymmetric = fixture({
        projectTypes: [
          { ...projectType, statuses: [...projectType.statuses, { _id: extraStatus, taskType: taskTypeId }] }
        ]
      })
      const statusError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), asymmetric))
      expect(statusError._tag).toBe("FunnelWorkflowInvalidError")

      const invalidTarget = fixture({ taskTypes: [{ ...taskType, targetClass: toClassRef<Task>("wrong:target") }] })
      const targetError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), invalidTarget))
      expect(targetError._tag).toBe("FunnelWorkflowInvalidError")

      const wrongAttribute = fixture({ statuses: [{ ...status, ofAttribute: toRef("wrong:attribute") }] })
      const attributeError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), wrongAttribute))
      expect(attributeError._tag).toBe("FunnelWorkflowInvalidError")
    })
  )

  it.effect("accepts a generated Lead task mixin and rejects missing workflow model references", () =>
    Effect.gen(function* () {
      const customTarget = toClassRef<Task>("custom-lead:type:mixin")
      const customTask = { ...taskType, targetClass: customTarget }
      const customMixin = {
        ...docBase(toRef<Doc>(customTarget), core.class.Mixin, core.space.Model),
        extends: leadClassIds.class.Lead,
        projectType: projectTypeId,
        taskType: taskTypeId
      }
      const valid = fixture({ taskTypes: [customTask], modelDocs: [customMixin] })
      const detail = yield* provide(getFunnel({ funnel: funnel("funnel-1") }), valid)
      expect(detail.workflow[0]?.id).toBe("lead-task-type")

      const incompatible = fixture({ taskTypes: [{ ...taskType, parent: toRef<ProjectType>("other-project") }] })
      const incompatibleError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), incompatible))
      expect(incompatibleError._tag).toBe("FunnelWorkflowInvalidError")

      const noStatuses = fixture({
        projectTypes: [{ ...projectType, statuses: [] }],
        taskTypes: [{ ...taskType, statuses: [] }]
      })
      const noStatusError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), noStatuses))
      expect(noStatusError._tag).toBe("FunnelWorkflowInvalidError")

      const missingStatus = fixture({ statuses: [] })
      const missingStatusError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), missingStatus))
      expect(missingStatusError._tag).toBe("FunnelWorkflowInvalidError")

      const emptyWorkflow = fixture({ projectTypes: [{ ...projectType, tasks: [], statuses: [] }] })
      const emptyWorkflowError = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), emptyWorkflow))
      expect(emptyWorkflowError._tag).toBe("FunnelWorkflowInvalidError")
    })
  )

  it.effect("rejects missing and multiply matched funnels and project types", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.flip(
        provide(getFunnel({ funnel: funnel("missing-funnel") }), fixture({ funnels: [] }))
      )
      expect(missing._tag).toBe("FunnelNotFoundError")

      const secondType = {
        ...projectType,
        _id: toRef<ProjectType>("funnel-project-type-2"),
        name: "Second funnel type"
      }
      const ambiguousType = yield* Effect.flip(
        provide(
          createFunnel({ name: NonEmptyString.make("New funnel") }),
          fixture({ funnels: [], projectTypes: [projectType, secondType] })
        )
      )
      expect(ambiguousType._tag).toBe("FunnelProjectTypeIdentifierAmbiguousError")

      const incompatibleType = yield* Effect.flip(
        provide(
          createFunnel({ name: NonEmptyString.make("Wrong type") }),
          fixture({
            funnels: [],
            projectTypes: [{ ...projectType, descriptor: toRef<ProjectTypeDescriptor>("other:descriptor") }]
          })
        )
      )
      expect(incompatibleType._tag).toBe("FunnelProjectTypeNotFoundError")

      const byId = yield* provide(
        createFunnel({ name: NonEmptyString.make("By ID"), projectType: ProjectTypeRefSchema.make(projectTypeId) }),
        fixture({ funnels: [] })
      )
      const byName = yield* provide(
        createFunnel({
          name: NonEmptyString.make("By name"),
          projectType: ProjectTypeRefSchema.make(projectType.name)
        }),
        fixture({ funnels: [] })
      )
      expect(byId.created).toBe(true)
      expect(byName.created).toBe(true)
    })
  )

  it.effect("rejects unknown workspace member accounts before mutation", () =>
    Effect.gen(function* () {
      const unknown = AccountUuid.make("00000000-0000-4000-8000-000000000999")
      const test = fixture({ funnels: [], workspaceAccounts: [account] })
      const error = yield* Effect.flip(
        provide(
          createFunnel({ name: NonEmptyString.make("Unknown member"), members: [unknown], owners: [unknown] }),
          test
        )
      )
      expect(error._tag).toBe("FunnelAccountNotFoundError")
      expect(test.created).toHaveLength(0)
    })
  )

  it.effect("rejects an existing funnel with invalid membership and a missing project type", () =>
    Effect.gen(function* () {
      const invalidMembership = fixture({ funnels: [makeFunnel({ owners: [] })] })
      const membershipError = yield* Effect.flip(
        provide(updateFunnel({ funnel: funnel("funnel-1"), description: "Changed" }), invalidMembership)
      )
      expect(membershipError._tag).toBe("FunnelWorkflowInvalidError")
      expect(invalidMembership.updates).toHaveLength(0)

      const missingType = yield* Effect.flip(
        provide(getFunnel({ funnel: funnel("funnel-1") }), fixture({ projectTypes: [] }))
      )
      expect(missingType._tag).toBe("FunnelProjectTypeNotFoundError")
    })
  )

  it.effect("creates, updates, archives, and deletes only an archived empty funnel", () =>
    Effect.gen(function* () {
      const createTest = fixture({ funnels: [] })
      const result = yield* provide(
        createFunnel({
          name: NonEmptyString.make("New Funnel"),
          fullDescription:
            "**Rich** [LEAD-1](https://test.invalid/browse?workspace=test&_class=lead%3Aclass%3ALead&_id=lead-1&label=LEAD-1)"
        }),
        createTest
      )
      expect(result.created).toBe(true)
      expect(result.archived).toBe(false)
      expect(createTest.created.map((entry) => entry.kind)).toEqual(["doc", "mixin"])
      expect(JSON.stringify(createTest.created[0]?.data)).toContain("Rich")
      expect(capturedMarkupReferenceNodes(capturedFullDescription(createTest.created[0]?.data))[0]).toMatchObject({
        type: "reference",
        attrs: { id: "lead-1", objectclass: "lead:class:Lead", label: "LEAD-1" }
      })

      const active = fixture({ funnels: [makeFunnel({ comments: 0, attachments: 0 })] })
      yield* provide(updateFunnel({ funnel: funnel("funnel-1"), description: null }), active)
      expect(active.updates[0]).toMatchObject({ description: "" })
      const activeDelete = yield* Effect.flip(
        provide(
          deleteFunnel({
            funnel: funnel("funnel-1"),
            expectedLeads: Count.make(0),
            expectedComments: Count.make(0),
            expectedAttachments: Count.make(0)
          }),
          active
        )
      )
      expect(activeDelete._tag).toBe("FunnelDeleteConflictError")

      const archived = yield* provide(archiveFunnel({ funnel: funnel("funnel-1") }), active)
      expect(archived.updated).toBe(true)
      const deleted = yield* provide(
        deleteFunnel({
          funnel: funnel("funnel-1"),
          expectedLeads: Count.make(0),
          expectedComments: Count.make(0),
          expectedAttachments: Count.make(0)
        }),
        active
      )
      expect(deleted.deleted).toBe(true)
      expect(active.removed).toEqual(["funnel-1"])
    })
  )

  it.effect("reports impact and refuses to delete a non-empty archived funnel", () =>
    Effect.gen(function* () {
      const test = fixture({ funnels: [makeFunnel({ archived: true })], leadCount: 1 })
      const error = yield* Effect.flip(
        provide(
          deleteFunnel({
            funnel: funnel("funnel-1"),
            expectedLeads: Count.make(1),
            expectedComments: Count.make(2),
            expectedAttachments: Count.make(1)
          }),
          test
        )
      )
      expect(error._tag).toBe("FunnelDeleteConflictError")
      expect(error.message).toContain("1 leads, 2 comments, 1 attachments")
      expect(test.removed).toHaveLength(0)
    })
  )

  it.effect("rejects deletion when impact changed after the caller's snapshot", () =>
    Effect.gen(function* () {
      const test = fixture({ funnels: [makeFunnel({ archived: true, comments: 0, attachments: 0 })], leadCount: 1 })
      const error = yield* Effect.flip(
        provide(
          deleteFunnel({
            funnel: funnel("funnel-1"),
            expectedLeads: Count.make(0),
            expectedComments: Count.make(0),
            expectedAttachments: Count.make(0)
          }),
          test
        )
      )
      expect(error._tag).toBe("FunnelDeleteConflictError")
      expect(error.message).toContain("impact changed since preflight")
      expect(test.removed).toHaveLength(0)
    })
  )

  it.effect("reports archived idempotent creates and rejects update name collisions", () =>
    Effect.gen(function* () {
      const existing = fixture({ funnels: [makeFunnel({ archived: true })] })
      const idempotent = yield* provide(createFunnel({ name: NonEmptyString.make("Sales") }), existing)
      expect(idempotent).toMatchObject({ created: false, archived: true, identifier: "funnel-1" })
      expect(existing.created).toHaveLength(0)

      const collision = fixture({
        funnels: [makeFunnel(), makeFunnel({ _id: toRef<HulyFunnel>("funnel-2"), name: "Enterprise" })]
      })
      const failed = yield* Effect.flip(
        provide(updateFunnel({ funnel: funnel("funnel-1"), name: NonEmptyString.make("Enterprise") }), collision)
      )
      expect(failed._tag).toBe("FunnelIdentifierAmbiguousError")
      if (failed._tag === "FunnelIdentifierAmbiguousError") expect(failed.matches).toBe(1)
      expect(collision.updates).toHaveLength(0)
    })
  )

  it.effect("rejects duplicate existing creates and updates every mutable field", () =>
    Effect.gen(function* () {
      const duplicate = fixture({ funnels: [makeFunnel(), makeFunnel({ _id: toRef<HulyFunnel>("funnel-2") })] })
      const duplicateError = yield* Effect.flip(
        provide(createFunnel({ name: NonEmptyString.make("Sales") }), duplicate)
      )
      expect(duplicateError._tag).toBe("FunnelIdentifierAmbiguousError")

      const updateTest = fixture()
      const result = yield* provide(
        updateFunnel({
          funnel: funnel("funnel-1"),
          name: NonEmptyString.make("Sales"),
          description: "Updated",
          fullDescription: null,
          private: true,
          members: [account],
          owners: [account],
          autoJoin: true
        }),
        updateTest
      )
      expect(result.updated).toBe(true)
      expect(updateTest.updates[0]).toMatchObject({
        name: "Sales",
        description: "Updated",
        fullDescription: "",
        private: true,
        members: [account],
        owners: [account],
        autoJoin: true
      })

      const archived = fixture({ funnels: [makeFunnel({ archived: true })] })
      const archivedAgain = yield* provide(archiveFunnel({ funnel: funnel("funnel-1") }), archived)
      expect(archivedAgain.updated).toBe(false)
      expect(archived.updates).toHaveLength(0)

      const renamed = fixture()
      const renamedResult = yield* provide(
        updateFunnel({ funnel: funnel("funnel-1"), name: NonEmptyString.make("Renamed") }),
        renamed
      )
      expect(renamedResult.updated).toBe(true)
      expect(renamed.updates[0]).toMatchObject({ name: "Renamed" })

      const { owners: _owners, ...withoutOwners } = makeFunnel()
      const missingOwners = fixture({ funnels: [withoutOwners] })
      const missingOwnersError = yield* Effect.flip(
        provide(updateFunnel({ funnel: funnel("funnel-1"), name: NonEmptyString.make("Another name") }), missingOwners)
      )
      expect(missingOwnersError._tag).toBe("FunnelWorkflowInvalidError")
    })
  )

  it.effect("rejects malformed native references before creating a funnel", () =>
    Effect.gen(function* () {
      const test = fixture({ funnels: [] })
      const error = yield* Effect.flip(
        provide(
          createFunnel({
            name: NonEmptyString.make("Malformed reference"),
            fullDescription: "Broken [Lead](https://test.invalid/browse?workspace=test&_id=lead-1)."
          }),
          test
        )
      )
      expect(error._tag).toBe("HulyDataInvalidError")
      expect(test.created).toHaveLength(0)
    })
  )

  it.effect("rejects a locator matching one funnel ID and another funnel name", () =>
    Effect.gen(function* () {
      const test = fixture({
        funnels: [makeFunnel(), makeFunnel({ _id: toRef<HulyFunnel>("funnel-2"), name: "funnel-1" })]
      })
      const error = yield* Effect.flip(provide(getFunnel({ funnel: funnel("funnel-1") }), test))
      expect(error._tag).toBe("FunnelIdentifierAmbiguousError")
      if (error._tag === "FunnelIdentifierAmbiguousError") expect(error.matches).toBe(2)
    })
  )

  it("renders actionable funnel domain error messages", () => {
    const projectTypeRef = ProjectTypeRefSchema.make("funnel-project-type")
    expect(new FunnelNotFoundError({ identifier: funnel("missing") }).message).toContain("not found")
    expect(
      new FunnelIdentifierAmbiguousError({ identifier: funnel("Sales"), matches: Count.make(2) }).message
    ).toContain("2 funnels")
    expect(new FunnelProjectTypeNotFoundError({ identifier: projectTypeRef }).message).toContain("not compatible")
    expect(
      new FunnelProjectTypeIdentifierAmbiguousError({ identifier: projectTypeRef, matches: Count.make(2) }).message
    ).toContain("2 project types")
    expect(
      new FunnelWorkflowInvalidError({ projectType: projectTypeRef, reason: NonEmptyString.make("missing statuses") })
        .message
    ).toContain("missing statuses")
    expect(
      new FunnelDeleteConflictError({ identifier: funnel("Sales"), reason: NonEmptyString.make("archive first") })
        .message
    ).toContain("archive first")
    expect(new FunnelAccountNotFoundError({ account }).message).toContain("does not exist")
    expect(
      new LeadNotFoundError({ identifier: LeadIdentifier.make("LEAD-404"), funnel: FunnelIdentifier.make("funnel-1") })
        .message
    ).toContain("LEAD-404")
  })
})
