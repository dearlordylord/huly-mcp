import type { Ref, Status, StatusCategory, WithLookup } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority } from "@hcengineering/tracker"
import { Effect, Result, Schema, SchemaGetter } from "effect"

import type { IssuePriority as IssuePriorityStr } from "../../domain/schemas/issues.js"
import type { NonNegativeNumber } from "../../domain/schemas/shared.js"
import { Count, IssueIdentifier, IssueStatusId, PositiveNumber, StatusName } from "../../domain/schemas/shared.js"
import {
  StatusCategoryEntries,
  type StatusCategoryValue,
  UnknownStatusCategoryValue
} from "../../domain/schemas/task-management.js"
import { StatusMetadataUnresolvedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { InvalidStatusError, IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { core, task, tracker } from "../huly-plugins.js"
import { findOneOrFail, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

// Huly API uses 0 as sentinel for "not set" on numeric fields like estimation and remainingTime.
// Confirmed: creating an issue without estimation stores 0, not null/undefined.
// Converts sentinel 0 → undefined; positive values → branded PositiveNumber.
export const zeroAsUnset = (value: NonNegativeNumber): PositiveNumber | undefined =>
  value > 0 ? PositiveNumber.make(value) : undefined

type ProjectWithType = WithLookup<HulyProject> & { $lookup?: { type?: ProjectType } }

export const findProject = (
  projectIdentifier: string
): Effect.Effect<
  { client: HulyClient["Service"]; project: HulyProject },
  ProjectNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const project = yield* findOneOrFail(
      client,
      tracker.class.Project,
      { identifier: projectIdentifier },
      () => new ProjectNotFoundError({ identifier: projectIdentifier })
    )

    return { client, project }
  })

export type WorkflowStatus = { _id: Ref<Status>; name: StatusName; category: StatusCategoryValue }

const StatusRefSchema = IssueStatusId.pipe(
  Schema.decodeTo(
    Schema.declare((input): input is Ref<Status> => typeof input === "string"),
    {
      decode: SchemaGetter.transform(toRef<Status>),
      encode: SchemaGetter.transform((input) => IssueStatusId.make(input))
    }
  )
)

const StatusCategoryRefSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.declare((input): input is Ref<StatusCategory> => typeof input === "string"),
    { decode: SchemaGetter.transform(toRef<StatusCategory>), encode: SchemaGetter.transform((input) => input) }
  )
)

export const StatusMetadataSchema = Schema.Struct({
  _id: StatusRefSchema,
  name: StatusName,
  category: Schema.optional(StatusCategoryRefSchema)
}).annotate({
  title: "StatusMetadata",
  description: "Huly model-space workflow status fields consumed by tracker operations."
})
export type StatusMetadata = Schema.Schema.Type<typeof StatusMetadataSchema>

interface ParsedStatusRows {
  readonly statuses: ReadonlyArray<StatusMetadata>
  readonly invalidRows: Count
  readonly categoryFidelityLoss: { readonly missing: Count; readonly empty: Count; readonly unrecognized: Count }
}

const parseStatusRows = (rows: ReadonlyArray<unknown>): ParsedStatusRows => {
  const decode = Schema.decodeUnknownResult(StatusMetadataSchema)
  const parsed = rows.map((row) => decode(row))
  const valid = parsed.flatMap((row) => (Result.isSuccess(row) ? [row.success] : []))
  return {
    statuses: valid,
    invalidRows: Count.make(parsed.filter(Result.isFailure).length),
    categoryFidelityLoss: {
      missing: Count.make(valid.filter((status) => status.category === undefined).length),
      empty: Count.make(valid.filter((status) => status.category === "").length),
      unrecognized: Count.make(
        valid.filter(
          (status) =>
            status.category !== undefined &&
            status.category !== "" &&
            !StatusCategoryEntries.some((entry) => entry.ref === status.category)
        ).length
      )
    }
  }
}

const statusCategoryValueFromRef = (category: Ref<StatusCategory> | undefined): StatusCategoryValue =>
  category === undefined
    ? UnknownStatusCategoryValue
    : (StatusCategoryEntries.find((entry) => entry.ref === category)?.key ?? UnknownStatusCategoryValue)

const workflowStatusFromDoc = (doc: StatusMetadata): WorkflowStatus => {
  return { _id: doc._id, name: doc.name, category: statusCategoryValueFromRef(doc.category) }
}

export const workflowStatusFromRef = (statusRef: Ref<Status>): WorkflowStatus => {
  const name = statusRef.includes(":") ? statusRef.slice(statusRef.lastIndexOf(":") + 1) : statusRef
  return { _id: statusRef, name: StatusName.make(name), category: UnknownStatusCategoryValue }
}

export const uniqueStatusRefs = (refs: ReadonlyArray<Ref<Status>>): Array<Ref<Status>> =>
  refs.reduce<Array<Ref<Status>>>((unique, ref) => (unique.includes(ref) ? unique : [...unique, ref]), [])

export const uniqueStatusDocs = <T extends Pick<StatusMetadata, "_id">>(statuses: Iterable<T>): Array<T> =>
  Array.from(statuses).reduce<Array<T>>(
    (unique, status) => (unique.some((existing) => existing._id === status._id) ? unique : [...unique, status]),
    []
  )

const uniqueProjectTypeStatusRefs = (statuses: ReadonlyArray<{ readonly _id: Ref<Status> }>): Array<Ref<Status>> =>
  uniqueStatusRefs(statuses.map((status) => status._id))

const missingStatusRefs = (
  statusRefs: ReadonlyArray<Ref<Status>>,
  statusDocs: ReadonlyArray<Pick<StatusMetadata, "_id">>
): Array<Ref<Status>> => statusRefs.filter((statusRef) => !statusDocs.some((statusDoc) => statusDoc._id === statusRef))

export const resolveByStatusRef = <T, S extends Pick<StatusMetadata, "_id">>(
  statusRefs: ReadonlyArray<Ref<Status>>,
  statusDocs: ReadonlyArray<S>,
  fromDoc: (status: S) => T,
  fromRef: (statusRef: Ref<Status>) => T
): Array<T> => {
  const statusDocsById = new Map<Ref<Status>, S>(statusDocs.map((statusDoc) => [statusDoc._id, statusDoc]))
  return statusRefs.map((statusRef) => {
    const statusDoc = statusDocsById.get(statusRef)
    return statusDoc === undefined ? fromRef(statusRef) : fromDoc(statusDoc)
  })
}

const workflowStatusesFromDocsOrRefs = (
  statusRefs: ReadonlyArray<Ref<Status>>,
  statusDocs: ReadonlyArray<StatusMetadata>
): Array<WorkflowStatus> => resolveByStatusRef(statusRefs, statusDocs, workflowStatusFromDoc, workflowStatusFromRef)

type StatusLookupResult =
  | { readonly _tag: "Success"; readonly parsed: ParsedStatusRows }
  | { readonly _tag: "Failure"; readonly error: HulyClientError }

const statusLookupFailure = (error: HulyClientError): StatusLookupResult => ({ _tag: "Failure", error })

const statusLookupSuccess = (rows: ReadonlyArray<Status>): StatusLookupResult => ({
  _tag: "Success",
  parsed: parseStatusRows(rows)
})

const statusLookupResult = (
  lookup: Effect.Effect<ReadonlyArray<Status>, HulyClientError>
): Effect.Effect<StatusLookupResult> =>
  lookup.pipe(Effect.match({ onFailure: statusLookupFailure, onSuccess: statusLookupSuccess }))

const statusDocsFromLookup = (result: StatusLookupResult): ReadonlyArray<StatusMetadata> =>
  result._tag === "Success" ? uniqueStatusDocs(result.parsed.statuses) : []

const modelStatusState = (result: StatusLookupResult, docs: ReadonlyArray<StatusMetadata>): string => {
  if (result._tag === "Failure") return `model connection failure (${result.error.message})`
  return docs.length === 0 ? "model metadata unavailable" : "partial model metadata"
}

const warnInvalidAuthoritativeStatuses = (
  diagnostics: Diagnostics["Service"],
  invalidRows: Count
): Effect.Effect<void> =>
  invalidRows === 0
    ? Effect.void
    : diagnostics.warnAgent({
        code: StatusMetadataUnresolvedWarningCode,
        message:
          `${invalidRows} authoritative workflow status row(s) failed Effect Schema parsing ` +
          "and were omitted. Returned statuses are authoritative for requested refs, but the model data needs repair."
      })

const warnAuthoritativeCategoryFidelityLoss = (
  diagnostics: Diagnostics["Service"],
  parsed: ParsedStatusRows
): Effect.Effect<void> => {
  const { empty, missing, unrecognized } = parsed.categoryFidelityLoss
  const total = Count.make(empty + missing + unrecognized)
  return total === 0
    ? Effect.void
    : diagnostics.warnAgent({
        code: StatusMetadataUnresolvedWarningCode,
        message:
          `${total} authoritative workflow status row(s) had category metadata that cannot be projected ` +
          `without semantic loss (missing: ${missing}, empty: ${empty}, unrecognized: ${unrecognized}). ` +
          `Those categories are reported as "${UnknownStatusCategoryValue}"; do not infer workflow completion semantics ` +
          "for them. Inspect the Huly model status-category definitions or upgrade Huly if this persists."
      })
}

const warnStatusCompatibilityResult = (
  diagnostics: Diagnostics["Service"],
  modelResult: StatusLookupResult,
  modelDocs: ReadonlyArray<StatusMetadata>,
  remoteDocs: ReadonlyArray<StatusMetadata>,
  unresolvedRefs: ReadonlyArray<Ref<Status>>
): Effect.Effect<void> => {
  if (unresolvedRefs.length === 0) {
    return diagnostics.warnAgent({
      code: StatusMetadataUnresolvedWarningCode,
      message:
        `Authoritative model-space workflow status metadata was incomplete; ${remoteDocs.length} status ref(s) ` +
        "were resolved through the server compatibility fallback. Use the returned IDs, names, and categories, " +
        "and upgrade Huly or inspect its loaded model if this warning persists."
    })
  }
  const remoteState = remoteDocs.length === 0 ? "server metadata unavailable" : "partial server metadata"
  return diagnostics.warnAgent({
    code: StatusMetadataUnresolvedWarningCode,
    message:
      `Huly did not return metadata for ${unresolvedRefs.length} workflow status ref(s). ` +
      `The tool result uses ref-derived status names and category "${UnknownStatusCategoryValue}" for those statuses; ` +
      `do not infer completion or cancellation semantics from those fallback names. ` +
      `Authoritative source: ${modelStatusState(modelResult, modelDocs)}; compatibility source: ${remoteState}.`
  })
}

export const findStatusDocs = (
  client: HulyClient["Service"],
  statusRefs: ReadonlyArray<Ref<Status>>
): Effect.Effect<ReadonlyArray<StatusMetadata>, HulyClientError, Diagnostics> =>
  Effect.gen(function* () {
    const diagnostics = yield* Diagnostics
    const modelResult = yield* statusLookupResult(
      client.findAllInModel<Status>(core.class.Status, hulyQuery<Status>({ _id: { $in: [...statusRefs] } }))
    )
    const modelDocs = statusDocsFromLookup(modelResult)
    if (modelResult._tag === "Success") {
      yield* warnInvalidAuthoritativeStatuses(diagnostics, modelResult.parsed.invalidRows)
      yield* warnAuthoritativeCategoryFidelityLoss(diagnostics, modelResult.parsed)
    }
    const unresolvedAfterModel = missingStatusRefs(statusRefs, modelDocs)
    if (unresolvedAfterModel.length === 0) {
      return modelDocs
    }

    const remoteResult = yield* statusLookupResult(
      client.findAll<Status>(core.class.Status, hulyQuery<Status>({ _id: { $in: unresolvedAfterModel } }))
    )
    if (remoteResult._tag === "Failure") {
      return yield* Effect.fail(remoteResult.error)
    }
    const remoteDocs = statusDocsFromLookup(remoteResult)
    const combinedDocs = uniqueStatusDocs([...modelDocs, ...remoteDocs])
    const stillUnresolvedRefs = missingStatusRefs(statusRefs, combinedDocs)

    yield* warnStatusCompatibilityResult(diagnostics, modelResult, modelDocs, remoteDocs, stillUnresolvedRefs)
    return combinedDocs
  })

/**
 * Find project with its ProjectType lookup to get status information.
 * This avoids querying IssueStatus directly which can fail on some workspaces.
 *
 * If Status query fails or omits project workflow statuses, falls back to the
 * local client model before using ref-derived names for unresolved statuses.
 */
export const findProjectWithStatuses = (
  projectIdentifier: string
): Effect.Effect<
  {
    client: HulyClient["Service"]
    project: HulyProject
    projectType: ProjectType | undefined
    statuses: Array<WorkflowStatus>
    defaultStatusId: Ref<Status> | undefined
  },
  ProjectNotFoundError | HulyClientError,
  HulyClient | Diagnostics
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const project = yield* findOneOrFail<ProjectWithType, ProjectNotFoundError>(
      client,
      tracker.class.Project,
      { identifier: projectIdentifier },
      () => new ProjectNotFoundError({ identifier: projectIdentifier }),
      { lookup: { type: task.class.ProjectType } }
    )

    const projectType = project.$lookup?.type
    const statuses: Array<WorkflowStatus> = projectType?.statuses
      ? yield* Effect.gen(function* () {
          const statusRefs = uniqueProjectTypeStatusRefs(projectType.statuses)
          if (statusRefs.length === 0) {
            return []
          }

          const statusDocs = yield* findStatusDocs(client, statusRefs)
          return workflowStatusesFromDocsOrRefs(statusRefs, statusDocs)
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
    const [, projectPrefix, issueNumber] = match
    if (projectPrefix === undefined || issueNumber === undefined) {
      return { fullIdentifier: `${projectIdentifier}-${idStr}`, number: null }
    }
    return { fullIdentifier: `${projectPrefix.toUpperCase()}-${issueNumber}`, number: parseInt(issueNumber, 10) }
  }

  const numMatch = idStr.match(/^\d+$/)
  if (numMatch) {
    const num = parseInt(idStr, 10)
    return { fullIdentifier: `${projectIdentifier.toUpperCase()}-${num}`, number: num }
  }

  return { fullIdentifier: idStr, number: null }
}

export const findIssueInProject = (
  client: HulyClient["Service"],
  project: HulyProject,
  identifierStr: string
): Effect.Effect<HulyIssue, IssueNotFoundError | HulyClientError> =>
  Effect.gen(function* () {
    const { fullIdentifier, number } = parseIssueIdentifier(identifierStr, project.identifier)

    const issue =
      (yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        hulyQuery<HulyIssue>({ space: project._id, identifier: fullIdentifier })
      )) ??
      (number !== null
        ? yield* client.findOne<HulyIssue>(tracker.class.Issue, hulyQuery<HulyIssue>({ space: project._id, number }))
        : yield* client.findOne<HulyIssue>(
            tracker.class.Issue,
            hulyQuery<HulyIssue>({ space: project._id, _id: toRef<HulyIssue>(IssueIdentifier.make(identifierStr)) })
          ))
    if (issue === undefined) {
      return yield* new IssueNotFoundError({ identifier: identifierStr, project: project.identifier })
    }

    return issue
  })

export const findProjectAndIssue = (params: {
  project: string
  identifier: string
}): Effect.Effect<
  { client: HulyClient["Service"]; project: HulyProject; issue: HulyIssue },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function* () {
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
  urgent: IssuePriority.Urgent,
  high: IssuePriority.High,
  medium: IssuePriority.Medium,
  low: IssuePriority.Low,
  "no-priority": IssuePriority.NoPriority
} as const satisfies Record<IssuePriorityStr, IssuePriority>

export const stringToPriority = (priority: IssuePriorityStr): IssuePriority => stringToPriorityMap[priority]

export const resolveStatusByName = (
  statuses: Array<WorkflowStatus>,
  statusName: string,
  project: string
): Effect.Effect<Ref<Status>, InvalidStatusError> => {
  const normalizedInput = normalizeForComparison(statusName)
  const matchingStatus = statuses.find((s) => normalizeForComparison(s.name) === normalizedInput)
  if (matchingStatus === undefined) {
    return Effect.fail(new InvalidStatusError({ status: statusName, project }))
  }
  return Effect.succeed(matchingStatus._id)
}
