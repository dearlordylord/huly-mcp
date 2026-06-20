import type { Class, Doc } from "@hcengineering/core"
import type { TagReference } from "@hcengineering/tags"
import { Effect } from "effect"

import type { CreateLabelParams, DeleteLabelParams, ListLabelsParams, UpdateLabelParams } from "../../domain/schemas.js"
import type { RemoveLabelResult } from "../../domain/schemas/issues-results.js"
import type { RemoveLabelParams } from "../../domain/schemas/issues.js"
import type {
  CreateLabelResult,
  DeleteLabelResult,
  TagElementSummary,
  UpdateLabelResult
} from "../../domain/schemas/labels.js"
import { UPDATE_LABEL_FIELDS } from "../../domain/schemas/labels.js"
import { IssueIdentifier, TagElementId } from "../../domain/schemas/shared.js"
import { TagTargetClass, type UpdateTagParams } from "../../domain/schemas/tags.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  IssueNotFoundError,
  NoUpdateFieldsError,
  ProjectNotFoundError,
  TagCategoryNotFoundError
} from "../errors.js"
import { TagNotFoundError } from "../errors.js"
import { tags, tracker } from "../huly-plugins.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { ensureTagElement } from "./tags-shared.js"
import { deleteTag, listTags, updateTag } from "./tags.js"
import { requireUpdateFields } from "./update-guards.js"

type ListLabelsError = HulyClientError | TagCategoryNotFoundError
type CreateLabelError = HulyClientError | TagCategoryNotFoundError
type UpdateLabelError = HulyClientError | NoUpdateFieldsError | TagCategoryNotFoundError | TagNotFoundError
type DeleteLabelError = HulyClientError | TagNotFoundError
type RemoveIssueLabelError = HulyClientError | ProjectNotFoundError | IssueNotFoundError | TagNotFoundError

// Huly Tracker "labels" are generic tag definitions scoped to tracker issues:
// TagElement.targetClass = tracker.class.Issue. Each issue's `labels`
// collection stores TagReference attachments to those elements. These
// operations expose the Tracker label namespace, not arbitrary SDK tags.
const issueClassRef = toRef<Class<Doc>>(tracker.class.Issue)
const issueTargetClass = TagTargetClass.make(String(issueClassRef))

export const listLabels = (
  params: ListLabelsParams
): Effect.Effect<Array<TagElementSummary>, ListLabelsError, HulyClient> =>
  Effect.gen(function*() {
    const result = yield* listTags({
      targetClass: issueTargetClass,
      category: params.category,
      limit: params.limit
    })

    return result.map(e => ({
      id: e.id,
      title: e.title,
      color: e.color,
      category: e.category
    }))
  })

export const createLabel = (
  params: CreateLabelParams
): Effect.Effect<CreateLabelResult, CreateLabelError, HulyClient> =>
  Effect.gen(function*() {
    const result = yield* ensureTagElement({
      targetClass: issueTargetClass,
      titleOrId: params.title,
      color: params.color,
      description: params.description,
      category: params.category,
      fallbackCategory: tracker.category.Other
    })

    return { id: TagElementId.make(result.id), title: result.title, created: result.created }
  })

export const updateLabel = (
  params: UpdateLabelParams
): Effect.Effect<UpdateLabelResult, UpdateLabelError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_label", params, UPDATE_LABEL_FIELDS)

    type UpdateLabelField = typeof UPDATE_LABEL_FIELDS[number]
    type UpdateLabelEntries = {
      readonly [Field in UpdateLabelField]: UpdateTagParams[Field]
    }
    const updateEntries = {
      title: params.title,
      color: params.color,
      description: params.description
    } satisfies UpdateLabelEntries
    const result = yield* updateTag({
      targetClass: issueTargetClass,
      tag: params.label,
      ...updateEntries
    })

    return { id: result.id, updated: result.updated }
  })

export const deleteLabel = (
  params: DeleteLabelParams
): Effect.Effect<DeleteLabelResult, DeleteLabelError, HulyClient> =>
  Effect.gen(function*() {
    const result = yield* deleteTag({
      targetClass: issueTargetClass,
      tag: params.label
    })

    return { id: result.id, deleted: result.deleted }
  })

export const removeIssueLabel = (
  params: RemoveLabelParams
): Effect.Effect<RemoveLabelResult, RemoveIssueLabelError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    const labelTitle = params.label.trim()

    const tagRefs = yield* client.findAll<TagReference>(
      tags.class.TagReference,
      hulyQuery<TagReference>({
        attachedTo: issue._id,
        attachedToClass: tracker.class.Issue
      })
    )

    const matchingRef = tagRefs.find(
      r => r.title.toLowerCase() === labelTitle.toLowerCase()
    )

    if (matchingRef === undefined) {
      return yield* new TagNotFoundError({ identifier: labelTitle })
    }

    yield* client.removeDoc(
      tags.class.TagReference,
      project._id,
      matchingRef._id
    )

    return { identifier: IssueIdentifier.make(issue.identifier), labelRemoved: true }
  })
