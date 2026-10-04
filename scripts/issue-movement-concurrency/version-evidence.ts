import { Effect, Schema } from "effect"
import { NonEmptyString, PositiveInteger, UrlString, WorkspaceVersion } from "../../src/domain/schemas/shared.js"
import { FixtureBoundaryError } from "./fixture-errors.js"

export const DeploymentVersionSchema = Schema.Struct({ VERSION: NonEmptyString, MODEL_VERSION: WorkspaceVersion })
export type DeploymentVersion = Schema.Schema.Type<typeof DeploymentVersionSchema>
export const ServerVersionEvidenceSchema = Schema.Struct({
  deployment: Schema.Struct({
    source: Schema.Literal("/config.json"),
    reportedRelease: NonEmptyString,
    reportedModelVersion: WorkspaceVersion
  }),
  workspace: Schema.Struct({
    source: Schema.Literal("huly workspace info get"),
    reportedModelVersion: WorkspaceVersion
  }),
  modelVersionsAgree: Schema.Literal(true),
  imageIdentity: Schema.Literal("not-established-by-these-APIs")
}).check(
  Schema.makeFilter(
    (evidence) => evidence.deployment.reportedModelVersion === evidence.workspace.reportedModelVersion,
    { message: "Deployment and workspace reported model versions must agree" }
  )
)
export type ServerVersionEvidence = Schema.Schema.Type<typeof ServerVersionEvidenceSchema>
const ConfigReplySchema = Schema.Struct({ status: PositiveInteger, body: Schema.String })

export const readDeploymentVersion = Effect.fn("fixture.readDeploymentVersion")(function* (upstream: UrlString) {
  const reply = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(new URL("/config.json", upstream), { signal, redirect: "error" })
      return Schema.decodeUnknownSync(ConfigReplySchema)({ status: response.status, body: await response.text() })
    },
    catch: () =>
      new FixtureBoundaryError({
        stage: "config-read",
        reason: NonEmptyString.make("Ordinary deployment configuration response unavailable")
      })
  })
  if (reply.status < 200 || reply.status >= 300)
    return yield* new FixtureBoundaryError({
      stage: "config-read",
      httpStatus: reply.status,
      reason: NonEmptyString.make("Ordinary deployment configuration returned a non-success HTTP response")
    })
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DeploymentVersionSchema))(reply.body).pipe(
    Effect.mapError(
      () =>
        new FixtureBoundaryError({
          stage: "config-parse",
          reason: NonEmptyString.make("Ordinary deployment configuration omitted valid release/model evidence")
        })
    )
  )
})

export const makeServerVersionEvidence = Effect.fn("fixture.makeServerVersionEvidence")(function* (
  deployment: DeploymentVersion,
  workspaceVersion: WorkspaceVersion
): Effect.fn.Return<ServerVersionEvidence, FixtureBoundaryError> {
  if (deployment.MODEL_VERSION !== workspaceVersion)
    return yield* new FixtureBoundaryError({
      stage: "version-parse",
      reason: NonEmptyString.make("Deployment and public workspace reported model versions disagree")
    })
  return {
    deployment: {
      source: "/config.json",
      reportedRelease: deployment.VERSION,
      reportedModelVersion: deployment.MODEL_VERSION
    },
    workspace: { source: "huly workspace info get", reportedModelVersion: workspaceVersion },
    modelVersionsAgree: true,
    imageIdentity: "not-established-by-these-APIs"
  }
})
