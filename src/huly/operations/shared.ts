import type { Channel, Person } from "@hcengineering/contact"
import type { Doc, PersonUuid, Ref, Status, WithLookup } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority } from "@hcengineering/tracker"
import { absurd, Effect } from "effect"

import type { IssuePriority as IssuePriorityStr } from "../../domain/schemas/issues.js"
import type { NonNegativeNumber } from "../../domain/schemas/shared.js"
import { PositiveNumber } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { InvalidPersonUuidError, IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { escapeLikeWildcards } from "./query-helpers.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default

// Huly SDK uses `Ref<T>` (a branded string) for entity references.
// Our domain uses Effect Schema brands. No type-safe bridge exists; this is the boundary cast.
export const toRef = <T extends Doc>(id: string): Ref<T> => id as Ref<T>

// Huly API uses 0 as sentinel for "not set" on numeric fields like estimation and remainingTime.
// Confirmed: creating an issue without estimation stores 0, not null/undefined.
// Converts sentinel 0 → undefined; positive values → branded PositiveNumber.
export const zeroAsUnset = (value: NonNegativeNumber): PositiveNumber | undefined =>
  value > 0 ? PositiveNumber.make(value) : undefined

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const validatePersonUuid = (uuid?: string): Effect.Effect<PersonUuid | undefined, InvalidPersonUuidError> => {
  if (uuid === undefined) return Effect.succeed(undefined)
  if (!UUID_REGEX.test(uuid)) {
    return Effect.fail(new InvalidPersonUuidError({ uuid }))
  }
  // PersonUuid is a branded string type from @hcengineering/core.
  // After regex validation confirms UUID format, cast is safe.
  return Effect.succeed(uuid as PersonUuid)
}

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const task = require("@hcengineering/task").default as typeof import("@hcengineering/task").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

const statusClassRef = core.class.Status

type ProjectWithType = WithLookup<HulyProject> & {
  $lookup?: { type?: ProjectType }
}

export const findProject = (
  projectIdentifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject },
  ProjectNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const project = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: projectIdentifier }
    )
    if (project === undefined) {
      return yield* new ProjectNotFoundError({ identifier: projectIdentifier })
    }

    return { client, project }
  })

export type StatusInfo = {
  _id: Ref<Status>
  name: string
  isDone: boolean
  isCanceled: boolean
}

/**
 * Find project with its ProjectType lookup to get status information.
 * This avoids querying IssueStatus directly which can fail on some workspaces.
 *
 * If Status query fails (known bug on some workspaces), falls back to using
 * status refs without resolved names.
 */
export const findProjectWithStatuses = (
  projectIdentifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; statuses: Array<StatusInfo> },
  ProjectNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const project = yield* client.findOne<ProjectWithType>(
      tracker.class.Project,
      { identifier: projectIdentifier },
      { lookup: { type: task.class.ProjectType } }
    )
    if (project === undefined) {
      return yield* new ProjectNotFoundError({ identifier: projectIdentifier })
    }

    const projectType = project.$lookup?.type
    const statuses: Array<StatusInfo> = []

    const wonCategory = task.statusCategory.Won
    const lostCategory = task.statusCategory.Lost

    if (projectType?.statuses) {
      const statusRefs = projectType.statuses.map(s => s._id)
      if (statusRefs.length > 0) {
        // Try to query Status documents for names
        // On some workspaces this fails with deserialization errors
        const statusDocsResult = yield* Effect.either(
          client.findAll<Status>(
            statusClassRef,
            { _id: { $in: statusRefs } }
          )
        )

        if (statusDocsResult._tag === "Right") {
          for (const doc of statusDocsResult.right) {
            const categoryStr = doc.category ? doc.category : ""
            statuses.push({
              _id: doc._id,
              name: doc.name,
              isDone: categoryStr === wonCategory,
              isCanceled: categoryStr === lostCategory
            })
          }
        } else {
          // Fallback: use refs without names if Status query fails
          // This allows operations to work even with malformed workspace data
          yield* Effect.logWarning(
            `Status query failed for project ${projectIdentifier}, using fallback. `
              + `Category-based filtering (open/done/canceled) will use name heuristics. `
              + `Error: ${statusDocsResult.left.message}`
          )
          for (const ps of projectType.statuses) {
            const name = ps._id.split(":").pop() ?? "Unknown"
            const nameLower = name.toLowerCase()
            // Infer done/canceled from common status name patterns
            const isDone = nameLower.includes("done")
              || nameLower.includes("complete")
              || nameLower.includes("finished")
              || nameLower.includes("resolved")
              || nameLower.includes("closed")
            const isCanceled = nameLower.includes("cancel")
              || nameLower.includes("reject")
              || nameLower.includes("abort")
              || nameLower.includes("wontfix")
              || nameLower.includes("invalid")
            statuses.push({
              _id: ps._id,
              name,
              isDone,
              isCanceled
            })
          }
        }
      }
    }

    return { client, project, statuses }
  })

export const parseIssueIdentifier = (
  identifier: string | number,
  projectIdentifier: string
): { fullIdentifier: string; number: number | null } => {
  const idStr = String(identifier).trim()

  const match = idStr.match(/^([A-Z]+)-(\d+)$/i)
  if (match) {
    return {
      fullIdentifier: `${match[1].toUpperCase()}-${match[2]}`,
      number: parseInt(match[2], 10)
    }
  }

  const numMatch = idStr.match(/^\d+$/)
  if (numMatch) {
    const num = parseInt(idStr, 10)
    return {
      fullIdentifier: `${projectIdentifier.toUpperCase()}-${num}`,
      number: num
    }
  }

  return { fullIdentifier: idStr, number: null }
}

export const findProjectAndIssue = (
  params: { project: string; identifier: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; issue: HulyIssue },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const { fullIdentifier, number } = parseIssueIdentifier(
      params.identifier,
      params.project
    )

    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      {
        space: project._id,
        identifier: fullIdentifier
      }
    )
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        {
          space: project._id,
          number
        }
      )
    }
    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project
      })
    }

    return { client, project, issue }
  })

export const priorityToString = (priority: IssuePriority): IssuePriorityStr => {
  switch (priority) {
    case IssuePriority.Urgent:
      return "urgent"
    case IssuePriority.High:
      return "high"
    case IssuePriority.Medium:
      return "medium"
    case IssuePriority.Low:
      return "low"
    case IssuePriority.NoPriority:
      return "no-priority"
    default:
      absurd(priority)
      throw new Error("Invalid priority")
  }
}

export const stringToPriority = (priority: IssuePriorityStr): IssuePriority => {
  switch (priority) {
    case "urgent":
      return IssuePriority.Urgent
    case "high":
      return IssuePriority.High
    case "medium":
      return IssuePriority.Medium
    case "low":
      return IssuePriority.Low
    case "no-priority":
      return IssuePriority.NoPriority
    default:
      absurd(priority)
      throw new Error("Invalid priority")
  }
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const clampLimit = (limit?: number): number => Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

export const findPersonByEmailOrName = (
  client: HulyClient["Type"],
  emailOrName: string
): Effect.Effect<Person | undefined, HulyClientError> =>
  Effect.gen(function*() {
    // 1. Exact email channel match (email channels only)
    const exactChannel = yield* client.findOne<Channel>(
      contact.class.Channel,
      {
        value: emailOrName,
        provider: contact.channelProvider.Email
      }
    )
    if (exactChannel !== undefined) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: toRef<Person>(exactChannel.attachedTo) }
      )
      if (person !== undefined) return person
    }

    // 2. Exact name match
    const exactPerson = yield* client.findOne<Person>(
      contact.class.Person,
      { name: emailOrName }
    )
    if (exactPerson !== undefined) return exactPerson

    // 3. Substring email channel match via $like (email channels only)
    const escaped = escapeLikeWildcards(emailOrName)
    const likeChannel = yield* client.findOne<Channel>(
      contact.class.Channel,
      {
        value: { $like: `%${escaped}%` },
        provider: contact.channelProvider.Email
      }
    )
    if (likeChannel !== undefined) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: toRef<Person>(likeChannel.attachedTo) }
      )
      if (person !== undefined) return person
    }

    // 4. Substring name match via $like
    const likePerson = yield* client.findOne<Person>(
      contact.class.Person,
      { name: { $like: `%${escaped}%` } }
    )
    return likePerson
  })
