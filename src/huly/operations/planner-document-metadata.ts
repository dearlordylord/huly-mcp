import type { Ref } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { ToDo as HulyToDo } from "@hcengineering/time"
import { Effect, Result } from "effect"

import { TodoAttachmentTitle } from "../../domain/schemas/planner.js"
import { Count, type DocumentId, NonEmptyString, type TeamspaceId } from "../../domain/schemas/shared.js"
import { PlannerDocumentMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import type { HulyDataInvalidError } from "../errors.js"
import { documentPlugin } from "../huly-plugins.js"
import { parseDocumentProjection, parseTeamspaceProjection } from "./planner-document-projections.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export interface TodoDocumentMetadata {
  readonly id: DocumentId
  readonly title: TodoAttachmentTitle
  readonly teamspaceId: TeamspaceId
  readonly teamspaceName: NonEmptyString
}

const projectionEffect = <A>(result: Result.Result<A, HulyDataInvalidError>): Effect.Effect<A, HulyDataInvalidError> =>
  Result.isFailure(result) ? Effect.fail(result.failure) : Effect.succeed(result.success)

interface MetadataWarningCounts {
  synthesizedTitles: Count
  synthesizedTeamspaceNames: Count
  skippedTeamspaces: Count
  unresolvedDocuments: Count
}

const UNTITLED_TEAMSPACE = NonEmptyString.make("Untitled teamspace")

const emptyMetadataWarningCounts = (): MetadataWarningCounts => ({
  synthesizedTitles: Count.make(0),
  synthesizedTeamspaceNames: Count.make(0),
  skippedTeamspaces: Count.make(0),
  unresolvedDocuments: Count.make(0)
})

const warnMetadataDegradation = Effect.fn("PlannerDocument.warnMetadataDegradation")(function* (
  counts: MetadataWarningCounts
): Effect.fn.Return<void, never, Diagnostics> {
  if (
    counts.synthesizedTitles === 0 &&
    counts.synthesizedTeamspaceNames === 0 &&
    counts.skippedTeamspaces === 0 &&
    counts.unresolvedDocuments === 0
  ) {
    return
  }
  const diagnostics = yield* Diagnostics
  yield* diagnostics.warnAgent({
    code: PlannerDocumentMetadataDegradedWarningCode,
    message:
      `Planner document ToDo metadata was partially resolved: ${counts.synthesizedTitles} synthesized document title(s), ` +
      `${counts.synthesizedTeamspaceNames} synthesized teamspace name(s), ${counts.skippedTeamspaces} skipped teamspace(s), ` +
      `${counts.unresolvedDocuments} unresolved document attachment(s).`
  })
})

export const documentMetadataForTodos = Effect.fn("PlannerDocument.metadataForTodos")(function* (
  client: HulyClient["Service"],
  todos: ReadonlyArray<HulyToDo>
): Effect.fn.Return<
  ReadonlyMap<Ref<HulyDocument>, TodoDocumentMetadata>,
  HulyClientError | HulyDataInvalidError,
  Diagnostics
> {
  const documentIds = [
    ...new Set(
      todos
        .filter((todo) => todo.attachedToClass === documentPlugin.class.Document)
        .map((todo) => toRef<HulyDocument>(todo.attachedTo))
    )
  ]
  if (documentIds.length === 0) return new Map<Ref<HulyDocument>, TodoDocumentMetadata>()

  const rawDocuments = yield* client.findAll<HulyDocument>(
    documentPlugin.class.Document,
    hulyQuery<HulyDocument>({ _id: { $in: documentIds } })
  )
  const documents = yield* Effect.all(rawDocuments.map((row) => projectionEffect(parseDocumentProjection(row))))
  const documentById = new Map(documents.map((document) => [toRef<HulyDocument>(document._id), document]))
  const teamspaceIds = [...new Set(documents.map((document) => toRef<HulyTeamspace>(document.space)))]
  const rawTeamspaces =
    teamspaceIds.length === 0
      ? []
      : yield* client.findAll<HulyTeamspace>(
          documentPlugin.class.Teamspace,
          hulyQuery<HulyTeamspace>({ _id: { $in: teamspaceIds } })
        )
  const teamspaces = yield* Effect.all(rawTeamspaces.map((row) => projectionEffect(parseTeamspaceProjection(row))))
  const teamspaceById = new Map(teamspaces.map((teamspace) => [toRef<HulyTeamspace>(teamspace._id), teamspace]))
  const counts = {
    ...emptyMetadataWarningCounts(),
    unresolvedDocuments: Count.make(documentIds.filter((id) => !documentById.has(id)).length),
    skippedTeamspaces: Count.make(
      [...new Set(documents.map((document) => toRef<HulyTeamspace>(document.space)))].filter(
        (id) => !teamspaceById.has(id)
      ).length
    )
  }
  const entries: Array<readonly [Ref<HulyDocument>, TodoDocumentMetadata]> = []
  for (const document of documents) {
    const teamspace = teamspaceById.get(toRef<HulyTeamspace>(document.space))
    if (teamspace === undefined) continue
    const title = hulyNonEmptyTextOrFallback(
      TodoAttachmentTitle,
      document.title,
      TodoAttachmentTitle.make(String(document._id))
    )
    const teamspaceName = hulyNonEmptyTextOrFallback(NonEmptyString, teamspace.name, UNTITLED_TEAMSPACE)
    if (document.title.trim() === "") counts.synthesizedTitles = Count.make(counts.synthesizedTitles + 1)
    if (teamspace.name.trim() === "") {
      counts.synthesizedTeamspaceNames = Count.make(counts.synthesizedTeamspaceNames + 1)
    }
    entries.push([
      toRef<HulyDocument>(document._id),
      { id: document._id, title, teamspaceId: teamspace._id, teamspaceName }
    ])
  }
  yield* warnMetadataDegradation(counts)
  return new Map(entries)
})
