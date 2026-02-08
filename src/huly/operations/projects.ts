/**
 * Project domain operations for Huly MCP server.
 *
 * Provides typed operations for querying projects from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import { type DocumentQuery, SortingOrder } from "@hcengineering/core"
import { type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { ListProjectsParams, ListProjectsResult, ProjectSummary } from "../../domain/schemas.js"
import { ProjectIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { clampLimit } from "./shared.js"

import { tracker } from "../huly-plugins.js"

type ListProjectsError = HulyClientError

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

    const summaries: Array<ProjectSummary> = projects.map((project) => ({
      identifier: ProjectIdentifier.make(project.identifier),
      name: project.name,
      description: project.description || undefined,
      archived: project.archived
    }))

    return {
      projects: summaries,
      total
    }
  })
