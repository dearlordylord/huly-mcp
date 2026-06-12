/**
 * Project domain operations for Huly MCP server.
 *
 * Provides typed operations for querying projects from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Data, DocumentQuery, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { IssueStatus, Project as HulyProject } from "@hcengineering/tracker"
import { TimeReportDayType } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type {
  CreateProjectParams,
  CreateProjectResult,
  DeleteProjectParams,
  DeleteProjectResult,
  GetProjectParams,
  ListProjectsParams,
  ListProjectsResult,
  ListStatusesParams,
  Project,
  UpdateProjectParams,
  UpdateProjectResult
} from "../../domain/schemas.js"
import type { ListStatusesResult, StatusDetail } from "../../domain/schemas/projects.js"
import { parseProject, ProjectSummarySchema, UPDATE_PROJECT_FIELDS } from "../../domain/schemas/projects.js"
import { ProjectIdentifier, StatusName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { NoUpdateFieldsError, ProjectNotFoundError } from "../errors.js"
import { HulyConnectionError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { listTotal } from "./counts.js"
import { findProject, findProjectWithStatuses } from "./issues-shared.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type ListProjectsError = HulyClientError | HulyConnectionError
type GetProjectError = ProjectNotFoundError | HulyClientError | HulyConnectionError
type CreateProjectError = HulyClientError
type UpdateProjectError = ProjectNotFoundError | NoUpdateFieldsError | HulyClientError
type DeleteProjectError = ProjectNotFoundError | HulyClientError

export const listProjects = (
  params: ListProjectsParams
): Effect.Effect<ListProjectsResult, ListProjectsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: DocumentQuery<HulyProject> = {}
    if (!params.includeArchived) {
      query.archived = false
    }

    const limit = clampLimit(params.limit)

    const projects = yield* client.findAll<HulyProject>(
      tracker.class.Project,
      query,
      {
        limit,
        sort: {
          name: SortingOrder.Ascending
        }
      }
    )

    const total = projects.total

    const validated = yield* Schema.decodeUnknown(
      Schema.Array(ProjectSummarySchema)
    )(
      projects.map((project) => ({
        identifier: project.identifier,
        name: project.name,
        description: project.description || undefined,
        archived: project.archived
      }))
    ).pipe(
      Effect.mapError((parseError) =>
        new HulyConnectionError({
          message: `listProjects response failed schema validation: ${parseError.message}`,
          cause: parseError
        })
      )
    )

    return {
      projects: validated,
      total: listTotal(total)
    }
  })

export const getProject = (
  params: GetProjectParams
): Effect.Effect<Project, GetProjectError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const { defaultStatusId, project, statuses } = yield* findProjectWithStatuses(params.project)

    const defaultStatus = defaultStatusId !== undefined
      ? statuses.find(s => s._id === defaultStatusId)
      : undefined

    return yield* parseProject({
      identifier: project.identifier,
      name: project.name,
      description: project.description || undefined,
      archived: project.archived,
      defaultStatus: defaultStatus?.name,
      statuses: statuses.map(s => s.name)
    }).pipe(
      Effect.mapError((parseError) =>
        new HulyConnectionError({
          message: `getProject response failed schema validation: ${parseError.message}`,
          cause: parseError
        })
      )
    )
  })

type ListStatusesError = ProjectNotFoundError | HulyClientError | HulyConnectionError

export const listStatuses = (
  params: ListStatusesParams
): Effect.Effect<ListStatusesResult, ListStatusesError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const { defaultStatusId, statuses } = yield* findProjectWithStatuses(params.project)

    const details: Array<StatusDetail> = statuses.map(s => ({
      name: StatusName.make(s.name),
      category: s.category,
      isDefault: s._id === defaultStatusId
    }))

    return { statuses: details, total: listTotal(details.length) }
  })

export const createProject = (
  params: CreateProjectParams
): Effect.Effect<CreateProjectResult, CreateProjectError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const existing = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.identifier }
    )

    if (existing !== undefined) {
      return {
        identifier: ProjectIdentifier.make(existing.identifier),
        name: existing.name,
        created: false
      }
    }

    const projectId: Ref<HulyProject> = generateId()

    // Data<HulyProject> requires all non-Doc fields from the type hierarchy:
    // Space: name, description, private, members, archived
    // TypedSpace: type (Ref<SpaceType>)
    // Project: identifier, sequence, defaultIssueStatus, defaultTimeReportDay
    // IconProps: icon, color (optional)
    // Huly's classic project type is the standard tracker ProjectType.
    // defaultIssueStatus uses a placeholder ref; Huly resolves it from ProjectType statuses.
    const projectData: Data<HulyProject> = {
      name: params.name,
      description: params.description ?? "",
      private: params.private ?? false,
      members: [client.getAccountUuid()],
      owners: [client.getAccountUuid()],
      archived: false,
      identifier: params.identifier,
      sequence: 0,
      // Huly SDK: defaultIssueStatus expects Ref<IssueStatus> but is set by the platform
      // on first issue creation. Empty string sentinel is safe for initial project creation.
      // eslint-disable-next-line no-restricted-syntax -- see above
      defaultIssueStatus: "" as Ref<IssueStatus>,
      defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
      // tracker.ids.ClassingProjectType is the default classic tracker ProjectType.
      type: tracker.ids.ClassingProjectType
    }

    // Tracker projects are self-referential: the project _id is its own space.
    // toRef bridges the phantom-typed Ref boundary.
    const spaceRef = toRef<Space>(projectId)

    yield* client.createDoc(
      tracker.class.Project,
      spaceRef,
      projectData,
      projectId
    )

    return {
      identifier: ProjectIdentifier.make(params.identifier),
      name: params.name,
      created: true
    }
  })

export const updateProject = (
  params: UpdateProjectParams
): Effect.Effect<UpdateProjectResult, UpdateProjectError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_project", params, UPDATE_PROJECT_FIELDS)

    const { client, project } = yield* findProject(params.project)

    type UpdateProjectField = typeof UPDATE_PROJECT_FIELDS[number]
    type UpdateProjectEntries = {
      readonly [Field in UpdateProjectField]: DirectUpdateEntry<UpdateProjectField, DocumentUpdate<HulyProject>, Field>
    }
    const updateEntries = {
      name: params.name === undefined ? {} : { name: params.name },
      description: params.description === undefined
        ? {}
        : { description: params.description === null ? "" : params.description }
    } satisfies UpdateProjectEntries
    const updateOps: DocumentUpdate<HulyProject> = mergeUpdateEntries(Object.values(updateEntries))

    yield* client.updateDoc(
      tracker.class.Project,
      toRef<Space>(project._id),
      project._id,
      updateOps
    )

    return { identifier: ProjectIdentifier.make(project.identifier), updated: true }
  })

export const deleteProject = (
  params: DeleteProjectParams
): Effect.Effect<DeleteProjectResult, DeleteProjectError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    yield* client.removeDoc(
      tracker.class.Project,
      toRef<Space>(project._id),
      project._id
    )

    return { identifier: ProjectIdentifier.make(project.identifier), deleted: true }
  })
