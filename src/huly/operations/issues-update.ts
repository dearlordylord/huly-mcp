import type { DocumentUpdate } from "@hcengineering/core"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { UpdateIssueParams } from "../../domain/schemas.js"
import type { UpdateIssueResult } from "../../domain/schemas/issues.js"
import { UPDATE_ISSUE_FIELDS } from "../../domain/schemas/issues.js"
import { IssueIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  HulyConnectionError,
  HulyError,
  InvalidStatusError,
  IssueNotFoundError,
  NoUpdateFieldsError,
  PersonNotFoundError,
  ProjectNotFoundError
} from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { findProjectAndIssue, findProjectWithStatuses, resolveStatusByName, stringToPriority } from "./issues-shared.js"
import { chooseStatusForTaskType, resolveAssignee, resolveTaskTypeWorkflow } from "./issues-write-shared.js"
import {
  type CoveredUpdateEntry,
  coveredUpdateEntry,
  type DirectUpdateEntry,
  type DirectUpdateSubsetEntry,
  mergeCoveredUpdateEntries,
  requireUpdateFields
} from "./update-guards.js"

type UpdateIssueError =
  | HulyClientError
  | HulyConnectionError
  | NoUpdateFieldsError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | HulyError
  | PersonNotFoundError

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
    yield* requireUpdateFields("update_issue", params, UPDATE_ISSUE_FIELDS)

    const { client, issue, project } = yield* findProjectAndIssue(params)

    const workflowData = params.status !== undefined || params.taskType !== undefined
      ? yield* findProjectWithStatuses(params.project)
      : { projectType: undefined, statuses: [] }
    const taskTypeWorkflow = params.taskType === undefined
      ? undefined
      : yield* resolveTaskTypeWorkflow(
        client,
        project,
        workflowData.projectType,
        workflowData.statuses,
        params.taskType,
        params.project
      )

    const descriptionUpdatedInPlace = params.description !== undefined
      && params.description.trim() !== ""
      && Boolean(issue.description)

    type UpdateIssueField = typeof UPDATE_ISSUE_FIELDS[number]
    type UpdateIssueDirectEffect<Field extends UpdateIssueField & keyof DocumentUpdate<HulyIssue>> = Effect.Effect<
      CoveredUpdateEntry<Field, DirectUpdateEntry<UpdateIssueField, DocumentUpdate<HulyIssue>, Field>>,
      HulyClientError | HulyError | InvalidStatusError | PersonNotFoundError
    >
    type IssueTaskTypeUpdateEntry = DirectUpdateSubsetEntry<"kind" | "status", DocumentUpdate<HulyIssue>>
    type UpdateIssueEntries = {
      readonly title: UpdateIssueDirectEffect<"title">
      readonly description: UpdateIssueDirectEffect<"description">
      readonly priority: UpdateIssueDirectEffect<"priority">
      readonly assignee: UpdateIssueDirectEffect<"assignee">
      readonly status: UpdateIssueDirectEffect<"status">
      readonly taskType: Effect.Effect<
        CoveredUpdateEntry<"taskType", IssueTaskTypeUpdateEntry>,
        HulyClientError | HulyError | InvalidStatusError | PersonNotFoundError
      >
      readonly dueDate: UpdateIssueDirectEffect<"dueDate">
      readonly estimation: UpdateIssueDirectEffect<"estimation">
    }
    const updateEntries = {
      title: Effect.succeed(coveredUpdateEntry("title", params.title === undefined ? {} : { title: params.title })),
      description: Effect.gen(function*() {
        if (params.description === undefined) return coveredUpdateEntry("description", {})
        if (params.description.trim() === "") return coveredUpdateEntry("description", { description: null })
        if (issue.description) {
          yield* client.updateMarkup(tracker.class.Issue, issue._id, "description", params.description, "markdown")
          return coveredUpdateEntry("description", {})
        }
        const descriptionMarkupRef = yield* client.uploadMarkup(
          tracker.class.Issue,
          issue._id,
          "description",
          params.description,
          "markdown"
        )
        return coveredUpdateEntry("description", { description: descriptionMarkupRef })
      }),
      priority: Effect.succeed(
        coveredUpdateEntry(
          "priority",
          params.priority === undefined ? {} : { priority: stringToPriority(params.priority) }
        )
      ),
      assignee: Effect.gen(function*() {
        if (params.assignee === undefined) return coveredUpdateEntry("assignee", {})
        if (params.assignee === null) return coveredUpdateEntry("assignee", { assignee: null })
        const person = yield* resolveAssignee(client, params.assignee)
        return coveredUpdateEntry("assignee", { assignee: person._id })
      }),
      status: Effect.gen(function*() {
        if (taskTypeWorkflow !== undefined || params.status === undefined) return coveredUpdateEntry("status", {})
        return coveredUpdateEntry("status", {
          status: yield* resolveStatusByName(workflowData.statuses, params.status, params.project)
        })
      }),
      taskType: Effect.gen(function*() {
        if (taskTypeWorkflow === undefined) return coveredUpdateEntry("taskType", {})
        const nextStatus = yield* chooseStatusForTaskType(taskTypeWorkflow, params.status, issue.status, params.project)
        const taskTypeOps: IssueTaskTypeUpdateEntry = {
          ...(taskTypeWorkflow.taskType._id === issue.kind ? {} : { kind: taskTypeWorkflow.taskType._id }),
          ...(nextStatus === issue.status ? {} : { status: nextStatus })
        }
        return coveredUpdateEntry("taskType", taskTypeOps)
      }),
      dueDate: Effect.succeed(
        coveredUpdateEntry("dueDate", params.dueDate === undefined ? {} : { dueDate: params.dueDate })
      ),
      estimation: Effect.succeed(
        coveredUpdateEntry("estimation", params.estimation === undefined ? {} : { estimation: params.estimation ?? 0 })
      )
    } satisfies UpdateIssueEntries
    const updateOps: DocumentUpdate<HulyIssue> = mergeCoveredUpdateEntries(
      yield* Effect.all(Object.values(updateEntries))
    )

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
