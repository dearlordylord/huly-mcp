/* eslint-disable max-lines -- issue CRUD + search + labels + description handling form a single domain */
/**
 * Issue domain operations for Huly MCP server.
 *
 * Provides typed operations for querying issues from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Person } from "@hcengineering/contact"
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
  type WithLookup
} from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import type { TagElement, TagReference } from "@hcengineering/tags"
import { type Issue as HulyIssue, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  AddLabelParams,
  CreateIssueParams,
  DeleteIssueParams,
  GetIssueParams,
  Issue,
  IssueSummary,
  ListIssuesParams,
  UpdateIssueParams
} from "../../domain/schemas.js"
import type {
  AddLabelResult,
  CreateIssueResult,
  DeleteIssueResult,
  UpdateIssueResult
} from "../../domain/schemas/issues.js"
import {
  IssueId,
  IssueIdentifier,
  NonNegativeNumber,
  PersonId,
  PersonName,
  StatusName
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ComponentNotFoundError, ProjectNotFoundError } from "../errors.js"
import { InvalidStatusError, IssueNotFoundError, PersonNotFoundError } from "../errors.js"
import { findComponentByIdOrLabel } from "./components.js"
import { escapeLikeWildcards, withLookup } from "./query-helpers.js"
import {
  findPersonByEmailOrName,
  findProject,
  findProjectAndIssue,
  findProjectWithStatuses,
  parseIssueIdentifier,
  priorityToString,
  type StatusInfo,
  stringToPriority,
  toRef,
  zeroAsUnset
} from "./shared.js"

// Re-export operations split into focused modules
export {
  createComponent,
  deleteComponent,
  getComponent,
  listComponents,
  setIssueComponent,
  updateComponent
} from "./components.js"
export {
  createIssueFromTemplate,
  createIssueTemplate,
  deleteIssueTemplate,
  getIssueTemplate,
  listIssueTemplates,
  updateIssueTemplate
} from "./issue-templates.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tags = require("@hcengineering/tags").default as typeof import("@hcengineering/tags").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

export type ListIssuesError =
  | HulyClientError
  | ProjectNotFoundError
  | InvalidStatusError
  | ComponentNotFoundError

export type GetIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

export type CreateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

export type UpdateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

export type AddLabelError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

export type DeleteIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

// SDK: updateDoc with retrieve=true returns TxResult which doesn't type the embedded object.
// The runtime value includes { object: { sequence: number } } for $inc operations.
const extractUpdatedSequence = (txResult: unknown): number | undefined =>
  (txResult as { object?: { sequence?: number } })?.object?.sequence

export type { AddLabelResult, CreateIssueResult, DeleteIssueResult, UpdateIssueResult }

// --- Operations ---

/**
 * List issues with filters.
 * Results sorted by modifiedOn descending.
 */
export const listIssues = (
  params: ListIssuesParams
): Effect.Effect<Array<IssueSummary>, ListIssuesError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, statuses } = yield* findProjectWithStatuses(params.project)

    const query: Record<string, unknown> = {
      space: project._id
    }

    if (params.status !== undefined) {
      const statusFilter = params.status.toLowerCase()

      if (statusFilter === "open") {
        const doneAndCanceledStatuses = statuses
          .filter(s => s.isDone || s.isCanceled)
          .map(s => s._id)

        if (doneAndCanceledStatuses.length > 0) {
          query.status = { $nin: doneAndCanceledStatuses }
        }
      } else if (statusFilter === "done") {
        const doneStatuses = statuses
          .filter(s => s.isDone)
          .map(s => s._id)

        if (doneStatuses.length > 0) {
          query.status = { $in: doneStatuses }
        } else {
          return []
        }
      } else if (statusFilter === "canceled") {
        const canceledStatuses = statuses
          .filter(s => s.isCanceled)
          .map(s => s._id)

        if (canceledStatuses.length > 0) {
          query.status = { $in: canceledStatuses }
        } else {
          return []
        }
      } else {
        const matchingStatus = statuses.find(
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

    // Apply title search using $like operator
    if (params.titleSearch !== undefined && params.titleSearch.trim() !== "") {
      query.title = { $like: `%${escapeLikeWildcards(params.titleSearch)}%` }
    }

    if (params.descriptionSearch !== undefined && params.descriptionSearch.trim() !== "") {
      query.$search = params.descriptionSearch
    }

    if (params.component !== undefined) {
      const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
      if (component !== undefined) {
        query.component = component._id
      } else {
        return []
      }
    }

    const limit = Math.min(params.limit ?? 50, 200)

    type IssueWithLookup = WithLookup<HulyIssue> & {
      $lookup?: { assignee?: Person }
    }

    const issues = yield* client.findAll<IssueWithLookup>(
      tracker.class.Issue,
      query,
      withLookup<IssueWithLookup>(
        {
          limit,
          sort: {
            modifiedOn: SortingOrder.Descending
          }
        },
        { assignee: contact.class.Person }
      )
    )

    const summaries: Array<IssueSummary> = issues.map(issue => {
      const statusDoc = statuses.find(s => s._id === issue.status)
      const statusName = statusDoc?.name ?? "Unknown"
      const assigneeName = issue.$lookup?.assignee?.name

      return {
        identifier: IssueIdentifier.make(issue.identifier),
        title: issue.title,
        status: StatusName.make(statusName),
        priority: priorityToString(issue.priority),
        assignee: assigneeName !== undefined ? PersonName.make(assigneeName) : undefined,
        modifiedOn: issue.modifiedOn
      }
    })

    return summaries
  })

/**
 * Get a single issue with full details.
 *
 * Looks up issue by identifier (e.g., "HULY-123" or just 123).
 * Returns full issue including:
 * - Description rendered as markdown
 * - Assignee name (not just ID)
 * - Status name
 * - All metadata
 */
export const getIssue = (
  params: GetIssueParams
): Effect.Effect<Issue, GetIssueError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, statuses } = yield* findProjectWithStatuses(params.project)

    const { fullIdentifier, number } = parseIssueIdentifier(params.identifier, params.project)

    let issue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      { space: project._id, identifier: fullIdentifier }
    )
    if (issue === undefined && number !== null) {
      issue = yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        { space: project._id, number }
      )
    }
    if (issue === undefined) {
      return yield* new IssueNotFoundError({ identifier: params.identifier, project: params.project })
    }

    const statusDoc = statuses.find(s => s._id === issue.status)
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
          id: PersonId.make(person._id),
          name: PersonName.make(person.name)
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
      identifier: IssueIdentifier.make(issue.identifier),
      title: issue.title,
      description,
      status: StatusName.make(statusName),
      priority: priorityToString(issue.priority),
      assignee: assigneeName !== undefined ? PersonName.make(assigneeName) : undefined,
      assigneeRef,
      project: params.project,
      modifiedOn: issue.modifiedOn,
      createdOn: issue.createdOn,
      dueDate: issue.dueDate ?? undefined,
      estimation: zeroAsUnset(NonNegativeNumber.make(issue.estimation))
    }

    return result
  })

// --- Create Issue Operation ---

/**
 * Create a new issue in a project.
 *
 * Creates issue with:
 * - Title (required)
 * - Description (optional, markdown supported)
 * - Priority (optional, defaults to no-priority)
 * - Status (optional, uses project default)
 * - Assignee (optional, by email or name)
 */
export const createIssue = (
  params: CreateIssueParams
): Effect.Effect<CreateIssueResult, CreateIssueError, HulyClient> =>
  Effect.gen(function*() {
    const result = params.status !== undefined
      ? yield* findProjectWithStatuses(params.project)
      : yield* Effect.map(findProject(params.project), ({ client, project }) => ({
        client,
        project,
        statuses: []
      }))

    const { client, project, statuses } = result

    const issueId: Ref<HulyIssue> = generateId()

    const incOps: DocumentUpdate<HulyProject> = { $inc: { sequence: 1 } }
    const incResult = yield* client.updateDoc(
      tracker.class.Project,
      toRef<Space>("core:space:Space"),
      project._id,
      incOps,
      true
    )
    const sequence = extractUpdatedSequence(incResult) ?? project.sequence + 1

    let statusRef: Ref<Status> = project.defaultIssueStatus
    if (params.status !== undefined) {
      const statusFilter = params.status.toLowerCase()
      const matchingStatus = statuses.find(
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

    const priority = stringToPriority(params.priority || "no-priority")
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

    return { identifier: IssueIdentifier.make(identifier), issueId: IssueId.make(issueId) }
  })

// --- Update Issue Operation ---

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
 * Note: Huly REST API is eventually consistent. Reads immediately after
 * updates may return stale data. Allow ~2 seconds for propagation.
 */
export const updateIssue = (
  params: UpdateIssueParams
): Effect.Effect<UpdateIssueResult, UpdateIssueError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    let statuses: Array<StatusInfo> = []
    if (params.status !== undefined) {
      const result = yield* findProjectWithStatuses(params.project)
      statuses = result.statuses
    }

    const updateOps: DocumentUpdate<HulyIssue> = {}
    let descriptionUpdatedInPlace = false

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.description !== undefined) {
      if (params.description.trim() === "") {
        updateOps.description = null
      } else if (issue.description) {
        // Issue already has description - update in place
        yield* client.updateMarkup(
          tracker.class.Issue,
          issue._id,
          "description",
          params.description,
          "markdown"
        )
        descriptionUpdatedInPlace = true
      } else {
        // Issue has no description yet - create new
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
      const statusFilter = params.status.toLowerCase()
      const matchingStatus = statuses.find(
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

    if (Object.keys(updateOps).length === 0 && !descriptionUpdatedInPlace) {
      return { identifier: IssueIdentifier.make(issue.identifier), updated: false }
    }

    if (Object.keys(updateOps).length > 0) {
      yield* client.updateDoc(
        tracker.class.Issue,
        project._id,
        issue._id,
        updateOps
      )
    }

    return { identifier: IssueIdentifier.make(issue.identifier), updated: true }
  })

// --- Add Label Operation ---

/**
 * Add a label/tag to an issue.
 *
 * Creates the tag in the project if it doesn't exist,
 * then attaches it to the issue via TagReference.
 *
 * Idempotent: adding the same label twice is a no-op.
 */
export const addLabel = (
  params: AddLabelParams
): Effect.Effect<AddLabelResult, AddLabelError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

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
      return { identifier: IssueIdentifier.make(issue.identifier), labelAdded: false }
    }

    const color = params.color ?? 0

    let tagElement = yield* client.findOne<TagElement>(
      tags.class.TagElement,
      {
        title: labelTitle,
        targetClass: toRef<Class<Doc>>(tracker.class.Issue)
      }
    )

    if (tagElement === undefined) {
      const tagElementId: Ref<TagElement> = generateId()
      const tagElementData: Data<TagElement> = {
        title: labelTitle,
        description: "",
        targetClass: toRef<Class<Doc>>(tracker.class.Issue),
        color,
        category: tracker.category.Other
      }
      yield* client.createDoc(
        tags.class.TagElement,
        toRef<Space>(core.space.Workspace),
        tagElementData,
        tagElementId
      )
      tagElement = yield* client.findOne<TagElement>(
        tags.class.TagElement,
        { _id: tagElementId }
      )
    }

    if (tagElement === undefined) {
      return { identifier: IssueIdentifier.make(issue.identifier), labelAdded: false }
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

    return { identifier: IssueIdentifier.make(issue.identifier), labelAdded: true }
  })

// --- Delete Issue Operation ---

/**
 * Delete an issue from a project.
 *
 * Permanently removes the issue. This operation cannot be undone.
 */
export const deleteIssue = (
  params: DeleteIssueParams
): Effect.Effect<DeleteIssueResult, DeleteIssueError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    yield* client.removeDoc(
      tracker.class.Issue,
      project._id,
      issue._id
    )

    return { identifier: IssueIdentifier.make(issue.identifier), deleted: true }
  })
