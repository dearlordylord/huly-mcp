import type { Ref, Status, WithLookup } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { IssuePriority as IssuePriorityStr } from "../../domain/schemas/issues.js"
import type { NonNegativeNumber } from "../../domain/schemas/shared.js"
import { PositiveNumber } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { InvalidStatusError, IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { core, task, tracker } from "../huly-plugins.js"
import { findOneOrFail, hulyQuery } from "./query-helpers.js"

// Huly API uses 0 as sentinel for "not set" on numeric fields like estimation and remainingTime.
// Confirmed: creating an issue without estimation stores 0, not null/undefined.
// Converts sentinel 0 → undefined; positive values → branded PositiveNumber.
export const zeroAsUnset = (value: NonNegativeNumber): PositiveNumber | undefined =>
  value > 0 ? PositiveNumber.make(value) : undefined

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

    const project = yield* findOneOrFail(
      client,
      tracker.class.Project,
      { identifier: projectIdentifier },
      () => new ProjectNotFoundError({ identifier: projectIdentifier })
    )

    return { client, project }
  })

export type StatusInfo = {
  _id: Ref<Status>
  name: string
  isDone: boolean
  isCanceled: boolean
}

const statusInfoFromDoc = (doc: Status): StatusInfo => {
  const categoryStr = doc.category ? doc.category : ""
  return {
    _id: doc._id,
    name: doc.name,
    isDone: categoryStr === task.statusCategory.Won,
    isCanceled: categoryStr === task.statusCategory.Lost
  }
}

const fallbackStatusInfoFromRef = (statusRef: Ref<Status>): StatusInfo => {
  const name = statusRef.includes(":") ? statusRef.slice(statusRef.lastIndexOf(":") + 1) : statusRef
  const nameLower = name.toLowerCase()
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
  return {
    _id: statusRef,
    name,
    isDone,
    isCanceled
  }
}

export const uniqueStatusRefs = (refs: ReadonlyArray<Ref<Status>>): Array<Ref<Status>> =>
  refs.reduce<Array<Ref<Status>>>(
    (unique, ref) => unique.includes(ref) ? unique : [...unique, ref],
    []
  )

export const uniqueStatusDocs = (statuses: Iterable<Status>): Array<Status> =>
  Array.from(statuses).reduce<Array<Status>>(
    (unique, status) => unique.some((existing) => existing._id === status._id) ? unique : [...unique, status],
    []
  )

const uniqueProjectTypeStatusRefs = (statuses: ReadonlyArray<{ readonly _id: Ref<Status> }>): Array<Ref<Status>> =>
  uniqueStatusRefs(statuses.map((status) => status._id))

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
  {
    client: HulyClient["Type"]
    project: HulyProject
    projectType: ProjectType | undefined
    statuses: Array<StatusInfo>
    defaultStatusId: Ref<Status> | undefined
  },
  ProjectNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const project = yield* findOneOrFail<ProjectWithType, ProjectNotFoundError>(
      client,
      tracker.class.Project,
      { identifier: projectIdentifier },
      () => new ProjectNotFoundError({ identifier: projectIdentifier }),
      { lookup: { type: task.class.ProjectType } }
    )

    const projectType = project.$lookup?.type
    const statuses: Array<StatusInfo> = projectType?.statuses
      ? yield* Effect.gen(function*() {
        const statusRefs = uniqueProjectTypeStatusRefs(projectType.statuses)
        if (statusRefs.length === 0) {
          return []
        }

        // Try to query Status documents for names. Historical manual-test proof
        // is in `git show 31ccf83e^:PROBLEMS.md`: on workspace
        // `internalai @ huly.app.monadical.io`, querying Status docs failed with
        // `Cannot read properties of null (reading '#<Object>')`, breaking issue
        // read/list/update flows. The branch below preserves operation behavior
        // by using the status refs already present on ProjectType.
        const statusDocsResult = yield* Effect.either(
          client.findAll<Status>(
            core.class.Status,
            hulyQuery<Status>({ _id: { $in: statusRefs } })
          )
        )

        if (statusDocsResult._tag === "Right") {
          return uniqueStatusDocs(statusDocsResult.right).map(statusInfoFromDoc)
        }

        // Fallback: use refs without names if Status query fails
        // This allows operations to work even with malformed workspace data
        yield* Effect.logWarning(
          `Status query failed for project ${projectIdentifier}, using fallback. `
            + `Category-based filtering (open/done/canceled) will use name heuristics. `
            + `Error: ${statusDocsResult.left.message}`
        )
        return statusRefs.map(fallbackStatusInfoFromRef)
      })
      : []

    // project.defaultIssueStatus is typed as required Ref<IssueStatus> in the SDK,
    // but is undefined or "" at runtime when no explicit default was chosen at project creation.
    const defaultStatusId: Ref<Status> | undefined = project.defaultIssueStatus || statuses[0]?._id

    return { client, defaultStatusId, project, projectType, statuses }
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

export const findIssueInProject = (
  client: HulyClient["Type"],
  project: HulyProject,
  identifierStr: string
): Effect.Effect<HulyIssue, IssueNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const { fullIdentifier, number } = parseIssueIdentifier(
      identifierStr,
      project.identifier
    )

    const issue = (yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({
        space: project._id,
        identifier: fullIdentifier
      })
    )) ?? (number !== null
      ? yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        hulyQuery<HulyIssue>({
          space: project._id,
          number
        })
      )
      : undefined)
    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: identifierStr,
        project: project.identifier
      })
    }

    return issue
  })

export const findProjectAndIssue = (
  params: { project: string; identifier: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; issue: HulyIssue },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)
    const issue = yield* findIssueInProject(client, project, params.identifier)
    return { client, project, issue }
  })

const priorityToStringMap = {
  [IssuePriority.Urgent]: "urgent",
  [IssuePriority.High]: "high",
  [IssuePriority.Medium]: "medium",
  [IssuePriority.Low]: "low",
  [IssuePriority.NoPriority]: "no-priority"
} as const satisfies Record<IssuePriority, IssuePriorityStr>

export const priorityToString = (priority: IssuePriority): IssuePriorityStr => priorityToStringMap[priority]

const stringToPriorityMap = {
  "urgent": IssuePriority.Urgent,
  "high": IssuePriority.High,
  "medium": IssuePriority.Medium,
  "low": IssuePriority.Low,
  "no-priority": IssuePriority.NoPriority
} as const satisfies Record<IssuePriorityStr, IssuePriority>

export const stringToPriority = (priority: IssuePriorityStr): IssuePriority => stringToPriorityMap[priority]

export const resolveStatusByName = (
  statuses: Array<StatusInfo>,
  statusName: string,
  project: string
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const normalizedInput = normalizeForComparison(statusName)
  const matchingStatus = statuses.find(
    s => normalizeForComparison(s.name) === normalizedInput
  )
  if (matchingStatus === undefined) {
    return Effect.fail(new InvalidStatusError({ status: statusName, project }))
  }
  return Effect.succeed(matchingStatus._id)
}
