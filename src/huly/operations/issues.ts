/**
 * Issue domain operations for Huly MCP server.
 *
 * Provides typed operations for querying issues from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import { SortingOrder, type Ref, type Status, type Doc, type StatusCategory, type Space, generateId, type Class } from "@hcengineering/core"
import type { TagElement, TagReference } from "@hcengineering/tags"
import type { Person, Channel } from "@hcengineering/contact"
import { type Issue as HulyIssue, type Project as HulyProject, IssuePriority } from "@hcengineering/tracker"
import { makeRank } from "@hcengineering/rank"
import { Effect } from "effect"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  ProjectNotFoundError,
  InvalidStatusError,
  IssueNotFoundError,
  PersonNotFoundError,
} from "../errors.js"
import type { IssueSummary, ListIssuesParams, GetIssueParams, CreateIssueParams, UpdateIssueParams, AddLabelParams, Issue, IssuePriority as IssuePriorityStr } from "../../domain/schemas.js"

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
 * Check if a status is a "done" category status.
 * Done = the issue is completed successfully.
 */
const isDoneStatus = (statusRef: Ref<Status>, statuses: Array<{ _id: Ref<Doc>; category?: Ref<StatusCategory> }>): boolean => {
  const status = statuses.find(s => s._id === statusRef as Ref<Doc>)
  if (!status?.category) return false

  // task.statusCategory.Won is the "done" category
  const wonCategory = task.statusCategory.Won
  return status.category === wonCategory
}

/**
 * Check if a status is a "canceled" category status.
 */
const isCanceledStatus = (statusRef: Ref<Status>, statuses: Array<{ _id: Ref<Doc>; category?: Ref<StatusCategory> }>): boolean => {
  const status = statuses.find(s => s._id === statusRef as Ref<Doc>)
  if (!status?.category) return false

  // task.statusCategory.Lost is the "canceled" category
  const lostCategory = task.statusCategory.Lost
  return status.category === lostCategory
}

// --- Operations ---

/**
 * List issues with filters.
 *
 * Filters:
 * - project (required): Project identifier
 * - status: "open" | "done" | "canceled" | specific status name
 * - assignee: Email or person name
 * - limit: Max results (default 50, max 200)
 *
 * Results sorted by modifiedOn descending.
 */
export const listIssues = (
  params: ListIssuesParams
): Effect.Effect<IssueSummary[], ListIssuesError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    // 1. Find project by identifier
    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )

    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }

    const project = projectResult as HulyProject

    // 2. Get all statuses for status name resolution
    const allStatuses = yield* client.findAll<Status>(
      tracker.class.IssueStatus,
      {}
    )

    // Cast to work with status categories
    const statusList = allStatuses as unknown as Array<Status & { _id: Ref<Doc>; category?: Ref<StatusCategory> }>

    // 3. Build query based on filters
    const query: Record<string, unknown> = {
      space: project._id,
    }

    // 3a. Handle status filter
    if (params.status !== undefined) {
      const statusFilter = params.status.toLowerCase()

      if (statusFilter === "open") {
        // Open = not done and not canceled
        const doneAndCanceledStatuses = statusList
          .filter(s =>
            isDoneStatus(s._id as Ref<Status>, statusList) ||
            isCanceledStatus(s._id as Ref<Status>, statusList)
          )
          .map(s => s._id)

        if (doneAndCanceledStatuses.length > 0) {
          query.status = { $nin: doneAndCanceledStatuses }
        }
      } else if (statusFilter === "done") {
        // Done = completed successfully
        const doneStatuses = statusList
          .filter(s => isDoneStatus(s._id as Ref<Status>, statusList))
          .map(s => s._id)

        if (doneStatuses.length > 0) {
          query.status = { $in: doneStatuses }
        } else {
          // No done statuses found, return empty
          return []
        }
      } else if (statusFilter === "canceled") {
        // Canceled
        const canceledStatuses = statusList
          .filter(s => isCanceledStatus(s._id as Ref<Status>, statusList))
          .map(s => s._id)

        if (canceledStatuses.length > 0) {
          query.status = { $in: canceledStatuses }
        } else {
          return []
        }
      } else {
        // Specific status name - case insensitive match
        const matchingStatus = statusList.find(
          s => s.name.toLowerCase() === statusFilter
        )

        if (matchingStatus === undefined) {
          return yield* new InvalidStatusError({
            status: params.status,
            project: params.project,
          })
        }

        query.status = matchingStatus._id
      }
    }

    // 3b. Handle assignee filter
    if (params.assignee !== undefined) {
      const assigneePerson = yield* findPersonByEmailOrName(client, params.assignee)
      if (assigneePerson !== undefined) {
        query.assignee = assigneePerson._id
      } else {
        // Assignee not found - return empty results
        return []
      }
    }

    // 4. Execute query
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

    // 5. Batch fetch all assignees (fix N+1 query)
    const assigneeIds = [...new Set(
      issues.filter(i => i.assignee !== null).map(i => i.assignee!)
    )]

    const persons = assigneeIds.length > 0
      ? yield* client.findAll<Person>(
          contact.class.Person,
          { _id: { $in: assigneeIds } }
        )
      : []

    const personMap = new Map(persons.map(p => [p._id, p]))

    // 6. Transform to IssueSummary
    const summaries: IssueSummary[] = issues.map(issue => {
      // Look up status name
      const statusDoc = statusList.find(s => s._id === issue.status as Ref<Doc>)
      const statusName = statusDoc?.name ?? "Unknown"

      // Look up assignee name from pre-fetched map
      const assigneeName = issue.assignee !== null
        ? personMap.get(issue.assignee)?.name
        : undefined

      return {
        identifier: issue.identifier,
        title: issue.title,
        status: statusName,
        priority: priorityToString(issue.priority),
        assignee: assigneeName,
        modifiedOn: issue.modifiedOn,
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
  Effect.gen(function* () {
    // First try to find by email in channels
    const channels = yield* client.findAll<Channel>(
      contact.class.Channel,
      { value: emailOrName }
    )

    if (channels.length > 0) {
      // Get the person attached to this channel
      const channel = channels[0]
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: channel.attachedTo as Ref<Person> }
      )
      if (person) {
        return person
      }
    }

    // Fall back to name search
    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      { name: emailOrName }
    )

    if (persons.length > 0) {
      return persons[0]
    }

    // Try partial name match
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

  // Check if it's a full identifier like "HULY-123"
  const match = idStr.match(/^([A-Z]+)-(\d+)$/i)
  if (match) {
    return {
      fullIdentifier: `${match[1].toUpperCase()}-${match[2]}`,
      number: parseInt(match[2], 10),
    }
  }

  // Check if it's just a number
  const numMatch = idStr.match(/^\d+$/)
  if (numMatch) {
    const num = parseInt(idStr, 10)
    return {
      fullIdentifier: `${projectIdentifier.toUpperCase()}-${num}`,
      number: num,
    }
  }

  // Not a valid format, return as-is for the query to fail gracefully
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
  Effect.gen(function* () {
    const client = yield* HulyClient

    // 1. Find project by identifier
    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )

    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }

    const project = projectResult as HulyProject

    // 2. Parse the identifier
    const { fullIdentifier, number } = parseIssueIdentifier(
      params.identifier,
      params.project
    )

    // 3. Find the issue - try by full identifier first, then by number
    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      {
        space: project._id,
        identifier: fullIdentifier,
      }
    )

    // If not found by identifier and we have a number, try by number
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        {
          space: project._id,
          number,
        }
      )
    }

    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project,
      })
    }

    // 4. Get all statuses for status name resolution
    const allStatuses = yield* client.findAll<Status>(
      tracker.class.IssueStatus,
      {}
    )
    const statusList = allStatuses as unknown as Array<Status & { _id: Ref<Doc> }>

    // 5. Look up status name
    const statusDoc = statusList.find(s => s._id === issue!.status as Ref<Doc>)
    const statusName = statusDoc?.name ?? "Unknown"

    // 6. Look up assignee name if assigned
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
          name: person.name,
        }
      }
    }

    // 7. Fetch markdown description if present
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

    // 8. Build and return the full Issue
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
      estimation: issue.estimation,
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
  Effect.gen(function* () {
    const client = yield* HulyClient

    // 1. Find project by identifier
    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )

    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }

    const project = projectResult as HulyProject

    // 2. Generate unique issue ID
    const issueId: Ref<HulyIssue> = generateId()

    // 3. Increment project sequence to get issue number
    const incResult = yield* client.updateDoc(
      tracker.class.Project,
      "core:space:Space" as Ref<Space>,
      project._id,
      { $inc: { sequence: 1 } } as never,
      true
    )

    // Extract sequence from result
    const sequence = (incResult as { object?: { sequence?: number } }).object?.sequence ?? project.sequence + 1

    // 4. Resolve status
    let statusRef: Ref<Status> = project.defaultIssueStatus

    if (params.status !== undefined) {
      // Get all statuses and find matching one
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
          project: params.project,
        })
      }

      statusRef = matchingStatus._id as Ref<Status>
    }

    // 5. Resolve assignee (if provided)
    let assigneeRef: Ref<Person> | null = null

    if (params.assignee !== undefined) {
      const person = yield* findPersonByEmailOrName(client, params.assignee)

      if (person === undefined) {
        return yield* new PersonNotFoundError({ identifier: params.assignee })
      }

      assigneeRef = person._id
    }

    // 6. Calculate rank (append to end)
    const lastIssue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      { space: project._id },
      { sort: { rank: SortingOrder.Descending } }
    )

    const rank = makeRank(lastIssue?.rank, undefined)

    // 7. Upload description if provided
    let descriptionMarkupRef: string | null = null

    if (params.description !== undefined && params.description.trim() !== "") {
      descriptionMarkupRef = yield* client.uploadMarkup(
        tracker.class.Issue,
        issueId,
        "description",
        params.description,
        "markdown"
      )
    }

    // 8. Map priority
    const priority = stringToPriority(params.priority)

    // 9. Build identifier
    const identifier = `${project.identifier}-${sequence}`

    // 10. Create issue using addCollection
    yield* client.addCollection(
      tracker.class.Issue,
      project._id,
      project._id,
      tracker.class.Project,
      "issues",
      {
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
        rank,
      } as never,
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
  Effect.gen(function* () {
    const client = yield* HulyClient

    // 1. Find project by identifier
    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )

    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }

    const project = projectResult as HulyProject

    // 2. Parse the identifier and find the issue
    const { fullIdentifier, number } = parseIssueIdentifier(
      params.identifier,
      params.project
    )

    // 3. Find the issue - try by full identifier first, then by number
    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      {
        space: project._id,
        identifier: fullIdentifier,
      }
    )

    // If not found by identifier and we have a number, try by number
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        {
          space: project._id,
          number,
        }
      )
    }

    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project,
      })
    }

    // 4. Build update operations based on provided fields
    const updateOps: Record<string, unknown> = {}

    // 4a. Handle title update
    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    // 4b. Handle description update - need to upload markdown first
    if (params.description !== undefined) {
      if (params.description.trim() === "") {
        // Empty description means clear it
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

    // 4c. Handle status update
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
          project: params.project,
        })
      }

      updateOps.status = matchingStatus._id
    }

    // 4d. Handle priority update
    if (params.priority !== undefined) {
      updateOps.priority = stringToPriority(params.priority)
    }

    // 4e. Handle assignee update (null means unassign)
    if (params.assignee !== undefined) {
      if (params.assignee === null) {
        // Unassign
        updateOps.assignee = null
      } else {
        // Look up person by email or name
        const person = yield* findPersonByEmailOrName(client, params.assignee)

        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: params.assignee })
        }

        updateOps.assignee = person._id
      }
    }

    // 5. Check if there's anything to update
    if (Object.keys(updateOps).length === 0) {
      return { identifier: issue.identifier, updated: false }
    }

    // 6. Perform the update
    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      updateOps as never
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
  Effect.gen(function* () {
    const client = yield* HulyClient

    // 1. Find project by identifier
    const projectResult = yield* client.findOne<HulyProject>(
      tracker.class.Project,
      { identifier: params.project }
    )

    if (projectResult === undefined) {
      return yield* new ProjectNotFoundError({ identifier: params.project })
    }

    const project = projectResult as HulyProject

    // 2. Parse the identifier and find the issue
    const { fullIdentifier, number } = parseIssueIdentifier(
      params.identifier,
      params.project
    )

    // 3. Find the issue - try by full identifier first, then by number
    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      {
        space: project._id,
        identifier: fullIdentifier,
      }
    )

    // If not found by identifier and we have a number, try by number
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        {
          space: project._id,
          number,
        }
      )
    }

    if (issue === undefined) {
      return yield* new IssueNotFoundError({
        identifier: params.identifier,
        project: params.project,
      })
    }

    // 4. Check if label already exists on this issue
    const existingLabels = yield* client.findAll<TagReference>(
      tags.class.TagReference,
      {
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue,
      }
    )

    // Check if a label with same title already exists
    const labelTitle = params.label.trim()
    const labelExists = existingLabels.some(
      (l) => l.title.toLowerCase() === labelTitle.toLowerCase()
    )

    if (labelExists) {
      // Idempotent - label already attached
      return { identifier: issue.identifier, labelAdded: false }
    }

    // 5. Find or create the TagElement
    const color = params.color ?? 0

    // Look for existing TagElement with this title targeting Issue class
    let tagElement = yield* client.findOne<TagElement>(
      tags.class.TagElement,
      {
        title: labelTitle,
        targetClass: tracker.class.Issue as Ref<Class<Doc>>,
      }
    )

    if (tagElement === undefined) {
      // Create new TagElement
      const tagElementId: Ref<TagElement> = generateId()

      yield* client.createDoc(
        tags.class.TagElement,
        core.space.Workspace as Ref<Space>,
        {
          title: labelTitle,
          description: "",
          targetClass: tracker.class.Issue as Ref<Class<Doc>>,
          color,
          category: tracker.category.Other,
        } as never,
        tagElementId
      )

      // Fetch the created tag element
      tagElement = yield* client.findOne<TagElement>(
        tags.class.TagElement,
        { _id: tagElementId }
      )
    }

    if (tagElement === undefined) {
      // Shouldn't happen, but guard against it
      return { identifier: issue.identifier, labelAdded: false }
    }

    // 6. Attach the TagReference to the issue
    yield* client.addCollection(
      tags.class.TagReference,
      project._id,
      issue._id,
      tracker.class.Issue,
      "labels",
      {
        title: tagElement.title,
        color: tagElement.color,
        tag: tagElement._id,
      } as never
    )

    return { identifier: issue.identifier, labelAdded: true }
  })
