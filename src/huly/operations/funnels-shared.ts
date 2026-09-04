import type { Class, Doc, Ref, Space, Status } from "@hcengineering/core"
import type { Project, ProjectType, ProjectTypeClass, TaskType, TaskTypeClass } from "@hcengineering/task"
import { Effect } from "effect"

import type { FunnelReference } from "../../domain/schemas/leads.js"
import { ProjectTypeRefSchema, type ProjectTypeRef } from "../../domain/schemas/task-management.js"
import { Count, NonEmptyString } from "../../domain/schemas/shared.js"
import type { AccountRole } from "../../domain/schemas/workspace.js"
import { isSingle } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import {
  FunnelIdentifierAmbiguousError,
  FunnelNotFoundError,
  FunnelProjectTypeIdentifierAmbiguousError,
  FunnelProjectTypeNotFoundError,
  FunnelWorkflowInvalidError
} from "../errors-leads.js"
import { core, task } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { resolveByStatusRef, uniqueStatusRefs, workflowStatusFromRef } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export interface HulyFunnel extends Project {
  readonly fullDescription?: string
  readonly attachments?: number
  readonly comments?: number
  readonly autoJoinForRoles?: ReadonlyArray<AccountRole>
}

export interface FunnelWorkflowStatus {
  readonly id: Ref<Status>
  readonly name: string
}

export interface FunnelWorkflowTaskType {
  readonly taskType: TaskType
  readonly statuses: ReadonlyArray<FunnelWorkflowStatus>
}

export interface ResolvedFunnel {
  readonly client: HulyClient["Service"]
  readonly funnel: HulyFunnel
}

export type FunnelResolverError = HulyClientError | FunnelNotFoundError | FunnelIdentifierAmbiguousError
export type FunnelModelError =
  | HulyClientError
  | FunnelProjectTypeNotFoundError
  | FunnelProjectTypeIdentifierAmbiguousError
  | FunnelWorkflowInvalidError

interface FunnelProjectMixin extends Doc {
  readonly extends: Ref<Class<Project>>
}

interface FunnelTaskMixin extends Doc {
  readonly extends: Ref<Class<Doc>>
}

const isFunnelDescriptor = (projectType: ProjectType): boolean =>
  projectType.descriptor === leadClassIds.descriptor.FunnelType

const hasFunnelTargetClass = (
  client: HulyClient["Service"],
  projectType: ProjectType
): Effect.Effect<boolean, HulyClientError> => {
  if (!isFunnelDescriptor(projectType)) return Effect.succeed(false)
  if (projectType.targetClass === leadClassIds.mixin.DefaultFunnelTypeData) return Effect.succeed(true)
  return Effect.map(
    Effect.all([
      client.findAllInModel<FunnelProjectMixin>(
        core.class.Mixin,
        hulyQuery<FunnelProjectMixin>({ _id: toRef<FunnelProjectMixin>(projectType.targetClass) })
      ),
      client.findAllInModel<ProjectTypeClass>(
        task.mixin.ProjectTypeClass,
        hulyQuery<ProjectTypeClass>({
          _id: toRef<ProjectTypeClass>(projectType.targetClass),
          projectType: projectType._id
        })
      )
    ]),
    ([mixins, bindings]) => mixins.some((mixin) => mixin.extends === leadClassIds.class.Funnel) && bindings.length === 1
  )
}

const hasValidTaskTargetClass = (
  client: HulyClient["Service"],
  projectType: ProjectType,
  taskType: TaskType
): Effect.Effect<boolean, HulyClientError> => {
  if (String(taskType.targetClass) === String(leadClassIds.mixin.LeadTypeData)) return Effect.succeed(true)
  return Effect.map(
    Effect.all([
      client.findAllInModel<FunnelTaskMixin>(
        core.class.Mixin,
        hulyQuery<FunnelTaskMixin>({ _id: toRef<FunnelTaskMixin>(taskType.targetClass) })
      ),
      client.findAllInModel<TaskTypeClass>(
        task.mixin.TaskTypeClass,
        hulyQuery<TaskTypeClass>({
          _id: toRef<TaskTypeClass>(taskType.targetClass),
          taskType: taskType._id,
          projectType: projectType._id
        })
      )
    ]),
    ([mixins, bindings]) => mixins.some((mixin) => mixin.extends === leadClassIds.class.Lead) && bindings.length === 1
  )
}

const workflowInvalid = (projectType: ProjectType, reason: NonEmptyString): FunnelWorkflowInvalidError =>
  new FunnelWorkflowInvalidError({ projectType: ProjectTypeRefSchema.make(projectType._id), reason })

export const resolveFunnel = (
  client: HulyClient["Service"],
  identifier: FunnelReference
): Effect.Effect<HulyFunnel, FunnelResolverError> =>
  Effect.gen(function* () {
    const idMatches = yield* client.findAll<HulyFunnel>(
      leadClassIds.class.Funnel,
      hulyQuery<HulyFunnel>({ _id: toRef<HulyFunnel>(identifier) })
    )
    if (idMatches.length > 1) {
      return yield* new FunnelIdentifierAmbiguousError({ identifier, matches: Count.make(idMatches.length) })
    }
    const nameMatches = yield* client.findAll<HulyFunnel>(
      leadClassIds.class.Funnel,
      hulyQuery<HulyFunnel>({ name: identifier })
    )
    const matches = [...new Map([...idMatches, ...nameMatches].map((funnel) => [funnel._id, funnel])).values()]
    if (isSingle(matches)) return matches[0]
    if (matches.length > 1) {
      return yield* new FunnelIdentifierAmbiguousError({ identifier, matches: Count.make(matches.length) })
    }
    return yield* new FunnelNotFoundError({ identifier })
  })

export const resolveFunnelFromContext = (
  identifier: FunnelReference
): Effect.Effect<ResolvedFunnel, FunnelResolverError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return { client, funnel: yield* resolveFunnel(client, identifier) }
  })

export const resolveFunnelProjectType = (
  client: HulyClient["Service"],
  identifier: ProjectTypeRef | undefined
): Effect.Effect<
  ProjectType,
  HulyClientError | FunnelProjectTypeNotFoundError | FunnelProjectTypeIdentifierAmbiguousError
> =>
  Effect.gen(function* () {
    const projectTypes = yield* client.findAll<ProjectType>(task.class.ProjectType, hulyQuery<ProjectType>({}))
    const exactMatches = projectTypes.filter(
      (candidate) => identifier === undefined || String(candidate._id) === identifier || candidate.name === identifier
    )
    const matches = yield* Effect.filter(exactMatches, (candidate) => hasFunnelTargetClass(client, candidate))
    if (isSingle(matches)) return matches[0]
    const reportedIdentifier = identifier ?? ProjectTypeRefSchema.make(leadClassIds.descriptor.FunnelType)
    if (matches.length === 0) return yield* new FunnelProjectTypeNotFoundError({ identifier: reportedIdentifier })
    return yield* new FunnelProjectTypeIdentifierAmbiguousError({
      identifier: reportedIdentifier,
      matches: Count.make(matches.length)
    })
  })

export const getFunnelProjectType = (
  client: HulyClient["Service"],
  funnel: HulyFunnel
): Effect.Effect<ProjectType, HulyClientError | FunnelProjectTypeNotFoundError> =>
  Effect.gen(function* () {
    const projectType = yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ _id: funnel.type })
    )
    return projectType !== undefined && (yield* hasFunnelTargetClass(client, projectType))
      ? projectType
      : yield* new FunnelProjectTypeNotFoundError({ identifier: ProjectTypeRefSchema.make(funnel.type) })
  })

const taskTypeStatusRefs = (projectType: ProjectType, taskType: TaskType): ReadonlyArray<Ref<Status>> => {
  const configured = projectType.statuses
    .filter((status) => status.taskType === taskType._id)
    .map((status) => status._id)
  return uniqueStatusRefs(taskType.statuses.length > 0 ? taskType.statuses : configured)
}

export const resolveFunnelWorkflow = (
  client: HulyClient["Service"],
  projectType: ProjectType
): Effect.Effect<ReadonlyArray<FunnelWorkflowTaskType>, HulyClientError | FunnelWorkflowInvalidError, Diagnostics> =>
  Effect.gen(function* () {
    const taskRefSet = new Set(projectType.tasks)
    const unsupportedMapping = projectType.statuses.find((status) => !taskRefSet.has(status.taskType))
    if (unsupportedMapping !== undefined) {
      return yield* workflowInvalid(
        projectType,
        NonEmptyString.make(
          `status mapping references task type '${unsupportedMapping.taskType}' outside projectType.tasks`
        )
      )
    }
    const taskTypes =
      projectType.tasks.length === 0
        ? []
        : yield* client.findAll<TaskType>(
            task.class.TaskType,
            hulyQuery<TaskType>({ _id: { $in: [...projectType.tasks] } })
          )
    if (taskTypes.length !== projectType.tasks.length || taskTypes.length === 0) {
      return yield* workflowInvalid(projectType, NonEmptyString.make("configured task type references are missing"))
    }
    const incompatible = taskTypes.find(
      (candidate) => candidate.ofClass !== leadClassIds.class.Lead || candidate.parent !== projectType._id
    )
    if (incompatible !== undefined) {
      return yield* workflowInvalid(
        projectType,
        NonEmptyString.make(`task type '${incompatible._id}' is not a Lead task owned by this project type`)
      )
    }
    return yield* Effect.forEach(taskTypes, (taskType) =>
      Effect.gen(function* () {
        if (!(yield* hasValidTaskTargetClass(client, projectType, taskType))) {
          return yield* workflowInvalid(
            projectType,
            NonEmptyString.make(`task type '${taskType._id}' has an invalid Lead target class`)
          )
        }
        const refs = taskTypeStatusRefs(projectType, taskType)
        if (refs.length === 0) {
          return yield* workflowInvalid(projectType, NonEmptyString.make(`task type '${taskType._id}' has no statuses`))
        }
        const projectStatusRefs = projectType.statuses
          .filter((status) => status.taskType === taskType._id)
          .map((status) => status._id)
        if (
          projectStatusRefs.length !== uniqueStatusRefs(projectStatusRefs).length ||
          refs.length !== uniqueStatusRefs(projectStatusRefs).length ||
          refs.some((statusRef) => !projectStatusRefs.includes(statusRef)) ||
          projectStatusRefs.some((statusRef) => !refs.includes(statusRef))
        ) {
          return yield* workflowInvalid(
            projectType,
            NonEmptyString.make(`task type '${taskType._id}' statuses are inconsistent with the project workflow`)
          )
        }
        const docs = yield* client.findAllInModel<Status>(
          core.class.Status,
          hulyQuery<Status>({ _id: { $in: [...refs] } })
        )
        if (docs.length !== refs.length) {
          return yield* workflowInvalid(
            projectType,
            NonEmptyString.make(`task type '${taskType._id}' references missing status documents`)
          )
        }
        const wrongAttribute = docs.find((status) => status.ofAttribute !== leadClassIds.attribute.State)
        if (wrongAttribute !== undefined) {
          return yield* workflowInvalid(
            projectType,
            NonEmptyString.make(`status '${wrongAttribute._id}' is not owned by the native Lead state attribute`)
          )
        }
        const statuses = resolveByStatusRef(
          refs,
          docs,
          (status) => ({ id: status._id, name: status.name }),
          (statusRef) => ({ id: statusRef, name: workflowStatusFromRef(statusRef).name })
        )
        return { taskType, statuses }
      })
    )
  })

export const funnelSpace = (funnel: HulyFunnel): Ref<Space> => toRef<Space>(funnel._id)
