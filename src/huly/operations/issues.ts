/**
 * Issue domain operations for Huly MCP server.
 *
 * Provides typed operations for querying issues from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Channel, Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type Class,
  type Data,
  type Doc,
  type DocumentUpdate,
  generateId,
  type MarkupBlobRef,
  type Ref,
  SortingOrder,
  type Space,
  type Status,
  type StatusCategory
} from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import type { TagElement, TagReference } from "@hcengineering/tags"
import { type Issue as HulyIssue, IssuePriority, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  AddLabelParams,
  CreateIssueParams,
  GetIssueParams,
  Issue,
  IssuePriority as IssuePriorityStr,
  IssueSummary,
  ListIssuesParams,
  UpdateIssueParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { InvalidStatusError, IssueNotFoundError, PersonNotFoundError, ProjectNotFoundError } from "../errors.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const task = require("@hcengineering/task").default as typeof import("@hcengineering/task").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tags = require("@hcengineering/tags").default as typeof import("@hcengineering/tags").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

// --- Types ---

/**
 * Errors that listIssues can produce.
 */
export type ListIssuesError =
  | HulyClientError
  | ProjectNotFoundError
  | InvalidStatusError

/**
 * Errors that getIssue can produce.
 */
export type GetIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

/**
 * Errors that createIssue can produce.
 */
export type CreateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

/**
 * Errors that updateIssue can produce.
 */
export type UpdateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

/**
 * Errors that addLabel can produce.
 */
export type AddLabelError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

// --- Priority Mapping ---

/**
 * Map Huly numeric priority to string.
 */
const priorityToString = (priority: IssuePriority): IssuePriorityStr => {
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
    default:
      return "no-priority"
  }
}

/**
 * Map string priority to Huly numeric priority.
 */
const stringToPriority = (priority: IssuePriorityStr | undefined): IssuePriority => {
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
    default:
      return IssuePriority.NoPriority
  }
}

// --- Status Category Helpers ---

/**
 * Status with category information for filtering.
 * Status._id is Ref<Status> which is a branded string, compatible with Ref<Doc>.
 */
type StatusWithCategory = Status & { category?: Ref<StatusCategory> }

/**
 * Check if a status is a "done" category status.
 * Done = the issue is completed successfully.
 */
const isDoneStatus = (statusRef: Ref<Status>, statuses: ReadonlyArray<StatusWithCategory>): boolean => {
  // String comparison works because Ref<T> is a branded string
  const status = statuses.find(s => String(s._id) === String(statusRef))
  if (!status?.category) return false

  // task.statusCategory.Won is the "done" category
  const wonCategory = task.statusCategory.Won
  return status.category === wonCategory
}

/**
 * Check if a status is a "canceled" category status.
 */
const isCanceledStatus = (statusRef: Ref<Status>, statuses: ReadonlyArray<StatusWithCategory>): boolean => {
  // String comparison works because Ref<T> is a branded string
  const status = statuses.find(s => String(s._id) === String(statusRef))
  if (!status?.category) return false

  // task.statusCategory.Lost is the "canceled" category
  const lostCategory = task.statusCategory.Lost
  return status.category === lostCategory
}

// --- Operations ---

/**
 * List issues with filters.
 * Results sorted by modifiedOn descending.
 */
export const listIssues = (
  params: ListIssuesParams
): Effect.Effect<Array<IssueSummary>, ListIssuesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )
    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }
    const project = projectResult

    const allStatuses = yield* client.findAll<Status>(
      tracker.class.IssueStatus,
      {}
    )
    const statusList = allStatuses as ReadonlyArray<StatusWithCategory>

    const query: Record<string, unknown> = {
      space: project._id
    }

    if (params.status !== undefined) {
      const statusFilter = params.status.toLowerCase()

      if (statusFilter === "open") {
        const doneAndCanceledStatuses = statusList
          .filter(s =>
            isDoneStatus(s._id, statusList)
            || isCanceledStatus(s._id, statusList)
          )
          .map(s => s._id)

        if (doneAndCanceledStatuses.length > 0) {
          query.status = { $nin: doneAndCanceledStatuses }
        }
      } else if (statusFilter === "done") {
        const doneStatuses = statusList
          .filter(s => isDoneStatus(s._id, statusList))
          .map(s => s._id)

        if (doneStatuses.length > 0) {
          query.status = { $in: doneStatuses }
        } else {
          return []
        }
      } else if (statusFilter === "canceled") {
        const canceledStatuses = statusList
          .filter(s => isCanceledStatus(s._id, statusList))
          .map(s => s._id)

        if (canceledStatuses.length > 0) {
          query.status = { $in: canceledStatuses }
        } else {
          return []
        }
      } else {
        const matchingStatus = statusList.find(
          s => s.name.toLowerCase() === statusFilter
        )

        if (matchingStatus === undefined) {
          return yield* new InvalidStatusError({
            status: params.status,
            project: params.project
          })
        }

        query.status = matchingStatus._id
      }
    }

    if (params.assignee !== undefined) {
      const assigneePerson = yield* findPersonByEmailOrName(client, params.assignee)
      if (assigneePerson !== undefined) {
        query.assignee = assigneePerson._id
      } else {
        return []
      }
    }

    const limit = Math.min(params.limit ?? 50, 200)

    const issues = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      query,
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const assigneeIds = [
      ...new Set(
        issues.filter(i => i.assignee !== null).map(i => i.assignee!)
      )
    ]

    const persons = assigneeIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: assigneeIds } }
      )
      : []

    const personMap = new Map(persons.map(p => [p._id, p]))

    const summaries: Array<IssueSummary> = issues.map(issue => {
      const statusDoc = statusList.find(s => String(s._id) === String(issue.status))
      const statusName = statusDoc?.name ?? "Unknown"
      const assigneeName = issue.assignee !== null
        ? personMap.get(issue.assignee)?.name
        : undefined

      return {
        identifier: issue.identifier,
        title: issue.title,
        status: statusName,
        priority: priorityToString(issue.priority),
        assignee: assigneeName,
        modifiedOn: issue.modifiedOn
      }
    })

    return summaries
  })

/**
 * Find a person by email or name.
 */
const findPersonByEmailOrName = (
  client: HulyClient["Type"],
  emailOrName: string
): Effect.Effect<Person | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      { value: emailOrName }
    )

    if (channels.length > 0) {
      const channel = channels[0]
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: channel.attachedTo as Ref<Person> }
      )
      if (person) {
        return person
      }
    }

    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      { name: emailOrName }
    )

    if (persons.length > 0) {
      return persons[0]
    }

    const allPersons = yield* client.findAll<Person>(
      contact.class.Person,
      {}
    )

    const lowerName = emailOrName.toLowerCase()
    const matchingPerson = allPersons.find(
      p => p.name.toLowerCase().includes(lowerName)
    )

    return matchingPerson
  })

// --- Identifier Parsing ---

/**
 * Parse an issue identifier.
 * Accepts:
 * - Full identifier: "HULY-123"
 * - Numeric only: "123" or 123
 *
 * Returns the full identifier if project prefix is provided,
 * or constructs it from the project identifier and number.
 */
const parseIssueIdentifier = (
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

// --- Get Issue Operation ---

/**
 * Get a single issue with full details.
 *
 * Looks up issue by identifier (e.g., "HULY-123" or just 123).
 * Returns full issue including:
 * - Description rendered as markdown
 * - Assignee name (not just ID)
 * - Status name
 * - All metadata
 *
 * @param params - Get issue parameters
 * @returns Full issue object
 * @throws ProjectNotFoundError if project doesn't exist
 * @throws IssueNotFoundError if issue doesn't exist in project
 */
export const getIssue = (
  params: GetIssueParams
): Effect.Effect<Issue, GetIssueError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )
    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }
    const project = projectResult

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

    const statusList = yield* client.findAll<Status>(
      tracker.class.IssueStatus,
      {}
    )

    const statusDoc = statusList.find(s => String(s._id) === String(issue!.status))
    const statusName = statusDoc?.name ?? "Unknown"

    let assigneeName: string | undefined
    let assigneeRef: Issue["assigneeRef"]
    if (issue.assignee !== null) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: issue.assignee }
      )
      if (person) {
        assigneeName = person.name
        assigneeRef = {
          id: String(person._id),
          name: person.name
        }
      }
    }

    let description: string | undefined
    if (issue.description) {
      description = yield* client.fetchMarkup(
        issue._class,
        issue._id,
        "description",
        issue.description,
        "markdown"
      )
    }

    const result: Issue = {
      identifier: issue.identifier,
      title: issue.title,
      description,
      status: statusName,
      priority: priorityToString(issue.priority),
      assignee: assigneeName,
      assigneeRef,
      project: params.project,
      modifiedOn: issue.modifiedOn,
      createdOn: issue.createdOn,
      dueDate: issue.dueDate ?? undefined,
      estimation: issue.estimation
    }

    return result
  })

// --- Create Issue Operation ---

/**
 * Result of createIssue operation.
 */
export interface CreateIssueResult {
  identifier: string
}

/**
 * Create a new issue in a project.
 *
 * Creates issue with:
 * - Title (required)
 * - Description (optional, markdown supported)
 * - Priority (optional, defaults to no-priority)
 * - Status (optional, uses project default)
 * - Assignee (optional, by email or name)
 *
 * @param params - Create issue parameters
 * @returns Created issue identifier (e.g., "HULY-123")
 * @throws ProjectNotFoundError if project doesn't exist
 * @throws InvalidStatusError if specified status is invalid
 * @throws PersonNotFoundError if assignee not found
 */
export const createIssue = (
  params: CreateIssueParams
): Effect.Effect<CreateIssueResult, CreateIssueError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )
    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }
    const project = projectResult

    const issueId: Ref<HulyIssue> = generateId()

    const incOps: DocumentUpdate<HulyProject> = { $inc: { sequence: 1 } }
    const incResult = yield* client.updateDoc(
      tracker.class.Project,
      "core:space:Space" as Ref<Space>,
      project._id,
      incOps,
      true
    )
    const sequence = (incResult as { object?: { sequence?: number } }).object?.sequence ?? project.sequence + 1

    let statusRef: Ref<Status> = project.defaultIssueStatus
    if (params.status !== undefined) {
      const allStatuses = yield* client.findAll<Status>(
        tracker.class.IssueStatus,
        {}
      )
      const statusFilter = params.status.toLowerCase()
      const matchingStatus = allStatuses.find(
        s => s.name.toLowerCase() === statusFilter
      )
      if (matchingStatus === undefined) {
        return yield* new InvalidStatusError({
          status: params.status,
          project: params.project
        })
      }
      statusRef = matchingStatus._id
    }

    let assigneeRef: Ref<Person> | null = null
    if (params.assignee !== undefined) {
      const person = yield* findPersonByEmailOrName(client, params.assignee)
      if (person === undefined) {
        return yield* new PersonNotFoundError({ identifier: params.assignee })
      }
      assigneeRef = person._id
    }

    const lastIssue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      { space: project._id },
      { sort: { rank: SortingOrder.Descending } }
    )
    const rank = makeRank(lastIssue?.rank, undefined)

    let descriptionMarkupRef: MarkupBlobRef | null = null
    if (params.description !== undefined && params.description.trim() !== "") {
      descriptionMarkupRef = yield* client.uploadMarkup(
        tracker.class.Issue,
        issueId,
        "description",
        params.description,
        "markdown"
      )
    }

    const priority = stringToPriority(params.priority)
    const identifier = `${project.identifier}-${sequence}`

    const issueData: AttachedData<HulyIssue> = {
      title: params.title,
      description: descriptionMarkupRef,
      status: statusRef,
      number: sequence,
      kind: tracker.taskTypes.Issue,
      identifier,
      priority,
      assignee: assigneeRef,
      component: null,
      estimation: 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      subIssues: 0,
      parents: [],
      childInfo: [],
      dueDate: null,
      rank
    }
    yield* client.addCollection(
      tracker.class.Issue,
      project._id,
      project._id,
      tracker.class.Project,
      "issues",
      issueData,
      issueId
    )

    return { identifier }
  })

// --- Update Issue Operation ---

/**
 * Result of updateIssue operation.
 */
export interface UpdateIssueResult {
  identifier: string
  updated: boolean
}

/**
 * Update an existing issue in a project.
 *
 * Updates only provided fields:
 * - title: New title
 * - description: New markdown description (uploaded via uploadMarkup)
 * - status: New status (resolved by name)
 * - priority: New priority
 * - assignee: New assignee email/name, or null to unassign
 *
 * @param params - Update issue parameters
 * @returns Updated issue identifier and success flag
 * @throws ProjectNotFoundError if project doesn't exist
 * @throws IssueNotFoundError if issue doesn't exist
 * @throws InvalidStatusError if specified status is invalid
 * @throws PersonNotFoundError if assignee not found
 */
export const updateIssue = (
  params: UpdateIssueParams
): Effect.Effect<UpdateIssueResult, UpdateIssueError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )
    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }
    const project = projectResult

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

    const updateOps: DocumentUpdate<HulyIssue> = {}

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.description !== undefined) {
      if (params.description.trim() === "") {
        updateOps.description = null
      } else {
        const descriptionMarkupRef = yield* client.uploadMarkup(
          tracker.class.Issue,
          issue._id,
          "description",
          params.description,
          "markdown"
        )
        updateOps.description = descriptionMarkupRef
      }
    }

    if (params.status !== undefined) {
      const allStatuses = yield* client.findAll<Status>(
        tracker.class.IssueStatus,
        {}
      )
      const statusFilter = params.status.toLowerCase()
      const matchingStatus = allStatuses.find(
        s => s.name.toLowerCase() === statusFilter
      )
      if (matchingStatus === undefined) {
        return yield* new InvalidStatusError({
          status: params.status,
          project: params.project
        })
      }
      updateOps.status = matchingStatus._id
    }

    if (params.priority !== undefined) {
      updateOps.priority = stringToPriority(params.priority)
    }

    if (params.assignee !== undefined) {
      if (params.assignee === null) {
        updateOps.assignee = null
      } else {
        const person = yield* findPersonByEmailOrName(client, params.assignee)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: params.assignee })
        }
        updateOps.assignee = person._id
      }
    }

    if (Object.keys(updateOps).length === 0) {
      return { identifier: issue.identifier, updated: false }
    }

    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      updateOps
    )

    return { identifier: issue.identifier, updated: true }
  })

// --- Add Label Operation ---

/**
 * Result of addLabel operation.
 */
export interface AddLabelResult {
  identifier: string
  labelAdded: boolean
}

/**
 * Add a label/tag to an issue.
 *
 * Creates the tag in the project if it doesn't exist,
 * then attaches it to the issue via TagReference.
 *
 * Idempotent: adding the same label twice is a no-op.
 *
 * @param params - Add label parameters
 * @returns Issue identifier and whether label was added
 * @throws ProjectNotFoundError if project doesn't exist
 * @throws IssueNotFoundError if issue doesn't exist
 */
export const addLabel = (
  params: AddLabelParams
): Effect.Effect<AddLabelResult, AddLabelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )
    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }
    const project = projectResult

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

    const existingLabels = yield* client.findAll<TagReference>(
      tags.class.TagReference,
      {
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue
      }
    )

    const labelTitle = params.label.trim()
    const labelExists = existingLabels.some(
      (l) => l.title.toLowerCase() === labelTitle.toLowerCase()
    )
    if (labelExists) {
      return { identifier: issue.identifier, labelAdded: false }
    }

    const color = params.color ?? 0

    let tagElement = yield* client.findOne<TagElement>(
      tags.class.TagElement,
      {
        title: labelTitle,
        targetClass: tracker.class.Issue as Ref<Class<Doc>>
      }
    )

    if (tagElement === undefined) {
      const tagElementId: Ref<TagElement> = generateId()
      const tagElementData: Data<TagElement> = {
        title: labelTitle,
        description: "",
        targetClass: tracker.class.Issue as Ref<Class<Doc>>,
        color,
        category: tracker.category.Other
      }
      yield* client.createDoc(
        tags.class.TagElement,
        core.space.Workspace as Ref<Space>,
        tagElementData,
        tagElementId
      )
      tagElement = yield* client.findOne<TagElement>(
        tags.class.TagElement,
        { _id: tagElementId }
      )
    }

    if (tagElement === undefined) {
      return { identifier: issue.identifier, labelAdded: false }
    }

    const tagRefData: AttachedData<TagReference> = {
      title: tagElement.title,
      color: tagElement.color,
      tag: tagElement._id
    }
    yield* client.addCollection(
      tags.class.TagReference,
      project._id,
      issue._id,
      tracker.class.Issue,
      "labels",
      tagRefData
    )

    return { identifier: issue.identifier, labelAdded: true }
  })
