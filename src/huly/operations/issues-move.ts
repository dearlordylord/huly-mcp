/**
 * Issue move and label operations.
 *
 * @module
 */
import { Effect } from "effect"

import type { AddLabelParams } from "../../domain/schemas.js"
import type { AddLabelResult } from "../../domain/schemas/issues-results.js"
import { IssueIdentifier, TagIdentifier } from "../../domain/schemas/shared.js"
import { TagTargetClass } from "../../domain/schemas/tags.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  IssueNotFoundError,
  ProjectNotFoundError,
  TagCategoryNotFoundError,
  TagIdentifierAmbiguousError
} from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { attachTagReference, ensureTagElement } from "./tags-shared.js"

type AddLabelError =
  | HulyClientError
  | TagCategoryNotFoundError
  | TagIdentifierAmbiguousError
  | ProjectNotFoundError
  | IssueNotFoundError

const issueTargetClass = TagTargetClass.make(String(tracker.class.Issue))

/**
 * Add a label/tag to an issue.
 *
 * Creates the tag in the project if it doesn't exist,
 * then attaches it to the issue via TagReference.
 *
 * Idempotent: adding the same label twice is a no-op.
 */
export const addLabel = (params: AddLabelParams): Effect.Effect<AddLabelResult, AddLabelError, HulyClient> =>
  Effect.gen(function* () {
    const { issue, project } = yield* findProjectAndIssue(params)
    const labelTitle = TagIdentifier.make(params.label.trim())
    const tag = yield* ensureTagElement({
      targetClass: issueTargetClass,
      titleOrId: labelTitle,
      color: params.color,
      fallbackCategory: tracker.category.Other
    })

    const result = yield* attachTagReference({
      tag,
      objectId: issue._id,
      objectClass: tracker.class.Issue,
      space: project._id,
      collection: "labels",
      matchTitleCaseInsensitive: true
    })

    return { identifier: IssueIdentifier.make(issue.identifier), labelAdded: result.attached }
  })

export { moveIssue } from "./issue-movement.js"
