/**
 * Issue domain operations for Huly MCP server.
 *
 * Provides typed operations for querying issues from Huly platform.
 * Operations use HulyClient service and return typed domain objects.
 *
 * @module
 */
import type { Channel, Employee, Person } from "@hcengineering/contact"
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
import {
  type Component as HulyComponent,
  type Issue as HulyIssue,
  IssuePriority,
  type IssueTemplate as HulyIssueTemplate,
  type Project as HulyProject
} from "@hcengineering/tracker"
import { absurd, Effect } from "effect"

import type {
  AddLabelParams,
  Component,
  ComponentSummary,
  CreateComponentParams,
  CreateIssueFromTemplateParams,
  CreateIssueParams,
  CreateIssueTemplateParams,
  DeleteComponentParams,
  DeleteIssueParams,
  DeleteIssueTemplateParams,
  GetComponentParams,
  GetIssueParams,
  GetIssueTemplateParams,
  Issue,
  IssuePriority as IssuePriorityStr,
  IssueSummary,
  IssueTemplate,
  IssueTemplateSummary,
  ListComponentsParams,
  ListIssuesParams,
  ListIssueTemplatesParams,
  SetIssueComponentParams,
  UpdateComponentParams,
  UpdateIssueParams,
  UpdateIssueTemplateParams
} from "../../domain/schemas.js"
import type {
  AddLabelResult,
  CreateComponentResult,
  CreateIssueResult,
  CreateIssueTemplateResult,
  DeleteComponentResult,
  DeleteIssueResult,
  DeleteIssueTemplateResult,
  SetIssueComponentResult,
  UpdateComponentResult,
  UpdateIssueResult,
  UpdateIssueTemplateResult
} from "../../domain/schemas/issues.js"
import {
  ComponentId,
  ComponentLabel,
  Email,
  IssueId,
  IssueIdentifier,
  IssueTemplateId,
  NonNegativeNumber,
  PersonId,
  PersonName,
  StatusName
} from "../../domain/schemas/shared.js"
import { isExistent } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { ProjectNotFoundError } from "../errors.js"
import {
  ComponentNotFoundError,
  InvalidStatusError,
  IssueNotFoundError,
  IssueTemplateNotFoundError,
  PersonNotFoundError
} from "../errors.js"
import { escapeLikeWildcards, withLookup } from "./query-helpers.js"
import {
  findProject,
  findProjectAndIssue,
  findProjectWithStatuses,
  parseIssueIdentifier,
  type StatusInfo,
  toRef,
  zeroAsUnset
} from "./shared.js"

// Import plugin objects at runtime (CommonJS modules)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const tags = require("@hcengineering/tags").default as typeof import("@hcengineering/tags").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

type ListIssuesError =
  | HulyClientError
  | ProjectNotFoundError
  | InvalidStatusError
  | ComponentNotFoundError

type GetIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

type CreateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

type UpdateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

type AddLabelError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

type DeleteIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

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
      return "no-priority"
    default:
      absurd(priority)
      throw new Error("Invalid priority")
  }
}

const stringToPriority = (priority: IssuePriorityStr): IssuePriority => {
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

// SDK: updateDoc with retrieve=true returns TxResult which doesn't type the embedded object.
// The runtime value includes { object: { sequence: number } } for $inc operations.
const extractUpdatedSequence = (txResult: unknown): number | undefined =>
  (txResult as { object?: { sequence?: number } })?.object?.sequence

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
        { _id: toRef<Person>(channel.attachedTo) }
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
      {},
      { limit: 200 }
    )

    const lowerName = emailOrName.toLowerCase()
    const matchingPerson = allPersons.find(
      p => p.name.toLowerCase().includes(lowerName)
    )

    return matchingPerson
  })

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
 *
 * @param params - Delete issue parameters
 * @returns Deleted issue identifier and success flag
 * @throws ProjectNotFoundError if project doesn't exist
 * @throws IssueNotFoundError if issue doesn't exist
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

// --- Component Operations ---

type ListComponentsError =
  | HulyClientError
  | ProjectNotFoundError

type GetComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | ComponentNotFoundError

type CreateComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | PersonNotFoundError

type UpdateComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | ComponentNotFoundError
  | PersonNotFoundError

type SetIssueComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | ComponentNotFoundError

type DeleteComponentError =
  | HulyClientError
  | ProjectNotFoundError
  | ComponentNotFoundError

const findComponentByIdOrLabel = (
  client: HulyClient["Type"],
  projectId: Ref<HulyProject>,
  componentIdOrLabel: string
): Effect.Effect<HulyComponent | undefined, HulyClientError> =>
  Effect.gen(function*() {
    let component = yield* client.findOne<HulyComponent>(
      tracker.class.Component,
      {
        space: projectId,
        _id: toRef<HulyComponent>(componentIdOrLabel)
      }
    )

    if (component === undefined) {
      component = yield* client.findOne<HulyComponent>(
        tracker.class.Component,
        {
          space: projectId,
          label: componentIdOrLabel
        }
      )
    }

    return component
  })

const findProjectAndComponent = (
  params: { project: string; component: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; component: HulyComponent },
  ProjectNotFoundError | ComponentNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const component = yield* findComponentByIdOrLabel(client, project._id, params.component)

    if (component === undefined) {
      return yield* new ComponentNotFoundError({
        identifier: params.component,
        project: params.project
      })
    }

    return { client, project, component }
  })

export const listComponents = (
  params: ListComponentsParams
): Effect.Effect<Array<ComponentSummary>, ListComponentsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const limit = Math.min(params.limit ?? 50, 200)

    const components = yield* client.findAll<HulyComponent>(
      tracker.class.Component,
      { space: project._id },
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const leadIds = [
      ...new Set(
        components.map(c => c.lead).filter(isExistent)
      )
    ]

    const persons = leadIds.length > 0
      ? yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: leadIds } }
      )
      : []

    const personMap = new Map(persons.map(p => [p._id, p]))

    const summaries: Array<ComponentSummary> = components.map(c => {
      const leadName = c.lead !== null ? personMap.get(c.lead)?.name : undefined
      return {
        id: ComponentId.make(c._id),
        label: ComponentLabel.make(c.label),
        lead: leadName !== undefined ? PersonName.make(leadName) : undefined,
        modifiedOn: c.modifiedOn
      }
    })

    return summaries
  })

export const getComponent = (
  params: GetComponentParams
): Effect.Effect<Component, GetComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, component } = yield* findProjectAndComponent(params)

    let leadName: string | undefined
    if (component.lead !== null) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: component.lead }
      )
      if (person) {
        leadName = person.name
      }
    }

    const result: Component = {
      id: ComponentId.make(component._id),
      label: ComponentLabel.make(component.label),
      description: component.description,
      lead: leadName !== undefined ? PersonName.make(leadName) : undefined,
      project: params.project,
      modifiedOn: component.modifiedOn,
      createdOn: component.createdOn
    }

    return result
  })

export const createComponent = (
  params: CreateComponentParams
): Effect.Effect<CreateComponentResult, CreateComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const componentId: Ref<HulyComponent> = generateId()

    let leadRef: Ref<Employee> | null = null
    if (params.lead !== undefined) {
      const person = yield* findPersonByEmailOrName(client, params.lead)
      if (person === undefined) {
        return yield* new PersonNotFoundError({ identifier: params.lead })
      }
      // Huly API: Component.lead expects Ref<Employee>, but we look up Person by email.
      // Employee extends Person, so this is safe when person is actually an employee.
      leadRef = toRef<Employee>(person._id)
    }

    const componentData: Data<HulyComponent> = {
      label: params.label,
      description: params.description ?? "",
      lead: leadRef,
      comments: 0
    }

    yield* client.createDoc(
      tracker.class.Component,
      project._id,
      componentData,
      componentId
    )

    return { id: ComponentId.make(componentId), label: ComponentLabel.make(params.label) }
  })

export const updateComponent = (
  params: UpdateComponentParams
): Effect.Effect<UpdateComponentResult, UpdateComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, component, project } = yield* findProjectAndComponent(params)

    const updateOps: DocumentUpdate<HulyComponent> = {}

    if (params.label !== undefined) {
      updateOps.label = params.label
    }

    if (params.description !== undefined) {
      updateOps.description = params.description
    }

    if (params.lead !== undefined) {
      if (params.lead === null) {
        updateOps.lead = null
      } else {
        const person = yield* findPersonByEmailOrName(client, params.lead)
        if (person === undefined) {
          return yield* new PersonNotFoundError({ identifier: params.lead })
        }
        // Huly API: Component.lead expects Ref<Employee>, but we look up Person by email.
        // Employee extends Person, so this is safe when person is actually an employee.
        updateOps.lead = toRef<Employee>(person._id)
      }
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: ComponentId.make(component._id), updated: false }
    }

    yield* client.updateDoc(
      tracker.class.Component,
      project._id,
      component._id,
      updateOps
    )

    return { id: ComponentId.make(component._id), updated: true }
  })

export const setIssueComponent = (
  params: SetIssueComponentParams
): Effect.Effect<SetIssueComponentResult, SetIssueComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    let componentRef: Ref<HulyComponent> | null = null

    if (params.component !== null) {
      const component = yield* findComponentByIdOrLabel(client, project._id, params.component)

      if (component === undefined) {
        return yield* new ComponentNotFoundError({
          identifier: params.component,
          project: params.project
        })
      }

      componentRef = component._id
    }

    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      { component: componentRef }
    )

    return { identifier: IssueIdentifier.make(issue.identifier), componentSet: true }
  })

export const deleteComponent = (
  params: DeleteComponentParams
): Effect.Effect<DeleteComponentResult, DeleteComponentError, HulyClient> =>
  Effect.gen(function*() {
    const { client, component, project } = yield* findProjectAndComponent(params)

    yield* client.removeDoc(
      tracker.class.Component,
      project._id,
      component._id
    )

    return { id: ComponentId.make(component._id), deleted: true }
  })

// --- Issue Template Operations ---

type ListIssueTemplatesError =
  | HulyClientError
  | ProjectNotFoundError

type GetIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError

type CreateIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | PersonNotFoundError
  | ComponentNotFoundError

type CreateIssueFromTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

type UpdateIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError
  | PersonNotFoundError
  | ComponentNotFoundError

type DeleteIssueTemplateError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueTemplateNotFoundError

const findTemplateByIdOrTitle = (
  client: HulyClient["Type"],
  projectId: Ref<HulyProject>,
  templateIdOrTitle: string
): Effect.Effect<HulyIssueTemplate | undefined, HulyClientError> =>
  Effect.gen(function*() {
    let template = yield* client.findOne<HulyIssueTemplate>(
      tracker.class.IssueTemplate,
      {
        space: projectId,
        _id: toRef<HulyIssueTemplate>(templateIdOrTitle)
      }
    )

    if (template === undefined) {
      template = yield* client.findOne<HulyIssueTemplate>(
        tracker.class.IssueTemplate,
        {
          space: projectId,
          title: templateIdOrTitle
        }
      )
    }

    return template
  })

const findProjectAndTemplate = (
  params: { project: string; template: string }
): Effect.Effect<
  { client: HulyClient["Type"]; project: HulyProject; template: HulyIssueTemplate },
  ProjectNotFoundError | IssueTemplateNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const template = yield* findTemplateByIdOrTitle(client, project._id, params.template)

    if (template === undefined) {
      return yield* new IssueTemplateNotFoundError({
        identifier: params.template,
        project: params.project
      })
    }

    return { client, project, template }
  })

export const listIssueTemplates = (
  params: ListIssueTemplatesParams
): Effect.Effect<Array<IssueTemplateSummary>, ListIssueTemplatesError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const limit = Math.min(params.limit ?? 50, 200)

    const templates = yield* client.findAll<HulyIssueTemplate>(
      tracker.class.IssueTemplate,
      { space: project._id },
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    const summaries: Array<IssueTemplateSummary> = templates.map(t => ({
      id: IssueTemplateId.make(t._id),
      title: t.title,
      priority: priorityToString(t.priority),
      modifiedOn: t.modifiedOn
    }))

    return summaries
  })

export const getIssueTemplate = (
  params: GetIssueTemplateParams
): Effect.Effect<IssueTemplate, GetIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, template } = yield* findProjectAndTemplate(params)

    let assigneeName: string | undefined
    if (template.assignee !== null) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: template.assignee }
      )
      if (person) {
        assigneeName = person.name
      }
    }

    let componentLabel: string | undefined
    if (template.component !== null) {
      const component = yield* client.findOne<HulyComponent>(
        tracker.class.Component,
        { _id: template.component }
      )
      if (component) {
        componentLabel = component.label
      }
    }

    const result: IssueTemplate = {
      id: IssueTemplateId.make(template._id),
      title: template.title,
      description: template.description,
      priority: priorityToString(template.priority),
      assignee: assigneeName !== undefined ? PersonName.make(assigneeName) : undefined,
      component: componentLabel !== undefined ? ComponentLabel.make(componentLabel) : undefined,
      estimation: zeroAsUnset(NonNegativeNumber.make(template.estimation)),
      project: params.project,
      modifiedOn: template.modifiedOn,
      createdOn: template.createdOn
    }

    return result
  })

export const createIssueTemplate = (
  params: CreateIssueTemplateParams
): Effect.Effect<CreateIssueTemplateResult, CreateIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project } = yield* findProject(params.project)

    const templateId: Ref<HulyIssueTemplate> = generateId()

    let assigneeRef: Ref<Person> | null = null
    if (params.assignee !== undefined) {
      const person = yield* findPersonByEmailOrName(client, params.assignee)
      if (person === undefined) {
        return yield* new PersonNotFoundError({ identifier: params.assignee })
      }
      assigneeRef = person._id
    }

    let componentRef: Ref<HulyComponent> | null = null
    if (params.component !== undefined) {
      const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
      if (component === undefined) {
        return yield* new ComponentNotFoundError({
          identifier: params.component,
          project: params.project
        })
      }
      componentRef = component._id
    }

    const priority = stringToPriority(params.priority || "no-priority")

    const templateData: Data<HulyIssueTemplate> = {
      title: params.title,
      description: params.description ?? "",
      priority,
      assignee: assigneeRef,
      component: componentRef,
      estimation: params.estimation ?? 0,
      children: [],
      comments: 0
    }

    yield* client.createDoc(
      tracker.class.IssueTemplate,
      project._id,
      templateData,
      templateId
    )

    return { id: IssueTemplateId.make(templateId), title: params.title }
  })

export const createIssueFromTemplate = (
  params: CreateIssueFromTemplateParams
): Effect.Effect<CreateIssueResult, CreateIssueFromTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    const title = params.title ?? template.title
    const description = params.description ?? template.description
    const priority = params.priority ?? priorityToString(template.priority)

    let assignee = params.assignee
    if (assignee === undefined && template.assignee !== null) {
      const person = yield* client.findOne<Person>(
        contact.class.Person,
        { _id: template.assignee }
      )
      if (person) {
        const emailCh = yield* client.findOne<Channel>(
          contact.class.Channel,
          {
            attachedTo: person._id,
            provider: contact.channelProvider.Email
          }
        )
        // Fall back to name for findPersonByEmailOrName lookup
        assignee = Email.make(emailCh?.value ?? person.name)
      }
    }

    const issueParams: CreateIssueParams = {
      project: params.project,
      title,
      description,
      priority,
      assignee,
      status: params.status
    }

    const result = yield* createIssue(issueParams)

    if (template.component !== null) {
      yield* client.updateDoc(
        tracker.class.Issue,
        project._id,
        toRef<HulyIssue>(result.issueId),
        { component: template.component }
      )
    }

    return result
  })

export const updateIssueTemplate = (
  params: UpdateIssueTemplateParams
): Effect.Effect<UpdateIssueTemplateResult, UpdateIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    const updateOps: DocumentUpdate<HulyIssueTemplate> = {}

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.description !== undefined) {
      updateOps.description = params.description
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

    if (params.component !== undefined) {
      if (params.component === null) {
        updateOps.component = null
      } else {
        const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
        if (component === undefined) {
          return yield* new ComponentNotFoundError({
            identifier: params.component,
            project: params.project
          })
        }
        updateOps.component = component._id
      }
    }

    if (params.estimation !== undefined) {
      updateOps.estimation = params.estimation
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: IssueTemplateId.make(template._id), updated: false }
    }

    yield* client.updateDoc(
      tracker.class.IssueTemplate,
      project._id,
      template._id,
      updateOps
    )

    return { id: IssueTemplateId.make(template._id), updated: true }
  })

export const deleteIssueTemplate = (
  params: DeleteIssueTemplateParams
): Effect.Effect<DeleteIssueTemplateResult, DeleteIssueTemplateError, HulyClient> =>
  Effect.gen(function*() {
    const { client, project, template } = yield* findProjectAndTemplate(params)

    yield* client.removeDoc(
      tracker.class.IssueTemplate,
      project._id,
      template._id
    )

    return { id: IssueTemplateId.make(template._id), deleted: true }
  })
