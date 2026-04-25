import type { Doc, DocumentUpdate } from "@hcengineering/core"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  LinkDocumentToIssueParams,
  LinkDocumentToIssueResult,
  UnlinkDocumentFromIssueParams,
  UnlinkDocumentFromIssueResult
} from "../../domain/schemas/document-relations.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  DocumentNotFoundError,
  IssueNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import { documentPlugin } from "../huly-plugins.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { hasRelationById, makeRelatedDocEntry } from "./relations.js"
import { toRef } from "./sdk-boundary.js"

type DocRelationError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

export const linkDocumentToIssue = (
  params: LinkDocumentToIssueParams
): Effect.Effect<LinkDocumentToIssueResult, DocRelationError, HulyClient> =>
  Effect.gen(function*() {
    const [{ client, issue, project }, { doc }] = yield* Effect.all([
      findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier }),
      findTeamspaceAndDocument({ teamspace: params.teamspace, document: params.document })
    ])

    if (hasRelationById(issue.relations, doc._id)) {
      return {
        issue: issue.identifier,
        document: doc._id,
        documentTitle: doc.title,
        linked: false
      }
    }

    yield* client.updateDoc(
      issue._class,
      project._id,
      issue._id,
      // eslint-disable-next-line no-restricted-syntax -- DocumentUpdate<HulyIssue> cast: see relations.ts
      { $push: { relations: makeRelatedDocEntry(doc._id, documentPlugin.class.Document) } } as DocumentUpdate<HulyIssue>
    )

    return {
      issue: issue.identifier,
      document: doc._id,
      documentTitle: doc.title,
      linked: true
    }
  })

export const unlinkDocumentFromIssue = (
  params: UnlinkDocumentFromIssueParams
): Effect.Effect<UnlinkDocumentFromIssueResult, DocRelationError, HulyClient> =>
  Effect.gen(function*() {
    const [{ client, issue, project }, { doc }] = yield* Effect.all([
      findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier }),
      findTeamspaceAndDocument({ teamspace: params.teamspace, document: params.document })
    ])

    if (!hasRelationById(issue.relations, doc._id)) {
      return {
        issue: issue.identifier,
        document: doc._id,
        documentTitle: doc.title,
        unlinked: false
      }
    }

    yield* client.updateDoc(
      issue._class,
      project._id,
      issue._id,
      // eslint-disable-next-line no-restricted-syntax -- DocumentUpdate<HulyIssue> cast: see relations.ts
      { $pull: { relations: { _id: toRef<Doc>(doc._id) } } } as DocumentUpdate<HulyIssue>
    )

    return {
      issue: issue.identifier,
      document: doc._id,
      documentTitle: doc.title,
      unlinked: true
    }
  })
