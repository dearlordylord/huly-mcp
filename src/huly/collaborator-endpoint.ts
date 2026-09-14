import { Effect, Schema } from "effect"
import { HulyConnectionError } from "./errors-base.js"

const CollaboratorDiscoverySchema = Schema.Struct({
  workspace: Schema.Struct({ collaboratorEndpoint: Schema.optional(Schema.Unknown) }),
  server: Schema.Struct({ COLLABORATOR_URL: Schema.optional(Schema.Unknown) })
})

const CollaboratorEndpointSchema = Schema.URLFromString.check(
  Schema.makeFilter((url) => ["http:", "https:", "ws:", "wss:"].includes(url.protocol))
).pipe(Schema.brand("CollaboratorEndpoint"))

type CollaboratorEndpoint = Schema.Schema.Type<typeof CollaboratorEndpointSchema>

/** Workspace-specific discovery takes precedence over older global configuration. */
export const parseCollaboratorEndpoint = (
  server: unknown,
  workspace: unknown
): Effect.Effect<CollaboratorEndpoint, HulyConnectionError> =>
  Schema.decodeUnknownEffect(CollaboratorDiscoverySchema)({ server, workspace }).pipe(
    Effect.flatMap((discovery) =>
      Schema.decodeUnknownEffect(CollaboratorEndpointSchema)(
        discovery.workspace.collaboratorEndpoint ?? discovery.server.COLLABORATOR_URL
      )
    ),
    Effect.mapError(
      () =>
        new HulyConnectionError({
          message:
            "Invalid collaborator endpoint: expected an absolute HTTP(S) or WS(S) URL in workspace collaboratorEndpoint or server COLLABORATOR_URL."
        })
    )
  )
