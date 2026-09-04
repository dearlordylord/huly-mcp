import type { Ref, Space, Status } from "@hcengineering/core"
import type { Project, ProjectType, TaskType } from "@hcengineering/task"
import { Effect } from "effect"

import type { FunnelReference } from "../../domain/schemas/leads.js"
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
import { task } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { findStatusDocs, resolveByStatusRef, uniqueStatusRefs, workflowStatusFromRef } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export interface HulyFunnel extends Project {
  readonly fullDescription?: string
  readonly attachments?: number
  readonly comments?: number
  readonly autoJoinForRoles?: ReadonlyArray<string>
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

const isFunnelProjectType = (projectType: ProjectType): boolean =>
  projectType.descriptor === leadClassIds.descriptor.FunnelType &&
  projectType.targetClass === leadClassIds.mixin.DefaultFunnelTypeData

export const resolveFunnel = (
  client: HulyClient["Service"],
  identifier: FunnelReference
): Effect.Effect<HulyFunnel, FunnelResolverError> =>
  Effect.gen(function* () {
    const idMatches = yield* client.findAll<HulyFunnel>(
      leadClassIds.class.Funnel,
      hulyQuery<HulyFunnel>({ _id: toRef<HulyFunnel>(identifier) })
    )
    if (isSingle(idMatches)) return idMatches[0]
    if (idMatches.length > 1) {
      return yield* new FunnelIdentifierAmbiguousError({ identifier, matches: idMatches.length })
    }
    const nameMatches = yield* client.findAll<HulyFunnel>(
      leadClassIds.class.Funnel,
      hulyQuery<HulyFunnel>({ name: identifier })
    )
    if (isSingle(nameMatches)) return nameMatches[0]
    if (nameMatches.length > 1) {
      return yield* new FunnelIdentifierAmbiguousError({ identifier, matches: nameMatches.length })
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
  identifier: string | undefined
): Effect.Effect<
  ProjectType,
  HulyClientError | FunnelProjectTypeNotFoundError | FunnelProjectTypeIdentifierAmbiguousError
> =>
  Effect.gen(function* () {
    const projectTypes = yield* client.findAll<ProjectType>(task.class.ProjectType, hulyQuery<ProjectType>({}))
    const matches = projectTypes.filter(
      (candidate) =>
        isFunnelProjectType(candidate) &&
        (identifier === undefined || candidate._id === identifier || candidate.name === identifier)
    )
    if (isSingle(matches)) return matches[0]
    const reportedIdentifier = identifier ?? String(leadClassIds.descriptor.FunnelType)
    if (matches.length === 0) return yield* new FunnelProjectTypeNotFoundError({ identifier: reportedIdentifier })
    return yield* new FunnelProjectTypeIdentifierAmbiguousError({
      identifier: reportedIdentifier,
      matches: matches.length
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
    return projectType !== undefined && isFunnelProjectType(projectType)
      ? projectType
      : yield* new FunnelProjectTypeNotFoundError({ identifier: String(funnel.type) })
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
    const taskTypes =
      projectType.tasks.length === 0
        ? []
        : yield* client.findAll<TaskType>(
            task.class.TaskType,
            hulyQuery<TaskType>({ _id: { $in: [...projectType.tasks] } })
          )
    if (taskTypes.length !== projectType.tasks.length || taskTypes.length === 0) {
      return yield* new FunnelWorkflowInvalidError({
        projectType: String(projectType._id),
        reason: "configured task type references are missing"
      })
    }
    const incompatible = taskTypes.find(
      (candidate) => candidate.ofClass !== leadClassIds.class.Lead || candidate.parent !== projectType._id
    )
    if (incompatible !== undefined) {
      return yield* new FunnelWorkflowInvalidError({
        projectType: String(projectType._id),
        reason: `task type '${incompatible._id}' is not a Lead task owned by this project type`
      })
    }
    return yield* Effect.forEach(taskTypes, (taskType) =>
      Effect.gen(function* () {
        const refs = taskTypeStatusRefs(projectType, taskType)
        if (refs.length === 0) {
          return yield* new FunnelWorkflowInvalidError({
            projectType: String(projectType._id),
            reason: `task type '${taskType._id}' has no statuses`
          })
        }
        const projectStatusRefs = projectType.statuses
          .filter((status) => status.taskType === taskType._id)
          .map((status) => status._id)
        if (refs.some((statusRef) => !projectStatusRefs.includes(statusRef))) {
          return yield* new FunnelWorkflowInvalidError({
            projectType: String(projectType._id),
            reason: `task type '${taskType._id}' statuses are inconsistent with the project workflow`
          })
        }
        const docs = yield* findStatusDocs(client, refs)
        if (docs.length !== refs.length) {
          return yield* new FunnelWorkflowInvalidError({
            projectType: String(projectType._id),
            reason: `task type '${taskType._id}' references missing status documents`
          })
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
