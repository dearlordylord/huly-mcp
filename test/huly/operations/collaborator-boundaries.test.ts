import { it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseRemoveObjectCollaboratorParams } from "../../../src/domain/schemas/collaborators.js"
import { TeamspaceIdentifier, DocumentIdentifier } from "../../../src/domain/schemas/shared.js"
import { TodoDocumentTargetAmbiguousError } from "../../../src/huly/errors.js"
import { HulyClient } from "../../../src/huly/client.js"
import { removeObjectCollaborator } from "../../../src/huly/operations/collaborators.js"
import { findTeamspaceAndDocument } from "../../../src/huly/operations/documents-shared.js"

it.effect("resolves an account UUID directly without requiring employee lookup", () =>
  Effect.gen(function* () {
    const member = "123e4567-e89b-42d3-a456-426614174000"
    const params = yield* parseRemoveObjectCollaboratorParams({
      objectId: "object-1",
      objectClass: "tracker:class:Issue",
      member
    })
    const queried: Array<string> = []
    const result = yield* removeObjectCollaborator(params).pipe(
      Effect.provide(
        HulyClient.testLayer({
          findOne: (objectClass) => {
            queried.push(objectClass)
            return Effect.succeed(undefined)
          }
        })
      )
    )
    expect(result).toMatchObject({ accountUuid: member, removed: false })
    expect(queried).toEqual(["tracker:class:Issue", "core:class:Collaborator"])
  })
)

it.effect("reports missing teamspace before resolving a document in ambiguity-aware lookup", () =>
  Effect.gen(function* () {
    const error = yield* findTeamspaceAndDocument(
      { teamspace: TeamspaceIdentifier.make("missing"), document: DocumentIdentifier.make("document") },
      { onAmbiguous: (target, matches) => new TodoDocumentTargetAmbiguousError({ target, matches }) }
    ).pipe(Effect.provide(HulyClient.testLayer({})), Effect.flip)
    expect(error).toMatchObject({ _tag: "TeamspaceNotFoundError", identifier: "missing" })
  })
)
