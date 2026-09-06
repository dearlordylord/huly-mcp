import type { Class, Doc, Ref, Space } from "@hcengineering/core"
import { Effect, Result } from "effect"

import type { DocumentTodoLocator } from "../../domain/schemas/planner.js"
import { AccountUuid } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  TodoDocumentTargetAmbiguousError as AmbiguousDocumentTarget,
  TodoDocumentTargetNotWritableError as DocumentTargetNotWritable
} from "../errors.js"
import type {
  DocumentNotFoundError,
  HulyDataInvalidError,
  TeamspaceNotFoundError,
  TodoDocumentTargetAmbiguousError,
  TodoDocumentTargetNotWritableError
} from "../errors.js"
import { documentPlugin } from "../huly-plugins.js"
import { findTeamspaceAndDocument, type TeamspaceDocumentAmbiguousTarget } from "./documents-shared.js"
import {
  type DocumentProjection,
  parseDocumentProjection,
  parseTeamspaceProjection,
  type TeamspaceProjection
} from "./planner-document-projections.js"
import { toRef } from "./sdk-boundary.js"

export interface ResolvedDocumentTodoAttachment {
  readonly type: "document"
  readonly attachedTo: Ref<Doc>
  readonly attachedToClass: Ref<Class<Doc>>
  readonly attachedSpace: Ref<Space>
  readonly teamspace: TeamspaceProjection
  readonly document: DocumentProjection
}

export interface ResolveDocumentTodoAttachmentOptions {
  readonly requireWritable?: boolean
}

const ensureDocumentTodoWritable = Effect.fn("PlannerDocument.ensureTodoWritable")(function* (
  client: HulyClient["Service"],
  locator: DocumentTodoLocator,
  teamspace: TeamspaceProjection,
  document: DocumentProjection
): Effect.fn.Return<void, TodoDocumentTargetNotWritableError> {
  const accountUuid = AccountUuid.make(String(client.getAccountUuid()))
  if (!teamspace.members.includes(accountUuid)) {
    return yield* new DocumentTargetNotWritable({
      teamspace: locator.teamspace,
      document: locator.document,
      reason: "not-member"
    })
  }
  if (document.lockedBy !== undefined && document.lockedBy !== null && document.lockedBy !== accountUuid) {
    return yield* new DocumentTargetNotWritable({
      teamspace: locator.teamspace,
      document: locator.document,
      reason: "locked"
    })
  }
})

export const resolveDocumentTodoAttachment = Effect.fn("PlannerDocument.resolveTodoAttachment")(function* (
  client: HulyClient["Service"],
  locator: DocumentTodoLocator,
  options: ResolveDocumentTodoAttachmentOptions = {}
): Effect.fn.Return<
  ResolvedDocumentTodoAttachment,
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | TodoDocumentTargetAmbiguousError
  | TodoDocumentTargetNotWritableError
  | HulyDataInvalidError
> {
  const resolution = yield* findTeamspaceAndDocument(
    { teamspace: locator.teamspace, document: locator.document },
    {
      onAmbiguous: (target: TeamspaceDocumentAmbiguousTarget, matches) =>
        new AmbiguousDocumentTarget({ target, matches })
    }
  ).pipe(Effect.provideService(HulyClient, client))
  const teamspaceResult = parseTeamspaceProjection(resolution.teamspace)
  if (Result.isFailure(teamspaceResult)) return yield* Effect.fail(teamspaceResult.failure)
  const documentResult = parseDocumentProjection(resolution.doc)
  if (Result.isFailure(documentResult)) return yield* Effect.fail(documentResult.failure)
  const teamspace = teamspaceResult.success
  const document = documentResult.success

  if (options.requireWritable === true) {
    yield* ensureDocumentTodoWritable(client, locator, teamspace, document)
  }

  return {
    type: "document",
    attachedTo: toRef<Doc>(document._id),
    attachedToClass: documentPlugin.class.Document,
    attachedSpace: toRef<Space>(document.space),
    teamspace,
    document
  }
})
