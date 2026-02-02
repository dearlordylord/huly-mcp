/**
 * Project domain operations for Huly MCP server.
 *
 * Provides typed operations for querying projects from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import { SortingOrder } from "@hcengineering/core"
import { type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { ListProjectsParams, ListProjectsResult, ProjectSummary } from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default

// --- Types ---

/**
 * Errors that listProjects can produce.
 */
export type ListProjectsError = HulyClientError

// --- Operations ---

/**
 * List projects with optional filters.
 * Results sorted by name ascending.
 */
export const listProjects = (
  params: ListProjectsParams
): Effect.Effect<ListProjectsResult, ListProjectsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}
    if (!params.includeArchived) {
      query.archived = false
    }

    const limit = Math.min(params.limit ?? 50, 200)

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

    const total = projects.total ?? projects.length

    const summaries: Array<ProjectSummary> = projects.map((project) => ({
      identifier: project.identifier,
      name: project.name,
      description: project.description || undefined,
      archived: project.archived
    }))

    return {
      projects: summaries,
      total
    }
  })
