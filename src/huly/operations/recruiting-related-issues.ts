import type { Doc, DocumentUpdate } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { ResolvedObjectSummary } from "../../domain/schemas/generic-associations.js"
import type {
  AddRecruitingRelatedIssueResult,
  ListRecruitingRelatedIssuesResult,
  RemoveRecruitingRelatedIssueResult
} from "../../domain/schemas/recruiting-media-results.js"
import type {
  AddRecruitingRelatedIssueParams,
  ListRecruitingRelatedIssuesParams,
  RemoveRecruitingRelatedIssueParams
} from "../../domain/schemas/recruiting-media.js"
import { Count, DocId, NonEmptyString, ObjectClassName, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { HulyDomainError } from "../errors.js"
import { RecruitingIssueLocatorInvalidError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { findIssueInProject, findProject, findProjectAndIssue } from "./issues-shared.js"
import { clampLimit, findResultTotal, hulyQuery } from "./query-helpers.js"
import { type RecruitingTargetCoordinates, resolveRecruitingTarget } from "./recruiting-targets.js"
import { hasRelationById, makeRelatedDocEntry } from "./relations.js"
import { toRef } from "./sdk-boundary.js"

type RelatedIssueParams = AddRecruitingRelatedIssueParams | RemoveRecruitingRelatedIssueParams

type ResolvedRelatedIssue = {
  readonly client: HulyClient["Type"]
  readonly issue: HulyIssue
  readonly project: HulyProject
}

const issueSummary = (issue: HulyIssue): ResolvedObjectSummary => ({
  id: DocId.make(issue._id),
  class: ObjectClassName.make(issue._class),
  display: NonEmptyString.make(issue.identifier),
  locatorKind: "issue"
})

const targetRelatedDocument = (target: RecruitingTargetCoordinates) =>
  makeRelatedDocEntry(target.objectId, target.objectClass)

const issueTimestamps = (issue: HulyIssue) => ({
  ...(issue.createdOn === undefined ? {} : { createdOn: Timestamp.make(issue.createdOn) }),
  modifiedOn: Timestamp.make(issue.modifiedOn)
})

const resolveRelatedIssue = (
  params: RelatedIssueParams
): Effect.Effect<ResolvedRelatedIssue, HulyDomainError, HulyClient> =>
  Effect.gen(function*() {
    if (params.project !== undefined) {
      return yield* findProjectAndIssue({ project: params.project, identifier: params.issue })
    }

    const match = String(params.issue).match(/^([A-Z]+)-\d+$/i)
    if (match === null) {
      return yield* new RecruitingIssueLocatorInvalidError({
        issue: params.issue,
        reason: "issue locator without project must use a full project-prefixed identifier like HULY-123"
      })
    }

    const [, projectIdentifier] = match
    if (projectIdentifier === undefined) {
      return yield* new RecruitingIssueLocatorInvalidError({
        issue: params.issue,
        reason: "issue locator without project must use a full project-prefixed identifier like HULY-123"
      })
    }

    const { client, project } = yield* findProject(projectIdentifier.toUpperCase())
    const issue = yield* findIssueInProject(client, project, params.issue)
    return { client, issue, project }
  })

export const listRecruitingRelatedIssues = (
  params: ListRecruitingRelatedIssuesParams
): Effect.Effect<ListRecruitingRelatedIssuesResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const issues = yield* target.client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ relations: targetRelatedDocument(target) }),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    return {
      target: target.target,
      relatedIssues: issues.map((issue) => ({
        issue: issueSummary(issue),
        ...issueTimestamps(issue)
      })),
      total: Count.make(findResultTotal(issues))
    }
  })

export const addRecruitingRelatedIssue = (
  params: AddRecruitingRelatedIssueParams
): Effect.Effect<AddRecruitingRelatedIssueResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const { issue, project } = yield* resolveRelatedIssue(params)
    if (hasRelationById(issue.relations, target.objectId)) {
      return {
        target: target.target,
        issueId: DocId.make(issue._id),
        created: false,
        existing: true
      }
    }

    // DocumentUpdate<HulyIssue> cast needed on $push/$pull literals: TS cannot infer which arm
    // of the complex intersection type (Partial<Data<T>> & PushOptions<T> & ...) applies.
    /* eslint-disable no-restricted-syntax -- see above */
    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      { $push: { relations: targetRelatedDocument(target) } } as DocumentUpdate<HulyIssue>
    )
    /* eslint-enable no-restricted-syntax */

    return {
      target: target.target,
      issueId: DocId.make(issue._id),
      created: true,
      existing: false
    }
  })

export const removeRecruitingRelatedIssue = (
  params: RemoveRecruitingRelatedIssueParams
): Effect.Effect<RemoveRecruitingRelatedIssueResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const { issue, project } = yield* resolveRelatedIssue(params)
    if (!hasRelationById(issue.relations, target.objectId)) {
      return {
        target: target.target,
        issueId: DocId.make(issue._id),
        deleted: false
      }
    }

    /* eslint-disable no-restricted-syntax -- see addRecruitingRelatedIssue */
    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      { $pull: { relations: { _id: toRef<Doc>(target.objectId) } } } as DocumentUpdate<HulyIssue>
    )
    /* eslint-enable no-restricted-syntax */

    return {
      target: target.target,
      issueId: DocId.make(issue._id),
      deleted: true
    }
  })
