/**
 * Issue read operations: list and get.
 *
 * @module
 */
import type { Person, SocialIdentity } from "@hcengineering/contact"
import { type Ref, SortingOrder, type Status, type WithLookup } from "@hcengineering/core"
import { type Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type {
  GetIssueParams,
  Issue,
  IssueStatusCategoryFilter,
  IssueSummary,
  ListIssuesParams
} from "../../domain/schemas.js"
import { IssueSummarySchema, parseIssue } from "../../domain/schemas/issues.js"
import { IssueId, type ProjectIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  ComponentNotFoundError,
  InvalidStatusError,
  MilestoneIdentifierAmbiguousError,
  MilestoneNotFoundError,
  PersonIdentifierAmbiguousError,
  ProjectNotFoundError
} from "../errors.js"
import { HulyDataInvalidError, IssueNotFoundError } from "../errors.js"
import { contact, tracker } from "../huly-plugins.js"
import { findComponentByIdOrLabel } from "./components.js"
import { findPersonByIdOrExactEmailOrName } from "./contacts-shared.js"
import { findIssueAssignee } from "./issue-assignee-resolution.js"
import { creatorForIssue, loadIssueCreatorIndex } from "./issue-creators-read.js"
import { issueIdsMatchingLabel, labelsForIssue, loadIssueLabelIndex } from "./issue-labels-read.js"
import { loadIssueMilestoneIndex, milestoneForIssue } from "./issue-milestones-read.js"
import { topLevelIssueParent } from "./issues-parent.js"
import {
  findIssueInProject,
  findProjectWithStatuses,
  parseIssueIdentifier,
  priorityToString,
  resolveStatusByName,
  type WorkflowStatus
} from "./issues-shared.js"
import { resolveIssueFilterMilestone } from "./milestone-resolution.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery, withLookup } from "./query-helpers.js"

type ListIssuesError =
  | HulyClientError
  | HulyDataInvalidError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | ComponentNotFoundError
  | MilestoneNotFoundError
  | MilestoneIdentifierAmbiguousError
  | PersonIdentifierAmbiguousError

type GetIssueError = HulyClientError | HulyDataInvalidError | ProjectNotFoundError | IssueNotFoundError

type IssueWithLookup = WithLookup<HulyIssue> & { $lookup?: { assignee?: Person } }

const resolveStatusName = (statuses: ReadonlyArray<WorkflowStatus>, statusId: Ref<Status>): string => {
  const statusDoc = statuses.find((s) => s._id === statusId)
  return statusDoc?.name ?? "Unknown"
}

const hasUnknownStatusCategory = (statuses: ReadonlyArray<WorkflowStatus>): boolean =>
  statuses.some((status) => status.category === "unknown")

const requireKnownStatusCategories = (
  statuses: ReadonlyArray<WorkflowStatus>,
  category: IssueStatusCategoryFilter,
  project: ProjectIdentifier
): Effect.Effect<void, HulyDataInvalidError> =>
  hasUnknownStatusCategory(statuses)
    ? Effect.fail(
        new HulyDataInvalidError({
          operation: "listIssues",
          entity: `status category metadata for project '${project}' and category '${category}'`
        })
      )
    : Effect.void

const statusIdsByCategory = (
  statuses: ReadonlyArray<WorkflowStatus>,
  category: IssueStatusCategoryFilter
): Array<Ref<Status>> => statuses.filter((status) => status.category === category).map((status) => status._id)

const applyStatusAndAssigneeFilters = (
  client: HulyClient["Service"],
  query: StrictDocumentQuery<IssueWithLookup>,
  statuses: ReadonlyArray<WorkflowStatus>,
  params: ListIssuesParams
): Effect.Effect<boolean, ListIssuesError> =>
  Effect.gen(function* () {
    if (params.statusCategory !== undefined) {
      yield* requireKnownStatusCategories(statuses, params.statusCategory, params.project)
      const matchingStatuses = statusIdsByCategory(statuses, params.statusCategory)
      if (matchingStatuses.length === 0) return false
      query.status = { $in: matchingStatuses }
    }
    if (params.status !== undefined) {
      query.status = yield* resolveStatusByName([...statuses], params.status, params.project)
    }
    if (params.assignee !== undefined) {
      const assigneePerson = yield* findIssueAssignee(client, params.assignee)
      if (assigneePerson === undefined) return false
      query.assignee = assigneePerson._id
    }
    return true
  })

const applyCreatorFilter = (
  client: HulyClient["Service"],
  query: StrictDocumentQuery<IssueWithLookup>,
  creatorIdentifier: ListIssuesParams["creator"]
): Effect.Effect<boolean, ListIssuesError> =>
  Effect.gen(function* () {
    if (creatorIdentifier === undefined) return true
    const creator = yield* findPersonByIdOrExactEmailOrName(client, creatorIdentifier)
    if (creator === undefined) return false
    const identities = yield* client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ attachedTo: creator._id })
    )
    if (identities.length === 0) return false
    query.createdBy = { $in: identities.map((identity) => identity._id) }
    return true
  })

const applyIssueTextFilters = (query: StrictDocumentQuery<IssueWithLookup>, params: ListIssuesParams): void => {
  if (params.titleSearch !== undefined && params.titleSearch.trim() !== "") {
    query.title = { $like: `%${escapeLikeWildcards(params.titleSearch)}%` }
  }
  if (params.titleRegex !== undefined && params.titleRegex.trim() !== "") {
    query.title = { $regex: params.titleRegex }
  }
  if (params.descriptionSearch !== undefined && params.descriptionSearch.trim() !== "") {
    query.$search = params.descriptionSearch
  }
}

const applyIssuePresenceFilters = (query: StrictDocumentQuery<IssueWithLookup>, params: ListIssuesParams): void => {
  if (params.hasAssignee === true) query.assignee = { $ne: null }
  else if (params.hasAssignee === false) query.assignee = null
  if (params.hasDueDate === true) query.dueDate = { $ne: null }
  else if (params.hasDueDate === false) query.dueDate = null
  if (params.hasComponent === true) query.component = { $ne: null }
  else if (params.hasComponent === false) query.component = null
}

const applyIssueScopeFilters = (
  client: HulyClient["Service"],
  query: StrictDocumentQuery<IssueWithLookup>,
  project: ProjectWorkflowData["project"],
  params: ListIssuesParams
): Effect.Effect<boolean, ListIssuesError> =>
  Effect.gen(function* () {
    if (params.parentIssue !== undefined) {
      query.attachedTo = (yield* findIssueInProject(client, project, params.parentIssue))._id
    }
    if (params.component !== undefined) {
      const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
      if (component === undefined) return false
      query.component = component._id
    }
    if (params.isTopLevel === true) query.attachedTo = topLevelIssueParent().attachedTo
    return true
  })

const applyIssueMilestoneFilter = (
  client: HulyClient["Service"],
  query: StrictDocumentQuery<IssueWithLookup>,
  project: ProjectWorkflowData["project"],
  params: ListIssuesParams
): Effect.Effect<void, ListIssuesError> =>
  Effect.gen(function* () {
    if (params.milestone !== undefined) {
      query.milestone = (yield* resolveIssueFilterMilestone(client, project, params.milestone, params.project))._id
    } else if (params.hasMilestone === true) query.milestone = { $ne: null }
    else if (params.hasMilestone === false) query.milestone = null
  })

type ProjectWorkflowData = Effect.Success<ReturnType<typeof findProjectWithStatuses>>

const applyIssueQueryFilters = (
  client: HulyClient["Service"],
  query: StrictDocumentQuery<IssueWithLookup>,
  project: ProjectWorkflowData["project"],
  statuses: ReadonlyArray<WorkflowStatus>,
  params: ListIssuesParams
): Effect.Effect<boolean, ListIssuesError> =>
  Effect.gen(function* () {
    if (!(yield* applyStatusAndAssigneeFilters(client, query, statuses, params))) return false
    if (!(yield* applyCreatorFilter(client, query, params.creator))) return false
    applyIssueTextFilters(query, params)
    applyIssuePresenceFilters(query, params)
    if (!(yield* applyIssueScopeFilters(client, query, project, params))) return false
    yield* applyIssueMilestoneFilter(client, query, project, params)
    return true
  })

const issueSummaryProjection = (
  issue: IssueWithLookup,
  statuses: ReadonlyArray<WorkflowStatus>,
  labelIndex: Effect.Success<ReturnType<typeof loadIssueLabelIndex>>,
  milestoneIndex: Effect.Success<ReturnType<typeof loadIssueMilestoneIndex>>,
  creatorIndex: Effect.Success<ReturnType<typeof loadIssueCreatorIndex>>
) => {
  const directParent = issue.parents.length > 0 ? issue.parents[issue.parents.length - 1] : undefined
  const milestone = milestoneForIssue(milestoneIndex, issue)
  const creator = creatorForIssue(creatorIndex, issue)
  return {
    issueId: IssueId.make(issue._id),
    identifier: issue.identifier,
    title: issue.title,
    status: resolveStatusName(statuses, issue.status),
    priority: priorityToString(issue.priority),
    assignee: issue.$lookup?.assignee?.name,
    ...(creator === undefined ? {} : { creator }),
    parentIssue: directParent?.identifier,
    subIssues: issue.subIssues > 0 ? issue.subIssues : undefined,
    labels: labelsForIssue(labelIndex, issue._id),
    ...(milestone === undefined ? {} : { milestone }),
    modifiedOn: issue.modifiedOn
  }
}

const findIssueForRead = (
  client: HulyClient["Service"],
  project: ProjectWorkflowData["project"],
  params: GetIssueParams
): Effect.Effect<HulyIssue, HulyClientError | IssueNotFoundError> =>
  Effect.gen(function* () {
    const { fullIdentifier, number } = parseIssueIdentifier(params.identifier, params.project)
    const byIdentifier = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ space: project._id, identifier: fullIdentifier })
    )
    const issue =
      byIdentifier ??
      (number === null
        ? undefined
        : yield* client.findOne<HulyIssue>(tracker.class.Issue, hulyQuery<HulyIssue>({ space: project._id, number })))
    if (issue === undefined) {
      return yield* new IssueNotFoundError({ identifier: params.identifier, project: params.project })
    }
    return issue
  })

const loadIssueAssignee = (
  client: HulyClient["Service"],
  issue: HulyIssue
): Effect.Effect<Person | undefined, HulyClientError> =>
  issue.assignee === null
    ? Effect.succeed(undefined)
    : client.findOne<Person>(contact.class.Person, hulyQuery<Person>({ _id: issue.assignee }))

const loadIssueDescription = (
  client: HulyClient["Service"],
  issue: HulyIssue
): Effect.Effect<string | undefined, HulyClientError> =>
  issue.description
    ? client.fetchMarkup(issue._class, issue._id, "description", issue.description, "markdown")
    : Effect.succeed(undefined)

const issueDetailRelationshipFields = (
  issue: HulyIssue,
  person: Person | undefined,
  milestone: ReturnType<typeof milestoneForIssue>,
  creator: ReturnType<typeof creatorForIssue>
) => {
  const directParent = issue.parents.length > 0 ? issue.parents[issue.parents.length - 1] : undefined
  return {
    assigneeRef: person ? { id: person._id, name: person.name } : undefined,
    ...(creator === undefined ? {} : { creator }),
    ...(milestone === undefined ? {} : { milestone }),
    parentIssue: directParent?.identifier
  }
}

const issueDetailMetricFields = (issue: HulyIssue) => ({
  subIssues: issue.subIssues > 0 ? issue.subIssues : undefined,
  dueDate: issue.dueDate ?? undefined,
  estimation: issue.estimation > 0 ? issue.estimation : undefined
})

const issueDetailProjection = (
  issue: HulyIssue,
  params: GetIssueParams,
  statusName: string,
  person: Person | undefined,
  description: string | undefined,
  labels: ReturnType<typeof labelsForIssue>,
  milestone: ReturnType<typeof milestoneForIssue>,
  creator: ReturnType<typeof creatorForIssue>
) => {
  return {
    issueId: IssueId.make(issue._id),
    identifier: issue.identifier,
    title: issue.title,
    description,
    status: statusName,
    priority: priorityToString(issue.priority),
    assignee: person?.name,
    ...issueDetailRelationshipFields(issue, person, milestone, creator),
    labels,
    project: params.project,
    ...issueDetailMetricFields(issue),
    modifiedOn: issue.modifiedOn,
    createdOn: issue.createdOn
  }
}

/**
 * List issues with filters.
 * Results sorted by modifiedOn descending.
 */
export const listIssues = (
  params: ListIssuesParams
): Effect.Effect<Array<IssueSummary>, ListIssuesError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, project, statuses } = yield* findProjectWithStatuses(params.project)

    const query: StrictDocumentQuery<IssueWithLookup> = { space: project._id }

    if (!(yield* applyIssueQueryFilters(client, query, project, statuses, params))) return []

    const labelFilter = params.label
    const labelFilterContext =
      labelFilter === undefined
        ? undefined
        : { index: yield* loadIssueLabelIndex(client, project._id), label: labelFilter }
    const matchingIssueIds =
      labelFilterContext === undefined
        ? undefined
        : issueIdsMatchingLabel(labelFilterContext.index, labelFilterContext.label)
    if (matchingIssueIds?.length === 0) return []
    const effectiveQuery: StrictDocumentQuery<IssueWithLookup> =
      matchingIssueIds === undefined ? query : { ...query, _id: { $in: matchingIssueIds } }

    const limit = clampLimit(params.limit)

    const issues = yield* client.findAll<IssueWithLookup>(
      tracker.class.Issue,
      hulyQuery(effectiveQuery),
      withLookup<IssueWithLookup>(
        { limit, sort: { modifiedOn: SortingOrder.Descending } },
        { assignee: contact.class.Person }
      )
    )

    const labelIndex =
      labelFilterContext === undefined
        ? yield* loadIssueLabelIndex(
            client,
            project._id,
            issues.map((issue) => issue._id)
          )
        : labelFilterContext.index
    const milestoneIndex = yield* loadIssueMilestoneIndex(client, project, issues)
    const creatorIndex = yield* loadIssueCreatorIndex(client, issues)
    const rawSummaries = issues.map((issue) =>
      issueSummaryProjection(issue, statuses, labelIndex, milestoneIndex, creatorIndex)
    )

    // Spread: Schema decoding returns a readonly array; return type requires mutable
    const parseIssueSummaries = Schema.decodeUnknownEffect(Schema.Array(IssueSummarySchema))
    const validated = yield* parseIssueSummaries(rawSummaries).pipe(
      Effect.mapError(
        (parseError) => new HulyDataInvalidError({ operation: "listIssues", entity: "issue", cause: parseError })
      )
    )

    return [...validated]
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
export const getIssue = (params: GetIssueParams): Effect.Effect<Issue, GetIssueError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, project, statuses } = yield* findProjectWithStatuses(params.project)

    const issue = yield* findIssueForRead(client, project, params)
    const statusName = resolveStatusName(statuses, issue.status)
    const person = yield* loadIssueAssignee(client, issue)
    const description = yield* loadIssueDescription(client, issue)

    const labelIndex = yield* loadIssueLabelIndex(client, project._id, [issue._id])
    const milestoneIndex = yield* loadIssueMilestoneIndex(client, project, [issue])
    const creatorIndex = yield* loadIssueCreatorIndex(client, [issue])
    const milestone = milestoneForIssue(milestoneIndex, issue)
    const creator = creatorForIssue(creatorIndex, issue)

    const projected = issueDetailProjection(
      issue,
      params,
      statusName,
      person,
      description,
      labelsForIssue(labelIndex, issue._id),
      milestone,
      creator
    )
    return yield* parseIssue(projected).pipe(
      Effect.mapError(
        (parseError) => new HulyDataInvalidError({ operation: "getIssue", entity: "issue", cause: parseError })
      )
    )
  })
